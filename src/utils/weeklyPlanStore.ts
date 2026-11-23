export type ActivityCategory = 'walk' | 'stretch' | 'rest' | 'other';
export type ActivitySource = 'today' | 'manual' | 'demo';

export interface ActivityCompletionRecord {
  id: string;
  /** Stable deduplication key for Today task instances (undefined for manual records so same-day same-title activities are preserved separately) */
  sourceKey?: string;
  source: ActivitySource;
  cardId?: string;
  planId?: string;
  title: string;
  category: ActivityCategory;
  durationMinutes: number;
  completedAt: string;
  dateKey: string;
  hasExactTimestamp: boolean;
  note?: string;
  isSample?: boolean;
}

export type ActivityRecord = ActivityCompletionRecord;

export interface RestRecord {
  id: string;
  dateKey: string;
  source: ActivitySource;
  title: string;
  note?: string;
  createdAt: string;
  isSample?: boolean;
}

export interface UnifiedActivityStoreData {
  activities: ActivityCompletionRecord[];
  restRecords: RestRecord[];
}

export interface WeeklyItemSchedule {
  /** null represents Flexible (no fixed weekly target count) */
  targetCount: number | null;
  durationLabel: string;
}

export interface WeeklySchedule {
  walk: WeeklyItemSchedule;
  stretch: WeeklyItemSchedule;
  restNote: 'As needed';
  updatedAt: string;
  source?: 'user' | 'demo';
}

export interface LocalWeekBounds {
  weekStart: Date;
  weekEnd: Date;
  weekStartKey: string;
  weekEndKey: string;
  rangeLabel: string;
}

export type WeeklyReviewFeeling = 'too_much' | 'about_right' | 'ready_for_more';

export interface WeeklyReviewFeedback {
  weekStartKey: string;
  feeling: WeeklyReviewFeeling;
  updatedAt: string;
}

export const WEEKLY_SCHEDULE_STORAGE_KEY = 'genki.plan.weeklySchedule.v1';
export const WEEKLY_SCHEDULES_BY_WEEK_STORAGE_KEY = 'genki.plan.weeklySchedulesByWeek.v1';
export const WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY = 'genki.plan.weeklyScheduleMigrated.v1';
export const ACTIVITIES_STORAGE_KEY = 'genki.plan.activities.v1';
export const REST_RECORDS_STORAGE_KEY = 'genki.plan.restRecords.v1';
export const ACTIVITIES_MIGRATED_STORAGE_KEY = 'genki.plan.activitiesMigrated.v1';
export const LEGACY_ACTIVITY_LOGS_STORAGE_KEYS = [
  'genki.plan.activityLogs.v1',
  'genki.plan.historyLogs.v1',
] as const;
export const COMPLETIONS_STORAGE_KEY = 'genki.plan.completions.v1';
export const REST_DAYS_STORAGE_KEY = 'genki.plan.restDays.v1';
export const WEEKLY_REVIEWS_STORAGE_KEY = 'genki.plan.weeklyReviews.v1';
export const DISMISSED_ADJUSTMENTS_STORAGE_KEY = 'genki.plan.dismissedAdjustments.v1';

