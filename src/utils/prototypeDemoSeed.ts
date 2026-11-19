import {
  ACTIVITIES_STORAGE_KEY,
  ActivityCompletionRecord,
  DEFAULT_WEEKLY_DRAFT,
  REST_RECORDS_STORAGE_KEY,
  RestRecord,
  WeeklySchedule,
  addLocalDays,
  buildDateOnlyIso,
  createDemoHistoryRecords,
  formatReviewOnSundayLabel,
  getLastCompletedWeekBounds,
  getLocalWeekBounds,
  getNextWeekBounds,
  isDateKeyInWeek,
  loadUnifiedActivityStore,
  loadWeeklySchedulesByWeek,
  saveUnifiedActivities,
  saveUnifiedRestRecords,
  saveWeeklySchedulesByWeek,
  toLocalDateKey,
} from './weeklyPlanStore';
import {
  DEFAULT_PLAN_PHASES,
  PLAN_PATH_STORAGE_KEY,
  loadInitialPlanPath,
  savePlanPathState,
} from './planPhaseStore';
import {
  PREFERENCES_STORAGE_KEY,
  PROTOTYPE_DEMO_PREFERENCES,
  loadPreferences,
  savePreferences,
} from './preferencesStore';

export const PROTOTYPE_DEMO_SEED_VERSION = '2026-11.v1';
export const PROTOTYPE_DEMO_SEED_VERSION_KEY = 'genki.plan.demoSeedVersion.v1';

export const FOCUS_STORAGE_KEY = 'genki.plan.focus.v1';
export const LEGACY_DIRECTION_STORAGE_KEYS = [
  'genki.plan.direction.v1',
  'genki.plan.direction',
  'genki_direction',
  'your_direction',
] as const;

const LEGACY_SAMPLE_NOTES_TO_STRIP = new Set([
  'Sample historical activity',
  'Sample restorative day',
]);

function createDemoWeeklySchedule(): WeeklySchedule {
  return {
    walk: {
      targetCount: DEFAULT_WEEKLY_DRAFT.walk.targetCount,
      durationLabel: DEFAULT_WEEKLY_DRAFT.walk.durationLabel,
    },
    stretch: {
      targetCount: DEFAULT_WEEKLY_DRAFT.stretch.targetCount,
      durationLabel: DEFAULT_WEEKLY_DRAFT.stretch.durationLabel,
    },
    restNote: 'As needed',
    updatedAt: '',
    source: 'demo',
  };
}

function hasSavedUserFocus(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const title =
          typeof obj.focus === 'string'
            ? obj.focus.trim()
            : typeof obj.goalTitle === 'string'
            ? obj.goalTitle.trim()
            : '';
        const isDemo = obj.source === 'demo' || obj.isSample === true;
        if (title && !isDemo) return true;
      }
    }

    for (const legacyKey of LEGACY_DIRECTION_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const parsed = JSON.parse(legacyRaw);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const title =
          typeof obj.focus === 'string'
            ? obj.focus.trim()
            : typeof obj.goalTitle === 'string'
            ? obj.goalTitle.trim()
            : '';
        const isDemo = obj.source === 'demo' || obj.isSample === true;
        if (title && !isDemo) return true;
      }
    }
  } catch {
    // Ignore malformed JSON
  }
  return false;
}

/**
 * One-time versioned prototype demo data initializer.
 *
 * Rules:
 * - Runs at most once per PROTOTYPE_DEMO_SEED_VERSION.
 * - Preserves all existing user data (never clears or overwrites user records).
 * - Uses stable deterministic IDs and local date utilities.
 * - Retains internal `source: 'demo'` markers in code without surfacing sample notices in UI.
 * - Never pre-selects Weekly review feedback, never fabricates Today completions or future logs,
 *   never invents exact timestamps for demo records, and never seeds health metrics.
 */
