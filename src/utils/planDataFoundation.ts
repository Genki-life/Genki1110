import {
  ACTIVITIES_STORAGE_KEY,
  ActivityCategory,
  ActivityCompletionRecord,
  COMPLETIONS_STORAGE_KEY,
  REST_DAYS_STORAGE_KEY,
  REST_RECORDS_STORAGE_KEY,
  RestRecord,
  WEEKLY_REVIEWS_STORAGE_KEY,
  WeeklyReviewFeedback,
  WeeklyReviewFeeling,
  addLocalDays,
  buildDateOnlyIso,
  getLocalWeekBounds,
  inferActivityCategory,
  isDateKeyInWeek,
  parseLocalDateKey,
  toLocalDateKey,
} from './weeklyPlanStore';
import { PLAN_PATH_STORAGE_KEY } from './planPhaseStore';
import { FOCUS_STORAGE_KEY, LEGACY_DIRECTION_STORAGE_KEYS } from './prototypeDemoSeed';

// ============================================================================
// SCHEMA VERSION & STORAGE KEYS
// ============================================================================

export const PLAN_FOUNDATION_SCHEMA_VERSION = 2 as const;
export const PLAN_FOUNDATION_STORAGE_KEY = 'genki.plan.foundation.v2';
export const DEFAULT_WEEKLY_REVIEW_QUESTION_ID = 'weekly_pace_feeling';

const LEGACY_ACTIVITY_LOGS_STORAGE_KEYS = [
  'genki.plan.activityLogs.v1',
  'genki.plan.historyLogs.v1',
];

const DEMO_HISTORY_NOTE_MARKERS = new Set([
  'Afternoon stroll',
  'Evening unwind',
  'Restorative recovery day',
]);

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

// ============================================================================
// 1. USER PHASE COMMITMENT (阶段约定)
// ============================================================================

export type PhaseCommitmentStatus = 'active' | 'paused' | 'completed' | 'draft';
export type PhaseCommitmentEventKind = 'started' | 'adjusted' | 'kept';

export interface ConfirmedActionStrategy {
  habitId: string;
  label: string;
  regularAction: string;
  minimumAction?: string;
  /** Descriptive cadence/frequency explaining strategy; NEVER a scoring target */
  frequencyDescription: string;
  /** Guard flag affirming frequency is descriptive only, never used for grading */
  frequencyIsDescriptiveOnly: true;
  version: string;
  confirmedAt: string;
}

export interface PhaseCommitmentRecord {
  id: string;
  version: number;
  phaseId: string;
  phaseName: string;
  /** Original user-stated intent; null if not yet captured */
  originalIntent: string | null;
  summary: string;
  /** User-confirmed mid-term movement strategy text; null if not explicitly provided */
  strategySummary?: string | null;
  strategies: ConfirmedActionStrategy[];
  status: PhaseCommitmentStatus;
  /** Last real saved commitment/rhythm event driving Nova's Plan header line */
  lastEventKind?: PhaseCommitmentEventKind;
  /** True ONLY when a real user goal review is pending; never auto-set from dates or counts */
  reviewRequested?: boolean;
  createdAt: string;
  updatedAt: string;
  source: 'user' | 'migrated_legacy';
}

// ============================================================================
// 2. TASK CARD COMPLETION RECORDS (任务卡完成记录)
// ============================================================================

export type ActionTier = 'minimum' | 'regular';
export type DurationTrust = 'measured' | 'user_reported_actual' | 'unknown';

export type ExerciseType =
  | 'walk'
  | 'stretch'
  | 'mobility'
  | 'breathing'
  | 'strength'
  | 'cardio'
  | 'other';

export type WorkoutLocationContext = 'indoor' | 'outdoor' | 'unknown';

export interface TaskExerciseSegment {
  exerciseType: ExerciseType;
  /** Optional HealthKit HKWorkoutActivityType identifier or raw historical workout type */
  workoutActivityType?: string;
  /** Optional original raw type label preserved verbatim when unknown/unmapped */
  rawTypeLabel?: string;
  /** Optional indoor/outdoor metadata; context only, never splits main workout type */
  locationContext?: WorkoutLocationContext;
  title: string;
  plannedDurationMinutes?: number | null;
  /** Trustworthy actual duration for THIS specific segment only; NEVER evenly split */
  actualDurationMinutes?: number | null;
  durationTrust?: DurationTrust;
  /** Explicit habitId only; NEVER guessed from title keywords */
  linkedHabitId?: string | null;
}

export interface TaskCompletionRecord {
  id: string;
  /** Stable logical task card identity preserved across retries, refreshes, and Plan B replacements */
  logicalTaskId: string;
  dateKey: string; // Local YYYY-MM-DD
  completedAt: string; // ISO timestamp
  hasExactTimestamp: boolean;
  status: 'done' | 'undone';
  undoneAt?: string;
  cardId?: string;
  planId: string;
  originalPlanId: string;
  replacedFromPlanIds: string[];
  title: string;
  /** Single or multiple exercises within one logical task card; card still counts as 1 Done task */
  exerciseSegments: TaskExerciseSegment[];
  /** Explicit habit IDs only; historical cards without explicit linkage remain [] */
  linkedHabitIds: string[];
  actionTier?: ActionTier;
  actionVersion?: string;
  source: 'today';
  note?: string;
}

// ============================================================================
// 3. ACTUAL EXERCISE RECORDS (实际运动记录)
// ============================================================================

export type ExerciseSessionSource = 'today_task' | 'manual' | 'external_import';

export interface ExerciseSessionRecord {
  id: string;
  exerciseType: ExerciseType;
  /** Optional HealthKit HKWorkoutActivityType identifier or raw historical workout type */
  workoutActivityType?: string;
  /** Optional original raw type label preserved verbatim when unknown/unmapped */
  rawTypeLabel?: string;
  /** Optional indoor/outdoor metadata; context only, never splits main workout type */
  locationContext?: WorkoutLocationContext;
  dateKey: string; // Local YYYY-MM-DD
  occurredAt: string; // ISO timestamp
  hasExactTimestamp: boolean;
  /** Trustworthy actual duration ONLY; null when unknown/unmeasured (planned duration NEVER copied here) */
  actualDurationMinutes: number | null;
  durationTrust: DurationTrust;
  /** Planned duration kept strictly separate; never summed into trustworthy actual duration */
  plannedDurationMinutes: number | null;
  source: ExerciseSessionSource;
  sourceTaskCompletionId?: string;
  sourceLogicalTaskId?: string;
  segmentIndex?: number;
  /** Explicit habitId only; NEVER guessed from title keywords */
  linkedHabitId?: string | null;
  actionTier?: ActionTier;
  actionVersion?: string;
  title: string;
  note?: string;
}

// ============================================================================
// 4. HABIT PRACTICE RECORDS (习惯实践记录)
// ============================================================================

export type HabitPracticeSourceType =
  | 'task_completion'
  | 'exercise_session'
  | 'manual_habit_log';

export interface HabitPracticeRecord {
  id: string;
  habitId: string;
  dateKey: string; // Local YYYY-MM-DD
  occurredAt: string; // ISO timestamp
  sourceType: HabitPracticeSourceType;
  /** Exact ID of the originating source record for per-source undo/deletion */
  sourceRecordId: string;
  sourceLogicalTaskId?: string;
  /** Both 'minimum' and 'regular' count equally as valid practice */
  actionTier: ActionTier;
  actionVersion: string;
  /** Informational only; longer duration NEVER increases practice days */
  actualDurationMinutes?: number | null;
}

// ============================================================================
// 5. EXPLICIT LIFECYCLE EVENTS (明确事件)
// ============================================================================

export type PlanLifecycleEventType =
  | 'rest'
  | 'pause'
  | 'resume'
  | 'strategy_adjustment';

export interface PlanLifecycleEvent {
  id: string;
  type: PlanLifecycleEventType;
  dateKey: string; // Local YYYY-MM-DD
  occurredAt: string; // ISO timestamp
  source: 'today' | 'plan' | 'chat' | 'migration';
  /** Optional habitId scope; omitted applies to active commitment globally */
  habitId?: string;
  title?: string;
  note?: string;
  commitmentVersion?: number | null;
  relatedWeekStartKey?: string;
  legacyRestRecordId?: string;
  payload?: Record<string, unknown>;
}

export type HabitStartFrictionLevel = 'hard_to_start' | 'manageable' | 'easier';

export const DEFAULT_HABIT_EASE_QUESTION_ID = 'starting_ease';

export interface HabitSelfReportCheckIn {
  id: string;
  habitId: string;
  /** Strategy version at check-in time; editing action config bumps version so old feedback stays historical */
  habitVersion: string;
  /** Comparable action configuration fingerprint; prevents comparing feedback across changed configs */
  configFingerprint: string;
  /** Exact question ID; only identical questionIds are comparable */
  questionId: string;
  frictionLevel?: HabitStartFrictionLevel;
  requestedAdjustment?: boolean;
  /** Marks completion of a post-resume return review */
  isReturnReview?: boolean;
  relatedResumeEventId?: string;
  dateKey: string; // Local YYYY-MM-DD
  recordedAt: string; // ISO timestamp
}

// ============================================================================
// 6. WEEKLY REVIEWS (周回顾)
// ============================================================================

export interface WeeklyReviewSuggestion {
  id: string;
  summary: string;
  targetWeekStartKey: string;
  changeType: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'accepted' | 'dismissed';
}

export interface WeeklyReviewDecision {
  id: string;
  suggestionId?: string;
  decision: 'accepted' | 'dismissed' | 'custom';
  summary: string;
  decidedAt: string;
  targetWeekStartKey?: string;
  payload?: Record<string, unknown>;
}

export interface WeeklyReviewRecord {
  /** Composite key: `${weekStartKey}::${questionId}` */
  id: string;
  weekStartKey: string; // Local Monday YYYY-MM-DD
  questionId: string;
  commitmentVersion: number | null;
  habitVersion: string | null;
  rawAnswer: string;
  feeling?: WeeklyReviewFeeling;
  savedAt: string; // Original save timestamp
  updatedAt: string; // Latest edit timestamp
  pendingSuggestions: WeeklyReviewSuggestion[];
  confirmedDecisions: WeeklyReviewDecision[];
}

// ============================================================================
// 7. DATA COVERAGE METADATA (数据覆盖)
// ============================================================================

export interface CoverageDateRange {
  startDateKey: string;
  endDateKey: string;
  reason: string;
}

export interface FailedLoadRange {
  startDateKey: string | null;
  endDateKey: string | null;
  storageKey?: string;
  errorMessage: string;
  occurredAt: string;
}

export interface DataCoverageMetadata {
  /** Only confirmable tracking start date; NEVER inferred from earliest Done record */
  trackingStartDateKey: string | null;
  trackingStartSource: 'commitment_created' | 'first_confirmed_setup' | 'unknown';
  unknownRanges: CoverageDateRange[];
  failedLoadRanges: FailedLoadRange[];
}

// ============================================================================
// FOUNDATION STORE ROOT
// ============================================================================

export interface MigrationAuditEntry {
  fromVersion: number;
  toVersion: number;
  migratedAt: string;
  importedSources: string[];
  skippedDemoCount: number;
}

export interface PlanFoundationStore {
  schemaVersion: typeof PLAN_FOUNDATION_SCHEMA_VERSION;
  /** Official user store is always false; isolated dev/test fixtures must set true */
  isTestFixture: boolean;
  fixtureLabel?: string;
  migratedAt: string | null;
  migrationHistory: MigrationAuditEntry[];
  commitment: PhaseCommitmentRecord | null;
  taskCompletions: TaskCompletionRecord[];
  exerciseSessions: ExerciseSessionRecord[];
  habitPractices: HabitPracticeRecord[];
  /** Optional explicit user self-report check-ins for habits (version- and config-scoped) */
  habitCheckIns?: HabitSelfReportCheckIn[];
  lifecycleEvents: PlanLifecycleEvent[];
  weeklyReviews: Record<string, WeeklyReviewRecord>;
  coverage: DataCoverageMetadata;
}

// ============================================================================
// HELPERS & NORMALIZATION
// ============================================================================

export function createEmptyPlanFoundationStore(): PlanFoundationStore {
  return {
    schemaVersion: PLAN_FOUNDATION_SCHEMA_VERSION,
    isTestFixture: false,
    migratedAt: null,
    migrationHistory: [],
    commitment: null,
    taskCompletions: [],
    exerciseSessions: [],
    habitPractices: [],
    habitCheckIns: [],
    lifecycleEvents: [],
    weeklyReviews: {},
    coverage: {
      trackingStartDateKey: null,
      trackingStartSource: 'unknown',
      unknownRanges: [],
      failedLoadRanges: [],
    },
  };
}

export function makeWeeklyReviewKey(weekStartKey: string, questionId: string): string {
  return `${weekStartKey}::${questionId.trim()}`;
}

export function mapActivityCategoryToExerciseType(
  category: ActivityCategory | string | undefined,
  planId?: string
): ExerciseType {
  if (category === 'walk') return 'walk';
  if (category === 'stretch') {
    if (planId === 'mobility') return 'mobility';
    return 'stretch';
  }
  if (planId === 'breath' || planId === 'breathing') return 'breathing';
  if (planId === 'mobility') return 'mobility';
  if (
    category === 'mobility' ||
    category === 'breathing' ||
    category === 'strength' ||
    category === 'cardio'
  ) {
    return category;
  }
  return 'other';
}

export function mapExerciseTypeToLegacyCategory(
  exerciseType: ExerciseType
): Exclude<ActivityCategory, 'rest'> {
  if (exerciseType === 'walk') return 'walk';
  if (exerciseType === 'stretch' || exerciseType === 'mobility') return 'stretch';
  return 'other';
}

function isValidLocalDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseLocalDateKey(value.trim()) !== null;
}