export const DEFAULT_WEEKLY_DRAFT: WeeklySchedule = {
  walk: {
    targetCount: 3,
    durationLabel: '10–15 min',
  },
  stretch: {
    targetCount: 2,
    durationLabel: '5 min',
  },
  restNote: 'As needed',
  updatedAt: '',
};

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseLocalDateKey(dateKey: string): Date | null {
  if (typeof dateKey !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const dt = new Date(y, m, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatShortMonthDay(date: Date): string {
  return `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatReviewOnSundayLabel(referenceDate: Date = new Date()): string {
  const bounds = getLocalWeekBounds(referenceDate);
  return `Review on ${formatShortMonthDay(bounds.weekEnd)}`;
}

export function getLocalWeekBounds(referenceDate: Date = new Date()): LocalWeekBounds {
  const localMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  // Monday as week start (0 = Sun -> 6 days back, 1 = Mon -> 0 days back, etc.)
  const daysSinceMonday = (localMidnight.getDay() + 6) % 7;
  const weekStart = new Date(
    localMidnight.getFullYear(),
    localMidnight.getMonth(),
    localMidnight.getDate() - daysSinceMonday
  );
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6
  );

  const startMonth = SHORT_MONTHS[weekStart.getMonth()];
  const endMonth = SHORT_MONTHS[weekEnd.getMonth()];
  const rangeLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${startMonth} ${weekStart.getDate()}–${weekEnd.getDate()}`
      : `${startMonth} ${weekStart.getDate()}–${endMonth} ${weekEnd.getDate()}`;

  return {
    weekStart,
    weekEnd,
    weekStartKey: toLocalDateKey(weekStart),
    weekEndKey: toLocalDateKey(weekEnd),
    rangeLabel,
  };
}

export function getLastCompletedWeekBounds(
  referenceDate: Date = new Date()
): LocalWeekBounds {
  const currentBounds = getLocalWeekBounds(referenceDate);
  const lastWeekRef = new Date(
    currentBounds.weekStart.getFullYear(),
    currentBounds.weekStart.getMonth(),
    currentBounds.weekStart.getDate() - 7
  );
  return getLocalWeekBounds(lastWeekRef);
}

export function getNextWeekBounds(
  referenceDate: Date = new Date()
): LocalWeekBounds {
  const currentBounds = getLocalWeekBounds(referenceDate);
  const nextWeekRef = new Date(
    currentBounds.weekStart.getFullYear(),
    currentBounds.weekStart.getMonth(),
    currentBounds.weekStart.getDate() + 7
  );
  return getLocalWeekBounds(nextWeekRef);
}

export function isDateKeyInWeek(
  dateKey: string,
  weekStartKey: string,
  weekEndKey: string
): boolean {
  if (!parseLocalDateKey(dateKey)) return false;
  return dateKey >= weekStartKey && dateKey <= weekEndKey;
}

export function inferActivityCategory(planId?: string, title?: string): ActivityCategory {
  const id = (planId || '').toLowerCase().trim();
  const text = (title || '').toLowerCase().trim();

  if (id === 'rest' || /\brest\b/.test(text)) {
    return 'rest';
  }
  if (id === 'walk' || id === 'tomorrow' || id === 'tomorrow_walk' || /\bwalk\b/.test(text)) {
    return 'walk';
  }
  if (
    id === 'stretch' ||
    id === 'mobility' ||
    /\bstretch\b|\bshoulder\b|\bneck\b|\bmobility\b/.test(text)
  ) {
    return 'stretch';
  }
  return 'other';
}

export function inferDurationMinutes(title?: string, fallbackMinutes = 10): number {
  if (typeof title === 'string') {
    const match = /(\d+)\s*[-–]?\s*min/i.exec(title);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return fallbackMinutes;
}

export function normalizeWeeklySchedule(raw: unknown): WeeklySchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.walk || typeof obj.walk !== 'object' || !obj.stretch || typeof obj.stretch !== 'object') {
    return null;
  }

  const normalizeItem = (
    itemRaw: Record<string, unknown>,
    defaultDuration: string
  ): WeeklyItemSchedule => {
    const rawTarget = itemRaw.targetCount;
    let targetCount: number | null = null;
    if (typeof rawTarget === 'number' && Number.isFinite(rawTarget) && rawTarget >= 1) {
      targetCount = Math.min(14, Math.round(rawTarget));
    }
    const durationLabel =
      typeof itemRaw.durationLabel === 'string' && itemRaw.durationLabel.trim()
        ? itemRaw.durationLabel.trim()
        : defaultDuration;
    return { targetCount, durationLabel };
  };

  const source: 'user' | 'demo' | undefined =
    obj.source === 'demo' || obj.source === 'user' ? obj.source : undefined;

  return {
    walk: normalizeItem(obj.walk as Record<string, unknown>, DEFAULT_WEEKLY_DRAFT.walk.durationLabel),
    stretch: normalizeItem(
      obj.stretch as Record<string, unknown>,
      DEFAULT_WEEKLY_DRAFT.stretch.durationLabel
    ),
    restNote: 'As needed',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    ...(source ? { source } : {}),
  };
}

export type WeeklySchedulesByWeek = Record<string, WeeklySchedule>;

export function saveWeeklySchedulesByWeek(schedules: WeeklySchedulesByWeek): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      WEEKLY_SCHEDULES_BY_WEEK_STORAGE_KEY,
      JSON.stringify(schedules)
    );
    // Once per-week schedules have been persisted, legacy single-schedule migration must not re-run.
    window.localStorage.setItem(WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function loadWeeklySchedulesByWeek(
  referenceDate: Date = new Date()
): WeeklySchedulesByWeek {
  if (typeof window === 'undefined' || !window.localStorage) return {};

  const result: WeeklySchedulesByWeek = {};
  let hasByWeekKey = false;

  try {
    const rawByWeek = window.localStorage.getItem(WEEKLY_SCHEDULES_BY_WEEK_STORAGE_KEY);
    if (rawByWeek !== null) {
      hasByWeekKey = true;
      const parsed = JSON.parse(rawByWeek);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
          if (!parseLocalDateKey(key)) continue;
          const normalized = normalizeWeeklySchedule(val);
          if (normalized) {
            result[key] = normalized;
          }
        }
      }
    }
  } catch {
    // Ignore malformed JSON in per-week storage
  }

  // One-time migration from legacy single weeklySchedule -> current local weekStartKey.
  // Preserves existing per-week data and never overwrites an existing entry.
  try {
    const alreadyMigrated =
      window.localStorage.getItem(WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY) === '1';
    if (!alreadyMigrated) {
      const legacyRaw = window.localStorage.getItem(WEEKLY_SCHEDULE_STORAGE_KEY);
      if (legacyRaw) {
        const legacySchedule = normalizeWeeklySchedule(JSON.parse(legacyRaw));
        if (legacySchedule) {
          const currentWeekKey = getLocalWeekBounds(referenceDate).weekStartKey;
          if (!result[currentWeekKey]) {
            result[currentWeekKey] = legacySchedule;
            saveWeeklySchedulesByWeek(result);
          } else {
            window.localStorage.setItem(WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY, '1');
          }
        } else {
          window.localStorage.setItem(WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY, '1');
        }
      } else if (hasByWeekKey) {
        window.localStorage.setItem(WEEKLY_SCHEDULE_MIGRATED_STORAGE_KEY, '1');
      }
    }
  } catch {
    // Ignore malformed legacy JSON or storage quota errors
  }

  return result;
}

export function loadWeeklySchedule(
  weekStartKey?: string,
  referenceDate: Date = new Date()
): WeeklySchedule | null {
  const byWeek = loadWeeklySchedulesByWeek(referenceDate);
  const key = weekStartKey ?? getLocalWeekBounds(referenceDate).weekStartKey;
  return byWeek[key] ?? null;
}

export function saveWeeklySchedule(
  schedule: WeeklySchedule,
  weekStartKey?: string,
  referenceDate: Date = new Date()
): void {
  const key = weekStartKey ?? getLocalWeekBounds(referenceDate).weekStartKey;
  const byWeek = loadWeeklySchedulesByWeek(referenceDate);
  saveWeeklySchedulesByWeek({
    ...byWeek,
    [key]: schedule,
  });
}

export function getWeeklyScheduleFieldValue(
  schedule: WeeklySchedule,
  targetActivity: 'walk' | 'stretch',
  targetField: 'durationLabel' | 'targetCount'
): string | number | null {
  return targetField === 'durationLabel'
    ? schedule[targetActivity].durationLabel
    : schedule[targetActivity].targetCount;
}

export function setWeeklyScheduleFieldValue(
  schedule: WeeklySchedule,
  targetActivity: 'walk' | 'stretch',
  targetField: 'durationLabel' | 'targetCount',
  value: string | number | null
): WeeklySchedule {
  const updatedAt = new Date().toISOString();
  if (targetActivity === 'walk') {
    return {
      ...schedule,
      walk:
        targetField === 'durationLabel'
          ? { ...schedule.walk, durationLabel: String(value ?? DEFAULT_WEEKLY_DRAFT.walk.durationLabel) }
          : { ...schedule.walk, targetCount: value === null ? null : Number(value) },
      updatedAt,
    };
  }
  return {
    ...schedule,
    stretch:
      targetField === 'durationLabel'
        ? { ...schedule.stretch, durationLabel: String(value ?? DEFAULT_WEEKLY_DRAFT.stretch.durationLabel) }
        : { ...schedule.stretch, targetCount: value === null ? null : Number(value) },
    updatedAt,
  };
}

