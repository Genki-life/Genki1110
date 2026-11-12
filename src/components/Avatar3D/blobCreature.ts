import * as THREE from 'three';

/**
 * Evaluates the anatomical follicle growth mask at a local position on the blob surface.
 * Returns a float in [0.0, 1.0]:
 * - 0.0 inside eye sockets and mouth recess (prevents hair from poking through eyes/mouth)
 * - Smoothly tapers (0.2 -> 1.0) around the eye rims, nose bridge, and paw pads
 * - Slightly longer/fluffier (1.15) on the cheek tufts, chest fluff, and ear tips
 */
export function evaluateFollicleMask(x: number, y: number, z: number): number {
  // Left and right small round eye centers in local space (aligned to flush vertical oval face)
  const lx = x + 0.23;
  const rx = x - 0.23;
  const ey = y - 0.23;
  const ez = z - 0.646;

  const distLeftEye = Math.hypot(lx, ey, ez);
  const distRightEye = Math.hypot(rx, ey, ez);
  const minEyeDist = Math.min(distLeftEye, distRightEye);

  // Tightly match the small round cornea radius (r < 0.092 = 0) so no fur pokes through or hides the eye in Side view,
  // then transition smoothly across a compact rim (0.092 -> 0.165) so there are no bald gaps around the eyes
  if (minEyeDist < 0.092) {
    return 0.0;
  }
  const eyeMask = 0.25 + 0.75 * smoothstep(0.092, 0.165, minEyeDist);

  // Bottom belly contact pad taper so the base sits flat and level
  const bottomMask = smoothstep(-0.97, -0.66, y);

  // Extra fluff boost on cheeks
  const cheekDist = Math.min(
    Math.hypot(x + 0.42, y - 0.08, z - 0.54),
    Math.hypot(x - 0.42, y - 0.08, z - 0.54)
  );
  const cheekFluff = 1.0 + 0.10 * (1.0 - smoothstep(0.0, 0.36, cheekDist));

  // Keep fur slightly shorter on ear and arm extremities so contours remain recognizable
  const leftEarDist = Math.hypot(x + 0.34, y - 1.12, z - 0.05);
  const rightEarDist = Math.hypot(x - 0.72, y - 0.68, z - 0.08);
  const armDist = Math.min(
    Math.hypot(x + 0.74, y + 0.28, z - 0.08),
    Math.hypot(x - 0.74, y + 0.28, z - 0.08)
  );
  const extremityTaper =
    (0.68 + 0.32 * smoothstep(0.0, 0.45, leftEarDist)) *
    (0.68 + 0.32 * smoothstep(0.0, 0.48, rightEarDist)) *
    (0.72 + 0.28 * smoothstep(0.0, 0.38, armDist));

  return Math.max(0.0, Math.min(1.20, eyeMask * bottomMask * cheekFluff * extremityTaper));
}

/**
 * Computes the biological grooming flow tangent vector on the creature surface.
 * Hairs part naturally from the crown, sweep around the eye sockets, and flow
 * smoothly along the ears, arms, and plump torso.
 */
