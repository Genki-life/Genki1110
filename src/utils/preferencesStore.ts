export type MemoryCategory = 'matters' | 'feels_right' | 'check';

export type PreferenceSource =
  | 'user_explicit'
  | 'demo'
  | 'nova_inferred'
  | 'legacy_unverified';

export type PreferenceKind =
  | 'session_length'
  | 'best_time'
  | 'where'
  | 'activities'
  | 'avoid_activity'
  | 'custom';

export type PreferencePlace = 'home' | 'outdoors' | 'gym';

export interface SessionLengthPreference {
  mode: 'range' | 'flexible' | 'unset';
  /** 5–60 min in 5-min increments */
  minMinutes?: number;
  /** 5–60 min in 5-min increments, always >= minMinutes */
  maxMinutes?: number;
}

export interface BestTimePreference {
  mode: 'window' | 'cue' | 'flexible' | 'unset';
  /** Minutes since midnight, 30-min increments (e.g., 18*60 = 1080 for 6 pm) */
  startMinutes?: number;
  /** Minutes since midnight, 30-min increments (e.g., 20*60 = 1200 for 8 pm) */
  endMinutes?: number;
  /** Natural life trigger cue kept verbatim (e.g. "after lunch") */
  cueText?: string;
}

export interface WherePreference {
  places: PreferencePlace[];
}

export interface ActivitiesPreference {
  /** Activity keys matching WorkoutActivityIcon keys (e.g. 'walking', 'cycling', 'yoga', 'strength') */
  selected: string[];
}

export interface AvoidActivityPreference {
  /** Activity label to suggest less of (e.g. 'HIIT', 'Running') */
  activity: string;
}

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
  /** Structured preference kind for interactive Nova controls */
  prefKind?: PreferenceKind;
  sessionLength?: SessionLengthPreference;
  bestTime?: BestTimePreference;
  where?: WherePreference;
  activities?: ActivitiesPreference;
  avoidActivity?: AvoidActivityPreference;
}

export const PREFERENCES_STORAGE_KEY = 'genki.plan.preferences.v1';
const PREVIEW_PREFERENCES_STORAGE_PREFIX = 'genki.plan.preferences.preview.v2.';
const LEGACY_MEMORY_STORAGE_KEYS = [
  'genki.plan.memories.v1',
  'genki.memories.v1',
  'what_nova_knows',
];

export const COMMON_PREFERENCE_ACTIVITIES: ReadonlyArray<{
  key: string;
  label: string;
  iconKey: string;
}> = [
  { key: 'walking', label: 'Walking', iconKey: 'walking' },
  { key: 'cycling', label: 'Cycling', iconKey: 'cycling' },
  { key: 'yoga', label: 'Yoga', iconKey: 'yoga' },
  { key: 'strength', label: 'Strength', iconKey: 'strength' },
  { key: 'running', label: 'Running', iconKey: 'running' },
  { key: 'stretching', label: 'Stretching', iconKey: 'flexibility' },
  { key: 'hiking', label: 'Hiking', iconKey: 'hiking' },
  { key: 'pilates', label: 'Pilates', iconKey: 'pilates' },
  { key: 'swimming', label: 'Swimming', iconKey: 'swimming' },
];

export const PLACE_OPTIONS: ReadonlyArray<{
  key: PreferencePlace;
  label: string;
  sentencePhrase: string;
}> = [
  { key: 'home', label: 'Home', sentencePhrase: 'at home' },
  { key: 'outdoors', label: 'Outdoors', sentencePhrase: 'outdoors' },
  { key: 'gym', label: 'Gym', sentencePhrase: 'at the gym' },
];

export const SESSION_MIN_MINUTES = 5;
export const SESSION_MAX_MINUTES = 60;
export const SESSION_STEP_MINUTES = 5;

export const TIMELINE_MIN_MINUTES = 6 * 60; // 6:00 am
export const TIMELINE_MAX_MINUTES = 22 * 60; // 10:00 pm
export const TIMELINE_STEP_MINUTES = 30;