const DEMO_HISTORY_NOTE_MARKERS = new Set([
  'Sample historical activity',
  'Sample restorative day',
  'Light gentle pacing',
  'Intentional recovery pause',
]);

let manualRecordCounter = 0;

export function createManualActivityId(dateKey: string): string {
  manualRecordCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `manual::${dateKey}::${Date.now()}-${manualRecordCounter}-${rand}`;
}

export function createManualRestId(dateKey: string): string {
  manualRecordCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `rest::manual::${dateKey}::${Date.now()}-${manualRecordCounter}-${rand}`;
}

export function buildDateOnlyIso(dateKey: string): string {
  const localDt = parseLocalDateKey(dateKey);
  if (!localDt) return new Date().toISOString();
  return new Date(
    localDt.getFullYear(),
    localDt.getMonth(),
    localDt.getDate(),
    12,
    0,
    0
  ).toISOString();
}

export function normalizeCompletionRecord(
  raw: unknown,
  options: { allowDemo?: boolean; fallbackSource?: ActivitySource } = {}
): ActivityCompletionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const allowDemo = options.allowDemo === true;

  const explicitSource: ActivitySource | null =
    obj.source === 'today' || obj.source === 'manual' || obj.source === 'demo'
      ? obj.source
      : null;
  const isDemo = explicitSource === 'demo' || obj.isSample === true;
  if (isDemo && !allowDemo) return null;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const planId = typeof obj.planId === 'string' ? obj.planId.trim() : '';
  const cardId = typeof obj.cardId === 'string' ? obj.cardId.trim() : '';
  if (!title && !planId) return null;

  const rawSourceKey =
    typeof obj.sourceKey === 'string' && obj.sourceKey.trim()
      ? obj.sourceKey.trim()
      : typeof obj.taskInstanceId === 'string' && obj.taskInstanceId.trim()
      ? obj.taskInstanceId.trim()
      : undefined;

  const source: ActivitySource = isDemo
    ? 'demo'
    : explicitSource ??
      options.fallbackSource ??
      (cardId && cardId !== 'legacy' && cardId !== 'manual' ? 'today' : rawSourceKey ? 'today' : 'manual');

  // Compatibility: derive local dateKey from completedAt or vice versa, without inventing historical dates
  let completedAt = typeof obj.completedAt === 'string' ? obj.completedAt.trim() : '';
  let dateKey = typeof obj.dateKey === 'string' ? obj.dateKey.trim() : '';
  let hasExactTimestamp =
    source === 'demo'
      ? false
      : typeof obj.hasExactTimestamp === 'boolean'
      ? obj.hasExactTimestamp
      : source === 'today';

  if (completedAt) {
    const parsedTime = new Date(completedAt);
    if (Number.isNaN(parsedTime.getTime())) {
      completedAt = '';
      hasExactTimestamp = false;
    } else if (!parseLocalDateKey(dateKey)) {
      dateKey = toLocalDateKey(parsedTime);
    }
  } else {
    hasExactTimestamp = false;
  }

  if (!completedAt && parseLocalDateKey(dateKey)) {
    completedAt = buildDateOnlyIso(dateKey);
    hasExactTimestamp = false;
  }

  // Never fabricate a historical date if neither completedAt nor valid dateKey exists
  if (!completedAt || !parseLocalDateKey(dateKey)) {
    return null;
  }

  const rawCat = obj.category;
  const category: ActivityCategory =
    rawCat === 'walk' || rawCat === 'stretch' || rawCat === 'other'
      ? rawCat
      : rawCat === 'rest'
      ? 'rest'
      : inferActivityCategory(planId, title);

  if (category === 'rest') return null;

  const durationMinutes =
    typeof obj.durationMinutes === 'number' && Number.isFinite(obj.durationMinutes) && obj.durationMinutes > 0
      ? Math.round(obj.durationMinutes)
      : inferDurationMinutes(title);

  // Never synthesize a colliding sourceKey from dateKey + title; only preserve real stable sourceKey values
  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : rawSourceKey ?? createManualActivityId(dateKey);

  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;

  return {
    id,
    ...(rawSourceKey ? { sourceKey: rawSourceKey } : {}),
    source,
    ...(cardId ? { cardId } : {}),
    ...(planId ? { planId } : {}),
    title: title || (category === 'walk' ? 'Walk' : category === 'stretch' ? 'Stretch' : 'Activity'),
    category,
    durationMinutes,
    completedAt,
    dateKey,
    hasExactTimestamp: source === 'demo' ? false : hasExactTimestamp,
    ...(note ? { note } : {}),
    isSample: source === 'demo',
  };
}

export function normalizeRestRecord(
  raw: unknown,
  options: { allowDemo?: boolean; fallbackSource?: ActivitySource } = {}
): RestRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const allowDemo = options.allowDemo === true;

  const explicitSource: ActivitySource | null =
    obj.source === 'today' || obj.source === 'manual' || obj.source === 'demo'
      ? obj.source
      : null;
  const isDemo = explicitSource === 'demo' || obj.isSample === true;
  if (isDemo && !allowDemo) return null;

  const dateKey =
    typeof obj.dateKey === 'string' && parseLocalDateKey(obj.dateKey.trim())
      ? obj.dateKey.trim()
      : typeof obj.date === 'string' && parseLocalDateKey(obj.date.trim())
      ? obj.date.trim()
      : '';
  if (!dateKey) return null;

  const source: ActivitySource = isDemo ? 'demo' : explicitSource ?? options.fallbackSource ?? 'manual';
  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : source === 'demo'
      ? `demo-rest::${dateKey}`
      : source === 'today'
      ? `rest::today::${dateKey}`
      : createManualRestId(dateKey);
  const title =
    typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Mindful rest day';
  const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;
  const createdAt =
    typeof obj.createdAt === 'string' && obj.createdAt.trim()
      ? obj.createdAt.trim()
      : buildDateOnlyIso(dateKey);

  return {
    id,
    dateKey,
    source,
    title,
    ...(note ? { note } : {}),
    createdAt,
    isSample: source === 'demo',
  };
}

