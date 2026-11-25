export type MemoryCategory = 'matters' | 'feels_right' | 'check';

export type PreferenceSource =
  | 'user_explicit'
  | 'demo'
  | 'nova_inferred'
  | 'legacy_unverified';

export interface PreferenceItem {
  id: string;
  category: MemoryCategory;
  title: string;
  summary: string;
  learnedFrom: string;
  howItHelps: string;
  updatedAt: string;
  isConfirmed: boolean;
  source: PreferenceSource;
  /** Short label displayed in Plan -> Preferences summary (max 3 tags) when user-confirmed */
  shortTag?: string;
}

export const PREFERENCES_STORAGE_KEY = 'genki.plan.preferences.v1';
const LEGACY_MEMORY_STORAGE_KEYS = [
  'genki.plan.memories.v1',
  'genki.memories.v1',
  'what_nova_knows',
];

/**
 * Prototype demo pending questions (max 2).
 * Marked with `source: 'demo'` in code, unconfirmed by default, and with NO fabricated
 * evidence (never claims "Observed from past walks" or "Shared in chat").
 */
export const PROTOTYPE_DEMO_PREFERENCES: PreferenceItem[] = [
  {
    id: 'demo-pref-short-sessions',
    category: 'check',
    title: 'Prefer short sessions?',
    summary: '',
    learnedFrom: '',
    howItHelps: '',
    updatedAt: '',
    isConfirmed: false,
    source: 'demo',
    shortTag: 'Short sessions',
  },
  {
    id: 'demo-pref-at-home',
    category: 'check',
    title: 'Prefer activities at home?',
    summary: '',
    learnedFrom: '',
    howItHelps: '',
    updatedAt: '',
    isConfirmed: false,
    source: 'demo',
    shortTag: 'At home',
  },
];

/**
 * Signatures of old hardcoded default preferences that were previously seeded as
 * "confirmed" or with fabricated "Observed from..." / "Shared during onboarding." provenance.
 * If an item still matches one of these untouched legacy seed signatures, it is downgraded
 * to pending confirmation with fabricated evidence stripped, while genuine user-added or
 * user-confirmed entries are preserved untouched.
 */
const LEGACY_HARDCODED_CONFIRMED_SEEDS: Readonly<
  Record<string, { learnedFrom: string; updatedAt: string }>
> = {
  'mem-steady-energy': {
    learnedFrom: 'Shared during onboarding.',
    updatedAt: 'Saved Oct 28',
  },
  'mem-neck-tension': {
    learnedFrom: 'Shared in chat.',
    updatedAt: 'Saved Nov 1',
  },
};

const LEGACY_HARDCODED_PENDING_SEED_IDS = new Set([
  'mem-walk-window',
  'mem-home-stretch',
  'mem-rainy-days',
  'mem-sunday-recharge',
]);

const FABRICATED_EVIDENCE_PREFIXES = [
  'Observed from',
  'Observed on',
  'Shared during onboarding',
  'Shared in chat.',
];

function isFabricatedSeedEvidence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return FABRICATED_EVIDENCE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function isUntouchedLegacyConfirmedSeed(item: PreferenceItem): boolean {
  const sig = LEGACY_HARDCODED_CONFIRMED_SEEDS[item.id];
  if (!sig) return false;
  return (
    item.learnedFrom.trim() === sig.learnedFrom &&
    item.updatedAt.trim() === sig.updatedAt
  );
}

export function isUntouchedLegacyPendingSeed(item: PreferenceItem): boolean {
  if (!LEGACY_HARDCODED_PENDING_SEED_IDS.has(item.id)) return false;
  return !item.isConfirmed || item.source !== 'user_explicit';
}