function normalizePositiveMinutes(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function normalizeTrustworthyDuration(
  actualMinutes: unknown,
  trust: unknown
): { actualDurationMinutes: number | null; durationTrust: DurationTrust } {
  const cleanMinutes = normalizePositiveMinutes(actualMinutes);
  if (
    cleanMinutes !== null &&
    (trust === 'measured' || trust === 'user_reported_actual')
  ) {
    return { actualDurationMinutes: cleanMinutes, durationTrust: trust };
  }
  return { actualDurationMinutes: null, durationTrust: 'unknown' };
}

function createUniqueId(prefix: string, dateKey: string): string {
  return `${prefix}::${dateKey}::${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeHabitPracticeId(
  sourceType: HabitPracticeSourceType,
  sourceRecordId: string,
  habitId: string
): string {
  return `hp::${sourceType}::${sourceRecordId}::${habitId}`;
}

function makeTaskSegmentSessionId(taskCompletionId: string, segmentIndex: number): string {
  return `es::task::${taskCompletionId}::seg-${segmentIndex}`;
}

function resolveWeekBoundsFromRef(weekRef: Date | string) {
  if (typeof weekRef === 'string') {
    const parsed = parseLocalDateKey(weekRef);
    if (parsed) return getLocalWeekBounds(parsed);
  }
  if (weekRef instanceof Date) {
    return getLocalWeekBounds(weekRef);
  }
  return getLocalWeekBounds(new Date());
}

function normalizeExistingStore(raw: unknown): PlanFoundationStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== PLAN_FOUNDATION_SCHEMA_VERSION) return null;

  const base = createEmptyPlanFoundationStore();
  base.isTestFixture = obj.isTestFixture === true;
  if (typeof obj.fixtureLabel === 'string' && obj.fixtureLabel.trim()) {
    base.fixtureLabel = obj.fixtureLabel.trim();
  }
  base.migratedAt = typeof obj.migratedAt === 'string' ? obj.migratedAt : null;
  base.migrationHistory = Array.isArray(obj.migrationHistory)
    ? (obj.migrationHistory as MigrationAuditEntry[])
    : [];
  base.commitment =
    obj.commitment && typeof obj.commitment === 'object'
      ? (obj.commitment as PhaseCommitmentRecord)
      : null;
  base.taskCompletions = Array.isArray(obj.taskCompletions)
    ? (obj.taskCompletions as TaskCompletionRecord[]).filter(
        (r) => r && typeof r.logicalTaskId === 'string' && isValidLocalDateKey(r.dateKey)
      )
    : [];
  base.exerciseSessions = Array.isArray(obj.exerciseSessions)
    ? (obj.exerciseSessions as ExerciseSessionRecord[]).filter(
        (r) => r && typeof r.id === 'string' && isValidLocalDateKey(r.dateKey)
      )
    : [];
  base.habitPractices = Array.isArray(obj.habitPractices)
    ? (obj.habitPractices as HabitPracticeRecord[]).filter(
        (r) =>
          r &&
          typeof r.habitId === 'string' &&
          r.habitId.trim().length > 0 &&
          typeof r.sourceRecordId === 'string' &&
          isValidLocalDateKey(r.dateKey)
      )
    : [];
  base.habitCheckIns = Array.isArray(obj.habitCheckIns)
    ? (obj.habitCheckIns as HabitSelfReportCheckIn[]).filter(
        (c) =>
          c &&
          typeof c.id === 'string' &&
          typeof c.habitId === 'string' &&
          c.habitId.trim().length > 0 &&
          typeof c.habitVersion === 'string' &&
          typeof c.questionId === 'string' &&
          isValidLocalDateKey(c.dateKey)
      )
    : [];
  base.lifecycleEvents = Array.isArray(obj.lifecycleEvents)
    ? (obj.lifecycleEvents as PlanLifecycleEvent[]).filter(
        (r) => r && typeof r.id === 'string' && isValidLocalDateKey(r.dateKey)
      )
    : [];

  if (obj.weeklyReviews && typeof obj.weeklyReviews === 'object' && !Array.isArray(obj.weeklyReviews)) {
    const reviews: Record<string, WeeklyReviewRecord> = {};
    for (const [key, val] of Object.entries(obj.weeklyReviews as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const r = val as WeeklyReviewRecord;
      if (isValidLocalDateKey(r.weekStartKey) && typeof r.questionId === 'string' && r.questionId.trim()) {
        const canonicalKey = makeWeeklyReviewKey(r.weekStartKey, r.questionId);
        reviews[canonicalKey] = { ...r, id: canonicalKey };
      } else if (key && r && typeof r === 'object') {
        continue;
      }
    }
    base.weeklyReviews = reviews;
  }

  if (obj.coverage && typeof obj.coverage === 'object') {
    const cov = obj.coverage as Partial<DataCoverageMetadata>;
    base.coverage = {
      trackingStartDateKey: isValidLocalDateKey(cov.trackingStartDateKey)
        ? cov.trackingStartDateKey
        : null,
      trackingStartSource:
        cov.trackingStartSource === 'commitment_created' ||
        cov.trackingStartSource === 'first_confirmed_setup'
          ? cov.trackingStartSource
          : 'unknown',
      unknownRanges: Array.isArray(cov.unknownRanges) ? cov.unknownRanges : [],
      failedLoadRanges: Array.isArray(cov.failedLoadRanges) ? cov.failedLoadRanges : [],
    };
  }

  return base;
}

// ============================================================================
// VERSIONED, IDEMPOTENT, LOSSLESS LEGACY MIGRATION
// ============================================================================

function parseJsonSafe(
  storage: StorageLike,
  key: string,
  failedLoadRanges: FailedLoadRange[]
): unknown | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    failedLoadRanges.push({
      startDateKey: null,
      endDateKey: null,
      storageKey: key,
      errorMessage: err instanceof Error ? err.message : 'Invalid JSON in storage',
      occurredAt: new Date().toISOString(),
    });
    return null;
  }
}

function isDemoObject(obj: Record<string, unknown>): boolean {
  return obj.source === 'demo' || obj.isSample === true;
}

/**
 * Repeatable, idempotent, lossless migration from v1 legacy storage keys into
 * the v2 PlanFoundationStore.
 *
 * Strict guarantees:
 * - Never promotes demo/sample rows into official user data.
 * - Never infers habitId from title keywords on historical records.
 * - Never copies planned duration from legacy Today tasks into trustworthy actualDurationMinutes.
 * - Never inserts manual/external exercise records into taskCompletions (Done count).
 * - Never infers coverage.trackingStartDateKey from the earliest Done record.
 * - Running migration N times produces identical deduplicated state.
 */
export function migrateLegacyStorageToFoundation(
  existingStore: PlanFoundationStore | null,
  storage: StorageLike,
  now: Date = new Date()
): { store: PlanFoundationStore; changed: boolean; importedSources: string[]; skippedDemoCount: number } {
  const store: PlanFoundationStore = existingStore
    ? {
        ...existingStore,
        migrationHistory: [...existingStore.migrationHistory],
        taskCompletions: [...existingStore.taskCompletions],
        exerciseSessions: [...existingStore.exerciseSessions],
        habitPractices: [...existingStore.habitPractices],
        habitCheckIns: [...(existingStore.habitCheckIns ?? [])],
        lifecycleEvents: [...existingStore.lifecycleEvents],
        weeklyReviews: { ...existingStore.weeklyReviews },
        coverage: {
          ...existingStore.coverage,
          unknownRanges: [...existingStore.coverage.unknownRanges],
          failedLoadRanges: [...existingStore.coverage.failedLoadRanges],
        },
      }
    : createEmptyPlanFoundationStore();

  let changed = !existingStore;
  const importedSources = new Set<string>();
  let skippedDemoCount = 0;

  const existingTaskLogicalIds = new Set(store.taskCompletions.map((t) => t.logicalTaskId));
  const existingTaskIds = new Set(store.taskCompletions.map((t) => t.id));
  const existingSessionIds = new Set(store.exerciseSessions.map((s) => s.id));
  const existingEventIds = new Set(store.lifecycleEvents.map((e) => e.id));
  const existingRestDates = new Set(
    store.lifecycleEvents.filter((e) => e.type === 'rest').map((e) => e.dateKey)
  );
  const existingLegacyRestIds = new Set(
    store.lifecycleEvents
      .map((e) => e.legacyRestRecordId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const importLegacyActivityObject = (
    raw: unknown,
    sourceKeyName: string,
    fallbackSource: 'today' | 'manual'
  ) => {
    if (!raw || typeof raw !== 'object') return;
    const obj = raw as Record<string, unknown>;
    if (isDemoObject(obj)) {
      skippedDemoCount += 1;
      return;
    }

    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const planId = typeof obj.planId === 'string' ? obj.planId.trim() : '';
    const rawCat = obj.category;
    const category: ActivityCategory =
      rawCat === 'walk' || rawCat === 'stretch' || rawCat === 'rest' || rawCat === 'other'
        ? rawCat
        : inferActivityCategory(planId, title);

    if (category === 'rest') return;

    const completedAtRaw = typeof obj.completedAt === 'string' ? obj.completedAt.trim() : '';
    let dateKey = '';
    if (isValidLocalDateKey(obj.dateKey)) {
      dateKey = obj.dateKey.trim();
    } else if (isValidLocalDateKey(obj.date)) {
      dateKey = obj.date.trim();
    } else if (completedAtRaw) {
      const dt = new Date(completedAtRaw);
      if (!Number.isNaN(dt.getTime())) {
        dateKey = toLocalDateKey(dt);
      }
    }
    if (!dateKey) return;

    const completedAt =
      completedAtRaw && !Number.isNaN(new Date(completedAtRaw).getTime())
        ? completedAtRaw
        : buildDateOnlyIso(dateKey);
    const hasExactTimestamp =
      typeof obj.hasExactTimestamp === 'boolean'
        ? obj.hasExactTimestamp
        : Boolean(completedAtRaw && !completedAtRaw.includes('T12:00:00.000Z'));

    const explicitSource =
      obj.source === 'today' || obj.source === 'manual' ? obj.source : fallbackSource;
    const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;
    const cardId = typeof obj.cardId === 'string' && obj.cardId.trim() ? obj.cardId.trim() : undefined;
    const rawId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '';
    const rawSourceKey =
      typeof obj.sourceKey === 'string' && obj.sourceKey.trim() ? obj.sourceKey.trim() : '';

    const exerciseType = mapActivityCategoryToExerciseType(category, planId);
    const rawDuration = normalizePositiveMinutes(obj.durationMinutes);
    const displayTitle = title || (exerciseType === 'walk' ? 'Walk' : exerciseType === 'stretch' ? 'Stretch' : 'Activity');

    if (explicitSource === 'today') {
      const logicalTaskId =
        rawSourceKey ||
        (cardId ? `today-task::${dateKey}::${cardId}` : rawId || `legacy-task::${dateKey}::${planId || displayTitle}`);
      const taskId = rawId || logicalTaskId;

      if (existingTaskLogicalIds.has(logicalTaskId) || existingTaskIds.has(taskId)) {
        return;
      }

      // Legacy Today tasks only stored planned durationMinutes, NOT measured actual duration.
      // Never masquerade planned duration as trustworthy actual duration.
      const taskRecord: TaskCompletionRecord = {
        id: taskId,
        logicalTaskId,
        dateKey,
        completedAt,
        hasExactTimestamp,
        status: 'done',
        ...(cardId ? { cardId } : {}),
        planId: planId || exerciseType,
        originalPlanId: planId || exerciseType,
        replacedFromPlanIds: [],
        title: displayTitle,
        exerciseSegments: [
          {
            exerciseType,
            title: displayTitle,
            plannedDurationMinutes: rawDuration,
            actualDurationMinutes: null,
            durationTrust: 'unknown',
            linkedHabitId: null,
          },
        ],
        // Strictly empty: historical cards without explicit habitId MUST NOT be keyword-matched
        linkedHabitIds: [],
        source: 'today',
        ...(note ? { note } : {}),
      };

      store.taskCompletions.push(taskRecord);
      existingTaskLogicalIds.add(logicalTaskId);
      existingTaskIds.add(taskId);

      const sessionId = makeTaskSegmentSessionId(taskId, 0);
      if (!existingSessionIds.has(sessionId)) {
        store.exerciseSessions.push({
          id: sessionId,
          exerciseType,
          dateKey,
          occurredAt: completedAt,
          hasExactTimestamp,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
          plannedDurationMinutes: rawDuration,
          source: 'today_task',
          sourceTaskCompletionId: taskId,
          sourceLogicalTaskId: logicalTaskId,
          segmentIndex: 0,
          linkedHabitId: null,
          title: displayTitle,
          ...(note ? { note } : {}),
        });
        existingSessionIds.add(sessionId);
      }

      importedSources.add(sourceKeyName);
      changed = true;
    } else {
      // Manual exercise logs NEVER create or increment TaskCompletionRecord (Done task count)
      const sessionId =
        rawId || `legacy-manual::${dateKey}::${exerciseType}::${displayTitle}::${rawDuration ?? 'unk'}`;
      if (existingSessionIds.has(sessionId)) return;

      const durationTrust: DurationTrust = rawDuration !== null ? 'user_reported_actual' : 'unknown';

      store.exerciseSessions.push({
        id: sessionId,
        exerciseType,
        dateKey,
        occurredAt: completedAt,
        hasExactTimestamp,
        actualDurationMinutes: rawDuration,
        durationTrust,
        plannedDurationMinutes: null,
        source: 'manual',
        linkedHabitId: null,
        title: displayTitle,
        ...(note ? { note } : {}),
      });
      existingSessionIds.add(sessionId);
      importedSources.add(sourceKeyName);
      changed = true;
    }
  };

  // 1. Migrate genki.plan.activities.v1
  const v1Activities = parseJsonSafe(storage, ACTIVITIES_STORAGE_KEY, store.coverage.failedLoadRanges);
  if (Array.isArray(v1Activities)) {
    for (const item of v1Activities) {
      importLegacyActivityObject(item, ACTIVITIES_STORAGE_KEY, 'manual');
    }
  }

  // 2. Migrate genki.plan.completions.v1 (legacy Today completions)
  const v1Completions = parseJsonSafe(storage, COMPLETIONS_STORAGE_KEY, store.coverage.failedLoadRanges);
  if (Array.isArray(v1Completions)) {
    for (const item of v1Completions) {
      importLegacyActivityObject(item, COMPLETIONS_STORAGE_KEY, 'today');
    }
  }

  // 3. Migrate genki.plan.restRecords.v1
  const v1RestRecords = parseJsonSafe(storage, REST_RECORDS_STORAGE_KEY, store.coverage.failedLoadRanges);
  if (Array.isArray(v1RestRecords)) {
    for (const raw of v1RestRecords) {
      if (!raw || typeof raw !== 'object') continue;
      const obj = raw as Record<string, unknown>;
      if (isDemoObject(obj)) {
        skippedDemoCount += 1;
        continue;
      }
      const dateKey = isValidLocalDateKey(obj.dateKey)
        ? obj.dateKey.trim()
        : isValidLocalDateKey(obj.date)
        ? obj.date.trim()
        : '';
      if (!dateKey) continue;

      const legacyId =
        typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `rest::${dateKey}`;
      const eventId = `evt::rest::${legacyId}`;
      if (existingEventIds.has(eventId) || existingLegacyRestIds.has(legacyId)) continue;

      const createdAt =
        typeof obj.createdAt === 'string' && obj.createdAt.trim()
          ? obj.createdAt.trim()
          : buildDateOnlyIso(dateKey);
      const source: 'today' | 'plan' | 'migration' =
        obj.source === 'today' ? 'today' : obj.source === 'manual' ? 'plan' : 'migration';
      const title =
        typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Mindful rest day';
      const note = typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim() : undefined;

      store.lifecycleEvents.push({
        id: eventId,
        type: 'rest',
        dateKey,
        occurredAt: createdAt,
        source,
        title,
        ...(note ? { note } : {}),
        legacyRestRecordId: legacyId,
      });
      existingEventIds.add(eventId);
      existingLegacyRestIds.add(legacyId);
      existingRestDates.add(dateKey);
      importedSources.add(REST_RECORDS_STORAGE_KEY);
      changed = true;
    }
  }

  // 4. Migrate genki.plan.restDays.v1
  const v1RestDays = parseJsonSafe(storage, REST_DAYS_STORAGE_KEY, store.coverage.failedLoadRanges);
  if (Array.isArray(v1RestDays)) {
    for (const item of v1RestDays) {
      if (!isValidLocalDateKey(item)) continue;
      const dateKey = item.trim();
      const legacyId = `rest::today::${dateKey}`;
      const eventId = `evt::rest::${legacyId}`;
      if (existingRestDates.has(dateKey) || existingEventIds.has(eventId)) continue;

      store.lifecycleEvents.push({
        id: eventId,
        type: 'rest',
        dateKey,
        occurredAt: buildDateOnlyIso(dateKey),
        source: 'migration',
        title: 'Rest day',
        note: 'Chosen on Today',
        legacyRestRecordId: legacyId,
      });
      existingEventIds.add(eventId);
      existingLegacyRestIds.add(legacyId);
      existingRestDates.add(dateKey);
      importedSources.add(REST_DAYS_STORAGE_KEY);
      changed = true;
    }
  }

  // 5. Migrate legacy History day summaries ONLY when explicitly non-sample (isSample === false)
  for (const legacyLogKey of LEGACY_ACTIVITY_LOGS_STORAGE_KEYS) {
    const parsedLogs = parseJsonSafe(storage, legacyLogKey, store.coverage.failedLoadRanges);
    if (!parsedLogs) continue;
    const entries: unknown[] = Array.isArray(parsedLogs)
      ? parsedLogs
      : typeof parsedLogs === 'object'
      ? Object.values(parsedLogs as Record<string, unknown>)
      : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const noteStr = typeof obj.note === 'string' ? obj.note.trim() : '';
      if (obj.isSample === true) {
        skippedDemoCount += 1;
        continue;
      }
      if (obj.isSample !== false) {
        if (DEMO_HISTORY_NOTE_MARKERS.has(noteStr)) skippedDemoCount += 1;
        continue;
      }

      const dateKey = isValidLocalDateKey(obj.date)
        ? obj.date.trim()
        : isValidLocalDateKey(obj.dateKey)
        ? obj.dateKey.trim()
        : '';
      if (!dateKey) continue;

      if (obj.type === 'rest') {
        const legacyId = `legacy-log-rest::${dateKey}`;
        const eventId = `evt::rest::${legacyId}`;
        if (existingRestDates.has(dateKey) || existingEventIds.has(eventId)) continue;

        store.lifecycleEvents.push({
          id: eventId,
          type: 'rest',
          dateKey,
          occurredAt: buildDateOnlyIso(dateKey),
          source: 'migration',
          title:
            typeof obj.title === 'string' && obj.title.trim()
              ? obj.title.trim()
              : 'Mindful rest day',
          ...(noteStr ? { note: noteStr } : {}),
          legacyRestRecordId: legacyId,
        });
        existingEventIds.add(eventId);
        existingLegacyRestIds.add(legacyId);
        existingRestDates.add(dateKey);
        importedSources.add(legacyLogKey);
        changed = true;
      } else if (obj.type === 'active') {
        const title =
          typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Activity';
        const hasTodayOnDate = store.taskCompletions.some(
          (t) => t.dateKey === dateKey && t.status === 'done'
        );
        if (hasTodayOnDate) continue;

        const sessionId = `legacy-log-active::${dateKey}::${title}`;
        if (existingSessionIds.has(sessionId)) continue;

        const dur = normalizePositiveMinutes(obj.durationMinutes);
        const cat = inferActivityCategory('', title);
        const exerciseType = mapActivityCategoryToExerciseType(cat);

        store.exerciseSessions.push({
          id: sessionId,
          exerciseType,
          dateKey,
          occurredAt: buildDateOnlyIso(dateKey),
          hasExactTimestamp: false,
          actualDurationMinutes: dur,
          durationTrust: dur !== null ? 'user_reported_actual' : 'unknown',
          plannedDurationMinutes: null,
          source: 'manual',
          linkedHabitId: null,
          title,
          ...(noteStr ? { note: noteStr } : {}),
        });
        existingSessionIds.add(sessionId);
        importedSources.add(legacyLogKey);
        changed = true;
      }
    }
  }

  // 6. Migrate genki.plan.weeklyReviews.v1
  const v1Reviews = parseJsonSafe(storage, WEEKLY_REVIEWS_STORAGE_KEY, store.coverage.failedLoadRanges);
  if (v1Reviews && typeof v1Reviews === 'object' && !Array.isArray(v1Reviews)) {
    for (const [weekKey, rawVal] of Object.entries(v1Reviews as Record<string, unknown>)) {
      if (!rawVal || typeof rawVal !== 'object') continue;
      const obj = rawVal as Record<string, unknown>;
      const weekStartKey = isValidLocalDateKey(obj.weekStartKey)
        ? obj.weekStartKey.trim()
        : isValidLocalDateKey(weekKey)
        ? weekKey.trim()
        : '';
      const feeling = obj.feeling;
      if (
        !weekStartKey ||
        (feeling !== 'too_much' && feeling !== 'about_right' && feeling !== 'ready_for_more')
      ) {
        continue;
      }

      const compositeId = makeWeeklyReviewKey(weekStartKey, DEFAULT_WEEKLY_REVIEW_QUESTION_ID);
      if (store.weeklyReviews[compositeId]) continue;

      const updatedAt =
        typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
          ? obj.updatedAt.trim()
          : now.toISOString();

      store.weeklyReviews[compositeId] = {
        id: compositeId,
        weekStartKey,
        questionId: DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
        commitmentVersion: store.commitment?.version ?? null,
        habitVersion: null,
        rawAnswer: feeling,
        feeling,
        savedAt: updatedAt,
        updatedAt,
        pendingSuggestions: [],
        confirmedDecisions: [],
      };
      importedSources.add(WEEKLY_REVIEWS_STORAGE_KEY);
      changed = true;
    }
  }

  // 7. Migrate user-saved Focus & Phase Path ONLY when non-demo
  if (!store.commitment) {
    const focusKeysToCheck = [FOCUS_STORAGE_KEY, ...LEGACY_DIRECTION_STORAGE_KEYS];
    let migratedFocusObj: Record<string, unknown> | null = null;
    let focusSourceKey = '';

    for (const key of focusKeysToCheck) {
      const parsed = parseJsonSafe(storage, key, store.coverage.failedLoadRanges);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const obj = parsed as Record<string, unknown>;
      if (isDemoObject(obj)) {
        skippedDemoCount += 1;
        continue;
      }
      const title =
        (typeof obj.focus === 'string' && obj.focus.trim()) ||
        (typeof obj.goalTitle === 'string' && obj.goalTitle.trim()) ||
        '';
      if (title) {
        migratedFocusObj = obj;
        focusSourceKey = key;
        break;
      }
    }

    const parsedPath = parseJsonSafe(storage, PLAN_PATH_STORAGE_KEY, store.coverage.failedLoadRanges);
    let pathPhaseId = 'start-small';
    let pathPhaseName = '';
    if (parsedPath && typeof parsedPath === 'object' && !Array.isArray(parsedPath)) {
      const pObj = parsedPath as Record<string, unknown>;
      if (!isDemoObject(pObj) && Array.isArray(pObj.phases)) {
        const curId = typeof pObj.currentPhaseId === 'string' ? pObj.currentPhaseId : '';
        const matched = (pObj.phases as Array<Record<string, unknown>>).find(
          (p) => p && p.id === curId
        );
        if (matched && typeof matched.name === 'string') {
          pathPhaseId = curId;
          pathPhaseName = matched.name.trim();
        }
      }
    }

    if (migratedFocusObj) {
      const summary =
        (typeof migratedFocusObj.focus === 'string' && migratedFocusObj.focus.trim()) ||
        (typeof migratedFocusObj.goalTitle === 'string' && migratedFocusObj.goalTitle.trim()) ||
        '';
      const phaseName =
        pathPhaseName ||
        (typeof migratedFocusObj.phase === 'string' && migratedFocusObj.phase.trim()) ||
        'Start small';
      const status: PhaseCommitmentStatus =
        migratedFocusObj.status === 'paused' ? 'paused' : 'active';
      const ts = now.toISOString();

      const migratedStrategy =
        (typeof migratedFocusObj.approach === 'string' && migratedFocusObj.approach.trim()) ||
        (typeof migratedFocusObj.executionApproach === 'string' &&
          migratedFocusObj.executionApproach.trim()) ||
        null;

      store.commitment = {
        id: 'commitment::v1-migrated',
        version: 1,
        phaseId: pathPhaseId,
        phaseName,
        originalIntent: null, // Legacy focus did not preserve raw original user intent
        summary,
        strategySummary: migratedStrategy,
        strategies: [],
        status,
        lastEventKind: 'started',
        reviewRequested: false,
        createdAt: ts,
        updatedAt: ts,
        source: 'migrated_legacy',
      };
      importedSources.add(focusSourceKey);
      changed = true;
    }
  }

  // Record audit entry only when data was actually imported or initialized for the first time
  const importedList = Array.from(importedSources);
  if (changed && (importedList.length > 0 || store.migratedAt === null)) {
    const ts = now.toISOString();
    store.migratedAt = store.migratedAt ?? ts;
    if (importedList.length > 0 || skippedDemoCount > 0) {
      store.migrationHistory.push({
        fromVersion: 1,
        toVersion: PLAN_FOUNDATION_SCHEMA_VERSION,
        migratedAt: ts,
        importedSources: importedList,
        skippedDemoCount,
      });
    }
  }

  return {
    store,
    changed,
    importedSources: importedList,
    skippedDemoCount,
  };
}

// ============================================================================
// PERSISTENCE LOAD / SAVE
// ============================================================================

export function savePlanFoundationStore(
  store: PlanFoundationStore,
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  // Never persist isolated test fixtures into official user storage key
  if (store.isTestFixture) return false;
  if (!storage) return false;
  try {
    storage.setItem(PLAN_FOUNDATION_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function loadPlanFoundationStore(options?: {
  storage?: StorageLike | null;
  now?: Date;
  persistIfChanged?: boolean;
}): PlanFoundationStore {
  const storage = options && 'storage' in options ? options.storage ?? null : getDefaultStorage();
  const now = options?.now ?? new Date();
  const persistIfChanged = options?.persistIfChanged !== false;

  if (!storage) {
    return createEmptyPlanFoundationStore();
  }

  const failedLoadRanges: FailedLoadRange[] = [];
  let existingStore: PlanFoundationStore | null = null;

  const rawV2 = storage.getItem(PLAN_FOUNDATION_STORAGE_KEY);
  if (rawV2 !== null) {
    try {
      const parsed = JSON.parse(rawV2);
      const normalized = normalizeExistingStore(parsed);
      if (normalized) {
        existingStore = normalized;
      } else {
        failedLoadRanges.push({
          startDateKey: null,
          endDateKey: null,
          storageKey: PLAN_FOUNDATION_STORAGE_KEY,
          errorMessage: 'Unrecognized foundation schema version or structure',
          occurredAt: now.toISOString(),
        });
      }
    } catch (err) {
      failedLoadRanges.push({
        startDateKey: null,
        endDateKey: null,
        storageKey: PLAN_FOUNDATION_STORAGE_KEY,
        errorMessage: err instanceof Error ? err.message : 'Corrupted foundation store JSON',
        occurredAt: now.toISOString(),
      });
    }
  }

  // If v2 store already loaded cleanly and was already migrated, return directly (no re-import of deleted legacy items!)
  if (existingStore && existingStore.migratedAt !== null) {
    return existingStore;
  }

  const { store, changed } = migrateLegacyStorageToFoundation(existingStore, storage, now);
  if (failedLoadRanges.length > 0) {
    store.coverage.failedLoadRanges.push(...failedLoadRanges);
  }

  if (persistIfChanged && (changed || failedLoadRanges.length > 0)) {
    savePlanFoundationStore(store, storage);
  }

  return store;
}

// ============================================================================
// MUTATION & SYNCHRONOUS RECOMPUTATION HELPERS (PURE IMMUTABLE TRANSFORMS)
// ============================================================================

export interface CompleteTaskCardInput {
  logicalTaskId: string;
  dateKey: string; // Local YYYY-MM-DD
  completedAt?: string;
  hasExactTimestamp?: boolean;
  cardId?: string;
  planId: string;
  originalPlanId?: string;
  replacedFromPlanIds?: string[];
  title: string;
  /** Single or multiple exercise segments inside this one logical task card */
  exerciseSegments: TaskExerciseSegment[];
  /** Explicit habit IDs ONLY; never pass keyword-guessed IDs */
  linkedHabitIds?: string[];
  actionTier?: ActionTier;
  actionVersion?: string;
  note?: string;
}

/**
 * Marks a logical task card as Done.
 * - Multi-exercise cards still create exactly ONE TaskCompletionRecord (1 Done task).
 * - Duplicate clicks, retries, or refreshes with the same logicalTaskId are idempotent.
 * - Alternative/Plan B replacements keep the same logicalTaskId and never double-count.
 * - Planned durations NEVER masquerade as actualDurationMinutes; unknown multi-segment
 *   durations are NEVER evenly split.
 * - HabitPracticeRecords are created ONLY for explicitly provided habitIds.
 */
export function completeTaskCard(
  store: PlanFoundationStore,
  input: CompleteTaskCardInput
): { store: PlanFoundationStore; taskCompletion: TaskCompletionRecord } {
  const dateKey = input.dateKey.trim();
  const completedAt = input.completedAt ?? new Date().toISOString();
  const hasExactTimestamp = input.hasExactTimestamp ?? true;

  const existing = store.taskCompletions.find(
    (t) => t.logicalTaskId === input.logicalTaskId
  );

  // If already Done with the exact same logicalTaskId and planId, treat as idempotent retry/duplicate click
  if (existing && existing.status === 'done' && existing.planId === input.planId) {
    return { store, taskCompletion: existing };
  }

  const taskCompletionId = existing?.id ?? input.logicalTaskId;
  const originalPlanId = existing?.originalPlanId ?? input.originalPlanId ?? input.planId;
  const replacedSet = new Set<string>([
    ...(existing?.replacedFromPlanIds ?? []),
    ...(input.replacedFromPlanIds ?? []),
  ]);
  if (existing && existing.planId !== input.planId) {
    replacedSet.add(existing.planId);
  }
  replacedSet.delete(input.planId);

  const normalizedSegments: TaskExerciseSegment[] = (input.exerciseSegments ?? []).map((seg) => {
    const { actualDurationMinutes, durationTrust } = normalizeTrustworthyDuration(
      seg.actualDurationMinutes,
      seg.durationTrust
    );
    return {
      exerciseType: seg.exerciseType,
      ...(typeof seg.workoutActivityType === 'string' && seg.workoutActivityType.trim()
        ? { workoutActivityType: seg.workoutActivityType.trim() }
        : {}),
      ...(typeof seg.rawTypeLabel === 'string' && seg.rawTypeLabel.trim()
        ? { rawTypeLabel: seg.rawTypeLabel.trim() }
        : {}),
      ...(seg.locationContext ? { locationContext: seg.locationContext } : {}),
      title: seg.title.trim() || input.title,
      plannedDurationMinutes: normalizePositiveMinutes(seg.plannedDurationMinutes),
      actualDurationMinutes,
      durationTrust,
      linkedHabitId:
        typeof seg.linkedHabitId === 'string' && seg.linkedHabitId.trim()
          ? seg.linkedHabitId.trim()
          : null,
    };
  });

  const explicitHabitIds = Array.from(
    new Set(
      [
        ...(input.linkedHabitIds ?? []),
        ...normalizedSegments
          .map((s) => s.linkedHabitId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ]
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  const nextTask: TaskCompletionRecord = {
    id: taskCompletionId,
    logicalTaskId: input.logicalTaskId,
    dateKey,
    completedAt,
    hasExactTimestamp,
    status: 'done',
    ...(input.cardId ? { cardId: input.cardId } : existing?.cardId ? { cardId: existing.cardId } : {}),
    planId: input.planId,
    originalPlanId,
    replacedFromPlanIds: Array.from(replacedSet),
    title: input.title.trim() || 'Activity',
    exerciseSegments: normalizedSegments,
    linkedHabitIds: explicitHabitIds,
    ...(input.actionTier ? { actionTier: input.actionTier } : {}),
    ...(input.actionVersion ? { actionVersion: input.actionVersion } : {}),
    source: 'today',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  // Upsert TaskCompletionRecord by logicalTaskId
  const nextTaskCompletions = existing
    ? store.taskCompletions.map((t) => (t.logicalTaskId === input.logicalTaskId ? nextTask : t))
    : [...store.taskCompletions, nextTask];

  // Replace ONLY ExerciseSessionRecords derived from this exact taskCompletionId
  const removedDerivedSessionIds = new Set(
    store.exerciseSessions
      .filter((s) => s.sourceTaskCompletionId === taskCompletionId)
      .map((s) => s.id)
  );

  const newDerivedSessions: ExerciseSessionRecord[] = normalizedSegments.map((seg, idx) => ({
    id: makeTaskSegmentSessionId(taskCompletionId, idx),
    exerciseType: seg.exerciseType,
    ...(seg.workoutActivityType ? { workoutActivityType: seg.workoutActivityType } : {}),
    ...(seg.rawTypeLabel ? { rawTypeLabel: seg.rawTypeLabel } : {}),
    ...(seg.locationContext ? { locationContext: seg.locationContext } : {}),
    dateKey,
    occurredAt: completedAt,
    hasExactTimestamp,
    actualDurationMinutes: seg.actualDurationMinutes ?? null,
    durationTrust: seg.durationTrust ?? 'unknown',
    plannedDurationMinutes: seg.plannedDurationMinutes ?? null,
    source: 'today_task',
    sourceTaskCompletionId: taskCompletionId,
    sourceLogicalTaskId: input.logicalTaskId,
    segmentIndex: idx,
    linkedHabitId: seg.linkedHabitId ?? null,
    ...(input.actionTier ? { actionTier: input.actionTier } : {}),
    ...(input.actionVersion ? { actionVersion: input.actionVersion } : {}),
    title: seg.title,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  }));

  const nextExerciseSessions = [
    ...store.exerciseSessions.filter((s) => s.sourceTaskCompletionId !== taskCompletionId),
    ...newDerivedSessions,
  ];

  // Replace ONLY HabitPracticeRecords originating from this taskCompletionId or its derived sessions
  // Never disturb independent same-day sources for the same habit!
  const preservedHabitPractices = store.habitPractices.filter(
    (hp) =>
      hp.sourceRecordId !== taskCompletionId && !removedDerivedSessionIds.has(hp.sourceRecordId)
  );

  const actionTier: ActionTier = input.actionTier ?? 'regular';
  const actionVersion = input.actionVersion ?? 'v1';

  const newHabitPractices: HabitPracticeRecord[] = explicitHabitIds.map((habitId) => {
    const matchingSeg = normalizedSegments.find((s) => s.linkedHabitId === habitId);
    return {
      id: makeHabitPracticeId('task_completion', taskCompletionId, habitId),
      habitId,
      dateKey,
      occurredAt: completedAt,
      sourceType: 'task_completion',
      sourceRecordId: taskCompletionId,
      sourceLogicalTaskId: input.logicalTaskId,
      actionTier,
      actionVersion,
      actualDurationMinutes: matchingSeg?.actualDurationMinutes ?? null,
    };
  });

  return {
    store: {
      ...store,
      taskCompletions: nextTaskCompletions,
      exerciseSessions: nextExerciseSessions,
      habitPractices: [...preservedHabitPractices, ...newHabitPractices],
    },
    taskCompletion: nextTask,
  };
}

/**
 * Undoes a task card completion cleanly.
 * - Decrements Done task count (marks status: 'undone').
 * - Removes linked today_task ExerciseSessionRecords.
 * - Removes ONLY HabitPracticeRecords belonging to this task source; independent
 *   same-day habit practices remain intact.
 */
export function undoTaskCardCompletion(
  store: PlanFoundationStore,
  target: { logicalTaskId?: string; taskCompletionId?: string; undoneAt?: string }
): PlanFoundationStore {
  const matched = store.taskCompletions.find(
    (t) =>
      (target.logicalTaskId && t.logicalTaskId === target.logicalTaskId) ||
      (target.taskCompletionId && t.id === target.taskCompletionId)
  );
  if (!matched) return store;

  const undoneAt = target.undoneAt ?? new Date().toISOString();
  const derivedSessionIds = new Set(
    store.exerciseSessions
      .filter((s) => s.sourceTaskCompletionId === matched.id)
      .map((s) => s.id)
  );

  return {
    ...store,
    taskCompletions: store.taskCompletions.map((t) =>
      t.id === matched.id ? { ...t, status: 'undone', undoneAt } : t
    ),
    exerciseSessions: store.exerciseSessions.filter(
      (s) => s.sourceTaskCompletionId !== matched.id
    ),
    habitPractices: store.habitPractices.filter(
      (hp) => hp.sourceRecordId !== matched.id && !derivedSessionIds.has(hp.sourceRecordId)
    ),
  };
}

/**
 * Records an alternative / Plan B replacement on a logical task card.
 * If the card was already completed, updates that single TaskCompletionRecord in-place
 * while preserving logicalTaskId so old + new plans NEVER double-count.
 */
export function recordAlternativePlanReplacement(
  store: PlanFoundationStore,
  input: {
    logicalTaskId: string;
    previousPlanId: string;
    nextPlanId: string;
    nextTitle: string;
    nextExerciseSegments: TaskExerciseSegment[];
    nextLinkedHabitIds?: string[];
    actionTier?: ActionTier;
    actionVersion?: string;
  }
): PlanFoundationStore {
  const existing = store.taskCompletions.find(
    (t) => t.logicalTaskId === input.logicalTaskId
  );
  if (!existing || existing.status !== 'done') {
    return store;
  }

  const { store: updated } = completeTaskCard(store, {
    logicalTaskId: existing.logicalTaskId,
    dateKey: existing.dateKey,
    completedAt: existing.completedAt,
    hasExactTimestamp: existing.hasExactTimestamp,
    cardId: existing.cardId,
    planId: input.nextPlanId,
    originalPlanId: existing.originalPlanId,
    replacedFromPlanIds: [...existing.replacedFromPlanIds, input.previousPlanId],
    title: input.nextTitle,
    exerciseSegments: input.nextExerciseSegments,
    linkedHabitIds: input.nextLinkedHabitIds ?? existing.linkedHabitIds,
    actionTier: input.actionTier ?? existing.actionTier,
    actionVersion: input.actionVersion ?? existing.actionVersion,
    note: existing.note,
  });

  return updated;
}

export interface AddExerciseSessionInput {
  id?: string;
  exerciseType: ExerciseType;
  workoutActivityType?: string;
  rawTypeLabel?: string;
  locationContext?: WorkoutLocationContext;
  dateKey: string; // Local YYYY-MM-DD
  occurredAt?: string;
  hasExactTimestamp?: boolean;
  actualDurationMinutes?: number | null;
  durationTrust?: DurationTrust;
  plannedDurationMinutes?: number | null;
  source: Exclude<ExerciseSessionSource, 'today_task'>;
  /** Explicit habitId only; NEVER keyword-inferred */
  linkedHabitId?: string | null;
  actionTier?: ActionTier;
  actionVersion?: string;
  title: string;
  note?: string;
}

/**
 * Adds a manual or external-import actual exercise record.
 * Strictly NEVER creates or increments a TaskCompletionRecord (Done task count).
 */
export function addExerciseSession(
  store: PlanFoundationStore,
  input: AddExerciseSessionInput
): { store: PlanFoundationStore; session: ExerciseSessionRecord } {
  const dateKey = input.dateKey.trim();
  const id = input.id?.trim() || createUniqueId(`es::${input.source}`, dateKey);
  const occurredAt = input.occurredAt ?? buildDateOnlyIso(dateKey);
  const hasExactTimestamp = input.hasExactTimestamp ?? false;
  const { actualDurationMinutes, durationTrust } = normalizeTrustworthyDuration(
    input.actualDurationMinutes,
    input.durationTrust ?? (input.actualDurationMinutes ? 'user_reported_actual' : 'unknown')
  );
  const plannedDurationMinutes = normalizePositiveMinutes(input.plannedDurationMinutes);
  const linkedHabitId =
    typeof input.linkedHabitId === 'string' && input.linkedHabitId.trim()
      ? input.linkedHabitId.trim()
      : null;

  const session: ExerciseSessionRecord = {
    id,
    exerciseType: input.exerciseType,
    ...(typeof input.workoutActivityType === 'string' && input.workoutActivityType.trim()
      ? { workoutActivityType: input.workoutActivityType.trim() }
      : {}),
    ...(typeof input.rawTypeLabel === 'string' && input.rawTypeLabel.trim()
      ? { rawTypeLabel: input.rawTypeLabel.trim() }
      : {}),
    ...(input.locationContext ? { locationContext: input.locationContext } : {}),
    dateKey,
    occurredAt,
    hasExactTimestamp,
    actualDurationMinutes,
    durationTrust,
    plannedDurationMinutes,
    source: input.source,
    linkedHabitId,
    ...(input.actionTier ? { actionTier: input.actionTier } : {}),
    ...(input.actionVersion ? { actionVersion: input.actionVersion } : {}),
    title: input.title.trim() || 'Activity',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  let nextHabitPractices = store.habitPractices;
  if (linkedHabitId) {
    const hp: HabitPracticeRecord = {
      id: makeHabitPracticeId('exercise_session', session.id, linkedHabitId),
      habitId: linkedHabitId,
      dateKey,
      occurredAt,
      sourceType: 'exercise_session',
      sourceRecordId: session.id,
      actionTier: input.actionTier ?? 'regular',
      actionVersion: input.actionVersion ?? 'v1',
      actualDurationMinutes,
    };
    nextHabitPractices = [...store.habitPractices, hp];
  }

  return {
    store: {
      ...store,
      exerciseSessions: [...store.exerciseSessions, session],
      habitPractices: nextHabitPractices,
    },
    session,
  };
}

export interface UpdateExerciseSessionPatch {
  dateKey?: string;
  exerciseType?: ExerciseType;
  title?: string;
  actualDurationMinutes?: number | null;
  durationTrust?: DurationTrust;
  plannedDurationMinutes?: number | null;
  note?: string;
  linkedHabitId?: string | null;
  actionTier?: ActionTier;
  actionVersion?: string;
}

/**
 * Updates an exercise session (including date edits/backfills, duration edits, type edits)
 * and synchronously updates linked TaskCompletion / HabitPractice records so all weekly
 * and rolling 7-day queries recompute accurately.
 */
export function updateExerciseSession(
  store: PlanFoundationStore,
  sessionId: string,
  patch: UpdateExerciseSessionPatch
): PlanFoundationStore {
  // Also allow lookup by sourceTaskCompletionId for legacy callers editing a single-segment Today card
  const existing =
    store.exerciseSessions.find((s) => s.id === sessionId) ??
    store.exerciseSessions.find((s) => s.sourceTaskCompletionId === sessionId);
  if (!existing) return store;

  const nextDateKey =
    patch.dateKey && isValidLocalDateKey(patch.dateKey) ? patch.dateKey.trim() : existing.dateKey;
  const dateChanged = nextDateKey !== existing.dateKey;
  const nextOccurredAt = dateChanged
    ? buildDateOnlyIso(nextDateKey)
    : existing.occurredAt;

  let nextActual = existing.actualDurationMinutes;
  let nextTrust = existing.durationTrust;
  if ('actualDurationMinutes' in patch || 'durationTrust' in patch) {
    const targetMinutes =
      'actualDurationMinutes' in patch ? patch.actualDurationMinutes : existing.actualDurationMinutes;
    const targetTrust =
      patch.durationTrust ??
      (targetMinutes !== null && targetMinutes !== undefined && targetMinutes > 0
        ? 'user_reported_actual'
        : 'unknown');
    const normalized = normalizeTrustworthyDuration(targetMinutes, targetTrust);
    nextActual = normalized.actualDurationMinutes;
    nextTrust = normalized.durationTrust;
  }

  const nextPlanned =
    'plannedDurationMinutes' in patch
      ? normalizePositiveMinutes(patch.plannedDurationMinutes)
      : existing.plannedDurationMinutes;

  const nextLinkedHabitId =
    'linkedHabitId' in patch
      ? typeof patch.linkedHabitId === 'string' && patch.linkedHabitId.trim()
        ? patch.linkedHabitId.trim()
        : null
      : existing.linkedHabitId ?? null;

  const nextTitle =
    typeof patch.title === 'string' && patch.title.trim() ? patch.title.trim() : existing.title;
  const nextNote =
    'note' in patch ? (patch.note?.trim() || undefined) : existing.note;

  const updatedSession: ExerciseSessionRecord = {
    ...existing,
    dateKey: nextDateKey,
    occurredAt: nextOccurredAt,
    hasExactTimestamp: dateChanged ? false : existing.hasExactTimestamp,
    exerciseType: patch.exerciseType ?? existing.exerciseType,
    title: nextTitle,
    actualDurationMinutes: nextActual,
    durationTrust: nextTrust,
    plannedDurationMinutes: nextPlanned,
    linkedHabitId: nextLinkedHabitId,
    actionTier: patch.actionTier ?? existing.actionTier,
    actionVersion: patch.actionVersion ?? existing.actionVersion,
  };
  if (nextNote) {
    updatedSession.note = nextNote;
  } else {
    delete updatedSession.note;
  }

  const nextExerciseSessions = store.exerciseSessions.map((s) =>
    s.id === existing.id ? updatedSession : s
  );

  // Sync linked TaskCompletionRecord if this session came from a Today task
  let nextTaskCompletions = store.taskCompletions;
  if (existing.sourceTaskCompletionId) {
    nextTaskCompletions = store.taskCompletions.map((tc) => {
      if (tc.id !== existing.sourceTaskCompletionId) return tc;
      const updatedSegments = tc.exerciseSegments.map((seg, idx) =>
        idx === (existing.segmentIndex ?? 0)
          ? {
              ...seg,
              exerciseType: updatedSession.exerciseType,
              title: updatedSession.title,
              actualDurationMinutes: updatedSession.actualDurationMinutes,
              durationTrust: updatedSession.durationTrust,
              plannedDurationMinutes: updatedSession.plannedDurationMinutes,
              linkedHabitId: updatedSession.linkedHabitId ?? null,
            }
          : seg
      );
      return {
        ...tc,
        dateKey: dateChanged ? nextDateKey : tc.dateKey,
        title: tc.exerciseSegments.length <= 1 ? updatedSession.title : tc.title,
        exerciseSegments: updatedSegments,
        ...(nextNote ? { note: nextNote } : {}),
      };
    });
  }

  // Sync HabitPracticeRecords owned by this session (or its parent task if date changed)
  let nextHabitPractices = store.habitPractices.filter(
    (hp) => hp.sourceRecordId !== existing.id
  );
  if (dateChanged && existing.sourceTaskCompletionId) {
    nextHabitPractices = nextHabitPractices.map((hp) =>
      hp.sourceRecordId === existing.sourceTaskCompletionId
        ? { ...hp, dateKey: nextDateKey, occurredAt: nextOccurredAt }
        : hp
    );
  }
  if (existing.source !== 'today_task' && nextLinkedHabitId) {
    nextHabitPractices.push({
      id: makeHabitPracticeId('exercise_session', existing.id, nextLinkedHabitId),
      habitId: nextLinkedHabitId,
      dateKey: nextDateKey,
      occurredAt: nextOccurredAt,
      sourceType: 'exercise_session',
      sourceRecordId: existing.id,
      actionTier: updatedSession.actionTier ?? 'regular',
      actionVersion: updatedSession.actionVersion ?? 'v1',
      actualDurationMinutes: updatedSession.actualDurationMinutes,
    });
  }

  return {
    ...store,
    taskCompletions: nextTaskCompletions,
    exerciseSessions: nextExerciseSessions,
    habitPractices: nextHabitPractices,
  };
}

/**
 * Deletes an exercise session (or Today task record by ID) and removes ONLY its
 * associated HabitPracticeRecords without disturbing independent same-day sources.
 */
export function removeExerciseSession(
  store: PlanFoundationStore,
  recordId: string,
  options?: { cascadeTaskUndo?: boolean }
): PlanFoundationStore {
  // Check if recordId directly targets a TaskCompletionRecord
  const matchedTask = store.taskCompletions.find(
    (t) => t.id === recordId || t.logicalTaskId === recordId
  );
  if (matchedTask && options?.cascadeTaskUndo) {
    return undoTaskCardCompletion(store, { taskCompletionId: matchedTask.id });
  }

  const matchedSession = store.exerciseSessions.find((s) => s.id === recordId);
  if (!matchedSession) return store;

  if (options?.cascadeTaskUndo && matchedSession.sourceTaskCompletionId) {
    return undoTaskCardCompletion(store, {
      taskCompletionId: matchedSession.sourceTaskCompletionId,
    });
  }

  return {
    ...store,
    exerciseSessions: store.exerciseSessions.filter((s) => s.id !== matchedSession.id),
    habitPractices: store.habitPractices.filter((hp) => hp.sourceRecordId !== matchedSession.id),
  };
}

/**
 * Logs an explicit, independent habit practice record (e.g. minimum or regular action).
 */
export function recordHabitPractice(
  store: PlanFoundationStore,
  input: {
    habitId: string;
    dateKey: string;
    occurredAt?: string;
    sourceType?: HabitPracticeSourceType;
    sourceRecordId: string;
    sourceLogicalTaskId?: string;
    actionTier?: ActionTier;
    actionVersion?: string;
    actualDurationMinutes?: number | null;
  }
): { store: PlanFoundationStore; record: HabitPracticeRecord } {
  const habitId = input.habitId.trim();
  const sourceType = input.sourceType ?? 'manual_habit_log';
  const id = makeHabitPracticeId(sourceType, input.sourceRecordId, habitId);
  const record: HabitPracticeRecord = {
    id,
    habitId,
    dateKey: input.dateKey.trim(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    sourceType,
    sourceRecordId: input.sourceRecordId,
    ...(input.sourceLogicalTaskId ? { sourceLogicalTaskId: input.sourceLogicalTaskId } : {}),
    actionTier: input.actionTier ?? 'regular',
    actionVersion: input.actionVersion ?? 'v1',
    actualDurationMinutes: normalizePositiveMinutes(input.actualDurationMinutes),
  };

  const exists = store.habitPractices.some((hp) => hp.id === id);
  const nextPractices = exists
    ? store.habitPractices.map((hp) => (hp.id === id ? record : hp))
    : [...store.habitPractices, record];

  return {
    store: {
      ...store,
      habitPractices: nextPractices,
    },
    record,
  };
}

export function removeHabitPracticeBySource(
  store: PlanFoundationStore,
  sourceRecordId: string
): PlanFoundationStore {
  return {
    ...store,
    habitPractices: store.habitPractices.filter((hp) => hp.sourceRecordId !== sourceRecordId),
  };
}

/**
 * Records an explicit lifecycle event (rest, pause, resume, strategy_adjustment).
 * For 'rest', maintains at most one rest event per dateKey (matching existing UX).
 */
export function recordLifecycleEvent(
  store: PlanFoundationStore,
  input: {
    id?: string;
    type: PlanLifecycleEventType;
    dateKey: string;
    occurredAt?: string;
    source: 'today' | 'plan' | 'chat' | 'migration';
    habitId?: string;
    title?: string;
    note?: string;
    commitmentVersion?: number | null;
    relatedWeekStartKey?: string;
    legacyRestRecordId?: string;
    payload?: Record<string, unknown>;
  }
): { store: PlanFoundationStore; event: PlanLifecycleEvent } {
  const dateKey = input.dateKey.trim();
  const id =
    input.id?.trim() ||
    (input.type === 'rest'
      ? `evt::rest::${input.source}::${dateKey}`
      : createUniqueId(`evt::${input.type}`, dateKey));

  const event: PlanLifecycleEvent = {
    id,
    type: input.type,
    dateKey,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    source: input.source,
    ...(typeof input.habitId === 'string' && input.habitId.trim()
      ? { habitId: input.habitId.trim() }
      : {}),
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    commitmentVersion:
      'commitmentVersion' in input
        ? input.commitmentVersion ?? null
        : store.commitment?.version ?? null,
    ...(input.relatedWeekStartKey ? { relatedWeekStartKey: input.relatedWeekStartKey } : {}),
    ...(input.legacyRestRecordId ? { legacyRestRecordId: input.legacyRestRecordId } : {}),
    ...(input.payload ? { payload: input.payload } : {}),
  };

  let filtered = store.lifecycleEvents.filter((e) => e.id !== id);
  if (input.type === 'rest') {
    filtered = filtered.filter((e) => !(e.type === 'rest' && e.dateKey === dateKey));
  }

  return {
    store: {
      ...store,
      lifecycleEvents: [...filtered, event],
    },
    event,
  };
}

export function removeLifecycleEvent(
  store: PlanFoundationStore,
  eventIdOrLegacyRestId: string
): PlanFoundationStore {
  return {
    ...store,
    lifecycleEvents: store.lifecycleEvents.filter(
      (e) => e.id !== eventIdOrLegacyRestId && e.legacyRestRecordId !== eventIdOrLegacyRestId
    ),
  };
}

export function clearRecordsForDate(
  store: PlanFoundationStore,
  dateKey: string
): PlanFoundationStore {
  const removedTaskIds = new Set(
    store.taskCompletions
      .filter((t) => t.dateKey === dateKey && t.status === 'done')
      .map((t) => t.id)
  );
  const removedSessionIds = new Set(
    store.exerciseSessions.filter((s) => s.dateKey === dateKey).map((s) => s.id)
  );

  const nowIso = new Date().toISOString();
  return {
    ...store,
    taskCompletions: store.taskCompletions.map((t) =>
      removedTaskIds.has(t.id) ? { ...t, status: 'undone', undoneAt: nowIso } : t
    ),
    exerciseSessions: store.exerciseSessions.filter((s) => s.dateKey !== dateKey),
    habitPractices: store.habitPractices.filter(
      (hp) =>
        hp.dateKey !== dateKey &&
        !removedTaskIds.has(hp.sourceRecordId) &&
        !removedSessionIds.has(hp.sourceRecordId)
    ),
    lifecycleEvents: store.lifecycleEvents.filter(
      (e) => !(e.type === 'rest' && e.dateKey === dateKey)
    ),
  };
}

/**
 * Saves or edits a Weekly Review answer strictly keyed by (weekStartKey, questionId).
 */
export function upsertWeeklyReviewAnswer(
  store: PlanFoundationStore,
  input: {
    weekStartKey: string;
    questionId: string;
    rawAnswer: string;
    commitmentVersion?: number | null;
    habitVersion?: string | null;
    pendingSuggestions?: WeeklyReviewSuggestion[];
    confirmedDecisions?: WeeklyReviewDecision[];
    timestamp?: string;
  }
): { store: PlanFoundationStore; record: WeeklyReviewRecord } {
  const weekStartKey = input.weekStartKey.trim();
  const questionId = input.questionId.trim();
  const key = makeWeeklyReviewKey(weekStartKey, questionId);
  const existing = store.weeklyReviews[key];
  const nowIso = input.timestamp ?? new Date().toISOString();

  const feeling: WeeklyReviewFeeling | undefined =
    questionId === DEFAULT_WEEKLY_REVIEW_QUESTION_ID &&
    (input.rawAnswer === 'too_much' ||
      input.rawAnswer === 'about_right' ||
      input.rawAnswer === 'ready_for_more')
      ? input.rawAnswer
      : undefined;

  const record: WeeklyReviewRecord = {
    id: key,
    weekStartKey,
    questionId,
    commitmentVersion:
      'commitmentVersion' in input
        ? input.commitmentVersion ?? null
        : existing?.commitmentVersion ?? store.commitment?.version ?? null,
    habitVersion:
      'habitVersion' in input ? input.habitVersion ?? null : existing?.habitVersion ?? null,
    rawAnswer: input.rawAnswer,
    ...(feeling ? { feeling } : {}),
    savedAt: existing?.savedAt ?? nowIso,
    updatedAt: nowIso,
    pendingSuggestions: input.pendingSuggestions ?? existing?.pendingSuggestions ?? [],
    confirmedDecisions: input.confirmedDecisions ?? existing?.confirmedDecisions ?? [],
  };

  return {
    store: {
      ...store,
      weeklyReviews: {
        ...store.weeklyReviews,
        [key]: record,
      },
    },
    record,
  };
}

export function getWeeklyReviewAnswer(
  store: PlanFoundationStore,
  weekStartKey: string,
  questionId: string
): WeeklyReviewRecord | null {
  return store.weeklyReviews[makeWeeklyReviewKey(weekStartKey, questionId)] ?? null;
}

export function getWeeklyReviewsForWeek(
  store: PlanFoundationStore,
  weekStartKey: string
): WeeklyReviewRecord[] {
  return Object.values(store.weeklyReviews).filter((r) => r.weekStartKey === weekStartKey);
}

/**
 * Updates or creates the User Phase Commitment (incrementing version on changes)
 * and sets confirmable trackingStartDateKey ONLY when explicitly confirmed by user setup.
 */
export function upsertPhaseCommitment(
  store: PlanFoundationStore,
  input: {
    phaseId: string;
    phaseName: string;
    originalIntent?: string | null;
    summary: string;
    strategySummary?: string | null;
    strategies?: ConfirmedActionStrategy[];
    status?: PhaseCommitmentStatus;
    lastEventKind?: PhaseCommitmentEventKind;
    reviewRequested?: boolean;
    confirmTrackingStartDateKey?: string;
    timestamp?: string;
  }
): { store: PlanFoundationStore; commitment: PhaseCommitmentRecord } {
  const nowIso = input.timestamp ?? new Date().toISOString();
  const prev = store.commitment;
  const nextVersion = prev ? prev.version + 1 : 1;
  const nextEventKind: PhaseCommitmentEventKind =
    input.lastEventKind ?? (prev ? 'adjusted' : 'started');
  const nextStrategySummary =
    'strategySummary' in input
      ? input.strategySummary && input.strategySummary.trim()
        ? input.strategySummary.trim()
        : null
      : prev?.strategySummary ?? null;
  const nextReviewRequested =
    typeof input.reviewRequested === 'boolean'
      ? input.reviewRequested
      : nextEventKind === 'adjusted' || nextEventKind === 'kept' || !prev
      ? false
      : prev.reviewRequested ?? false;

  const commitment: PhaseCommitmentRecord = {
    id: prev?.id ?? `commitment::${Date.now()}`,
    version: nextVersion,
    phaseId: input.phaseId,
    phaseName: input.phaseName.trim(),
    originalIntent:
      'originalIntent' in input ? input.originalIntent ?? null : prev?.originalIntent ?? null,
    summary: input.summary.trim(),
    strategySummary: nextStrategySummary,
    strategies: input.strategies ?? prev?.strategies ?? [],
    status: input.status ?? prev?.status ?? 'active',
    lastEventKind: nextEventKind,
    reviewRequested: nextReviewRequested,
    createdAt: prev?.createdAt ?? nowIso,
    updatedAt: nowIso,
    source: 'user',
  };

  let nextCoverage = store.coverage;
  if (
    !store.coverage.trackingStartDateKey &&
    input.confirmTrackingStartDateKey &&
    isValidLocalDateKey(input.confirmTrackingStartDateKey)
  ) {
    nextCoverage = {
      ...store.coverage,
      trackingStartDateKey: input.confirmTrackingStartDateKey.trim(),
      trackingStartSource: 'commitment_created',
    };
  }

  return {
    store: {
      ...store,
      commitment,
      coverage: nextCoverage,
    },
    commitment,
  };
}

/**
 * Records an explicit user decision to keep or adjust their rhythm on an existing
 * confirmed phase commitment (never fabricates a commitment when none exists).
 */
export function recordCommitmentRhythmEvent(
  store: PlanFoundationStore,
  eventKind: 'adjusted' | 'kept',
  timestamp?: string
): PlanFoundationStore {
  if (!hasConfirmedPhaseCommitment(store.commitment)) {
    return store;
  }
  const nowIso = timestamp ?? new Date().toISOString();
  return {
    ...store,
    commitment: {
      ...store.commitment,
      lastEventKind: eventKind,
      reviewRequested: false,
      updatedAt: nowIso,
    },
  };
}

/**
 * True only when the user has a real, non-draft confirmed commitment summary.
 */
export function hasConfirmedPhaseCommitment(
  commitment: PhaseCommitmentRecord | null | undefined
): commitment is PhaseCommitmentRecord {
  return Boolean(
    commitment &&
      commitment.status !== 'draft' &&
      typeof commitment.summary === 'string' &&
      commitment.summary.trim().length > 0
  );
}

/**
 * Returns the user's confirmed mid-term movement strategy line ONLY from explicitly
 * confirmed fields. Never fabricates frequency numbers or unconfirmed strategies.
 */
export function deriveCommitmentStrategyLine(
  commitment: PhaseCommitmentRecord | null | undefined
): string | null {
  if (!hasConfirmedPhaseCommitment(commitment)) return null;
  if (typeof commitment.strategySummary === 'string' && commitment.strategySummary.trim()) {
    return commitment.strategySummary.trim();
  }
  if (Array.isArray(commitment.strategies) && commitment.strategies.length > 0) {
    const parts = commitment.strategies
      .map((s) => {
        const action = s.regularAction?.trim() || s.label?.trim() || '';
        const freq = s.frequencyDescription?.trim() || '';
        if (action && freq) return `${action} (${freq})`;
        return action;
      })
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }
  return null;
}

/**
 * Deterministic event-driven Nova line for the Plan Phase Commitment Header.
 * Never rotates randomly; never auto-announces completion from dates or task counts.
 */
export function derivePlanHeaderNovaLine(
  commitment: PhaseCommitmentRecord | null | undefined
): string {
  if (!hasConfirmedPhaseCommitment(commitment)) {
    return 'When you’re ready, set a focus together.';
  }
  if (commitment.reviewRequested === true) {
    return 'Shall we revisit your goal?';
  }
  if (commitment.lastEventKind === 'adjusted') {
    return 'We’ll find a way that fits.';
  }
  if (commitment.lastEventKind === 'kept') {
    return 'Let’s keep this rhythm.';
  }
  return 'You’ve chosen to begin again.';
}

/**
 * Deterministic single detail entry label for the Plan Phase Commitment Header.
 */
export function derivePlanHeaderDetailActionLabel(
  commitment: PhaseCommitmentRecord | null | undefined
): 'Set a focus' | 'Review together' | 'About this goal' {
  if (!hasConfirmedPhaseCommitment(commitment)) {
    return 'Set a focus';
  }
  if (commitment.reviewRequested === true) {
    return 'Review together';
  }
  return 'About this goal';
}

export function setConfirmableTrackingStartDate(
  store: PlanFoundationStore,
  dateKey: string,
  source: 'commitment_created' | 'first_confirmed_setup'
): PlanFoundationStore {
  if (!isValidLocalDateKey(dateKey)) return store;
  return {
    ...store,
    coverage: {
      ...store.coverage,
      trackingStartDateKey: dateKey.trim(),
      trackingStartSource: source,
    },
  };
}

// ============================================================================
// SHARED QUERY & COMPUTATION LAYER
// ============================================================================

export interface WeekDoneTaskResult {
  weekStartKey: string;
  weekEndKey: string;
  rangeLabel: string;
  doneTaskCount: number;
  completedTasks: TaskCompletionRecord[];
}

/**
 * Computes Done task card count for a given local Monday-Sunday week.
 * - Counts unique valid TaskCompletionRecords (status === 'done', source === 'today').
 * - Deduplicates strictly by logicalTaskId.
 * - Multi-exercise cards count as 1 Done task.
 * - Manual/external exercise records and rest events are strictly excluded.
 */
export function getWeekDoneTaskCount(
  store: PlanFoundationStore,
  weekRef: Date | string
): WeekDoneTaskResult {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const seenLogicalIds = new Set<string>();
  const completedTasks: TaskCompletionRecord[] = [];

  const sorted = [...store.taskCompletions]
    .filter(
      (t) =>
        t.status === 'done' &&
        t.source === 'today' &&
        isDateKeyInWeek(t.dateKey, bounds.weekStartKey, bounds.weekEndKey)
    )
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  for (const task of sorted) {
    if (seenLogicalIds.has(task.logicalTaskId)) continue;
    seenLogicalIds.add(task.logicalTaskId);
    completedTasks.push(task);
  }

  return {
    weekStartKey: bounds.weekStartKey,
    weekEndKey: bounds.weekEndKey,
    rangeLabel: bounds.rangeLabel,
    doneTaskCount: completedTasks.length,
    completedTasks,
  };
}

export type SevenDayCoverageState = 'covered' | 'unknown' | 'load_failed';
export type SevenDayTrackState =
  | 'done'
  | 'exercise_only'
  | 'rest'
  | 'paused'
  | 'no_record'
  | 'upcoming'
  | 'unknown'
  | 'load_failed';

export interface WeekDayStatus {
  dateKey: string;
  weekdayIndex: number; // 0 = Monday .. 6 = Sunday
  weekdayLetter: 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S';
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  doneTaskCount: number;
  exerciseSessionCount: number;
  habitPracticeIds: string[];
  explicitRest: boolean;
  explicitPaused: boolean;
  explicitEvents: PlanLifecycleEvent[];
  coverageStatus: SevenDayCoverageState;
  dayState: SevenDayTrackState;
}

function isDateExplicitlyPaused(events: PlanLifecycleEvent[], dateKey: string): boolean {
  const relevant = events
    .filter((e) => (e.type === 'pause' || e.type === 'resume') && e.dateKey <= dateKey)
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.occurredAt.localeCompare(b.occurredAt);
    });
  if (relevant.length === 0) return false;
  return relevant[relevant.length - 1].type === 'pause';
}

function getDateCoverageStatus(
  coverage: DataCoverageMetadata,
  dateKey: string
): SevenDayCoverageState {
  for (const fail of coverage.failedLoadRanges) {
    if (
      (fail.startDateKey === null && fail.endDateKey === null) ||
      (fail.startDateKey &&
        fail.endDateKey &&
        dateKey >= fail.startDateKey &&
        dateKey <= fail.endDateKey)
    ) {
      return 'load_failed';
    }
  }
  for (const unk of coverage.unknownRanges) {
    if (dateKey >= unk.startDateKey && dateKey <= unk.endDateKey) {
      return 'unknown';
    }
  }
  if (coverage.trackingStartDateKey && dateKey < coverage.trackingStartDateKey) {
    return 'unknown';
  }
  return 'covered';
}

/**
 * Computes the 7-day Monday-Sunday status array for a given local week.
 * Strictly separates Done tasks, manual exercises, explicit rest, explicit pause,
 * unrecorded days (no_record != paused), and coverage gaps/load failures.
 */
export function getWeekSevenDayStatus(
  store: PlanFoundationStore,
  weekRef: Date | string,
  referenceDate: Date = new Date()
): {
  weekStartKey: string;
  weekEndKey: string;
  rangeLabel: string;
  days: WeekDayStatus[];
} {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const todayKey = toLocalDateKey(referenceDate);
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

  const { completedTasks } = getWeekDoneTaskCount(store, bounds.weekStartKey);

  const days: WeekDayStatus[] = letters.map((weekdayLetter, offset) => {
    const dayDate = addLocalDays(bounds.weekStart, offset);
    const dateKey = toLocalDateKey(dayDate);

    const doneTaskCount = completedTasks.filter((t) => t.dateKey === dateKey).length;
    const exerciseSessionCount = store.exerciseSessions.filter(
      (s) => s.dateKey === dateKey
    ).length;
    const habitPracticeIds = Array.from(
      new Set(
        store.habitPractices.filter((hp) => hp.dateKey === dateKey).map((hp) => hp.habitId)
      )
    );
    const explicitEvents = store.lifecycleEvents.filter((e) => e.dateKey === dateKey);
    const explicitRest = explicitEvents.some((e) => e.type === 'rest');
    const explicitPaused = isDateExplicitlyPaused(store.lifecycleEvents, dateKey);
    const coverageStatus = getDateCoverageStatus(store.coverage, dateKey);

    const isToday = dateKey === todayKey;
    const isPast = dateKey < todayKey;
    const isFuture = dateKey > todayKey;

    let dayState: SevenDayTrackState;
    if (coverageStatus === 'load_failed') {
      dayState = 'load_failed';
    } else if (doneTaskCount > 0) {
      dayState = 'done';
    } else if (exerciseSessionCount > 0) {
      dayState = 'exercise_only';
    } else if (explicitRest) {
      dayState = 'rest';
    } else if (explicitPaused) {
      dayState = 'paused';
    } else if (coverageStatus === 'unknown') {
      dayState = 'unknown';
    } else if (isFuture) {
      dayState = 'upcoming';
    } else {
      dayState = 'no_record';
    }

    return {
      dateKey,
      weekdayIndex: offset,
      weekdayLetter,
      isToday,
      isPast,
      isFuture,
      doneTaskCount,
      exerciseSessionCount,
      habitPracticeIds,
      explicitRest,
      explicitPaused,
      explicitEvents,
      coverageStatus,
      dayState,
    };
  });

  return {
    weekStartKey: bounds.weekStartKey,
    weekEndKey: bounds.weekEndKey,
    rangeLabel: bounds.rangeLabel,
    days,
  };
}

export interface ExerciseTypeWeekSummary {
  exerciseType: ExerciseType;
  sessionCount: number;
  /** Sum of trustworthy actualDurationMinutes ONLY (never planned duration or fake splits) */
  trustworthyDurationMinutes: number;
  trustworthyDurationSessionCount: number;
  unknownDurationSessionCount: number;
  hasCompleteDurationData: boolean;
  sessions: ExerciseSessionRecord[];
}

export interface WeekExerciseSummaryResult {
  weekStartKey: string;
  weekEndKey: string;
  rangeLabel: string;
  totalSessions: number;
  totalTrustworthyDurationMinutes: number;
  trustworthyDurationSessionCount: number;
  unknownDurationSessionCount: number;
  byType: Partial<Record<ExerciseType, ExerciseTypeWeekSummary>>;
  orderedTypes: ExerciseTypeWeekSummary[];
}

/**
 * Computes per-exercise-type session count and trustworthy actual duration for a local Mon-Sun week.
 * - Strictly excludes plannedDurationMinutes from trustworthyDurationMinutes.
 * - Reports unknownDurationSessionCount transparently when actual duration is missing/unknown.
 */
export function getWeekExerciseSummary(
  store: PlanFoundationStore,
  weekRef: Date | string
): WeekExerciseSummaryResult {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const weekSessions = store.exerciseSessions.filter((s) =>
    isDateKeyInWeek(s.dateKey, bounds.weekStartKey, bounds.weekEndKey)
  );

  const byType: Partial<Record<ExerciseType, ExerciseTypeWeekSummary>> = {};
  let totalTrustworthyDurationMinutes = 0;
  let trustworthyDurationSessionCount = 0;
  let unknownDurationSessionCount = 0;

  for (const session of weekSessions) {
    let bucket = byType[session.exerciseType];
    if (!bucket) {
      bucket = {
        exerciseType: session.exerciseType,
        sessionCount: 0,
        trustworthyDurationMinutes: 0,
        trustworthyDurationSessionCount: 0,
        unknownDurationSessionCount: 0,
        hasCompleteDurationData: true,
        sessions: [],
      };
      byType[session.exerciseType] = bucket;
    }

    bucket.sessionCount += 1;
    bucket.sessions.push(session);

    const isTrustworthy =
      session.durationTrust !== 'unknown' &&
      typeof session.actualDurationMinutes === 'number' &&
      Number.isFinite(session.actualDurationMinutes) &&
      session.actualDurationMinutes > 0;

    if (isTrustworthy && session.actualDurationMinutes !== null) {
      bucket.trustworthyDurationMinutes += session.actualDurationMinutes;
      bucket.trustworthyDurationSessionCount += 1;
      totalTrustworthyDurationMinutes += session.actualDurationMinutes;
      trustworthyDurationSessionCount += 1;
    } else {
      bucket.unknownDurationSessionCount += 1;
      bucket.hasCompleteDurationData = false;
      unknownDurationSessionCount += 1;
    }
  }

  const orderedTypes = Object.values(byType)
    .filter((v): v is ExerciseTypeWeekSummary => Boolean(v))
    .sort((a, b) => b.sessionCount - a.sessionCount || a.exerciseType.localeCompare(b.exerciseType));

  return {
    weekStartKey: bounds.weekStartKey,
    weekEndKey: bounds.weekEndKey,
    rangeLabel: bounds.rangeLabel,
    totalSessions: weekSessions.length,
    totalTrustworthyDurationMinutes,
    trustworthyDurationSessionCount,
    unknownDurationSessionCount,
    byType,
    orderedTypes,
  };
}

export interface HabitRollingDayEntry {
  dateKey: string;
  practiced: boolean;
  recordCount: number;
  records: HabitPracticeRecord[];
  actionTiers: ActionTier[];
}

export interface HabitRolling7DayResult {
  habitId: string;
  windowStartDateKey: string;
  windowEndDateKey: string;
  /** Number of distinct local dates (0..7) with >= 1 valid HabitPracticeRecord */
  practicedDaysCount: number;
  /** Total raw source records retained across the 7-day window */
  totalSourceRecords: number;
  days: HabitRollingDayEntry[];
}

/**
 * Computes rolling 7-day recorded practice days for a single habitId.
 * - Local 7-day window: [referenceDate - 6 days .. referenceDate].
 * - Both 'minimum' and 'regular' actions count equally as valid practice.
 * - Multiple sources on the same day are retained in raw records, but deduplicated
 *   by local dateKey so that day counts as 1 practice day.
 * - Longer duration never increases practicedDaysCount.
 */
export function getHabitRolling7DayPractice(
  store: PlanFoundationStore,
  habitId: string,
  referenceDate: Date | string = new Date()
): HabitRolling7DayResult {
  const cleanHabitId = habitId.trim();
  const refDate =
    typeof referenceDate === 'string'
      ? parseLocalDateKey(referenceDate) ?? new Date()
      : new Date(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          referenceDate.getDate()
        );

  const windowStartDate = addLocalDays(refDate, -6);
  const windowStartDateKey = toLocalDateKey(windowStartDate);
  const windowEndDateKey = toLocalDateKey(refDate);

  const relevantRecords = store.habitPractices.filter(
    (hp) =>
      hp.habitId === cleanHabitId &&
      hp.dateKey >= windowStartDateKey &&
      hp.dateKey <= windowEndDateKey
  );

  const byDate = new Map<string, HabitPracticeRecord[]>();
  for (const rec of relevantRecords) {
    const list = byDate.get(rec.dateKey) ?? [];
    list.push(rec);
    byDate.set(rec.dateKey, list);
  }

  const days: HabitRollingDayEntry[] = [];
  let practicedDaysCount = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = toLocalDateKey(addLocalDays(windowStartDate, offset));
    const records = byDate.get(dateKey) ?? [];
    const practiced = records.length > 0;
    if (practiced) practicedDaysCount += 1;

    days.push({
      dateKey,
      practiced,
      recordCount: records.length,
      records,
      actionTiers: Array.from(new Set(records.map((r) => r.actionTier))),
    });
  }

  return {
    habitId: cleanHabitId,
    windowStartDateKey,
    windowEndDateKey,
    practicedDaysCount,
    totalSourceRecords: relevantRecords.length,
    days,
  };
}

// ============================================================================
// BACKWARD-COMPATIBILITY PROJECTIONS FOR EXISTING UI COMPONENTS
// ============================================================================

/**
 * Projects official user TaskCompletionRecords (status === 'done') and manual/external
 * ExerciseSessionRecords into legacy ActivityCompletionRecord[] for existing History views.
 * Never includes demo/sample data and never fabricates durations.
 */
export function projectLegacyActivityRecords(
  store: PlanFoundationStore
): ActivityCompletionRecord[] {
  const projected: ActivityCompletionRecord[] = [];

  for (const tc of store.taskCompletions) {
    if (tc.status !== 'done') continue;
    const primarySeg = tc.exerciseSegments[0];
    const primaryType = primarySeg?.exerciseType ?? 'other';
    // Only sum trustworthy actual durations across segments if all are trustworthy; else 0 (never planned duration)
    const trustworthyMinutes = tc.exerciseSegments.reduce((sum, seg) => {
      if (
        seg.durationTrust &&
        seg.durationTrust !== 'unknown' &&
        typeof seg.actualDurationMinutes === 'number' &&
        seg.actualDurationMinutes > 0
      ) {
        return sum + seg.actualDurationMinutes;
      }
      return sum;
    }, 0);

    projected.push({
      id: tc.id,
      sourceKey: tc.logicalTaskId,
      source: 'today',
      ...(tc.cardId ? { cardId: tc.cardId } : {}),
      planId: tc.planId,
      title: tc.title,
      category: mapExerciseTypeToLegacyCategory(primaryType),
      durationMinutes: trustworthyMinutes,
      completedAt: tc.completedAt,
      dateKey: tc.dateKey,
      hasExactTimestamp: tc.hasExactTimestamp,
      ...(tc.note ? { note: tc.note } : {}),
      isSample: false,
    });
  }

  for (const session of store.exerciseSessions) {
    if (session.source === 'today_task') continue;
    projected.push({
      id: session.id,
      source: 'manual',
      title: session.title,
      category: mapExerciseTypeToLegacyCategory(session.exerciseType),
      durationMinutes:
        session.durationTrust !== 'unknown' && session.actualDurationMinutes !== null
          ? session.actualDurationMinutes
          : 0,
      completedAt: session.occurredAt,
      dateKey: session.dateKey,
      hasExactTimestamp: session.hasExactTimestamp,
      ...(session.note ? { note: session.note } : {}),
      isSample: false,
    });
  }

  return projected;
}

/**
 * Projects explicit 'rest' lifecycleEvents into legacy RestRecord[] for existing views.
 */
export function projectLegacyRestRecords(store: PlanFoundationStore): RestRecord[] {
  return store.lifecycleEvents
    .filter((e) => e.type === 'rest')
    .map((e) => ({
      id: e.legacyRestRecordId || e.id,
      dateKey: e.dateKey,
      source: e.source === 'today' ? 'today' : 'manual',
      title: e.title || 'Mindful rest day',
      ...(e.note ? { note: e.note } : {}),
      createdAt: e.occurredAt,
      isSample: false,
    }));
}

/**
 * Projects weekly review entries for DEFAULT_WEEKLY_REVIEW_QUESTION_ID into
 * legacy Record<weekStartKey, WeeklyReviewFeedback>.
 */
export function projectLegacyWeeklyReviewFeedbacks(
  store: PlanFoundationStore
): Record<string, WeeklyReviewFeedback> {
  const result: Record<string, WeeklyReviewFeedback> = {};
  for (const review of Object.values(store.weeklyReviews)) {
    if (review.questionId !== DEFAULT_WEEKLY_REVIEW_QUESTION_ID || !review.feeling) continue;
    result[review.weekStartKey] = {
      weekStartKey: review.weekStartKey,
      feeling: review.feeling,
      updatedAt: review.updatedAt,
    };
  }
  return result;
}

// ============================================================================
// HEALTHKIT WORKOUT TYPE SUMMARY & WEEKLY BROWSING SNAPSHOT ("THIS WEEK")
// ============================================================================

const PLAN_SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const PLAN_FULL_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export interface ResolvedWorkoutType {
  key: string;
  label: string;
  isHealthKitType: boolean;
  isRawPreserved: boolean;
}

const HEALTHKIT_WORKOUT_TYPE_CATALOG: Record<
  string,
  { key: string; label: string; isHealthKitType: boolean }
> = {
  walking: { key: 'walking', label: 'Walking', isHealthKitType: true },
  walk: { key: 'walking', label: 'Walking', isHealthKitType: true },
  indoorwalking: { key: 'walking', label: 'Walking', isHealthKitType: true },
  outdoorwalking: { key: 'walking', label: 'Walking', isHealthKitType: true },
  indoorwalk: { key: 'walking', label: 'Walking', isHealthKitType: true },
  outdoorwalk: { key: 'walking', label: 'Walking', isHealthKitType: true },
  flexibility: { key: 'flexibility', label: 'Flexibility', isHealthKitType: true },
  stretch: { key: 'flexibility', label: 'Flexibility', isHealthKitType: true },
  stretching: { key: 'flexibility', label: 'Flexibility', isHealthKitType: true },
  mobility: { key: 'flexibility', label: 'Flexibility', isHealthKitType: true },
  yoga: { key: 'yoga', label: 'Yoga', isHealthKitType: true },
  running: { key: 'running', label: 'Running', isHealthKitType: true },
  run: { key: 'running', label: 'Running', isHealthKitType: true },
  indoorrunning: { key: 'running', label: 'Running', isHealthKitType: true },
  outdoorrunning: { key: 'running', label: 'Running', isHealthKitType: true },
  indoorrun: { key: 'running', label: 'Running', isHealthKitType: true },
  outdoorrun: { key: 'running', label: 'Running', isHealthKitType: true },
  cycling: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  bike: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  biking: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  indoorcycling: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  outdoorcycling: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  indoorbike: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  outdoorbike: { key: 'cycling', label: 'Cycling', isHealthKitType: true },
  functionalstrengthtraining: {
    key: 'functionalStrengthTraining',
    label: 'Functional Strength',
    isHealthKitType: true,
  },
  traditionalstrengthtraining: {
    key: 'traditionalStrengthTraining',
    label: 'Strength Training',
    isHealthKitType: true,
  },
  strength: {
    key: 'traditionalStrengthTraining',
    label: 'Strength Training',
    isHealthKitType: true,
  },
  strengthtraining: {
    key: 'traditionalStrengthTraining',
    label: 'Strength Training',
    isHealthKitType: true,
  },
  coretraining: { key: 'coreTraining', label: 'Core Training', isHealthKitType: true },
  core: { key: 'coreTraining', label: 'Core Training', isHealthKitType: true },
  pilates: { key: 'pilates', label: 'Pilates', isHealthKitType: true },
  hiking: { key: 'hiking', label: 'Hiking', isHealthKitType: true },
  hike: { key: 'hiking', label: 'Hiking', isHealthKitType: true },
  swimming: { key: 'swimming', label: 'Swimming', isHealthKitType: true },
  swim: { key: 'swimming', label: 'Swimming', isHealthKitType: true },
  indoorswimming: { key: 'swimming', label: 'Swimming', isHealthKitType: true },
  openwaterswimming: { key: 'swimming', label: 'Swimming', isHealthKitType: true },
  elliptical: { key: 'elliptical', label: 'Elliptical', isHealthKitType: true },
  rowing: { key: 'rowing', label: 'Rowing', isHealthKitType: true },
  indoorrowing: { key: 'rowing', label: 'Rowing', isHealthKitType: true },
  dance: { key: 'dance', label: 'Dance', isHealthKitType: true },
  cardiodance: { key: 'dance', label: 'Dance', isHealthKitType: true },
  socialdance: { key: 'dance', label: 'Dance', isHealthKitType: true },
  stairs: { key: 'stairs', label: 'Stairs', isHealthKitType: true },
  stairclimbing: { key: 'stairClimbing', label: 'Stair Climbing', isHealthKitType: true },
  highintensityintervaltraining: {
    key: 'highIntensityIntervalTraining',
    label: 'HIIT',
    isHealthKitType: true,
  },
  hiit: {
    key: 'highIntensityIntervalTraining',
    label: 'HIIT',
    isHealthKitType: true,
  },
  mixedcardio: { key: 'mixedCardio', label: 'Mixed Cardio', isHealthKitType: true },
  cardio: { key: 'mixedCardio', label: 'Mixed Cardio', isHealthKitType: true },
  mindandbody: { key: 'mindAndBody', label: 'Mind & Body', isHealthKitType: true },
  taichi: { key: 'taiChi', label: 'Tai Chi', isHealthKitType: true },
  cooldown: { key: 'cooldown', label: 'Cooldown', isHealthKitType: true },
  barre: { key: 'barre', label: 'Barre', isHealthKitType: true },
  boxing: { key: 'boxing', label: 'Boxing', isHealthKitType: true },
  jumprope: { key: 'jumpRope', label: 'Jump Rope', isHealthKitType: true },
  tennis: { key: 'tennis', label: 'Tennis', isHealthKitType: true },
  pickleball: { key: 'pickleball', label: 'Pickleball', isHealthKitType: true },
  badminton: { key: 'badminton', label: 'Badminton', isHealthKitType: true },
  basketball: { key: 'basketball', label: 'Basketball', isHealthKitType: true },
  soccer: { key: 'soccer', label: 'Soccer', isHealthKitType: true },
  crosstraining: { key: 'crossTraining', label: 'Cross Training', isHealthKitType: true },
  // Pure breathing is kept strictly distinct and NEVER auto-mapped to mindAndBody
  breathing: { key: 'breathing', label: 'Breathing', isHealthKitType: false },
  breath: { key: 'breathing', label: 'Breathing', isHealthKitType: false },
  breathwork: { key: 'breathing', label: 'Breathing', isHealthKitType: false },
};

function normalizeWorkoutToken(raw: string): string {
  return raw
    .trim()
    .replace(/^HKWorkoutActivityType/i, '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

/**
 * Resolves a task segment or exercise session into a specific HealthKit HKWorkoutActivityType
 * display bucket (or preserved verbatim raw type).
 *
 * Guarantees:
 * - Rest is never treated as a workout (returns null).
 * - Indoor/outdoor is treated as context metadata only and never splits primary workout types.
 * - Pure breathing is never auto-mapped to mindAndBody.
 * - Unknown or historical raw workout types preserve their original value without guessing.
 */
export function resolveWorkoutActivityType(input: {
  exerciseType?: ExerciseType | string;
  workoutActivityType?: string;
  rawTypeLabel?: string;
}): ResolvedWorkoutType | null {
  const explicitRaw =
    typeof input.workoutActivityType === 'string' ? input.workoutActivityType.trim() : '';
  const explicitLabel =
    typeof input.rawTypeLabel === 'string' ? input.rawTypeLabel.trim() : '';

  if (explicitRaw) {
    const token = normalizeWorkoutToken(explicitRaw);
    if (token === 'rest' || token === 'restday' || token === 'mindfulrest') {
      return null;
    }
    const known = HEALTHKIT_WORKOUT_TYPE_CATALOG[token];
    if (known) {
      return {
        key: known.key,
        label: known.label,
        isHealthKitType: known.isHealthKitType,
        isRawPreserved: false,
      };
    }
    // Preserve unknown/historical raw type verbatim — NEVER coerce into another HK type
    const preservedLabel = explicitLabel || explicitRaw;
    return {
      key: `raw:${explicitRaw.toLowerCase()}`,
      label: preservedLabel,
      isHealthKitType: false,
      isRawPreserved: true,
    };
  }

  const exType = typeof input.exerciseType === 'string' ? input.exerciseType.trim() : '';
  const exToken = normalizeWorkoutToken(exType);
  if (exToken === 'rest' || exToken === 'restday') {
    return null;
  }

  if (exToken && exToken !== 'other') {
    const known = HEALTHKIT_WORKOUT_TYPE_CATALOG[exToken];
    if (known) {
      return {
        key: known.key,
        label: known.label,
        isHealthKitType: known.isHealthKitType,
        isRawPreserved: false,
      };
    }
  }

  if (explicitLabel) {
    if (normalizeWorkoutToken(explicitLabel) === 'rest') return null;
    return {
      key: `raw:${explicitLabel.toLowerCase()}`,
      label: explicitLabel,
      isHealthKitType: false,
      isRawPreserved: true,
    };
  }

  return {
    key: 'other',
    label: 'Other',
    isHealthKitType: false,
    isRawPreserved: true,
  };
}

export interface WeekWorkoutTypeRow {
  key: string;
  label: string;
  count: number;
  /** Sum of trustworthy actual duration minutes ONLY (never planned duration or duplicated total) */
  trustworthyDurationMinutes: number;
  trustworthyDurationCount: number;
  unknownDurationCount: number;
  /** True only when every counted record in this bucket has trustworthy actual duration > 0 */
  hasCompleteDurationData: boolean;
  isHealthKitType: boolean;
  isRawPreserved: boolean;
  sourceRecordIds: string[];
}

export interface WeekWorkoutTypeSummaryResult {
  weekStartKey: string;
  weekEndKey: string;
  allTypes: WeekWorkoutTypeRow[];
  topTypes: WeekWorkoutTypeRow[];
  hasMoreTypes: boolean;
  totalTypeCount: number;
}

/**
 * Aggregates specific workout types for a local Monday-Sunday week.
 * - Multi-type single task card increments each distinct workout type by 1.
 * - Same-type multiple segments inside one task card merge into 1 count for that card.
 * - Standalone manual/external exercise sessions are included here without inflating Done count.
 * - Rest records are excluded.
 * - Pure breathing is never merged into mindAndBody.
 * - Only trustworthy actual durations are summed; planned duration is strictly excluded.
 * - Sorted by count descending, then stable alphabetical label ascending.
 */
export function getWeekWorkoutTypeSummary(
  store: PlanFoundationStore,
  weekRef: Date | string
): WeekWorkoutTypeSummaryResult {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const { completedTasks } = getWeekDoneTaskCount(store, bounds.weekStartKey);

  const buckets = new Map<string, WeekWorkoutTypeRow>();

  const ensureBucket = (resolved: ResolvedWorkoutType): WeekWorkoutTypeRow => {
    let bucket = buckets.get(resolved.key);
    if (!bucket) {
      bucket = {
        key: resolved.key,
        label: resolved.label,
        count: 0,
        trustworthyDurationMinutes: 0,
        trustworthyDurationCount: 0,
        unknownDurationCount: 0,
        hasCompleteDurationData: true,
        isHealthKitType: resolved.isHealthKitType,
        isRawPreserved: resolved.isRawPreserved,
        sourceRecordIds: [],
      };
      buckets.set(resolved.key, bucket);
    }
    return bucket;
  };

  // 1. Deduplicated Done task cards (1 count per distinct workout type per logical task card)
  for (const task of completedTasks) {
    const segments = task.exerciseSegments.length > 0
      ? task.exerciseSegments
      : [{ exerciseType: 'other' as ExerciseType, title: task.title }];

    // Group segments inside this single card by resolved workout type key
    const perCardByType = new Map<
      string,
      {
        resolved: ResolvedWorkoutType;
        trustworthyMinutes: number;
        allTrustworthy: boolean;
      }
    >();

    for (const seg of segments) {
      const resolved = resolveWorkoutActivityType({
        exerciseType: seg.exerciseType,
        workoutActivityType: seg.workoutActivityType,
        rawTypeLabel: seg.rawTypeLabel,
      });
      if (!resolved) continue;

      const isTrustworthy =
        seg.durationTrust !== undefined &&
        seg.durationTrust !== 'unknown' &&
        typeof seg.actualDurationMinutes === 'number' &&
        Number.isFinite(seg.actualDurationMinutes) &&
        seg.actualDurationMinutes > 0;

      const existing = perCardByType.get(resolved.key);
      if (!existing) {
        perCardByType.set(resolved.key, {
          resolved,
          trustworthyMinutes: isTrustworthy ? seg.actualDurationMinutes! : 0,
          allTrustworthy: isTrustworthy,
        });
      } else {
        if (isTrustworthy) {
          existing.trustworthyMinutes += seg.actualDurationMinutes!;
        } else {
          existing.allTrustworthy = false;
        }
      }
    }

    for (const entry of perCardByType.values()) {
      const bucket = ensureBucket(entry.resolved);
      bucket.count += 1;
      bucket.sourceRecordIds.push(task.id);
      if (entry.allTrustworthy && entry.trustworthyMinutes > 0) {
        bucket.trustworthyDurationMinutes += entry.trustworthyMinutes;
        bucket.trustworthyDurationCount += 1;
      } else {
        bucket.unknownDurationCount += 1;
        bucket.hasCompleteDurationData = false;
      }
    }
  }

  // 2. Standalone manual / external_import actual exercise sessions (never counted in Done tasks)
  const standaloneSessions = store.exerciseSessions.filter(
    (s) =>
      s.source !== 'today_task' &&
      isDateKeyInWeek(s.dateKey, bounds.weekStartKey, bounds.weekEndKey)
  );

  for (const session of standaloneSessions) {
    const resolved = resolveWorkoutActivityType({
      exerciseType: session.exerciseType,
      workoutActivityType: session.workoutActivityType,
      rawTypeLabel: session.rawTypeLabel,
    });
    if (!resolved) continue;

    const bucket = ensureBucket(resolved);
    bucket.count += 1;
    bucket.sourceRecordIds.push(session.id);

    const isTrustworthy =
      session.durationTrust !== 'unknown' &&
      typeof session.actualDurationMinutes === 'number' &&
      Number.isFinite(session.actualDurationMinutes) &&
      session.actualDurationMinutes > 0;

    if (isTrustworthy && session.actualDurationMinutes !== null) {
      bucket.trustworthyDurationMinutes += session.actualDurationMinutes;
      bucket.trustworthyDurationCount += 1;
    } else {
      bucket.unknownDurationCount += 1;
      bucket.hasCompleteDurationData = false;
    }
  }

  const allTypes = Array.from(buckets.values()).sort(
    (a, b) =>
      b.count - a.count ||
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) ||
      a.key.localeCompare(b.key)
  );

  return {
    weekStartKey: bounds.weekStartKey,
    weekEndKey: bounds.weekEndKey,
    allTypes,
    topTypes: allTypes.slice(0, 3),
    hasMoreTypes: allTypes.length > 3,
    totalTypeCount: allTypes.length,
  };
}

/**
 * Shifts a local Monday dateKey by deltaWeeks * 7 local days cleanly across DST boundaries.
 */
export function shiftLocalWeekStartKey(weekStartKey: string, deltaWeeks: number): string {
  const parsed = parseLocalDateKey(weekStartKey);
  const baseBounds = parsed ? getLocalWeekBounds(parsed) : getLocalWeekBounds(new Date());
  const shifted = addLocalDays(baseBounds.weekStart, deltaWeeks * 7);
  return getLocalWeekBounds(shifted).weekStartKey;
}

/**
 * Computes exact integer week offset (0 = current week, -1 = last week, -2 = 2 weeks ago)
 * using UTC midnight normalization so DST changes never cause off-by-one errors.
 */
export function getWeekOffsetFromCurrent(
  weekStartKey: string,
  referenceDate: Date = new Date()
): number {
  const currentBounds = getLocalWeekBounds(referenceDate);
  const selectedBounds = resolveWeekBoundsFromRef(weekStartKey);
  const curUtc = Date.UTC(
    currentBounds.weekStart.getFullYear(),
    currentBounds.weekStart.getMonth(),
    currentBounds.weekStart.getDate()
  );
  const selUtc = Date.UTC(
    selectedBounds.weekStart.getFullYear(),
    selectedBounds.weekStart.getMonth(),
    selectedBounds.weekStart.getDate()
  );
  return Math.round((selUtc - curUtc) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Formats a local Monday-Sunday week range label dynamically:
 * - Same year & same month: "Nov 16–22"
 * - Same year & cross-month: "Nov 30–Dec 6"
 * - Cross-year: "Dec 29, 2025–Jan 4, 2026"
 * - Prior calendar year (different from referenceDate): "Dec 15–21, 2025" or "Nov 24–Dec 1, 2025"
 */
export function formatPlanWeekRangeLabel(
  weekRef: Date | string,
  referenceDate: Date = new Date()
): string {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const s = bounds.weekStart;
  const e = bounds.weekEnd;
  const refYear = referenceDate.getFullYear();
  const sMonth = PLAN_SHORT_MONTHS[s.getMonth()];
  const eMonth = PLAN_SHORT_MONTHS[e.getMonth()];

  if (s.getFullYear() !== e.getFullYear()) {
    return `${sMonth} ${s.getDate()}, ${s.getFullYear()}–${eMonth} ${e.getDate()}, ${e.getFullYear()}`;
  }

  const sameMonth = s.getMonth() === e.getMonth();
  const baseRange = sameMonth
    ? `${sMonth} ${s.getDate()}–${e.getDate()}`
    : `${sMonth} ${s.getDate()}–${eMonth} ${e.getDate()}`;

  if (s.getFullYear() !== refYear) {
    return `${baseRange}, ${s.getFullYear()}`;
  }
  return baseRange;
}

/**
 * Formats the dynamic week module title:
 * - Current week: "This week"
 * - Previous week: "Last week"
 * - Earlier weeks: "Week of Nov 9" (includes year if different from referenceDate year, e.g. "Week of Dec 29, 2025")
 */
export function formatDynamicWeekTitle(
  weekRef: Date | string,
  referenceDate: Date = new Date()
): string {
  const bounds = resolveWeekBoundsFromRef(weekRef);
  const offset = getWeekOffsetFromCurrent(bounds.weekStartKey, referenceDate);
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  const s = bounds.weekStart;
  const monthDay = `${PLAN_SHORT_MONTHS[s.getMonth()]} ${s.getDate()}`;
  if (s.getFullYear() !== referenceDate.getFullYear()) {
    return `Week of ${monthDay}, ${s.getFullYear()}`;
  }
  return `Week of ${monthDay}`;
}

export interface PlanWeekNavigationBounds {
  currentWeekStartKey: string;
  minWeekStartKey: string;
  maxWeekStartKey: string;
  isHistoryCoverageKnown: boolean;
  trackingStartDateKey: string | null;
}

/**
 * Determines trustworthy week navigation boundaries without EVER inferring trackingStartDateKey
 * from the earliest Done record.
 * - When trackingStartDateKey is confirmed: allows stepping continuously down to the week
 *   containing trackingStartDateKey (never skipping empty weeks).
 * - When trackingStartDateKey is unknown: never allows infinite stepping into empty weeks;
 *   caps navigation at the earliest week with an actual historical record (or current week if none),
 *   and flags isHistoryCoverageKnown = false so the UI explicitly explains earlier records are unavailable.
 */
export function getPlanWeekNavigationBounds(
  store: PlanFoundationStore,
  referenceDate: Date = new Date()
): PlanWeekNavigationBounds {
  const currentBounds = getLocalWeekBounds(referenceDate);
  const currentWeekStartKey = currentBounds.weekStartKey;
  const trackingStartDateKey =
    store.coverage.trackingStartDateKey &&
    store.coverage.trackingStartSource !== 'unknown' &&
    isValidLocalDateKey(store.coverage.trackingStartDateKey)
      ? store.coverage.trackingStartDateKey
      : null;

  if (trackingStartDateKey) {
    const startDt = parseLocalDateKey(trackingStartDateKey)!;
    const trackingWeekKey = getLocalWeekBounds(startDt).weekStartKey;
    const minWeekStartKey =
      trackingWeekKey <= currentWeekStartKey ? trackingWeekKey : currentWeekStartKey;
    return {
      currentWeekStartKey,
      minWeekStartKey,
      maxWeekStartKey: currentWeekStartKey,
      isHistoryCoverageKnown: true,
      trackingStartDateKey,
    };
  }

  // Coverage start is unknown — NEVER fabricate trackingStartDateKey or allow infinite empty weeks.
  // Only allow stepping back as far as weeks that actually contain a recorded user item.
  let earliestRecordWeekKey: string | null = null;
  const considerDateKey = (dateKey: string) => {
    const dt = parseLocalDateKey(dateKey);
    if (!dt) return;
    const wk = getLocalWeekBounds(dt).weekStartKey;
    if (wk < currentWeekStartKey && (!earliestRecordWeekKey || wk < earliestRecordWeekKey)) {
      earliestRecordWeekKey = wk;
    }
  };

  for (const tc of store.taskCompletions) {
    if (tc.status === 'done' && tc.source === 'today') {
      considerDateKey(tc.dateKey);
    }
  }
  for (const s of store.exerciseSessions) {
    considerDateKey(s.dateKey);
  }
  for (const ev of store.lifecycleEvents) {
    if (ev.type === 'rest') {
      considerDateKey(ev.dateKey);
    }
  }

  return {
    currentWeekStartKey,
    minWeekStartKey: earliestRecordWeekKey ?? currentWeekStartKey,
    maxWeekStartKey: currentWeekStartKey,
    isHistoryCoverageKnown: false,
    trackingStartDateKey: null,
  };
}

export type PlanWeekDayVisualState = 'done' | 'rest' | 'past' | 'future' | 'unknown';

export interface PlanWeekDaySnapshot {
  dateKey: string;
  weekdayIndex: number;
  weekdayLetter: 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S';
  weekdayFullName: string;
  dayNumber: number;
  /** True ONLY for today inside the current week; historical weeks never highlight today */
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  doneTaskCount: number;
  standaloneExerciseCount: number;
  explicitRest: boolean;
  coverageStatus: SevenDayCoverageState;
  visualState: PlanWeekDayVisualState;
  ariaLabel: string;
}

export interface PlanWeekActivityItem {
  id: string;
  kind: 'task' | 'exercise' | 'rest';
  dateKey: string;
  occurredAt: string;
  hasExactTimestamp: boolean;
  title: string;
  /** Resolved workout type keys for filtering (empty for rest) */
  workoutTypeKeys: string[];
  /** Human-readable workout type labels (empty for rest) */
  workoutTypeLabels: string[];
  /** Trustworthy actual duration in minutes ONLY; null when unmeasured/unknown */
  trustworthyDurationMinutes: number | null;
  sourceLabel: string;
  note?: string;
}

export interface PlanWeekSnapshot {
  weekStartKey: string;
  weekEndKey: string;
  weekOffset: number;
  isCurrentWeek: boolean;
  title: string;
  rangeLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  isHistoryCoverageKnown: boolean;
  showEarlierUnavailableNote: boolean;
  /** True when the selected week has no confirmed coverage and no Done/Rest records (never display as "0 tasks completed") */
  isWeekCoverageUnknown: boolean;
  hasLoadFailure: boolean;
  doneTaskCount: number;
  completedTasks: TaskCompletionRecord[];
  standaloneSessions: ExerciseSessionRecord[];
  restEvents: PlanLifecycleEvent[];
  days: PlanWeekDaySnapshot[];
  workoutSummary: WeekWorkoutTypeSummaryResult;
  activityItems: PlanWeekActivityItem[];
}

/**
 * Produces a complete, synchronously consistent snapshot for the Plan page's "This week"
 * module for any selected local Monday-Sunday week.
 *
 * Strictly enforces:
 * - Never navigates into future weeks.
 * - Never infers trackingStartDateKey from earliest Done record.
 * - Never shows unknown coverage as "0 tasks completed".
 * - Manual/external exercise records count in workoutSummary, NEVER in doneTaskCount or Done dot.
 * - Only current week highlights today's date number.
 */
export function getPlanWeekSnapshot(
  store: PlanFoundationStore,
  selectedWeekRef: Date | string,
  referenceDate: Date = new Date()
): PlanWeekSnapshot {
  const navBounds = getPlanWeekNavigationBounds(store, referenceDate);
  const rawBounds = resolveWeekBoundsFromRef(selectedWeekRef);
  // Clamp against future weeks
  const clampedStartKey =
    rawBounds.weekStartKey > navBounds.maxWeekStartKey
      ? navBounds.maxWeekStartKey
      : rawBounds.weekStartKey;
  const bounds = resolveWeekBoundsFromRef(clampedStartKey);

  const weekOffset = getWeekOffsetFromCurrent(bounds.weekStartKey, referenceDate);
  const isCurrentWeek = weekOffset === 0;
  const todayKey = toLocalDateKey(referenceDate);

  const { doneTaskCount, completedTasks } = getWeekDoneTaskCount(store, bounds.weekStartKey);
  const standaloneSessions = store.exerciseSessions.filter(
    (s) =>
      s.source !== 'today_task' &&
      isDateKeyInWeek(s.dateKey, bounds.weekStartKey, bounds.weekEndKey)
  );
  const restEvents = store.lifecycleEvents.filter(
    (e) =>
      e.type === 'rest' &&
      isDateKeyInWeek(e.dateKey, bounds.weekStartKey, bounds.weekEndKey)
  );

  const workoutSummary = getWeekWorkoutTypeSummary(store, bounds.weekStartKey);

  const doneCountByDate = new Map<string, number>();
  for (const tc of completedTasks) {
    doneCountByDate.set(tc.dateKey, (doneCountByDate.get(tc.dateKey) ?? 0) + 1);
  }
  const standaloneCountByDate = new Map<string, number>();
  for (const s of standaloneSessions) {
    standaloneCountByDate.set(s.dateKey, (standaloneCountByDate.get(s.dateKey) ?? 0) + 1);
  }
  const restDateSet = new Set<string>(restEvents.map((e) => e.dateKey));

  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
  let hasLoadFailure = false;

  const days: PlanWeekDaySnapshot[] = letters.map((weekdayLetter, offset) => {
    const dayDate = addLocalDays(bounds.weekStart, offset);
    const dateKey = toLocalDateKey(dayDate);
    const dayNumber = dayDate.getDate();
    const isToday = isCurrentWeek && dateKey === todayKey;
    const isPast = dateKey < todayKey;
    const isFuture = dateKey > todayKey;

    const dayDoneCount = doneCountByDate.get(dateKey) ?? 0;
    const dayStandaloneCount = standaloneCountByDate.get(dateKey) ?? 0;
    const explicitRest = restDateSet.has(dateKey);

    let coverageStatus = getDateCoverageStatus(store.coverage, dateKey);
    if (coverageStatus === 'load_failed') {
      hasLoadFailure = true;
    } else if (!navBounds.isHistoryCoverageKnown && !isCurrentWeek) {
      // Historical week with unknown trackingStartDateKey cannot be assumed covered
      coverageStatus = 'unknown';
    }

    let visualState: PlanWeekDayVisualState;
    if (coverageStatus === 'load_failed') {
      visualState = 'unknown';
    } else if (dayDoneCount > 0) {
      visualState = 'done';
    } else if (explicitRest) {
      visualState = 'rest';
    } else if (coverageStatus === 'unknown') {
      visualState = 'unknown';
    } else if (isPast) {
      visualState = 'past';
    } else {
      visualState = 'future';
    }

    const monthDayLabel = `${PLAN_SHORT_MONTHS[dayDate.getMonth()]} ${dayNumber}`;
    const dateText = `${PLAN_FULL_WEEKDAYS[offset]}, ${monthDayLabel}${isToday ? ' (Today)' : ''}`;
    let statusText: string;
    if (coverageStatus === 'load_failed') {
      statusText = 'Unable to load records';
    } else if (dayDoneCount > 0) {
      statusText = `${dayDoneCount} ${dayDoneCount === 1 ? 'task' : 'tasks'} completed`;
    } else if (explicitRest) {
      statusText = 'Rest day';
    } else if (visualState === 'unknown') {
      statusText =
        dayStandaloneCount > 0
          ? `Earlier task records unavailable (${dayStandaloneCount} ${
              dayStandaloneCount === 1 ? 'workout' : 'workouts'
            } logged)`
          : 'Records unavailable';
    } else if (isPast) {
      statusText =
        dayStandaloneCount > 0
          ? `No tasks completed (${dayStandaloneCount} ${
              dayStandaloneCount === 1 ? 'workout' : 'workouts'
            } logged)`
          : 'No tasks completed';
    } else if (isToday) {
      statusText =
        dayStandaloneCount > 0
          ? `No tasks completed yet (${dayStandaloneCount} ${
              dayStandaloneCount === 1 ? 'workout' : 'workouts'
            } logged)`
          : 'No tasks completed yet';
    } else {
      statusText = 'Upcoming';
    }

    return {
      dateKey,
      weekdayIndex: offset,
      weekdayLetter,
      weekdayFullName: PLAN_FULL_WEEKDAYS[offset],
      dayNumber,
      isToday,
      isPast,
      isFuture,
      doneTaskCount: dayDoneCount,
      standaloneExerciseCount: dayStandaloneCount,
      explicitRest,
      coverageStatus,
      visualState,
      ariaLabel: `${dateText}: ${statusText}`,
    };
  });

  const nonFutureDays = days.filter((d) => !d.isFuture);
  const allNonFutureUncovered =
    nonFutureDays.length > 0 && nonFutureDays.every((d) => d.coverageStatus !== 'covered');
  const isWeekCoverageUnknown =
    hasLoadFailure || (doneTaskCount === 0 && restEvents.length === 0 && allNonFutureUncovered);

  // Build unified selected-week activity items for the "View activity" / workout filter sheet
  const activityItems: PlanWeekActivityItem[] = [];

  for (const tc of completedTasks) {
    const segs = tc.exerciseSegments.length > 0
      ? tc.exerciseSegments
      : [{ exerciseType: 'other' as ExerciseType, title: tc.title }];

    const typeKeys: string[] = [];
    const typeLabels: string[] = [];
    const seenKeys = new Set<string>();
    let allSegsTrustworthy = segs.length > 0;
    let totalActual = 0;

    for (const seg of segs) {
      const resolved = resolveWorkoutActivityType({
        exerciseType: seg.exerciseType,
        workoutActivityType: seg.workoutActivityType,
        rawTypeLabel: seg.rawTypeLabel,
      });
      if (resolved && !seenKeys.has(resolved.key)) {
        seenKeys.add(resolved.key);
        typeKeys.push(resolved.key);
        typeLabels.push(resolved.label);
      }
      const isTrustworthy =
        seg.durationTrust !== undefined &&
        seg.durationTrust !== 'unknown' &&
        typeof seg.actualDurationMinutes === 'number' &&
        seg.actualDurationMinutes > 0;
      if (isTrustworthy) {
        totalActual += seg.actualDurationMinutes!;
      } else {
        allSegsTrustworthy = false;
      }
    }

    activityItems.push({
      id: tc.id,
      kind: 'task',
      dateKey: tc.dateKey,
      occurredAt: tc.completedAt,
      hasExactTimestamp: tc.hasExactTimestamp,
      title: tc.title,
      workoutTypeKeys: typeKeys,
      workoutTypeLabels: typeLabels,
      trustworthyDurationMinutes: allSegsTrustworthy && totalActual > 0 ? totalActual : null,
      sourceLabel: 'Task completed',
      ...(tc.note ? { note: tc.note } : {}),
    });
  }

  for (const s of standaloneSessions) {
    const resolved = resolveWorkoutActivityType({
      exerciseType: s.exerciseType,
      workoutActivityType: s.workoutActivityType,
      rawTypeLabel: s.rawTypeLabel,
    });
    const isTrustworthy =
      s.durationTrust !== 'unknown' &&
      typeof s.actualDurationMinutes === 'number' &&
      s.actualDurationMinutes > 0;

    activityItems.push({
      id: s.id,
      kind: 'exercise',
      dateKey: s.dateKey,
      occurredAt: s.occurredAt,
      hasExactTimestamp: s.hasExactTimestamp,
      title: s.title,
      workoutTypeKeys: resolved ? [resolved.key] : [],
      workoutTypeLabels: resolved ? [resolved.label] : [],
      trustworthyDurationMinutes: isTrustworthy ? s.actualDurationMinutes : null,
      sourceLabel: s.source === 'external_import' ? 'Imported workout' : 'Logged workout',
      ...(s.note ? { note: s.note } : {}),
    });
  }

  for (const ev of restEvents) {
    activityItems.push({
      id: ev.id,
      kind: 'rest',
      dateKey: ev.dateKey,
      occurredAt: ev.occurredAt,
      hasExactTimestamp: false,
      title: ev.title || 'Rest day',
      workoutTypeKeys: [],
      workoutTypeLabels: [],
      trustworthyDurationMinutes: null,
      sourceLabel: 'Rest',
      ...(ev.note ? { note: ev.note } : {}),
    });
  }

  activityItems.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });

  const canGoPrevious = bounds.weekStartKey > navBounds.minWeekStartKey;
  const canGoNext = bounds.weekStartKey < navBounds.maxWeekStartKey;

  return {
    weekStartKey: bounds.weekStartKey,
    weekEndKey: bounds.weekEndKey,
    weekOffset,
    isCurrentWeek,
    title: formatDynamicWeekTitle(bounds.weekStartKey, referenceDate),
    rangeLabel: formatPlanWeekRangeLabel(bounds.weekStartKey, referenceDate),
    canGoPrevious,
    canGoNext,
    isHistoryCoverageKnown: navBounds.isHistoryCoverageKnown,
    showEarlierUnavailableNote: !canGoPrevious && !navBounds.isHistoryCoverageKnown,
    isWeekCoverageUnknown,
    hasLoadFailure,
    doneTaskCount,
    completedTasks,
    standaloneSessions,
    restEvents,
    days,
    workoutSummary,
    activityItems,
  };
}

// ============================================================================
// YOUR RHYTHM — SINGLE-HABIT ROLLING 7-DAY CURVE & PRIORITY STATUS ENGINE
// ============================================================================

export function computeHabitConfigFingerprint(strategy: {
  regularAction: string;
  minimumAction?: string;
}): string {
  const reg = strategy.regularAction.trim().toLowerCase().replace(/\s+/g, ' ');
  const min = (strategy.minimumAction ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${reg}||${min}`;
}

export function getConfirmedHabits(store: PlanFoundationStore): ConfirmedActionStrategy[] {
  if (!store.commitment || store.commitment.status === 'draft') return [];
  if (!Array.isArray(store.commitment.strategies)) return [];
  return store.commitment.strategies.filter(
    (s) => s && typeof s.habitId === 'string' && s.habitId.trim().length > 0 && s.label.trim().length > 0
  );
}

/**
 * Explicitly confirms or updates a user habit strategy inside commitment.strategies.
 * - Never silently creates a habit without explicit user confirmation.
 * - Modifying regularAction or minimumAction increments strategy.version (v1 -> v2)
 *   so prior self-report check-ins stay historical and never masquerade as new-config feelings.
 * - Sets confirmable trackingStartDateKey only when explicitly provided and not yet set.
 */
export function confirmHabitStrategy(
  store: PlanFoundationStore,
  input: {
    habitId?: string;
    label: string;
    regularAction: string;
    minimumAction?: string;
    frequencyDescription?: string;
    confirmTrackingStartDateKey?: string;
    timestamp?: string;
  }
): { store: PlanFoundationStore; strategy: ConfirmedActionStrategy } {
  const nowIso = input.timestamp ?? new Date().toISOString();
  const cleanLabel = input.label.trim();
  const cleanRegular = input.regularAction.trim() || cleanLabel;
  const cleanMinimum = input.minimumAction?.trim() || undefined;
  const cleanFrequency = input.frequencyDescription?.trim() || 'At your own pace';

  const existingStrategies = store.commitment?.strategies ?? [];
  const targetHabitId =
    input.habitId?.trim() ||
    `habit::${cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'custom'}-${Date.now().toString(36).slice(-4)}`;

  const prevStrategy = existingStrategies.find((s) => s.habitId === targetHabitId);

  let nextVersion = 'v1';
  if (prevStrategy) {
    const prevFp = computeHabitConfigFingerprint(prevStrategy);
    const nextFp = computeHabitConfigFingerprint({
      regularAction: cleanRegular,
      minimumAction: cleanMinimum,
    });
    if (prevFp !== nextFp) {
      const m = /^v(\d+)$/i.exec(prevStrategy.version);
      const prevNum = m ? Number(m[1]) : 1;
      nextVersion = `v${prevNum + 1}`;
    } else {
      nextVersion = prevStrategy.version || 'v1';
    }
  }

  const strategy: ConfirmedActionStrategy = {
    habitId: targetHabitId,
    label: cleanLabel,
    regularAction: cleanRegular,
    ...(cleanMinimum ? { minimumAction: cleanMinimum } : {}),
    frequencyDescription: cleanFrequency,
    frequencyIsDescriptiveOnly: true,
    version: nextVersion,
    confirmedAt: nowIso,
  };

  const nextStrategies = prevStrategy
    ? existingStrategies.map((s) => (s.habitId === targetHabitId ? strategy : s))
    : [...existingStrategies, strategy];

  const prevCommitment = store.commitment;
  const { store: nextStore } = upsertPhaseCommitment(store, {
    phaseId: prevCommitment?.phaseId ?? 'active-focus',
    phaseName: prevCommitment?.phaseName ?? 'Active focus',
    originalIntent: prevCommitment?.originalIntent ?? cleanLabel,
    summary: prevCommitment?.summary?.trim() ? prevCommitment.summary : cleanLabel,
    strategySummary: prevCommitment?.strategySummary ?? null,
    strategies: nextStrategies,
    status: prevCommitment?.status && prevCommitment.status !== 'draft' ? prevCommitment.status : 'active',
    lastEventKind: prevStrategy ? 'adjusted' : prevCommitment ? prevCommitment.lastEventKind ?? 'started' : 'started',
    confirmTrackingStartDateKey: input.confirmTrackingStartDateKey,
    timestamp: nowIso,
  });

  // If action config actually changed on an existing habit, record an explicit strategy_adjustment event
  let finalStore = nextStore;
  if (prevStrategy && nextVersion !== prevStrategy.version) {
    const adjDateKey = input.confirmTrackingStartDateKey ?? toLocalDateKey(new Date(nowIso));
    finalStore = recordLifecycleEvent(nextStore, {
      type: 'strategy_adjustment',
      dateKey: adjDateKey,
      occurredAt: nowIso,
      source: 'plan',
      habitId: targetHabitId,
      title: `Updated ${cleanLabel}`,
    }).store;
  }

  return { store: finalStore, strategy };
}

/**
 * Persists an explicit user self-report check-in strictly scoped to (habitId, habitVersion,
 * configFingerprint, questionId). Never infers feelings from Done counts.
 */
export function recordHabitCheckIn(
  store: PlanFoundationStore,
  input: {
    id?: string;
    habitId: string;
    habitVersion?: string;
    configFingerprint?: string;
    questionId?: string;
    frictionLevel?: HabitStartFrictionLevel;
    requestedAdjustment?: boolean;
    isReturnReview?: boolean;
    relatedResumeEventId?: string;
    dateKey: string;
    recordedAt?: string;
  }
): { store: PlanFoundationStore; checkIn: HabitSelfReportCheckIn } {
  const habitId = input.habitId.trim();
  const matchedStrategy = getConfirmedHabits(store).find((s) => s.habitId === habitId);
  const habitVersion = input.habitVersion?.trim() || matchedStrategy?.version || 'v1';
  const configFingerprint =
    input.configFingerprint?.trim() ||
    (matchedStrategy ? computeHabitConfigFingerprint(matchedStrategy) : 'default');
  const questionId = input.questionId?.trim() || DEFAULT_HABIT_EASE_QUESTION_ID;
  const dateKey = input.dateKey.trim();
  const recordedAt = input.recordedAt ?? new Date().toISOString();

  const checkIn: HabitSelfReportCheckIn = {
    id: input.id?.trim() || createUniqueId('hci', dateKey),
    habitId,
    habitVersion,
    configFingerprint,
    questionId,
    ...(input.frictionLevel ? { frictionLevel: input.frictionLevel } : {}),
    ...(typeof input.requestedAdjustment === 'boolean'
      ? { requestedAdjustment: input.requestedAdjustment }
      : {}),
    ...(input.isReturnReview ? { isReturnReview: true } : {}),
    ...(input.relatedResumeEventId ? { relatedResumeEventId: input.relatedResumeEventId } : {}),
    dateKey,
    recordedAt,
  };

  const prevList = Array.isArray(store.habitCheckIns) ? store.habitCheckIns : [];
  return {
    store: {
      ...store,
      habitCheckIns: [...prevList.filter((c) => c.id !== checkIn.id), checkIn],
    },
    checkIn,
  };
}

const FRICTION_RANK: Record<HabitStartFrictionLevel, number> = {
  hard_to_start: 0,
  manageable: 1,
  easier: 2,
};

/**
 * Returns true ONLY when supported by at least two explicit self-report check-ins for:
 * - the exact same habitId,
 * - the exact same comparable config (habitVersion + configFingerprint),
 * - the exact same questionId,
 * where the latest rating strictly improved over an earlier rating (and is not hard_to_start).
 * Strictly NEVER inferred from Done task counts.
 */
export function hasStartingFeelsEasierEvidence(
  store: PlanFoundationStore,
  habitId: string,
  habitVersion: string,
  configFingerprint: string,
  questionId: string = DEFAULT_HABIT_EASE_QUESTION_ID
): boolean {
  const list = Array.isArray(store.habitCheckIns) ? store.habitCheckIns : [];
  const comparable = list
    .filter(
      (c) =>
        c.habitId === habitId &&
        c.habitVersion === habitVersion &&
        c.configFingerprint === configFingerprint &&
        c.questionId === questionId &&
        c.frictionLevel !== undefined
    )
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.recordedAt.localeCompare(b.recordedAt);
    });

  if (comparable.length < 2) return false;
  const latest = comparable[comparable.length - 1];
  if (!latest.frictionLevel || latest.frictionLevel === 'hard_to_start') return false;
  const latestRank = FRICTION_RANK[latest.frictionLevel];
  return comparable
    .slice(0, -1)
    .some((earlier) => earlier.frictionLevel !== undefined && FRICTION_RANK[earlier.frictionLevel] < latestRank);
}