/**
 * Generates coherent historical prototype demo activity & rest records strictly BEFORE
 * the last completed week (with stable IDs, source: 'demo', hasExactTimestamp: false,
 * and no sample-data note text).
 */
export function createDemoHistoryRecords(
  referenceDate: Date = new Date()
): UnifiedActivityStoreData {
  const baseYear = referenceDate.getFullYear();
  const baseMonth = referenceDate.getMonth();
  const lastCompletedWeekStartKey = getLastCompletedWeekBounds(referenceDate).weekStartKey;

  const activities: ActivityCompletionRecord[] = [];
  const restRecords: RestRecord[] = [];

  const historicalMonthPatterns: {
    offset: number;
    walkDays: number[];
    stretchDays: number[];
    restDays: number[];
  }[] = [
    { offset: -6, walkDays: [3, 10, 17, 24], stretchDays: [6, 20], restDays: [14, 28] },
    { offset: -5, walkDays: [2, 8, 15, 22, 29], stretchDays: [5, 19, 26], restDays: [12, 25] },
    { offset: -4, walkDays: [2, 9, 13, 18, 25], stretchDays: [5, 16, 23], restDays: [11, 27] },
    { offset: -3, walkDays: [3, 7, 12, 17, 21, 26], stretchDays: [5, 15, 24], restDays: [10, 20, 29] },
    { offset: -2, walkDays: [2, 6, 10, 14, 19, 24, 28], stretchDays: [4, 12, 21, 26], restDays: [8, 17, 25] },
    { offset: -1, walkDays: [2, 6, 10, 14, 18, 22, 27, 30], stretchDays: [4, 12, 20, 25], restDays: [8, 16, 24, 31] },
  ];

  const pushDemoActivity = (
    dateKey: string,
    category: 'walk' | 'stretch'
  ) => {
    if (dateKey >= lastCompletedWeekStartKey) return;
    activities.push({
      id: `demo::${dateKey}::${category}`,
      source: 'demo',
      title: category === 'walk' ? 'Walk' : 'Stretch',
      category,
      durationMinutes: category === 'walk' ? 15 : 5,
      completedAt: buildDateOnlyIso(dateKey),
      dateKey,
      hasExactTimestamp: false,
      isSample: true,
    });
  };

  const pushDemoRestDay = (dateKey: string) => {
    if (dateKey >= lastCompletedWeekStartKey) return;
    restRecords.push({
      id: `demo-rest::${dateKey}`,
      dateKey,
      source: 'demo',
      title: 'Rest day',
      createdAt: buildDateOnlyIso(dateKey),
      isSample: true,
    });
  };

  for (const pattern of historicalMonthPatterns) {
    const mDate = new Date(baseYear, baseMonth + pattern.offset, 1);
    const y = mDate.getFullYear();
    const m = mDate.getMonth();
    const maxDays = new Date(y, m + 1, 0).getDate();

    for (const d of pattern.walkDays) {
      if (d <= maxDays) {
        pushDemoActivity(
          `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          'walk'
        );
      }
    }
    for (const d of pattern.stretchDays) {
      if (d <= maxDays) {
        pushDemoActivity(
          `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          'stretch'
        );
      }
    }
    for (const d of pattern.restDays) {
      if (d <= maxDays) {
        pushDemoRestDay(
          `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        );
      }
    }
  }

  // Earlier dates of current month strictly before last completed week (consistent gentle rhythm)
  const currentWalkDays = [2, 6, 10, 14, 18, 22, 26];
  const currentStretchDays = [4, 12, 20, 28];
  const currentRestDays = [8, 16, 24];
  const maxCurrentMonthDays = new Date(baseYear, baseMonth + 1, 0).getDate();

  for (const d of currentWalkDays) {
    if (d <= maxCurrentMonthDays) {
      pushDemoActivity(
        `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        'walk'
      );
    }
  }
  for (const d of currentStretchDays) {
    if (d <= maxCurrentMonthDays) {
      pushDemoActivity(
        `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        'stretch'
      );
    }
  }
  for (const d of currentRestDays) {
    if (d <= maxCurrentMonthDays) {
      pushDemoRestDay(
        `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      );
    }
  }

  return { activities, restRecords };
}

export function saveUnifiedActivities(records: ActivityCompletionRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(records));
    window.localStorage.setItem(ACTIVITIES_MIGRATED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function saveUnifiedRestRecords(restRecords: RestRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(REST_RECORDS_STORAGE_KEY, JSON.stringify(restRecords));
    window.localStorage.setItem(ACTIVITIES_MIGRATED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage quota or private mode errors
  }
}

/**
 * Loads the single unified activity + rest store.
 * On first run (when not yet migrated), migrates legacy Today completions, legacy restDayKeys,
 * and any non-demo legacy History logs once without overwriting existing unified records,
 * deduplicating ONLY by stable sourceKey (never dropping two real activities just because date/title match)
 * and never mistaking old demo day summaries for user-added activities.
 */
export function loadUnifiedActivityStore(
  _referenceDate: Date = new Date()
): UnifiedActivityStoreData {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { activities: [], restRecords: [] };
  }

  const activities: ActivityCompletionRecord[] = [];
  const restRecords: RestRecord[] = [];
  const seenActivityIds = new Set<string>();
  const seenSourceKeys = new Set<string>();
  const seenRestIds = new Set<string>();

  const pushActivity = (rec: ActivityCompletionRecord) => {
    if (rec.sourceKey) {
      if (seenSourceKeys.has(rec.sourceKey)) return;
      seenSourceKeys.add(rec.sourceKey);
    }
    let nextRec = rec;
    if (seenActivityIds.has(nextRec.id)) {
      // Only treat same id as duplicate if it had a stable sourceKey or is demo;
      // for two distinct manual items without sourceKey that somehow lacked unique ids, assign a unique id.
      if (nextRec.source === 'demo' || nextRec.sourceKey) return;
      nextRec = { ...nextRec, id: createManualActivityId(nextRec.dateKey) };
    }
    seenActivityIds.add(nextRec.id);
    activities.push(nextRec);
  };

  const pushRest = (rec: RestRecord) => {
    if (seenRestIds.has(rec.id)) return;
    seenRestIds.add(rec.id);
    restRecords.push(rec);
  };

  let hasUnifiedActivitiesKey = false;
  let hasUnifiedRestKey = false;

  // 1. Load existing unified store if present
  try {
    const rawActivities = window.localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (rawActivities !== null) {
      hasUnifiedActivitiesKey = true;
      const parsed = JSON.parse(rawActivities);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const rec = normalizeCompletionRecord(item, { allowDemo: true });
          if (rec) pushActivity(rec);
        }
      }
    }
  } catch {
    // Ignore malformed JSON
  }

  try {
    const rawRest = window.localStorage.getItem(REST_RECORDS_STORAGE_KEY);
    if (rawRest !== null) {
      hasUnifiedRestKey = true;
      const parsed = JSON.parse(rawRest);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const rec = normalizeRestRecord(item, { allowDemo: true });
          if (rec) pushRest(rec);
        }
      }
    }
  } catch {
    // Ignore malformed JSON
  }

  const alreadyMigrated =
    window.localStorage.getItem(ACTIVITIES_MIGRATED_STORAGE_KEY) === '1';

  if (!alreadyMigrated) {
    // 2a. Migrate legacy Today completion records (`genki.plan.completions.v1`)
    try {
      const legacyCompRaw = window.localStorage.getItem(COMPLETIONS_STORAGE_KEY);
      if (legacyCompRaw) {
        const parsed = JSON.parse(legacyCompRaw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const rec = normalizeCompletionRecord(item, {
              allowDemo: false,
              fallbackSource: 'today',
            });
            if (rec) pushActivity(rec);
          }
        }
      }
    } catch {
      // Ignore malformed legacy completions
    }

    // 2b. Migrate legacy rest day keys (`genki.plan.restDays.v1`)
    try {
      const legacyRestRaw = window.localStorage.getItem(REST_DAYS_STORAGE_KEY);
      if (legacyRestRaw) {
        const parsed = JSON.parse(legacyRestRaw);
        if (Array.isArray(parsed)) {
          const existingRestDates = new Set(restRecords.map((r) => r.dateKey));
          for (const item of parsed) {
            if (typeof item !== 'string') continue;
            const dateKey = item.trim();
            if (!parseLocalDateKey(dateKey) || existingRestDates.has(dateKey)) continue;
            existingRestDates.add(dateKey);
            pushRest({
              id: `rest::today::${dateKey}`,
              dateKey,
              source: 'today',
              title: 'Rest day',
              note: 'Chosen on Today',
              createdAt: buildDateOnlyIso(dateKey),
              isSample: false,
            });
          }
        }
      }
    } catch {
      // Ignore malformed legacy rest days
    }

    // 2c. Migrate any legacy History day-summary storage (strictly skipping demo day summaries!)
    const todayDatesWithCompletions = new Set(
      activities.filter((a) => a.source === 'today').map((a) => a.dateKey)
    );
    const realRestDates = new Set(
      restRecords.filter((r) => r.source !== 'demo').map((r) => r.dateKey)
    );

    for (const legacyLogKey of LEGACY_ACTIVITY_LOGS_STORAGE_KEYS) {
      try {
        const rawLogs = window.localStorage.getItem(legacyLogKey);
        if (!rawLogs) continue;
        const parsed = JSON.parse(rawLogs);
        const entries: unknown[] = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === 'object'
          ? Object.values(parsed as Record<string, unknown>)
          : [];

        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;
          const obj = entry as Record<string, unknown>;
          const noteStr = typeof obj.note === 'string' ? obj.note.trim() : '';

          // Never mistake old demo day summaries for user-added activities
          if (obj.isSample === true) continue;
          if (obj.isSample !== false && DEMO_HISTORY_NOTE_MARKERS.has(noteStr)) continue;
          // Require explicit isSample === false for legacy day summaries so unknown demo dumps aren't promoted
          if (obj.isSample !== false) continue;

          const dateKey =
            typeof obj.date === 'string' && parseLocalDateKey(obj.date.trim())
              ? obj.date.trim()
              : typeof obj.dateKey === 'string' && parseLocalDateKey(obj.dateKey.trim())
              ? obj.dateKey.trim()
              : '';
          if (!dateKey) continue;

          if (obj.type === 'rest') {
            if (!realRestDates.has(dateKey)) {
              realRestDates.add(dateKey);
              pushRest({
                id: createManualRestId(dateKey),
                dateKey,
                source: 'manual',
                title:
                  typeof obj.title === 'string' && obj.title.trim()
                    ? obj.title.trim()
                    : 'Mindful rest day',
                ...(noteStr ? { note: noteStr } : {}),
                createdAt: buildDateOnlyIso(dateKey),
                isSample: false,
              });
            }
          } else if (obj.type === 'active') {
            // Skip overlaid Today-generated day summary if real Today completion already migrated for that date
            if (noteStr === 'Completed on Today' && todayDatesWithCompletions.has(dateKey)) {
              continue;
            }
            const title =
              typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Activity';
            const durationMinutes =
              typeof obj.durationMinutes === 'number' &&
              Number.isFinite(obj.durationMinutes) &&
              obj.durationMinutes > 0
                ? Math.round(obj.durationMinutes)
                : inferDurationMinutes(title);
            const category = inferActivityCategory('', title);
            if (category === 'rest') continue;

            pushActivity({
              id: createManualActivityId(dateKey),
              source: 'manual',
              title,
              category,
              durationMinutes,
              completedAt: buildDateOnlyIso(dateKey),
              dateKey,
              hasExactTimestamp: false,
              ...(noteStr ? { note: noteStr } : {}),
              isSample: false,
            });
          }
        }
      } catch {
        // Ignore malformed legacy history logs
      }
    }

    saveUnifiedActivities(activities);
    saveUnifiedRestRecords(restRecords);
  }

  return { activities, restRecords };
}