export function evaluateGroomFlow(
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): [number, number, number] {
  // Base gravity/growth direction flowing smoothly from crown to base
  let fx = x * 0.22;
  let fy = -0.85;
  let fz = (z - 0.12) * 0.22;

  // Smooth C1-continuous blend on the upright left ear (no hard step seam)
  const wLeftEar =
    (1.0 - smoothstep(-0.40, -0.10, x)) *
    smoothstep(0.72, 0.96, y);
  if (wLeftEar > 0.0) {
    fx = fx * (1.0 - wLeftEar) + (-0.18) * wLeftEar;
    fy = fy * (1.0 - wLeftEar) + (-0.55) * wLeftEar;
    fz = fz * (1.0 - wLeftEar) + 0.06 * wLeftEar;
  }

  // Smooth C1-continuous blend along the single-piece outward-folded drooping right ear
  const wRightEar =
    smoothstep(0.28, 0.52, x) *
    smoothstep(0.38, 0.64, y);
  if (wRightEar > 0.0) {
    const tDroop = smoothstep(0.34, 0.82, x);
    const rx = 0.48 * (1.0 - 0.38 * tDroop);
    const ry = -0.78;
    fx = fx * (1.0 - wRightEar) + rx * wRightEar;
    fy = fy * (1.0 - wRightEar) + ry * wRightEar;
    fz = fz * (1.0 - wRightEar) + 0.06 * wRightEar;
  }

  // Sweep tangentially around the left and right small round eyes
  const eyeCenters: [number, number, number][] = [
    [-0.23, 0.23, 0.646],
    [0.23, 0.23, 0.646]
  ];

  for (let i = 0; i < 2; i++) {
    const [ex, ey, ez] = eyeCenters[i];
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
    if (d < 0.24) {
      const influence = (1.0 - d / 0.24) * 0.70;
      fx += (dx / d) * influence;
      fy += (dy / d) * influence * 0.6;
      fz += (dz / d) * influence * 0.3;
    }
  }

  // Project onto the tangent plane orthogonal to surface normal N
  const dotFN = fx * nx + fy * ny + fz * nz;
  let tx = fx - dotFN * nx;
  let ty = fy - dotFN * ny;
  let tz = fz - dotFN * nz;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 1e-5) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    tx = 1.0;
    ty = 0.0;
    tz = 0.0;
  }

  return [tx, ty, tz];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * 1. Main Body Part: Restrained, slightly taller plump vertical oval plush doll shape
 * with a rounded top dome, softly fuller lower belly, and a rounded, stable flat-resting base.
 */
function sculptMainBodyVertex(u: number, v: number, w: number): [number, number, number] {
  const headBroadness = 0.052 * Math.exp(-Math.pow((v - 0.48) / 0.46, 2.0));
  const bellyFullness = 0.112 * Math.exp(-Math.pow((v + 0.26) / 0.50, 2.0));
  const bottomRoundness = 0.072 * Math.exp(-Math.pow((v + 0.74) / 0.34, 2.0));

  const rx = 0.592 + headBroadness + bellyFullness + bottomRoundness;
  const cheekPuff = 1.0 + 0.022 * Math.exp(-Math.pow((v - 0.05) / 0.38, 2.0)) * Math.max(0.0, w);
  const x = u * rx * cheekPuff;

  const frontBelly = w > 0 ? 0.052 * Math.exp(-Math.pow((v + 0.24) / 0.50, 2.0)) * w : 0.0;
  const backCurve = w < 0 ? 0.036 * Math.exp(-Math.pow((v + 0.20) / 0.54, 2.0)) * (-w) : 0.0;
  const rz =
    0.585 +
    headBroadness * 0.85 +
    bellyFullness * 0.82 +
    bottomRoundness * 0.85 +
    frontBelly +
    backCurve;
  let z = w * rz;

  // C2-continuous vertical mapping: slightly taller rounded crown (+1.01) and rounded, steady flat-ish base (-0.91)
  const topSoft = Math.pow(Math.max(0.0, (v - 0.35) / 0.65), 2.2) * 0.07;
  const botFlat = Math.pow(Math.max(0.0, (-v - 0.28) / 0.72), 2.2) * 0.17;
  const y = v * 1.08 - topSoft + botFlat;

  // Compact anatomical eye socket recess sized to the small round eyes so side view stays flush
  const lx = x + 0.23;
  const rxEye = x - 0.23;
  const ey = y - 0.23;
  const ez = z - 0.646;
  const dEye = Math.min(
    Math.hypot(lx, ey, ez),
    Math.hypot(rxEye, ey, ez)
  );
  if (dEye < 0.135) {
    const indent = (1.0 - smoothstep(0.0, 0.135, dEye)) * 0.026;
    z -= indent;
  }

  return [x, y, z];
}

/**
 * 2A. Front-Left Ear Part (x < 0): Plump, blunt-rounded upright plush bunny ear
 * with a gentle front inner-ear hollow (ear cup) and right-handed outward normals.
 */
