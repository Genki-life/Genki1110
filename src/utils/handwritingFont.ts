import caveat600Woff2Url from '@fontsource/caveat/files/caveat-latin-600-normal.woff2?url';

export type HandwritingFontLoadResult = 'loaded' | 'failed';

const CAVEAT_FAMILY = 'Caveat';
const CAVEAT_FONT_SPEC = '600 32px "Caveat"';
const FONT_LOAD_FAILURE_TIMEOUT_MS = 8000;

let preloadInjected = false;
let eagerLoadTriggered = false;

function normalizeFamilyName(family: string): string {
  return family.replace(/^['"]|['"]$/g, '').trim().toLowerCase();
}

function getCaveat600Faces(): FontFace[] {
  if (typeof document === 'undefined' || !('fonts' in document)) return [];
  const faces: FontFace[] = [];
  document.fonts.forEach((face) => {
    if (
      normalizeFamilyName(face.family) === CAVEAT_FAMILY.toLowerCase() &&
      String(face.weight).trim() === '600'
    ) {
      faces.push(face);
    }
  });
  return faces;
}

/**
 * Checks whether the actual local Caveat 600 FontFace has finished loading
 * (never falsely succeeds on system fallback fonts).
 */
export function isCaveat600Loaded(sampleText?: string): boolean {
  if (typeof document === 'undefined' || !('fonts' in document)) return false;
  const faces = getCaveat600Faces();
  const hasLoadedFace = faces.some((face) => face.status === 'loaded');
  if (!hasLoadedFace) return false;
  try {
    return document.fonts.check(CAVEAT_FONT_SPEC, sampleText || 'Goal');
  } catch {
    return hasLoadedFace;
  }
}

/**
 * Preloads the local @fontsource/caveat 600 woff2 asset as early as possible
 * so switching into Plan finds Caveat 600 already fetched or in-flight.
 */
export function preloadCaveat600(): void {
  if (typeof document === 'undefined') return;

  if (!preloadInjected && document.head && caveat600Woff2Url) {
    const existing = document.head.querySelector('link[data-genki-preload="caveat-600"]');
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.href = caveat600Woff2Url;
      link.crossOrigin = 'anonymous';
      link.setAttribute('data-genki-preload', 'caveat-600');
      document.head.appendChild(link);
    }
    preloadInjected = true;
  }

  if (!eagerLoadTriggered && 'fonts' in document) {
    eagerLoadTriggered = true;
    try {
      void document.fonts.load(CAVEAT_FONT_SPEC, 'Get back into running').catch(() => {});
    } catch {
      // ignore unsupported FontFaceSet implementations
    }
  }
}

/**
 * Explicitly waits for the local Caveat 600 font required by `sampleText` to load.
 * Resolves `'loaded'` once Caveat 600 is genuinely ready, or `'failed'` if the
 * font genuinely fails to load so the UI can fall back to readable static text.
 */
export async function waitForCaveat600(sampleText: string): Promise<HandwritingFontLoadResult> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return 'failed';
  }

  const probeText = sampleText.trim() || 'Goal';
  if (isCaveat600Loaded(probeText)) {
    return 'loaded';
  }

  preloadCaveat600();

  const loadAttempt = async (): Promise<HandwritingFontLoadResult> => {
    try {
      let faces = await document.fonts.load(CAVEAT_FONT_SPEC, probeText);

      // On cold boot, @font-face rules from the stylesheet may still be registering
      if (faces.length === 0 && !isCaveat600Loaded(probeText)) {
        await document.fonts.ready;
        faces = await document.fonts.load(CAVEAT_FONT_SPEC, probeText);
      }

      if (
        faces.some((face) => face.status === 'loaded') ||
        isCaveat600Loaded(probeText)
      ) {
        return 'loaded';
      }

      const registered = getCaveat600Faces();
      if (registered.length > 0 && registered.every((f) => f.status === 'error')) {
        return 'failed';
      }

      return 'failed';
    } catch {
      return 'failed';
    }
  };

  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<HandwritingFontLoadResult>((resolve) => {
    timeoutId = window.setTimeout(() => {
      resolve(isCaveat600Loaded(probeText) ? 'loaded' : 'failed');
    }, FONT_LOAD_FAILURE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([loadAttempt(), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}