export function clampSessionMinutes(value: number): number {
  const snapped = Math.round(value / SESSION_STEP_MINUTES) * SESSION_STEP_MINUTES;
  return Math.max(SESSION_MIN_MINUTES, Math.min(SESSION_MAX_MINUTES, snapped));
}

export function clampTimelineMinutes(value: number): number {
  const snapped = Math.round(value / TIMELINE_STEP_MINUTES) * TIMELINE_STEP_MINUTES;
  return Math.max(TIMELINE_MIN_MINUTES, Math.min(TIMELINE_MAX_MINUTES, snapped));
}

export function formatClockMinutes(totalMinutes: number, includePeriod = true): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const hours24 = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const period = hours24 >= 12 && hours24 < 24 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const timePart = mins === 0 ? `${hours12}` : `${hours12}:${String(mins).padStart(2, '0')}`;
  return includePeriod ? `${timePart} ${period}` : timePart;
}

export function formatTimeWindowCompact(startMinutes: number, endMinutes: number): string {
  const s = clampTimelineMinutes(Math.min(startMinutes, endMinutes));
  const e = clampTimelineMinutes(Math.max(startMinutes, endMinutes));
  const sPeriod = s >= 12 * 60 && s < 24 * 60 ? 'pm' : 'am';
  const ePeriod = e >= 12 * 60 && e < 24 * 60 ? 'pm' : 'am';
  if (sPeriod === ePeriod) {
    return `${formatClockMinutes(s, false)}–${formatClockMinutes(e, true)}`;
  }
  return `${formatClockMinutes(s, true)}–${formatClockMinutes(e, true)}`;
}

export function formatTimeWindowSentence(startMinutes: number, endMinutes: number): string {
  const s = clampTimelineMinutes(Math.min(startMinutes, endMinutes));
  const e = clampTimelineMinutes(Math.max(startMinutes, endMinutes));
  const sPeriod = s >= 12 * 60 && s < 24 * 60 ? 'pm' : 'am';
  const ePeriod = e >= 12 * 60 && e < 24 * 60 ? 'pm' : 'am';
  if (sPeriod === ePeriod) {
    return `between ${formatClockMinutes(s, false)} and ${formatClockMinutes(e, true)}`;
  }
  return `between ${formatClockMinutes(s, true)} and ${formatClockMinutes(e, true)}`;
}

export function formatSessionLengthValue(pref?: SessionLengthPreference): string {
  if (!pref || pref.mode === 'unset') return 'Not set';
  if (pref.mode === 'flexible') return 'Flexible';
  const min = clampSessionMinutes(pref.minMinutes ?? 10);
  const max = clampSessionMinutes(pref.maxMinutes ?? min);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo === hi ? `${lo} min` : `${lo}–${hi} min`;
}

export function formatSessionLengthSentenceToken(pref?: SessionLengthPreference): string {
  if (!pref || pref.mode === 'unset') return 'choose a length';
  if (pref.mode === 'flexible') return 'flexible timing';
  return formatSessionLengthValue(pref);
}

export function formatSessionLengthConfirmation(pref: SessionLengthPreference): string {
  if (pref.mode === 'flexible') {
    return 'I’ll keep session lengths flexible for you.';
  }
  const min = clampSessionMinutes(pref.minMinutes ?? 10);
  const max = clampSessionMinutes(pref.maxMinutes ?? min);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) {
    return `I’ll keep most sessions around ${lo} minutes.`;
  }
  return `I’ll keep most sessions to ${lo}–${hi} minutes.`;
}

