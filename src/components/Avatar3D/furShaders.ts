// Physical Hair BSDF (Marschner / Kajiya-Kay Dual-Specular + TT Scatter + Volumetric Self-Shadowing)
// and Hybrid GPU Fur Shaders (64-Layer Volumetric Shells + 60,000 3D Tapered Instanced Strands)

const COMMON_HAIR_BSDF_GLSL = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uTipColor;
  uniform vec3 uBellyBaseColor;
  uniform vec3 uBellyTipColor;
  uniform float uBellyEnabled;
  uniform float uRoughness;
  uniform float uSpecular;
  uniform float uFurDensity;
  uniform vec3 uKeyLightDir;
  uniform vec3 uKeyLightColor;
  uniform float uKeyLightIntensity;
  uniform vec3 uRimLightDir;
  uniform vec3 uRimLightColor;
  uniform float uRimIntensity;
  uniform float uAmbientIntensity;
  uniform vec3 uEnvSkyColor;
  uniform vec3 uEnvGroundColor;
  uniform float uEnvTintStrength;
  uniform float uLegacyRawOutput;

  // Shift hair tangent along surface normal to model tilted cuticle scales (Marschner 2003)
  vec3 shiftTangent(vec3 T, vec3 N, float shift) {
    return normalize(T + N * shift);
  }

  // Anisotropic Kajiya-Kay / Marschner longitudinal specular lobe
  float hairSpecularLobe(vec3 T, vec3 N, vec3 V, vec3 L, float roughness) {
    vec3 H = normalize(L + V + vec3(1e-6, 1e-6, 1e-6));
    float dotTH = clamp(dot(T, H), -1.0, 1.0);
    float sinTH = sqrt(max(1e-5, 1.0 - dotTH * dotTH));
    float hemiVis = smoothstep(-0.25, 0.15, dot(N, L));
    // Map physical roughness [0.05..0.95] to longitudinal exponent [220..10]
    float exponent = mix(220.0, 10.0, clamp(roughness * roughness, 0.0, 1.0));
    // Energy-conserving normalization factor
    float normFactor = (exponent + 2.0) / 8.0;
    return hemiVis * pow(sinTH, exponent) * normFactor * 0.095;
  }

  // Evaluates the soft, feathered vertical-oval belly pigment blend in local follicle root space.
  // Locked to localRootPos so character rotation, breathing, and wind never cause edge shimmering.
  float evaluateBellyMask(vec3 localRootPos, float strandSeed) {
    if (uBellyEnabled < 0.5 || localRootPos.z <= 0.30) {
      return 0.0;
    }
    // Rounded vertical oval on the front mid-lower torso: center (0.0, -0.355), ry = 0.415, rx = 0.39
    float dy = (localRootPos.y - (-0.355)) / 0.415;
    float pearShape = 1.0 - 0.10 * clamp(dy, -1.0, 1.0);
    float dx = localRootPos.x / (0.39 * pearShape);
    float radialDist = sqrt(dx * dx + dy * dy);

    // Subtle per-strand follicle feathering at the transition rim so green & warm-white tufts interleave naturally
    float tuftJitter = (fract(strandSeed * 31.73) - 0.5) * 0.075;
    float featheredDist = radialDist + tuftJitter;

    // Wide, soft gradient from core (r < 0.62 = 1.0) to outer feathered rim (r > 1.08 = 0.0)
    float ovalMask = 1.0 - smoothstep(0.62, 1.08, featheredDist);
    // Smoothly fade on forward-facing Z (0.35..0.55) so Side view shows only a gentle edge transition and Back is 0.0
    float frontMask = smoothstep(0.35, 0.55, localRootPos.z);

    return ovalMask * frontMask;
  }

  // Evaluate complete Physical Hair Shading in Linear Working Space
  // Output is passed to Three.js standard #include <tonemapping_fragment> and #include <colorspace_fragment>
  vec3 evaluatePhysicalHairShading(
    vec3 localRootPos,
    vec3 worldPos,
    vec3 surfNormal,
    vec3 hairTangent,
    float h,
    float strandSeed,
    float combMemory
  ) {
    vec3 N = normalize(surfNormal);
    vec3 T = normalize(hairTangent);
    vec3 V = normalize(cameraPosition - worldPos);
    vec3 L = normalize(uKeyLightDir);
    vec3 Lrim = normalize(uRimLightDir);

    // Smoothly blend root and tip pigments between sage-green body fur and warm gray-white belly fur
    float bellyMask = evaluateBellyMask(localRootPos, strandSeed);
    vec3 activeBaseColor = mix(uBaseColor, uBellyBaseColor, bellyMask);
    vec3 activeTipColor = mix(uTipColor, uBellyTipColor, bellyMask);

    // 1. Root-to-Tip Melanin / Pigment Gradient with subtle per-strand micro-variation
    float rootTipMix = smoothstep(0.05, 0.92, pow(h, 0.82));
    vec3 strandTint = mix(vec3(0.94), vec3(1.06), fract(strandSeed * 13.37));
    vec3 albedo = mix(activeBaseColor, activeTipColor, rootTipMix) * strandTint;

    // 2. Beer-Lambert Volumetric Hair Self-Shadowing (optical depth through coat)
    float NdotL = dot(N, L);
    float opticalDepth = (1.0 - h) * (0.45 + 0.55 * uFurDensity) / max(0.22, NdotL * 0.5 + 0.55);
    float deepShadow = exp(-opticalDepth * 1.45);
    float wrapDiffuse = clamp((NdotL + 0.45) / 1.45, 0.0, 1.0);

    // 3. Primary Specular Lobe (R) & Secondary Specular Lobe (TRT)
    float sheenBoost = 1.0 + combMemory * 0.35;
    vec3 tPrimary = shiftTangent(T, N, -0.16 + (strandSeed - 0.5) * 0.05);
    float specR = hairSpecularLobe(tPrimary, N, V, L, uRoughness) * uSpecular * sheenBoost;
    vec3 colorR = specR * uKeyLightColor * mix(vec3(1.0), albedo, 0.15);

    vec3 tSecondary = shiftTangent(T, N, 0.24 + (strandSeed - 0.5) * 0.08);
    float glint = 0.75 + 0.5 * sin(strandSeed * 62.83);
    float specTRT = hairSpecularLobe(tSecondary, N, V, L, min(1.0, uRoughness * 1.35)) * uSpecular * 0.85 * glint;
    vec3 colorTRT = specTRT * mix(albedo, activeTipColor, 0.65) * uKeyLightColor * 1.65;

    // 4. Forward Subsurface Scattering / Transmission Lobe (TT)
    float forwardKey = pow(clamp(dot(V, -L + N * 0.35), 0.0, 1.0), 3.2);
    float forwardRim = pow(clamp(dot(V, -Lrim + N * 0.4), 0.0, 1.0), 2.4);
    float fresnelRim = pow(1.0 - max(0.0, dot(N, V)), 2.6);

    // Legacy "Before" mode (for diagnostic Before/After comparison only)
    if (uLegacyRawOutput > 0.5) {
      float legacyAO = mix(0.22, 1.0, pow(clamp(h, 0.0, 1.0), 0.72));
      vec3 legacyScatterTT = (
        forwardKey * uKeyLightColor * 0.38 +
        (forwardRim * 0.75 + fresnelRim * 0.65) * uRimLightColor * uRimIntensity
      ) * mix(activeBaseColor, activeTipColor, 0.75) * (0.35 + 0.65 * h);
      vec3 legacySky = mix(activeTipColor, vec3(0.88, 0.92, 1.0), 0.65);
      vec3 legacyGround = activeBaseColor * 0.38;
      vec3 legacyHemi = mix(
        mix(legacyGround, uEnvGroundColor, uEnvTintStrength),
        mix(legacySky, uEnvSkyColor, uEnvTintStrength),
        N.y * 0.5 + 0.5
      ) * uAmbientIntensity;
      vec3 legacyKeyTint = mix(vec3(1.0), uKeyLightColor, 0.58);
      vec3 legacyDiffuse = albedo * legacyKeyTint * uKeyLightIntensity * wrapDiffuse * deepShadow;
      vec3 legacySpec = (colorR + colorTRT) * uKeyLightIntensity * deepShadow * (0.25 + 0.75 * h);
      vec3 legacyAmbient = albedo * legacyHemi * legacyAO;
      return legacyDiffuse + legacySpec + legacyScatterTT + legacyAmbient;
    }

    // Formal Physical Plush Shading (Linear Working Space):
    // Light cream-white belly fibers have higher subsurface multiple scattering (softer root AO & shadow)
    float rootAOBase = mix(0.46, 0.68, bellyMask);
    float shadowFloor = mix(0.54, 0.68, bellyMask);
    float follicleAO = mix(rootAOBase, 1.0, pow(clamp(h, 0.0, 1.0), 0.65));
    float softShadow = mix(shadowFloor, 1.0, deepShadow);

    vec3 scatterTT = (
      forwardKey * uKeyLightColor * 0.18 +
      (forwardRim * 0.38 + fresnelRim * 0.30) * uRimLightColor * (uRimIntensity * 0.42)
    ) * mix(activeBaseColor, activeTipColor, 0.84) * (0.35 + 0.65 * h);

    vec3 baseSkyColor = mix(activeTipColor, vec3(0.92, 0.95, 0.94), 0.34);
    vec3 baseGroundColor = activeBaseColor * 0.60;
    vec3 skyColor = mix(baseSkyColor, uEnvSkyColor, uEnvTintStrength);
    vec3 groundColor = mix(baseGroundColor, uEnvGroundColor, uEnvTintStrength);
    vec3 hemiFill = mix(groundColor, skyColor, N.y * 0.5 + 0.5) * (uAmbientIntensity * 1.08);

    vec3 balancedKeyTint = mix(vec3(1.0), uKeyLightColor, 0.45);
    vec3 directDiffuse = albedo * balancedKeyTint * (uKeyLightIntensity * 0.56) * wrapDiffuse * softShadow;
    vec3 directSpec = (colorR * 0.22 + colorTRT * 0.36) * (uKeyLightIntensity * 0.68) * softShadow * (0.25 + 0.75 * h);
    vec3 ambientTerm = albedo * hemiFill * follicleAO;

    // Cool-neutral balance on sage-green coat; warm-neutral balance on the warm gray-white belly
    vec3 studioBalance = mix(vec3(0.95, 1.0, 1.04), vec3(1.01, 0.995, 0.965), bellyMask);
    vec3 linearOut = (directDiffuse + directSpec + scatterTT + ambientTerm) * studioBalance;
    return max(linearOut, vec3(0.0));
  }
