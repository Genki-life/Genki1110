import {
  addLocalDays,
  buildDateOnlyIso,
  getLastCompletedWeekBounds,
  getLocalWeekBounds,
  toLocalDateKey,
} from './weeklyPlanStore';
import {
  PlanFoundationStore,
  StorageLike,
  completeTaskCard,
  createEmptyPlanFoundationStore,
  recordLifecycleEvent,
  upsertPhaseCommitment,
} from './planDataFoundation';

export const PROTOTYPE_DEMO_SEED_VERSION = '2026-11.v5-this-week-9-workouts';
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

export interface IsolatedPlanPreviewFixture {
  readonly isTestFixture: true;
  readonly fixtureLabel: 'TEST_PREVIEW_FIXTURE';
  readonly storageNamespace: typeof PREVIEW_FIXTURE_STORAGE_PREFIX;
  readonly generatedAt: string;
  readonly generatedDateKey: string;
  readonly store: PlanFoundationStore;
}

interface PersistedPreviewProfilePayload {
  profileId: string;
  profileVersion: string;
  generatedDateKey: string;
  savedAt: string;
  store: PlanFoundationStore;
}

/**
 * Deprecated legacy auto-seeder retained solely as a safe no-op for import compatibility.
 * Official user storage MUST NOT be populated with simulated demo history.
 */
export function initializePrototypeDemoData(_referenceDate: Date = new Date()): void {
  // Intentionally a no-op: never write simulated demo history into official user localStorage.
}

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

export function getPreviewProfileStorageKey(profileId: string): string {
  const clean = profileId.trim().toLowerCase() || PLAN_REVIEW_PREVIEW_PROFILE_ID;
  return `${PREVIEW_FIXTURE_STORAGE_PREFIX}${clean}`;
}

function isAiStudioDevPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
  if (/^ais-(dev|pre)-[a-z0-9-]+\.run\.app$/i.test(host)) return true;
  return false;
}

function isViteDevMode(): boolean {
  try {
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } })?.env?.DEV);
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
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(PLAN_PREVIEW_RESET_PARAM)?.trim().toLowerCase();
    return raw === '1' || raw === 'true';
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
  } catch {
    // ignore
  }
  return 'Today';
}

function addLocalTimeIso(dateKey: string, hour: number, minute: number): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return buildDateOnlyIso(dateKey);
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2], hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Builds a reproducible, strictly isolated Plan preview profile relative to the user's
 * local calendar day (`referenceDate`):
 * - Confirmed commitment: "Get back into running"
 * - Confirmed starting strategy: "Start with three short walks a week."
 * - Tracked habit: "Short walks" (regular: 15-minute short walk, minimum: 2-minute walk)
 * - Known coverage >= 36 completed natural days (42 completed days) with varied practice frequency
 * - Last 7 completed days [-7..-1] have EXACTLY 3 distinct Short walks practice dates,
 *   including 1 day (-7) with 2 independent Done cards so Your rhythm deduplicates to 3 days.
 * - Current week, last week, and 2 weeks ago each have distinct Done task counts and workout types,
 *   including a Walk + Stretch combo card (1 Done task, 2 exercise records).
 * - Traceable Your journey events: Began again, First small step, Made it smaller (2-min walk),
 *   minimum action practiced, Took a pause, Came back + post-resume practice.
 * - Last completed week has movement records and an unanswered Weekly review ready for review.
 */