function sculptLeftUprightEarVertex(u: number, v: number, w: number): [number, number, number] {
  const s = (v + 1.0) * 0.5; // [0..1] from ear root (v=-1) to rounded tip (v=+1)
  const tipPlump = 0.86 + 0.32 * Math.sin(s * Math.PI * 0.76) + 0.18 * Math.pow(s, 1.45);
  const halfWidth = 0.200 * tipPlump;
  const halfThick = 0.110 * tipPlump;

  // Subtle concave inner-ear hollow on the front face (w > 0)
  const scoopEnv = Math.sin(Math.max(0.0, Math.min(1.0, (s - 0.15) / 0.74)) * Math.PI);
  const scoop = w > 0.0 ? 0.034 * scoopEnv * Math.max(0.0, 1.0 - u * u * 1.25) * w : 0.0;

  const lx = u * halfWidth;
  const ly = v * 0.37;
  const lz = w * halfThick - scoop;

  // For upright left ear (v=+1 is tip), positive roll (+0.15 rad ~ 8.6 deg) tilts tip slightly left
  const roll = 0.15;
  const yaw = -0.14;
  const pitch = 0.05;

  const x1 = lx * Math.cos(roll) - ly * Math.sin(roll);
  const y1 = lx * Math.sin(roll) + ly * Math.cos(roll);
  const z1 = lz;

  const x2 = x1;
  const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);

  const x3 = x2 * Math.cos(yaw) + z2 * Math.sin(yaw);
  const y3 = y2;
  const z3 = -x2 * Math.sin(yaw) + z2 * Math.cos(yaw);

  // Anchor at upper-left head crown
  return [-0.27 + x3, 1.03 + y3, 0.02 + z3];
}

/**
 * 2B. Front-Right Folded Ear Part (x > 0): Single continuous arched-and-folded plush lop ear!
 * Rises smoothly from the upper-right head crown (s=0), arches outward over a soft fold crest (s~0.35),
 * and bends downward to a plump, rounded ear flap (s=1), eliminating any two-sphere pinch/double-ball look
 * while keeping a clear, recognizable lop-ear contour separation from the side of the head.
 */
function sculptRightLopEarVertex(u: number, v: number, w: number): [number, number, number] {
  // v = +1 (s = 0) is the ear root anchored inside the upper-right head crown;
  // v = -1 (s = 1) is the blunt-rounded drooping ear tip.
  const s = (1.0 - v) * 0.5;

  // Smooth continuous centerline spine from head crown (0.23, 0.88) -> fold crest (0.49, 0.96) -> drooping tip (0.81, 0.50)
  const spineX = 0.23 + 0.66 * s - 0.08 * s * s;
  const spineY = 0.88 + 0.14 * Math.sin(s * Math.PI * 0.84) - 0.44 * Math.pow(s, 1.85);
  const spineZ = 0.03 + 0.04 * s;

  // Plump cross-section envelope: seamless at root, softly wider paddle along the hanging ear flap
  const widthEnv = 0.90 + 0.28 * Math.sin(s * Math.PI * 0.82) + 0.22 * Math.pow(s, 1.30);
  // Gently tuck the inner/under-fold side (u < 0) on the lower lobe so a clean notch separates ear flap from head temple
  const underFoldTuck = u < 0.0 ? (1.0 - 0.28 * smoothstep(0.30, 0.85, s)) : 1.0;

  const halfThick = 0.130 * widthEnv * underFoldTuck;
  const halfWidth = 0.190 * widthEnv;

  const localU = u * halfThick;
  const localW = w * halfWidth;

  // Yaw around Y so the broad ear paddle faces slightly forward in both Front and Side views
  const yaw = 0.22;
  const uYaw = localU * Math.cos(yaw) + localW * Math.sin(yaw);
  const wYaw = -localU * Math.sin(yaw) + localW * Math.cos(yaw);

  // Smoothly varying cross-section normal angle (det > 0 everywhere, zero self-intersection)
  const theta = 0.42 + 0.36 * s;
  const x = spineX + uYaw * Math.cos(theta);
  const y = spineY + uYaw * Math.sin(theta);
  const z = spineZ + wYaw;

  return [x, y, z];
}