export function upsertTodayActivityRecord(
  records: ActivityCompletionRecord[],
  next: ActivityCompletionRecord
): ActivityCompletionRecord[] {
  const filtered = records.filter((r) => {
    if (next.sourceKey && r.sourceKey === next.sourceKey) return false;
    if (r.id === next.id) return false;
    return true;
  });
  return [...filtered, next];
}

export function removeActivityRecordById(
  records: ActivityCompletionRecord[],
  recordId: string
): ActivityCompletionRecord[] {
  return records.filter((r) => r.id !== recordId);
}

export function removeActivitiesForDate(
  records: ActivityCompletionRecord[],
  dateKey: string
): ActivityCompletionRecord[] {
  return records.filter((r) => r.dateKey !== dateKey);
}

export interface ManualActivityInput {
  dateKey: string;
  title: string;
  category: Exclude<ActivityCategory, 'rest'>;
  durationMinutes: number;
  note?: string;
}

export function addManualActivityRecord(
  records: ActivityCompletionRecord[],
  input: ManualActivityInput
): { records: ActivityCompletionRecord[]; created: ActivityCompletionRecord } {
  const cleanTitle = input.title.trim() || (input.category === 'walk' ? 'Walk' : input.category === 'stretch' ? 'Stretch' : 'Activity');
  const cleanDuration = Math.max(1, Math.round(input.durationMinutes || inferDurationMinutes(cleanTitle)));
  const cleanNote = input.note?.trim() || undefined;

  const created: ActivityCompletionRecord = {
    id: createManualActivityId(input.dateKey),
    source: 'manual',
    title: cleanTitle,
    category: input.category,
    durationMinutes: cleanDuration,
    completedAt: buildDateOnlyIso(input.dateKey),
    dateKey: input.dateKey,
    hasExactTimestamp: false,
    ...(cleanNote ? { note: cleanNote } : {}),
    isSample: false,
  };
  return { records: [...records, created], created };
}