export function createIsolatedPlanPreviewFixture(
  referenceDate: Date = new Date()
): IsolatedPlanPreviewFixture {
  const localToday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const todayKey = toLocalDateKey(localToday);
  const dow = (localToday.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  const dayKey = (offsetDays: number): string => toLocalDateKey(addLocalDays(localToday, offsetDays));

  // Verify calendar week boundaries via shared weeklyPlanStore helpers
  const currentWeek = getLocalWeekBounds(localToday);
  const lastWeek = getLastCompletedWeekBounds(localToday);
  const currentWeekStartOffset = -dow;
  const twoWeeksAgoStartOffset = -(dow + 14);
  const lastWeekStartOffset = -(dow + 7);
  const trackingStartOffset = -42; // 42 completed natural days >= 36 required for full 30d rolling chart
  const trackingStartKey = dayKey(trackingStartOffset);

  let store = createEmptyPlanFoundationStore();
  store.isTestFixture = true;
  store.fixtureLabel = 'TEST_PREVIEW_FIXTURE';
  store.migratedAt = addLocalTimeIso(trackingStartKey, 8, 0);

  // 1. Confirmed phase commitment & tracked habit ("Short walks")
  const commitmentCreatedAt = addLocalTimeIso(trackingStartKey, 8, 15);
  const minActionConfirmedKey = dayKey(-29);
  const commitRes = upsertPhaseCommitment(store, {
    phaseId: 'start-small',
    phaseName: 'Start small',
    originalIntent: 'I want to get back into running without burning out or rushing back too fast.',
    summary: 'Get back into running',
    strategySummary: 'Start with three short walks a week.',
    strategies: [
      {
        habitId: PREVIEW_SHORT_WALKS_HABIT_ID,
        label: 'Short walks',
        regularAction: '15-minute short walk',
        minimumAction: '2-minute walk',
        frequencyDescription: 'Three times a week',
        frequencyIsDescriptiveOnly: true,
        version: 'v2',
        confirmedAt: addLocalTimeIso(minActionConfirmedKey, 9, 0),
      },
    ],
    status: 'active',
    lastEventKind: 'started',
    confirmTrackingStartDateKey: trackingStartKey,
    timestamp: commitmentCreatedAt,
  });
  store = commitRes.store;
  // Preserve deterministic id and original createdAt while reflecting v2 after minimum-action confirmation
  if (store.commitment) {
    store = {
      ...store,
      commitment: {
        ...store.commitment,
        id: 'preview-commitment::get-back-into-running',
        version: 2,
        createdAt: commitmentCreatedAt,
        updatedAt: addLocalTimeIso(minActionConfirmedKey, 9, 0),
      },
    };
  }

  // Helper for adding a Done short walk card (regular or minimum)
  const addWalkCard = (
    offsetDays: number,
    suffix: string,
    tier: 'regular' | 'minimum',
    version: 'v1' | 'v2',
    hour: number,
    title?: string
  ) => {
    const dk = dayKey(offsetDays);
    const isMin = tier === 'minimum';
    const cardTitle = title ?? (isMin ? '2-minute walk' : '15-minute short walk');
    const mins = isMin ? 2 : 15;
    store = completeTaskCard(store, {
      logicalTaskId: `preview-task::${dk}::${suffix}`,
      dateKey: dk,
      completedAt: addLocalTimeIso(dk, hour, 15),
      hasExactTimestamp: true,
      planId: isMin ? 'walk-minimum-2m' : 'walk-short-15m',
      title: cardTitle,
      exerciseSegments: [
        {
          exerciseType: 'walk',
          workoutActivityType: 'HKWorkoutActivityTypeWalking',
          locationContext: 'outdoor',
          title: cardTitle,
          plannedDurationMinutes: mins,
          actualDurationMinutes: mins,
          durationTrust: 'user_reported_actual',
          linkedHabitId: PREVIEW_SHORT_WALKS_HABIT_ID,
        },
      ],
      linkedHabitIds: [PREVIEW_SHORT_WALKS_HABIT_ID],
      actionTier: tier,
      actionVersion: version,
    }).store;
  };

  // Helper for adding a multi-exercise combo task card (1 Done task, 2 explicit exercise segments)
  const addComboTaskCard = (
    offsetDays: number,
    suffix: string,
    opts: {
      planId: string;
      title: string;
      hour: number;
      minute?: number;
      segments: Array<{
        exerciseType: 'walk' | 'stretch' | 'mobility' | 'strength' | 'cardio' | 'other';
        workoutActivityType: string;
        locationContext: 'indoor' | 'outdoor';
        title: string;
        minutes: number;
        linkedHabitId: string | null;
      }>;
    }
  ) => {
    const dk = dayKey(offsetDays);
    const linkedIds = Array.from(
      new Set(opts.segments.map((s) => s.linkedHabitId).filter((id): id is string => Boolean(id)))
    );
    store = completeTaskCard(store, {
      logicalTaskId: `preview-task::${dk}::${suffix}`,
      dateKey: dk,
      completedAt: addLocalTimeIso(dk, opts.hour, opts.minute ?? 20),
      hasExactTimestamp: true,
      planId: opts.planId,
      title: opts.title,
      exerciseSegments: opts.segments.map((s) => ({
        exerciseType: s.exerciseType,
        workoutActivityType: s.workoutActivityType,
        locationContext: s.locationContext,
        title: s.title,
        plannedDurationMinutes: s.minutes,
        actualDurationMinutes: s.minutes,
        durationTrust: 'user_reported_actual',
        linkedHabitId: s.linkedHabitId,
      })),
      linkedHabitIds: linkedIds,
      actionTier: 'regular',
      actionVersion: 'v2',
    }).store;
  };

  // Helper for unlinked supporting movement cards (distinct types across weeks, never alter Short walks count)
  const addUnlinkedCard = (
    offsetDays: number,
    suffix: string,
    opts: {
      planId: string;
      title: string;
      exerciseType: 'mobility' | 'strength' | 'cardio' | 'other' | 'stretch';
      workoutActivityType?: string;
      minutes: number;
      hour: number;
    }
  ) => {
    const dk = dayKey(offsetDays);
    store = completeTaskCard(store, {
      logicalTaskId: `preview-task::${dk}::${suffix}`,
      dateKey: dk,
      completedAt: addLocalTimeIso(dk, opts.hour, 30),
      hasExactTimestamp: true,
      planId: opts.planId,
      title: opts.title,
      exerciseSegments: [
        {
          exerciseType: opts.exerciseType,
          ...(opts.workoutActivityType ? { workoutActivityType: opts.workoutActivityType } : {}),
          locationContext: 'indoor',
          title: opts.title,
          plannedDurationMinutes: opts.minutes,
          actualDurationMinutes: opts.minutes,
          durationTrust: 'user_reported_actual',
          linkedHabitId: null,
        },
      ],
      linkedHabitIds: [],
    }).store;
  };

  // ============================================================================
  // 2. EARLY HISTORY (-40..-22): First practice, building rhythm, confirm minimum action, pause & resume
  // ============================================================================
  // First practice (traceable "First small step" in Your journey)
  addWalkCard(-40, 'first-walk', 'regular', 'v1', 8, '15-minute short walk');
  // Early varied weeks (rolling 7-day climbs from 1 -> 2 -> 3 -> 4 days)
  addWalkCard(-38, 'early-walk-2', 'regular', 'v1', 18);
  addWalkCard(-36, 'early-walk-3', 'regular', 'v1', 8);
  addWalkCard(-34, 'early-walk-4', 'regular', 'v1', 17);
  addWalkCard(-31, 'early-walk-5', 'regular', 'v1', 8);

  // Mindful rest day
  store = recordLifecycleEvent(store, {
    id: `preview-evt::rest::${dayKey(-30)}`,
    type: 'rest',
    dateKey: dayKey(-30),
    occurredAt: addLocalTimeIso(dayKey(-30), 20, 0),
    source: 'plan',
    title: 'Rest day',
    note: 'Gave legs a full recovery day.',
  }).store;

  // Confirm minimum action ("Made it smaller" in Your journey)
  store = recordLifecycleEvent(store, {
    id: `preview-evt::made-smaller::${minActionConfirmedKey}`,
    type: 'strategy_adjustment',
    dateKey: minActionConfirmedKey,
    occurredAt: addLocalTimeIso(minActionConfirmedKey, 9, 0),
    source: 'plan',
    habitId: PREVIEW_SHORT_WALKS_HABIT_ID,
    title: 'Confirmed minimum action',
    note: 'Added a 2-minute walk as the minimum version for busy or low-energy days.',
    payload: {
      adjustmentKind: 'made_smaller',
      toVersion: 'v2',
      nextRegularAction: '15-minute short walk',
      nextMinimumAction: '2-minute walk',
    },
  }).store;

  // First minimum-action practice (valid practice + traceable "Found another way · Practiced")
  addWalkCard(-28, 'minimum-walk-1', 'minimum', 'v2', 19, '2-minute walk');

  // Explicit pause & resume strictly before Week -2 (so curve visibly dips & recovers in 30d window)
  const pauseOffset = twoWeeksAgoStartOffset - 6; // -26..-20, always > -28
  const resumeOffset = twoWeeksAgoStartOffset - 1; // -21..-15, always 1 day before Week -2 Monday

  if (pauseOffset > -26) {
    addWalkCard(-26, 'pre-pause-walk', 'regular', 'v2', 8);
  }

  store = recordLifecycleEvent(store, {
    id: `preview-evt::pause::${dayKey(pauseOffset)}`,
    type: 'pause',
    dateKey: dayKey(pauseOffset),
    occurredAt: addLocalTimeIso(dayKey(pauseOffset), 10, 0),
    source: 'plan',
    habitId: PREVIEW_SHORT_WALKS_HABIT_ID,
    title: 'Paused Short walks',
    note: 'Paused during a busy travel week.',
  }).store;

  store = recordLifecycleEvent(store, {
    id: `preview-evt::rest::${dayKey(pauseOffset + 2)}`,
    type: 'rest',
    dateKey: dayKey(pauseOffset + 2),
    occurredAt: addLocalTimeIso(dayKey(pauseOffset + 2), 19, 0),
    source: 'plan',
    title: 'Rest day',
  }).store;

  store = recordLifecycleEvent(store, {
    id: `preview-evt::resume::${dayKey(resumeOffset)}`,
    type: 'resume',
    dateKey: dayKey(resumeOffset),
    occurredAt: addLocalTimeIso(dayKey(resumeOffset), 9, 30),
    source: 'plan',
    habitId: PREVIEW_SHORT_WALKS_HABIT_ID,
    title: 'Resumed Short walks',
    note: 'Ready to ease back in with short walks.',
  }).store;

  // ============================================================================
  // 3. TWO WEEKS AGO (week-2): 4 Done tasks — Walk, Strength training, Cycling
  //    First walk on Week -2 Monday is the traceable post-resume practice!
  // ============================================================================
  addWalkCard(twoWeeksAgoStartOffset + 0, 'post-resume-min-walk', 'minimum', 'v2', 8, '2-minute walk');
  addWalkCard(twoWeeksAgoStartOffset + 2, 'wk2-short-walk', 'regular', 'v2', 18, '15-minute short walk');
  addUnlinkedCard(twoWeeksAgoStartOffset + 4, 'wk2-strength', {
    planId: 'strength-bodyweight-20m',
    title: 'Bodyweight strength session',
    exerciseType: 'strength',
    workoutActivityType: 'HKWorkoutActivityTypeTraditionalStrengthTraining',
    minutes: 20,
    hour: 17,
  });
  addUnlinkedCard(twoWeeksAgoStartOffset + 5, 'wk2-cycling', {
    planId: 'cycling-easy-18m',
    title: 'Easy indoor cycling',
    exerciseType: 'cardio',
    workoutActivityType: 'HKWorkoutActivityTypeCycling',
    minutes: 18,
    hour: 10,
  });

  // ============================================================================
  // 4. LAST WEEK (5 Done tasks: Walking, Yoga, Core Training) + THIS WEEK (Mon–Wed: 3 Done tasks)
  //    Current week Mon, Tue, Wed each have 1 Done task card with 2 explicit exercise segments:
  //      - Mon (+0): Walking 10 min, Stretching 5 min
  //      - Tue (+1): Walking 12 min, Running 8 min
  //      - Wed (+2): Walking 15 min, Running 10 min
  //    Yielding: 3 tasks completed, 3 lit dots (Mon–Wed), Walking 3, Running 2, Stretching 1.
  // ============================================================================
  // Day -7 (always inside Last week): 2 independent Short walks Done cards (deduplicates to 1 day in Your rhythm)
  addWalkCard(-7, 'walk-double-morning', 'regular', 'v2', 8, '15-minute short walk');
  addWalkCard(-7, 'walk-double-evening', 'minimum', 'v2', 19, '2-minute walk');

  // Fill Last week to 5 Done tasks (distinct from This week: Walking, Yoga, Core Training)
  const lastWeekOffsets = [0, 1, 2, 3, 4, 5, 6].map((i) => lastWeekStartOffset + i);
  const thirdLastWeekWalkOffset =
    dow === 0
      ? -5
      : dow === 1
      ? -4
      : lastWeekStartOffset; // Mon of Last week (< -7 when dow >= 2)
  addWalkCard(
    thirdLastWeekWalkOffset,
    'wk1-walk-second',
    'regular',
    'v2',
    18,
    '15-minute short walk'
  );
  if (dow === 0) {
    // Keep 3 distinct Short walks dates in [-7..-1] on Mondays too
    addWalkCard(-2, 'wk1-walk-sat', 'minimum', 'v2', 10, '2-minute walk');
  }
  const usedLastWeekOffsets = new Set<number>(
    dow === 0 ? [-7, thirdLastWeekWalkOffset, -2] : [-7, thirdLastWeekWalkOffset]
  );
  const freeLastWeekOffsets = lastWeekOffsets.filter((o) => !usedLastWeekOffsets.has(o));
  addUnlinkedCard(freeLastWeekOffsets[1] ?? freeLastWeekOffsets[0], 'wk1-yoga', {
    planId: 'yoga-flow-20m',
    title: 'Evening yoga flow',
    exerciseType: 'other',
    workoutActivityType: 'HKWorkoutActivityTypeYoga',
    minutes: 20,
    hour: 19,
  });
  if (dow !== 0) {
    addUnlinkedCard(freeLastWeekOffsets[3] ?? freeLastWeekOffsets[2], 'wk1-core', {
      planId: 'core-stability-12m',
      title: 'Core stability routine',
      exerciseType: 'strength',
      workoutActivityType: 'HKWorkoutActivityTypeCoreTraining',
      minutes: 12,
      hour: 18,
    });
  }

  // Current week Mon, Tue, Wed (e.g. Nov 23, 24, 25):
  // 1 Done task card per day, 3 distinct HealthKit workout segments each (3 tasks total, 9 workout records total):
  //   - Mon (+0 / Nov 23): Walking 10 min, Cycling 20 min, Yoga 15 min
  //   - Tue (+1 / Nov 24): Running 12 min, Swimming 25 min, Functional Strength Training 18 min
  //   - Wed (+2 / Nov 25): Hiking 30 min, Pilates 15 min, Jump Rope 6 min
  addComboTaskCard(currentWeekStartOffset + 0, 'wk0-mon-multi-workout', {
    planId: 'mon-movement-mix',
    title: 'Walk, cycling & yoga',
    hour: 8,
    minute: 15,
    segments: [
      {
        exerciseType: 'walk',
        workoutActivityType: 'HKWorkoutActivityTypeWalking',
        locationContext: 'outdoor',
        title: 'Walking',
        minutes: 10,
        linkedHabitId: PREVIEW_SHORT_WALKS_HABIT_ID,
      },
      {
        exerciseType: 'cardio',
        workoutActivityType: 'HKWorkoutActivityTypeCycling',
        locationContext: 'outdoor',
        title: 'Cycling',
        minutes: 20,
        linkedHabitId: null,
      },
      {
        exerciseType: 'other',
        workoutActivityType: 'HKWorkoutActivityTypeYoga',
        locationContext: 'indoor',
        title: 'Yoga',
        minutes: 15,
        linkedHabitId: null,
      },
    ],
  });

  addComboTaskCard(currentWeekStartOffset + 1, 'wk0-tue-multi-workout', {
    planId: 'tue-movement-mix',
    title: 'Run, swim & strength',
    hour: 8,
    minute: 30,
    segments: [
      {
        exerciseType: 'cardio',
        workoutActivityType: 'HKWorkoutActivityTypeRunning',
        locationContext: 'outdoor',
        title: 'Running',
        minutes: 12,
        linkedHabitId: null,
      },
      {
        exerciseType: 'cardio',
        workoutActivityType: 'HKWorkoutActivityTypeSwimming',
        locationContext: 'indoor',
        title: 'Swimming',
        minutes: 25,
        linkedHabitId: null,
      },
      {
        exerciseType: 'strength',
        workoutActivityType: 'HKWorkoutActivityTypeFunctionalStrengthTraining',
        locationContext: 'indoor',
        title: 'Functional Strength Training',
        minutes: 18,
        linkedHabitId: null,
      },
    ],
  });

  addComboTaskCard(currentWeekStartOffset + 2, 'wk0-wed-multi-workout', {
    planId: 'wed-movement-mix',
    title: 'Hike, Pilates & jump rope',
    hour: 8,
    minute: 45,
    segments: [
      {
        exerciseType: 'walk',
        workoutActivityType: 'HKWorkoutActivityTypeHiking',
        locationContext: 'outdoor',
        title: 'Hiking',
        minutes: 30,
        linkedHabitId: null,
      },
      {
        exerciseType: 'other',
        workoutActivityType: 'HKWorkoutActivityTypePilates',
        locationContext: 'indoor',
        title: 'Pilates',
        minutes: 15,
        linkedHabitId: null,
      },
      {
        exerciseType: 'cardio',
        workoutActivityType: 'HKWorkoutActivityTypeJumpRope',
        locationContext: 'indoor',
        title: 'Jump Rope',
        minutes: 6,
        linkedHabitId: null,
      },
    ],
  });

  // Ensure weeklyReviews stays empty so Weekly review defaults to unanswered for Last week
  void currentWeek;
  void lastWeek;

  return {
    isTestFixture: true,
    fixtureLabel: 'TEST_PREVIEW_FIXTURE',
    storageNamespace: PREVIEW_FIXTURE_STORAGE_PREFIX,
    generatedAt: referenceDate.toISOString(),
    generatedDateKey: todayKey,
    store,
  };
}

/**
 * Loads an isolated preview profile from its dedicated preview storage namespace.
 * Never reads from or writes to official user storage (`genki.plan.foundation.v2`).
 */
export function loadPreviewProfileStore(
  profileId: string = PLAN_REVIEW_PREVIEW_PROFILE_ID,
  options?: {
    now?: Date;
    reset?: boolean;
    storage?: StorageLike | null;
  }
): PlanFoundationStore {
  const now = options?.now ?? new Date();
  const todayKey = toLocalDateKey(now);
  const storage = options && 'storage' in options ? options.storage ?? null : getBrowserStorage();
  const storageKey = getPreviewProfileStorageKey(profileId);

  if (!options?.reset && storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedPreviewProfilePayload>;
        if (
          parsed &&
          parsed.profileVersion === PROTOTYPE_DEMO_SEED_VERSION &&
          parsed.generatedDateKey === todayKey &&
          parsed.store &&
          typeof parsed.store === 'object'
        ) {
          return {
            ...parsed.store,
            isTestFixture: true,
            fixtureLabel: 'TEST_PREVIEW_FIXTURE',
          };
        }
      }
    } catch {
      // Fall through to clean regeneration
    }
  }

  const fixture = createIsolatedPlanPreviewFixture(now);
  savePreviewProfileStore(profileId, fixture.store, { now, storage });
  return fixture.store;
}

/**
 * Persists interactive changes made inside an active preview profile strictly into
 * its isolated preview storage namespace, leaving official user storage untouched.
 */
export function savePreviewProfileStore(
  profileId: string,
  store: PlanFoundationStore,
  options?: {
    now?: Date;
    storage?: StorageLike | null;
  }
): boolean {
  const now = options?.now ?? new Date();
  const storage = options && 'storage' in options ? options.storage ?? null : getBrowserStorage();
  if (!storage) return false;
  const storageKey = getPreviewProfileStorageKey(profileId);
  const payload: PersistedPreviewProfilePayload = {
    profileId,
    profileVersion: PROTOTYPE_DEMO_SEED_VERSION,
    generatedDateKey: toLocalDateKey(now),
    savedAt: now.toISOString(),
    store: {
      ...store,
      isTestFixture: true,
      fixtureLabel: 'TEST_PREVIEW_FIXTURE',
    },
  };
  try {
    storage.setItem(storageKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function resetPreviewProfileStore(
  profileId: string = PLAN_REVIEW_PREVIEW_PROFILE_ID,
  options?: {
    now?: Date;
    storage?: StorageLike | null;
  }
): PlanFoundationStore {
  return loadPreviewProfileStore(profileId, { ...options, reset: true });
}