export function sanitizeLegacySeedPreferences(
  items: PreferenceItem[]
): { items: PreferenceItem[]; changed: boolean } {
  let changed = false;
  const sanitized = items.map((item) => {
    if (isUntouchedLegacyConfirmedSeed(item)) {
      changed = true;
      return {
        ...item,
        category: 'check' as MemoryCategory,
        title: formatAsCheckQuestion(item.title),
        isConfirmed: false,
        source: 'legacy_unverified' as PreferenceSource,
        learnedFrom: '',
        updatedAt: '',
      };
    }

    if (isUntouchedLegacyPendingSeed(item) && isFabricatedSeedEvidence(item.learnedFrom)) {
      changed = true;
      return {
        ...item,
        category: 'check' as MemoryCategory,
        title: formatAsCheckQuestion(item.title),
        isConfirmed: false,
        source: 'legacy_unverified' as PreferenceSource,
        learnedFrom: '',
      };
    }

    return item;
  });

  return { items: sanitized, changed };
}

export function deriveShortPreferenceTag(item: Pick<PreferenceItem, 'title' | 'shortTag'>): string {
  const existing = (item.shortTag || '').trim();
  if (existing) return existing;

  const clean = item.title.replace(/\?+$/, '').trim();
  if (!clean) return '';
  if (clean.length <= 20) return clean;
  const words = clean.split(/\s+/).slice(0, 3).join(' ');
  return words.length <= 22 ? words : `${words.slice(0, 20).trim()}…`;
}

export function getConfirmedPreferenceTags(
  items: PreferenceItem[],
  maxCount = 3
): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item.isConfirmed || item.source !== 'user_explicit') continue;
    const tag = deriveShortPreferenceTag(item);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= maxCount) break;
  }

  return tags;
}

export function formatAsCheckQuestion(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return 'Save this preference?';
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
}

/**
 * Normalizes stored or migrated preference entries.
 * Strict provenance rule: any demo or legacy item without an explicit 'user_explicit'
 * source is NEVER automatically marked as user-confirmed.
 */
export function normalizePreferenceItem(raw: unknown): PreferenceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;

  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : `pref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const rawSource = obj.source;
  let source: PreferenceSource;
  if (
    rawSource === 'user_explicit' ||
    rawSource === 'demo' ||
    rawSource === 'nova_inferred' ||
    rawSource === 'legacy_unverified'
  ) {
    source = rawSource;
  } else {
    source = 'legacy_unverified';
  }

  const isConfirmed = source === 'user_explicit' && obj.isConfirmed === true;
  const rawCategory = obj.category;
  const category: MemoryCategory = isConfirmed
    ? rawCategory === 'matters' || rawCategory === 'feels_right'
      ? rawCategory
      : 'feels_right'
    : 'check';

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const rawLearnedFrom = typeof obj.learnedFrom === 'string' ? obj.learnedFrom.trim() : '';
  const learnedFrom =
    source === 'demo'
      ? ''
      : rawLearnedFrom || (source === 'user_explicit' ? 'Added by you.' : '');
  const howItHelps = typeof obj.howItHelps === 'string' ? obj.howItHelps.trim() : '';
  const updatedAt =
    typeof obj.updatedAt === 'string' ? obj.updatedAt.trim() : '';
  const shortTag =
    typeof obj.shortTag === 'string' && obj.shortTag.trim()
      ? obj.shortTag.trim()
      : undefined;

  return {
    id,
    category,
    title: isConfirmed ? title : formatAsCheckQuestion(title),
    summary,
    learnedFrom,
    howItHelps,
    updatedAt,
    isConfirmed,
    source,
    shortTag,
  };
}

export function loadPreferences(): PreferenceItem[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedRaw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (savedRaw !== null) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
          const { items, changed } = sanitizeLegacySeedPreferences(normalized);
          if (changed) {
            savePreferences(items);
          }
          return items;
        }
      }

      // Migrate from any legacy storage key if present, keeping unverified provenance unconfirmed
      for (const legacyKey of LEGACY_MEMORY_STORAGE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
          const { items } = sanitizeLegacySeedPreferences(normalized);
          savePreferences(items);
          return items;
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }

  return [];
}

export function savePreferences(items: PreferenceItem[]): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}