export interface ActivityUpdatePatch {
  title: string;
  category: Exclude<ActivityCategory, 'rest'>;
  durationMinutes: number;
  note?: string;
}

export function updateActivityRecordById(
  records: ActivityCompletionRecord[],
  recordId: string,
  patch: ActivityUpdatePatch
): ActivityCompletionRecord[] {
  return records.map((rec) => {
    if (rec.id !== recordId) return rec;
    const cleanTitle = patch.title.trim() || rec.title;
    const cleanDuration = Math.max(1, Math.round(patch.durationMinutes || rec.durationMinutes));
    const cleanNote = patch.note?.trim() || undefined;
    // Editing a demo record promotes it to a real manual user record
    const nextSource: ActivitySource = rec.source === 'demo' ? 'manual' : rec.source;

    const updated: ActivityCompletionRecord = {
      ...rec,
      source: nextSource,
      title: cleanTitle,
      category: patch.category,
      durationMinutes: cleanDuration,
      isSample: false,
    };
    if (cleanNote) {
      updated.note = cleanNote;
    } else {
      delete updated.note;
    }
    return updated;
  });
}

export function upsertRestRecordForDate(
  restRecords: RestRecord[],
  input: {
    dateKey: string;
    source: Exclude<ActivitySource, 'demo'>;
    title?: string;
    note?: string;
    id?: string;
  }
): { restRecords: RestRecord[]; record: RestRecord } {
  const existing = restRecords.find((r) => r.dateKey === input.dateKey && r.source === input.source);
  const record: RestRecord = {
    id:
      input.id ??
      existing?.id ??
      (input.source === 'today'
        ? `rest::today::${input.dateKey}`
        : createManualRestId(input.dateKey)),
    dateKey: input.dateKey,
    source: input.source,
    title: input.title?.trim() || 'Mindful rest day',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    isSample: false,
  };
  // Replace any existing rest record for that same date so one date has at most one rest marker
  const filtered = restRecords.filter((r) => r.dateKey !== input.dateKey);
  return { restRecords: [...filtered, record], record };
}

export function removeRestRecordById(restRecords: RestRecord[], restId: string): RestRecord[] {
  return restRecords.filter((r) => r.id !== restId);
}

export function removeRestRecordsForDate(restRecords: RestRecord[], dateKey: string): RestRecord[] {
  return restRecords.filter((r) => r.dateKey !== dateKey);
}

// Legacy compatibility helpers (delegate cleanly to unified store)
export function loadCompletionRecords(): ActivityCompletionRecord[] {
  return loadUnifiedActivityStore().activities.filter((r) => r.source !== 'demo' && r.isSample !== true);
}

export function saveCompletionRecords(records: ActivityCompletionRecord[]): void {
  saveUnifiedActivities(records);
}

export function upsertCompletionRecordList(
  records: ActivityCompletionRecord[],
  next: ActivityCompletionRecord
): ActivityCompletionRecord[] {
  return upsertTodayActivityRecord(records, next);
}

export function removeCompletionRecordBySourceKey(
  records: ActivityCompletionRecord[],
  sourceKey: string
): ActivityCompletionRecord[] {
  return records.filter((r) => r.sourceKey !== sourceKey && r.id !== sourceKey);
}

export function loadRestDayKeys(): string[] {
  return loadUnifiedActivityStore()
    .restRecords.filter((r) => r.source !== 'demo' && r.isSample !== true)
    .map((r) => r.dateKey);
}