/**
 * 3. Left & Right Side Arm Parts: Short, plump, rounded capsule arms attached at the
 * mid-lower torso and hanging gently downward along the body sides (right-handed det = +1).
 */
function sculptSideArmVertex(u: number, v: number, w: number, side: -1 | 1): [number, number, number] {
  // v in [-1, 1]: v = +1 is top shoulder tucked in body, v = -1 is bottom rounded paw tip
  const s = (1.0 - v) * 0.5; // [0..1] from shoulder (0) down to paw tip (1)
  const pawPlump = 0.88 + 0.30 * Math.sin(s * Math.PI * 0.78) + 0.18 * Math.pow(s, 1.45);

  // Right-handed local ellipsoid (det = +1 for both side = -1 and side = +1)
  const lx = u * 0.122 * pawPlump;
  const ly = v * 0.27;
  const lz = w * 0.148 * pawPlump;

  // Positive +side * 0.44 rad (~25.2 deg) tucks top shoulder (v=+1) into mid-torso
  // and angles bottom rounded paw tip (v=-1) downward and outward
  const roll = side * 0.44;
  const pitch = -0.06;

  const x1 = lx * Math.cos(roll) - ly * Math.sin(roll);
  const y1 = lx * Math.sin(roll) + ly * Math.cos(roll);
  const z1 = lz;

  const x2 = x1;
  const y2 = y1 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + z1 * Math.cos(pitch);

  return [side * 0.74 + x2, -0.23 + y2, 0.05 + z2];
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.sqrt(x * x + y * y + z * z) || 1.0;
  return [x / l, y / l, z / l];
}

function buildSculptedPartGeometry(
  widthSegments: number,
  heightSegments: number,
  sculptFn: (u: number, v: number, w: number) => [number, number, number]
): THREE.SphereGeometry {
  const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments);
  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const w = posAttr.getZ(i);
    const [sx, sy, sz] = sculptFn(u, v, w);
    posAttr.setXYZ(i, sx, sy, sz);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds the complete multi-part organic plush geometry (Body + Upright Left Ear +
 * Single-Piece Arched-and-Folded Right Ear + 2 Downward-Tucked Short Rounded Side Arms)
 * merged into a single indexed BufferGeometry with baked vertex attributes:
 * - `aFollicleMask`: float [0..1.20] controlling fur length & density mask
 * - `aGroomTangent`: vec3 biological fur flow direction
 */
export function createOrganicBlobGeometry(widthSegments = 56, heightSegments = 44): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    buildSculptedPartGeometry(widthSegments, heightSegments, sculptMainBodyVertex),
    buildSculptedPartGeometry(28, 22, sculptLeftUprightEarVertex),
    buildSculptedPartGeometry(36, 28, sculptRightLopEarVertex),
    buildSculptedPartGeometry(22, 18, (u, v, w) => sculptSideArmVertex(u, v, w, -1)),
    buildSculptedPartGeometry(22, 18, (u, v, w) => sculptSideArmVertex(u, v, w, 1))
  ];

  let totalVertices = 0;
  let totalIndices = 0;
  for (const part of parts) {
    totalVertices += part.attributes.position.count;
    totalIndices += part.index ? part.index.count : 0;
  }

  const mergedPositions = new Float32Array(totalVertices * 3);
  const mergedNormals = new Float32Array(totalVertices * 3);
  const mergedUVs = new Float32Array(totalVertices * 2);
  const mergedIndices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const part of parts) {
    const pos = part.attributes.position;
    const norm = part.attributes.normal;
    const uv = part.attributes.uv;
    const vCount = pos.count;

    mergedPositions.set(pos.array as Float32Array, vertexOffset * 3);
    mergedNormals.set(norm.array as Float32Array, vertexOffset * 3);
    if (uv) {
      mergedUVs.set(uv.array as Float32Array, vertexOffset * 2);
    }

    if (part.index) {
      const idxArray = part.index.array;
      for (let i = 0; i < idxArray.length; i++) {
        mergedIndices[indexOffset + i] = idxArray[i] + vertexOffset;
      }
      indexOffset += idxArray.length;
    }

    vertexOffset += vCount;
    part.dispose();
  }

  const mergedGeom = new THREE.BufferGeometry();
  mergedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  mergedGeom.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  mergedGeom.setAttribute('uv', new THREE.BufferAttribute(mergedUVs, 2));
  mergedGeom.setIndex(new THREE.BufferAttribute(mergedIndices, 1));

  const follicleMaskArray = new Float32Array(totalVertices);
  const groomTangentArray = new Float32Array(totalVertices * 3);

  for (let i = 0; i < totalVertices; i++) {
    const i3 = i * 3;
    const x = mergedPositions[i3];
    const y = mergedPositions[i3 + 1];
    const z = mergedPositions[i3 + 2];
    const nx = mergedNormals[i3];
    const ny = mergedNormals[i3 + 1];
    const nz = mergedNormals[i3 + 2];

    follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
    const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
    groomTangentArray[i3] = tx;
    groomTangentArray[i3 + 1] = ty;
    groomTangentArray[i3 + 2] = tz;
  }

  mergedGeom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
  mergedGeom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));

  return mergedGeom;
}

