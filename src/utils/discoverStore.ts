export const DISCOVER_SAVED_STORAGE_KEY = 'genki.discover.saved.v1';

// Legacy session/local keys that might exist from earlier sessions (migrated once only if v1 is absent)
const LEGACY_DISCOVER_SAVED_KEYS = [
  'genki.discover.saved',
  'discover.savedItemIds',
] as const;

export const DISCOVER_CATALOG_IDS = [
  'walk-mindful',
  'desk-decompression',
  'parasympathetic-breath',
  'evening-soundscape',
] as const;

export type DiscoverCatalogId = (typeof DISCOVER_CATALOG_IDS)[number];

const VALID_DISCOVER_ID_SET = new Set<string>(DISCOVER_CATALOG_IDS);

export function isValidDiscoverId(id: unknown): id is DiscoverCatalogId {
  return typeof id === 'string' && VALID_DISCOVER_ID_SET.has(id);
}

/**
 * Validates, filters to known catalog IDs, and deduplicates saved Discover IDs
 * while preserving order.
 */
export function sanitizeSavedDiscoverIds(raw: unknown): string[] {
  let list: unknown[] | null = null;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { ids?: unknown }).ids)) {
    list = (raw as { ids: unknown[] }).ids;
  }
  if (!list) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of list) {
    if (isValidDiscoverId(entry) && !seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  return result;
}

function tryReadStorageIds(storage: Storage | undefined, key: string): string[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return sanitizeSavedDiscoverIds(parsed);
  } catch {
    return null;
  }
}

/**
 * Loads persisted saved Discover guide IDs from versioned localStorage.
 * - Preserves existing v1 persisted data without overwriting.
 * - Migrates any valid legacy/session user saves once when v1 does not exist yet.
 * - Starts empty ([]) when no user-saved data exists (never pre-saves defaults).
 */
export function loadSavedDiscoverIds(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const v1Ids = tryReadStorageIds(window.localStorage, DISCOVER_SAVED_STORAGE_KEY);
    if (v1Ids !== null) {
      return v1Ids;
    }

    // One-time migration from any legacy/session keys if v1 is absent
    for (const legacyKey of LEGACY_DISCOVER_SAVED_KEYS) {
      const fromLocal = tryReadStorageIds(window.localStorage, legacyKey);
      if (fromLocal !== null) {
        saveSavedDiscoverIds(fromLocal);
        return fromLocal;
      }
      const fromSession = tryReadStorageIds(window.sessionStorage, legacyKey);
      if (fromSession !== null) {
        saveSavedDiscoverIds(fromSession);
        return fromSession;
      }
    }
  } catch {
    // Storage access unavailable (e.g., restricted context) — degrade cleanly without crashing
  }

  return [];
}

/**
 * Persists sanitized Discover saved IDs to versioned localStorage.
 * Swallows storage quota/security errors so UI interactions never crash.
 */
export function saveSavedDiscoverIds(ids: string[]): boolean {
  if (typeof window === 'undefined') return false;
  const sanitized = sanitizeSavedDiscoverIds(ids);
  try {
    window.localStorage.setItem(
      DISCOVER_SAVED_STORAGE_KEY,
      JSON.stringify({ version: 1, ids: sanitized })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure toggle helper that validates against known catalog IDs and guarantees
 * deduplication.
 */
export function toggleSavedDiscoverId(prev: string[], id: string): string[] {
  const sanitizedPrev = sanitizeSavedDiscoverIds(prev);
  if (!isValidDiscoverId(id)) return sanitizedPrev;
  if (sanitizedPrev.includes(id)) {
    return sanitizedPrev.filter((itemId) => itemId !== id);
  }
  return [...sanitizedPrev, id];
}
