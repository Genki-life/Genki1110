export type MemoryCategory = 'matters' | 'feels_right' | 'check';

export type PreferenceSource =
  | 'user_explicit'
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
 * Migrated dataset from "What Nova knows".
 * Original items are preserved, and provenance is audited strictly:
 * - Items explicitly shared by the user are marked 'user_explicit' + isConfirmed: true.
 * - Items inferred from past behavior/observations are NOT auto-confirmed; they stay
 *   pending confirmation ('nova_inferred' + isConfirmed: false) and appear as questions.
 */
export const MIGRATED_INITIAL_PREFERENCES: PreferenceItem[] = [
  {
    id: 'mem-steady-energy',
    category: 'matters',
    title: 'Calm daily rhythm without pace or streak pressure',
    summary: 'Keep activity suggestions gentle without calorie, step, or streak targets.',
    learnedFrom: 'Shared during onboarding.',
    howItHelps: 'Keeps suggestions pressure-free.',
    updatedAt: 'Saved Oct 28',
    isConfirmed: true,
    source: 'user_explicit',
    shortTag: 'No pace targets',
  },
  {
    id: 'mem-neck-tension',
    category: 'matters',
    title: 'Gentle neck and shoulder relief after desk work',
    summary: 'Focus on light upper-back and shoulder stretches after long laptop blocks.',
    learnedFrom: 'Shared in chat.',
    howItHelps: 'Prioritizes gentle shoulder and neck mobility.',
    updatedAt: 'Saved Nov 1',
    isConfirmed: true,
    source: 'user_explicit',
    shortTag: 'Neck & shoulders',
  },
  {
    id: 'mem-walk-window',
    category: 'check',
    title: 'Prefer short walks after lunch (1:15–1:45 PM)?',
    summary: 'Short 15-minute outdoor walks right after lunch seemed easiest to start.',
    learnedFrom: 'Observed from past post-lunch walks.',
    howItHelps: 'Schedules outdoor walks after 1:00 PM instead of early mornings.',
    updatedAt: 'Observed earlier',
    isConfirmed: false,
    source: 'nova_inferred',
    shortTag: 'After lunch',
  },
  {
    id: 'mem-home-stretch',
    category: 'check',
    title: 'Prefer short living room stretches over gym routines?',
    summary: 'No-mat 5-minute stretches at home were chosen on busy workdays.',
    learnedFrom: 'Observed from past Plan B choices.',
    howItHelps: 'Defaults to simple home stretches when time is short.',
    updatedAt: 'Observed earlier',
    isConfirmed: false,
    source: 'nova_inferred',
    shortTag: 'At home',
  },
  {
    id: 'mem-rainy-days',
    category: 'check',
    title: 'Switch to indoor mobility on rainy or cold days?',
    summary: 'Indoor sessions were chosen when temperatures dropped or it rained.',
    learnedFrom: 'Observed on two rainy afternoons.',
    howItHelps: 'Suggests indoor sessions in wet or chilly weather.',
    updatedAt: 'New observation',
    isConfirmed: false,
    source: 'nova_inferred',
    shortTag: 'Indoor when rainy',
  },
  {
    id: 'mem-sunday-recharge',
    category: 'check',
    title: 'Keep Sundays as a quiet rest day?',
    summary: 'Past Sundays were marked as rest days.',
    learnedFrom: 'Observed from past Sundays.',
    howItHelps: 'Defaults Sundays to a quiet rest state.',
    updatedAt: 'New observation',
    isConfirmed: false,
    source: 'nova_inferred',
    shortTag: 'Sundays off',
  },
];

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
 * Strict provenance rule: any legacy item without an explicit 'user_explicit' source
 * is NEVER automatically marked as user-confirmed.
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
    rawSource === 'nova_inferred' ||
    rawSource === 'legacy_unverified'
  ) {
    source = rawSource;
  } else {
    // Unknown provenance from legacy data must never be auto-marked as user-confirmed
    source = 'legacy_unverified';
  }

  const isConfirmed = source === 'user_explicit' && obj.isConfirmed === true;
  const rawCategory = obj.category;
  const category: MemoryCategory = isConfirmed
    ? rawCategory === 'matters' || rawCategory === 'feels_right'
      ? rawCategory
      : 'feels_right'
    : 'check';

  const summary =
    typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const learnedFrom =
    typeof obj.learnedFrom === 'string' && obj.learnedFrom.trim()
      ? obj.learnedFrom.trim()
      : source === 'user_explicit'
      ? 'Added by you.'
      : 'Migrated from earlier notes (unverified).';
  const howItHelps =
    typeof obj.howItHelps === 'string' ? obj.howItHelps.trim() : '';
  const updatedAt =
    typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
      ? obj.updatedAt.trim()
      : 'Saved';
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
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed)) {
          return parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
        }
      }

      // Migrate from any legacy storage key if present, keeping unverified provenance unconfirmed
      for (const legacyKey of LEGACY_MEMORY_STORAGE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated = parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
          savePreferences(migrated);
          return migrated;
        }
      }
    } catch {
      // Ignore malformed storage and fall back to migrated initial dataset
    }
  }

  return MIGRATED_INITIAL_PREFERENCES.map((item) => ({ ...item }));
}

export function savePreferences(items: PreferenceItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota or private mode errors
  }
}