export interface AnimState {
  time: number;
  baseScale: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  blinkTimer: number;
  nextBlink: number;
  boopImpulse: number;
  boopPhase: number;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  targetLook: THREE.Vector2;
  currentLook: THREE.Vector2;
}

export interface BlobCreature {
  root: THREE.Group;
  bodyMesh: THREE.Mesh;
  bodyGeometry: THREE.BufferGeometry;
  skinMaterial: THREE.MeshStandardMaterial;
  animState: AnimState;
  setEnvironmentScale: (scale: number, offsetX?: number, offsetZ?: number) => void;
  triggerBoop: () => void;
  placeAt: (targetWorldPos: THREE.Vector3, normal?: THREE.Vector3, animate?: boolean, cameraPos?: THREE.Vector3 | null) => void;
  resetPlacement: (animate?: boolean) => void;
  isPlaced: () => boolean;
  getAnchorPosition: () => THREE.Vector3;
  update: (dt: number, pointerNDC?: THREE.Vector2 | null, cameraPos?: THREE.Vector3 | null, isARMode?: boolean, isListening?: boolean) => void;
  dispose: () => void;
}

interface EyeItem {
  pivot: THREE.Group;
  basePos: THREE.Vector3;
  catchlightMain: THREE.Mesh;
  catchlightSub: THREE.Mesh;
  side: number;
}

/**
 * Creates the complete Stylized Blob Creature group ("Mochi-Puff"):
 * - Base velvety under-skin mesh
 * - Multi-layered glossy 3D eyes with iris, pupil tracking, and dual catchlights
 * - Rosy translucent cheek blush patches
 * - Cute sculpted cat-like smile/mouth & nose bean
 * - Interactive boop/jump & breathing physics state
 */
