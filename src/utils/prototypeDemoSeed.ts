import {
  addLocalDays,
  buildDateOnlyIso,
  getLastCompletedWeekBounds,
  getLocalWeekBounds,
  toLocalDateKey,
} from './weeklyPlanStore';
import {
  PlanFoundationStore,
  addExerciseSession,
  completeTaskCard,
  createEmptyPlanFoundationStore,
  recordLifecycleEvent,
  upsertPhaseCommitment,
  upsertWeeklyReviewAnswer,
  DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
} from './planDataFoundation';

export const PROTOTYPE_DEMO_SEED_VERSION = '2026-11.v2-isolated';
export const PROTOTYPE_DEMO_SEED_VERSION_KEY = 'genki.plan.demoSeedVersion.v1';

/**
 * Isolated storage prefix strictly for explicit dev/test preview fixtures.
 * Official user storage keys MUST NEVER be written by fixture builders.
 */
export const PREVIEW_FIXTURE_STORAGE_PREFIX = 'genki.plan.preview_fixture.v1.';

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
  readonly store: PlanFoundationStore;
}

/**
 * Deprecated legacy auto-seeder retained solely as a safe no-op for import compatibility.
 * Official user storage MUST NOT be populated with simulated demo history.
 */
export function initializePrototypeDemoData(_referenceDate: Date = new Date()): void {
  // Intentionally a no-op: never write simulated demo history into official user localStorage.
}

/**
 * Builds an explicitly tagged, strictly isolated in-memory test/dev preview fixture.
 * - Marked with `isTestFixture: true` and `fixtureLabel: 'TEST_PREVIEW_FIXTURE'`.
 * - Cannot be persisted into official user storage (`savePlanFoundationStore` refuses fixtures).
 */
export function createIsolatedPlanPreviewFixture(
  referenceDate: Date = new Date()
): IsolatedPlanPreviewFixture {
  const localToday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const currentWeek = getLocalWeekBounds(localToday);
  const lastWeek = getLastCompletedWeekBounds(localToday);
  const todayKey = toLocalDateKey(localToday);

  let store = createEmptyPlanFoundationStore();
  store.isTestFixture = true;
  store.fixtureLabel = 'TEST_PREVIEW_FIXTURE';

  const commitRes = upsertPhaseCommitment(store, {
    phaseId: 'start-small',
    phaseName: 'Start small',
    originalIntent: 'I want to build a gentle daily movement rhythm without burning out.',
    summary: 'Feel more energetic through short walks and stretches.',
    strategies: [
      {
        habitId: 'habit::daily-walk',
        label: 'Short walk',
        regularAction: '15-minute walk',
        minimumAction: '5-minute walk',
        frequencyDescription: 'About 3 times a week',
        frequencyIsDescriptiveOnly: true,
        version: 'v1',
        confirmedAt: buildDateOnlyIso(lastWeek.weekStartKey),
      },
      {
        habitId: 'habit::gentle-stretch',
        label: 'Gentle stretch',
        regularAction: '5-minute stretch at home',
        minimumAction: '2-minute shoulder stretch',
        frequencyDescription: 'About 2 times a week',
        frequencyIsDescriptiveOnly: true,
        version: 'v1',
        confirmedAt: buildDateOnlyIso(lastWeek.weekStartKey),
      },
    ],
    status: 'active',
    confirmTrackingStartDateKey: lastWeek.weekStartKey,
    timestamp: buildDateOnlyIso(lastWeek.weekStartKey),
  });
  store = commitRes.store;

  // Last week fixture task completions
  const lastWeekMon = toLocalDateKey(addLocalDays(lastWeek.weekStart, 0));
  const lastWeekWed = toLocalDateKey(addLocalDays(lastWeek.weekStart, 2));
  const lastWeekThu = toLocalDateKey(addLocalDays(lastWeek.weekStart, 3));
  const lastWeekSun = toLocalDateKey(addLocalDays(lastWeek.weekStart, 6));

  store = completeTaskCard(store, {
    logicalTaskId: `fixture-task::${lastWeekMon}::walk`,
    dateKey: lastWeekMon,
    completedAt: buildDateOnlyIso(lastWeekMon),
    hasExactTimestamp: false,
    planId: 'walk',
    title: 'Take a 15-minute walk',
    exerciseSegments: [
      {
        exerciseType: 'walk',
        title: 'Take a 15-minute walk',
        plannedDurationMinutes: 15,
        actualDurationMinutes: 15,
        durationTrust: 'user_reported_actual',
        linkedHabitId: 'habit::daily-walk',
      },
    ],
    linkedHabitIds: ['habit::daily-walk'],
    actionTier: 'regular',
    actionVersion: 'v1',
  }).store;

  store = completeTaskCard(store, {
    logicalTaskId: `fixture-task::${lastWeekWed}::stretch`,
    dateKey: lastWeekWed,
    completedAt: buildDateOnlyIso(lastWeekWed),
    hasExactTimestamp: false,
    planId: 'stretch',
    title: '5-minute stretch at home',
    exerciseSegments: [
      {
        exerciseType: 'stretch',
        title: '5-minute stretch at home',
        plannedDurationMinutes: 5,
        actualDurationMinutes: null,
        durationTrust: 'unknown',
        linkedHabitId: 'habit::gentle-stretch',
      },
    ],
    linkedHabitIds: ['habit::gentle-stretch'],
    actionTier: 'minimum',
    actionVersion: 'v1',
  }).store;

  store = addExerciseSession(store, {
    id: `fixture-manual::${lastWeekThu}::walk`,
    exerciseType: 'walk',
    dateKey: lastWeekThu,
    occurredAt: buildDateOnlyIso(lastWeekThu),
    hasExactTimestamp: false,
    actualDurationMinutes: 20,
    durationTrust: 'user_reported_actual',
    source: 'manual',
    linkedHabitId: 'habit::daily-walk',
    actionTier: 'regular',
    actionVersion: 'v1',
    title: 'Evening neighborhood walk',
  }).store;

  store = recordLifecycleEvent(store, {
    type: 'rest',
    dateKey: lastWeekSun,
    occurredAt: buildDateOnlyIso(lastWeekSun),
    source: 'plan',
    title: 'Mindful rest day',
  }).store;

  // Current week fixture item strictly before today if available
  const curMon = toLocalDateKey(addLocalDays(currentWeek.weekStart, 0));
  if (curMon < todayKey) {
    store = completeTaskCard(store, {
      logicalTaskId: `fixture-task::${curMon}::walk`,
      dateKey: curMon,
      completedAt: buildDateOnlyIso(curMon),
      hasExactTimestamp: false,
      planId: 'walk',
      title: 'Take a 15-minute walk',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          title: 'Take a 15-minute walk',
          plannedDurationMinutes: 15,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
          linkedHabitId: 'habit::daily-walk',
        },
      ],
      linkedHabitIds: ['habit::daily-walk'],
      actionTier: 'regular',
      actionVersion: 'v1',
    }).store;
  }

  store = upsertWeeklyReviewAnswer(store, {
    weekStartKey: lastWeek.weekStartKey,
    questionId: DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
    rawAnswer: 'about_right',
    commitmentVersion: store.commitment?.version ?? 1,
    habitVersion: 'v1',
    timestamp: buildDateOnlyIso(lastWeekSun),
  }).store;

  return {
    isTestFixture: true,
    fixtureLabel: 'TEST_PREVIEW_FIXTURE',
    storageNamespace: PREVIEW_FIXTURE_STORAGE_PREFIX,
    generatedAt: referenceDate.toISOString(),
    store,
  };
}