export type HabitRhythmStatusCode =
  | 'unavailable'
  | 'paused'
  | 'ready'
  | 'finding_way_back'
  | 'beginning'
  | 'make_room'
  | 'finding_rhythm';

export type HabitRhythmNullReason =
  | 'insufficient_history'
  | 'unknown_coverage'
  | 'load_failed';

export interface HabitRhythmPoint {
  index: number; // 0..29 (oldest ended day -> latest ended day)
  dateKey: string; // Ended local YYYY-MM-DD
  shortDateLabel: string; // e.g. "Nov 22"
  windowStartDateKey: string; // t - 6 days
  /** 0..7 distinct practice days in [t-6, t]; null when any day in [t-6, t] lacks known coverage */
  value: number | null;
  nullReason?: HabitRhythmNullReason;
}

export interface HabitRhythmModel {
  habitId: string;
  habitLabel: string;
  habitVersion: string;
  configFingerprint: string;
  statusCode: HabitRhythmStatusCode;
  statusLabel:
    | 'Rhythm unavailable'
    | 'Taking a pause'
    | 'Ready when you are'
    | 'Finding your way back'
    | 'A beginning'
    | 'Let’s make room'
    | 'Finding a rhythm';
  hasQueryFailure: boolean;
  isExplicitlyPaused: boolean;
  pausedOnDateKey: string | null;
  resumedOnDateKey: string | null;
  /** Always 30 ended local calendar days ending yesterday (today is strictly excluded) */
  points: HabitRhythmPoint[];
  /** Contiguous runs of non-null points (breaks cleanly across unknown/insufficient/failed gaps) */
  segments: HabitRhythmPoint[][];
  validPointCount: number;
  hasChartData: boolean;
  latestEndedDateKey: string;
  latestEndedShortLabel: string;
  latestValidPoint: HabitRhythmPoint | null;
  /** True when any point inside the 30-day window after the first valid point is null (mid-series gap) */
  hasCoverageGap: boolean;
  todayInProgress: {
    dateKey: string;
    shortDateLabel: string;
    hasPracticeToday: boolean;
    practiceCountToday: number;
  };
  /** All distinct local dates (<= todayKey) with >= 1 valid practice record for this habit */
  distinctPracticeDates: string[];
  /** Distinct practice dates formatted concisely (e.g. ["Nov 20", "Nov 22"]) */
  formattedPracticeDates: string[];
  /** Single-source numeric summary synced with latestValidPoint and its actual through date */
  numericSummary: string;
  /** Optional strictly factual basis (max 2 lines in UI); null when none applies */
  factualBasis: string | null;
  /** True ONLY when backed by 2 comparable explicit self-reports showing improvement */
  startingFeelsEasierSupported: boolean;
  /** Accessible text summary describing the chart for assistive technology */
  accessibleChartSummary: string;
}