export function createBlobCreature(): BlobCreature {
  const root = new THREE.Group();
  root.name = 'MochiPuffCreature';

  const bodyGeometry = createOrganicBlobGeometry(56, 44);

  // Under-skin velvety material (visible at roots and around eyes)
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6b7260'),
    roughness: 0.78,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: 2.0,
    polygonOffsetUnits: 2.0
  });

  const bodyMesh = new THREE.Mesh(bodyGeometry, skinMaterial);
  bodyMesh.name = 'BlobBodyMesh';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  // Facial features container so eyes move with head tilt
  const faceGroup = new THREE.Group();
  faceGroup.name = 'FacialFeatures';
  root.add(faceGroup);

  // Deep-brown near-black glossy plush bead eye material matching reference turnaround
  const eyeMaterial = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1d130e'),
    emissive: new THREE.Color('#120b07'),
    emissiveIntensity: 0.35,
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    reflectivity: 0.9
  });

  // Subtle warm dark espresso-brown lower depth
  const irisMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2c1d16')
  });

  // Soft small catchlight materials
  const highlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#fffaf5'),
    transparent: true,
    opacity: 0.88
  });

  const warmHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f5ebe1'),
    transparent: true,
    opacity: 0.42
  });

  const eyes: EyeItem[] = [];
  const eyeSides = [-1, 1];

  for (const side of eyeSides) {
    const eyePivot = new THREE.Group();
    // Recessed into the eye socket at z=0.654 so side profile sits flush with the short fur contour
    eyePivot.position.set(side * 0.23, 0.23, 0.654);
    eyePivot.rotation.y = side * 0.22;
    eyePivot.rotation.x = -0.04;

    // Small round deep-brown near-black eye flattened along Z (0.52) to sit flush in Side view
    const eyeballGeo = new THREE.SphereGeometry(0.088, 28, 22);
    eyeballGeo.scale(1.0, 1.0, 0.52);
    const eyeball = new THREE.Mesh(eyeballGeo, eyeMaterial);
    eyePivot.add(eyeball);

    // Subtle warm espresso inner depth disc
    const irisGeo = new THREE.SphereGeometry(0.062, 20, 14);
    irisGeo.scale(0.95, 0.95, 0.28);
    const iris = new THREE.Mesh(irisGeo, irisMaterial);
    iris.position.set(0, -0.006, 0.036);
    eyePivot.add(iris);

    // Soft small primary catchlight (upper-left / top-inner)
    const catchlightMainGeo = new THREE.SphereGeometry(0.019, 14, 10);
    catchlightMainGeo.scale(1.0, 1.0, 0.28);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, highlightMat);
    catchlightMain.position.set(-side * 0.022, 0.024, 0.047);
    eyePivot.add(catchlightMain);

    // Tiny soft secondary catchlight
    const catchlightSubGeo = new THREE.SphereGeometry(0.009, 12, 8);
    catchlightSubGeo.scale(1.0, 1.0, 0.25);
    const catchlightSub = new THREE.Mesh(catchlightSubGeo, warmHighlightMat);
    catchlightSub.position.set(side * 0.020, -0.022, 0.046);
    eyePivot.add(catchlightSub);

    faceGroup.add(eyePivot);

    eyes.push({
      pivot: eyePivot,
      basePos: eyePivot.position.clone(),
      catchlightMain,
      catchlightSub,
      side
    });
  }

  // Animation & physics state for creature motion (coupled to GPGPU fur inertia)
  const animState: AnimState = {
    time: 0,
    baseScale: 1.0,
    baseX: 0.0,
    baseY: 0.0,
    baseZ: 0.0,
    blinkTimer: 0,
    nextBlink: 2.8,
    boopImpulse: 0,
    boopPhase: 0,
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    targetLook: new THREE.Vector2(0, 0),
    currentLook: new THREE.Vector2(0, 0)
  };

  // Spatial anchor position & viewer-facing orientation for AR plane placement
  const anchorPos = new THREE.Vector3(0, 0, 0);
  const targetAnchorPos = new THREE.Vector3(0, 0, 0);
  const startAnchorPos = new THREE.Vector3(0, 0, 0);
  let isPlaced = false;
  let isPlacing = false;
  let placeProgress = 1.0;
  let placeHopHeight = 0.0;
  let facingYaw = 0.0;
  let facingPitch = 0.0;
  let targetFacingYaw = 0.0;
  let targetFacingPitch = 0.0;
  let faceViewerHoldTimer = 0.0;

  function placeAt(
    targetWorldPos: THREE.Vector3,
    _normal?: THREE.Vector3,
    animate = true,
    cameraPos: THREE.Vector3 | null = null
  ) {
    if (!targetWorldPos) return;
    isPlaced = true;
    const s = animState.baseScale;
    const targetCenterY = targetWorldPos.y + 0.94 * s;

    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    faceViewerHoldTimer = 1.4;

    if (cameraPos) {
      const dx = cameraPos.x - targetWorldPos.x;
      const dy = cameraPos.y - targetCenterY;
      const dz = cameraPos.z - targetWorldPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
      if (!animate) {
        facingYaw = targetFacingYaw;
        facingPitch = targetFacingPitch;
      }
    }

    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.65, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      targetAnchorPos.copy(anchorPos);
      isPlacing = false;
      placeProgress = 1.0;
    }
  }

  function resetPlacement(animate = true) {
    isPlaced = false;
    targetFacingYaw = 0.0;
    targetFacingPitch = 0.0;
    faceViewerHoldTimer = 0.0;
    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    const s = animState.baseScale;
    const ox = animState.baseX || 0.0;
    const oz = animState.baseZ || 0.0;
    const targetY = -0.94 + 0.94 * s;

    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(ox, targetY, oz);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.55, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(ox, targetY, oz);
      targetAnchorPos.set(ox, targetY, oz);
      startAnchorPos.set(ox, targetY, oz);
      facingYaw = 0.0;
      facingPitch = 0.0;
      isPlacing = false;
      placeProgress = 1.0;
      animState.boopImpulse = 0.0;
      animState.boopPhase = 0.0;
    }
  }

  function setEnvironmentScale(scale: number, offsetX = 0.0, offsetZ = 0.0) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1.0;
    const ox = Number.isFinite(offsetX) ? offsetX : 0.0;
    const oz = Number.isFinite(offsetZ) ? offsetZ : 0.0;
    animState.baseScale = s;
    animState.baseX = ox;
    animState.baseY = -0.94 * (1.0 - s);
    animState.baseZ = oz;
    if (!isPlaced) {
      anchorPos.set(ox, -0.94 + 0.94 * s, oz);
      targetAnchorPos.copy(anchorPos);
      startAnchorPos.copy(anchorPos);
      facingYaw = 0.0;
      facingPitch = 0.0;
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }
  }

  function triggerBoop() {
    animState.boopImpulse = 1.0;
    animState.boopPhase = 0.0;
  }

  let listeningWeight = 0.0;

  function update(
    dt: number,
    pointerNDC: THREE.Vector2 | null = null,
    cameraPos: THREE.Vector3 | null = null,
    isARMode = false,
    isListening = false
  ) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    animState.time += safeDt;

    // Smooth listening posture interpolation (gentle and natural)
    const targetListening = isListening ? 1.0 : 0.0;
    listeningWeight += (targetListening - listeningWeight) * Math.min(1.0, safeDt * 3.4);

    if (faceViewerHoldTimer > 0) {
      faceViewerHoldTimer = Math.max(0, faceViewerHoldTimer - safeDt);
    }

    // Smooth eye/head tracking toward pointer, with gentle inquisitive upward glance during listening
    const listeningLookY = 0.14 * listeningWeight;
    const listeningLookX = 0.08 * listeningWeight;
    if (pointerNDC && faceViewerHoldTimer <= 0) {
      animState.targetLook.set(
        pointerNDC.x * 0.35 + listeningLookX,
        pointerNDC.y * 0.25 + listeningLookY
      );
    } else if (faceViewerHoldTimer > 0) {
      animState.targetLook.set(0, 0);
    } else {
      animState.targetLook.set(listeningLookX, listeningLookY);
    }
    animState.currentLook.lerp(animState.targetLook, Math.min(1.0, safeDt * 7.5));

    // Breathing & happy idle bobbing + boop jump impulse
    if (animState.boopImpulse > 0.001) {
      animState.boopPhase += safeDt * 14.0;
      animState.boopImpulse *= Math.exp(-safeDt * 3.6);
    } else {
      animState.boopImpulse = 0.0;
    }

    // Parabolic placement leap towards target anchor plane
    let hop = 0.0;
    if (isPlacing) {
      placeProgress += safeDt * 3.4;
      if (placeProgress >= 1.0) {
        placeProgress = 1.0;
        isPlacing = false;
        anchorPos.copy(targetAnchorPos);
        triggerBoop();
      } else {
        const p = placeProgress;
        anchorPos.lerpVectors(startAnchorPos, targetAnchorPos, p);
        hop = Math.sin(p * Math.PI) * placeHopHeight;
      }
    }

    if ((isPlaced || isARMode) && cameraPos) {
      const dx = cameraPos.x - anchorPos.x;
      const dy = cameraPos.y - anchorPos.y;
      const dz = cameraPos.z - anchorPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
    } else if (!isPlaced) {
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }

    const yawDiff = Math.atan2(Math.sin(targetFacingYaw - facingYaw), Math.cos(targetFacingYaw - facingYaw));
    facingYaw += yawDiff * Math.min(1.0, safeDt * 12.0);
    facingPitch += (targetFacingPitch - facingPitch) * Math.min(1.0, safeDt * 12.0);

    const s = animState.baseScale;
    const breath = Math.sin(animState.time * 2.3) * 0.035;
    const bodyLookScale = (isPlaced || isARMode) ? (faceViewerHoldTimer > 0 ? 0.0 : 0.06) : 1.0;
    const swayX = (Math.sin(animState.time * 1.35) * 0.06 + animState.currentLook.x * 0.15 * bodyLookScale) * s;
    const jumpY =
      (Math.sin(animState.time * 2.3) * 0.045 +
        Math.abs(Math.sin(animState.boopPhase)) * animState.boopImpulse * 0.32) *
      s;
    const squash =
      1.0 +
      breath +
      Math.cos(animState.boopPhase * 2.0) * animState.boopImpulse * 0.14;

    const prevX = root.position.x;
    const prevY = root.position.y;
    const prevZ = root.position.z;
    const prevRotZ = root.rotation.z;
    const prevRotY = root.rotation.y;

    root.position.set(
      anchorPos.x + swayX,
      anchorPos.y + jumpY + hop,
      anchorPos.z
    );

    const listeningPitch = -0.09 * listeningWeight; // gentle chin-up tilt
    const listeningYaw = 0.07 * listeningWeight;    // subtle turn to side
    const listeningRoll = 0.12 * listeningWeight;   // cute inquisitive tilt

    root.scale.set((1.0 / Math.sqrt(squash)) * s, squash * s, (1.0 / Math.sqrt(squash)) * s);
    root.rotation.y = facingYaw + animState.currentLook.x * 0.38 * bodyLookScale + Math.sin(animState.time * 0.9) * (isPlaced ? 0.03 : 0.08) + listeningYaw;
    root.rotation.x = facingPitch - animState.currentLook.y * 0.22 * bodyLookScale + Math.cos(animState.time * 1.8) * (isPlaced ? 0.02 : 0.04) + listeningPitch;
    root.rotation.z = -(swayX / s) * 0.35 + Math.sin(animState.boopPhase) * animState.boopImpulse * 0.18 + listeningRoll;

    animState.velocity.set(
      (root.position.x - prevX) / (safeDt * s),
      (root.position.y - prevY) / (safeDt * s),
      (root.position.z - prevZ) / (safeDt * s)
    );
    animState.angularVelocity.set(
      (root.rotation.x - prevRotY) / safeDt,
      (root.rotation.y - prevRotY) / safeDt,
      (root.rotation.z - prevRotZ) / safeDt
    );

    // Natural blinking
    animState.blinkTimer += safeDt;
    let blinkScaleY = 1.0;
    if (animState.blinkTimer > animState.nextBlink) {
      const blinkProgress = (animState.blinkTimer - animState.nextBlink) / 0.16;
      if (blinkProgress < 1.0) {
        blinkScaleY = Math.max(0.08, Math.abs(Math.cos(blinkProgress * Math.PI)));
      } else {
        animState.blinkTimer = 0;
        animState.nextBlink = 2.4 + Math.random() * 2.5;
      }
    }
    if (animState.boopImpulse > 0.25) {
      blinkScaleY = Math.min(blinkScaleY, 0.18);
    }

    for (const eye of eyes) {
      eye.pivot.scale.y = blinkScaleY;
      eye.catchlightMain.position.x = -eye.side * 0.022 + animState.currentLook.x * 0.012;
      eye.catchlightMain.position.y = 0.024 + animState.currentLook.y * 0.010;
    }
  }

  function dispose() {
    bodyGeometry.dispose();
    skinMaterial.dispose();
    root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  }

  return {
    root,
    bodyMesh,
    bodyGeometry,
    skinMaterial,
    animState,
    setEnvironmentScale,
    triggerBoop,
    placeAt,
    resetPlacement,
    isPlaced: () => isPlaced,
    getAnchorPosition: () => anchorPos,
    update,
    dispose
  };
}