`;

export const SHELL_VERTEX_SHADER = /* glsl */ `
  attribute float aFollicleMask;
  attribute vec3 aGroomTangent;
  attribute float aShellIndex;

  uniform sampler2D uPhysicsTex;
  uniform float uFurLength;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform float uGpuFurMode;
  uniform float uShellCountScale;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  vec2 normalToSphericalUV(vec3 n) {
    vec3 d = normalize(n);
    float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
    float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
    return vec2(u, v);
  }

  void main() {
    float h = clamp(aShellIndex * uShellCountScale, 0.0, 1.0);
    vLayerHeight = h;
    vFollicleMask = aFollicleMask;
    vLocalPos = position;

    vec3 localNormal = normalize(normal);
    vec3 groomDir = normalize(aGroomTangent);
    vec3 sideDir = normalize(cross(localNormal, groomDir) + vec3(1e-4, 0.0, 0.0));

    // Sample GPGPU ping-pong Verlet displacement texture (or analytical WebGL spring inertia when GPU Fur is off)
    vec3 gpuDisp = vec3(0.0);
    vCombMemory = 0.0;
    if (uGpuFurMode > 0.5) {
      vec2 simUV = normalToSphericalUV(localNormal);
      vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
      gpuDisp = gpgpuData.xyz;
      vCombMemory = gpgpuData.w;
    } else {
      vec3 tangInertia = uWebGLInertia - localNormal * min(0.0, dot(uWebGLInertia, localNormal));
      gpuDisp = tangInertia;
      if (uBoopShockwave > 0.01) {
        float waveFront = (1.0 - uBoopShockwave) * 2.2;
        float dFront = abs(distance(localNormal, vec3(0.0, 0.1, 0.98)) - waveFront);
        if (dFront < 0.38) {
          float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
          vec3 radial = normalize(localNormal - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
          gpuDisp += radial * ripple * 0.65;
        }
      }
      if (uPointerActive > 0.5) {
        float pDist = distance(position, uPointerLocalPos);
        if (pDist < 0.45) {
          vCombMemory = (1.0 - pDist / 0.45) * 0.65;
        }
      }
    }

    // Analytical high-frequency wind & pointer fallback blend
    float bendFactor = pow(h, 1.55);
    vec3 windWave = vec3(
      sin(position.y * 4.2 + uTime * 2.6) * 0.08,
      cos(position.x * 3.8 + uTime * 2.1) * 0.04,
      cos(position.z * 4.0 - uTime * 2.4) * 0.08
    ) * uWindStrength;

    // Interactive pointer parting in vertex space for crisp local response
    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(position, uPointerLocalPos);
      if (pDist < 0.55) {
        vec3 away = normalize(position - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= localNormal * dot(away, localNormal);
        pointerPush = away * pow(1.0 - pDist / 0.55, 1.8) * 0.35;
      }
    }

    float effectiveLen = uFurLength * aFollicleMask;

    // Spatially coherent smooth wave/curl field shared across adjacent locks
    float lockPhase = dot(position, vec3(5.4, 6.2, 5.0));
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float wavePhase = h * curlFreq + lockPhase;
    float smoothEnv = h * h * (3.0 - 2.0 * h);
    float waveAmp = uCurliness * effectiveLen * 0.28 * smoothEnv;
    vec3 waveOffset = (sideDir * sin(wavePhase) + groomDir * (cos(wavePhase) - 1.0) * 0.55) * waveAmp;
    vec3 waveTangent = (sideDir * cos(wavePhase) - groomDir * sin(wavePhase) * 0.55) * (waveAmp * curlFreq);

    vec3 totalOffset =
      localNormal * (h * effectiveLen) +
      groomDir * (bendFactor * effectiveLen * (0.28 + 0.18 * uClumping)) +
      waveOffset +
      (gpuDisp * 0.42 + windWave + pointerPush) * bendFactor * effectiveLen;

    vec3 displacedLocal = position + totalOffset;
    vec4 worldPosition = modelMatrix * vec4(displacedLocal, 1.0);
    vWorldPos = worldPosition.xyz;

    vSurfNormal = normalize(mat3(modelMatrix) * localNormal);
    // Instantaneous tangent along the curved & wavy hair trajectory (dPos/dh)
    vec3 localHairDir = normalize(
      localNormal * effectiveLen +
      groomDir * (1.55 * pow(max(0.05, h), 0.55) * effectiveLen * 0.35) +
      waveTangent +
      (gpuDisp * 0.42 + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
    );
    vHairTangent = normalize(mat3(modelMatrix) * localHairDir);

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const SHELL_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  uniform float uClumping;
  uniform float uCurliness;
  uniform float uGpuFurMode;

  varying float vLayerHeight;
  varying float vFollicleMask;
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  // Continuous 2D Octahedral Surface UV (eliminates 3D Z-plane contour rings and voxel slicing)
  vec2 octahedralUV(vec3 n) {
    vec3 d = n / (abs(n.x) + abs(n.y) + abs(n.z) + 1e-6);
    vec2 oct = d.y >= 0.0
      ? d.xz
      : (1.0 - abs(d.zx)) * vec2(d.x >= 0.0 ? 1.0 : -1.0, d.z >= 0.0 ? 1.0 : -1.0);
    return oct * 0.5 + 0.5;
  }

  vec3 hash23(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xxz + p3.yxx) * p3.zyx);
  }

  void main() {
    if (vFollicleMask < 0.04) {
      discard;
    }

    // 2D surface-locked follicle coordinates (no 3D Cartesian Z-slicing or contour bands)
    float gridScale = mix(52.0, 96.0, clamp(uFurDensity, 0.0, 1.0));
    vec2 baseUV = octahedralUV(normalize(vLocalPos));
    vec2 warpedUV = baseUV + 0.008 * sin(baseUV.yx * 28.0);
    vec2 sampleUV = warpedUV * gridScale;

    // Clumping: pull 2D surface coordinates toward macro-tuft centers as h -> 1
    vec2 clumpGrid = warpedUV * (gridScale * 0.24);
    vec2 clumpFract = fract(clumpGrid) - 0.5;
    sampleUV -= clumpFract * (vLayerHeight * uClumping * 1.65);

    vec2 cellId = floor(sampleUV);
    vec2 cellLocal = fract(sampleUV) - 0.5;
    vec3 rand = hash23(cellId);

    // Smooth per-fiber height taper instead of binary salt-and-pepper cell holes
    float densityFactor = clamp(uFurDensity * 1.08, 0.22, 1.0) * clamp(vFollicleMask * 1.15, 0.0, 1.0);
    float fiberMaxH = mix(0.32, 1.0, rand.z) * densityFactor;
    if (vLayerHeight > fiberMaxH) {
      discard;
    }

    // Gentle helical offset inside each 2D surface cell
    float curlFreq = mix(3.2, 7.8, uCurliness);
    float curlAngle = vLayerHeight * curlFreq + rand.x * 6.28318;
    float smoothEnv = vLayerHeight * vLayerHeight * (3.0 - 2.0 * vLayerHeight);
    float curlRadius = (0.03 * uClumping + 0.12 * uCurliness) * smoothEnv;
    vec2 strandCenter = (rand.xy - 0.5) * 0.22 + vec2(cos(curlAngle), sin(curlAngle)) * curlRadius;
    float distToAxis = length(cellLocal - strandCenter);

    // Conical hair profile tapering smoothly from plush solid undercoat to fine tip
    float normH = clamp(vLayerHeight / max(0.15, fiberMaxH), 0.0, 1.0);
    float maxRadius = 0.62 * (1.0 - pow(normH, 1.25));
    if (distToAxis > maxRadius) {
      discard;
    }

    vec3 color = evaluatePhysicalHairShading(
      vLocalPos,
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vLayerHeight,
      rand.x,
      vCombMemory
    );

    gl_FragColor = vec4(color, 1.0);
    if (uLegacyRawOutput < 0.5) {
#include <tonemapping_fragment>
#include <colorspace_fragment>
    }
  }
`;

export const STRAND_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aRootPos;
  attribute vec3 aRootNormal;
  attribute vec3 aGroomDir;
  attribute vec3 aClumpOffset;
  attribute float aStrandSeed;
  attribute float aMaskValue;

  uniform sampler2D uPhysicsTex;
  uniform float uFurLength;
  uniform float uFurDensity;
  uniform float uClumping;
  uniform float uCurliness;
  uniform float uTime;
  uniform float uWindStrength;
  uniform vec3 uPointerLocalPos;
  uniform float uPointerActive;
  uniform float uGpuFurMode;
  uniform vec3 uWebGLInertia;
  uniform float uBoopShockwave;

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vLocalRootPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  vec2 normalToSphericalUV(vec3 n) {
    vec3 d = normalize(n);
    float u = atan(d.x, d.z) / (2.0 * 3.14159265) + 0.5;
    float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
    return vec2(u, v);
  }

  void main() {
    float h = position.y; // [0..1] along the 20-segment smooth curve
    vHeight = h;
    vRibbonU = position.x; // [-1..1] across ribbon width
    vStrandSeed = aStrandSeed;
    vLocalRootPos = aRootPos;

    // Density culling in vertex shader (collapse inactive strands to zero area)
    if (aStrandSeed > uFurDensity || aMaskValue < 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 0.0);
      return;
    }

    vec3 N = normalize(aRootNormal);
    vec3 G = normalize(aGroomDir);
    vec3 sideVec = normalize(cross(N, G) + vec3(1e-4, 0.0, 0.0));

    // Sample GPGPU Verlet texture in GPU Fur mode, or analytical WebGL spring inertia in default WebGL mode
    vec3 gpuDisp = vec3(0.0);
    vCombMemory = 0.0;
    if (uGpuFurMode > 0.5) {
      vec2 simUV = normalToSphericalUV(N);
      vec4 gpgpuData = texture2D(uPhysicsTex, simUV);
      gpuDisp = gpgpuData.xyz;
      vCombMemory = gpgpuData.w;
    } else {
      gpuDisp = uWebGLInertia - N * min(0.0, dot(uWebGLInertia, N));
      if (uBoopShockwave > 0.01) {
        float waveFront = (1.0 - uBoopShockwave) * 2.2;
        float dFront = abs(distance(N, vec3(0.0, 0.1, 0.98)) - waveFront);
        if (dFront < 0.38) {
          float ripple = (1.0 - dFront / 0.38) * uBoopShockwave;
          vec3 radial = normalize(N - vec3(0.0, 0.1, 0.98) + vec3(0.0, 1e-4, 0.0));
          gpuDisp += radial * ripple * 0.65;
        }
      }
      if (uPointerActive > 0.5) {
        float pDist = distance(aRootPos, uPointerLocalPos);
        if (pDist < 0.45) {
          vCombMemory = (1.0 - pDist / 0.45) * 0.65;
        }
      }
    }

    float lenVariation = 0.82 + 0.36 * fract(aStrandSeed * 17.31);
    float totalLen = uFurLength * aMaskValue * lenVariation * 1.15;

    // Smooth cantilever bend along the hair shaft
    float bend = pow(h, 1.55);
    float smoothEnv = h * h * (3.0 - 2.0 * h);

    vec3 windWave = vec3(
      sin(aRootPos.y * 4.4 + uTime * 2.7 + aStrandSeed * 3.14) * 0.08,
      cos(aRootPos.x * 3.9 + uTime * 2.2) * 0.04,
      cos(aRootPos.z * 4.1 - uTime * 2.5 + aStrandSeed * 3.14) * 0.08
    ) * uWindStrength;

    vec3 pointerPush = vec3(0.0);
    if (uPointerActive > 0.5) {
      float pDist = distance(aRootPos, uPointerLocalPos);
      if (pDist < 0.58) {
        vec3 away = normalize(aRootPos - uPointerLocalPos + vec3(0.0, 1e-4, 0.0));
        away -= N * dot(away, N);
        pointerPush = away * pow(1.0 - pDist / 0.58, 1.8) * 0.42;
      }
    }

    // Spatially coherent lock phase so neighboring strands wave & curl together smoothly
    vec3 tuftAnchor = aRootPos + aClumpOffset;
    float coherentPhase = dot(tuftAnchor, vec3(5.4, 6.2, 5.0)) + (fract(aStrandSeed * 43.17) - 0.5) * 0.65;
    float curlFreq = mix(3.2, 8.2, uCurliness);
    float spiralAngle = h * curlFreq + coherentPhase;

    // Zero offset at root (h=0) via smoothEnv, building into soft S-waves & ringlets
    float curlAmp = uCurliness * totalLen * 0.34 * smoothEnv;
    vec3 curlOffset =
      sideVec * (sin(spiralAngle) - sin(coherentPhase)) * curlAmp +
      G * (cos(spiralAngle) - cos(coherentPhase)) * (curlAmp * 0.65);

    // Exact analytical derivative d(curlOffset)/dh for smooth tangent & specular continuity
    vec3 curlTangent =
      (sideVec * cos(spiralAngle) - G * sin(spiralAngle) * 0.65) * (curlAmp * curlFreq);

    vec3 clumpPull = aClumpOffset * (smoothEnv * uClumping * totalLen * 0.68);

    vec3 spineLocal =
      aRootPos +
      N * (h * totalLen) +
      G * (bend * totalLen * 0.34) +
      clumpPull +
      curlOffset +
      (gpuDisp * 0.48 + windWave + pointerPush) * bend * totalLen;

    vec3 localTangent = normalize(
      N * totalLen +
      G * (1.55 * pow(max(0.05, h), 0.55) * totalLen * 0.34) +
      clumpPull * 1.15 +
      curlTangent +
      (gpuDisp * 0.48 + windWave + pointerPush) * 1.55 * pow(max(0.05, h), 0.55)
    );

    vec3 worldSpine = (modelMatrix * vec4(spineLocal, 1.0)).xyz;
    vec3 worldTangent = normalize(mat3(modelMatrix) * localTangent);
    vSurfNormal = normalize(mat3(modelMatrix) * N);
    vHairTangent = worldTangent;

    // Camera-facing cylindrical ribbon billboarding (eliminates twisted/flat polygon kinks!)
    vec3 viewDir = normalize(cameraPosition - worldSpine);
    vec3 billboardRight = normalize(cross(worldTangent, viewDir) + vec3(1e-5, 0.0, 0.0));

    // Taper strand ribbon width smoothly from root to fine tip (scaled by modelMatrix scale)
    // In WebGL mode (fewer instances), slightly wider plush ribbons ensure 100% seamless coat coverage
    float modelScale = length(modelMatrix[0].xyz);
    float modeWidthBoost = mix(1.38, 1.0, uGpuFurMode);
    float baseWidth = 0.0145 * modeWidthBoost * (0.82 + 0.38 * (1.0 - uFurDensity)) * modelScale;
    float width = baseWidth * (1.0 - pow(h, 1.35));

    vec3 finalWorld = worldSpine + billboardRight * (position.x * width);
    vWorldPos = finalWorld;

    gl_Position = projectionMatrix * viewMatrix * vec4(finalWorld, 1.0);
  }
`;

export const STRAND_FRAGMENT_SHADER = /* glsl */ `
  ${COMMON_HAIR_BSDF_GLSL}

  varying float vHeight;
  varying float vRibbonU;
  varying float vStrandSeed;
  varying vec3 vLocalRootPos;
  varying vec3 vWorldPos;
  varying vec3 vSurfNormal;
  varying vec3 vHairTangent;
  varying float vCombMemory;

  void main() {
    vec3 color = evaluatePhysicalHairShading(
      vLocalRootPos,
      vWorldPos,
      vSurfNormal,
      vHairTangent,
      vHeight,
      vStrandSeed,
      vCombMemory
    );

    // Cylindrical cross-strand shading across the geometrically tapered 3D ribbon
    // Rely on geometric ribbon tapering + hardware MSAA instead of unsorted alpha-depth blending
    // so front strands never punch dark background-blended Z-buffer holes into behind strands!
    float radialDist = abs(vRibbonU);
    float cylinderRoundness = sqrt(max(0.18, 1.0 - radialDist * radialDist * 0.82));
    color *= (0.82 + 0.24 * cylinderRoundness);

    gl_FragColor = vec4(color, 1.0);
    if (uLegacyRawOutput < 0.5) {
#include <tonemapping_fragment>
#include <colorspace_fragment>
    }
  }
`;