function formatShortLocalDateKey(dateKey: string): string {
  const dt = parseLocalDateKey(dateKey);
  if (!dt) return dateKey;
  return `${PLAN_SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

function getHabitDayCoverageStatus(
  coverage: DataCoverageMetadata,
  dateKey: string
): SevenDayCoverageState {
  for (const fail of coverage.failedLoadRanges) {
    if (
      (fail.startDateKey === null && fail.endDateKey === null) ||
      (fail.startDateKey &&
        fail.endDateKey &&
        dateKey >= fail.startDateKey &&
        dateKey <= fail.endDateKey)
    ) {
      return 'load_failed';
    }
  }
  for (const unk of coverage.unknownRanges) {
    if (dateKey >= unk.startDateKey && dateKey <= unk.endDateKey) {
      return 'unknown';
    }
  }
  if (!coverage.trackingStartDateKey || coverage.trackingStartSource === 'unknown') {
    return 'unknown';
  }
  if (dateKey < coverage.trackingStartDateKey) {
    return 'unknown';
  }
  return 'covered';
}

/**
 * Computes the complete "Your rhythm" model for a single user-confirmed habitId:
 * - Rolling 7-day curve over the last 30 ended local calendar days (today excluded, shown separately as in progress).
 * - Strictly requires full 7-day known coverage [t-6, t] for each point; any missing/unknown/failed day yields null (breaks line, never zero-fills).
 * - Deduplicates same-day practices (multiple cards on 1 day = 1 day); minimum & regular actions count equally.
 * - Rest, pause, and skip never generate practices.
 * - Evaluates status strictly in priority order 1 -> 7.
 */
export function getHabitRhythmModel(
  store: PlanFoundationStore,
  habitId: string,
  referenceDate: Date = new Date(),
  options?: { forceQueryFailed?: boolean }
): HabitRhythmModel {
  const cleanHabitId = habitId.trim();
  const matchedStrategy = getConfirmedHabits(store).find((s) => s.habitId === cleanHabitId);
  const habitLabel = matchedStrategy?.label ?? cleanHabitId;
  const habitVersion = matchedStrategy?.version ?? 'v1';
  const configFingerprint = matchedStrategy
    ? computeHabitConfigFingerprint(matchedStrategy)
    : 'default';

  const todayDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const todayKey = toLocalDateKey(todayDate);
  const todayShortLabel = formatShortLocalDateKey(todayKey);
  const latestEndedDate = addLocalDays(todayDate, -1);
  const latestEndedDateKey = toLocalDateKey(latestEndedDate);
  const latestEndedShortLabel = formatShortLocalDateKey(latestEndedDateKey);

  // Check if any failedLoadRanges impact the 36-day query window [latestEnded - 35 .. today]
  const rawWindowStartKey = toLocalDateKey(addLocalDays(latestEndedDate, -35));
  const hasFailedLoadInWindow =
    Boolean(options?.forceQueryFailed) ||
    store.coverage.failedLoadRanges.some((fail) => {
      if (fail.startDateKey === null && fail.endDateKey === null) return true;
      if (fail.startDateKey && fail.endDateKey) {
        return fail.startDateKey <= todayKey && fail.endDateKey >= rawWindowStartKey;
      }
      return true;
    });

  // Gather valid HabitPracticeRecords for this exact habitId (dates <= todayKey)
  const habitRecords = store.habitPractices.filter(
    (hp) => hp.habitId === cleanHabitId && hp.dateKey <= todayKey
  );

  const practiceDatesSet = new Set<string>();
  let practiceCountToday = 0;
  for (const rec of habitRecords) {
    practiceDatesSet.add(rec.dateKey);
    if (rec.dateKey === todayKey) {
      practiceCountToday += 1;
    }
  }
  const distinctPracticeDates = Array.from(practiceDatesSet).sort((a, b) => a.localeCompare(b));
  const formattedPracticeDates = distinctPracticeDates.map(formatShortLocalDateKey);

  // Build 30 ended local days [latestEnded - 29 .. latestEnded]
  const points: HabitRhythmPoint[] = [];
  const trackingStartKey =
    store.coverage.trackingStartDateKey && store.coverage.trackingStartSource !== 'unknown'
      ? store.coverage.trackingStartDateKey
      : null;

  for (let i = 0; i < 30; i += 1) {
    const tDate = addLocalDays(latestEndedDate, -(29 - i));
    const tKey = toLocalDateKey(tDate);
    const wStartDate = addLocalDays(tDate, -6);
    const wStartKey = toLocalDateKey(wStartDate);

    let nullReason: HabitRhythmNullReason | undefined;
    if (hasFailedLoadInWindow) {
      nullReason = 'load_failed';
    } else {
      for (let dOff = 0; dOff < 7; dOff += 1) {
        const dKey = toLocalDateKey(addLocalDays(wStartDate, dOff));
        const dayCov = getHabitDayCoverageStatus(store.coverage, dKey);
        if (dayCov === 'load_failed') {
          nullReason = 'load_failed';
          break;
        }
        if (dayCov === 'unknown') {
          if (trackingStartKey && dKey < trackingStartKey) {
            nullReason = 'insufficient_history';
          } else {
            nullReason = 'unknown_coverage';
          }
          break;
        }
      }
    }

    let value: number | null = null;
    if (!nullReason) {
      let daysWithPractice = 0;
      for (let dOff = 0; dOff < 7; dOff += 1) {
        const dKey = toLocalDateKey(addLocalDays(wStartDate, dOff));
        if (practiceDatesSet.has(dKey)) {
          daysWithPractice += 1;
        }
      }
      value = daysWithPractice;
    }

    points.push({
      index: i,
      dateKey: tKey,
      shortDateLabel: formatShortLocalDateKey(tKey),
      windowStartDateKey: wStartKey,
      value,
      ...(nullReason ? { nullReason } : {}),
    });
  }

  // Split points into contiguous non-null segments (never bridge across null!)
  const segments: HabitRhythmPoint[][] = [];
  let currentRun: HabitRhythmPoint[] = [];
  for (const pt of points) {
    if (pt.value !== null) {
      currentRun.push(pt);
    } else if (currentRun.length > 0) {
      segments.push(currentRun);
      currentRun = [];
    }
  }
  if (currentRun.length > 0) {
    segments.push(currentRun);
  }

  const validPoints = points.filter((p) => p.value !== null);
  const validPointCount = validPoints.length;
  const hasChartData = validPointCount > 0;
  const latestValidPoint = validPointCount > 0 ? validPoints[validPointCount - 1] : null;

  const firstValidIdx = points.findIndex((p) => p.value !== null);
  const hasCoverageGap =
    firstValidIdx >= 0 && points.slice(firstValidIdx).some((p) => p.value === null);

  // Lifecycle pause / resume state for this habit (global or habit-scoped)
  const pauseResumeEvents = store.lifecycleEvents
    .filter(
      (e) =>
        (e.type === 'pause' || e.type === 'resume') &&
        e.dateKey <= todayKey &&
        (!e.habitId || e.habitId === cleanHabitId)
    )
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.occurredAt.localeCompare(b.occurredAt);
    });

  const latestPauseResume =
    pauseResumeEvents.length > 0 ? pauseResumeEvents[pauseResumeEvents.length - 1] : null;
  const isExplicitlyPaused = latestPauseResume?.type === 'pause';
  const pausedOnDateKey = isExplicitlyPaused ? latestPauseResume!.dateKey : null;
  const latestResumeEvent = latestPauseResume?.type === 'resume' ? latestPauseResume : null;
  const resumedOnDateKey = latestResumeEvent ? latestResumeEvent.dateKey : null;

  // Check if user has practice on/after resume and has NOT completed the corresponding return review
  const checkIns = Array.isArray(store.habitCheckIns) ? store.habitCheckIns : [];
  let isFindingWayBack = false;
  if (latestResumeEvent) {
    const hasPracticeAfterResume = habitRecords.some((hp) => {
      if (hp.dateKey > latestResumeEvent.dateKey) return true;
      if (hp.dateKey === latestResumeEvent.dateKey) {
        return hp.occurredAt >= latestResumeEvent.occurredAt;
      }
      return false;
    });
    const hasCompletedReturnReview =
      checkIns.some(
        (c) =>
          c.habitId === cleanHabitId &&
          c.isReturnReview === true &&
          (c.relatedResumeEventId === latestResumeEvent.id ||
            c.recordedAt >= latestResumeEvent.occurredAt)
      ) ||
      Object.values(store.weeklyReviews).some(
        (r) =>
          r.questionId === 'return_review' &&
          r.updatedAt >= latestResumeEvent.occurredAt
      );
    isFindingWayBack = hasPracticeAfterResume && !hasCompletedReturnReview;
  }

  // Check current-config self-report feedback ("Hard to start" or explicit adjustment request)
  // Strictly scoped to current habitVersion + configFingerprint so old feedback stays historical!
  const currentConfigCheckIns = checkIns
    .filter(
      (c) =>
        c.habitId === cleanHabitId &&
        c.habitVersion === habitVersion &&
        c.configFingerprint === configFingerprint &&
        c.dateKey <= todayKey
    )
    .sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
      return a.recordedAt.localeCompare(b.recordedAt);
    });

  const latestEaseCheckIn = [...currentConfigCheckIns]
    .reverse()
    .find((c) => c.questionId === DEFAULT_HABIT_EASE_QUESTION_ID && c.frictionLevel !== undefined);

  const latestAdjustmentEvent = store.lifecycleEvents
    .filter(
      (e) =>
        e.type === 'strategy_adjustment' &&
        e.dateKey <= todayKey &&
        (!e.habitId || e.habitId === cleanHabitId)
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];

  const hasPendingAdjustmentRequest =
    currentConfigCheckIns.some(
      (c) =>
        c.requestedAdjustment === true &&
        (!latestAdjustmentEvent || c.recordedAt > latestAdjustmentEvent.occurredAt)
    ) || store.commitment?.reviewRequested === true;

  const hasHardToStartCurrentConfig = latestEaseCheckIn?.frictionLevel === 'hard_to_start';
  const needsRoom = hasHardToStartCurrentConfig || hasPendingAdjustmentRequest;

  const startingFeelsEasierSupported = hasStartingFeelsEasierEvidence(
    store,
    cleanHabitId,
    habitVersion,
    configFingerprint,
    DEFAULT_HABIT_EASE_QUESTION_ID
  );

  // Strict priority order 1 -> 7
  let statusCode: HabitRhythmStatusCode;
  let statusLabel: HabitRhythmModel['statusLabel'];

  if (hasFailedLoadInWindow) {
    statusCode = 'unavailable';
    statusLabel = 'Rhythm unavailable';
  } else if (isExplicitlyPaused) {
    statusCode = 'paused';
    statusLabel = 'Taking a pause';
  } else if (distinctPracticeDates.length === 0) {
    statusCode = 'ready';
    statusLabel = 'Ready when you are';
  } else if (isFindingWayBack) {
    statusCode = 'finding_way_back';
    statusLabel = 'Finding your way back';
  } else if (distinctPracticeDates.length === 1 || validPointCount === 0) {
    statusCode = 'beginning';
    statusLabel = 'A beginning';
  } else if (needsRoom) {
    statusCode = 'make_room';
    statusLabel = 'Let’s make room';
  } else {
    statusCode = 'finding_rhythm';
    statusLabel = 'Finding a rhythm';
  }

  // Single-source numeric summary synced directly with latestValidPoint & actual through-date
  let numericSummary: string;
  if (statusCode === 'unavailable') {
    numericSummary = 'Unable to calculate your 7-day rhythm right now.';
  } else if (latestValidPoint !== null && latestValidPoint.value !== null) {
    if (latestValidPoint.value === 0) {
      numericSummary = `0 recorded days in the 7 days through ${latestValidPoint.shortDateLabel}.`;
    } else if (latestValidPoint.value === 1) {
      numericSummary = `1 day in the 7 days through ${latestValidPoint.shortDateLabel}.`;
    } else {
      numericSummary = `${latestValidPoint.value} days in the 7 days through ${latestValidPoint.shortDateLabel}.`;
    }
  } else if (distinctPracticeDates.length === 0) {
    numericSummary = '0 recorded days so far.';
  } else if (distinctPracticeDates.length === 1) {
    numericSummary = `1 recorded day so far (${formattedPracticeDates[0]}).`;
  } else {
    numericSummary = `${distinctPracticeDates.length} recorded days so far.`;
  }

  // Optional strictly factual basis (max 2 lines in UI; never fabricated or inferred from Done counts)
  let factualBasis: string | null = null;
  if (statusCode === 'unavailable') {
    factualBasis = null;
  } else if (statusCode === 'paused' && pausedOnDateKey) {
    factualBasis = `Paused on ${formatShortLocalDateKey(pausedOnDateKey)}. Ready whenever you choose to return.`;
  } else if (statusCode === 'finding_way_back') {
    factualBasis = !hasChartData
      ? `Resumed on ${formatShortLocalDateKey(resumedOnDateKey!)}. Needs 7 covered days before the rolling curve appears.`
      : `Resumed on ${formatShortLocalDateKey(resumedOnDateKey!)}.`;
  } else if (statusCode === 'make_room') {
    factualBasis = hasHardToStartCurrentConfig
      ? 'You noted starting felt hard on your current setup.'
      : 'You asked to adjust how this habit fits.';
  } else if (startingFeelsEasierSupported) {
    factualBasis = 'You said starting feels easier.';
  } else if (hasCoverageGap && hasChartData) {
    factualBasis = 'Gaps in the line mark days without full 7-day coverage.';
  } else if (statusCode === 'beginning' && !hasChartData) {
    factualBasis = 'Unrecorded days are not counted as missing movement.';
  }

  // Accessible chart summary text for screen readers
  const firstPointLabel = points[0]?.shortDateLabel ?? '';
  const accessibleChartSummary = !hasChartData
    ? `${habitLabel}: ${statusLabel}. ${numericSummary}`
    : `${habitLabel}: ${statusLabel}. Rolling 7-day days with movement from ${firstPointLabel} through ${
        latestValidPoint?.shortDateLabel ?? latestEndedShortLabel
      }. Latest value: ${latestValidPoint?.value ?? 0} of 7 days.${
        hasCoverageGap ? ' Contains coverage gaps shown as breaks in the line.' : ''
      } Today (${todayShortLabel}) is in progress and not included in the ended-day curve.`;

  return {
    habitId: cleanHabitId,
    habitLabel,
    habitVersion,
    configFingerprint,
    statusCode,
    statusLabel,
    hasQueryFailure: hasFailedLoadInWindow,
    isExplicitlyPaused,
    pausedOnDateKey,
    resumedOnDateKey,
    points,
    segments,
    validPointCount,
    hasChartData,
    latestEndedDateKey,
    latestEndedShortLabel,
    latestValidPoint,
    hasCoverageGap,
    todayInProgress: {
      dateKey: todayKey,
      shortDateLabel: todayShortLabel,
      hasPracticeToday: practiceCountToday > 0,
      practiceCountToday,
    },
    distinctPracticeDates,
    formattedPracticeDates,
    numericSummary,
    factualBasis,
    startingFeelsEasierSupported,
    accessibleChartSummary,
  };
}


