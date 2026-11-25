/**
 * Lightweight preview runtime constants & URL/host detection.
 * Kept strictly free of seed-data builders so production shared URLs
 * never download or execute prototypeDemoSeed.ts.
 */

export const PROTOTYPE_DEMO_SEED_VERSION = '2026-11.v6-this-week-standalone-runs';
export const PROTOTYPE_DEMO_SEED_VERSION_KEY = 'genki.plan.demoSeedVersion.v1';

/**
 * Isolated storage prefix strictly for explicit dev/test preview fixtures.
 * Official user storage keys MUST NEVER be written by fixture builders.
 */
export const PREVIEW_FIXTURE_STORAGE_PREFIX = 'genki.plan.preview_fixture.v1.';
export const PLAN_PREVIEW_QUERY_PARAM = 'preview';
export const PLAN_PREVIEW_RESET_PARAM = 'reset';
export const PLAN_REVIEW_PREVIEW_PROFILE_ID = 'plan-review';
export const PREVIEW_SHORT_WALKS_HABIT_ID = 'habit::short-walks';

export const FOCUS_STORAGE_KEY = 'genki.plan.focus.v1';
export const LEGACY_DIRECTION_STORAGE_KEYS = [
  'genki.plan.direction.v1',
  'genki.plan.direction',
  'genki_direction',
  'your_direction',
] as const;

export function getPreviewProfileStorageKey(profileId: string): string {
  const clean = profileId.trim().toLowerCase() || PLAN_REVIEW_PREVIEW_PROFILE_ID;
  return `${PREVIEW_FIXTURE_STORAGE_PREFIX}${clean}`;
}

function isAiStudioDevPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (/^ais-dev-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/i.test(host)) return true;
  return false;
}

function isViteDevMode(): boolean {
  try {
    return Boolean(import.meta.env && import.meta.env.DEV);
  } catch {
    return false;
  }
}

export function getActivePreviewProfileIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(PLAN_PREVIEW_QUERY_PARAM)?.trim().toLowerCase();
    if (raw) {
      if (raw === 'off' || raw === 'false' || raw === '0' || raw === 'none' || raw === 'user') {
        return null;
      }
      if (raw === PLAN_REVIEW_PREVIEW_PROFILE_ID || raw === 'plan' || raw === '1' || raw === 'true') {
        return PLAN_REVIEW_PREVIEW_PROFILE_ID;
      }
      return null;
    }
    // AI Studio default development preview entry loads the isolated preview profile automatically;
    // official production deployments continue reading real user storage.
    if (isViteDevMode() || isAiStudioDevPreviewHost(window.location.hostname)) {
      return PLAN_REVIEW_PREVIEW_PROFILE_ID;
    }
    return null;
  } catch {
    return null;
  }
}

export function isPreviewResetRequestedFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = new URLSearchParams(window.location.search)
      .get(PLAN_PREVIEW_RESET_PARAM)
      ?.trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  } catch {
    return false;
  }
}

export function getInitialTabFromUrl(): 'Today' | 'Plan' | 'Discover' {
  if (typeof window === 'undefined') return 'Today';
  try {
    const raw = new URLSearchParams(window.location.search).get('tab')?.trim().toLowerCase();
    if (raw === 'plan') return 'Plan';
    if (raw === 'discover') return 'Discover';
    return 'Today';
  } catch {
    return 'Today';
  }
}