function capitalizeSentenceLead(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatBestTimeValue(pref?: BestTimePreference): string {
  if (!pref || pref.mode === 'unset') return 'Not set';
  if (pref.mode === 'flexible') return 'No fixed time';
  if (pref.mode === 'cue') {
    return capitalizeSentenceLead(pref.cueText || 'Custom cue');
  }
  return formatTimeWindowCompact(pref.startMinutes ?? 18 * 60, pref.endMinutes ?? 20 * 60);
}

export function formatBestTimeSentenceToken(pref?: BestTimePreference): string {
  if (!pref || pref.mode === 'unset') return 'choose a time';
  if (pref.mode === 'flexible') return 'no fixed time';
  if (pref.mode === 'cue') {
    return (pref.cueText || '').trim().replace(/[.!?]+$/, '') || 'your usual cue';
  }
  return formatTimeWindowSentence(pref.startMinutes ?? 18 * 60, pref.endMinutes ?? 20 * 60);
}

export function formatBestTimeConfirmation(pref: BestTimePreference): string {
  if (pref.mode === 'flexible') {
    return 'I’ll keep your timing open with no fixed window.';
  }
  if (pref.mode === 'cue') {
    const cue = (pref.cueText || '').trim().replace(/[.!?]+$/, '');
    return `I’ll look for chances to move ${cue}.`;
  }
  return `I’ll look for chances to move ${formatTimeWindowSentence(
    pref.startMinutes ?? 18 * 60,
    pref.endMinutes ?? 20 * 60
  )}.`;
}

export function formatWhereValue(pref?: WherePreference): string {
  const places = pref?.places ?? [];
  if (places.length === 0) return 'Not set';
  return places
    .map((p) => PLACE_OPTIONS.find((opt) => opt.key === p)?.label ?? p)
    .join(', ');
}

export function formatWhereSentenceToken(pref?: WherePreference): string {
  const places = pref?.places ?? [];
  if (places.length === 0) return 'choose where';
  const phrases = places.map(
    (p) => PLACE_OPTIONS.find((opt) => opt.key === p)?.sentencePhrase ?? p
  );
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} or ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, or ${phrases[phrases.length - 1]}`;
}

export function formatWhereConfirmation(pref: WherePreference): string {
  return `I’ll favor movement you can do ${formatWhereSentenceToken(pref)}.`;
}

export function getActivityLabel(key: string): string {
  const clean = key.trim().toLowerCase();
  const match = COMMON_PREFERENCE_ACTIVITIES.find(
    (a) => a.key === clean || a.label.toLowerCase() === clean
  );
  if (match) return match.label;
  return capitalizeSentenceLead(key.trim());
}

export function getActivityIconKey(key: string): string {
  const clean = key.trim().toLowerCase();
  const match = COMMON_PREFERENCE_ACTIVITIES.find(
    (a) => a.key === clean || a.label.toLowerCase() === clean
  );
  return match?.iconKey ?? clean;
}

export function formatActivitiesValue(pref?: ActivitiesPreference): string {
  const selected = pref?.selected ?? [];
  if (selected.length === 0) return 'Not set';
  return selected.map(getActivityLabel).join(', ');
}

export function formatActivitiesSentenceToken(pref?: ActivitiesPreference): string {
  const selected = pref?.selected ?? [];
  if (selected.length === 0) return 'choose activities';
  const labels = selected.map((k) => getActivityLabel(k).toLowerCase());
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function formatActivitiesConfirmation(pref: ActivitiesPreference): string {
  return `I’ll lean toward ${formatActivitiesSentenceToken(pref)}.`;
}

export function getPreferenceDisplayRow(item: PreferenceItem): {
  name: string;
  value: string;
} {
  const kind = inferPreferenceKind(item);
  if (kind === 'session_length') {
    return {
      name: 'Session length',
      value: formatSessionLengthValue(item.sessionLength),
    };
  }
  if (kind === 'best_time') {
    return {
      name: 'Best time',
      value: formatBestTimeValue(item.bestTime),
    };
  }
  if (kind === 'where') {
    return {
      name: 'Where',
      value: formatWhereValue(item.where),
    };
  }
  if (kind === 'activities') {
    return {
      name: 'Activities',
      value: formatActivitiesValue(item.activities),
    };
  }
  if (kind === 'avoid_activity') {
    const label =
      item.avoidActivity?.activity?.trim() ||
      item.title.replace(/^suggest\s+less\s+/i, '').replace(/\?+$/, '').trim() ||
      item.title;
    return {
      name: 'Suggest less',
      value: label,
    };
  }
  return {
    name: item.shortTag?.trim() || 'Preference',
    value: item.title.replace(/\?+$/, '').trim(),
  };
}

export function inferPreferenceKind(item: PreferenceItem): PreferenceKind {
  if (item.prefKind) return item.prefKind;
  if (item.sessionLength) return 'session_length';
  if (item.bestTime) return 'best_time';
  if (item.where) return 'where';
  if (item.activities) return 'activities';
  if (item.avoidActivity) return 'avoid_activity';

  const haystack = `${item.title} ${item.shortTag ?? ''} ${item.summary}`.toLowerCase();
  if (item.id === 'demo-pref-short-sessions' || /\bbusy\s+days?\b/.test(haystack)) {
    return 'custom';
  }
  if (/\b(suggest less|less |avoid |skip |fewer )\b/.test(haystack) && /\b(hiit|run|running|jump|jumping|burpee|cardio|weights|strength|cycling|yoga|swim)\b/.test(haystack)) {
    return 'avoid_activity';
  }
  if (/\b(session length|short session|minutes?|min\b|duration|flexible timing)\b/.test(haystack)) {
    return 'session_length';
  }
  if (/\b(best time|morning|afternoon|evening|after lunch|before work|after dinner|pm\b|am\b|no fixed time)\b/.test(haystack)) {
    return 'best_time';
  }
  if (/\b(at home|outdoors|outdoor|gym|where)\b/.test(haystack)) {
    return 'where';
  }
  if (/\b(walk|walking|cycling|bike|yoga|strength|stretch|stretching|pilates|hiking|swimming|activities)\b/.test(haystack)) {
    return 'activities';
  }
  return 'custom';
}

/**
 * Hydrates structured payloads from legacy text-only preferences if missing.
 * If concrete duration/time is missing, explicitly sets mode: 'unset' so the user must choose before saving.
 */
export function hydrateStructuredPreference(item: PreferenceItem): PreferenceItem {
  const kind = inferPreferenceKind(item);
  const text = `${item.title} ${item.summary} ${item.shortTag ?? ''}`.trim();
  const lower = text.toLowerCase();

  if (kind === 'session_length' && !item.sessionLength) {
    if (/\bflexible\b/.test(lower)) {
      return { ...item, prefKind: 'session_length', sessionLength: { mode: 'flexible' } };
    }
    const rangeMatch = lower.match(/(\d+)\s*[–-]\s*(\d+)\s*(?:min|mins|minute|minutes|m)\b/);
    if (rangeMatch) {
      const a = clampSessionMinutes(Number(rangeMatch[1]));
      const b = clampSessionMinutes(Number(rangeMatch[2]));
      return {
        ...item,
        prefKind: 'session_length',
        sessionLength: { mode: 'range', minMinutes: Math.min(a, b), maxMinutes: Math.max(a, b) },
      };
    }
    const singleMatch = lower.match(/\b(\d+)\s*[-]?\s*(?:min|mins|minute|minutes)\b/);
    if (singleMatch) {
      const single = clampSessionMinutes(Number(singleMatch[1]));
      return {
        ...item,
        prefKind: 'session_length',
        sessionLength: { mode: 'range', minMinutes: single, maxMinutes: single },
      };
    }
    return { ...item, prefKind: 'session_length', sessionLength: { mode: 'unset' } };
  }

  if (kind === 'best_time' && !item.bestTime) {
    if (/\bno fixed time\b/.test(lower)) {
      return { ...item, prefKind: 'best_time', bestTime: { mode: 'flexible' } };
    }
    const cueMatch = lower.match(/\b(after\s+[a-z\s]{2,24}|before\s+[a-z\s]{2,24}|during\s+[a-z\s]{2,24})\b/);
    if (cueMatch) {
      return {
        ...item,
        prefKind: 'best_time',
        bestTime: { mode: 'cue', cueText: cueMatch[1].trim() },
      };
    }
    const rangeMatch = lower.match(
      /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|and|[–-])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/
    );
    if (rangeMatch) {
      const endPeriod = rangeMatch[6];
      const startPeriod = rangeMatch[3] || endPeriod;
      const toMins = (hStr: string, mStr: string | undefined, period: string) => {
        let h = Number(hStr) % 12;
        if (period === 'pm') h += 12;
        return clampTimelineMinutes(h * 60 + (mStr ? Number(mStr) : 0));
      };
      const s = toMins(rangeMatch[1], rangeMatch[2], startPeriod);
      const e = toMins(rangeMatch[4], rangeMatch[5], endPeriod);
      if (e > s) {
        return {
          ...item,
          prefKind: 'best_time',
          bestTime: { mode: 'window', startMinutes: s, endMinutes: e },
        };
      }
    }
    return { ...item, prefKind: 'best_time', bestTime: { mode: 'unset' } };
  }

  if (kind === 'where' && !item.where) {
    const places: PreferencePlace[] = [];
    if (/\bhome\b/.test(lower)) places.push('home');
    if (/\boutdoor|outside|park|trail\b/.test(lower)) places.push('outdoors');
    if (/\bgym|studio\b/.test(lower)) places.push('gym');
    return { ...item, prefKind: 'where', where: { places } };
  }

  if (kind === 'activities' && !item.activities) {
    const selected: string[] = [];
    for (const act of COMMON_PREFERENCE_ACTIVITIES) {
      const stem = act.key === 'walking' ? 'walk' : act.key === 'cycling' ? 'cycl|bike' : act.key === 'running' ? 'run' : act.key === 'stretching' ? 'stretch' : act.key === 'hiking' ? 'hik' : act.key === 'swimming' ? 'swim' : act.key;
      if (new RegExp(`\\b(${stem})`, 'i').test(lower)) {
        selected.push(act.key);
      }
    }
    return { ...item, prefKind: 'activities', activities: { selected } };
  }

  if (kind === 'avoid_activity' && !item.avoidActivity) {
    const parsed = parseAvoidActivityFromText(item.title) ?? item.title.replace(/\?+$/, '').trim();
    return { ...item, prefKind: 'avoid_activity', avoidActivity: { activity: parsed } };
  }

  return { ...item, prefKind: kind };
}

/**
 * Parses a "suggest less X" intent from freeform user chat input.
 * Returns the cleaned activity name (e.g. "HIIT", "Running") or null.
 */
export function parseAvoidActivityFromText(raw: string): string | null {
  const cleaned = raw.trim().replace(/[.!?]+$/, '').trim();
  if (!cleaned) return null;

  const patterns = [
    /(?:suggest|recommend|show|give\s+me)?\s*(?:less|fewer)\s+(?:of\s+)?([a-z0-9\s&-]{2,28})$/i,
    /(?:avoid|skip|stop\s+suggesting|no\s+more|don['’]?t\s+(?:suggest|want|like|recommend))\s+([a-z0-9\s&-]{2,28})$/i,
    /^no\s+([a-z0-9\s&-]{2,24})$/i,
  ];

  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m && m[1]) {
      const candidate = m[1]
        .replace(/\b(please|thanks|workouts?|sessions?|exercises?|activities?)\b/gi, '')
        .trim();
      if (!candidate) continue;
      if (/^hiit$/i.test(candidate)) return 'HIIT';
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  return null;
}

/**
 * Prototype demo pending questions (max 2).
 * Marked with `source: 'demo'` in code, unconfirmed by default, and with NO fabricated evidence.
 */
export const PROTOTYPE_DEMO_PREFERENCES: PreferenceItem[] = [
  {
    id: 'demo-pref-short-sessions',
    category: 'check',
    title: 'Prefer shorter sessions on busy days?',
    summary: '',
    learnedFrom: '',
    howItHelps: '',
    updatedAt: '',
    isConfirmed: false,
    source: 'demo',
    shortTag: 'Shorter on busy days',
    prefKind: 'custom',
  },
  {
    id: 'demo-pref-less-hiit',
    category: 'check',
    title: 'Suggest less HIIT?',
    summary: '',
    learnedFrom: '',
    howItHelps: '',
    updatedAt: '',
    isConfirmed: false,
    source: 'demo',
    shortTag: 'Less HIIT',
    prefKind: 'avoid_activity',
    avoidActivity: { activity: 'HIIT' },
  },
];

/**
 * Isolated preview fixture preferences for AI Studio dev preview (`previewProfileId !== null`).
 * Never written to official production user storage (`PREFERENCES_STORAGE_KEY`).
 */
export function createPreviewDefaultPreferences(): PreferenceItem[] {
  return [
    {
      id: 'pref-session-length',
      category: 'feels_right',
      title: 'Session length',
      summary: '10–20 min',
      learnedFrom: 'Saved by you.',
      howItHelps: 'Guides default movement duration.',
      updatedAt: 'Saved',
      isConfirmed: true,
      source: 'user_explicit',
      shortTag: '10–20 min',
      prefKind: 'session_length',
      sessionLength: { mode: 'range', minMinutes: 10, maxMinutes: 20 },
    },
    {
      id: 'pref-best-time',
      category: 'feels_right',
      title: 'Best time',
      summary: '6–8 pm',
      learnedFrom: 'Saved by you.',
      howItHelps: 'Helps suggest movement when it fits best.',
      updatedAt: 'Saved',
      isConfirmed: true,
      source: 'user_explicit',
      shortTag: '6–8 pm',
      prefKind: 'best_time',
      bestTime: { mode: 'window', startMinutes: 18 * 60, endMinutes: 20 * 60 },
    },
    {
      id: 'pref-where',
      category: 'feels_right',
      title: 'Where',
      summary: 'Home, Outdoors',
      learnedFrom: 'Saved by you.',
      howItHelps: 'Prioritizes spaces you like to move in.',
      updatedAt: 'Saved',
      isConfirmed: true,
      source: 'user_explicit',
      shortTag: 'Home, Outdoors',
      prefKind: 'where',
      where: { places: ['home', 'outdoors'] },
    },
    {
      id: 'pref-activities',
      category: 'feels_right',
      title: 'Activities',
      summary: 'Walking, Cycling, Yoga',
      learnedFrom: 'Saved by you.',
      howItHelps: 'Leans toward movement styles you enjoy.',
      updatedAt: 'Saved',
      isConfirmed: true,
      source: 'user_explicit',
      shortTag: 'Walking, Cycling, Yoga',
      prefKind: 'activities',
      activities: { selected: ['walking', 'cycling', 'yoga'] },
    },
    ...PROTOTYPE_DEMO_PREFERENCES.map((item) => ({ ...item })),
  ];
}

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

export function deriveShortPreferenceTag(item: PreferenceItem): string {
  const kind = inferPreferenceKind(item);
  if (kind === 'session_length') return formatSessionLengthValue(item.sessionLength);
  if (kind === 'best_time') return formatBestTimeValue(item.bestTime);
  if (kind === 'where') return formatWhereValue(item.where);
  if (kind === 'activities') return formatActivitiesValue(item.activities);
  if (kind === 'avoid_activity' && item.avoidActivity?.activity) {
    return `Less ${item.avoidActivity.activity}`;
  }

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
    if (!tag || tag === 'Not set') continue;
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

function normalizeSessionLength(raw: unknown): SessionLengthPreference | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.mode === 'flexible') return { mode: 'flexible' };
  if (obj.mode === 'unset') return { mode: 'unset' };
  if (obj.mode === 'range') {
    const rawMin = typeof obj.minMinutes === 'number' ? obj.minMinutes : 10;
    const rawMax = typeof obj.maxMinutes === 'number' ? obj.maxMinutes : rawMin;
    const a = clampSessionMinutes(rawMin);
    const b = clampSessionMinutes(rawMax);
    return { mode: 'range', minMinutes: Math.min(a, b), maxMinutes: Math.max(a, b) };
  }
  return undefined;
}

function normalizeBestTime(raw: unknown): BestTimePreference | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.mode === 'flexible') return { mode: 'flexible' };
  if (obj.mode === 'unset') return { mode: 'unset' };
  if (obj.mode === 'cue') {
    const cueText = typeof obj.cueText === 'string' ? obj.cueText.trim() : '';
    return cueText ? { mode: 'cue', cueText } : { mode: 'unset' };
  }
  if (obj.mode === 'window') {
    const rawStart = typeof obj.startMinutes === 'number' ? obj.startMinutes : 18 * 60;
    const rawEnd = typeof obj.endMinutes === 'number' ? obj.endMinutes : 20 * 60;
    const s = clampTimelineMinutes(Math.min(rawStart, rawEnd));
    const e = clampTimelineMinutes(Math.max(rawStart, rawEnd));
    return {
      mode: 'window',
      startMinutes: s,
      endMinutes: Math.min(TIMELINE_MAX_MINUTES, Math.max(s + TIMELINE_STEP_MINUTES, e)),
    };
  }
  return undefined;
}

function normalizeWhere(raw: unknown): WherePreference | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.places)) return undefined;
  const valid = obj.places.filter(
    (p): p is PreferencePlace => p === 'home' || p === 'outdoors' || p === 'gym'
  );
  return { places: Array.from(new Set(valid)) };
}

function normalizeActivities(raw: unknown): ActivitiesPreference | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.selected)) return undefined;
  const valid = obj.selected
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim().toLowerCase());
  return { selected: Array.from(new Set(valid)) };
}

function normalizeAvoidActivity(raw: unknown): AvoidActivityPreference | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const activity = typeof obj.activity === 'string' ? obj.activity.trim() : '';
  return activity ? { activity } : undefined;
}

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
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt.trim() : '';
  const shortTag =
    typeof obj.shortTag === 'string' && obj.shortTag.trim() ? obj.shortTag.trim() : undefined;

  const rawKind = obj.prefKind;
  const prefKind: PreferenceKind | undefined =
    rawKind === 'session_length' ||
    rawKind === 'best_time' ||
    rawKind === 'where' ||
    rawKind === 'activities' ||
    rawKind === 'avoid_activity' ||
    rawKind === 'custom'
      ? rawKind
      : undefined;

  const isBusyDayScoped =
    id === 'demo-pref-short-sessions' || /\bbusy\s+days?\b/i.test(title);

  const base: PreferenceItem = {
    id,
    category,
    title: isConfirmed ? title : formatAsCheckQuestion(title),
    summary,
    learnedFrom,
    howItHelps,
    updatedAt,
    isConfirmed,
    source,
    shortTag: isBusyDayScoped ? shortTag || 'Shorter on busy days' : shortTag,
    prefKind: isBusyDayScoped ? 'custom' : prefKind,
    sessionLength: isBusyDayScoped ? undefined : normalizeSessionLength(obj.sessionLength),
    bestTime: normalizeBestTime(obj.bestTime),
    where: normalizeWhere(obj.where),
    activities: normalizeActivities(obj.activities),
    avoidActivity: normalizeAvoidActivity(obj.avoidActivity),
  };

  return hydrateStructuredPreference(base);
}

function getStorageKey(previewProfileId?: string | null): string {
  if (previewProfileId) {
    return `${PREVIEW_PREFERENCES_STORAGE_PREFIX}${previewProfileId.trim().toLowerCase()}`;
  }
  return PREFERENCES_STORAGE_KEY;
}

export function loadPreferences(previewProfileId?: string | null): PreferenceItem[] {
  const storageKey = getStorageKey(previewProfileId);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedRaw = window.localStorage.getItem(storageKey);
      if (savedRaw !== null) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
          const { items, changed } = sanitizeLegacySeedPreferences(normalized);
          if (changed) {
            savePreferences(items, previewProfileId);
          }
          return items;
        }
      }

      if (previewProfileId) {
        const seeded = createPreviewDefaultPreferences();
        savePreferences(seeded, previewProfileId);
        return seeded;
      }

      for (const legacyKey of LEGACY_MEMORY_STORAGE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .map(normalizePreferenceItem)
            .filter((item): item is PreferenceItem => item !== null);
          const { items } = sanitizeLegacySeedPreferences(normalized);
          savePreferences(items, previewProfileId);
          return items;
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }

  return previewProfileId ? createPreviewDefaultPreferences() : [];
}

export function savePreferences(
  items: PreferenceItem[],
  previewProfileId?: string | null
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const storageKey = getStorageKey(previewProfileId);
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function resetPreviewPreferences(previewProfileId: string): PreferenceItem[] {
  const seeded = createPreviewDefaultPreferences();
  savePreferences(seeded, previewProfileId);
  return seeded;
}
