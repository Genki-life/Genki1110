export type ActivityCategory = 'walk' | 'stretch' | 'rest' | 'other';

export interface ActivityCompletionRecord {
  id: string;
  sourceKey: string;
  cardId: string;
  planId: string;
  title: string;
  category: ActivityCategory;
  durationMinutes: number;
  completedAt: string;
  dateKey: string;
  hasExactTimestamp?: boolean;
  isSample?: boolean;
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

  return {
    walk: normalizeItem(obj.walk as Record<string, unknown>, DEFAULT_WEEKLY_DRAFT.walk.durationLabel),
    stretch: normalizeItem(
      obj.stretch as Record<string, unknown>,
      DEFAULT_WEEKLY_DRAFT.stretch.durationLabel
    ),
    restNote: 'As needed',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
  };
}

export function loadWeeklySchedule(): WeeklySchedule | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(WEEKLY_SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeWeeklySchedule(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWeeklySchedule(schedule: WeeklySchedule): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(WEEKLY_SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function normalizeCompletionRecord(raw: unknown): ActivityCompletionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.isSample === true) return null;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const planId = typeof obj.planId === 'string' ? obj.planId.trim() : '';
  const cardId = typeof obj.cardId === 'string' ? obj.cardId.trim() : '';
  if (!title && !planId) return null;

  // Compatibility: derive local dateKey from completedAt or vice versa, without inventing historical dates
  let completedAt = typeof obj.completedAt === 'string' ? obj.completedAt.trim() : '';
  let dateKey = typeof obj.dateKey === 'string' ? obj.dateKey.trim() : '';
  let hasExactTimestamp = obj.hasExactTimestamp !== false;

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
    const localDt = parseLocalDateKey(dateKey)!;
    completedAt = new Date(
      localDt.getFullYear(),
      localDt.getMonth(),
      localDt.getDate(),
      12,
      0,
      0
    ).toISOString();
    hasExactTimestamp = false;
  }

  // Never fabricate a historical date if neither completedAt nor valid dateKey exists
  if (!completedAt || !parseLocalDateKey(dateKey)) {
    return null;
  }

  const rawCat = obj.category;
  const category: ActivityCategory =
    rawCat === 'walk' || rawCat === 'stretch' || rawCat === 'rest' || rawCat === 'other'
      ? rawCat
      : inferActivityCategory(planId, title);

  const durationMinutes =
    typeof obj.durationMinutes === 'number' && Number.isFinite(obj.durationMinutes) && obj.durationMinutes > 0
      ? Math.round(obj.durationMinutes)
      : inferDurationMinutes(title);

  const sourceKey =
    typeof obj.sourceKey === 'string' && obj.sourceKey.trim()
      ? obj.sourceKey.trim()
      : `${dateKey}::${cardId || planId || title}`;

  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : sourceKey;

  return {
    id,
    sourceKey,
    cardId: cardId || 'legacy',
    planId: planId || category,
    title: title || (category === 'walk' ? 'Walk' : category === 'stretch' ? 'Stretch' : 'Activity'),
    category,
    durationMinutes,
    completedAt,
    dateKey,
    hasExactTimestamp,
    isSample: false,
  };
}