export function saveRestDayKeys(keys: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(REST_DAYS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function addRestDayKey(keys: string[], dateKey: string): string[] {
  if (!parseLocalDateKey(dateKey)) return keys;
  if (keys.includes(dateKey)) return keys;
  return [...keys, dateKey];
}

export function removeRestDayKey(keys: string[], dateKey: string): string[] {
  return keys.filter((k) => k !== dateKey);
}

// ============================================================================
// WEEKLY REVIEW FEEDBACK & RULE-BASED FACTUAL SUMMARY
// ============================================================================

export function loadWeeklyReviewFeedbacks(): Record<string, WeeklyReviewFeedback> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(WEEKLY_REVIEWS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, WeeklyReviewFeedback> = {};
    for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (!parseLocalDateKey(k) || !val || typeof val !== 'object') continue;
      const rec = val as Record<string, unknown>;
      const feeling = rec.feeling;
      if (
        feeling !== 'too_much' &&
        feeling !== 'about_right' &&
        feeling !== 'ready_for_more'
      ) {
        continue;
      }
      result[k] = {
        weekStartKey: k,
        feeling,
        updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function saveWeeklyReviewFeedbacks(
  feedbacks: Record<string, WeeklyReviewFeedback>
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(WEEKLY_REVIEWS_STORAGE_KEY, JSON.stringify(feedbacks));
    return true;
  } catch {
    return false;
  }
}

export function buildWeeklyReviewSummary(
  records: ActivityCompletionRecord[]
): string {
  const activeRecords = records.filter((r) => r.category !== 'rest');
  if (activeRecords.length === 0) {
    return 'No activity recorded last week.';
  }

  let walks = 0;
  let stretches = 0;
  let others = 0;

  for (const r of activeRecords) {
    if (r.category === 'walk') walks += 1;
    else if (r.category === 'stretch') stretches += 1;
    else others += 1;
  }

  const parts: string[] = [];
  if (walks > 0) parts.push(`${walks} ${walks === 1 ? 'walk' : 'walks'}`);
  if (stretches > 0) parts.push(`${stretches} ${stretches === 1 ? 'stretch' : 'stretches'}`);
  if (others > 0) parts.push(`${others} ${others === 1 ? 'other session' : 'other sessions'}`);

  if (parts.length === 1) {
    return `You completed ${parts[0]}.`;
  }
  if (parts.length === 2) {
    return `You completed ${parts[0]} and ${parts[1]}.`;
  }
  return `You completed ${parts[0]}, ${parts[1]}, and ${parts[2]}.`;
}

type DayTimeWindow = 'in the morning' | 'after lunch' | 'in the afternoon' | 'in the evening';

function getTimeWindowFromCompletedAt(iso: string): DayTimeWindow | null {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const hour = dt.getHours();
  if (hour >= 5 && hour < 12) return 'in the morning';
  if (hour >= 12 && hour < 15) return 'after lunch';
  if (hour >= 15 && hour < 18) return 'in the afternoon';
  if (hour >= 18 && hour <= 23) return 'in the evening';
  return null;
}

function getUniformWindow(
  items: ActivityCompletionRecord[]
): DayTimeWindow | null {
  // Date-only manual records have hasExactTimestamp === false and must NEVER be used for time-of-day observations
  const timed = items.filter((r) => r.hasExactTimestamp === true);
  if (timed.length < 2 || timed.length !== items.length) return null;

  const firstWindow = getTimeWindowFromCompletedAt(timed[0].completedAt);
  if (!firstWindow) return null;

  for (let i = 1; i < timed.length; i++) {
    if (getTimeWindowFromCompletedAt(timed[i].completedAt) !== firstWindow) {
      return null;
    }
  }
  return firstWindow;
}

export function buildWeeklyReviewObservation(
  records: ActivityCompletionRecord[],
  restDayCount: number
): string | null {
  const activeRecords = records.filter((r) => r.category !== 'rest');

  const walks = activeRecords.filter((r) => r.category === 'walk');
  const stretches = activeRecords.filter((r) => r.category === 'stretch');

  const walkWindow = getUniformWindow(walks);
  if (walkWindow) {
    const prefix = walks.length === 2 ? 'Both walks were' : `All ${walks.length} walks were`;
    return `${prefix} ${walkWindow}.`;
  }

  const stretchWindow = getUniformWindow(stretches);
  if (stretchWindow) {
    const prefix =
      stretches.length === 2 ? 'Both stretches were' : `All ${stretches.length} stretches were`;
    return `${prefix} ${stretchWindow}.`;
  }

  if (activeRecords.length >= 2) {
    const allWindow = getUniformWindow(activeRecords);
    if (allWindow) {
      const prefix =
        activeRecords.length === 2
          ? 'Both sessions were'
          : `All ${activeRecords.length} sessions were`;
      return `${prefix} ${allWindow}.`;
    }
  }

  if (restDayCount > 0) {
    if (activeRecords.length === 0) {
      return `You chose ${restDayCount} intentional rest ${
        restDayCount === 1 ? 'day' : 'days'
      }.`;
    }
    return `You also chose ${restDayCount} intentional rest ${
      restDayCount === 1 ? 'day' : 'days'
    }.`;
  }

  return null;
}

// ============================================================================
// ON-DEMAND PLAN ADJUSTMENT PROPOSAL (Triggered ONLY by verifiable evidence)
// ============================================================================

export interface WeeklyAdjustmentProposal {
  id: string;
  resolutionKey: string;
  feedbackWeekStartKey: string;
  targetWeekStartKey: string;
  targetWeekRangeLabel: string;
  trigger: 'weekly_review_too_much';
  headline: string;
  reason: string;
  changeLabel: string;
  targetActivity: 'walk' | 'stretch';
  targetField: 'durationLabel' | 'targetCount';
  previousValue: string | number;
  nextValue: string | number;
}

export function loadResolvedAdjustmentKeys(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_ADJUSTMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveResolvedAdjustmentKeys(keys: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const unique = Array.from(new Set(keys));
    window.localStorage.setItem(DISMISSED_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

const WALK_DURATION_STEP_DOWN: Record<string, { next: string; fromShort: string; toShort: string }> = {
  '30 min': { next: '20 min', fromShort: '30', toShort: '20 min' },
  '20 min': { next: '15 min', fromShort: '20', toShort: '15 min' },
  '15 min': { next: '10 min', fromShort: '15', toShort: '10 min' },
  '10–15 min': { next: '10 min', fromShort: '10–15', toShort: '10 min' },
  '10-15 min': { next: '10 min', fromShort: '10–15', toShort: '10 min' },
};

const STRETCH_DURATION_STEP_DOWN: Record<string, { next: string; fromShort: string; toShort: string }> = {
  '15 min': { next: '10 min', fromShort: '15', toShort: '10 min' },
  '10 min': { next: '5 min', fromShort: '10', toShort: '5 min' },
  '5–10 min': { next: '5 min', fromShort: '5–10', toShort: '5 min' },
  '5-10 min': { next: '5 min', fromShort: '5–10', toShort: '5 min' },
};

/**
 * Generates at most ONE verifiable adjustment proposal targeting NEXT WEEK.
 * Trigger: user explicitly chose "Too much" for the last completed week AND has an adjustable schedule.
 * Dismissal/resolution is bound to BOTH feedbackWeekStartKey and targetWeekStartKey.
 */
export function buildWeeklyAdjustmentProposal(
  targetWeekBaseSchedule: WeeklySchedule | null,
  feedback: WeeklyReviewFeedback | null,
  targetWeekBounds: LocalWeekBounds,
  resolvedKeys: string[]
): WeeklyAdjustmentProposal | null {
  if (!targetWeekBaseSchedule || !feedback || feedback.feeling !== 'too_much') {
    return null;
  }

  const feedbackWeekStartKey = feedback.weekStartKey;
  const targetWeekStartKey = targetWeekBounds.weekStartKey;
  const targetWeekRangeLabel = targetWeekBounds.rangeLabel;
  const resolutionKey = `weekly_review_too_much::${feedbackWeekStartKey}::target::${targetWeekStartKey}`;

  if (resolvedKeys.includes(resolutionKey)) {
    return null;
  }

  const reason = 'You said last week felt like too much.';

  const walkDurStep = WALK_DURATION_STEP_DOWN[targetWeekBaseSchedule.walk.durationLabel.trim()];
  if (walkDurStep) {
    const previousValue = targetWeekBaseSchedule.walk.durationLabel;
    const id = `${resolutionKey}::walk.durationLabel::${previousValue}->${walkDurStep.next}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      feedbackWeekStartKey,
      targetWeekStartKey,
      targetWeekRangeLabel,
      trigger: 'weekly_review_too_much',
      headline: 'Try shorter walks next week?',
      reason,
      changeLabel: `Walks: ${walkDurStep.fromShort} → ${walkDurStep.toShort}`,
      targetActivity: 'walk',
      targetField: 'durationLabel',
      previousValue,
      nextValue: walkDurStep.next,
    };
  }

  if (
    targetWeekBaseSchedule.walk.targetCount !== null &&
    targetWeekBaseSchedule.walk.targetCount > 1
  ) {
    const previousValue = targetWeekBaseSchedule.walk.targetCount;
    const nextCount = previousValue - 1;
    const id = `${resolutionKey}::walk.targetCount::${previousValue}->${nextCount}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      feedbackWeekStartKey,
      targetWeekStartKey,
      targetWeekRangeLabel,
      trigger: 'weekly_review_too_much',
      headline: 'Try fewer walks next week?',
      reason,
      changeLabel: `Walks: ${previousValue} → ${nextCount} / week`,
      targetActivity: 'walk',
      targetField: 'targetCount',
      previousValue,
      nextValue: nextCount,
    };
  }

  const stretchDurStep =
    STRETCH_DURATION_STEP_DOWN[targetWeekBaseSchedule.stretch.durationLabel.trim()];
  if (stretchDurStep) {
    const previousValue = targetWeekBaseSchedule.stretch.durationLabel;
    const id = `${resolutionKey}::stretch.durationLabel::${previousValue}->${stretchDurStep.next}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      feedbackWeekStartKey,
      targetWeekStartKey,
      targetWeekRangeLabel,
      trigger: 'weekly_review_too_much',
      headline: 'Try shorter stretches next week?',
      reason,
      changeLabel: `Stretches: ${stretchDurStep.fromShort} → ${stretchDurStep.toShort}`,
      targetActivity: 'stretch',
      targetField: 'durationLabel',
      previousValue,
      nextValue: stretchDurStep.next,
    };
  }

  if (
    targetWeekBaseSchedule.stretch.targetCount !== null &&
    targetWeekBaseSchedule.stretch.targetCount > 1
  ) {
    const previousValue = targetWeekBaseSchedule.stretch.targetCount;
    const nextCount = previousValue - 1;
    const id = `${resolutionKey}::stretch.targetCount::${previousValue}->${nextCount}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      feedbackWeekStartKey,
      targetWeekStartKey,
      targetWeekRangeLabel,
      trigger: 'weekly_review_too_much',
      headline: 'Try fewer stretches next week?',
      reason,
      changeLabel: `Stretches: ${previousValue} → ${nextCount} / week`,
      targetActivity: 'stretch',
      targetField: 'targetCount',
      previousValue,
      nextValue: nextCount,
    };
  }

  return null;
}

/**
 * Applies ONLY the single explicitly displayed field from a WeeklyAdjustmentProposal.
 * Leaves all other schedule fields, other weeks, and active Today tasks untouched.
 */
export function applyWeeklyAdjustmentProposal(
  schedule: WeeklySchedule,
  proposal: WeeklyAdjustmentProposal
): WeeklySchedule {
  return setWeeklyScheduleFieldValue(
    schedule,
    proposal.targetActivity,
    proposal.targetField,
    proposal.nextValue
  );
}

/**
 * Explicit data contract for a future Today suggestion engine to read the latest
 * current-week schedule and user-confirmed preferences.
 * Note: `linkedToTodaySuggestions` is explicitly false until the suggestion engine is wired.
 */
export interface SuggestionEnginePlanConfig {
  weekStartKey: string;
  weeklySchedule: WeeklySchedule | null;
  weeklySchedulesByWeek: WeeklySchedulesByWeek;
  confirmedPreferenceTags: string[];
  linkedToTodaySuggestions: false;
}

export function getPlanConfigForSuggestions(
  confirmedPreferenceTags: string[] = [],
  referenceDate: Date = new Date()
): SuggestionEnginePlanConfig {
  const weekStartKey = getLocalWeekBounds(referenceDate).weekStartKey;
  const weeklySchedulesByWeek = loadWeeklySchedulesByWeek(referenceDate);
  return {
    weekStartKey,
    weeklySchedule: weeklySchedulesByWeek[weekStartKey] ?? null,
    weeklySchedulesByWeek,
    confirmedPreferenceTags,
    linkedToTodaySuggestions: false,
  };
}