export function initializePrototypeDemoData(referenceDate: Date = new Date()): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    if (
      window.localStorage.getItem(PROTOTYPE_DEMO_SEED_VERSION_KEY) ===
      PROTOTYPE_DEMO_SEED_VERSION
    ) {
      return;
    }
  } catch {
    return;
  }

  const localToday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const todayKey = toLocalDateKey(localToday);
  const currentWeekBounds = getLocalWeekBounds(localToday);
  const lastWeekBounds = getLastCompletedWeekBounds(localToday);
  const nextWeekBounds = getNextWeekBounds(localToday);

  // 1. Up next phases & Your focus (shared current phase)
  let activePhaseName = DEFAULT_PLAN_PHASES[0].name;
  try {
    const existingPathRaw = window.localStorage.getItem(PLAN_PATH_STORAGE_KEY);
    if (!existingPathRaw) {
      savePlanPathState({
        phases: DEFAULT_PLAN_PHASES.map((p) => ({ ...p })),
        currentPhaseId: DEFAULT_PLAN_PHASES[0].id,
        source: 'demo',
      });
    } else {
      const loadedPath = loadInitialPlanPath();
      const matched = loadedPath.phases.find((p) => p.id === loadedPath.currentPhaseId);
      if (matched) activePhaseName = matched.name;
    }

    if (!hasSavedUserFocus()) {
      const demoFocusPayload = {
        focus: 'Feel more energetic',
        phase: activePhaseName,
        approach: 'Short walks and gentle stretches.',
        reviewDate: formatReviewOnSundayLabel(localToday),
        status: 'active',
        goalId: 'energy',
        source: 'demo',
        isSample: true,
      };
      window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(demoFocusPayload));
    }
  } catch {
    // Ignore storage errors
  }

  // 2. This week & Next week schedules (saved independently by weekStartKey)
  try {
    const existingByWeek = loadWeeklySchedulesByWeek(localToday);
    let schedulesChanged = false;
    const nextByWeek = { ...existingByWeek };

    if (!nextByWeek[currentWeekBounds.weekStartKey]) {
      nextByWeek[currentWeekBounds.weekStartKey] = createDemoWeeklySchedule();
      schedulesChanged = true;
    }
    if (!nextByWeek[nextWeekBounds.weekStartKey]) {
      nextByWeek[nextWeekBounds.weekStartKey] = createDemoWeeklySchedule();
      schedulesChanged = true;
    }

    if (schedulesChanged) {
      saveWeeklySchedulesByWeek(nextByWeek);
    }
  } catch {
    // Ignore storage errors
  }

  // 3. Unified activities & rest records (History + This week + Weekly review)
  try {
    const hadUnifiedActivitiesKey =
      window.localStorage.getItem(ACTIVITIES_STORAGE_KEY) !== null;
    const hadUnifiedRestKey =
      window.localStorage.getItem(REST_RECORDS_STORAGE_KEY) !== null;

    const unified = loadUnifiedActivityStore(localToday);
    let activities = [...unified.activities];
    let restRecords = [...unified.restRecords];
    let activitiesChanged = false;
    let restChanged = false;

    // Strip any legacy sample-label note strings on previously seeded demo entries
    activities = activities.map((rec) => {
      if (rec.source === 'demo' && rec.note && LEGACY_SAMPLE_NOTES_TO_STRIP.has(rec.note)) {
        activitiesChanged = true;
        const cleaned = { ...rec };
        delete cleaned.note;
        return cleaned;
      }
      return rec;
    });
    restRecords = restRecords.map((rec) => {
      if (rec.source === 'demo' && rec.note && LEGACY_SAMPLE_NOTES_TO_STRIP.has(rec.note)) {
        restChanged = true;
        const cleaned = { ...rec };
        delete cleaned.note;
        return cleaned;
      }
      return rec;
    });

    const existingActivityIds = new Set(activities.map((a) => a.id));
    const existingRestIds = new Set(restRecords.map((r) => r.id));

    const pushDemoActivityIfAbsent = (rec: ActivityCompletionRecord) => {
      if (existingActivityIds.has(rec.id)) return;
      existingActivityIds.add(rec.id);
      activities.push(rec);
      activitiesChanged = true;
    };

    const pushDemoRestIfAbsent = (rec: RestRecord) => {
      if (existingRestIds.has(rec.id)) return;
      existingRestIds.add(rec.id);
      restRecords.push(rec);
      restChanged = true;
    };

    // 3a. Last completed week (Tue Walk 15m, Thu Stretch 5m, Sat Walk 15m, Sun Rest)
    // Only seed when user has no real activities or rest records in last completed week
    const hasUserLastWeekData =
      activities.some(
        (a) =>
          a.source !== 'demo' &&
          isDateKeyInWeek(a.dateKey, lastWeekBounds.weekStartKey, lastWeekBounds.weekEndKey)
      ) ||
      restRecords.some(
        (r) =>
          r.source !== 'demo' &&
          isDateKeyInWeek(r.dateKey, lastWeekBounds.weekStartKey, lastWeekBounds.weekEndKey)
      );

    if (!hasUserLastWeekData) {
      const lastTueKey = toLocalDateKey(addLocalDays(lastWeekBounds.weekStart, 1));
      const lastThuKey = toLocalDateKey(addLocalDays(lastWeekBounds.weekStart, 3));
      const lastSatKey = toLocalDateKey(addLocalDays(lastWeekBounds.weekStart, 5));
      const lastSunKey = toLocalDateKey(addLocalDays(lastWeekBounds.weekStart, 6));

      pushDemoActivityIfAbsent({
        id: `demo::${lastTueKey}::walk`,
        source: 'demo',
        title: 'Walk',
        category: 'walk',
        durationMinutes: 15,
        completedAt: buildDateOnlyIso(lastTueKey),
        dateKey: lastTueKey,
        hasExactTimestamp: false,
        isSample: true,
      });

      pushDemoActivityIfAbsent({
        id: `demo::${lastThuKey}::stretch`,
        source: 'demo',
        title: 'Stretch',
        category: 'stretch',
        durationMinutes: 5,
        completedAt: buildDateOnlyIso(lastThuKey),
        dateKey: lastThuKey,
        hasExactTimestamp: false,
        isSample: true,
      });

      pushDemoActivityIfAbsent({
        id: `demo::${lastSatKey}::walk`,
        source: 'demo',
        title: 'Walk',
        category: 'walk',
        durationMinutes: 15,
        completedAt: buildDateOnlyIso(lastSatKey),
        dateKey: lastSatKey,
        hasExactTimestamp: false,
        isSample: true,
      });

      pushDemoRestIfAbsent({
        id: `demo-rest::${lastSunKey}`,
        dateKey: lastSunKey,
        source: 'demo',
        title: 'Rest day',
        createdAt: buildDateOnlyIso(lastSunKey),
        isSample: true,
      });
    }

    // 3b. This week (ONLY strictly past days < todayKey; never Today, never future; 0 on Monday)
    const hasUserThisWeekData =
      activities.some(
        (a) =>
          a.source !== 'demo' &&
          isDateKeyInWeek(a.dateKey, currentWeekBounds.weekStartKey, currentWeekBounds.weekEndKey)
      ) ||
      restRecords.some(
        (r) =>
          r.source !== 'demo' &&
          isDateKeyInWeek(r.dateKey, currentWeekBounds.weekStartKey, currentWeekBounds.weekEndKey)
      );

    if (!hasUserThisWeekData) {
      const daysSinceMonday = (localToday.getDay() + 6) % 7;

      if (daysSinceMonday >= 1) {
        const monKey = toLocalDateKey(currentWeekBounds.weekStart);
        if (monKey < todayKey) {
          pushDemoActivityIfAbsent({
            id: `demo::${monKey}::walk`,
            source: 'demo',
            title: 'Walk',
            category: 'walk',
            durationMinutes: 15,
            completedAt: buildDateOnlyIso(monKey),
            dateKey: monKey,
            hasExactTimestamp: false,
            isSample: true,
          });
        }
      }

      if (daysSinceMonday >= 2) {
        const stretchOffset = daysSinceMonday >= 3 ? 2 : 1;
        const stretchDateKey = toLocalDateKey(addLocalDays(currentWeekBounds.weekStart, stretchOffset));
        if (stretchDateKey < todayKey) {
          pushDemoActivityIfAbsent({
            id: `demo::${stretchDateKey}::stretch`,
            source: 'demo',
            title: 'Stretch',
            category: 'stretch',
            durationMinutes: 5,
            completedAt: buildDateOnlyIso(stretchDateKey),
            dateKey: stretchDateKey,
            hasExactTimestamp: false,
            isSample: true,
          });
        }
      }
    }

    // 3c. Earlier historical months (< lastWeekBounds.weekStartKey) for History calendar & 6-month trend
    if (!hadUnifiedActivitiesKey && !hadUnifiedRestKey) {
      const userDates = new Set<string>([
        ...activities.filter((a) => a.source !== 'demo').map((a) => a.dateKey),
        ...restRecords.filter((r) => r.source !== 'demo').map((r) => r.dateKey),
      ]);
      const historicalDemo = createDemoHistoryRecords(localToday);
      for (const a of historicalDemo.activities) {
        if (!userDates.has(a.dateKey)) {
          pushDemoActivityIfAbsent(a);
        }
      }
      for (const r of historicalDemo.restRecords) {
        if (!userDates.has(r.dateKey)) {
          pushDemoRestIfAbsent(r);
        }
      }
    }

    if (activitiesChanged) {
      saveUnifiedActivities(activities);
    }
    if (restChanged) {
      saveUnifiedRestRecords(restRecords);
    }
  } catch {
    // Ignore storage errors
  }

  // 4. Weekly review: intentionally do NOT pre-select any feeling (Too much / About right / Ready for more)

  // 5. Preferences: sanitize any legacy hardcoded default seeds; if no preferences exist at all,
  //    seed at most 2 pending demo questions with no fabricated evidence.
  try {
    const hadPrefsKey = window.localStorage.getItem(PREFERENCES_STORAGE_KEY) !== null;
    const loadedPrefs = loadPreferences();
    if (!hadPrefsKey && loadedPrefs.length === 0) {
      savePreferences(PROTOTYPE_DEMO_PREFERENCES.map((item) => ({ ...item })));
    }
  } catch {
    // Ignore storage errors
  }

  // 6. Health data: intentionally remains Not connected / No data (never seeded)

  // Mark initialization complete for this version so refresh, tab switches, or deletions never re-seed
  try {
    window.localStorage.setItem(
      PROTOTYPE_DEMO_SEED_VERSION_KEY,
      PROTOTYPE_DEMO_SEED_VERSION
    );
  } catch {
    // Ignore storage errors
  }
}