export function loadCompletionRecords(): ActivityCompletionRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(COMPLETIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const normalized: ActivityCompletionRecord[] = [];
    for (const item of parsed) {
      const record = normalizeCompletionRecord(item);
      if (!record) continue;
      if (seen.has(record.sourceKey)) continue;
      seen.add(record.sourceKey);
      normalized.push(record);
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveCompletionRecords(records: ActivityCompletionRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function upsertCompletionRecordList(
  records: ActivityCompletionRecord[],
  next: ActivityCompletionRecord
): ActivityCompletionRecord[] {
  const filtered = records.filter((r) => r.sourceKey !== next.sourceKey);
  return [...filtered, next];
}

export function removeCompletionRecordBySourceKey(
  records: ActivityCompletionRecord[],
  sourceKey: string
): ActivityCompletionRecord[] {
  return records.filter((r) => r.sourceKey !== sourceKey);
}

// ============================================================================
// INTENTIONAL USER REST DAYS (Separate from exercise completions & skips)
// ============================================================================

export function loadRestDayKeys(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(REST_DAYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const key = item.trim();
      if (!parseLocalDateKey(key) || seen.has(key)) continue;
      seen.add(key);
      valid.push(key);
    }
    return valid;
  } catch {
    return [];
  }
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
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(WEEKLY_REVIEWS_STORAGE_KEY, JSON.stringify(feedbacks));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

export function buildWeeklyReviewSummary(
  records: ActivityCompletionRecord[]
): string {
  const realRecords = records.filter(
    (r) => r.isSample !== true && r.category !== 'rest'
  );
  if (realRecords.length === 0) {
    return 'No activity recorded last week.';
  }

  let walks = 0;
  let stretches = 0;
  let others = 0;

  for (const r of realRecords) {
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
  const timed = items.filter((r) => r.hasExactTimestamp !== false);
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
  const realRecords = records.filter(
    (r) => r.isSample !== true && r.category !== 'rest'
  );

  const walks = realRecords.filter((r) => r.category === 'walk');
  const stretches = realRecords.filter((r) => r.category === 'stretch');

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

  if (realRecords.length >= 2) {
    const allWindow = getUniformWindow(realRecords);
    if (allWindow) {
      const prefix =
        realRecords.length === 2
          ? 'Both sessions were'
          : `All ${realRecords.length} sessions were`;
      return `${prefix} ${allWindow}.`;
    }
  }

  if (restDayCount > 0) {
    if (realRecords.length === 0) {
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
  weekStartKey: string;
  trigger: 'weekly_review_too_much';
  headline: string;
  reason: string;
  changeLabel: string;
  targetActivity: 'walk' | 'stretch';
  targetField: 'durationLabel' | 'targetCount';
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
 * Generates at most ONE verifiable adjustment proposal.
 * Priority trigger: user explicitly chose "Too much" in Weekly review AND has an adjustable weekly schedule.
 * Never triggers on skipped tasks, rest days, or missing records alone.
 */
export function buildWeeklyAdjustmentProposal(
  weeklySchedule: WeeklySchedule | null,
  feedback: WeeklyReviewFeedback | null,
  resolvedKeys: string[]
): WeeklyAdjustmentProposal | null {
  if (!weeklySchedule || !feedback || feedback.feeling !== 'too_much') {
    return null;
  }

  const weekStartKey = feedback.weekStartKey;
  const resolutionKey = `weekly_review_too_much::${weekStartKey}`;
  if (resolvedKeys.includes(resolutionKey)) {
    return null;
  }

  const reason = 'You said last week felt like too much.';

  const walkDurStep = WALK_DURATION_STEP_DOWN[weeklySchedule.walk.durationLabel.trim()];
  if (walkDurStep) {
    const id = `${resolutionKey}::walk.durationLabel::${weeklySchedule.walk.durationLabel}->${walkDurStep.next}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      weekStartKey,
      trigger: 'weekly_review_too_much',
      headline: 'Try shorter walks?',
      reason,
      changeLabel: `Walks: ${walkDurStep.fromShort} → ${walkDurStep.toShort}`,
      targetActivity: 'walk',
      targetField: 'durationLabel',
      nextValue: walkDurStep.next,
    };
  }

  if (weeklySchedule.walk.targetCount !== null && weeklySchedule.walk.targetCount > 1) {
    const nextCount = weeklySchedule.walk.targetCount - 1;
    const id = `${resolutionKey}::walk.targetCount::${weeklySchedule.walk.targetCount}->${nextCount}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      weekStartKey,
      trigger: 'weekly_review_too_much',
      headline: 'Try fewer walks next week?',
      reason,
      changeLabel: `Walks: ${weeklySchedule.walk.targetCount} → ${nextCount} / week`,
      targetActivity: 'walk',
      targetField: 'targetCount',
      nextValue: nextCount,
    };
  }

  const stretchDurStep = STRETCH_DURATION_STEP_DOWN[weeklySchedule.stretch.durationLabel.trim()];
  if (stretchDurStep) {
    const id = `${resolutionKey}::stretch.durationLabel::${weeklySchedule.stretch.durationLabel}->${stretchDurStep.next}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      weekStartKey,
      trigger: 'weekly_review_too_much',
      headline: 'Try shorter stretches?',
      reason,
      changeLabel: `Stretches: ${stretchDurStep.fromShort} → ${stretchDurStep.toShort}`,
      targetActivity: 'stretch',
      targetField: 'durationLabel',
      nextValue: stretchDurStep.next,
    };
  }

  if (weeklySchedule.stretch.targetCount !== null && weeklySchedule.stretch.targetCount > 1) {
    const nextCount = weeklySchedule.stretch.targetCount - 1;
    const id = `${resolutionKey}::stretch.targetCount::${weeklySchedule.stretch.targetCount}->${nextCount}`;
    if (resolvedKeys.includes(id)) return null;
    return {
      id,
      resolutionKey,
      weekStartKey,
      trigger: 'weekly_review_too_much',
      headline: 'Try fewer stretches next week?',
      reason,
      changeLabel: `Stretches: ${weeklySchedule.stretch.targetCount} → ${nextCount} / week`,
      targetActivity: 'stretch',
      targetField: 'targetCount',
      nextValue: nextCount,
    };
  }

  return null;
}

/**
 * Applies ONLY the single explicitly displayed field from a WeeklyAdjustmentProposal.
 * Leaves all other schedule fields and active Today tasks untouched.
 */
export function applyWeeklyAdjustmentProposal(
  schedule: WeeklySchedule,
  proposal: WeeklyAdjustmentProposal
): WeeklySchedule {
  const updatedAt = new Date().toISOString();
  if (proposal.targetActivity === 'walk') {
    return {
      ...schedule,
      walk:
        proposal.targetField === 'durationLabel'
          ? { ...schedule.walk, durationLabel: String(proposal.nextValue) }
          : { ...schedule.walk, targetCount: Number(proposal.nextValue) },
      updatedAt,
    };
  }
  return {
    ...schedule,
    stretch:
      proposal.targetField === 'durationLabel'
        ? { ...schedule.stretch, durationLabel: String(proposal.nextValue) }
        : { ...schedule.stretch, targetCount: Number(proposal.nextValue) },
    updatedAt,
  };
}

/**
 * Explicit data contract for a future Today suggestion engine to read the latest
 * weekly schedule and user-confirmed preferences.
 * Note: `linkedToTodaySuggestions` is explicitly false until the suggestion engine is wired.
 */
export interface SuggestionEnginePlanConfig {
  weeklySchedule: WeeklySchedule | null;
  confirmedPreferenceTags: string[];
  linkedToTodaySuggestions: false;
}

export function getPlanConfigForSuggestions(
  confirmedPreferenceTags: string[] = []
): SuggestionEnginePlanConfig {
  return {
    weeklySchedule: loadWeeklySchedule(),
    confirmedPreferenceTags,
    linkedToTodaySuggestions: false,
  };
}
