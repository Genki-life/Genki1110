import {
  DEFAULT_HABIT_EASE_QUESTION_ID,
  DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
  PLAN_FOUNDATION_STORAGE_KEY,
  StorageLike,
  addExerciseSession,
  completeTaskCard,
  computeHabitConfigFingerprint,
  confirmHabitStrategy,
  createEmptyPlanFoundationStore,
  deriveCommitmentStrategyLine,
  derivePlanHeaderDetailActionLabel,
  derivePlanHeaderNovaLine,
  formatDynamicWeekTitle,
  formatPlanWeekRangeLabel,
  getConfirmedHabits,
  getHabitRhythmModel,
  getHabitRolling7DayPractice,
  getPlanWeekNavigationBounds,
  getPlanWeekSnapshot,
  getWeekDoneTaskCount,
  getWeekExerciseSummary,
  getWeekSevenDayStatus,
  getWeekWorkoutTypeSummary,
  getWeeklyReviewAnswer,
  hasConfirmedPhaseCommitment,
  hasStartingFeelsEasierEvidence,
  loadPlanFoundationStore,
  migrateLegacyStorageToFoundation,
  recordAlternativePlanReplacement,
  recordCommitmentRhythmEvent,
  recordHabitCheckIn,
  recordLifecycleEvent,
  removeExerciseSession,
  resolveWorkoutActivityType,
  savePlanFoundationStore,
  setConfirmableTrackingStartDate,
  shiftLocalWeekStartKey,
  undoTaskCardCompletion,
  updateExerciseSession,
  upsertPhaseCommitment,
  upsertWeeklyReviewAnswer,
} from './planDataFoundation';
import {
  ACTIVITIES_STORAGE_KEY,
  COMPLETIONS_STORAGE_KEY,
  REST_DAYS_STORAGE_KEY,
  REST_RECORDS_STORAGE_KEY,
  WEEKLY_REVIEWS_STORAGE_KEY,
  getLocalWeekBounds,
} from './weeklyPlanStore';
import {
  FOCUS_STORAGE_KEY,
  createIsolatedPlanPreviewFixture,
} from './prototypeDemoSeed';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

let passed = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FAILED: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`
    );
  }
}

function runTest(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`PASS [${passed}] ${name}`);
}

export function runPlanDataFoundationAcceptanceSuite(): { passed: number } {
  passed = 0;

  // 1. Multi-exercise card Done = 1 task; planned duration != actual; no even split
  runTest('1. Multi-exercise card Done counts as 1 task & never fabricates/splits actual duration', () => {
    let store = createEmptyPlanFoundationStore();
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-23::combo-card',
      dateKey: '2026-11-23',
      planId: 'walk-plus-stretch',
      title: 'Walk + Stretch combo',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          title: '15-min walk',
          plannedDurationMinutes: 15,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
        },
        {
          exerciseType: 'stretch',
          title: '5-min stretch',
          plannedDurationMinutes: 5,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
        },
      ],
    }).store;

    const done = getWeekDoneTaskCount(store, '2026-11-23');
    assertEqual(done.doneTaskCount, 1, 'Multi-exercise card must count as 1 Done task');

    const ex = getWeekExerciseSummary(store, '2026-11-23');
    assertEqual(ex.totalSessions, 2, 'Combo card produces 2 exercise sessions');
    assertEqual(ex.byType.walk?.sessionCount, 1, 'Walk session count is 1');
    assertEqual(ex.byType.stretch?.sessionCount, 1, 'Stretch session count is 1');
    assertEqual(ex.totalTrustworthyDurationMinutes, 0, 'Planned durations must NOT count as trustworthy actual duration');
    assertEqual(ex.unknownDurationSessionCount, 2, 'Both segments remain unknown duration (never evenly split)');
  });

  // 2. Duplicate Done clicks / retries do not double-count
  runTest('2. Duplicate Done clicks / retries / refresh are idempotent', () => {
    let store = createEmptyPlanFoundationStore();
    const input = {
      logicalTaskId: 'today-task::2026-11-23::card-0',
      dateKey: '2026-11-23',
      planId: 'stretch',
      title: '5-minute stretch at home',
      exerciseSegments: [
        {
          exerciseType: 'stretch' as const,
          title: '5-minute stretch at home',
          plannedDurationMinutes: 5,
          actualDurationMinutes: null,
          durationTrust: 'unknown' as const,
        },
      ],
    };

    store = completeTaskCard(store, input).store;
    store = completeTaskCard(store, input).store;
    store = completeTaskCard(store, { ...input, completedAt: '2026-11-23T15:00:00.000Z' }).store;

    assertEqual(getWeekDoneTaskCount(store, '2026-11-23').doneTaskCount, 1, 'Duplicate clicks must stay at 1 Done task');
    assertEqual(store.taskCompletions.length, 1, 'Only 1 TaskCompletionRecord stored');
    assertEqual(store.exerciseSessions.length, 1, 'Only 1 ExerciseSessionRecord stored');
  });

  // 3. Alternative / Plan B replacement keeps logical identity (no double-count)
  runTest('3. Alternative plan replacement preserves logical identity with zero double-count', () => {
    let store = createEmptyPlanFoundationStore();
    const logicalId = 'today-task::2026-11-23::card-1';

    store = completeTaskCard(store, {
      logicalTaskId: logicalId,
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Take a 15-minute walk',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          title: 'Take a 15-minute walk',
          plannedDurationMinutes: 15,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
        },
      ],
    }).store;

    store = recordAlternativePlanReplacement(store, {
      logicalTaskId: logicalId,
      previousPlanId: 'walk',
      nextPlanId: 'stretch',
      nextTitle: '5-minute stretch at home',
      nextExerciseSegments: [
        {
          exerciseType: 'stretch',
          title: '5-minute stretch at home',
          plannedDurationMinutes: 5,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
        },
      ],
    });

    const done = getWeekDoneTaskCount(store, '2026-11-23');
    assertEqual(done.doneTaskCount, 1, 'Replacement must not double-count Done task');
    assertEqual(done.completedTasks[0].logicalTaskId, logicalId, 'logicalTaskId preserved');
    assertEqual(done.completedTasks[0].planId, 'stretch', 'planId updated to alternative');
    assert(
      done.completedTasks[0].replacedFromPlanIds.includes('walk'),
      'replacedFromPlanIds tracks previous plan'
    );

    const ex = getWeekExerciseSummary(store, '2026-11-23');
    assertEqual(ex.totalSessions, 1, 'Old exercise session replaced cleanly');
    assertEqual(ex.byType.stretch?.sessionCount, 1, 'Updated to stretch session');
    assertEqual(ex.byType.walk, undefined, 'Replaced walk session removed');
  });

  // 4 & 5. Same day multi-card Done > 1, same-habit practice days = 1, minimum valid, longer duration doesn't increase days, undo 1 source preserves independent source
  runTest('4 & 5. Multi-source same-day habit deduplication, minimum action validity, manual != Done, and per-source undo', () => {
    let store = createEmptyPlanFoundationStore();

    // Card A (minimum action) on Nov 23
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-23::card-a',
      dateKey: '2026-11-23',
      planId: 'stretch',
      title: '2-minute shoulder stretch',
      exerciseSegments: [
        {
          exerciseType: 'stretch',
          title: '2-minute shoulder stretch',
          plannedDurationMinutes: 2,
          actualDurationMinutes: 2,
          durationTrust: 'measured',
          linkedHabitId: 'habit::move-daily',
        },
      ],
      linkedHabitIds: ['habit::move-daily'],
      actionTier: 'minimum',
      actionVersion: 'v1',
    }).store;

    // Card B (regular action) on same day Nov 23
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-23::card-b',
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Take a 15-minute walk',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          title: 'Take a 15-minute walk',
          plannedDurationMinutes: 15,
          actualDurationMinutes: 15,
          durationTrust: 'measured',
          linkedHabitId: 'habit::move-daily',
        },
      ],
      linkedHabitIds: ['habit::move-daily'],
      actionTier: 'regular',
      actionVersion: 'v1',
    }).store;

    // Manual 90-min exercise on same day linked to same habit
    const manualRes = addExerciseSession(store, {
      id: 'manual::2026-11-23::long-walk',
      exerciseType: 'walk',
      dateKey: '2026-11-23',
      actualDurationMinutes: 90,
      durationTrust: 'user_reported_actual',
      source: 'manual',
      linkedHabitId: 'habit::move-daily',
      actionTier: 'regular',
      actionVersion: 'v1',
      title: 'Long park walk',
    });
    store = manualRes.store;

    // Separate day with ONLY a minimum action (Nov 21)
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-21::card-min',
      dateKey: '2026-11-21',
      planId: 'stretch',
      title: '2-minute minimum stretch',
      exerciseSegments: [
        {
          exerciseType: 'stretch',
          title: '2-minute minimum stretch',
          plannedDurationMinutes: 2,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
          linkedHabitId: 'habit::move-daily',
        },
      ],
      linkedHabitIds: ['habit::move-daily'],
      actionTier: 'minimum',
      actionVersion: 'v1',
    }).store;

    // Done count for week of Nov 23: strictly 2 (Card A + Card B; manual 90-min walk excluded!)
    assertEqual(
      getWeekDoneTaskCount(store, '2026-11-23').doneTaskCount,
      2,
      'Same day can have Done > 1, and manual exercise must NOT increment Done count'
    );

    // Rolling 7-day habit practice ending Nov 23: Nov 21 + Nov 23 = 2 days (Nov 23 has 3 raw records -> still 1 day)
    const rollingBeforeUndo = getHabitRolling7DayPractice(store, 'habit::move-daily', '2026-11-23');
    assertEqual(rollingBeforeUndo.practicedDaysCount, 2, 'Nov 21 (minimum) + Nov 23 (3 sources, 90m) = 2 practice days');
    assertEqual(rollingBeforeUndo.totalSourceRecords, 4, 'All 4 raw source records retained');
    const nov23Entry = rollingBeforeUndo.days.find((d) => d.dateKey === '2026-11-23')!;
    assertEqual(nov23Entry.recordCount, 3, 'Nov 23 retains all 3 raw sources');
    assert(nov23Entry.actionTiers.includes('minimum') && nov23Entry.actionTiers.includes('regular'), 'Both minimum and regular tiers preserved');

    // Undo Card A -> Done drops to 1, but Nov 23 STILL practiced because Card B + manual remain
    store = undoTaskCardCompletion(store, { logicalTaskId: 'today-task::2026-11-23::card-a' });
    assertEqual(getWeekDoneTaskCount(store, '2026-11-23').doneTaskCount, 1, 'Undo Card A decrements Done count to 1');
    const rollingAfterUndoA = getHabitRolling7DayPractice(store, 'habit::move-daily', '2026-11-23');
    assertEqual(rollingAfterUndoA.practicedDaysCount, 2, 'Nov 23 remains practiced after undoing 1 of 3 sources');
    assertEqual(rollingAfterUndoA.days.find((d) => d.dateKey === '2026-11-23')!.recordCount, 2, '2 independent sources still remain on Nov 23');

    // Undo Card B -> Done drops to 0, Nov 23 STILL practiced due to independent manual source
    store = undoTaskCardCompletion(store, { logicalTaskId: 'today-task::2026-11-23::card-b' });
    assertEqual(getWeekDoneTaskCount(store, '2026-11-23').doneTaskCount, 0, 'Done count drops to 0');
    assertEqual(
      getHabitRolling7DayPractice(store, 'habit::move-daily', '2026-11-23').practicedDaysCount,
      2,
      'Nov 23 remains practiced via independent manual source'
    );

    // Delete independent manual source -> now Nov 23 is no longer practiced (only Nov 21 remains)
    store = removeExerciseSession(store, manualRes.session.id);
    assertEqual(
      getHabitRolling7DayPractice(store, 'habit::move-daily', '2026-11-23').practicedDaysCount,
      1,
      'Nov 23 unpracticed only after ALL same-day sources are removed'
    );
  });

  // 6. Historical / unlinked cards MUST NOT be guessed into habits by title keywords
  runTest('6. Unlinked cards are never auto-classified into a habit by title keywords', () => {
    let store = createEmptyPlanFoundationStore();
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-23::unlinked-walk',
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Take a 15-minute walk',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          title: 'Take a 15-minute walk',
          plannedDurationMinutes: 15,
          actualDurationMinutes: null,
          durationTrust: 'unknown',
        },
      ],
    }).store;

    assertEqual(store.habitPractices.length, 0, 'No HabitPracticeRecord auto-generated from title keywords');
    assertEqual(getHabitRolling7DayPractice(store, 'walk', '2026-11-23').practicedDaysCount, 0, 'Query for walk habit is 0');
  });

  // 7. Backfill & date edit synchronously recompute weekly & rolling metrics
  runTest('7. Backfill & date edit synchronously recompute weekly & rolling 7-day queries', () => {
    let store = createEmptyPlanFoundationStore();
    const added = addExerciseSession(store, {
      id: 'manual::edit-test',
      exerciseType: 'walk',
      dateKey: '2026-11-23',
      actualDurationMinutes: 20,
      durationTrust: 'user_reported_actual',
      source: 'manual',
      linkedHabitId: 'habit::walk',
      title: 'Neighborhood walk',
    });
    store = added.store;

    assertEqual(getWeekExerciseSummary(store, '2026-11-23').totalTrustworthyDurationMinutes, 20, 'Initial week has 20 min');
    assertEqual(getWeekExerciseSummary(store, '2026-11-18').totalSessions, 0, 'Prior week initially 0');

    // Edit date to previous week (2026-11-18) and duration to 35 min
    store = updateExerciseSession(store, added.session.id, {
      dateKey: '2026-11-18',
      actualDurationMinutes: 35,
      durationTrust: 'user_reported_actual',
    });

    assertEqual(getWeekExerciseSummary(store, '2026-11-23').totalSessions, 0, 'Old week recomputed to 0');
    assertEqual(getWeekExerciseSummary(store, '2026-11-18').totalSessions, 1, 'Target week recomputed to 1');
    assertEqual(getWeekExerciseSummary(store, '2026-11-18').totalTrustworthyDurationMinutes, 35, 'Target week duration recomputed to 35');

    const rolling = getHabitRolling7DayPractice(store, 'habit::walk', '2026-11-23');
    assertEqual(rolling.days.find((d) => d.dateKey === '2026-11-23')?.practiced, false, 'Old date no longer marked practiced');
    assertEqual(rolling.days.find((d) => d.dateKey === '2026-11-18')?.practiced, true, 'New date marked practiced');
  });

  // 8. Explicit lifecycle events vs unrecorded days & coverage start date integrity
  runTest('8. Unrecorded days != active pause & trackingStartDateKey never inferred from earliest Done', () => {
    let store = createEmptyPlanFoundationStore();
    store = completeTaskCard(store, {
      logicalTaskId: 'today-task::2026-11-23::c1',
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk', plannedDurationMinutes: 15 }],
    }).store;

    assertEqual(store.coverage.trackingStartDateKey, null, 'trackingStartDateKey must stay null (never inferred from Done record)');

    store = recordLifecycleEvent(store, {
      type: 'pause',
      dateKey: '2026-11-25',
      occurredAt: '2026-11-25T09:00:00.000Z',
      source: 'plan',
    }).store;
    store = recordLifecycleEvent(store, {
      type: 'resume',
      dateKey: '2026-11-27',
      occurredAt: '2026-11-27T09:00:00.000Z',
      source: 'plan',
    }).store;
    store = recordLifecycleEvent(store, {
      type: 'rest',
      dateKey: '2026-11-28',
      occurredAt: '2026-11-28T09:00:00.000Z',
      source: 'today',
    }).store;

    const seven = getWeekSevenDayStatus(store, '2026-11-23', new Date(2026, 10, 29));
    assertEqual(seven.days[0].dayState, 'done', 'Mon Nov 23 is done');
    assertEqual(seven.days[1].dayState, 'no_record', 'Tue Nov 24 unrecorded day is no_record, NOT paused');
    assertEqual(seven.days[1].explicitPaused, false, 'Tue Nov 24 explicitPaused is false');
    assertEqual(seven.days[2].dayState, 'paused', 'Wed Nov 25 explicit pause');
    assertEqual(seven.days[3].dayState, 'paused', 'Thu Nov 26 still paused before resume');
    assertEqual(seven.days[4].dayState, 'no_record', 'Fri Nov 27 resumed -> no_record, NOT paused');
    assertEqual(seven.days[5].dayState, 'rest', 'Sat Nov 28 explicit rest');
    assertEqual(getWeekDoneTaskCount(store, '2026-11-23').doneTaskCount, 1, 'Rest day does not increment Done count');
  });

  // 9. Weekly review save & modify by (weekStartKey, questionId)
  runTest('9. Weekly review saves and edits cleanly by (weekStartKey, questionId)', () => {
    let store = createEmptyPlanFoundationStore();
    store = upsertPhaseCommitment(store, {
      phaseId: 'start-small',
      phaseName: 'Start small',
      originalIntent: 'Feel steady energy',
      summary: 'Short walks & stretches',
      confirmTrackingStartDateKey: '2026-11-16',
    }).store;

    store = upsertWeeklyReviewAnswer(store, {
      weekStartKey: '2026-11-16',
      questionId: DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
      rawAnswer: 'too_much',
      timestamp: '2026-11-23T10:00:00.000Z',
    }).store;

    store = upsertWeeklyReviewAnswer(store, {
      weekStartKey: '2026-11-16',
      questionId: 'barrier_note',
      rawAnswer: 'Rainy evenings',
      timestamp: '2026-11-23T10:05:00.000Z',
    }).store;

    // Edit answer for weekly_pace_feeling on same week
    store = upsertWeeklyReviewAnswer(store, {
      weekStartKey: '2026-11-16',
      questionId: DEFAULT_WEEKLY_REVIEW_QUESTION_ID,
      rawAnswer: 'about_right',
      timestamp: '2026-11-23T12:00:00.000Z',
    }).store;

    const pace = getWeeklyReviewAnswer(store, '2026-11-16', DEFAULT_WEEKLY_REVIEW_QUESTION_ID)!;
    const barrier = getWeeklyReviewAnswer(store, '2026-11-16', 'barrier_note')!;
    assertEqual(pace.rawAnswer, 'about_right', 'Edited answer updated');
    assertEqual(pace.feeling, 'about_right', 'Typed feeling mirrored');
    assertEqual(pace.savedAt, '2026-11-23T10:00:00.000Z', 'Original savedAt preserved on edit');
    assertEqual(pace.updatedAt, '2026-11-23T12:00:00.000Z', 'updatedAt advanced on edit');
    assertEqual(pace.commitmentVersion, 1, 'Commitment version recorded');
    assertEqual(barrier.rawAnswer, 'Rainy evenings', 'Independent questionId unaffected');
  });

  // 10. Cross-week, cross-month, cross-year local Monday-Sunday boundaries
  runTest('10. Cross-week, cross-month (incl. leap year), and cross-year local Monday-Sunday boundaries', () => {
    // Cross-year: Mon 2025-12-29 .. Sun 2026-01-04
    const crossYearMon = getLocalWeekBounds(new Date(2025, 11, 29));
    const crossYearNewYears = getLocalWeekBounds(new Date(2026, 0, 1));
    const crossYearSun = getLocalWeekBounds(new Date(2026, 0, 4));
    const nextWeekMon = getLocalWeekBounds(new Date(2026, 0, 5));
    const prevWeekSun = getLocalWeekBounds(new Date(2025, 11, 28));

    assertEqual(crossYearMon.weekStartKey, '2025-12-29', 'Cross-year week starts Mon Dec 29');
    assertEqual(crossYearMon.weekEndKey, '2026-01-04', 'Cross-year week ends Sun Jan 4');
    assertEqual(crossYearNewYears.weekStartKey, '2025-12-29', 'Jan 1 belongs to Dec 29 week');
    assertEqual(crossYearSun.weekStartKey, '2025-12-29', 'Sun Jan 4 belongs to Dec 29 week');
    assertEqual(nextWeekMon.weekStartKey, '2026-01-05', 'Mon Jan 5 starts next week');
    assertEqual(prevWeekSun.weekStartKey, '2025-12-22', 'Sun Dec 28 belongs to Dec 22 week');

    // Leap-year cross-month: Mon 2024-02-26 .. Sun 2024-03-03
    const leapBounds = getLocalWeekBounds(new Date(2024, 1, 29));
    assertEqual(leapBounds.weekStartKey, '2024-02-26', 'Leap day Feb 29 week starts Feb 26');
    assertEqual(leapBounds.weekEndKey, '2024-03-03', 'Leap day Feb 29 week ends Mar 3');

    // Verify task counts across cross-year boundary
    let store = createEmptyPlanFoundationStore();
    store = completeTaskCard(store, {
      logicalTaskId: 't::2025-12-28',
      dateKey: '2025-12-28',
      planId: 'walk',
      title: 'Prev week Sun walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
      linkedHabitIds: ['habit::h1'],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2025-12-31',
      dateKey: '2025-12-31',
      planId: 'walk',
      title: 'NYE walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
      linkedHabitIds: ['habit::h1'],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-01-04',
      dateKey: '2026-01-04',
      planId: 'stretch',
      title: 'Sun Jan 4 stretch',
      exerciseSegments: [{ exerciseType: 'stretch', title: 'Stretch' }],
      linkedHabitIds: ['habit::h1'],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-01-05',
      dateKey: '2026-01-05',
      planId: 'walk',
      title: 'Next week Mon walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
      linkedHabitIds: ['habit::h1'],
    }).store;

    assertEqual(getWeekDoneTaskCount(store, '2026-01-01').doneTaskCount, 2, 'Cross-year week counts Dec 31 + Jan 4 only');
    assertEqual(getWeekDoneTaskCount(store, '2025-12-28').doneTaskCount, 1, 'Prev week counts Dec 28 only');
    assertEqual(getWeekDoneTaskCount(store, '2026-01-05').doneTaskCount, 1, 'Next week counts Jan 5 only');

    // Rolling 7-day cross-year window ending 2026-01-02 -> [2025-12-27 .. 2026-01-02]
    const crossYearRolling = getHabitRolling7DayPractice(store, 'habit::h1', '2026-01-02');
    assertEqual(crossYearRolling.windowStartDateKey, '2025-12-27', 'Cross-year 7d window starts Dec 27');
    assertEqual(crossYearRolling.windowEndDateKey, '2026-01-02', 'Cross-year 7d window ends Jan 2');
    assertEqual(crossYearRolling.practicedDaysCount, 2, 'Counts Dec 28 + Dec 31 inside cross-year rolling window');
  });

  // 11. Legacy data migration (idempotent, lossless, demo-excluding) & persistence reload recovery & fixture isolation
  runTest('11. Legacy migration is idempotent & lossless, excludes demo rows, recovers on reload, and isolates fixtures', () => {
    const legacyStorage = createMemoryStorage({
      [ACTIVITIES_STORAGE_KEY]: JSON.stringify([
        {
          id: 'today-task::2026-11-20::card-0',
          sourceKey: 'today-task::2026-11-20::card-0',
          source: 'today',
          cardId: 'card-0',
          planId: 'walk',
          title: 'Take a 15-minute walk',
          category: 'walk',
          durationMinutes: 15,
          completedAt: '2026-11-20T18:30:00.000Z',
          dateKey: '2026-11-20',
          hasExactTimestamp: true,
          isSample: false,
        },
        {
          id: 'manual::2026-11-21::abc',
          source: 'manual',
          title: 'Evening stretch',
          category: 'stretch',
          durationMinutes: 12,
          completedAt: '2026-11-21T20:00:00.000Z',
          dateKey: '2026-11-21',
          hasExactTimestamp: false,
          isSample: false,
        },
        {
          id: 'demo::2026-11-10::walk',
          source: 'demo',
          title: 'Walk',
          category: 'walk',
          durationMinutes: 15,
          completedAt: '2026-11-10T12:00:00.000Z',
          dateKey: '2026-11-10',
          hasExactTimestamp: false,
          isSample: true,
        },
      ]),
      [COMPLETIONS_STORAGE_KEY]: JSON.stringify([
        {
          // Duplicate of the same Today logical task from v1 legacy key -> must deduplicate!
          id: 'today-task::2026-11-20::card-0',
          sourceKey: 'today-task::2026-11-20::card-0',
          source: 'today',
          planId: 'walk',
          title: 'Take a 15-minute walk',
          category: 'walk',
          durationMinutes: 15,
          completedAt: '2026-11-20T18:30:00.000Z',
          dateKey: '2026-11-20',
        },
      ]),
      [REST_RECORDS_STORAGE_KEY]: JSON.stringify([
        {
          id: 'rest::today::2026-11-22',
          dateKey: '2026-11-22',
          source: 'today',
          title: 'Rest day',
          createdAt: '2026-11-22T12:00:00.000Z',
          isSample: false,
        },
        {
          id: 'demo-rest::2026-11-08',
          dateKey: '2026-11-08',
          source: 'demo',
          title: 'Rest day',
          createdAt: '2026-11-08T12:00:00.000Z',
          isSample: true,
        },
      ]),
      [REST_DAYS_STORAGE_KEY]: JSON.stringify(['2026-11-22', '2026-11-19']),
      [WEEKLY_REVIEWS_STORAGE_KEY]: JSON.stringify({
        '2026-11-09': {
          weekStartKey: '2026-11-09',
          feeling: 'about_right',
          updatedAt: '2026-11-16T10:00:00.000Z',
        },
      }),
      [FOCUS_STORAGE_KEY]: JSON.stringify({
        focus: 'Steady afternoon walks',
        phase: 'Start small',
        status: 'active',
        source: 'user',
        isSample: false,
      }),
    });

    // First load & migration
    const migrated1 = loadPlanFoundationStore({ storage: legacyStorage });
    assertEqual(migrated1.taskCompletions.length, 1, 'Only 1 real Today task migrated (demo skipped, manual excluded, duplicate deduped)');
    assertEqual(migrated1.exerciseSessions.length, 2, '1 today_task session + 1 manual session migrated (demo skipped)');
    const todaySession = migrated1.exerciseSessions.find((s) => s.source === 'today_task')!;
    assertEqual(todaySession.actualDurationMinutes, null, 'Legacy Today planned duration NOT promoted to actualDurationMinutes');
    assertEqual(todaySession.plannedDurationMinutes, 15, 'Legacy Today planned duration preserved separately');
    const manualSession = migrated1.exerciseSessions.find((s) => s.source === 'manual')!;
    assertEqual(manualSession.actualDurationMinutes, 12, 'Legacy manual duration preserved as user_reported_actual');
    assertEqual(manualSession.durationTrust, 'user_reported_actual', 'Manual trust level set');
    assertEqual(migrated1.habitPractices.length, 0, 'Unlinked legacy records never auto-classified into habits');
    assertEqual(migrated1.lifecycleEvents.filter((e) => e.type === 'rest').length, 2, '2 real rest days migrated (Nov 22 deduped + Nov 19; demo Nov 8 skipped)');
    assertEqual(migrated1.commitment?.summary, 'Steady afternoon walks', 'User Focus migrated into commitment');
    assertEqual(migrated1.coverage.trackingStartDateKey, null, 'Legacy migration never infers trackingStartDateKey from earliest Done');
    assertEqual(
      getWeeklyReviewAnswer(migrated1, '2026-11-09', DEFAULT_WEEKLY_REVIEW_QUESTION_ID)?.rawAnswer,
      'about_right',
      'Legacy weekly review migrated'
    );

    // Repeat migration 2 more times -> must remain 100% idempotent
    const repeat2 = migrateLegacyStorageToFoundation(migrated1, legacyStorage);
    const repeat3 = migrateLegacyStorageToFoundation(repeat2.store, legacyStorage);
    assertEqual(repeat2.changed, false, 'Second migration pass is a pure no-op');
    assertEqual(repeat3.changed, false, 'Third migration pass is a pure no-op');
    assertEqual(repeat3.store.taskCompletions.length, 1, 'Task count unchanged after repeated migration');
    assertEqual(repeat3.store.exerciseSessions.length, 2, 'Session count unchanged after repeated migration');
    assertEqual(repeat3.store.lifecycleEvents.length, 2, 'Event count unchanged after repeated migration');

    // Persistence reload recovery check
    assert(legacyStorage.getItem(PLAN_FOUNDATION_STORAGE_KEY) !== null, 'v2 foundation persisted to storage');
    const reloaded = loadPlanFoundationStore({ storage: legacyStorage });
    assertEqual(reloaded.taskCompletions.length, 1, 'Task completion recovered after reload');
    assertEqual(reloaded.exerciseSessions.length, 2, 'Exercise sessions recovered after reload');
    assertEqual(reloaded.lifecycleEvents.length, 2, 'Lifecycle events recovered after reload');
    assertEqual(reloaded.commitment?.summary, 'Steady afternoon walks', 'Commitment recovered after reload');

    // Isolated preview fixture guard: MUST NOT write into official user storage
    const fixture = createIsolatedPlanPreviewFixture(new Date(2026, 10, 23));
    assertEqual(fixture.isTestFixture, true, 'Fixture explicitly marked isTestFixture: true');
    assertEqual(fixture.store.isTestFixture, true, 'Fixture store marked isTestFixture: true');
    const emptyOfficial = createMemoryStorage();
    const saved = savePlanFoundationStore(fixture.store, emptyOfficial);
    assertEqual(saved, false, 'savePlanFoundationStore refuses to write fixture into official storage');
    assertEqual(emptyOfficial.getItem(PLAN_FOUNDATION_STORAGE_KEY), null, 'Official storage remains untouched by fixture');
  });

  // 11. Plan Phase Commitment Header deterministic states (unconfirmed, started, adjusted, kept, review)
  runTest('11. Plan Phase Commitment header derives deterministic Nova lines without fake defaults', () => {
    let store = createEmptyPlanFoundationStore();
    assertEqual(hasConfirmedPhaseCommitment(store.commitment), false, 'Empty store has no confirmed commitment');
    assertEqual(derivePlanHeaderDetailActionLabel(store.commitment), 'Set a focus', 'Unconfirmed shows Set a focus');
    assertEqual(deriveCommitmentStrategyLine(store.commitment), null, 'Unconfirmed never fabricates strategy');

    // Recording kept/adjusted without commitment is a safe no-op
    store = recordCommitmentRhythmEvent(store, 'kept');
    assertEqual(store.commitment, null, 'recordCommitmentRhythmEvent never invents commitment');

    // User confirms initial commitment without strategy -> started state, no invented frequency
    store = upsertPhaseCommitment(store, {
      phaseId: 'start-small',
      phaseName: 'Start small',
      summary: 'Move gently after work',
      confirmTrackingStartDateKey: '2026-11-23',
    }).store;
    assertEqual(hasConfirmedPhaseCommitment(store.commitment), true, 'Commitment is now confirmed');
    assertEqual(derivePlanHeaderNovaLine(store.commitment), 'You’ve chosen to begin again.', 'Started state line');
    assertEqual(derivePlanHeaderDetailActionLabel(store.commitment), 'About this goal', 'Normal detail entry');
    assertEqual(deriveCommitmentStrategyLine(store.commitment), null, 'No strategy invented when user omitted it');

    // User saves an adjustment with explicit strategy -> adjusted state
    store = upsertPhaseCommitment(store, {
      phaseId: 'start-small',
      phaseName: 'Start small',
      summary: 'Move gently after work',
      strategySummary: 'Short evening stretches when energy allows.',
    }).store;
    assertEqual(derivePlanHeaderNovaLine(store.commitment), 'We’ll find a way that fits.', 'Adjusted state line');
    assertEqual(
      deriveCommitmentStrategyLine(store.commitment),
      'Short evening stretches when energy allows.',
      'Explicit user strategy preserved verbatim'
    );

    // User explicitly chooses to keep rhythm -> kept state
    store = recordCommitmentRhythmEvent(store, 'kept');
    assertEqual(derivePlanHeaderNovaLine(store.commitment), 'Let’s keep this rhythm.', 'Kept state line');
    assertEqual(derivePlanHeaderDetailActionLabel(store.commitment), 'About this goal', 'Kept keeps About this goal');

    // Real goal review flagged -> review state
    store = upsertPhaseCommitment(store, {
      phaseId: 'start-small',
      phaseName: 'Start small',
      summary: 'Move gently after work',
      reviewRequested: true,
    }).store;
    assertEqual(derivePlanHeaderNovaLine(store.commitment), 'Shall we revisit your goal?', 'Review state line');
    assertEqual(derivePlanHeaderDetailActionLabel(store.commitment), 'Review together', 'Review detail entry');
  });

  // 13. Week navigation, dynamic titles, cross-month & cross-year labels, empty weeks, and coverage boundaries
  runTest('13. Week browser handles dynamic titles, cross-month/cross-year labels, empty weeks, and truthful coverage bounds', () => {
    const refNov25 = new Date(2026, 10, 25); // Wed Nov 25, 2026 (week Nov 23-29)
    assertEqual(formatDynamicWeekTitle('2026-11-23', refNov25), 'This week', 'Current week title');
    assertEqual(formatDynamicWeekTitle('2026-11-16', refNov25), 'Last week', 'Previous week title');
    assertEqual(formatDynamicWeekTitle('2026-11-09', refNov25), 'Week of Nov 9', 'Earlier same-year week title');
    assertEqual(formatPlanWeekRangeLabel('2026-11-16', refNov25), 'Nov 16–22', 'Same-month range');
    assertEqual(formatPlanWeekRangeLabel('2026-11-30', refNov25), 'Nov 30–Dec 6', 'Cross-month range');

    const refJan12 = new Date(2026, 0, 12); // Mon Jan 12, 2026
    assertEqual(
      formatPlanWeekRangeLabel('2025-12-29', refJan12),
      'Dec 29, 2025–Jan 4, 2026',
      'Cross-year range explicitly displays both years'
    );
    assertEqual(
      formatDynamicWeekTitle('2025-12-29', refJan12),
      'Week of Dec 29, 2025',
      'Cross-year earlier title explicitly includes year'
    );
    assertEqual(
      formatPlanWeekRangeLabel('2025-12-15', refJan12),
      'Dec 15–21, 2025',
      'Prior calendar year range explicitly displays year'
    );

    // Known trackingStartDateKey = Thu Nov 5, 2026 -> allows stepping continuously across empty week Nov 16-22 down to Nov 2-8
    let coveredStore = createEmptyPlanFoundationStore();
    coveredStore = setConfirmableTrackingStartDate(coveredStore, '2026-11-05', 'commitment_created');
    coveredStore = completeTaskCard(coveredStore, {
      logicalTaskId: 't::2026-11-23',
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Monday walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
    }).store;
    coveredStore = completeTaskCard(coveredStore, {
      logicalTaskId: 't::2026-11-10',
      dateKey: '2026-11-10',
      planId: 'stretch',
      title: 'Tuesday stretch',
      exerciseSegments: [{ exerciseType: 'stretch', title: 'Stretch' }],
    }).store;

    const curSnap = getPlanWeekSnapshot(coveredStore, '2026-11-23', refNov25);
    assertEqual(curSnap.canGoNext, false, 'Current week disables right arrow');
    assertEqual(curSnap.canGoPrevious, true, 'Covered history enables left arrow');
    assertEqual(curSnap.days.filter((d) => d.isToday).length, 1, 'Current week highlights today');

    // Empty covered week (Last week: Nov 16-22) is NOT skipped and shows genuine 0 tasks completed + hollow dots
    const emptyLastWeekKey = shiftLocalWeekStartKey('2026-11-23', -1);
    assertEqual(emptyLastWeekKey, '2026-11-16', 'Steps by exactly 1 week without skipping empty week');
    const emptyLastSnap = getPlanWeekSnapshot(coveredStore, emptyLastWeekKey, refNov25);
    assertEqual(emptyLastSnap.title, 'Last week', 'Empty previous week titled Last week');
    assertEqual(emptyLastSnap.isWeekCoverageUnknown, false, 'Covered empty week is known zero, not unknown');
    assertEqual(emptyLastSnap.doneTaskCount, 0, 'Covered empty week reports genuine 0 Done');
    assertEqual(emptyLastSnap.days.every((d) => d.visualState === 'past'), true, 'All 7 covered empty past days show hollow dot (past)');
    assertEqual(emptyLastSnap.days.some((d) => d.isToday), false, 'Historical week NEVER highlights today');

    // Coverage start week (Week of Nov 2, trackingStartDateKey = Nov 5): Mon-Wed are unknown (?), Thu-Sun are past, left arrow disabled
    const startWeekSnap = getPlanWeekSnapshot(coveredStore, '2026-11-02', refNov25);
    assertEqual(startWeekSnap.canGoPrevious, false, 'Coverage start week disables left arrow');
    assertEqual(startWeekSnap.days[0].visualState, 'unknown', 'Mon Nov 2 before trackingStart is unknown (?)');
    assertEqual(startWeekSnap.days[2].visualState, 'unknown', 'Wed Nov 4 before trackingStart is unknown (?)');
    assertEqual(startWeekSnap.days[3].visualState, 'past', 'Thu Nov 5 on trackingStart is covered (past)');

    // Unknown coverage (trackingStartDateKey === null): never infers start date from earliest Done & never shows unknown empty week as 0
    let unknownStore = createEmptyPlanFoundationStore();
    unknownStore = completeTaskCard(unknownStore, {
      logicalTaskId: 't::2026-11-12',
      dateKey: '2026-11-12',
      planId: 'walk',
      title: 'Old walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
    }).store;

    const unknownBounds = getPlanWeekNavigationBounds(unknownStore, refNov25);
    assertEqual(unknownBounds.trackingStartDateKey, null, 'Earliest Done NEVER becomes trackingStartDateKey');
    assertEqual(unknownBounds.isHistoryCoverageKnown, false, 'Coverage remains unknown');
    assertEqual(unknownBounds.minWeekStartKey, '2026-11-09', 'Caps stepping without infinite empty weeks');

    const unknownEmptyWeek = getPlanWeekSnapshot(unknownStore, '2026-11-16', refNov25);
    assertEqual(unknownEmptyWeek.isWeekCoverageUnknown, true, 'Unrecorded historical week with unknown coverage is NOT shown as 0');
    assertEqual(unknownEmptyWeek.days.every((d) => d.visualState === 'unknown'), true, 'Unknown week days show ? instead of hollow dots');

    const unknownEarliestWeek = getPlanWeekSnapshot(unknownStore, '2026-11-09', refNov25);
    assertEqual(unknownEarliestWeek.canGoPrevious, false, 'Boundary stops at earliest known record when coverage unknown');
    assertEqual(unknownEarliestWeek.showEarlierUnavailableNote, true, 'Shows earlier records unavailable note at unknown boundary');
    assertEqual(unknownEarliestWeek.days[3].visualState, 'done', 'Recorded Thu Nov 12 still shows Done dot');
    assertEqual(unknownEarliestWeek.days[0].visualState, 'unknown', 'Unrecorded days in unknown-coverage week show ?');
  });

  // 14. HealthKit HKWorkoutActivityType aggregation, combo cards, indoor/outdoor, breathing, raw types, and sorting
  runTest('14. HealthKit workout type summary enforces indoor/outdoor merge, breathing isolation, combo cards, raw preservation, and sorting', () => {
    const refNov25 = new Date(2026, 10, 25);

    // Resolution spot checks
    assertEqual(resolveWorkoutActivityType({ workoutActivityType: 'indoorWalking' })?.key, 'walking', 'Indoor walking maps to Walking');
    assertEqual(resolveWorkoutActivityType({ workoutActivityType: 'outdoorWalking' })?.key, 'walking', 'Outdoor walking maps to Walking');
    assertEqual(resolveWorkoutActivityType({ exerciseType: 'breathing' })?.key, 'breathing', 'Pure breathing stays Breathing');
    assert(resolveWorkoutActivityType({ exerciseType: 'breathing' })?.key !== 'mindAndBody', 'Pure breathing NEVER auto-maps to mindAndBody');
    assertEqual(resolveWorkoutActivityType({ workoutActivityType: 'rest' }), null, 'Rest is NEVER a workout type');
    const rawResolved = resolveWorkoutActivityType({ workoutActivityType: 'Reformer Flow' });
    assertEqual(rawResolved?.label, 'Reformer Flow', 'Unknown raw workout type preserved verbatim');
    assertEqual(rawResolved?.isRawPreserved, true, 'Unknown raw workout type marked isRawPreserved');

    let store = createEmptyPlanFoundationStore();
    store = setConfirmableTrackingStartDate(store, '2026-11-01', 'first_confirmed_setup');

    // Card 1: Combo card (Walking + Flexibility) with ONLY planned duration -> 1 Done task, Walking +1, Flexibility +1, NO trustworthy duration
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-23::combo',
      dateKey: '2026-11-23',
      planId: 'combo',
      title: 'Walk + Stretch',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          workoutActivityType: 'outdoorWalking',
          locationContext: 'outdoor',
          title: 'Outdoor walk',
          plannedDurationMinutes: 15,
        },
        {
          exerciseType: 'stretch',
          workoutActivityType: 'flexibility',
          title: 'Post-walk stretch',
          plannedDurationMinutes: 5,
        },
      ],
    }).store;

    // Card 2: Same-type multi-segment card (2 Walking segments: indoor + outdoor) with trustworthy actual durations -> 1 Done task, Walking +1 (merged!), 22 min
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-24::two-walks',
      dateKey: '2026-11-24',
      planId: 'walk-double',
      title: 'Indoor + outdoor walk',
      exerciseSegments: [
        {
          exerciseType: 'walk',
          workoutActivityType: 'indoorWalking',
          locationContext: 'indoor',
          title: 'Warmup indoor walk',
          actualDurationMinutes: 10,
          durationTrust: 'measured',
        },
        {
          exerciseType: 'walk',
          workoutActivityType: 'outdoorWalking',
          locationContext: 'outdoor',
          title: 'Main outdoor walk',
          actualDurationMinutes: 12,
          durationTrust: 'measured',
        },
      ],
    }).store;

    // Duplicate click on Card 2 must remain idempotent
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-24::two-walks',
      dateKey: '2026-11-24',
      planId: 'walk-double',
      title: 'Indoor + outdoor walk',
      exerciseSegments: [
        { exerciseType: 'walk', title: 'Warmup', actualDurationMinutes: 10, durationTrust: 'measured' },
      ],
    }).store;

    // Standalone manual Yoga (trustworthy 25 min) on Wed Nov 25 -> DOES NOT increment Done or light up Done dot!
    store = addExerciseSession(store, {
      exerciseType: 'other',
      workoutActivityType: 'yoga',
      dateKey: '2026-11-25',
      actualDurationMinutes: 25,
      durationTrust: 'user_reported_actual',
      source: 'manual',
      title: 'Evening Yoga',
    }).store;

    // Standalone external Cycling (30 min measured) + Breathing + Unknown raw type + Explicit Rest
    store = addExerciseSession(store, {
      exerciseType: 'cardio',
      workoutActivityType: 'indoorCycling',
      locationContext: 'indoor',
      dateKey: '2026-11-25',
      actualDurationMinutes: 30,
      durationTrust: 'measured',
      source: 'external_import',
      title: 'Indoor Bike',
    }).store;
    store = addExerciseSession(store, {
      exerciseType: 'breathing',
      dateKey: '2026-11-25',
      source: 'manual',
      title: 'Box breathing',
    }).store;
    store = addExerciseSession(store, {
      exerciseType: 'other',
      workoutActivityType: 'Reformer Flow',
      dateKey: '2026-11-25',
      source: 'manual',
      title: 'Studio Reformer',
    }).store;
    store = recordLifecycleEvent(store, {
      type: 'rest',
      dateKey: '2026-11-26',
      source: 'today',
      title: 'Rest day',
    }).store;

    const snap = getPlanWeekSnapshot(store, '2026-11-23', refNov25);
    assertEqual(snap.doneTaskCount, 2, 'Only 2 logical Done task cards count toward Done');
    // Wed Nov 25 has 4 manual/external sessions but 0 Done tasks -> must NOT light up Done dot!
    const wed = snap.days[2];
    assertEqual(wed.dateKey, '2026-11-25', 'Wed is index 2');
    assertEqual(wed.doneTaskCount, 0, 'Manual/external sessions do not increment day Done count');
    assert(wed.visualState !== 'done', 'Manual/external workouts alone NEVER light up Done dot');

    // Thu Nov 26 has explicit rest -> rest dash, never in workout types
    assertEqual(snap.days[3].visualState, 'rest', 'Explicit rest day shows rest dash');
    assert(!snap.workoutSummary.allTypes.some((t) => t.key === 'rest'), 'Rest excluded from workout summary');

    // Workout types total = 6: Walking (2), Breathing (1), Cycling (1), Flexibility (1), Reformer Flow (1), Yoga (1)
    const ws = getWeekWorkoutTypeSummary(store, '2026-11-23');
    assertEqual(ws.totalTypeCount, 6, '6 distinct workout types recorded');
    assertEqual(ws.hasMoreTypes, true, 'More than 3 workout types triggers View all (N)');
    assertEqual(ws.topTypes.length, 3, 'Top workout summary capped at 3 rows');
    assertEqual(ws.allTypes[0].label, 'Walking', 'Highest count (2) sorted first');
    assertEqual(ws.allTypes[0].count, 2, 'Two cards with Walking (even 3 total segments) = 2');
    assertEqual(ws.allTypes[0].hasCompleteDurationData, false, 'Walking mixed unknown+measured duration does not misreport partial sum as complete');
    // Alphabetical tie-break for count === 1: Breathing, Cycling, Flexibility, Reformer Flow, Yoga
    assertEqual(ws.allTypes[1].label, 'Breathing', 'Alphabetical tie-break #1: Breathing (not Mind & Body)');
    assertEqual(ws.allTypes[2].label, 'Cycling', 'Alphabetical tie-break #2: Cycling');
    assertEqual(ws.allTypes[2].trustworthyDurationMinutes, 30, 'Cycling shows trustworthy 30 min');
    assertEqual(ws.allTypes[2].hasCompleteDurationData, true, 'Cycling has complete trustworthy duration');
    const flexRow = ws.allTypes.find((r) => r.key === 'flexibility')!;
    assertEqual(flexRow.trustworthyDurationMinutes, 0, 'Planned 5 min NEVER becomes trustworthy duration');
    assertEqual(flexRow.hasCompleteDurationData, false, 'Flexibility has no trustworthy duration');
    assert(ws.allTypes.some((r) => r.label === 'Reformer Flow'), 'Unknown raw type preserved verbatim');

    // Undo Card 1 -> Done count drops to 1, Flexibility disappears, Walking drops to 1 with complete 22 min!
    const afterUndo = undoTaskCardCompletion(store, { logicalTaskId: 't::2026-11-23::combo' });
    const snapAfterUndo = getPlanWeekSnapshot(afterUndo, '2026-11-23', refNov25);
    assertEqual(snapAfterUndo.doneTaskCount, 1, 'Undo decrements Done count to 1');
    const walkAfterUndo = snapAfterUndo.workoutSummary.allTypes.find((r) => r.key === 'walking')!;
    assertEqual(walkAfterUndo.count, 1, 'Walking count drops to 1 after undo');
    assertEqual(walkAfterUndo.trustworthyDurationMinutes, 22, 'Merged 10+12 min trustworthy duration preserved');
    assertEqual(walkAfterUndo.hasCompleteDurationData, true, 'Walking now has complete trustworthy duration');
    assert(!snapAfterUndo.workoutSummary.allTypes.some((r) => r.key === 'flexibility'), 'Flexibility removed after undo');
  });

  // 15. Your rhythm: rolling 7-day curve, 6-day vs 7-day coverage, same-day deduplication, undo/backfill, cross-month, unknown coverage line break
  runTest('15. Your rhythm computes rolling 7-day days with strict coverage breaks, deduplication, and cross-month windows', () => {
    const refNov23 = new Date(2026, 10, 23); // Today = Nov 23, 2026; ended 30d = Oct 24 .. Nov 22

    // Unconfirmed habit: Done tasks alone NEVER create or auto-group a habit
    let store = createEmptyPlanFoundationStore();
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-20::walk',
      dateKey: '2026-11-20',
      planId: 'walk',
      title: 'Evening walk',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk' }],
    }).store;
    assertEqual(getConfirmedHabits(store).length, 0, 'Done tasks without explicit confirmation NEVER auto-create a habit');

    // Explicitly confirm a habit
    const confirmed = confirmHabitStrategy(store, {
      habitId: 'habit::evening-walk',
      label: 'Evening walk',
      regularAction: '20 min outdoor walk',
      minimumAction: '5 min loop outside',
      confirmTrackingStartDateKey: '2026-11-17', // Only 6 ended days (Nov 17..22) -> < 7 days!
    });
    store = confirmed.store;
    assertEqual(getConfirmedHabits(store).length, 1, 'Explicitly confirmed habit is registered');

    // 0 practices -> Ready when you are, no fake chart
    const zeroModel = getHabitRhythmModel(store, 'habit::evening-walk', refNov23);
    assertEqual(zeroModel.statusCode, 'ready', '0 practices -> Ready when you are');
    assertEqual(zeroModel.hasChartData, false, '6 covered days has 0 valid rolling 7-day points');
    assertEqual(zeroModel.points.length, 30, 'Always spans 30 ended days');
    assertEqual(zeroModel.points[0].shortDateLabel, 'Oct 24', 'Cross-month start label is Oct 24');
    assertEqual(zeroModel.points[29].shortDateLabel, 'Nov 22', 'Latest ended day is yesterday (Nov 22)');

    // Add 2 cards on SAME day (Nov 20: regular + minimum) + 1 card on Nov 21 + 1 card TODAY (Nov 23) + 1 rest event
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-20::reg',
      dateKey: '2026-11-20',
      planId: 'walk',
      title: 'Evening walk',
      linkedHabitIds: ['habit::evening-walk'],
      actionTier: 'regular',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk', linkedHabitId: 'habit::evening-walk' }],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-20::min',
      dateKey: '2026-11-20',
      planId: 'walk-min',
      title: '5 min loop',
      linkedHabitIds: ['habit::evening-walk'],
      actionTier: 'minimum',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Short walk', linkedHabitId: 'habit::evening-walk' }],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-21::min',
      dateKey: '2026-11-21',
      planId: 'walk-min',
      title: '5 min loop',
      linkedHabitIds: ['habit::evening-walk'],
      actionTier: 'minimum',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Short walk', linkedHabitId: 'habit::evening-walk' }],
    }).store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-23::today',
      dateKey: '2026-11-23',
      planId: 'walk',
      title: 'Today walk',
      linkedHabitIds: ['habit::evening-walk'],
      actionTier: 'regular',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk', linkedHabitId: 'habit::evening-walk' }],
    }).store;
    store = recordLifecycleEvent(store, {
      type: 'rest',
      dateKey: '2026-11-19',
      source: 'today',
      habitId: 'habit::evening-walk',
      title: 'Rest day',
    }).store;

    // Still only 6 covered ended days (Nov 17..22) -> status MUST be 'beginning', chart still insufficient!
    const sixDayModel = getHabitRhythmModel(store, 'habit::evening-walk', refNov23);
    assertEqual(sixDayModel.validPointCount, 0, '6 covered days yields 0 valid 7-day rolling points');
    assertEqual(sixDayModel.hasChartData, false, 'No fake curve on 6 covered days');
    assertEqual(sixDayModel.statusCode, 'beginning', 'Lacking complete 7-day coverage -> A beginning');
    assertEqual(sixDayModel.todayInProgress.hasPracticeToday, true, 'Today tracked separately as in progress');
    assertEqual(sixDayModel.distinctPracticeDates.length, 3, 'Distinct dates: Nov 20 (deduped!), Nov 21, Nov 23');

    // Extend coverage back to Nov 16 (exactly 7 covered ended days: Nov 16..22)
    store = setConfirmableTrackingStartDate(store, '2026-11-16', 'first_confirmed_setup');
    const sevenDayModel = getHabitRhythmModel(store, 'habit::evening-walk', refNov23);
    assertEqual(sevenDayModel.validPointCount, 1, '7 covered days yields exactly 1 valid rolling point (Nov 22)');
    assertEqual(sevenDayModel.hasChartData, true, '7 covered days unlocks chart');
    assertEqual(sevenDayModel.latestValidPoint?.dateKey, '2026-11-22', 'Latest valid point is Nov 22 (excludes Today Nov 23)');
    assertEqual(sevenDayModel.latestValidPoint?.value, 2, 'Same-day multi-card deduplicated: Nov 20 (1) + Nov 21 (1) = 2 days (not 3, excludes Today & Rest)');
    assertEqual(sevenDayModel.statusCode, 'finding_rhythm', '>=2 practice dates + complete 7-day coverage -> Finding a rhythm');
    assertEqual(sevenDayModel.numericSummary, '2 days in the 7 days through Nov 22.', 'Numeric summary synced with latestValidPoint');

    // Undo Nov 21 card -> drops rolling count to 1
    store = undoTaskCardCompletion(store, { logicalTaskId: 't::2026-11-21::min' });
    const afterUndoModel = getHabitRhythmModel(store, 'habit::evening-walk', refNov23);
    assertEqual(afterUndoModel.latestValidPoint?.value, 1, 'Undo recomputes rolling 7-day value to 1');

    // Backfill Oct 25 + full 36-day coverage + unknown range gap on Nov 5..6 -> line breaks cleanly without zero-fill!
    store = setConfirmableTrackingStartDate(store, '2026-10-18', 'first_confirmed_setup');
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-10-25::backfill',
      dateKey: '2026-10-25',
      planId: 'walk',
      title: 'Backfilled walk',
      linkedHabitIds: ['habit::evening-walk'],
      actionTier: 'regular',
      exerciseSegments: [{ exerciseType: 'walk', title: 'Walk', linkedHabitId: 'habit::evening-walk' }],
    }).store;
    store = {
      ...store,
      coverage: {
        ...store.coverage,
        unknownRanges: [{ startDateKey: '2026-11-05', endDateKey: '2026-11-06', reason: 'Sync gap' }],
      },
    };
    const gapModel = getHabitRhythmModel(store, 'habit::evening-walk', refNov23);
    assertEqual(gapModel.hasCoverageGap, true, 'Mid-series unknown range sets hasCoverageGap');
    assert(gapModel.segments.length >= 2, 'Unknown range splits curve into >= 2 non-bridged segments');
    const nov5Point = gapModel.points.find((p) => p.dateKey === '2026-11-05')!;
    const nov12Point = gapModel.points.find((p) => p.dateKey === '2026-11-12')!;
    const nov13Point = gapModel.points.find((p) => p.dateKey === '2026-11-13')!;
    assertEqual(nov5Point.value, null, 'Window overlapping unknown day Nov 5 is null (never zero-filled)');
    assertEqual(nov12Point.value, null, 'Window [Nov 6..12] still touches unknown Nov 6 -> null');
    assertEqual(nov13Point.value, 0, 'Window [Nov 7..13] fully covered with 0 practices -> genuine 0');
  });

  // 16. Your rhythm: strict 7-level priority (1 -> 7) and self-report evidence guardrails
  runTest('16. Your rhythm enforces strict 7-level status priority and isolates self-report feelings across config changes', () => {
    const refNov23 = new Date(2026, 10, 23);
    let store = createEmptyPlanFoundationStore();
    store = setConfirmableTrackingStartDate(store, '2026-10-15', 'commitment_created');

    const { store: s1, strategy } = confirmHabitStrategy(store, {
      habitId: 'habit::stretch',
      label: 'Morning stretch',
      regularAction: '10 min mobility flow',
      minimumAction: '2 min shoulder rolls',
    });
    store = s1;

    // Add 10 Done tasks across 10 days -> NEVER infers "You said starting feels easier."
    for (let day = 10; day <= 19; day += 1) {
      const dateKey = `2026-11-${String(day).padStart(2, '0')}`;
      store = completeTaskCard(store, {
        logicalTaskId: `t::${dateKey}::stretch`,
        dateKey,
        planId: 'stretch',
        title: 'Morning stretch',
        linkedHabitIds: ['habit::stretch'],
        actionTier: 'regular',
        exerciseSegments: [{ exerciseType: 'stretch', title: 'Stretch', linkedHabitId: 'habit::stretch' }],
      }).store;
    }

    const baseModel = getHabitRhythmModel(store, 'habit::stretch', refNov23);
    assertEqual(baseModel.statusCode, 'finding_rhythm', 'Healthy multi-day habit -> Finding a rhythm');
    assertEqual(baseModel.startingFeelsEasierSupported, false, '10 Done tasks NEVER fabricate "You said starting feels easier."');
    assert(baseModel.factualBasis !== 'You said starting feels easier.', 'No fabricated feeling basis');

    // Add explicit "Hard to start" check-in under current config -> Priority 6: Let’s make room
    store = recordHabitCheckIn(store, {
      habitId: 'habit::stretch',
      frictionLevel: 'hard_to_start',
      dateKey: '2026-11-12',
      recordedAt: '2026-11-12T08:00:00.000Z',
    }).store;
    const makeRoomModel = getHabitRhythmModel(store, 'habit::stretch', refNov23);
    assertEqual(makeRoomModel.statusCode, 'make_room', 'Active Hard to start -> Let’s make room');
    assertEqual(makeRoomModel.statusLabel, 'Let’s make room', 'Exact status label');

    // Add second comparable check-in showing improvement ("easier") under SAME version + configFingerprint + questionId
    store = recordHabitCheckIn(store, {
      habitId: 'habit::stretch',
      frictionLevel: 'easier',
      dateKey: '2026-11-19',
      recordedAt: '2026-11-19T08:00:00.000Z',
    }).store;
    const easierModel = getHabitRhythmModel(store, 'habit::stretch', refNov23);
    assertEqual(easierModel.statusCode, 'finding_rhythm', 'Improved latest rating restores Finding a rhythm');
    assertEqual(easierModel.startingFeelsEasierSupported, true, '2 comparable improving self-reports enable startingFeelsEasierSupported');
    assertEqual(easierModel.factualBasis, 'You said starting feels easier.', 'Exact evidence-backed basis shown');

    // Edit habit action config -> bumps habitVersion (v1 -> v2) so old check-ins stay historical!
    const updated = confirmHabitStrategy(store, {
      habitId: 'habit::stretch',
      label: 'Morning stretch',
      regularAction: '15 min full-body stretch',
      minimumAction: '2 min shoulder rolls',
    });
    store = updated.store;
    assert(updated.strategy.version !== strategy.version, 'Editing action config bumps habitVersion');
    assertEqual(
      hasStartingFeelsEasierEvidence(
        store,
        'habit::stretch',
        updated.strategy.version,
        computeHabitConfigFingerprint(updated.strategy),
        DEFAULT_HABIT_EASE_QUESTION_ID
      ),
      false,
      'Old check-ins do not leak across habit config changes'
    );
    const afterConfigChange = getHabitRhythmModel(store, 'habit::stretch', refNov23);
    assertEqual(afterConfigChange.startingFeelsEasierSupported, false, 'Factual basis resets cleanly after config change');

    // Priority 4: Pause -> Resume -> Practice after resume -> Finding your way back
    store = recordLifecycleEvent(store, {
      type: 'pause',
      dateKey: '2026-11-20',
      occurredAt: '2026-11-20T09:00:00.000Z',
      source: 'plan',
      habitId: 'habit::stretch',
    }).store;
    // Priority 2: Paused overrides everything except query failure
    assertEqual(getHabitRhythmModel(store, 'habit::stretch', refNov23).statusCode, 'paused', 'Explicit pause -> Taking a pause');

    // Priority 1: Query failure overrides Paused!
    const failedStore = {
      ...store,
      coverage: {
        ...store.coverage,
        failedLoadRanges: [
          {
            startDateKey: null,
            endDateKey: null,
            storageKey: PLAN_FOUNDATION_STORAGE_KEY,
            errorMessage: 'Corrupt payload',
            occurredAt: '2026-11-23T00:00:00.000Z',
          },
        ],
      },
    };
    assertEqual(getHabitRhythmModel(failedStore, 'habit::stretch', refNov23).statusCode, 'unavailable', 'Priority 1 query failure overrides Paused');

    // Resume on Nov 21 + practice on Nov 22 -> Priority 4 Finding your way back
    const resumeRes = recordLifecycleEvent(store, {
      type: 'resume',
      dateKey: '2026-11-21',
      occurredAt: '2026-11-21T08:00:00.000Z',
      source: 'plan',
      habitId: 'habit::stretch',
    });
    store = resumeRes.store;
    store = completeTaskCard(store, {
      logicalTaskId: 't::2026-11-22::return',
      dateKey: '2026-11-22',
      completedAt: '2026-11-22T09:00:00.000Z',
      planId: 'stretch',
      title: 'Return stretch',
      linkedHabitIds: ['habit::stretch'],
      actionTier: 'regular',
      exerciseSegments: [{ exerciseType: 'stretch', title: 'Stretch', linkedHabitId: 'habit::stretch' }],
    }).store;
    assertEqual(getHabitRhythmModel(store, 'habit::stretch', refNov23).statusCode, 'finding_way_back', 'Resumed + practice before return review -> Finding your way back');

    // Even with < 7 covered days, Finding your way back still honestly withholds fake chart!
    const shortCovReturnStore = setConfirmableTrackingStartDate(store, '2026-11-18', 'first_confirmed_setup');
    const shortCovReturnModel = getHabitRhythmModel(shortCovReturnStore, 'habit::stretch', refNov23);
    assertEqual(shortCovReturnModel.statusCode, 'finding_way_back', 'Priority 4 beats Priority 5 even with <7 covered days');
    assertEqual(shortCovReturnModel.hasChartData, false, 'Chart honestly stays in insufficient-data state when <7 covered days');

    // Completing return review clears Finding your way back -> Finding a rhythm
    store = recordHabitCheckIn(store, {
      habitId: 'habit::stretch',
      isReturnReview: true,
      relatedResumeEventId: resumeRes.event.id,
      dateKey: '2026-11-22',
      recordedAt: '2026-11-22T18:00:00.000Z',
    }).store;
    assertEqual(getHabitRhythmModel(store, 'habit::stretch', refNov23).statusCode, 'finding_rhythm', 'Return review completion exits Finding your way back');
  });

  console.log(`\nALL ${passed} ACCEPTANCE TESTS PASSED.`);
  return { passed };
}

// Execute immediately when run directly via `npx tsx`
if (typeof process !== 'undefined' && process.argv[1]?.includes('planDataFoundation.acceptance')) {
  runPlanDataFoundationAcceptanceSuite();
}
