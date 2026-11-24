import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Heart,
  Moon,
  Flame,
  Footprints,
  X,
  Check,
  Clock,
  Calendar as CalendarIcon,
  TrendingUp,
  ShieldCheck,
  HelpCircle,
  BarChart2,
  AlertCircle,
  Info,
  RotateCcw,
  MessageSquare,
  Trash2,
  ArrowUp,
  CornerDownRight
} from 'lucide-react';
import { FurryNovaStaticAvatar } from './Avatar3D/FurryNovaStaticAvatar';
import { NovaAvatar3D } from './Avatar3D/NovaAvatar3D';
import {
  ActivityCategory,
  ActivityCompletionRecord,
  ActivityUpdatePatch,
  DEFAULT_WEEKLY_DRAFT,
  ManualActivityInput,
  RestRecord,
  WeeklyAdjustmentProposal,
  WeeklyReviewFeedback,
  WeeklyReviewFeeling,
  WeeklySchedule,
  WeeklySchedulesByWeek,
  addLocalDays,
  applyWeeklyAdjustmentProposal,
  buildWeeklyAdjustmentProposal,
  formatReviewOnSundayLabel,
  formatShortMonthDay,
  getLastCompletedWeekBounds,
  getLocalWeekBounds,
  getNextWeekBounds,
  getWeeklyScheduleFieldValue,
  inferActivityCategory,
  isDateKeyInWeek,
  loadResolvedAdjustmentKeys,
  loadWeeklyReviewFeedbacks,
  loadWeeklySchedulesByWeek,
  parseLocalDateKey,
  saveResolvedAdjustmentKeys,
  saveWeeklyReviewFeedbacks,
  saveWeeklySchedulesByWeek,
  setWeeklyScheduleFieldValue,
  toLocalDateKey,
} from '../utils/weeklyPlanStore';
import {
  FOCUS_STORAGE_KEY,
  LEGACY_DIRECTION_STORAGE_KEYS,
} from '../utils/prototypeDemoSeed';
import { PlanRhythmChart } from './PlanRhythmChart';
import { YourJourneyView, type JourneyActionResult } from './YourJourneyView';
import {
  WEEKLY_FIT_OPTIONS,
  WEEKLY_HARD_FOLLOWUP_OPTIONS,
  WeeklyReviewDetailView,
} from './WeeklyReviewDetailView';
import {
  GoalDetailView,
  type GoalDetailSubMode,
  type GoalNextStepSubmitInput,
} from './GoalDetailView';
import {
  AdjustGoalCommitmentInput,
  ConfirmedActionStrategy,
  DEFAULT_HABIT_EASE_QUESTION_ID,
  GoalReviewFeeling,
  HabitStartFrictionLevel,
  JourneyNextStepExperiment,
  PlanFoundationStore,
  WEEKLY_REVIEW_FIT_QUESTION_ID,
  WEEKLY_REVIEW_HARD_FOLLOWUP_QUESTION_ID,
  WEEKLY_REVIEW_SELF_REPORT_QUESTION_ID,
  WeeklyHardFollowUpAnswer,
  WeeklyReviewFitAnswer,
  adjustGoalCommitment,
  appendWeeklyReviewDecision,
  applyCompletedGoalNextStep,
  clearHiddenHabitStatusConclusion,
  confirmGoalCompletion,
  confirmHabitStrategy,
  createEmptyPlanFoundationStore,
  deriveCommitmentStrategyLine,
  derivePlanHeaderDetailActionLabel,
  derivePlanHeaderNovaLine,
  getConfirmedHabits,
  getHabitRhythmModel,
  getPlanWeekSnapshot,
  getWeekDoneTaskCount,
  getWeeklyReviewModel,
  hasConfirmedPhaseCommitment,
  hideHabitStatusConclusion,
  loadPlanFoundationStore,
  mapExerciseTypeToLegacyCategory,
  projectLegacyWeeklyReviewFeedbacks,
  recordCommitmentRhythmEvent,
  recordGoalKeepExploring,
  recordHabitCheckIn,
  recordLifecycleEvent,
  recordSharedSuggestionDecision,
  savePlanFoundationStore,
  shiftLocalWeekStartKey,
  upsertPhaseCommitment,
  upsertWeeklyReviewAnswer,
} from '../utils/planDataFoundation';
import {
  PlanPathState,
  loadInitialPlanPath,
} from '../utils/planPhaseStore';
import {
  MemoryCategory,
  PreferenceItem,
  deriveShortPreferenceTag,
  formatAsCheckQuestion,
  getConfirmedPreferenceTags,
  loadPreferences,
  savePreferences,
} from '../utils/preferencesStore';

export type { MemoryCategory };
export type MemoryItem = PreferenceItem;


// ============================================================================
// 1. DATA MODELS & UNIFIED ACTIVITY DATASET
// ============================================================================

type RhythmTimeframe = '7d' | 'month';
type SecondaryModuleType =
  | 'journey'
  | 'weekly_review'
  | 'goal'
  | 'history'
  | 'preferences'
  | 'health'
  | null;

// --- A. Unified Activity Record Model ---
// Supports Active (with distinct sessionsCount & durationMinutes), Mindful Rest, or No Record
type DayRecordType = 'active' | 'rest' | 'none';

interface DayActivityRecord {
  date: string; // 'YYYY-MM-DD'
  type: DayRecordType;
  title?: string;
  durationMinutes?: number;
  sessionsCount?: number; // Number of completed activities/sessions on this active day (>= 1)
  hasRest?: boolean; // Independent intentional rest marker on this date
  note?: string;
  isSample?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getDeviceTodayState() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return {
    year: y,
    month: m,
    day: d,
    dateStr: formatDateKey(y, m, d)
  };
}

// Demo historical data is seeded once inside weeklyPlanStore.loadUnifiedActivityStore().

// --- B. Dynamic Rhythm Computation Types ---
interface MonthlyTrendPoint {
  key: string;
  month: string;
  activeDays: number;
  completedSessions: number;
  totalMinutes: number;
}

interface DailyBarItem {
  label: string;
  minutes: number;
  sessions: number;
  status: 'done' | 'rest' | 'light' | 'none';
}

interface RecentSummaryData {
  rangeLabel: string;
  activeDaysCount: number;
  completedCount: number; // Total completed sessions/activities
  activeMinutes: number;
  restDaysCount: number;
  novaObservation: string;
  dailyBreakdown: DailyBarItem[];
}

// --- C. Your Focus Dataset & Persistence ---
interface DirectionState {
  status: 'active' | 'paused';
  goalId: string;
  goalTitle: string;
  phase: string;
  description: string;
  executionApproach: string;
  tailoredReason: string;
  nextReviewDate: string;
  reviewDaysLeft: number;
  source?: 'user' | 'demo';
  isSample?: boolean;
}

function createDefaultDemoFocus(referenceDate: Date = new Date()): DirectionState {
  return {
    status: 'active',
    goalId: 'energy',
    goalTitle: 'Feel more energetic',
    phase: 'Start small',
    description: 'Short walks and gentle stretches.',
    executionApproach: 'Short walks and gentle stretches.',
    tailoredReason: '',
    nextReviewDate: formatReviewOnSundayLabel(referenceDate),
    reviewDaysLeft: 0,
    source: 'demo',
    isSample: true,
  };
}

function formatFocusHeadline(goalTitle: string): string {
  const trimmed = goalTitle.trim();
  if (!trimmed) return 'A gentle focus.';
  if (trimmed.toLowerCase() === 'feel more energetic') {
    return 'A little more energy.';
  }
  return trimmed;
}

function formatFocusApproach(executionApproach: string): string {
  return executionApproach.trim();
}

const FOCUS_SHORT_MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function formatFocusReviewLabel(rawReviewDate: string, referenceToday: Date): string {
  const trimmed = rawReviewDate.trim();
  const sourceText = trimmed || formatReviewOnSundayLabel(referenceToday);

  const todayMidnight = new Date(
    referenceToday.getFullYear(),
    referenceToday.getMonth(),
    referenceToday.getDate()
  );

  let parsedDate: Date | null = null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sourceText);
  if (isoMatch) {
    const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!Number.isNaN(dt.getTime())) parsedDate = dt;
  } else {
    const shortMatch = /^(?:Review(?:\s+on)?\s+)?([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?$/i.exec(
      sourceText
    );
    if (shortMatch) {
      const monthIdx = FOCUS_SHORT_MONTH_INDEX[shortMatch[1].toLowerCase()];
      const dayNum = Number(shortMatch[2]);
      if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
        if (shortMatch[3]) {
          const dt = new Date(Number(shortMatch[3]), monthIdx, dayNum);
          if (dt.getMonth() === monthIdx && dt.getDate() === dayNum) parsedDate = dt;
        } else {
          // Pick closest calendar year occurrence around referenceToday (handles Dec/Jan rollover cleanly)
          const baseYear = todayMidnight.getFullYear();
          let best: Date | null = null;
          let bestDiff = Infinity;
          for (const yr of [baseYear - 1, baseYear, baseYear + 1]) {
            const candidate = new Date(yr, monthIdx, dayNum);
            if (candidate.getMonth() !== monthIdx || candidate.getDate() !== dayNum) continue;
            const diff = Math.abs(candidate.getTime() - todayMidnight.getTime());
            if (diff < bestDiff) {
              bestDiff = diff;
              best = candidate;
            }
          }
          parsedDate = best;
        }
      }
    }
  }

  if (parsedDate) {
    if (parsedDate.getTime() < todayMidnight.getTime()) {
      return 'Review due';
    }
    return `Review ${formatShortMonthDay(parsedDate)}`;
  }

  return sourceText.replace(/^Review\s+on\s+/i, 'Review ');
}

function normalizeFocusRecord(
  raw: unknown,
  referenceDate: Date = new Date()
): DirectionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const focusRaw =
    typeof obj.focus === 'string'
      ? obj.focus
      : typeof obj.goalTitle === 'string'
      ? obj.goalTitle
      : '';
  const goalTitle = focusRaw.trim();
  if (!goalTitle) return null;

  const phaseRaw = typeof obj.phase === 'string' ? obj.phase.trim() : '';
  const phase = phaseRaw || 'Start small';

  const approachRaw =
    typeof obj.approach === 'string'
      ? obj.approach
      : typeof obj.executionApproach === 'string'
      ? obj.executionApproach
      : typeof obj.description === 'string'
      ? obj.description
      : '';
  const executionApproach = approachRaw.trim();

  const reviewRaw =
    typeof obj.reviewDate === 'string'
      ? obj.reviewDate
      : typeof obj.nextReviewDate === 'string'
      ? obj.nextReviewDate
      : '';
  const nextReviewDate = reviewRaw.trim() || formatReviewOnSundayLabel(referenceDate);
  const source: 'user' | 'demo' =
    obj.source === 'demo' || (obj.source !== 'user' && obj.isSample === true) ? 'demo' : 'user';

  return {
    status: obj.status === 'paused' ? 'paused' : 'active',
    goalId: typeof obj.goalId === 'string' && obj.goalId ? obj.goalId : 'custom',
    goalTitle,
    phase,
    description: executionApproach,
    executionApproach,
    tailoredReason: typeof obj.tailoredReason === 'string' ? obj.tailoredReason : '',
    nextReviewDate,
    reviewDaysLeft: typeof obj.reviewDaysLeft === 'number' ? obj.reviewDaysLeft : 0,
    source,
    isSample: source === 'demo',
  };
}

function persistFocusToStorage(next: DirectionState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const source: 'user' | 'demo' = next.source === 'demo' ? 'demo' : 'user';
    const payload = {
      focus: next.goalTitle,
      phase: next.phase,
      approach: next.executionApproach,
      reviewDate: next.nextReviewDate,
      status: next.status,
      goalId: next.goalId,
      source,
      isSample: source === 'demo',
    };
    window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private mode errors
  }
}

function loadInitialFocus(referenceDate: Date = new Date()): DirectionState {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedRaw = window.localStorage.getItem(FOCUS_STORAGE_KEY);
      if (savedRaw) {
        const parsed = normalizeFocusRecord(JSON.parse(savedRaw), referenceDate);
        if (parsed) return parsed;
      }

      for (const legacyKey of LEGACY_DIRECTION_STORAGE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const migrated = normalizeFocusRecord(JSON.parse(legacyRaw), referenceDate);
        if (migrated) {
          if (migrated.source !== 'demo') {
            persistFocusToStorage(migrated);
          }
          return migrated;
        }
      }
    } catch {
      // Ignore malformed JSON in localStorage
    }
  }

  return createDefaultDemoFocus(referenceDate);
}

// --- D. Preferences (Migrated from What Nova Knows via preferencesStore.ts) ---

interface MemoryChatProposal {
  mode: 'update' | 'add';
  targetMemoryId?: string;
  newTitle: string;
  newSummary: string;
  newCategory: MemoryCategory;
}

interface MemoryChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  proposal?: MemoryChatProposal;
  proposalAccepted?: boolean;
}

// --- E. Health Data Metrics (Unconnected empty definitions — never fabricated) ---
interface HealthMetricDefinition {
  id: string;
  name: string;
  unit: string;
  icon: React.ElementType;
}

const HEALTH_METRICS_DEFINITIONS: HealthMetricDefinition[] = [
  {
    id: 'rhr',
    name: 'Resting heart rate',
    unit: 'bpm',
    icon: Heart,
  },
  {
    id: 'sleep',
    name: 'Sleep duration',
    unit: 'hours',
    icon: Moon,
  },
  {
    id: 'energy',
    name: 'Active energy',
    unit: 'kcal',
    icon: Flame,
  },
  {
    id: 'steps',
    name: 'Daily steps',
    unit: 'steps',
    icon: Footprints,
  },
];

// ============================================================================
// 2. VISUAL CHART SUB-COMPONENTS (DRIVEN BY UNIFIED ACTIVITY LOGS)
// ============================================================================

function MonthlyTrendCurve({
  series,
  compact = false
}: {
  series: MonthlyTrendPoint[];
  compact?: boolean;
}) {
  const maxVal = Math.max(18, ...series.map((s) => s.activeDays), 1) + 2;
  const minVal = 0;
  const width = 280;
  const height = compact ? 68 : 96;
  const padX = 18;
  const padY = compact ? 14 : 18;

  const points = series.map((item, idx) => {
    const x = padX + (idx / Math.max(1, series.length - 1)) * (width - padX * 2);
    const y =
      height -
      padY -
      ((item.activeDays - minVal) / Math.max(1, maxVal - minVal)) * (height - padY * 2);
    return { x, y, ...item };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible select-none"
        aria-label="Monthly active days trend curve"
      >
        <defs>
          <linearGradient id="rhythmTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5E5BAE" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#5E5BAE" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <line
          x1={padX}
          y1={height / 2}
          x2={width - padX}
          y2={height / 2}
          stroke="#26263F"
          strokeOpacity="0.06"
          strokeDasharray="3 3"
        />

        <path d={areaPath} fill="url(#rhythmTrendFill)" />

        <path
          d={linePath}
          fill="none"
          stroke="#5E5BAE"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((pt, idx) => {
          const isLatest = idx === points.length - 1;
          return (
            <g key={pt.key}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isLatest ? 4.5 : 3}
                className={
                  isLatest
                    ? 'fill-[#5E5BAE] stroke-white stroke-2'
                    : 'fill-[#8E8CD6] stroke-white stroke-[1.5]'
                }
              />
              {(!compact || isLatest || idx === 0 || idx === 2 || idx === 4) && (
                <text
                  x={pt.x}
                  y={pt.y - 8}
                  textAnchor="middle"
                  className={`text-[11px] font-semibold ${
                    isLatest ? 'fill-[#5E5BAE]' : 'fill-[#6E6E78]'
                  }`}
                >
                  {pt.activeDays}d
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between px-1.5 mt-1.5 text-[12px] font-medium text-[#6E6E78]">
        {series.map((item, idx) => (
          <span
            key={item.key}
            className={idx === series.length - 1 ? 'text-[#5E5BAE] font-semibold' : ''}
          >
            {item.month}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActiveMinutesBarChart({
  items,
  timeframe
}: {
  items: DailyBarItem[];
  timeframe: RhythmTimeframe;
}) {
  const maxVal = Math.max(timeframe === '7d' ? 20 : 60, ...items.map((i) => i.minutes), 1);

  return (
    <div className="pt-2">
      <div className="flex items-end justify-between gap-2 h-24 px-1 pt-4 border-b border-[#26263F]/[0.06]">
        {items.map((bar, idx) => {
          const heightPct =
            bar.minutes === 0
              ? bar.status === 'rest'
                ? 14
                : 6
              : Math.max(22, Math.round((bar.minutes / maxVal) * 100));
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end min-w-0">
              <span className="text-[11px] font-medium text-[#6E6E78] truncate">
                {bar.minutes > 0 ? `${bar.minutes}m` : bar.status === 'rest' ? 'Rest' : '–'}
              </span>
              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full max-w-[24px] rounded-t-[8px] transition-all duration-300 ${
                  bar.status === 'done'
                    ? 'bg-[#5E5BAE]'
                    : bar.status === 'light'
                    ? 'bg-[#8E8CD6]'
                    : bar.status === 'rest'
                    ? 'bg-[#E59980]/70'
                    : 'bg-[#26263F]/10'
                }`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 px-1 mt-1.5">
        {items.map((bar, idx) => (
          <span key={idx} className="flex-1 text-center text-[12px] font-medium text-[#6E6E78] truncate">
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 3. MAIN COMPONENT: PLAN VIEW (MERGED MY PLAN + MEMORY)
// ============================================================================

interface MyPlanViewProps {
  phoneFrameRef?: React.RefObject<HTMLDivElement | null>;
  isActive?: boolean;
  planStore?: PlanFoundationStore;
  onUpdatePlanStore?: (updater: (prev: PlanFoundationStore) => PlanFoundationStore) => void;
  activityRecords?: ActivityCompletionRecord[];
  restRecords?: RestRecord[];
  onAddManualActivity?: (input: ManualActivityInput) => void;
  onUpdateActivity?: (recordId: string, patch: ActivityUpdatePatch) => void;
  onDeleteActivity?: (recordId: string) => void;
  onUpsertRestDay?: (dateKey: string, note?: string) => void;
  onDeleteRestRecord?: (restId: string) => void;
  onClearDayRecords?: (dateKey: string) => void;
  onNavigateToToday?: () => void;
}

const PlanNovaGuideAvatar = React.memo(function PlanNovaGuideAvatar({
  isActive,
  isShortViewport = false,
}: {
  isActive: boolean;
  isShortViewport?: boolean;
}) {
  const [shouldMount3D, setShouldMount3D] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Defer 3D initialization until after Plan becomes active and paints its first frame
  // so header copy and planning content render immediately without waiting for WebGL.
  useEffect(() => {
    if (!isActive || shouldMount3D) return;
    let cancelled = false;
    let rafId2: number | null = null;
    const rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        if (!cancelled) {
          setShouldMount3D(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId1);
      if (rafId2 !== null) cancelAnimationFrame(rafId2);
    };
  }, [isActive, shouldMount3D]);

  const handleReady = useCallback(() => {
    setIsReady(true);
  }, []);

  return (
    <div
      id="plan-nova-avatar-slot"
      className={`genki-plan-nova-avatar-slot${isShortViewport ? ' is-short-viewport' : ''}`}
      aria-hidden="true"
    >
      {!isReady && (
        <div
          className="absolute inset-2 rounded-full bg-radial from-[#E6E8DE]/75 via-[#F2F1F7]/45 to-transparent blur-sm pointer-events-none"
        />
      )}
      {shouldMount3D && (
        <div
          className={`w-full h-full transition-opacity duration-200 ${
            isReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <NovaAvatar3D
            variant="compact"
            isActiveTab={isActive}
            onReady={handleReady}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
});


/* Plan-only visual primitives. Unlayered selectors intentionally outrank Tailwind preflight. */
const GENKI_PLAN_UI_STYLES = `
.genki-plan-screen {font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;}
.genki-plan-commitment-header {display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;background:transparent;padding:0;margin:0 0 24px 0;}
.genki-plan-nova-avatar-slot {width:96px;height:96px;min-width:96px;min-height:96px;flex:0 0 96px;position:relative;display:flex;align-items:center;justify-content:center;overflow:visible;}
.genki-plan-nova-avatar-slot.is-short-viewport {width:80px;height:80px;min-width:80px;min-height:80px;flex:0 0 80px;}
@media (max-height: 699px) {.genki-plan-nova-avatar-slot {width:80px;height:80px;min-width:80px;min-height:80px;flex:0 0 80px;}}
.genki-plan-header-nova-line {margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:15px;font-weight:500;line-height:22px;color:#706A7C;max-width:min(320px,100%);overflow-wrap:break-word;white-space:normal;}
.genki-plan-header-intent {margin:16px 0 0 0;font-family:var(--font-genki-handwriting);font-size:26px;font-weight:600;line-height:34px;color:#514879;max-width:min(320px,100%);width:100%;overflow-wrap:break-word;white-space:normal;}
.genki-plan-header-strategy {margin:8px 0 0 0;font-family:var(--font-genki-handwriting);font-size:18px;font-weight:500;line-height:26px;color:#625A76;max-width:min(320px,100%);width:100%;overflow-wrap:break-word;white-space:normal;}
.genki-plan-header-detail-btn {margin:12px 0 0 0;min-height:44px;min-width:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;font-size:14px;font-weight:500;line-height:20px;color:#5E5BAE;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;transition:color 150ms ease,opacity 150ms ease;}
.genki-plan-header-detail-btn:hover {color:#4B4895;}
.genki-plan-header-detail-btn:active {opacity:.72;}
.genki-plan-heading {font-size:18px;font-weight:600;line-height:25px;letter-spacing:-.015em;color:#302D3D;}
.genki-plan-section-header {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;column-gap:12px;row-gap:4px;}
.genki-plan-section-title {font-size:18px;font-weight:600;line-height:25px;letter-spacing:-0.015em;color:#302D3D;min-width:0;overflow-wrap:break-word;}
.genki-plan-section-date {font-size:12px;font-weight:400;line-height:17px;color:#706A7C;flex-shrink:0;margin-left:auto;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
.genki-plan-section-subtitle {font-size:14px;font-weight:400;line-height:21px;color:#706A7C;}
.genki-plan-focus-goal {font-size:20px;font-weight:600;line-height:27px;letter-spacing:-0.018em;color:#302D3D;text-wrap:balance;}
.genki-plan-body {font-size:15px;font-weight:400;line-height:22px;color:#706A7C;}
.genki-plan-meta {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;}
.genki-plan-row-title {font-size:15px;font-weight:600;line-height:22px;color:#302D3D;}
.genki-plan-activity-count {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;text-align:right;font-variant-numeric:tabular-nums;}
.genki-plan-metric-row {display:inline-flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums;}
.genki-plan-metric-value {font-size:36px;font-weight:600;line-height:40px;letter-spacing:-0.025em;color:#302D3D;font-variant-numeric:tabular-nums;}
.genki-plan-metric-denom {font-size:20px;font-weight:500;line-height:24px;color:#8B8498;font-variant-numeric:tabular-nums;}
.genki-plan-metric-caption {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;}
.genki-plan-week-track {display:grid;grid-template-columns:repeat(7,minmax(0,1fr));height:60px;align-items:center;}
.genki-plan-week-day {display:flex;flex-direction:column;align-items:center;justify-content:center;height:60px;min-width:0;}
.genki-plan-week-day-letter {font-size:11px;font-weight:500;line-height:16px;color:#8B8498;}
.genki-plan-week-day-num {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;font-variant-numeric:tabular-nums;margin-top:2px;}
.genki-plan-week-day-num-today {font-weight:600;color:#514879;}
.genki-plan-week-day-indicator {height:6px;margin-top:6px;display:flex;align-items:center;justify-content:center;}
.genki-plan-week-dot {width:6px;height:6px;border-radius:999px;display:block;box-sizing:border-box;}
.genki-plan-week-dot-completed {background:#7770B6;}
.genki-plan-week-dot-past {background:transparent;border:1px solid #C8C2D4;}
.genki-plan-week-dot-future {background:#E7E3ED;}
.genki-plan-week-dash-rest {width:8px;height:2px;border-radius:999px;background:#B0A9BE;display:block;}
.genki-plan-week-unknown-mark {font-size:10px;font-weight:600;line-height:10px;color:#9A93A8;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;justify-content:center;}
.genki-plan-rhythm-habit-name {margin:6px 0 0 0;font-size:13px;font-weight:400;line-height:18px;color:#706A7C;min-width:0;overflow-wrap:break-word;}
.genki-plan-rhythm-status {margin:12px 0 0 0;font-size:20px;font-weight:600;line-height:27px;letter-spacing:-0.015em;color:#302D3D;min-width:0;overflow-wrap:break-word;}
.genki-plan-rhythm-summary {margin:12px 0 0 0;font-size:15px;font-weight:500;line-height:22px;color:#302D3D;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:break-word;}
.genki-plan-rhythm-basis {margin:6px 0 0 0;font-size:13px;font-weight:400;line-height:19px;color:#706A7C;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-width:0;}
.genki-plan-rhythm-journey-btn {margin:6px 0 0 0;min-height:44px;min-width:44px;padding:0;border:0;border-radius:8px;background:transparent;color:#5E5BAE;font-size:15px;font-weight:600;line-height:20px;display:inline-flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;touch-action:manipulation;align-self:flex-start;transition:color 140ms ease,opacity 140ms ease;}
.genki-plan-rhythm-journey-btn:hover {color:#4B4895;}
.genki-plan-rhythm-journey-btn:active {opacity:.72;}
.genki-plan-rhythm-switch-btn {min-height:44px;min-width:44px;padding:0 4px;margin:-10px -4px -10px 0;border:0;border-radius:8px;background:transparent;color:#5E5BAE;font-size:13px;font-weight:500;line-height:18px;display:inline-flex;align-items:center;justify-content:flex-end;cursor:pointer;touch-action:manipulation;white-space:nowrap;flex-shrink:0;transition:color 140ms ease,opacity 140ms ease;}
.genki-plan-rhythm-switch-btn:hover {color:#4B4895;}
.genki-plan-rhythm-switch-btn:active {opacity:.72;}
.genki-plan-rhythm-retry-btn {min-height:44px;min-width:88px;padding:0 16px;border:0;border-radius:12px;background:#EEEDF6;color:#514C8C;font-size:14px;font-weight:600;line-height:20px;display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;cursor:pointer;touch-action:manipulation;transition:background-color 140ms ease,opacity 140ms ease;}
.genki-plan-rhythm-retry-btn:hover {background:#E4E2F1;}
.genki-plan-rhythm-retry-btn:active {opacity:.75;}
.genki-plan-week-nav-row {margin-top:8px;display:flex;align-items:center;justify-content:space-between;gap:4px;}
.genki-plan-week-nav-btn {width:44px;height:44px;min-width:44px;min-height:44px;padding:0;flex-shrink:0;border:0;border-radius:999px;background:transparent;color:#514879;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;transition:background-color 140ms ease,opacity 140ms ease;}
.genki-plan-week-nav-btn:not(:disabled):hover {background:rgba(119,112,182,0.08);}
.genki-plan-week-nav-btn:not(:disabled):active {background:rgba(119,112,182,0.14);}
.genki-plan-week-nav-btn:disabled {opacity:0.28;cursor:not-allowed;}
.genki-plan-week-nav-date {flex:1;min-width:0;text-align:center;font-size:13px;font-weight:500;line-height:18px;color:#625A76;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.genki-plan-week-back-btn {min-height:44px;min-width:44px;padding:0 4px;border:0;border-radius:8px;background:transparent;color:#5E5BAE;font-size:13px;font-weight:500;line-height:18px;display:inline-flex;align-items:center;justify-content:flex-end;cursor:pointer;touch-action:manipulation;white-space:nowrap;flex-shrink:0;transition:color 140ms ease,opacity 140ms ease;}
.genki-plan-week-back-btn:hover {color:#4B4895;}
.genki-plan-week-back-btn:active {opacity:.72;}
@keyframes genkiWeekContentFade {from{opacity:0.74;}to{opacity:1;}}
.genki-plan-week-content-fade {animation:genkiWeekContentFade 140ms ease-out;}
.genki-plan-workout-row {width:100%;min-height:44px;padding:10px 0;background:transparent;border:0;border-radius:0;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;cursor:pointer;touch-action:manipulation;transition:opacity 140ms ease;}
.genki-plan-workout-row:active {opacity:.72;}
.genki-plan-workout-row + .genki-plan-workout-row {border-top:1px solid rgba(74,66,98,0.06);}
.genki-plan-workout-name {font-size:15px;font-weight:500;line-height:22px;color:#302D3D;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.genki-plan-workout-stat {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;flex-shrink:0;}
.genki-plan-view-all-btn {width:100%;min-height:44px;padding:0;border:0;border-top:1px solid rgba(74,66,98,0.06);border-radius:0;background:transparent;color:#5E5BAE;font-size:14px;font-weight:500;line-height:20px;display:flex;align-items:center;justify-content:flex-start;cursor:pointer;touch-action:manipulation;transition:color 140ms ease,opacity 140ms ease;}
.genki-plan-view-all-btn:hover {color:#4B4895;}
.genki-plan-view-all-btn:active {opacity:.72;}
.genki-plan-progress-track {width:100%;height:4px;border-radius:2px;background:#ECE8F2;overflow:hidden;}
.genki-plan-progress-fill {height:100%;border-radius:2px;background:#8B82BD;transition:width 220ms ease;}
.genki-plan-phase-title {font-size:15px;font-weight:600;line-height:22px;}
.genki-plan-phase-current {font-size:12px;font-weight:500;line-height:17px;color:#7770B6;flex-shrink:0;}
.genki-plan-phase-desc {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.genki-plan-review-fact {font-size:15px;font-weight:400;line-height:22px;color:#524C63;overflow-wrap:break-word;}
.genki-plan-review-summary {font-size:13px;font-weight:400;line-height:18px;color:#706A7C;}
.genki-plan-feedback-question {font-size:16px;font-weight:600;line-height:22px;color:#302D3D;}
.genki-plan-sheet-heading {font-size:22px;font-weight:600;line-height:28px;letter-spacing:-.02em;color:#1C1C1E;}
.genki-plan-subheading {font-size:17px;font-weight:600;line-height:23px;color:#1C1C1E;}
.genki-plan-unified-container {width:100%;padding:20px;border-radius:28px;background:rgba(255,255,255,0.76);border:1px solid rgba(255,255,255,0.70);box-shadow:0 4px 20px rgba(74,66,98,0.04);display:flex;flex-direction:column;gap:0;}
.genki-plan-section-divider {width:100%;height:1px;background:rgba(74,66,98,0.08);margin:24px 0;flex-shrink:0;}
.genki-plan-auxiliary-list {width:100%;padding:4px 16px;border-radius:22px;background:rgba(255,255,255,0.56);border:1px solid rgba(255,255,255,0.64);display:flex;flex-direction:column;}
.genki-plan-label {font-size:15px;font-weight:500;line-height:22px;color:#1C1C1E;}
.genki-plan-field {font-size:16px;line-height:22px;min-height:48px;border-radius:12px;}
.genki-plan-control {min-height:44px;min-width:44px;font-size:15px;font-weight:500;line-height:20px;touch-action:manipulation;cursor:pointer;transition:background-color 150ms ease,color 150ms ease,opacity 150ms ease;}
.genki-plan-screen button:focus-visible,.genki-plan-control:focus-visible,.genki-plan-field:focus-visible,.genki-plan-text-action:focus-visible,.genki-plan-header-detail-btn:focus-visible,.genki-plan-rhythm-journey-btn:focus-visible,.genki-plan-rhythm-switch-btn:focus-visible,.genki-plan-rhythm-retry-btn:focus-visible,.genki-plan-week-row:focus-visible,.genki-plan-workout-row:focus-visible,.genki-plan-week-nav-btn:focus-visible,.genki-plan-week-back-btn:focus-visible,.genki-plan-view-all-btn:focus-visible,.genki-plan-phase-row:focus-visible {outline:2px solid #7770B6;outline-offset:2px;}
.genki-plan-control:disabled {opacity:.45;cursor:not-allowed;}
.genki-plan-control:not(:disabled):active {opacity:.75;}
.genki-plan-text-action {min-height:44px;min-width:44px;padding:0;border:0;border-radius:8px;background:transparent;color:#5E5BAE;font-size:15px;font-weight:600;line-height:20px;display:inline-flex;align-items:center;justify-content:flex-end;cursor:pointer;touch-action:manipulation;transition:color 140ms ease,opacity 140ms ease;}
.genki-plan-text-action:hover {color:#4B4895;}
.genki-plan-text-action:active {opacity:.72;}
.genki-plan-week-row {width:100%;min-height:46px;padding:12px 0;background:transparent;border:0;border-radius:0;display:flex;flex-direction:column;justify-content:center;text-align:left;cursor:pointer;touch-action:manipulation;transition:opacity 150ms ease;}
.genki-plan-week-row:active {opacity:.72;}
.genki-plan-week-row-static {cursor:default;}
.genki-plan-week-row-static:active {opacity:1;}
.genki-plan-week-row + .genki-plan-week-row {border-top:1px solid rgba(74,66,98,0.06);}
.genki-plan-phase-row {width:100%;min-height:0;padding:0;border:0;border-radius:8px;background:transparent;display:flex;align-items:stretch;gap:10px;text-align:left;cursor:pointer;touch-action:manipulation;transition:opacity 150ms ease;}
.genki-plan-phase-row:active {opacity:.72;}
.genki-plan-control-primary,.genki-plan-control-destructive {min-height:48px;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:600;line-height:20px;display:inline-flex;align-items:center;justify-content:center;box-shadow:none;color:white;background:#5E5BAE;}
.genki-plan-control-primary:not(:disabled):hover {background:#504D9D;}
.genki-plan-control-destructive {background:#D92D4B;}
.genki-plan-control-secondary {min-height:44px;min-width:96px;margin-right:0;padding:10px 16px;border-radius:12px;font-size:15px;font-weight:600;line-height:20px;color:#514C8C;background:#EEEDF6;display:inline-flex;align-items:center;justify-content:center;box-shadow:none;}
.genki-plan-control-secondary:not(:disabled):hover {background:#E4E2F1;}
.genki-plan-control-icon {width:44px;height:44px;min-width:44px;min-height:44px;padding:0;flex-shrink:0;border-radius:999px;background:#F2F2F7;display:inline-flex;align-items:center;justify-content:center;}
.genki-plan-control-icon svg {width:20px;height:20px;}
.genki-plan-feedback-grid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;}
@media (max-width: 359px) {.genki-plan-feedback-grid {grid-template-columns:1fr;}}
.genki-plan-control-feedback {width:100%;min-width:0;min-height:56px;padding:10px 8px;border-radius:12px;border:1px solid transparent;background:#F1EFF6;color:#615B73;font-size:14px;font-weight:500;line-height:18px;display:flex;align-items:center;justify-content:center;text-align:center;white-space:normal;overflow-wrap:break-word;}
.genki-plan-control-feedback:hover {background:#EAE6F4;}
.genki-plan-control-feedback[aria-pressed="true"] {border-color:#BEB4DE;background:#E5E0F3;color:#514879;}
.genki-plan-screen [aria-label="Additional plan sections"] > button {min-height:56px;}
.genki-plan-screen [id$="progress"] {font-variant-numeric:tabular-nums;}
@media(prefers-reduced-motion:reduce) {.genki-plan-control,.genki-plan-text-action,.genki-plan-header-detail-btn,.genki-plan-rhythm-journey-btn,.genki-plan-rhythm-switch-btn,.genki-plan-rhythm-retry-btn,.genki-plan-week-row,.genki-plan-workout-row,.genki-plan-week-nav-btn,.genki-plan-week-back-btn,.genki-plan-view-all-btn,.genki-plan-phase-row,.genki-plan-control-feedback,.genki-plan-progress-fill {transition:none;} .genki-plan-week-content-fade {animation:none;}}
`;

export function MyPlanView({
  phoneFrameRef,
  isActive = true,
  planStore,
  onUpdatePlanStore,
  activityRecords = [],
  restRecords = [],
  onAddManualActivity,
  onUpdateActivity,
  onDeleteActivity,
  onUpsertRestDay,
  onDeleteRestRecord,
  onClearDayRecords,
  onNavigateToToday,
}: MyPlanViewProps) {
  // Real device date state with automatic local midnight & background-resume sync
  const [deviceToday, setDeviceToday] = useState(getDeviceTodayState);

  // 1. Activity Monthly State & Unified Activity Logs
  const [viewYear, setViewYear] = useState<number>(deviceToday.year);
  const [viewMonth, setViewMonth] = useState<number>(deviceToday.month);
  const [pickerYear, setPickerYear] = useState<number>(deviceToday.year);
  const [slideDirection, setSlideDirection] = useState<number>(0);

  // Track whether user is currently viewing the live current month so cross-month rollovers auto-advance
  const isViewingCurrentMonthRef = useRef<boolean>(true);
  useEffect(() => {
    isViewingCurrentMonthRef.current =
      viewYear === deviceToday.year && viewMonth === deviceToday.month;
  }, [viewYear, viewMonth, deviceToday.year, deviceToday.month]);

  // Sync deviceToday at local midnight and when returning from background (visibilitychange / focus)
  useEffect(() => {
    const syncDateWithSystem = () => {
      const next = getDeviceTodayState();
      setDeviceToday((prev) => {
        if (prev.dateStr === next.dateStr) return prev;
        // If user was viewing the previous current month and month rolled over, auto-switch to new current month
        if (
          isViewingCurrentMonthRef.current &&
          (prev.year !== next.year || prev.month !== next.month)
        ) {
          setViewYear(next.year);
          setViewMonth(next.month);
          setPickerYear(next.year);
        }
        return next;
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncDateWithSystem();
      }
    };

    window.addEventListener('focus', syncDateWithSystem);
    document.addEventListener('visibilitychange', handleVisibility);

    // Schedule timer for next local midnight
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
    const midnightTimer = window.setTimeout(syncDateWithSystem, msUntilMidnight);

    return () => {
      window.removeEventListener('focus', syncDateWithSystem);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearTimeout(midnightTimer);
    };
  }, [deviceToday.dateStr]);

  // Month Picker Modal & Day Detail Modal States (reads & writes unified activityRecords + restRecords)
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [activeDayModalDate, setActiveDayModalDate] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [dayDraftType, setDayDraftType] = useState<DayRecordType>('active');
  const [dayDraftCategory, setDayDraftCategory] = useState<Exclude<ActivityCategory, 'rest'>>('walk');
  const [dayDraftTitle, setDayDraftTitle] = useState<string>('15-min mindful walk');
  const [dayDraftDuration, setDayDraftDuration] = useState<number>(15);
  const [dayDraftNote, setDayDraftNote] = useState<string>('');
  const [dayUpdateToast, setDayUpdateToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showPlanToast = (message: string) => {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setDayUpdateToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setDayUpdateToast(null);
      toastTimeoutRef.current = null;
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // 2. Your Rhythm Filter State
  const [rhythmFilter, setRhythmFilter] = useState<RhythmTimeframe>('7d');

  // 3. Secondary Sheet Navigation ('journey' | 'weekly_review' | 'goal' | 'history' | 'preferences' | 'health' | null)
  const [selectedModule, setSelectedModule] = useState<SecondaryModuleType>(null);
  const [goalSheetInitialMode, setGoalSheetInitialMode] = useState<GoalDetailSubMode>('overview');
  const [goalSheetActiveMode, setGoalSheetActiveMode] = useState<GoalDetailSubMode>('overview');
  const [historyReturnModule, setHistoryReturnModule] = useState<'plan' | 'journey' | 'weekly_review'>('plan');
  const planScrollRef = useRef<HTMLDivElement | null>(null);
  const savedPlanScrollTopRef = useRef<number>(0);

  const openSecondaryModule = useCallback(
    (
      mod: Exclude<SecondaryModuleType, null>,
      returnTarget: 'plan' | 'journey' | 'weekly_review' = 'plan'
    ) => {
      if (selectedModule === null && planScrollRef.current) {
        savedPlanScrollTopRef.current = planScrollRef.current.scrollTop;
      }
      if (mod === 'history') {
        setHistoryReturnModule(returnTarget);
      } else {
        setHistoryReturnModule('plan');
      }
      setSelectedModule(mod);
    },
    [selectedModule]
  );

  const closeSecondaryModuleToPlan = useCallback(() => {
    setHistoryReturnModule('plan');
    setSelectedModule(null);
    const targetTop = savedPlanScrollTopRef.current;
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (planScrollRef.current) {
          planScrollRef.current.scrollTop = targetTop;
        }
      });
    }
  }, []);

  const handleSecondarySheetBack = useCallback(() => {
    if (selectedModule === 'history' && historyReturnModule === 'journey') {
      setHistoryReturnModule('plan');
      setSelectedModule('journey');
      return;
    }
    if (selectedModule === 'history' && historyReturnModule === 'weekly_review') {
      setHistoryReturnModule('plan');
      setSelectedModule('weekly_review');
      return;
    }
    closeSecondaryModuleToPlan();
  }, [selectedModule, historyReturnModule, closeSecondaryModuleToPlan]);

  // 4. Methodology Info Popup State (Inside Your Rhythm Secondary Sheet)
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Official user storage is loaded cleanly via PlanFoundationStore (no demo auto-seeding).

  // 5. Your Focus & Up Next Shared Phase State
  const [direction, setDirection] = useState<DirectionState>(() =>
    loadInitialFocus(new Date(deviceToday.year, deviceToday.month, deviceToday.day))
  );
  const [planPath] = useState<PlanPathState>(() =>
    loadInitialPlanPath(direction.phase)
  );
  const [isFocusAdjustOpen, setIsFocusAdjustOpen] = useState<boolean>(false);
  const [focusDraftTitle, setFocusDraftTitle] = useState<string>(direction.goalTitle);
  const [focusDraftApproach, setFocusDraftApproach] = useState<string>(direction.executionApproach);
  const [focusDraftReview, setFocusDraftReview] = useState<string>(direction.nextReviewDate);
  const [focusKeyboardInset, setFocusKeyboardInset] = useState<number>(0);
  const [directionToast, setDirectionToast] = useState<boolean>(false);

  // 5a. Your Rhythm Confirmed Habit Selection & Confirmation Sheet State
  const [selectedRhythmHabitId, setSelectedRhythmHabitId] = useState<string | null>(null);
  const [rhythmRetryNonce, setRhythmRetryNonce] = useState<number>(0);
  const [isHabitConfirmOpen, setIsHabitConfirmOpen] = useState<boolean>(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [habitDraftLabel, setHabitDraftLabel] = useState<string>('');
  const [habitDraftRegular, setHabitDraftRegular] = useState<string>('');
  const [habitDraftMinimum, setHabitDraftMinimum] = useState<string>('');

  // 5b. Per-Week Schedules (Indexed by local Monday YYYY-MM-DD weekStartKey) & Sheet State
  const [weeklySchedulesByWeek, setWeeklySchedulesByWeek] = useState<WeeklySchedulesByWeek>(() =>
    loadWeeklySchedulesByWeek(new Date(deviceToday.year, deviceToday.month, deviceToday.day))
  );
  const [editingWeekTarget, setEditingWeekTarget] = useState<'this_week' | 'next_week' | null>(null);
  const isWeekAdjustOpen = editingWeekTarget !== null;
  const [weekDraft, setWeekDraft] = useState<WeeklySchedule>(() => DEFAULT_WEEKLY_DRAFT);
  const [selectedWeekStartKey, setSelectedWeekStartKey] = useState<string>(
    () => getLocalWeekBounds(new Date(deviceToday.year, deviceToday.month, deviceToday.day)).weekStartKey
  );
  const weekNavSeqRef = useRef<number>(0);
  const [weekActivitySheet, setWeekActivitySheet] = useState<{
    open: boolean;
    filterTypeKey: string | null;
    expandAllTypes: boolean;
  }>({ open: false, filterTypeKey: null, expandAllTypes: false });

  // 5c. Weekly Review Feedback & On-Demand Adjustment State (Strictly targets Next week)
  const [weeklyReviewFeedbacks, setWeeklyReviewFeedbacks] = useState<
    Record<string, WeeklyReviewFeedback>
  >(() =>
    planStore
      ? { ...loadWeeklyReviewFeedbacks(), ...projectLegacyWeeklyReviewFeedbacks(planStore) }
      : loadWeeklyReviewFeedbacks()
  );
  const [resolvedAdjustmentKeys, setResolvedAdjustmentKeys] = useState<string[]>(
    loadResolvedAdjustmentKeys
  );
  const [lastAppliedAdjustment, setLastAppliedAdjustment] = useState<{
    proposal: WeeklyAdjustmentProposal;
    targetWeekStartKey: string;
    targetActivity: 'walk' | 'stretch';
    targetField: 'durationLabel' | 'targetCount';
    previousValue: string | number;
    appliedValue: string | number;
  } | null>(null);

  // 6. Preferences (Migrated from What Nova Knows)
  const [memories, setMemories] = useState<PreferenceItem[]>(loadPreferences);
  const [selectedMemory, setSelectedMemory] = useState<PreferenceItem | null>(null);
  const [memoryToDelete, setMemoryToDelete] = useState<PreferenceItem | null>(null);
  const [isMemoryInfoModalOpen, setIsMemoryInfoModalOpen] = useState<boolean>(false);
  const [isPrefFormOpen, setIsPrefFormOpen] = useState<boolean>(false);
  const [prefFormEditingId, setPrefFormEditingId] = useState<string | null>(null);
  const [prefDraftTitle, setPrefDraftTitle] = useState<string>('');
  const [prefDraftTag, setPrefDraftTag] = useState<string>('');
  const [prefDraftSummary, setPrefDraftSummary] = useState<string>('');

  // Conversational Memory Sheet (Supports editing an existing preference OR adding a new one with confirmation)
  const [isMemoryChatOpen, setIsMemoryChatOpen] = useState<boolean>(false);
  const [editingMemory, setEditingMemory] = useState<PreferenceItem | null>(null);
  const [memoryChatMessages, setMemoryChatMessages] = useState<MemoryChatMessage[]>([]);
  const [memoryChatInput, setMemoryChatInput] = useState<string>('');
  const memoryChatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat containers to bottom
  useEffect(() => {
    if (isMemoryChatOpen) {
      memoryChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [memoryChatMessages, isMemoryChatOpen]);

  // VisualViewport keyboard avoidance for all bottom-sheet forms, Journey & Weekly review inputs
  useEffect(() => {
    if (
      (!isFocusAdjustOpen &&
        !isHabitConfirmOpen &&
        !isPrefFormOpen &&
        !isWeekAdjustOpen &&
        !isMemoryChatOpen &&
        !activeDayModalDate &&
        selectedModule !== 'journey' &&
        selectedModule !== 'weekly_review' &&
        selectedModule !== 'goal') ||
      typeof window === 'undefined'
    ) {
      setFocusKeyboardInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const updateInset = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      setFocusKeyboardInset(inset);
    };

    updateInset();
    vv.addEventListener('resize', updateInset);
    vv.addEventListener('scroll', updateInset);
    return () => {
      vv.removeEventListener('resize', updateInset);
      vv.removeEventListener('scroll', updateInset);
    };
  }, [
    isFocusAdjustOpen,
    isHabitConfirmOpen,
    isPrefFormOpen,
    isWeekAdjustOpen,
    isMemoryChatOpen,
    activeDayModalDate,
    selectedModule,
  ]);

  // Short-screen detection (< 700px height) for Nova Avatar box (80×80 vs 96×96)
  const [isShortViewport, setIsShortViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const frameH = phoneFrameRef?.current?.clientHeight;
    return (frameH && frameH > 0 ? frameH : window.innerHeight) < 700;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateShortViewport = () => {
      const frameH = phoneFrameRef?.current?.clientHeight;
      const effectiveH = frameH && frameH > 0 ? frameH : window.innerHeight;
      setIsShortViewport(effectiveH < 700);
    };
    updateShortViewport();
    window.addEventListener('resize', updateShortViewport);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && phoneFrameRef?.current) {
      ro = new ResizeObserver(updateShortViewport);
      ro.observe(phoneFrameRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateShortViewport);
      ro?.disconnect();
    };
  }, [phoneFrameRef]);

  // Shared phase derivations (single source of truth)
  const visiblePhases = useMemo(() => planPath.phases.slice(0, 3), [planPath.phases]);
  const currentPhaseIndex = useMemo(() => {
    const idx = visiblePhases.findIndex((p) => p.id === planPath.currentPhaseId);
    return idx >= 0 ? idx : 0;
  }, [visiblePhases, planPath.currentPhaseId]);
  const currentPhase = visiblePhases[currentPhaseIndex] ?? visiblePhases[0];

  // Phase Commitment Header state derived strictly from user-confirmed commitment (never demo defaults)
  const effectiveCommitment = useMemo(() => {
    if (planStore) {
      return planStore.commitment;
    }
    if (direction.source === 'user' && direction.goalTitle.trim().length > 0) {
      return {
        id: 'local-focus',
        version: 1,
        phaseId: currentPhase.id,
        phaseName: currentPhase.name,
        originalIntent: null,
        summary: direction.goalTitle.trim(),
        strategySummary: direction.executionApproach.trim() || null,
        strategies: [],
        status: direction.status,
        lastEventKind: 'started' as const,
        reviewRequested: false,
        createdAt: '',
        updatedAt: '',
        source: 'user' as const,
      };
    }
    return null;
  }, [planStore, direction, currentPhase.id, currentPhase.name]);

  const hasConfirmedCommitment = hasConfirmedPhaseCommitment(effectiveCommitment);
  const headerNovaLine = derivePlanHeaderNovaLine(effectiveCommitment);
  const headerActionLabel = derivePlanHeaderDetailActionLabel(effectiveCommitment);
  const headerIntentText = hasConfirmedCommitment ? effectiveCommitment.summary.trim() : '';
  const headerStrategyText = useMemo(() => {
    const raw = deriveCommitmentStrategyLine(effectiveCommitment);
    if (!raw) return '';
    if (raw.toLowerCase() === headerIntentText.toLowerCase()) return '';
    return raw;
  }, [effectiveCommitment, headerIntentText]);

  // ============================================================================
  // 4. UNIFIED DATA DERIVATIONS (ACTIVITY + TODAY SYNC + HISTORY)
  // ============================================================================

  // Single unified derivation for History calendar, month list, 6-month trend, and 7d/Month charts
  const effectiveActivityLogs = useMemo(() => {
    const merged: Record<string, DayActivityRecord> = {};

    const activitiesByDate: Record<string, ActivityCompletionRecord[]> = {};
    for (const rec of activityRecords) {
      if (rec.category === 'rest') continue;
      if (!activitiesByDate[rec.dateKey]) activitiesByDate[rec.dateKey] = [];
      activitiesByDate[rec.dateKey].push(rec);
    }

    const restByDate: Record<string, RestRecord> = {};
    for (const restRec of restRecords) {
      const existing = restByDate[restRec.dateKey];
      // Prefer real rest record over demo if both ever existed
      if (!existing || (existing.source === 'demo' && restRec.source !== 'demo')) {
        restByDate[restRec.dateKey] = restRec;
      }
    }

    for (const [dateKey, recs] of Object.entries(activitiesByDate)) {
      const totalMins = recs.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);
      const titles = recs.map((r) => r.title).filter(Boolean);
      const allDemo = recs.every((r) => r.source === 'demo' || r.isSample === true);
      const firstNote = recs.find((r) => r.note)?.note;
      merged[dateKey] = {
        date: dateKey,
        type: 'active',
        title:
          titles.length <= 2
            ? titles.join(' + ')
            : `${titles[0]} + ${titles.length - 1} more`,
        durationMinutes: totalMins,
        sessionsCount: recs.length,
        hasRest: Boolean(restByDate[dateKey]),
        note: firstNote,
        isSample: allDemo,
      };
    }

    for (const [dateKey, restRec] of Object.entries(restByDate)) {
      if (!merged[dateKey]) {
        merged[dateKey] = {
          date: dateKey,
          type: 'rest',
          title: restRec.title || 'Mindful rest day',
          durationMinutes: 0,
          sessionsCount: 0,
          hasRest: true,
          note: restRec.note,
          isSample: restRec.source === 'demo' || restRec.isSample === true,
        };
      }
    }

    return merged;
  }, [activityRecords, restRecords]);

  const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const isCurrentMonth = viewYear === deviceToday.year && viewMonth === deviceToday.month;

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const currentMonthRecords = useMemo(
    () => Object.values(effectiveActivityLogs).filter((r) => r.date.startsWith(monthPrefix)),
    [effectiveActivityLogs, monthPrefix]
  );

  // Distinguish Active Days vs Completed Activities / Sessions vs Independent Rest Days
  const activeDaysCount = useMemo(
    () => currentMonthRecords.filter((r) => r.type === 'active').length,
    [currentMonthRecords]
  );
  const completedSessionsInMonth = useMemo(
    () =>
      currentMonthRecords
        .filter((r) => r.type === 'active')
        .reduce((sum, r) => sum + (r.sessionsCount ?? 1), 0),
    [currentMonthRecords]
  );
  const restDaysCount = useMemo(
    () => currentMonthRecords.filter((r) => r.type === 'rest' || r.hasRest === true).length,
    [currentMonthRecords]
  );
  const totalMinutes = useMemo(
    () =>
      currentMonthRecords
        .filter((r) => r.type === 'active')
        .reduce((acc, cur) => acc + (cur.durationMinutes || 0), 0),
    [currentMonthRecords]
  );

  // Current & Next local week bounds (Monday start -> Sunday end) & per-week schedules
  const currentWeekBounds = useMemo(
    () => getLocalWeekBounds(new Date(deviceToday.year, deviceToday.month, deviceToday.day)),
    [deviceToday.year, deviceToday.month, deviceToday.day]
  );

  const nextWeekBounds = useMemo(
    () => getNextWeekBounds(new Date(deviceToday.year, deviceToday.month, deviceToday.day)),
    [deviceToday.year, deviceToday.month, deviceToday.day]
  );

  // This week reads ONLY this week's schedule; Next week reads ONLY next week's schedule
  const weeklySchedule = weeklySchedulesByWeek[currentWeekBounds.weekStartKey] ?? null;
  const nextWeekSchedule = weeklySchedulesByWeek[nextWeekBounds.weekStartKey] ?? null;

  // Shared deduplication helper backed by PlanFoundationStore Done tasks (strictly excluding manual/external exercise logs and rest)
  const getDeduplicatedWeekCompletions = useCallback(
    (weekStartKey: string, weekEndKey: string): ActivityCompletionRecord[] => {
      if (planStore) {
        const { completedTasks } = getWeekDoneTaskCount(planStore, weekStartKey);
        return completedTasks.map((tc) => {
          const primarySeg = tc.exerciseSegments[0];
          const primaryType = primarySeg?.exerciseType ?? 'other';
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
          return {
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
          };
        });
      }

      const valid = activityRecords
        .filter(
          (record) =>
            record.source === 'today' &&
            record.category !== 'rest' &&
            isDateKeyInWeek(record.dateKey, weekStartKey, weekEndKey)
        )
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

      const seenSourceKeys = new Set<string>();
      const seenIds = new Set<string>();
      const deduped: ActivityCompletionRecord[] = [];
      for (const record of valid) {
        if (record.sourceKey) {
          if (seenSourceKeys.has(record.sourceKey)) continue;
          seenSourceKeys.add(record.sourceKey);
        }
        if (seenIds.has(record.id)) continue;
        seenIds.add(record.id);
        deduped.push(record);
      }
      return deduped;
    },
    [planStore, activityRecords]
  );

  // Reference Date and PlanFoundationStore for the week browser ("This week" module)
  const referenceTodayDate = useMemo(
    () => new Date(deviceToday.year, deviceToday.month, deviceToday.day),
    [deviceToday.year, deviceToday.month, deviceToday.day]
  );

  const effectivePlanStore = useMemo(
    () => planStore ?? createEmptyPlanFoundationStore(),
    [planStore]
  );

  // Leaving the Plan tab and returning resets the week browser back to "This week".
  // Opening and closing the selected-week activity detail sheet preserves selectedWeekStartKey.
  const prevIsActiveForWeekRef = useRef<boolean>(isActive);
  useEffect(() => {
    const wasActive = prevIsActiveForWeekRef.current;
    prevIsActiveForWeekRef.current = isActive;
    if (!wasActive && isActive) {
      weekNavSeqRef.current += 1;
      setSelectedWeekStartKey(currentWeekBounds.weekStartKey);
      setWeekActivitySheet({ open: false, filterTypeKey: null, expandAllTypes: false });
    }
  }, [isActive, currentWeekBounds.weekStartKey]);

  // Follow live current week across local midnight rollover when user is already on This week
  const prevCurrentWeekKeyRef = useRef<string>(currentWeekBounds.weekStartKey);
  useEffect(() => {
    const prevKey = prevCurrentWeekKeyRef.current;
    prevCurrentWeekKeyRef.current = currentWeekBounds.weekStartKey;
    if (prevKey !== currentWeekBounds.weekStartKey) {
      setSelectedWeekStartKey((curr) =>
        curr === prevKey ? currentWeekBounds.weekStartKey : curr
      );
    }
  }, [currentWeekBounds.weekStartKey]);

  // Synchronously computed selected-week snapshot (single source of truth for count, 7-day track, workout types, and detail sheet)
  const selectedWeekSnapshot = useMemo(
    () => getPlanWeekSnapshot(effectivePlanStore, selectedWeekStartKey, referenceTodayDate),
    [effectivePlanStore, selectedWeekStartKey, referenceTodayDate]
  );

  // Synchronously computed Your rhythm model strictly scoped to a single user-confirmed habitId
  const confirmedHabits = useMemo(
    () => getConfirmedHabits(effectivePlanStore),
    [effectivePlanStore]
  );

  const activeRhythmHabit: ConfirmedActionStrategy | null = useMemo(() => {
    if (confirmedHabits.length === 0) return null;
    if (selectedRhythmHabitId) {
      const matched = confirmedHabits.find((h) => h.habitId === selectedRhythmHabitId);
      if (matched) return matched;
    }
    return confirmedHabits[0];
  }, [confirmedHabits, selectedRhythmHabitId]);

  const rhythmModel = useMemo(() => {
    if (!activeRhythmHabit) return null;
    void rhythmRetryNonce;
    return getHabitRhythmModel(effectivePlanStore, activeRhythmHabit.habitId, referenceTodayDate);
  }, [effectivePlanStore, activeRhythmHabit, referenceTodayDate, rhythmRetryNonce]);

  const handleOpenHabitConfirm = useCallback((existing?: ConfirmedActionStrategy | null) => {
    if (existing) {
      setEditingHabitId(existing.habitId);
      setHabitDraftLabel(existing.label);
      setHabitDraftRegular(existing.regularAction);
      setHabitDraftMinimum(existing.minimumAction ?? '');
    } else {
      setEditingHabitId(null);
      setHabitDraftLabel('');
      setHabitDraftRegular('');
      setHabitDraftMinimum('');
    }
    setIsHabitConfirmOpen(true);
  }, []);

  const handleCloseHabitConfirm = useCallback(() => {
    setIsHabitConfirmOpen(false);
    setEditingHabitId(null);
  }, []);

  const handleSaveHabitConfirm = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const label = habitDraftLabel.trim();
      const regular = habitDraftRegular.trim() || label;
      const minimum = habitDraftMinimum.trim();
      if (!label) return;

      if (onUpdatePlanStore) {
        let savedHabitId: string | null = null;
        onUpdatePlanStore((prev) => {
          const existingStrategy = editingHabitId
            ? getConfirmedHabits(prev).find((h) => h.habitId === editingHabitId)
            : undefined;
          const res = confirmHabitStrategy(prev, {
            habitId: editingHabitId ?? undefined,
            label,
            regularAction: regular,
            minimumAction: minimum || undefined,
            cueTiming: existingStrategy?.cueTiming,
            alternativeAction: existingStrategy?.alternativeAction,
            frequencyDescription: existingStrategy?.frequencyDescription,
            confirmTrackingStartDateKey: deviceToday.dateStr,
          });
          savedHabitId = res.strategy.habitId;
          return res.store;
        });
        if (savedHabitId) {
          setSelectedRhythmHabitId(savedHabitId);
        }
      }
      setIsHabitConfirmOpen(false);
      setEditingHabitId(null);
      showPlanToast(editingHabitId ? 'Habit updated' : 'Habit confirmed');
    },
    [
      habitDraftLabel,
      habitDraftRegular,
      habitDraftMinimum,
      editingHabitId,
      onUpdatePlanStore,
      deviceToday.dateStr,
    ]
  );

  const handleCycleRhythmHabit = useCallback(() => {
    if (confirmedHabits.length <= 1) return;
    const currentIdx = confirmedHabits.findIndex(
      (h) => h.habitId === activeRhythmHabit?.habitId
    );
    const nextIdx = (currentIdx + 1) % confirmedHabits.length;
    setSelectedRhythmHabitId(confirmedHabits[nextIdx].habitId);
  }, [confirmedHabits, activeRhythmHabit?.habitId]);

  const handleRetryRhythmQuery = useCallback(() => {
    if (onUpdatePlanStore) {
      const reloaded = loadPlanFoundationStore();
      onUpdatePlanStore(() => reloaded);
    }
    setRhythmRetryNonce((n) => n + 1);
  }, [onUpdatePlanStore]);

  const handleStepSelectedWeek = useCallback(
    (deltaWeeks: -1 | 1) => {
      if (deltaWeeks === -1 && !selectedWeekSnapshot.canGoPrevious) return;
      if (deltaWeeks === 1 && !selectedWeekSnapshot.canGoNext) return;
      const nextKey = shiftLocalWeekStartKey(selectedWeekSnapshot.weekStartKey, deltaWeeks);
      const seq = ++weekNavSeqRef.current;
      setSelectedWeekStartKey((curr) => {
        if (seq !== weekNavSeqRef.current) return curr;
        return nextKey;
      });
    },
    [
      selectedWeekSnapshot.canGoPrevious,
      selectedWeekSnapshot.canGoNext,
      selectedWeekSnapshot.weekStartKey,
    ]
  );

  const handleReturnToCurrentWeek = useCallback(() => {
    const seq = ++weekNavSeqRef.current;
    setSelectedWeekStartKey((curr) => {
      if (seq !== weekNavSeqRef.current) return curr;
      return currentWeekBounds.weekStartKey;
    });
  }, [currentWeekBounds.weekStartKey]);

  // Last completed calendar week (Monday start -> Sunday end) for Weekly review
  const lastCompletedWeekBounds = useMemo(
    () => getLastCompletedWeekBounds(new Date(deviceToday.year, deviceToday.month, deviceToday.day)),
    [deviceToday.year, deviceToday.month, deviceToday.day]
  );

  // Weekly review reads from the SAME unified activityRecords & restRecords store with the exact same counting rules
  const lastWeekCompletions = useMemo(
    () =>
      getDeduplicatedWeekCompletions(
        lastCompletedWeekBounds.weekStartKey,
        lastCompletedWeekBounds.weekEndKey
      ),
    [
      getDeduplicatedWeekCompletions,
      lastCompletedWeekBounds.weekStartKey,
      lastCompletedWeekBounds.weekEndKey,
    ]
  );

  // Stage 6 Weekly review model: strictly defaults to most recent COMPLETED local Mon-Sun week
  // and is completely isolated from the This week switcher!
  const weeklyReviewModel = useMemo(
    () => getWeeklyReviewModel(effectivePlanStore, referenceTodayDate, activeRhythmHabit),
    [effectivePlanStore, referenceTodayDate, activeRhythmHabit]
  );

  // Primary Weekly review inline error / retry & Before->After diff state
  const [weeklyReviewSaveError, setWeeklyReviewSaveError] = useState<string | null>(null);
  const [weeklyReviewFailedAnswer, setWeeklyReviewFailedAnswer] =
    useState<WeeklyReviewFitAnswer | null>(null);
  const [weeklyFollowUpSaveError, setWeeklyFollowUpSaveError] = useState<string | null>(null);
  const [weeklyFollowUpFailedAnswer, setWeeklyFollowUpFailedAnswer] =
    useState<WeeklyHardFollowUpAnswer | null>(null);
  const [weeklyPrimaryConfirming, setWeeklyPrimaryConfirming] = useState<boolean>(false);
  const [weeklyPrimaryAfterDraft, setWeeklyPrimaryAfterDraft] = useState<string>('');
  const [weeklyPrimarySuggestionError, setWeeklyPrimarySuggestionError] = useState<string | null>(
    null
  );
  const [weeklyPrimaryFailedAction, setWeeklyPrimaryFailedAction] = useState<
    'confirm' | 'dismiss' | null
  >(null);

  useEffect(() => {
    setWeeklyPrimaryConfirming(false);
    setWeeklyPrimarySuggestionError(null);
    setWeeklyPrimaryFailedAction(null);
    setWeeklyPrimaryAfterDraft(
      weeklyReviewModel.pendingSuggestion?.suggestedFieldValue ??
        weeklyReviewModel.pendingSuggestion?.afterLabel ??
        ''
    );
  }, [weeklyReviewModel.pendingSuggestion?.suggestionId]);

  // Keep legacy adjustment proposal state available only for legacy schedule sheet cleanup
  const lastWeekFeedback =
    weeklyReviewFeedbacks[lastCompletedWeekBounds.weekStartKey] ?? null;
  const adjustmentTargetBaseSchedule = nextWeekSchedule ?? weeklySchedule;
  const activeAdjustmentProposal = useMemo(
    () =>
      buildWeeklyAdjustmentProposal(
        adjustmentTargetBaseSchedule,
        lastWeekFeedback,
        nextWeekBounds,
        resolvedAdjustmentKeys
      ),
    [adjustmentTargetBaseSchedule, lastWeekFeedback, nextWeekBounds, resolvedAdjustmentKeys]
  );

  // Unused legacy handlers kept removed; Weekly review + Your journey now share one unified engine below.
  void lastWeekCompletions;

  // Atomic persistence helper for Your journey actions so save failures keep UI clean with Retry
  const tryCommitPlanStoreUpdate = useCallback(
    (updater: (prev: PlanFoundationStore) => PlanFoundationStore): boolean => {
      const next = updater(effectivePlanStore);
      if (next === effectivePlanStore) return true;
      const didSave = savePlanFoundationStore(next);
      if (!didSave) return false;
      if (onUpdatePlanStore) {
        onUpdatePlanStore(() => next);
      }
      return true;
    },
    [effectivePlanStore, onUpdatePlanStore]
  );

  const handleJourneySaveFeelingCheckIn = useCallback(
    (frictionLevel: HabitStartFrictionLevel): JourneyActionResult => {
      if (!activeRhythmHabit) return { ok: false, error: 'No active habit selected.' };
      const ok = tryCommitPlanStoreUpdate(
        (prev) =>
          recordHabitCheckIn(prev, {
            habitId: activeRhythmHabit.habitId,
            frictionLevel,
            dateKey: deviceToday.dateStr,
          }).store
      );
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your check-in right now. Please try again.' };
      }
      return { ok: true };
    },
    [activeRhythmHabit, deviceToday.dateStr, tryCommitPlanStoreUpdate]
  );

  const handleJourneyHideStatusConclusion = useCallback((): JourneyActionResult => {
    if (!activeRhythmHabit || !rhythmModel) return { ok: false };
    const ok = tryCommitPlanStoreUpdate((prev) =>
      hideHabitStatusConclusion(
        prev,
        activeRhythmHabit.habitId,
        rhythmModel.statusCode,
        activeRhythmHabit.version
      )
    );
    if (!ok) {
      return { ok: false, error: 'Couldn’t update your view preference right now.' };
    }
    return { ok: true };
  }, [activeRhythmHabit, rhythmModel, tryCommitPlanStoreUpdate]);

  const handleJourneyShowStatusConclusion = useCallback((): JourneyActionResult => {
    if (!activeRhythmHabit) return { ok: false };
    const ok = tryCommitPlanStoreUpdate((prev) =>
      clearHiddenHabitStatusConclusion(prev, activeRhythmHabit.habitId)
    );
    if (!ok) {
      return { ok: false, error: 'Couldn’t update your view preference right now.' };
    }
    return { ok: true };
  }, [activeRhythmHabit, tryCommitPlanStoreUpdate]);

  // Atomic Stage 6 Weekly review handlers (persists first; save failure leaves state clean with Retry)
  const handleWeeklyFitSelect = useCallback(
    (answer: WeeklyReviewFitAnswer): JourneyActionResult => {
      const weekStartKey = weeklyReviewModel.weekStartKey;
      const nowIso = new Date().toISOString();
      const ok = tryCommitPlanStoreUpdate(
        (prev) =>
          upsertWeeklyReviewAnswer(prev, {
            weekStartKey,
            questionId: WEEKLY_REVIEW_FIT_QUESTION_ID,
            rawAnswer: answer,
            commitmentVersion: prev.commitment?.version ?? null,
            habitVersion: activeRhythmHabit?.version ?? null,
            timestamp: nowIso,
          }).store
      );
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your feedback. Please try again.' };
      }
      const legacyFeeling: WeeklyReviewFeeling =
        answer === 'hard_to_fit_in'
          ? 'too_much'
          : answer === 'room_for_more'
          ? 'ready_for_more'
          : 'about_right';
      const nextFeedbacks: Record<string, WeeklyReviewFeedback> = {
        ...weeklyReviewFeedbacks,
        [weekStartKey]: {
          weekStartKey,
          feeling: legacyFeeling,
          updatedAt: nowIso,
        },
      };
      setWeeklyReviewFeedbacks(nextFeedbacks);
      saveWeeklyReviewFeedbacks(nextFeedbacks);
      return { ok: true };
    },
    [
      weeklyReviewModel.weekStartKey,
      activeRhythmHabit?.version,
      weeklyReviewFeedbacks,
      tryCommitPlanStoreUpdate,
    ]
  );

  const handleWeeklyFollowUpSelect = useCallback(
    (answer: WeeklyHardFollowUpAnswer): JourneyActionResult => {
      const weekStartKey = weeklyReviewModel.weekStartKey;
      const nowIso = new Date().toISOString();
      const ok = tryCommitPlanStoreUpdate(
        (prev) =>
          upsertWeeklyReviewAnswer(prev, {
            weekStartKey,
            questionId: WEEKLY_REVIEW_HARD_FOLLOWUP_QUESTION_ID,
            rawAnswer: answer,
            commitmentVersion: prev.commitment?.version ?? null,
            habitVersion: activeRhythmHabit?.version ?? null,
            timestamp: nowIso,
          }).store
      );
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your answer. Please try again.' };
      }
      return { ok: true };
    },
    [weeklyReviewModel.weekStartKey, activeRhythmHabit?.version, tryCommitPlanStoreUpdate]
  );

  const handleWeeklyStartingFeelSelect = useCallback(
    (level: HabitStartFrictionLevel): JourneyActionResult => {
      const weekStartKey = weeklyReviewModel.weekStartKey;
      const nowIso = new Date().toISOString();
      const ok = tryCommitPlanStoreUpdate((prev) => {
        let next = upsertWeeklyReviewAnswer(prev, {
          weekStartKey,
          questionId: DEFAULT_HABIT_EASE_QUESTION_ID,
          rawAnswer: level,
          commitmentVersion: prev.commitment?.version ?? null,
          habitVersion: activeRhythmHabit?.version ?? null,
          timestamp: nowIso,
        }).store;
        if (activeRhythmHabit) {
          next = recordHabitCheckIn(next, {
            habitId: activeRhythmHabit.habitId,
            frictionLevel: level,
            dateKey: deviceToday.dateStr,
            questionId: DEFAULT_HABIT_EASE_QUESTION_ID,
            recordedAt: nowIso,
          }).store;
        }
        return next;
      });
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your check-in. Please try again.' };
      }
      return { ok: true };
    },
    [
      weeklyReviewModel.weekStartKey,
      activeRhythmHabit,
      deviceToday.dateStr,
      tryCommitPlanStoreUpdate,
    ]
  );

  const handleWeeklySelfReportSave = useCallback(
    (noteOrSkipped: string): JourneyActionResult => {
      const weekStartKey = weeklyReviewModel.weekStartKey;
      const nowIso = new Date().toISOString();
      const ok = tryCommitPlanStoreUpdate(
        (prev) =>
          upsertWeeklyReviewAnswer(prev, {
            weekStartKey,
            questionId: WEEKLY_REVIEW_SELF_REPORT_QUESTION_ID,
            rawAnswer: noteOrSkipped,
            commitmentVersion: prev.commitment?.version ?? null,
            habitVersion: activeRhythmHabit?.version ?? null,
            timestamp: nowIso,
          }).store
      );
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your note. Please try again.' };
      }
      return { ok: true };
    },
    [weeklyReviewModel.weekStartKey, activeRhythmHabit?.version, tryCommitPlanStoreUpdate]
  );

  const handleConfirmSharedSuggestion = useCallback(
    (
      step: JourneyNextStepExperiment,
      editedValue?: string,
      source: 'journey' | 'weekly_review' = 'journey'
    ): JourneyActionResult => {
      const nowIso = new Date().toISOString();
      const isWeeklySuggestion = step.suggestionId.startsWith('wr::');

      const attachWeeklyDecision = (
        storeAfterUpdate: PlanFoundationStore,
        summary: string,
        resultingPlanVersion?: string
      ): PlanFoundationStore => {
        if (!isWeeklySuggestion) return storeAfterUpdate;
        return appendWeeklyReviewDecision(storeAfterUpdate, {
          weekStartKey: weeklyReviewModel.weekStartKey,
          questionId: WEEKLY_REVIEW_FIT_QUESTION_ID,
          decision: {
            id: `wdec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            suggestionId: step.suggestionId,
            decision: 'accepted',
            summary,
            decidedAt: nowIso,
            ...(resultingPlanVersion ? { payload: { resultingPlanVersion } } : {}),
          },
        });
      };

      if (step.kind === 'weekly_review_shared' && activeAdjustmentProposal && adjustmentTargetBaseSchedule) {
        const targetWeekKey = activeAdjustmentProposal.targetWeekStartKey;
        const baseForTargetWeek =
          weeklySchedulesByWeek[targetWeekKey] ?? adjustmentTargetBaseSchedule;
        const updatedTargetSchedule = applyWeeklyAdjustmentProposal(
          baseForTargetWeek,
          activeAdjustmentProposal
        );
        const nextByWeek: WeeklySchedulesByWeek = {
          ...weeklySchedulesByWeek,
          [targetWeekKey]: updatedTargetSchedule,
        };
        const ok = tryCommitPlanStoreUpdate((prev) => {
          const withEvent = recordLifecycleEvent(prev, {
            type: 'strategy_adjustment',
            dateKey: deviceToday.dateStr,
            source: 'plan',
            habitId: activeRhythmHabit?.habitId,
            title: activeAdjustmentProposal.headline,
            note: activeAdjustmentProposal.changeLabel,
            relatedWeekStartKey: targetWeekKey,
            payload: {
              proposalId: activeAdjustmentProposal.id,
              targetActivity: activeAdjustmentProposal.targetActivity,
              targetField: activeAdjustmentProposal.targetField,
              previousValue: activeAdjustmentProposal.previousValue,
              nextValue: activeAdjustmentProposal.nextValue,
            },
          }).store;
          const withShared = recordSharedSuggestionDecision(withEvent, {
            suggestionId: activeAdjustmentProposal.id,
            status: 'accepted',
            habitId: activeRhythmHabit?.habitId,
            source,
            summary: activeAdjustmentProposal.changeLabel,
          });
          return recordCommitmentRhythmEvent(withShared, 'adjusted');
        });
        if (!ok) {
          return {
            ok: false,
            error: 'Couldn’t save this adjustment right now. Your plan wasn’t changed.',
          };
        }
        setWeeklySchedulesByWeek(nextByWeek);
        saveWeeklySchedulesByWeek(nextByWeek);
        const nextResolved = Array.from(
          new Set([
            ...resolvedAdjustmentKeys,
            activeAdjustmentProposal.resolutionKey,
            activeAdjustmentProposal.id,
          ])
        );
        setResolvedAdjustmentKeys(nextResolved);
        saveResolvedAdjustmentKeys(nextResolved);
        setLastAppliedAdjustment({
          proposal: activeAdjustmentProposal,
          targetWeekStartKey: targetWeekKey,
          targetActivity: activeAdjustmentProposal.targetActivity,
          targetField: activeAdjustmentProposal.targetField,
          previousValue: activeAdjustmentProposal.previousValue,
          appliedValue: activeAdjustmentProposal.nextValue,
        });
        showPlanToast('Adjustment saved');
        return { ok: true };
      }

      const ok = tryCommitPlanStoreUpdate((prev) => {
        // 1. Habit-backed concrete updates (only updates version & journey event inside atomic commit)
        if (activeRhythmHabit) {
          if (step.kind === 'make_smaller') {
            const nextRegular = (editedValue ?? step.afterLabel).trim();
            const res = confirmHabitStrategy(prev, {
              habitId: activeRhythmHabit.habitId,
              label: activeRhythmHabit.label,
              regularAction: nextRegular,
              minimumAction: activeRhythmHabit.minimumAction,
              cueTiming: activeRhythmHabit.cueTiming,
              alternativeAction: activeRhythmHabit.alternativeAction,
              frequencyDescription: activeRhythmHabit.frequencyDescription,
              adjustmentKind: 'made_smaller',
              adjustmentNote: `${activeRhythmHabit.regularAction} → ${nextRegular}`,
              confirmTrackingStartDateKey: deviceToday.dateStr,
            });
            const withShared = recordSharedSuggestionDecision(res.store, {
              suggestionId: step.suggestionId,
              status: 'accepted',
              habitId: activeRhythmHabit.habitId,
              source,
              summary: nextRegular,
            });
            return attachWeeklyDecision(
              withShared,
              `${step.title}: ${nextRegular}`,
              res.strategy.version
            );
          }

          if (step.kind === 'add_alternative') {
            const nextAlt = (editedValue ?? step.afterLabel).trim();
            const res = confirmHabitStrategy(prev, {
              habitId: activeRhythmHabit.habitId,
              label: activeRhythmHabit.label,
              regularAction: activeRhythmHabit.regularAction,
              minimumAction: activeRhythmHabit.minimumAction,
              cueTiming: activeRhythmHabit.cueTiming,
              alternativeAction: nextAlt,
              frequencyDescription: activeRhythmHabit.frequencyDescription,
              adjustmentKind: 'alternative_added',
              adjustmentNote: `Backup way: ${nextAlt}`,
              confirmTrackingStartDateKey: deviceToday.dateStr,
            });
            const withShared = recordSharedSuggestionDecision(res.store, {
              suggestionId: step.suggestionId,
              status: 'accepted',
              habitId: activeRhythmHabit.habitId,
              source,
              summary: nextAlt,
            });
            return attachWeeklyDecision(
              withShared,
              `${step.title}: ${nextAlt}`,
              res.strategy.version
            );
          }

          if (step.kind === 'shift_cue') {
            const nextCue = (editedValue ?? step.afterLabel).trim();
            const res = confirmHabitStrategy(prev, {
              habitId: activeRhythmHabit.habitId,
              label: activeRhythmHabit.label,
              regularAction: activeRhythmHabit.regularAction,
              minimumAction: activeRhythmHabit.minimumAction,
              cueTiming: nextCue,
              alternativeAction: activeRhythmHabit.alternativeAction,
              frequencyDescription: activeRhythmHabit.frequencyDescription,
              adjustmentKind: 'cue_timing',
              adjustmentNote: `Cue: ${nextCue}`,
              confirmTrackingStartDateKey: deviceToday.dateStr,
            });
            const withShared = recordSharedSuggestionDecision(res.store, {
              suggestionId: step.suggestionId,
              status: 'accepted',
              habitId: activeRhythmHabit.habitId,
              source,
              summary: nextCue,
            });
            return attachWeeklyDecision(
              withShared,
              `${step.title}: ${nextCue}`,
              res.strategy.version
            );
          }

          if (step.kind === 'resume') {
            const withResume = recordLifecycleEvent(prev, {
              type: 'resume',
              dateKey: deviceToday.dateStr,
              source: 'plan',
              habitId: activeRhythmHabit.habitId,
              title: 'Came back',
              note: 'Resumed from Your journey.',
            }).store;
            return recordSharedSuggestionDecision(withResume, {
              suggestionId: step.suggestionId,
              status: 'accepted',
              habitId: activeRhythmHabit.habitId,
              source,
              summary: 'Resumed',
            });
          }

          if (step.kind === 'pause') {
            const withPause = recordLifecycleEvent(prev, {
              type: 'pause',
              dateKey: deviceToday.dateStr,
              source: 'plan',
              habitId: activeRhythmHabit.habitId,
              title: 'Took a pause',
              note: 'Paused intentionally from Your journey.',
            }).store;
            return recordSharedSuggestionDecision(withPause, {
              suggestionId: step.suggestionId,
              status: 'accepted',
              habitId: activeRhythmHabit.habitId,
              source,
              summary: 'Paused',
            });
          }

          // keep_rhythm (explicit valid decision)
          const withKeep = recordLifecycleEvent(prev, {
            type: 'strategy_adjustment',
            dateKey: deviceToday.dateStr,
            source: 'plan',
            habitId: activeRhythmHabit.habitId,
            title: 'Chose to keep this rhythm',
            note: `Keeping ${activeRhythmHabit.regularAction} without adding load.`,
            payload: {
              adjustmentKind: 'kept_rhythm',
              toVersion: activeRhythmHabit.version,
            },
          }).store;
          const withCommitment = recordCommitmentRhythmEvent(withKeep, 'kept');
          const withShared = recordSharedSuggestionDecision(withCommitment, {
            suggestionId: step.suggestionId,
            status: 'accepted',
            habitId: activeRhythmHabit.habitId,
            source,
            summary: 'Kept current rhythm',
          });
          return attachWeeklyDecision(withShared, 'Keep this rhythm', activeRhythmHabit.version);
        }

        // 2. Commitment-level fallback when no specific habit is confirmed yet
        if (step.kind === 'keep_rhythm') {
          const withKeep = recordLifecycleEvent(prev, {
            type: 'strategy_adjustment',
            dateKey: deviceToday.dateStr,
            source: 'plan',
            title: 'Chose to keep this rhythm',
            note: 'Keeping current movement plan without adding load.',
            payload: { adjustmentKind: 'kept_rhythm' },
          }).store;
          const withCommitment = recordCommitmentRhythmEvent(withKeep, 'kept');
          const withShared = recordSharedSuggestionDecision(withCommitment, {
            suggestionId: step.suggestionId,
            status: 'accepted',
            source,
            summary: 'Kept current rhythm',
          });
          const versionLabel = prev.commitment ? `v${prev.commitment.version}` : undefined;
          return attachWeeklyDecision(withShared, 'Keep this rhythm', versionLabel);
        }

        const nextValue = (editedValue ?? step.afterLabel).trim();
        let updatedStore = prev;
        let resultingVersion: string | undefined;
        if (prev.commitment) {
          const commitmentRes = upsertPhaseCommitment(prev, {
            phaseId: prev.commitment.phaseId,
            phaseName: prev.commitment.phaseName,
            originalIntent: prev.commitment.originalIntent,
            summary: prev.commitment.summary,
            strategySummary:
              step.kind === 'make_smaller'
                ? nextValue
                : `${prev.commitment.strategySummary ?? prev.commitment.summary} (${step.title}: ${nextValue})`,
            strategies: prev.commitment.strategies,
            status: prev.commitment.status,
          });
          updatedStore = commitmentRes.store;
          resultingVersion = `v${commitmentRes.commitment.version}`;
        }
        const withEvent = recordLifecycleEvent(updatedStore, {
          type: 'strategy_adjustment',
          dateKey: deviceToday.dateStr,
          source: 'plan',
          title: step.title,
          note: `${step.beforeLabel} → ${nextValue}`,
          payload: { adjustmentKind: step.kind, resultingVersion },
        }).store;
        const withRhythmEvent = recordCommitmentRhythmEvent(withEvent, 'adjusted');
        const withShared = recordSharedSuggestionDecision(withRhythmEvent, {
          suggestionId: step.suggestionId,
          status: 'accepted',
          source,
          summary: nextValue,
        });
        return attachWeeklyDecision(withShared, `${step.title}: ${nextValue}`, resultingVersion);
      });

      if (!ok) {
        return {
          ok: false,
          error: 'Couldn’t save this update right now. Your plan wasn’t changed.',
        };
      }
      showPlanToast(step.kind === 'keep_rhythm' ? 'Rhythm kept' : 'Plan updated');
      return { ok: true };
    },
    [
      activeRhythmHabit,
      activeAdjustmentProposal,
      adjustmentTargetBaseSchedule,
      weeklySchedulesByWeek,
      resolvedAdjustmentKeys,
      weeklyReviewModel.weekStartKey,
      deviceToday.dateStr,
      tryCommitPlanStoreUpdate,
    ]
  );

  const handleDismissSharedSuggestion = useCallback(
    (
      step: JourneyNextStepExperiment,
      source: 'journey' | 'weekly_review' = 'journey'
    ): JourneyActionResult => {
      const ok = tryCommitPlanStoreUpdate((prev) => {
        const next = recordSharedSuggestionDecision(prev, {
          suggestionId: step.suggestionId,
          status: 'dismissed',
          habitId: activeRhythmHabit?.habitId,
          source,
          summary: step.title,
        });
        return step.kind === 'weekly_review_shared'
          ? recordCommitmentRhythmEvent(next, 'kept')
          : next;
      });
      if (!ok) {
        return { ok: false, error: 'Couldn’t save your preference right now.' };
      }
      if (step.kind === 'weekly_review_shared' && activeAdjustmentProposal) {
        const nextResolved = Array.from(
          new Set([
            ...resolvedAdjustmentKeys,
            activeAdjustmentProposal.resolutionKey,
            activeAdjustmentProposal.id,
          ])
        );
        setResolvedAdjustmentKeys(nextResolved);
        saveResolvedAdjustmentKeys(nextResolved);
        setLastAppliedAdjustment(null);
      }
      return { ok: true };
    },
    [activeRhythmHabit?.habitId, activeAdjustmentProposal, resolvedAdjustmentKeys, tryCommitPlanStoreUpdate]
  );

  const handleJourneyConfirmNextStep = useCallback(
    (step: JourneyNextStepExperiment, editedValue?: string): JourneyActionResult =>
      handleConfirmSharedSuggestion(step, editedValue, 'journey'),
    [handleConfirmSharedSuggestion]
  );

  const handleJourneyDismissNextStep = useCallback(
    (step: JourneyNextStepExperiment): JourneyActionResult =>
      handleDismissSharedSuggestion(step, 'journey'),
    [handleDismissSharedSuggestion]
  );

  const handleWeeklyConfirmSuggestion = useCallback(
    (step: JourneyNextStepExperiment, editedValue?: string): JourneyActionResult =>
      handleConfirmSharedSuggestion(step, editedValue, 'weekly_review'),
    [handleConfirmSharedSuggestion]
  );

  const handleWeeklyDismissSuggestion = useCallback(
    (step: JourneyNextStepExperiment): JourneyActionResult =>
      handleDismissSharedSuggestion(step, 'weekly_review'),
    [handleDismissSharedSuggestion]
  );

  // Atomic Stage 7 Goal detail / Review together / Adjust goal / Completion lifecycle handlers
  const handleGoalAdjust = useCallback(
    (
      input: Omit<AdjustGoalCommitmentInput, 'dateKey' | 'timestamp' | 'activeHabit'>
    ): JourneyActionResult => {
      let nextCommitmentSummary: string | null = null;
      let nextCommitmentStrategy: string | null = null;
      const ok = tryCommitPlanStoreUpdate((prev) => {
        const res = adjustGoalCommitment(prev, {
          ...input,
          activeHabit: activeRhythmHabit,
          dateKey: deviceToday.dateStr,
        });
        nextCommitmentSummary = res.commitment.summary;
        nextCommitmentStrategy = res.commitment.strategySummary ?? null;
        return res.store;
      });
      if (!ok) {
        return {
          ok: false,
          error: 'Couldn’t save your changes right now. Your current goal stays unchanged.',
        };
      }
      if (nextCommitmentSummary) {
        const syncedDirection: DirectionState = {
          ...direction,
          goalTitle: nextCommitmentSummary,
          description: nextCommitmentStrategy ?? '',
          executionApproach: nextCommitmentStrategy ?? '',
          status: 'active',
          source: 'user',
          isSample: false,
        };
        setDirection(syncedDirection);
        persistFocusToStorage(syncedDirection);
      }
      showPlanToast(input.mode === 'new_direction' ? 'New focus started' : 'Goal updated');
      return { ok: true };
    },
    [activeRhythmHabit, deviceToday.dateStr, direction, tryCommitPlanStoreUpdate]
  );

  const handleGoalKeepExploring = useCallback(
    (input: {
      feeling?: GoalReviewFeeling;
      outsidePracticeNote?: string;
    }): JourneyActionResult => {
      const ok = tryCommitPlanStoreUpdate((prev) =>
        recordGoalKeepExploring(prev, {
          ...input,
          dateKey: deviceToday.dateStr,
        })
      );
      if (!ok) {
        return {
          ok: false,
          error: 'Couldn’t save your review right now. Please try again.',
        };
      }
      showPlanToast('Staying with this goal');
      return { ok: true };
    },
    [deviceToday.dateStr, tryCommitPlanStoreUpdate]
  );

  const handleGoalConfirmCompletion = useCallback(
    (input: {
      feeling?: GoalReviewFeeling;
      outsidePracticeNote?: string;
    }): JourneyActionResult => {
      const ok = tryCommitPlanStoreUpdate((prev) =>
        confirmGoalCompletion(prev, {
          ...input,
          dateKey: deviceToday.dateStr,
        })
      );
      if (!ok) {
        return {
          ok: false,
          error: 'Couldn’t save completion right now. Your goal is still in progress.',
        };
      }
      showPlanToast('Goal completed');
      return { ok: true };
    },
    [deviceToday.dateStr, tryCommitPlanStoreUpdate]
  );

  const handleGoalApplyNextStep = useCallback(
    (input: GoalNextStepSubmitInput): JourneyActionResult => {
      let syncedSummary: string | null = null;
      let syncedStrategy: string | null = null;
      const ok = tryCommitPlanStoreUpdate((prev) => {
        const nextStore = applyCompletedGoalNextStep(prev, {
          ...input,
          activeHabit: activeRhythmHabit,
          dateKey: deviceToday.dateStr,
        });
        syncedSummary = nextStore.commitment?.summary ?? null;
        syncedStrategy = nextStore.commitment?.strategySummary ?? null;
        return nextStore;
      });
      if (!ok) {
        return {
          ok: false,
          error: 'Couldn’t save your next step right now. Your completed goal stays saved.',
        };
      }
      if (syncedSummary) {
        const syncedDirection: DirectionState = {
          ...direction,
          goalTitle: syncedSummary,
          description: syncedStrategy ?? '',
          executionApproach: syncedStrategy ?? '',
          status: 'active',
          source: 'user',
          isSample: false,
        };
        setDirection(syncedDirection);
        persistFocusToStorage(syncedDirection);
      }
      showPlanToast(
        input.choice === 'keep_rhythm'
          ? 'Rhythm kept'
          : input.choice === 'build_a_little'
          ? 'Plan updated'
          : 'New focus started'
      );
      return { ok: true };
    },
    [activeRhythmHabit, deviceToday.dateStr, direction, tryCommitPlanStoreUpdate]
  );

  const triggerPrimaryFitSelect = (answer: WeeklyReviewFitAnswer) => {
    const res = handleWeeklyFitSelect(answer);
    if (!res.ok) {
      setWeeklyReviewSaveError(res.error ?? 'Couldn’t save your feedback. Please try again.');
      setWeeklyReviewFailedAnswer(answer);
      return;
    }
    setWeeklyReviewSaveError(null);
    setWeeklyReviewFailedAnswer(null);
  };

  const triggerPrimaryFollowUpSelect = (answer: WeeklyHardFollowUpAnswer) => {
    const res = handleWeeklyFollowUpSelect(answer);
    if (!res.ok) {
      setWeeklyFollowUpSaveError(res.error ?? 'Couldn’t save your answer. Please try again.');
      setWeeklyFollowUpFailedAnswer(answer);
      return;
    }
    setWeeklyFollowUpSaveError(null);
    setWeeklyFollowUpFailedAnswer(null);
  };

  const triggerPrimaryConfirmSuggestion = () => {
    const step = weeklyReviewModel.pendingSuggestion;
    if (!step) return;
    const editable =
      step.kind === 'make_smaller' ||
      step.kind === 'shift_cue' ||
      step.kind === 'add_alternative';
    const trimmed = weeklyPrimaryAfterDraft.trim();
    if (editable && !trimmed) {
      setWeeklyPrimarySuggestionError('Enter a short description before confirming.');
      setWeeklyPrimaryFailedAction(null);
      return;
    }
    const res = handleWeeklyConfirmSuggestion(step, editable ? trimmed : undefined);
    if (!res.ok) {
      setWeeklyPrimarySuggestionError(
        res.error ?? 'Couldn’t save this update right now. Your plan wasn’t changed.'
      );
      setWeeklyPrimaryFailedAction('confirm');
      return;
    }
    setWeeklyPrimarySuggestionError(null);
    setWeeklyPrimaryFailedAction(null);
    setWeeklyPrimaryConfirming(false);
  };

  const triggerPrimaryDismissSuggestion = () => {
    const step = weeklyReviewModel.pendingSuggestion;
    if (!step) return;
    const res = handleWeeklyDismissSuggestion(step);
    if (!res.ok) {
      setWeeklyPrimarySuggestionError(
        res.error ?? 'Couldn’t save your preference right now. Please try again.'
      );
      setWeeklyPrimaryFailedAction('dismiss');
      return;
    }
    setWeeklyPrimarySuggestionError(null);
    setWeeklyPrimaryFailedAction(null);
    setWeeklyPrimaryConfirming(false);
  };

  // 6-Month Trend Series derived directly from effectiveActivityLogs ending at viewed month
  const monthlyTrendSeries: MonthlyTrendPoint[] = useMemo(() => {
    const series: MonthlyTrendPoint[] = [];
    for (let offset = -5; offset <= 0; offset++) {
      const mDate = new Date(viewYear, viewMonth + offset, 1);
      const y = mDate.getFullYear();
      const m = mDate.getMonth();
      const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
      const records = Object.values(effectiveActivityLogs).filter((r) => r.date.startsWith(prefix));
      const activeRecs = records.filter((r) => r.type === 'active');

      series.push({
        key: prefix,
        month: SHORT_MONTH_NAMES[m],
        activeDays: activeRecs.length,
        completedSessions: activeRecs.reduce((s, r) => s + (r.sessionsCount ?? 1), 0),
        totalMinutes: activeRecs.reduce((s, r) => s + (r.durationMinutes || 0), 0)
      });
    }
    return series;
  }, [effectiveActivityLogs, viewYear, viewMonth]);

  // Dynamic 7-Day and Month Rhythm Summaries derived from the exact same activityLogs
  const rhythmSummaries: Record<RhythmTimeframe, RecentSummaryData> = useMemo(() => {
    // Determine anchor end date for 7d window:
    // If viewing current month, use max(deviceToday.dateStr, latest logged date in current month)
    // so logging on any day in the month or past 7 days reflects immediately.
    let anchorDateObj = new Date(deviceToday.year, deviceToday.month, deviceToday.day);
    if (!isCurrentMonth) {
      if (currentMonthRecords.length > 0) {
        const maxLoggedInViewedMonth = [...currentMonthRecords]
          .map((r) => r.date)
          .sort()
          .pop()!;
        const [ly, lm, ld] = maxLoggedInViewedMonth.split('-').map(Number);
        anchorDateObj = new Date(ly, lm - 1, ld);
      } else {
        const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
        anchorDateObj = new Date(viewYear, viewMonth, lastDay);
      }
    } else if (currentMonthRecords.length > 0) {
      const maxLoggedDateStr = [...currentMonthRecords]
        .map((r) => r.date)
        .sort()
        .pop();
      if (maxLoggedDateStr && maxLoggedDateStr > deviceToday.dateStr) {
        const [ly, lm, ld] = maxLoggedDateStr.split('-').map(Number);
        anchorDateObj = new Date(ly, lm - 1, ld);
      }
    }

    // 1. Compute 7-Day Window
    let sevenDayActiveDays = 0;
    let sevenDaySessions = 0;
    let sevenDayMinutes = 0;
    let sevenDayRestDays = 0;
    const sevenDayBars: DailyBarItem[] = [];

    for (let i = 6; i >= 0; i--) {
      const dObj = new Date(
        anchorDateObj.getFullYear(),
        anchorDateObj.getMonth(),
        anchorDateObj.getDate() - i
      );
      const dKey = formatDateKey(dObj.getFullYear(), dObj.getMonth(), dObj.getDate());
      const rec = effectiveActivityLogs[dKey];
      const dayLabel = SHORT_WEEKDAYS[dObj.getDay()];

      if (rec?.type === 'active') {
        const mins = rec.durationMinutes ?? 15;
        const sess = rec.sessionsCount ?? 1;
        sevenDayActiveDays += 1;
        sevenDaySessions += sess;
        sevenDayMinutes += mins;
        if (rec.hasRest) {
          sevenDayRestDays += 1;
        }
        sevenDayBars.push({
          label: dayLabel,
          minutes: mins,
          sessions: sess,
          status: mins <= 5 ? 'light' : 'done'
        });
      } else if (rec?.type === 'rest') {
        sevenDayRestDays += 1;
        sevenDayBars.push({
          label: dayLabel,
          minutes: 0,
          sessions: 0,
          status: 'rest'
        });
      } else {
        sevenDayBars.push({
          label: dayLabel,
          minutes: 0,
          sessions: 0,
          status: 'none'
        });
      }
    }

    const sevenDayObservation =
      sevenDayActiveDays === 0 && sevenDayRestDays === 0
        ? 'No activities logged in this 7-day window yet. Tap any date on the Activity calendar to log an activity or rest day.'
        : `In this 7-day window, you logged ${sevenDayActiveDays} active ${
            sevenDayActiveDays === 1 ? 'day' : 'days'
          } (${sevenDaySessions} ${
            sevenDaySessions === 1 ? 'activity' : 'activities'
          }, ${sevenDayMinutes} min) and ${sevenDayRestDays} mindful rest ${
            sevenDayRestDays === 1 ? 'day' : 'days'
          }.`;

    // 2. Compute Month Window (Viewed Month: viewYear - viewMonth)
    const weekBuckets: DailyBarItem[] = [
      { label: 'Wk 1', minutes: 0, sessions: 0, status: 'none' },
      { label: 'Wk 2', minutes: 0, sessions: 0, status: 'none' },
      { label: 'Wk 3', minutes: 0, sessions: 0, status: 'none' },
      { label: 'Wk 4', minutes: 0, sessions: 0, status: 'none' }
    ];
    const weekHasRest = [false, false, false, false];

    for (const rec of currentMonthRecords) {
      const dayNum = Number(rec.date.split('-')[2] || 1);
      const bucketIdx = Math.min(3, Math.floor((dayNum - 1) / 7));
      if (rec.type === 'active') {
        weekBuckets[bucketIdx].minutes += rec.durationMinutes ?? 15;
        weekBuckets[bucketIdx].sessions += rec.sessionsCount ?? 1;
      } else if (rec.type === 'rest') {
        weekHasRest[bucketIdx] = true;
      }
    }

    for (let b = 0; b < 4; b++) {
      if (weekBuckets[b].minutes > 0) {
        weekBuckets[b].status = weekBuckets[b].minutes <= 15 ? 'light' : 'done';
      } else if (weekHasRest[b]) {
        weekBuckets[b].status = 'rest';
      }
    }

    const monthObservation =
      activeDaysCount === 0 && restDaysCount === 0
        ? `No records logged in ${MONTH_NAMES[viewMonth]} ${viewYear} yet.`
        : `In ${MONTH_NAMES[viewMonth]}, you’ve recorded ${activeDaysCount} active ${
            activeDaysCount === 1 ? 'day' : 'days'
          } across ${completedSessionsInMonth} completed ${
            completedSessionsInMonth === 1 ? 'activity' : 'activities'
          } (${totalMinutes} min total) and ${restDaysCount} mindful rest ${
            restDaysCount === 1 ? 'day' : 'days'
          }.`;

    return {
      '7d': {
        rangeLabel: isCurrentMonth ? 'Past 7 days' : `${ SHORT_MONTH_NAMES[viewMonth] } (last 7d)`,
        activeDaysCount: sevenDayActiveDays,
        completedCount: sevenDaySessions,
        activeMinutes: sevenDayMinutes,
        restDaysCount: sevenDayRestDays,
        novaObservation: sevenDayObservation,
        dailyBreakdown: sevenDayBars
      },
      month: {
        rangeLabel: `${MONTH_NAMES[viewMonth]} ${viewYear}`,
        activeDaysCount,
        completedCount: completedSessionsInMonth,
        activeMinutes: totalMinutes,
        restDaysCount,
        novaObservation: monthObservation,
        dailyBreakdown: weekBuckets
      }
    };
  }, [
    effectiveActivityLogs,
    currentMonthRecords,
    deviceToday,
    isCurrentMonth,
    viewYear,
    viewMonth,
    activeDaysCount,
    completedSessionsInMonth,
    totalMinutes,
    restDaysCount
  ]);

  const currentRecentData = rhythmSummaries[rhythmFilter];

  // --- Computed Preferences (User-confirmed vs Pending confirmation) ---
  const confirmedMemories = useMemo(
    () => memories.filter((m) => m.isConfirmed && m.source === 'user_explicit'),
    [memories]
  );
  const checkMemories = useMemo(
    () => memories.filter((m) => !m.isConfirmed || m.source !== 'user_explicit'),
    [memories]
  );
  const confirmedPreferenceTags = useMemo(
    () => getConfirmedPreferenceTags(memories, 3),
    [memories]
  );

  // --- Handlers for Month Switching ---
  const handlePrevMonth = () => {
    setSlideDirection(-1);
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setSlideDirection(1);
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectMonth = (targetYear: number, targetMonth: number) => {
    const currentTotal = viewYear * 12 + viewMonth;
    const targetTotal = targetYear * 12 + targetMonth;
    setSlideDirection(targetTotal >= currentTotal ? 1 : -1);
    setViewYear(targetYear);
    setViewMonth(targetMonth);
    setIsMonthPickerOpen(false);
  };

  const handleJumpToThisMonth = () => {
    const latestToday = getDeviceTodayState();
    setDeviceToday(latestToday);
    const currentTotal = viewYear * 12 + viewMonth;
    const todayTotal = latestToday.year * 12 + latestToday.month;
    setSlideDirection(todayTotal >= currentTotal ? 1 : -1);
    setViewYear(latestToday.year);
    setViewMonth(latestToday.month);
  };

  // --- Handlers for Day Detail & Unified Record Management ---
  const resetDayActivityDraft = () => {
    setEditingActivityId(null);
    setDayDraftType('active');
    setDayDraftCategory('walk');
    setDayDraftTitle('15-min mindful walk');
    setDayDraftDuration(15);
    setDayDraftNote('');
  };

  const handleOpenDayDetail = (dateStr: string) => {
    setActiveDayModalDate(dateStr);
    resetDayActivityDraft();
  };

  const handleStartEditDayActivity = (rec: ActivityCompletionRecord) => {
    setEditingActivityId(rec.id);
    setDayDraftType('active');
    const normalizedCat: Exclude<ActivityCategory, 'rest'> =
      rec.category === 'walk' || rec.category === 'stretch' ? rec.category : 'other';
    setDayDraftCategory(normalizedCat);
    setDayDraftTitle(rec.title);
    setDayDraftDuration(rec.durationMinutes || 15);
    setDayDraftNote(rec.note || '');
  };

  const handleDeleteSingleDayActivity = (recordId: string) => {
    onDeleteActivity?.(recordId);
    if (editingActivityId === recordId) {
      resetDayActivityDraft();
    }
    showPlanToast('Activity removed — rhythm updated');
  };

  const handleDeleteSingleDayRest = (restId: string) => {
    onDeleteRestRecord?.(restId);
    showPlanToast('Rest day removed — rhythm updated');
  };

  const handleSaveDayRecord = () => {
    if (!activeDayModalDate) return;
    if (dayDraftType === 'active' && !dayDraftTitle.trim()) return;

    if (dayDraftType === 'none') {
      onClearDayRecords?.(activeDayModalDate);
      showPlanToast('Record cleared — rhythm updated');
      setEditingActivityId(null);
      setActiveDayModalDate(null);
      return;
    }

    if (dayDraftType === 'rest') {
      onUpsertRestDay?.(activeDayModalDate, dayDraftNote);
      showPlanToast('Rest day saved — rhythm updated');
      setEditingActivityId(null);
      setActiveDayModalDate(null);
      return;
    }

    if (editingActivityId) {
      onUpdateActivity?.(editingActivityId, {
        title: dayDraftTitle.trim(),
        category: dayDraftCategory,
        durationMinutes: dayDraftDuration,
        note: dayDraftNote.trim(),
      });
      showPlanToast('Activity updated — rhythm updated');
    } else {
      onAddManualActivity?.({
        dateKey: activeDayModalDate,
        title: dayDraftTitle.trim(),
        category: dayDraftCategory,
        durationMinutes: dayDraftDuration,
        note: dayDraftNote.trim(),
      });
      showPlanToast('Activity saved — rhythm updated');
    }
    setEditingActivityId(null);
    setActiveDayModalDate(null);
  };

  // --- Handlers for Phase Commitment Header / Goal Detail ---
  const handleOpenFocusAdjust = () => {
    if (hasConfirmedCommitment && effectiveCommitment) {
      const targetMode: GoalDetailSubMode =
        effectiveCommitment.reviewRequested && effectiveCommitment.status !== 'completed'
          ? 'review'
          : 'overview';
      setGoalSheetInitialMode(targetMode);
      setGoalSheetActiveMode(targetMode);
      openSecondaryModule('goal', 'plan');
      return;
    }
    setFocusDraftTitle('');
    setFocusDraftApproach('');
    setFocusDraftReview(direction.nextReviewDate);
    setIsFocusAdjustOpen(true);
  };

  const handleCloseFocusAdjust = () => {
    setIsFocusAdjustOpen(false);
  };

  const handleSaveFocusAdjust = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedFocus = focusDraftTitle.trim();
    if (!trimmedFocus) return;

    const trimmedApproach = focusDraftApproach.trim();
    const trimmedReview =
      focusDraftReview.trim() ||
      formatReviewOnSundayLabel(new Date(deviceToday.year, deviceToday.month, deviceToday.day));
    const wasConfirmed = hasConfirmedCommitment;

    const updated: DirectionState = {
      ...direction,
      phase: currentPhase.name,
      goalTitle: trimmedFocus,
      description: trimmedApproach,
      executionApproach: trimmedApproach,
      nextReviewDate: trimmedReview,
      source: 'user',
      isSample: false,
    };

    setDirection(updated);
    persistFocusToStorage(updated);
    if (onUpdatePlanStore) {
      onUpdatePlanStore((prev) =>
        upsertPhaseCommitment(prev, {
          phaseId: currentPhase.id,
          phaseName: currentPhase.name,
          originalIntent: prev.commitment?.originalIntent ?? trimmedFocus,
          summary: trimmedFocus,
          strategySummary: trimmedApproach || null,
          status: updated.status,
          lastEventKind: wasConfirmed ? 'adjusted' : 'started',
          reviewRequested: false,
          confirmTrackingStartDateKey: deviceToday.dateStr,
        }).store
      );
    }
    setIsFocusAdjustOpen(false);
    setDirectionToast(true);
    setTimeout(() => setDirectionToast(false), 2600);
  };

  const handleKeepCurrentRhythm = () => {
    if (!hasConfirmedCommitment) {
      setIsFocusAdjustOpen(false);
      return;
    }
    if (onUpdatePlanStore) {
      onUpdatePlanStore((prev) => recordCommitmentRhythmEvent(prev, 'kept'));
    }
    setIsFocusAdjustOpen(false);
    showPlanToast('Rhythm kept');
  };

  const handleFieldFocusScroll = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 120);
  };

  // --- Handlers for This Week / Next Week Schedule Editing ---
  const handleOpenWeekAdjust = (target: 'this_week' | 'next_week') => {
    if (target === 'next_week') {
      const seed = nextWeekSchedule ?? weeklySchedule ?? DEFAULT_WEEKLY_DRAFT;
      setWeekDraft({
        walk: { ...seed.walk },
        stretch: { ...seed.stretch },
        restNote: 'As needed',
        updatedAt: seed.updatedAt,
      });
    } else {
      const seed = weeklySchedule ?? DEFAULT_WEEKLY_DRAFT;
      setWeekDraft({
        walk: { ...seed.walk },
        stretch: { ...seed.stretch },
        restNote: 'As needed',
        updatedAt: seed.updatedAt,
      });
    }
    setEditingWeekTarget(target);
  };

  const handleCloseWeekAdjust = () => {
    setEditingWeekTarget(null);
  };

  const handleSaveWeekAdjust = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = editingWeekTarget ?? 'this_week';
    const targetWeekKey =
      target === 'next_week' ? nextWeekBounds.weekStartKey : currentWeekBounds.weekStartKey;

    const nextSchedule: WeeklySchedule = {
      walk: {
        targetCount: weekDraft.walk.targetCount,
        durationLabel:
          weekDraft.walk.durationLabel.trim() || DEFAULT_WEEKLY_DRAFT.walk.durationLabel,
      },
      stretch: {
        targetCount: weekDraft.stretch.targetCount,
        durationLabel:
          weekDraft.stretch.durationLabel.trim() || DEFAULT_WEEKLY_DRAFT.stretch.durationLabel,
      },
      restNote: 'As needed',
      updatedAt: new Date().toISOString(),
      source: 'user',
    };

    const nextByWeek: WeeklySchedulesByWeek = {
      ...weeklySchedulesByWeek,
      [targetWeekKey]: nextSchedule,
    };
    setWeeklySchedulesByWeek(nextByWeek);
    saveWeeklySchedulesByWeek(nextByWeek);

    // If the user manually changed the exact field previously adjusted by "Try this",
    // invalidate that Undo entry so old Undo can never overwrite the user's newer value.
    if (
      lastAppliedAdjustment &&
      lastAppliedAdjustment.targetWeekStartKey === targetWeekKey
    ) {
      const newFieldVal = getWeeklyScheduleFieldValue(
        nextSchedule,
        lastAppliedAdjustment.targetActivity,
        lastAppliedAdjustment.targetField
      );
      if (newFieldVal !== lastAppliedAdjustment.appliedValue) {
        setLastAppliedAdjustment(null);
      }
    }

    setEditingWeekTarget(null);
    showPlanToast(target === 'next_week' ? 'Next week updated' : 'This week updated');
  };

  // --- Handlers for Preferences ---
  const showMemoryFeedback = (text: string) => {
    showPlanToast(text);
  };

  const updatePreferencesState = (
    updater: (prev: PreferenceItem[]) => PreferenceItem[]
  ) => {
    setMemories((prev) => {
      const next = updater(prev);
      savePreferences(next);
      return next;
    });
  };

  const handleOpenAddPreference = () => {
    setPrefFormEditingId(null);
    setPrefDraftTitle('');
    setPrefDraftTag('');
    setPrefDraftSummary('');
    setIsPrefFormOpen(true);
  };

  const handleOpenEditPreference = (item: PreferenceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMemory(null);
    setPrefFormEditingId(item.id);
    setPrefDraftTitle(item.title.replace(/\?+$/, '').trim());
    setPrefDraftTag(item.shortTag || deriveShortPreferenceTag(item));
    setPrefDraftSummary(item.summary);
    setIsPrefFormOpen(true);
  };

  const handleSavePreferenceForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTitle = prefDraftTitle.trim();
    if (!trimmedTitle) return;

    const trimmedTag = prefDraftTag.trim();
    const trimmedSummary = prefDraftSummary.trim();

    if (prefFormEditingId) {
      updatePreferencesState((prev) =>
        prev.map((m) =>
          m.id === prefFormEditingId
            ? {
                ...m,
                title: trimmedTitle,
                shortTag: trimmedTag || undefined,
                summary: trimmedSummary,
                isConfirmed: true,
                source: 'user_explicit',
                category: m.category === 'check' ? 'feels_right' : m.category,
                updatedAt: 'Updated just now',
              }
            : m
        )
      );
      showMemoryFeedback('Preference updated');
    } else {
      const newItem: PreferenceItem = {
        id: `pref-user-${Date.now()}`,
        category: 'feels_right',
        title: trimmedTitle,
        shortTag: trimmedTag || undefined,
        summary: trimmedSummary,
        learnedFrom: 'Added by you.',
        howItHelps: '',
        updatedAt: 'Saved just now',
        isConfirmed: true,
        source: 'user_explicit',
      };
      updatePreferencesState((prev) => [newItem, ...prev]);
      showMemoryFeedback('Preference saved');
    }

    setIsPrefFormOpen(false);
    setPrefFormEditingId(null);
  };

  const handleConfirmPendingMemory = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    updatePreferencesState((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              title: m.title.replace(/\?+$/, '').trim(),
              category: 'feels_right',
              isConfirmed: true,
              source: 'user_explicit',
              learnedFrom: 'Confirmed by you.',
              updatedAt: 'Confirmed just now',
            }
          : m
      )
    );
    if (selectedMemory?.id === id) {
      setSelectedMemory((prev) =>
        prev
          ? {
              ...prev,
              title: prev.title.replace(/\?+$/, '').trim(),
              category: 'feels_right',
              isConfirmed: true,
              source: 'user_explicit',
              learnedFrom: 'Confirmed by you.',
              updatedAt: 'Confirmed just now',
            }
          : null
      );
    }
    showMemoryFeedback('Preference confirmed');
  };

  const handleDismissPendingMemory = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    updatePreferencesState((prev) => prev.filter((m) => m.id !== id));
    if (selectedMemory?.id === id) {
      setSelectedMemory(null);
    }
    showMemoryFeedback('Suggestion ignored');
  };

  const handleDeleteMemoryConfirmed = () => {
    if (!memoryToDelete) return;
    const targetId = memoryToDelete.id;
    updatePreferencesState((prev) => prev.filter((m) => m.id !== targetId));
    if (selectedMemory?.id === targetId) {
      setSelectedMemory(null);
    }
    if (editingMemory?.id === targetId) {
      setEditingMemory(null);
      setIsMemoryChatOpen(false);
    }
    setMemoryToDelete(null);
    showMemoryFeedback('Preference removed');
  };

  const handleStartTalkToNovaMemory = (item?: MemoryItem | null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMemory(null);
    setEditingMemory(item || null);
    setMemoryChatInput('');

    if (item) {
      setMemoryChatMessages([
        {
          id: `mem-ai-init-${Date.now()}`,
          sender: 'ai',
          text: `Right now I have this noted: “${item.title}.” How should we update or refine this so it fits you better?`
        }
      ]);
    } else {
      setMemoryChatMessages([
        {
          id: `mem-ai-init-${Date.now()}`,
          sender: 'ai',
          text: `What would you like me to remember, update, or correct about your routine, preferences, or life state? I’ll always confirm with you before saving.`
        }
      ]);
    }
    setIsMemoryChatOpen(true);
  };

  const buildMemoryProposal = (
    userText: string,
    currentItem: MemoryItem | null
  ): MemoryChatProposal => {
    const lower = userText.toLowerCase();

    if (currentItem) {
      if (
        lower.includes('evening') ||
        lower.includes('night') ||
        lower.includes('after dinner') ||
        lower.includes('7 pm')
      ) {
        return {
          mode: 'update',
          targetMemoryId: currentItem.id,
          newTitle: 'Prefers gentle evening walks or wind-downs after 6:30 PM',
          newSummary: 'Evening hours after work feel calmer and more realistic than midday windows.',
          newCategory: currentItem.category === 'check' ? 'feels_right' : currentItem.category
        };
      }
      if (lower.includes('morning') || lower.includes('9 am') || lower.includes('before work')) {
        return {
          mode: 'update',
          targetMemoryId: currentItem.id,
          newTitle: 'Prefers a quiet 10-minute morning walk before 9:30 AM',
          newSummary: 'Starting the day with light movement before meetings feels freshest.',
          newCategory: currentItem.category === 'check' ? 'feels_right' : currentItem.category
        };
      }
      if (
        lower.includes('10 min') ||
        lower.includes('shorter') ||
        lower.includes('5 min') ||
        lower.includes('brief')
      ) {
        return {
          mode: 'update',
          targetMemoryId: currentItem.id,
          newTitle: 'Keep sessions brief (5–10 minutes) on normal workdays',
          newSummary:
            'Shorter 5-to-10 minute micro-sessions feel much more approachable than 15-minute blocks.',
          newCategory: currentItem.category === 'check' ? 'feels_right' : currentItem.category
        };
      }
      return {
        mode: 'update',
        targetMemoryId: currentItem.id,
        newTitle: userText.length > 68 ? `${userText.slice(0, 65)}...` : userText,
        newSummary: `Updated directly from your conversation with Nova: “${userText}”`,
        newCategory: currentItem.category === 'check' ? 'feels_right' : currentItem.category
      };
    }

    if (lower.includes('morning') || lower.includes('before work')) {
      return {
        mode: 'add',
        newTitle: 'Enjoys quiet 10-minute morning walks before work starts',
        newSummary:
          'Gentle morning fresh air before opening laptops helps set a steady tone for the day.',
        newCategory: 'feels_right'
      };
    }
    if (
      lower.includes('knee') ||
      lower.includes('back') ||
      lower.includes('joint') ||
      lower.includes('low-impact')
    ) {
      return {
        mode: 'add',
        newTitle: 'Keep movements gentle and low-impact for joint comfort',
        newSummary: 'Avoids high-impact jumping or deep knee strain in favor of smooth mobility.',
        newCategory: 'matters'
      };
    }
    if (lower.includes('evening') || lower.includes('sleep') || lower.includes('after 8')) {
      return {
        mode: 'add',
        newTitle: 'Prefers calm, screen-free wind-downs after 8:30 PM',
        newSummary: 'Protecting late evenings for quiet relaxation supports deeper rest.',
        newCategory: 'feels_right'
      };
    }

    return {
      mode: 'add',
      newTitle: userText.length > 68 ? `${userText.slice(0, 65)}...` : userText,
      newSummary: `Shared with Nova: “${userText}”`,
      newCategory: 'feels_right'
    };
  };

  const handleSendMemoryChat = (textOverride?: string) => {
    const raw = (textOverride ?? memoryChatInput).trim();
    if (!raw) return;

    const userMsg: MemoryChatMessage = {
      id: `mem-user-${Date.now()}`,
      sender: 'user',
      text: raw
    };

    const proposal = buildMemoryProposal(raw, editingMemory);

    const aiMsg: MemoryChatMessage = {
      id: `mem-ai-${Date.now() + 1}`,
      sender: 'ai',
      text:
        proposal.mode === 'update'
          ? 'Got it. Before I update this memory, please confirm if this looks accurate:'
          : 'Thanks for sharing that. Before I save this to your memory, please confirm if this looks right:',
      proposal,
      proposalAccepted: false
    };

    setMemoryChatMessages((prev) => [...prev, userMsg, aiMsg]);
    if (!textOverride) setMemoryChatInput('');
  };

  const handleConfirmMemoryProposal = (messageId: string) => {
    const targetMsg = memoryChatMessages.find((m) => m.id === messageId);
    if (!targetMsg || !targetMsg.proposal) return;

    const { mode, targetMemoryId, newTitle, newSummary, newCategory } = targetMsg.proposal;

    if (mode === 'update' && targetMemoryId) {
      updatePreferencesState((prev) =>
        prev.map((m) =>
          m.id === targetMemoryId
            ? {
                ...m,
                title: newTitle.replace(/\?+$/, '').trim(),
                summary: newSummary,
                category: newCategory === 'check' ? 'feels_right' : newCategory,
                isConfirmed: true,
                source: 'user_explicit',
                learnedFrom: 'Updated by you in chat.',
                updatedAt: 'Updated just now'
              }
            : m
        )
      );
      showMemoryFeedback('Preference updated');
    } else {
      const newItem: PreferenceItem = {
        id: `pref-chat-${Date.now()}`,
        category: newCategory === 'check' ? 'feels_right' : newCategory,
        title: newTitle.replace(/\?+$/, '').trim(),
        summary: newSummary,
        learnedFrom: 'Shared by you in chat.',
        howItHelps: '',
        updatedAt: 'Saved just now',
        isConfirmed: true,
        source: 'user_explicit',
      };
      updatePreferencesState((prev) => [newItem, ...prev]);
      showMemoryFeedback('Preference saved');
    }

    setMemoryChatMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, proposalAccepted: true } : m))
    );

    setTimeout(() => {
      setIsMemoryChatOpen(false);
      setEditingMemory(null);
    }, 550);
  };

  return (
    <div
      ref={planScrollRef}
      className="genki-plan-screen flex-1 overflow-y-auto overflow-x-hidden px-5 pt-[8px] pb-[calc(8rem+env(safe-area-inset-bottom,0px))] flex flex-col z-10 scrollbar-none select-none"
    >
      <style>{GENKI_PLAN_UI_STYLES}</style>
      {/* Toast Notifications */}
      <AnimatePresence>
        {directionToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 bg-[#5E5BAE] text-white px-4 py-2.5 rounded-[18px] text-[13px] leading-[18px] font-semibold shadow-md flex items-center justify-between z-20 shrink-0"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Focus updated</span>
            </div>
            <span className="text-[13px] text-white/80">Saved</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dayUpdateToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 bg-[#5E5BAE] text-white px-4 py-2.5 rounded-[18px] text-[13px] leading-[18px] font-semibold shadow-md flex items-center justify-between z-20 shrink-0"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{dayUpdateToast}</span>
            </div>
            <span className="text-[13px] text-white/80">Updated</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* Centered Phase Commitment Header (Directly on Page Canvas)    */}
      {/* ============================================================ */}
      <section
        id="plan-commitment-header"
        aria-label="Phase commitment"
        data-commitment-state={
          !hasConfirmedCommitment
            ? 'unconfirmed'
            : effectiveCommitment?.status === 'completed'
            ? 'completed'
            : effectiveCommitment?.reviewRequested
            ? 'review'
            : effectiveCommitment?.lastEventKind ?? 'started'
        }
        className="genki-plan-commitment-header"
      >
        <PlanNovaGuideAvatar isActive={isActive} isShortViewport={isShortViewport} />

        <p id="plan-header-nova-line" className="genki-plan-header-nova-line">
          {headerNovaLine}
        </p>

        {hasConfirmedCommitment && (
          <>
            <p id="plan-header-intent" className="genki-plan-header-intent">
              {headerIntentText}
            </p>

            {headerStrategyText && (
              <p id="plan-header-strategy" className="genki-plan-header-strategy">
                {headerStrategyText}
              </p>
            )}
          </>
        )}

        <button
          type="button"
          id="plan-header-detail-btn"
          onClick={handleOpenFocusAdjust}
          className="genki-plan-header-detail-btn"
        >
          {headerActionLabel}
        </button>
      </section>

      {/* ============================================================ */}
      {/* Single Continuous Unified Container:                         */}
      {/* Your rhythm -> This week -> Weekly review                    */}
      {/* ============================================================ */}
      <div id="plan-unified-container" className="genki-plan-unified-container">
        {/* 1. Your rhythm (single confirmed habit rolling 7-day rhythm) */}
        <section
          id="plan-module-rhythm"
          aria-labelledby="plan-heading-rhythm"
          data-rhythm-habit-id={rhythmModel?.habitId ?? ''}
          data-rhythm-status={rhythmModel?.statusCode ?? 'unconfirmed'}
          className="flex flex-col"
        >
          <div className="genki-plan-section-header">
            <h2 id="plan-heading-rhythm" className="genki-plan-section-title">
              Your rhythm
            </h2>
            {confirmedHabits.length > 1 && (
              <button
                type="button"
                id="plan-rhythm-switch-habit-btn"
                onClick={handleCycleRhythmHabit}
                className="genki-plan-rhythm-switch-btn"
              >
                Switch habit
              </button>
            )}
          </div>

          {!rhythmModel || !activeRhythmHabit ? (
            <div id="plan-rhythm-unconfirmed" className="flex flex-col">
              <p className="genki-plan-rhythm-habit-name">
                No confirmed habit yet
              </p>
              <p className="genki-plan-rhythm-summary">
                Choose a habit to see your rolling 7-day rhythm.
              </p>
              <p className="genki-plan-rhythm-basis">
                Past Done tasks are kept separate until linked to a habit you confirm.
              </p>
              <button
                type="button"
                id="plan-rhythm-confirm-habit-btn"
                onClick={() => handleOpenHabitConfirm(null)}
                className="genki-plan-rhythm-journey-btn"
              >
                Confirm a habit
                <ChevronRight className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <p id="plan-rhythm-habit-name" className="genki-plan-rhythm-habit-name">
                {rhythmModel.habitLabel}
              </p>

              <p id="plan-rhythm-status" className="genki-plan-rhythm-status">
                {rhythmModel.statusLabel}
              </p>

              {rhythmModel.statusCode === 'unavailable' ? (
                <div
                  id="rhythm-unavailable-state"
                  className="mt-[16px] rounded-[16px] bg-[#F7F5FB]/90 border border-[#7770B6]/10 px-3.5 py-3.5 flex flex-col gap-3"
                >
                  <p className="text-[13px] font-normal leading-[19px] text-[#706A7C]">
                    We couldn’t read your recent practice records right now. Try reloading to check again.
                  </p>
                  <button
                    type="button"
                    id="rhythm-retry-btn"
                    onClick={handleRetryRhythmQuery}
                    className="genki-plan-rhythm-retry-btn"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <PlanRhythmChart model={rhythmModel} />
              )}

              <p id="plan-rhythm-summary" className="genki-plan-rhythm-summary">
                {rhythmModel.numericSummary}
              </p>

              {rhythmModel.factualBasis && (
                <p id="plan-rhythm-basis" className="genki-plan-rhythm-basis">
                  {rhythmModel.factualBasis}
                </p>
              )}

              <button
                type="button"
                id="plan-rhythm-view-journey-btn"
                onClick={() => openSecondaryModule('journey')}
                className="genki-plan-rhythm-journey-btn"
              >
                View journey
                <ChevronRight className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
              </button>
            </>
          )}
        </section>

        <div aria-hidden="true" className="genki-plan-section-divider" />

        {/* 2. This week (weekly action records with week navigation; no targets or scoring) */}
        <section
          id="plan-module-this-week"
          aria-labelledby="plan-heading-this-week"
          data-selected-week-start={selectedWeekSnapshot.weekStartKey}
          data-selected-week-offset={selectedWeekSnapshot.weekOffset}
          className="flex flex-col"
        >
          {/* 2a. Dynamic title + low-key Back to this week action on historical weeks */}
          <div className="genki-plan-section-header min-h-[28px]">
            <h2 id="plan-heading-this-week" className="genki-plan-section-title">
              {selectedWeekSnapshot.title}
            </h2>
            {!selectedWeekSnapshot.isCurrentWeek && (
              <button
                type="button"
                id="this-week-back-to-current-btn"
                onClick={handleReturnToCurrentWeek}
                className="genki-plan-week-back-btn"
              >
                Back to this week
              </button>
            )}
          </div>

          {/* 2b. Dedicated week navigation row (8px below title) */}
          <div id="this-week-nav-row" className="genki-plan-week-nav-row">
            <button
              type="button"
              id="this-week-prev-btn"
              onClick={() => handleStepSelectedWeek(-1)}
              disabled={!selectedWeekSnapshot.canGoPrevious}
              aria-label="Previous week"
              className="genki-plan-week-nav-btn"
            >
              <ChevronLeft className="w-[18px] h-[18px] stroke-[2]" />
            </button>

            <span id="this-week-date-range" className="genki-plan-week-nav-date">
              {selectedWeekSnapshot.rangeLabel}
            </span>

            <button
              type="button"
              id="this-week-next-btn"
              onClick={() => handleStepSelectedWeek(1)}
              disabled={!selectedWeekSnapshot.canGoNext}
              aria-label="Next week"
              className="genki-plan-week-nav-btn"
            >
              <ChevronRight className="w-[18px] h-[18px] stroke-[2]" />
            </button>
          </div>

          {selectedWeekSnapshot.showEarlierUnavailableNote && (
            <p
              id="this-week-coverage-note"
              className="mt-[2px] text-center text-[12px] font-normal leading-[17px] text-[#8B8498]"
            >
              Earlier records unavailable
            </p>
          )}

          {/* Synchronized weekly data block (gentle <= 160ms opacity fade, zero layout jump) */}
          <div
            key={selectedWeekSnapshot.weekStartKey}
            id="this-week-synced-body"
            className="genki-plan-week-content-fade flex flex-col"
          >
            {/* 2c. Done task count (no denominator, no target, no progress bar) */}
            <div id="this-week-summary-metric" className="mt-[12px] flex flex-col">
              <div className="genki-plan-metric-row">
                <span
                  id="this-week-completed-count"
                  data-coverage-unknown={
                    selectedWeekSnapshot.isWeekCoverageUnknown ? 'true' : 'false'
                  }
                  className={`genki-plan-metric-value ${
                    selectedWeekSnapshot.isWeekCoverageUnknown ? 'text-[#8B8498]' : ''
                  }`}
                >
                  {selectedWeekSnapshot.isWeekCoverageUnknown
                    ? '—'
                    : selectedWeekSnapshot.doneTaskCount}
                </span>
              </div>
              <p id="this-week-metric-caption" className="genki-plan-metric-caption mt-[4px]">
                {selectedWeekSnapshot.isWeekCoverageUnknown
                  ? selectedWeekSnapshot.hasLoadFailure
                    ? 'Unable to load records'
                    : 'Records unavailable'
                  : 'tasks completed'}
              </p>
            </div>

            {/* 2d. 7-day Monday-Sunday track */}
            <div
              id="this-week-seven-day-track"
              role="list"
              aria-label={`${selectedWeekSnapshot.title} daily activity`}
              className="genki-plan-week-track mt-[16px]"
            >
              {selectedWeekSnapshot.days.map((day) => (
                <div
                  key={day.dateKey}
                  role="listitem"
                  aria-label={day.ariaLabel}
                  data-date-key={day.dateKey}
                  data-day-status={day.visualState}
                  data-completed-count={day.doneTaskCount}
                  data-is-today={day.isToday ? 'true' : undefined}
                  className="genki-plan-week-day"
                >
                  <span aria-hidden="true" className="genki-plan-week-day-letter">
                    {day.weekdayLetter}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`genki-plan-week-day-num ${
                      day.isToday ? 'genki-plan-week-day-num-today' : ''
                    }`}
                  >
                    {day.dayNumber}
                  </span>
                  <span aria-hidden="true" className="genki-plan-week-day-indicator">
                    {day.visualState === 'done' ? (
                      <span className="genki-plan-week-dot genki-plan-week-dot-completed" />
                    ) : day.visualState === 'rest' ? (
                      <span className="genki-plan-week-dash-rest" />
                    ) : day.visualState === 'past' ? (
                      <span className="genki-plan-week-dot genki-plan-week-dot-past" />
                    ) : day.visualState === 'unknown' ? (
                      <span className="genki-plan-week-unknown-mark">?</span>
                    ) : (
                      <span className="genki-plan-week-dot genki-plan-week-dot-future" />
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* 2e. Specific workout types summary (max 3 rows, sorted count desc then name asc) */}
            {selectedWeekSnapshot.workoutSummary.topTypes.length > 0 ? (
              <div id="this-week-workout-types" className="mt-[16px] flex flex-col">
                {selectedWeekSnapshot.workoutSummary.topTypes.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    data-workout-type-row={row.key}
                    data-workout-count={row.count}
                    data-workout-duration={
                      row.hasCompleteDurationData && row.trustworthyDurationMinutes > 0
                        ? row.trustworthyDurationMinutes
                        : ''
                    }
                    onClick={() =>
                      setWeekActivitySheet({
                        open: true,
                        filterTypeKey: row.key,
                        expandAllTypes: false,
                      })
                    }
                    className="genki-plan-workout-row"
                  >
                    <span className="genki-plan-workout-name">{row.label}</span>
                    <span className="genki-plan-workout-stat">
                      {row.hasCompleteDurationData && row.trustworthyDurationMinutes > 0
                        ? `${row.count} · ${row.trustworthyDurationMinutes} min`
                        : `${row.count}`}
                    </span>
                  </button>
                ))}

                {selectedWeekSnapshot.workoutSummary.hasMoreTypes && (
                  <button
                    type="button"
                    id="this-week-view-all-types-btn"
                    onClick={() =>
                      setWeekActivitySheet({
                        open: true,
                        filterTypeKey: null,
                        expandAllTypes: true,
                      })
                    }
                    className="genki-plan-view-all-btn"
                  >
                    View all ({selectedWeekSnapshot.workoutSummary.totalTypeCount})
                  </button>
                )}
              </div>
            ) : !selectedWeekSnapshot.isWeekCoverageUnknown ? (
              <p
                id="this-week-no-workouts"
                className="mt-[16px] text-[14px] font-normal leading-[20px] text-[#8B8498]"
              >
                {selectedWeekSnapshot.isCurrentWeek
                  ? 'No workouts recorded yet.'
                  : 'No workouts recorded.'}
              </p>
            ) : null}

            {/* 2f. View activity detail entry (preserves selected week on return) */}
            <div className="mt-[8px] flex items-center justify-end">
              <button
                type="button"
                id="this-week-view-activity-btn"
                onClick={() =>
                  setWeekActivitySheet({
                    open: true,
                    filterTypeKey: null,
                    expandAllTypes: false,
                  })
                }
                className="genki-plan-text-action"
              >
                View activity
              </button>
            </div>
          </div>
        </section>

        <div aria-hidden="true" className="genki-plan-section-divider" />

        {/* 3. Weekly review (Stage 6: No 4-week bar chart; strictly completed week) */}
        <section
          id="plan-module-weekly-review"
          data-review-week={weeklyReviewModel.weekStartKey}
          aria-labelledby="plan-heading-weekly-review"
          className="flex flex-col"
        >
          <div className="genki-plan-section-header">
            <h2 id="plan-heading-weekly-review" className="genki-plan-section-title">
              Weekly review
            </h2>
            {weeklyReviewModel.hasReviewableWeek && (
              <span id="weekly-review-date-range" className="genki-plan-section-date">
                {weeklyReviewModel.rangeLabel}
              </span>
            )}
          </div>

          {!weeklyReviewModel.hasReviewableWeek ? (
            <p
              id="weekly-review-first-week"
              className="genki-plan-review-fact mt-[12px] text-[#706A7C]"
            >
              We’ll reflect after your first week.
            </p>
          ) : (
            <>
              {/* 1. One evidence-backed fact (15px) */}
              <p id="weekly-review-fact" className="genki-plan-review-fact mt-[12px]">
                {weeklyReviewModel.factLine}
              </p>

              {/* 2. Main question (16px) & 3 options (14px, min-h 56px, radius 12px, gap 6px) */}
              <div id="weekly-review-feedback-block" className="mt-[16px] flex flex-col">
                <p id="weekly-review-question" className="genki-plan-feedback-question">
                  How did movement fit into your week?
                </p>

                <div
                  role="group"
                  aria-labelledby="weekly-review-question"
                  className="genki-plan-feedback-grid mt-[10px]"
                >
                  {WEEKLY_FIT_OPTIONS.map((opt) => {
                    const isSelected = weeklyReviewModel.fitAnswer === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        id={`weekly-review-option-${opt.value}`}
                        aria-pressed={isSelected}
                        onClick={() => triggerPrimaryFitSelect(opt.value)}
                        className="genki-plan-control genki-plan-control-feedback"
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Save error + Retry */}
                {weeklyReviewSaveError && (
                  <div
                    id="weekly-review-save-error"
                    role="alert"
                    className="mt-[10px] flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                      {weeklyReviewSaveError}
                    </span>
                    {weeklyReviewFailedAnswer && (
                      <button
                        type="button"
                        id="weekly-review-retry-btn"
                        onClick={() => triggerPrimaryFitSelect(weeklyReviewFailedAnswer)}
                        className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Saved answer confirmation + View review */}
                {weeklyReviewModel.fitAnswerLabel && !weeklyReviewSaveError && (
                  <div
                    id="weekly-review-saved-bar"
                    role="status"
                    aria-live="polite"
                    className="mt-[10px] flex flex-wrap items-center justify-between gap-2"
                  >
                    <span
                      id="weekly-review-saved-answer"
                      className="text-[13px] font-medium leading-[18px] text-[#514879]"
                    >
                      Saved: {weeklyReviewModel.fitAnswerLabel}
                    </span>
                    <button
                      type="button"
                      id="weekly-review-view-btn"
                      onClick={() => openSecondaryModule('weekly_review', 'plan')}
                      className="genki-plan-text-action"
                    >
                      View review
                    </button>
                  </div>
                )}

                {/* At most ONE follow-up question when "Hard to fit in" is selected */}
                {weeklyReviewModel.fitAnswer === 'hard_to_fit_in' && (
                  <div
                    id="weekly-review-followup-block"
                    className="mt-[12px] pt-[12px] border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
                  >
                    <p
                      id="weekly-review-followup-question"
                      className="text-[14px] font-semibold leading-[20px] text-[#302D3D]"
                    >
                      What made it hardest to fit in?
                    </p>
                    <div
                      role="group"
                      aria-labelledby="weekly-review-followup-question"
                      className="grid grid-cols-2 gap-1.5"
                    >
                      {WEEKLY_HARD_FOLLOWUP_OPTIONS.map((opt) => {
                        const active = weeklyReviewModel.followUpAnswer === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            id={`weekly-review-followup-${opt.value}`}
                            aria-pressed={active}
                            onClick={() => triggerPrimaryFollowUpSelect(opt.value)}
                            className={`genki-plan-control min-h-[48px] px-2.5 py-2 rounded-[12px] text-[13px] font-medium leading-[18px] text-center border transition-colors cursor-pointer ${
                              active
                                ? 'bg-[#E5E0F3] text-[#514879] border-[#BEB4DE]'
                                : 'bg-[#F1EFF6] text-[#615B73] border-transparent hover:bg-[#EAE6F4]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {weeklyFollowUpSaveError && (
                      <div
                        id="weekly-review-followup-error"
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                          {weeklyFollowUpSaveError}
                        </span>
                        {weeklyFollowUpFailedAnswer && (
                          <button
                            type="button"
                            id="weekly-review-followup-retry-btn"
                            onClick={() => triggerPrimaryFollowUpSelect(weeklyFollowUpFailedAnswer)}
                            className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Room for more: records willingness ONLY (never pushes volume increase) */}
                {weeklyReviewModel.fitAnswer === 'room_for_more' && (
                  <p
                    id="weekly-review-room-note"
                    className="mt-[8px] text-[13px] font-normal leading-[18px] text-[#706A7C]"
                  >
                    Willingness noted — your plan stays unchanged unless you choose to edit it.
                  </p>
                )}

                {/* Pending suggestion (strictly separated from Saved answer & Confirmed decisions) */}
                {weeklyReviewModel.pendingSuggestion &&
                  weeklyReviewModel.pendingSuggestion.decisionStatus === 'pending' && (
                    <div
                      id="weekly-review-pending-suggestion"
                      data-suggestion-id={weeklyReviewModel.pendingSuggestion.suggestionId}
                      className="mt-[12px] rounded-[16px] bg-[#F7F5FB] border border-[#7770B6]/12 p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-medium leading-[16px] text-[#5E5BAE]">
                          Suggested adjustment
                        </span>
                        <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
                          {weeklyReviewModel.pendingSuggestion.title}
                        </span>
                        <p className="text-[13px] font-normal leading-[18px] text-[#524C63]">
                          {weeklyReviewModel.pendingSuggestion.basis}
                        </p>
                      </div>

                      {!weeklyPrimaryConfirming ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            id="weekly-review-suggestion-review-btn"
                            onClick={() => {
                              setWeeklyPrimaryAfterDraft(
                                weeklyReviewModel.pendingSuggestion?.suggestedFieldValue ??
                                  weeklyReviewModel.pendingSuggestion?.afterLabel ??
                                  ''
                              );
                              setWeeklyPrimarySuggestionError(null);
                              setWeeklyPrimaryConfirming(true);
                            }}
                            className="genki-plan-control min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold cursor-pointer"
                          >
                            {weeklyReviewModel.pendingSuggestion.primaryCtaLabel}
                          </button>
                          <button
                            type="button"
                            id="weekly-review-suggestion-dismiss-btn"
                            onClick={triggerPrimaryDismissSuggestion}
                            className="genki-plan-control min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-[#524C63] text-[14px] font-medium hover:bg-[#F3F1F8] cursor-pointer"
                          >
                            {weeklyReviewModel.pendingSuggestion.secondaryCtaLabel}
                          </button>
                        </div>
                      ) : (
                        <div
                          id="weekly-review-primary-diff-box"
                          className="rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] p-3 flex flex-col gap-2.5"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[12px] font-medium text-[#706A7C]">Before</span>
                            <span
                              id="weekly-review-primary-diff-before"
                              className="text-[14px] font-normal leading-[20px] text-[#524C63] break-words"
                            >
                              {weeklyReviewModel.pendingSuggestion.beforeLabel}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-[#5E5BAE]">After</span>
                            {weeklyReviewModel.pendingSuggestion.kind === 'make_smaller' ||
                            weeklyReviewModel.pendingSuggestion.kind === 'shift_cue' ||
                            weeklyReviewModel.pendingSuggestion.kind === 'add_alternative' ? (
                              <input
                                id="weekly-review-primary-diff-after-input"
                                type="text"
                                value={weeklyPrimaryAfterDraft}
                                onChange={(e) => {
                                  setWeeklyPrimaryAfterDraft(e.target.value);
                                  setWeeklyPrimarySuggestionError(null);
                                }}
                                aria-label="Updated plan setting"
                                className="w-full min-h-[44px] px-3 py-2 rounded-[10px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[14px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                              />
                            ) : (
                              <span
                                id="weekly-review-primary-diff-after"
                                className="text-[14px] font-medium leading-[20px] text-[#302D3D]"
                              >
                                {weeklyReviewModel.pendingSuggestion.afterLabel}
                              </span>
                            )}
                          </div>

                          {weeklyPrimarySuggestionError && (
                            <div
                              id="weekly-review-primary-suggestion-error"
                              role="alert"
                              className="flex flex-wrap items-center justify-between gap-2"
                            >
                              <span className="text-[13px] font-medium text-[#B42318]">
                                {weeklyPrimarySuggestionError}
                              </span>
                              {weeklyPrimaryFailedAction && (
                                <button
                                  type="button"
                                  id="weekly-review-primary-suggestion-retry-btn"
                                  onClick={() =>
                                    weeklyPrimaryFailedAction === 'confirm'
                                      ? triggerPrimaryConfirmSuggestion()
                                      : triggerPrimaryDismissSuggestion()
                                  }
                                  className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                                >
                                  Retry
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              id="weekly-review-primary-confirm-btn"
                              onClick={triggerPrimaryConfirmSuggestion}
                              className="genki-plan-control flex-1 min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold cursor-pointer"
                            >
                              {weeklyReviewModel.pendingSuggestion.kind === 'keep_rhythm'
                                ? 'Confirm keeping rhythm'
                                : 'Confirm update'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setWeeklyPrimaryConfirming(false);
                                setWeeklyPrimarySuggestionError(null);
                              }}
                              className="genki-plan-control min-h-[44px] px-3 rounded-[12px] text-[14px] font-medium text-[#625A76] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                {/* Confirmed decisions (immutable audit summary separated from Saved answer) */}
                {weeklyReviewModel.confirmedDecisions.length > 0 && (
                  <div
                    id="weekly-review-confirmed-summary"
                    className="mt-[10px] rounded-[12px] bg-[#F7F5FB] px-3 py-2 flex flex-col gap-0.5"
                  >
                    <span className="text-[12px] font-medium leading-[16px] text-[#706A7C]">
                      Confirmed decision
                    </span>
                    <span className="text-[13px] font-semibold leading-[18px] text-[#514879]">
                      {
                        weeklyReviewModel.confirmedDecisions[
                          weeklyReviewModel.confirmedDecisions.length - 1
                        ].summary
                      }
                    </span>
                  </div>
                )}

                {/* When no answer is saved yet, still offer a quiet View review entry */}
                {!weeklyReviewModel.fitAnswerLabel && (
                  <div className="mt-[6px] flex items-center justify-end">
                    <button
                      type="button"
                      id="weekly-review-view-btn"
                      onClick={() => openSecondaryModule('weekly_review', 'plan')}
                      className="genki-plan-text-action"
                    >
                      View review
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* 4. Bottom Auxiliary Entries: History, Preferences, Health data */}
      {/* ============================================================ */}
      <section
        id="plan-auxiliary-entries"
        aria-label="Additional plan sections"
        className="genki-plan-auxiliary-list mt-[20px] divide-y divide-[rgba(74,66,98,0.08)]"
      >
        <button
          type="button"
          id="plan-entry-history"
          onClick={() => openSecondaryModule('history', 'plan')}
          className="genki-plan-control genki-plan-control-base w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <span className="text-[15px] font-normal leading-[22px] text-[#1C1C1E]">
            History
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
              {MONTH_NAMES[viewMonth]}
            </span>
            <ChevronRight className="w-4 h-4 text-[#6E6E78] stroke-[2]" />
          </div>
        </button>

        <button
          type="button"
          id="plan-entry-preferences"
          onClick={() => openSecondaryModule('preferences')}
          className="genki-plan-control genki-plan-control-base w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-normal leading-[22px] text-[#1C1C1E]">
              Preferences
            </span>
            {confirmedPreferenceTags.length > 0 && (
              <span
                id="plan-entry-preferences-tags"
                className="text-[13px] font-normal leading-[18px] text-[#6E6E78] truncate"
              >
                {confirmedPreferenceTags.join(' · ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {checkMemories.length > 0 && confirmedPreferenceTags.length === 0 && (
              <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                {checkMemories.length} to confirm
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-[#6E6E78] stroke-[2]" />
          </div>
        </button>

        <button
          type="button"
          id="plan-entry-health"
          onClick={() => openSecondaryModule('health')}
          className="genki-plan-control genki-plan-control-base w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <span className="text-[15px] font-normal leading-[22px] text-[#1C1C1E]">
            Health data
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              id="plan-entry-health-status"
              className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
            >
              Not connected
            </span>
            <ChevronRight className="w-4 h-4 text-[#6E6E78] stroke-[2]" />
          </div>
        </button>
      </section>

      {/* ============================================================ */}
      {/* SECONDARY DETAIL SHEETS (Rendered via React Portal)           */}
      {/* ============================================================ */}
      {(() => {
        const sheetPortalContent = (
          <AnimatePresence>
            {selectedModule && (
              <div className="absolute inset-0 z-50 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={handleSecondarySheetBack}
                  className="absolute inset-0 bg-black/25 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                  style={
                    (selectedModule === 'journey' ||
                      selectedModule === 'weekly_review' ||
                      selectedModule === 'goal') &&
                    focusKeyboardInset > 0
                      ? { paddingBottom: `${focusKeyboardInset + 24}px` }
                      : undefined
                  }
                  className="relative w-full max-h-[90%] bg-white/95 backdrop-blur-2xl rounded-t-[32px] p-5 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl border-t border-white/90 overflow-y-auto z-10 flex flex-col gap-4 text-[#1C1C1E]"
                  id="my-plan-secondary-sheet"
                >
                  {/* Sheet Header with clear Back navigation */}
                  <div className="flex flex-col gap-1.5 pb-3 border-b border-black/[0.06] shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        id="secondary-sheet-back-btn"
                        onClick={handleSecondarySheetBack}
                        className="genki-plan-control genki-plan-control-base min-h-[44px] -ml-2 px-2 flex items-center gap-1 text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 transition-opacity cursor-pointer"
                        aria-label={
                          selectedModule === 'history' && historyReturnModule === 'journey'
                            ? 'Return to Your journey'
                            : selectedModule === 'history' && historyReturnModule === 'weekly_review'
                            ? 'Return to Weekly review'
                            : 'Return to Plan'
                        }
                      >
                        <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
                        <span>
                          {selectedModule === 'history' && historyReturnModule === 'journey'
                            ? 'Your journey'
                            : selectedModule === 'history' && historyReturnModule === 'weekly_review'
                            ? 'Weekly review'
                            : 'Plan'}
                        </span>
                      </button>

                      {selectedModule === 'preferences' && (
                        <button
                          type="button"
                          onClick={() => setIsMemoryInfoModalOpen(true)}
                          className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#5E5BAE] transition-colors cursor-pointer"
                          aria-label="How preferences work"
                        >
                          <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                        </button>
                      )}
                    </div>

                    <div>
                      <h3 className="genki-plan-sheet-heading text-[22px] font-semibold leading-[28px] text-[#1C1C1E] tracking-[-0.02em]">
                        {selectedModule === 'journey' && 'Your journey'}
                        {selectedModule === 'weekly_review' && 'Weekly review'}
                        {selectedModule === 'goal' &&
                          (goalSheetActiveMode === 'adjust'
                            ? 'Adjust goal'
                            : goalSheetActiveMode === 'review'
                            ? 'Review goal'
                            : goalSheetActiveMode === 'confirm_completion'
                            ? 'Mark this goal complete?'
                            : effectiveCommitment?.status === 'completed'
                            ? 'Review together'
                            : 'About this goal')}
                        {selectedModule === 'history' && 'History'}
                        {selectedModule === 'preferences' && 'Preferences'}
                        {selectedModule === 'health' && 'Health data'}
                      </h3>
                      {selectedModule !== 'journey' && selectedModule !== 'goal' && (
                        <p className="text-[13px] leading-[18px] text-[#6E6E78] mt-0.5 tabular-nums">
                          {selectedModule === 'weekly_review' && weeklyReviewModel.rangeLabel}
                          {selectedModule === 'history' && 'Activity calendar, 6-month trend & detailed stats'}
                          {selectedModule === 'preferences' && 'Saved preferences and pending questions'}
                          {selectedModule === 'health' && 'Wearable & Apple Health connection status'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 0: YOUR JOURNEY (Full Stage 5 Detail)    */}
                  {/* ======================================================= */}
                  {selectedModule === 'journey' && (
                    activeRhythmHabit ? (
                      <YourJourneyView
                        store={effectivePlanStore}
                        habit={activeRhythmHabit}
                        confirmedHabitCount={confirmedHabits.length}
                        referenceDate={referenceTodayDate}
                        sharedWeeklyProposal={null}
                        sharedWeeklyExperiment={weeklyReviewModel.pendingSuggestion}
                        resolvedAdjustmentKeys={resolvedAdjustmentKeys}
                        onEditHabit={(h) => handleOpenHabitConfirm(h)}
                        onSwitchHabit={handleCycleRhythmHabit}
                        onRetryQuery={handleRetryRhythmQuery}
                        onOpenHistoryFromJourney={() => openSecondaryModule('history', 'journey')}
                        onSaveFeelingCheckIn={handleJourneySaveFeelingCheckIn}
                        onHideStatusConclusion={handleJourneyHideStatusConclusion}
                        onShowStatusConclusion={handleJourneyShowStatusConclusion}
                        onConfirmNextStep={handleJourneyConfirmNextStep}
                        onDismissNextStep={handleJourneyDismissNextStep}
                      />
                    ) : (
                      <div id="view-journey-secondary-page" className="flex flex-col gap-3">
                        <p className="text-[15px] leading-[22px] text-[#625A76]">
                          Confirm a habit first to follow your rhythm and journey here.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            closeSecondaryModuleToPlan();
                            handleOpenHabitConfirm(null);
                          }}
                          className="genki-plan-control genki-plan-control-primary self-start min-h-[48px] px-5 rounded-[12px] bg-[#5E5BAE] text-white text-[15px] font-semibold cursor-pointer"
                        >
                          Confirm a habit
                        </button>
                      </div>
                    )
                  )}

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 0B: WEEKLY REVIEW DETAIL (Stage 6)       */}
                  {/* ======================================================= */}
                  {selectedModule === 'weekly_review' && (
                    <WeeklyReviewDetailView
                      model={weeklyReviewModel}
                      habit={activeRhythmHabit}
                      onSelectFitAnswer={handleWeeklyFitSelect}
                      onSelectFollowUp={handleWeeklyFollowUpSelect}
                      onConfirmSuggestion={handleWeeklyConfirmSuggestion}
                      onDismissSuggestion={handleWeeklyDismissSuggestion}
                      onSelectStartingFeel={handleWeeklyStartingFeelSelect}
                      onSaveSelfReport={handleWeeklySelfReportSave}
                      onOpenHistory={() => openSecondaryModule('history', 'weekly_review')}
                    />
                  )}

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 0C: ABOUT THIS GOAL / REVIEW TOGETHER    */}
                  {/* ======================================================= */}
                  {selectedModule === 'goal' && effectiveCommitment && (
                    <GoalDetailView
                      store={effectivePlanStore}
                      commitment={effectiveCommitment}
                      activeHabit={activeRhythmHabit}
                      referenceDate={referenceTodayDate}
                      initialMode={goalSheetInitialMode}
                      onModeChange={setGoalSheetActiveMode}
                      onAdjustGoal={handleGoalAdjust}
                      onKeepExploring={handleGoalKeepExploring}
                      onConfirmCompletion={handleGoalConfirmCompletion}
                      onApplyNextStep={handleGoalApplyNextStep}
                    />
                  )}

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 1: HISTORY (Activity Calendar + 6-Month Trend + Detailed Stats) */}
                  {/* ======================================================= */}
                  {selectedModule === 'history' && (
                    <div className="flex flex-col gap-4 text-[13px] leading-[18px] text-[#3C3C43]">
                      {/* Activity Monthly Calendar */}
                      <div
                        id="history-calendar-card"
                        className="py-4 px-3 rounded-[24px] bg-white border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPickerYear(viewYear);
                              setIsMonthPickerOpen(true);
                            }}
                            className="genki-plan-control genki-plan-control-base min-h-[44px] flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1C1E] bg-[#F2F2F7] hover:bg-[#E5E5EA] active:scale-95 px-3.5 py-2 rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0"
                            aria-label="Select month"
                          >
                            <CalendarIcon className="w-4 h-4 text-[#5E5BAE]" />
                            <span>
                              {isCurrentMonth ? MONTH_NAMES[viewMonth] : SHORT_MONTH_NAMES[viewMonth]} {viewYear}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 text-[#5E5BAE] opacity-85 shrink-0" />
                          </button>

                          {!isCurrentMonth && (
                            <button
                              type="button"
                              id="activity-this-month-btn"
                              onClick={handleJumpToThisMonth}
                              className="genki-plan-control genki-plan-control-base min-h-[44px] flex items-center gap-1.5 text-[13px] font-semibold text-[#5E5BAE] bg-[#5E5BAE]/10 hover:bg-[#5E5BAE]/18 active:scale-95 px-3.5 py-2 rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0"
                              aria-label="Return to this month"
                            >
                              <RotateCcw className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>This month</span>
                            </button>
                          )}
                        </div>

                        {/* Weekday indicators */}
                        <div className="grid grid-cols-7 gap-x-0 text-center select-none pt-0.5">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayInitial, idx) => (
                            <span key={idx} className="text-[13px] font-semibold text-[#6E6E78] uppercase tracking-wider">
                              {dayInitial}
                            </span>
                          ))}
                        </div>

                        {/* Monthly Calendar Grid (7 equal columns, >= 44x44px touch targets) */}
                        <div className="relative select-none overflow-hidden touch-pan-y">
                          <motion.div
                            key={`${viewYear}-${viewMonth}`}
                            initial={{ opacity: 0, x: slideDirection * 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.15}
                            onDragEnd={(_, info) => {
                              if (info.offset.x > 40) handlePrevMonth();
                              else if (info.offset.x < -40) handleNextMonth();
                            }}
                            className="grid grid-cols-7 gap-x-0 gap-y-0.5 cursor-grab active:cursor-grabbing py-1"
                          >
                            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                              <div key={`empty-prefix-${idx}`} className="w-full min-h-[44px]" />
                            ))}

                            {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map((dayNum) => {
                              const dStr = formatDateKey(viewYear, viewMonth, dayNum);
                              const record = effectiveActivityLogs[dStr];
                              const isToday =
                                viewYear === deviceToday.year &&
                                viewMonth === deviceToday.month &&
                                dayNum === deviceToday.day;
                              const isFuture =
                                viewYear > deviceToday.year ||
                                (viewYear === deviceToday.year && viewMonth > deviceToday.month) ||
                                (viewYear === deviceToday.year &&
                                  viewMonth === deviceToday.month &&
                                  dayNum > deviceToday.day);

                              const tileClasses =
                                record?.type === 'active'
                                  ? 'bg-[#5E5BAE] text-[#FFFFFF] shadow-[0_2px_6px_rgba(94,91,174,0.22)] group-hover:brightness-105'
                                  : record?.type === 'rest'
                                  ? 'bg-[#E59980] text-[#3A2D29] shadow-[0_2px_6px_rgba(229,153,128,0.22)] group-hover:brightness-105'
                                  : isFuture
                                  ? 'bg-[#F2F2F7]/70 text-[#8E8E93] border border-dashed border-[#D1D1D6] group-hover:bg-[#E5E5EA]'
                                  : 'bg-[#F2F2F7] text-[#6E6E78] group-hover:bg-[#E5E5EA]';

                              return (
                                <button
                                  type="button"
                                  key={dStr}
                                  data-calendar-date={dStr}
                                  onClick={() => handleOpenDayDetail(dStr)}
                                  aria-label={`${dStr}: ${record?.type || 'no record'}`}
                                  aria-current={isToday ? 'date' : undefined}
                                  className="genki-plan-control genki-plan-control-base w-full min-h-[44px] flex items-center justify-center rounded-[10px] cursor-pointer group active:scale-92 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E5BAE]/50"
                                >
                                  <span
                                    className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[13px] font-medium leading-[18px] tabular-nums transition-colors duration-150 ${
                                      isToday ? 'ring-2 ring-[#5E5BAE] ring-offset-2 ring-offset-white' : ''
                                    } ${tileClasses}`}
                                  >
                                    {dayNum}
                                  </span>
                                </button>
                              );
                            })}
                          </motion.div>
                        </div>

                        {/* Status Legend & Unified History Source Note */}
                        <div className="pt-2.5 border-t border-black/[0.05] flex flex-col gap-1.5 text-[13px] leading-[18px] text-[#6E6E78]">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-[4px] bg-[#5E5BAE]" />
                              <span className="text-[#1C1C1E] font-medium">Active</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-[4px] bg-[#E59980]" />
                              <span className="text-[#1C1C1E] font-medium">Rest</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-[4px] bg-[#E5E5EA]" />
                              <span>No record</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 6-Month Trend */}
                      <div
                        id="history-trend-chart-card"
                        className="bg-white p-4 rounded-[24px] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-2"
                      >
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4 text-[#5E5BAE]" />
                            <span className="font-semibold text-[#1C1C1E] text-[15px] leading-[21px]">
                              Monthly active days
                            </span>
                          </div>
                          <span className="text-[13px] text-[#6E6E78] shrink-0">
                            {monthlyTrendSeries[0]?.month}–{monthlyTrendSeries[monthlyTrendSeries.length - 1]?.month} {viewYear} · Unit: days (d)
                          </span>
                        </div>
                        <p className="text-[13px] leading-[18px] text-[#6E6E78]">
                          Days with at least one recorded activity per month across the past 6 months.
                        </p>

                        <MonthlyTrendCurve series={monthlyTrendSeries} compact={false} />
                      </div>

                      {/* Detailed Stats Range Toggle */}
                      <div className="flex items-center justify-between bg-[#F2F2F7]/80 p-1 rounded-full border border-black/[0.04]">
                        <span className="text-[13px] leading-[18px] font-semibold text-[#1C1C1E] pl-3">
                          {currentRecentData.rangeLabel}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRhythmFilter('7d')}
                            className={`genki-plan-control genki-plan-control-base min-h-[44px] px-4 rounded-full text-[13px] leading-[18px] font-semibold transition-all cursor-pointer ${
                              rhythmFilter === '7d'
                                ? 'bg-white text-[#1C1C1E] shadow-2xs'
                                : 'text-[#6E6E78] hover:text-[#1C1C1E]'
                            }`}
                          >
                            7 days
                          </button>
                          <button
                            type="button"
                            onClick={() => setRhythmFilter('month')}
                            className={`genki-plan-control genki-plan-control-base min-h-[44px] px-4 rounded-full text-[13px] leading-[18px] font-semibold transition-all cursor-pointer ${
                              rhythmFilter === 'month'
                                ? 'bg-white text-[#1C1C1E] shadow-2xs'
                                : 'text-[#6E6E78] hover:text-[#1C1C1E]'
                            }`}
                          >
                            Month
                          </button>
                        </div>
                      </div>

                      <div className="bg-[#F4EEFE]/75 p-4 rounded-[20px] border border-[#5E5BAE]/15 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 text-[13px] leading-[18px] font-bold text-[#5E5BAE]">
                          <Sparkles className="w-3.5 h-3.5 text-[#5E5BAE]" />
                          <span>Summary</span>
                        </div>
                        <p className="text-[13px] leading-[19px] text-[#1C1C1E]">
                          “{currentRecentData.novaObservation}”
                        </p>
                      </div>

                      {/* 4 Distinct Metrics: Active Days vs Activities vs Active Time vs Rest Days */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[13px] font-medium text-[#6E6E78]">Active days</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#1C1C1E] leading-none">
                              {currentRecentData.activeDaysCount}
                            </span>
                            <span className="text-[13px] text-[#6E6E78] block mt-0.5">days</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[13px] font-medium text-[#6E6E78]">Activities</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#5E5BAE] leading-none">
                              {currentRecentData.completedCount}
                            </span>
                            <span className="text-[13px] text-[#6E6E78] block mt-0.5">sessions</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[13px] font-medium text-[#6E6E78]">Duration</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#1C1C1E] leading-none">
                              {currentRecentData.activeMinutes}
                            </span>
                            <span className="text-[13px] text-[#6E6E78] block mt-0.5">minutes</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[13px] font-medium text-[#6E6E78]">Rest days</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#E59980] leading-none">
                              {currentRecentData.restDaysCount}
                            </span>
                            <span className="text-[13px] text-[#6E6E78] block mt-0.5">rests</span>
                          </div>
                        </div>
                      </div>

                      <div
                        id="history-minutes-chart-card"
                        className="bg-white p-4 rounded-[24px] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-2"
                      >
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <BarChart2 className="w-4 h-4 text-[#5E5BAE]" />
                            <span className="font-semibold text-[#1C1C1E] text-[15px] leading-[21px]">
                              Active minutes ({rhythmFilter === '7d' ? 'by day' : 'by week'})
                            </span>
                          </div>
                          <span className="text-[13px] font-medium text-[#5E5BAE]">
                            {currentRecentData.activeMinutes} min total
                          </span>
                        </div>
                        <p className="text-[13px] leading-[18px] text-[#6E6E78]">
                          Total recorded activity duration in minutes (m). Rest days are shown separately without adding minutes.
                        </p>

                        <ActiveMinutesBarChart
                          items={currentRecentData.dailyBreakdown}
                          timeframe={rhythmFilter}
                        />

                        <div className="pt-2 border-t border-black/[0.04] flex flex-wrap items-center justify-between gap-2 text-[13px] text-[#6E6E78]">
                          <span>Purple: Active minutes (m)</span>
                          <span className="text-[#C7765C]">Peach: Rest days</span>
                        </div>
                      </div>

                      {/* Recorded Days List for Viewed Month */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#1C1C1E] text-[13px]">
                            Recorded Days ({currentMonthRecords.length})
                          </span>
                          <span className="text-[13px] text-[#6E6E78]">
                            Tap edit to modify or clear
                          </span>
                        </div>

                        {currentMonthRecords.length === 0 ? (
                          <div className="p-5 text-center rounded-[20px] bg-white border border-black/[0.04] text-[#6E6E78] shadow-2xs">
                            No activity or rest recorded yet for this month. Tap any day on the calendar grid above to log an action.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {[...currentMonthRecords]
                              .sort((a, b) => b.date.localeCompare(a.date))
                              .map((rec) => {
                                const dObj = new Date(rec.date + 'T00:00:00');
                                const isToday = rec.date === deviceToday.dateStr;
                                const dateLabel = dObj.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  weekday: 'short'
                                });
                                const sessCount = rec.sessionsCount ?? 1;

                                return (
                                  <div
                                    key={rec.date}
                                    className="p-3.5 rounded-[18px] bg-white border border-black/[0.04] shadow-[0_2px_10px_-4px_rgba(28,28,45,0.05)] flex items-center justify-between gap-3"
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      <div
                                        className={`w-3 h-3 rounded-[4px] mt-1 shrink-0 ${
                                          rec.type === 'active' ? 'bg-[#5E5BAE]' : 'bg-[#E59980]'
                                        }`}
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-semibold text-[#1C1C1E] text-[14px] leading-[20px]">
                                            {dateLabel}
                                          </span>
                                          {isToday && (
                                            <span className="text-[13px] text-[#5E5BAE] font-semibold">
                                              Today
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[13px] text-[#6E6E78] mt-0.5 truncate">
                                          {rec.type === 'active' ? (
                                            <span>
                                              {rec.title} • {sessCount}{' '}
                                              {sessCount === 1 ? 'activity' : 'activities'} •{' '}
                                              {rec.durationMinutes}m
                                            </span>
                                          ) : (
                                            <span>{rec.title || 'Mindful rest day'}</span>
                                          )}
                                        </div>
                                        {rec.note && (
                                          <div className="text-[13px] text-[#6E6E78] mt-0.5 italic truncate">
                                            “{rec.note}”
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenDayDetail(rec.date)}
                                      className="genki-plan-control genki-plan-control-base min-h-[44px] min-w-[52px] px-3 rounded-[12px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[13px] font-semibold text-[#5E5BAE] shrink-0 transition-colors cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsMethodologyOpen(true)}
                        className="genki-plan-control genki-plan-control-base w-full min-h-[44px] py-2.5 px-3 rounded-[16px] bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.04] text-[13px] font-medium text-[#6E6E78] hover:text-[#1C1C1E] flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99]"
                      >
                        <HelpCircle className="w-3.5 h-3.5 stroke-[2]" />
                        <span>Data source & calculation methodology</span>
                      </button>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 3: PREFERENCES                           */}
                  {/* ======================================================= */}
                  {selectedModule === 'preferences' && (
                    <div id="preferences-secondary-page" className="flex flex-col gap-5 text-[#1C1C1E]">
                      {/* Section 1: User-provided & confirmed preferences */}
                      <div id="preferences-confirmed-section" className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="genki-plan-subheading text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                            Your preferences
                          </h4>
                          <button
                            type="button"
                            id="preferences-add-btn"
                            onClick={handleOpenAddPreference}
                            className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 -mr-2 text-[14px] font-medium text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer"
                          >
                            Add
                          </button>
                        </div>

                        {confirmedMemories.length === 0 ? (
                          <div
                            id="preferences-confirmed-empty"
                            className="rounded-[20px] p-4 bg-[#F2F2F7]/75 border border-black/[0.04] text-[13px] leading-[18px] text-[#6E6E78]"
                          >
                            No saved preferences yet.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            {confirmedMemories.map((item) => {
                              const tagLabel = deriveShortPreferenceTag(item);
                              return (
                                <div
                                  key={item.id}
                                  data-pref-confirmed-id={item.id}
                                  className="rounded-[20px] p-4 bg-white border border-black/[0.05] shadow-[0_2px_10px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-1.5"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMemory(item)}
                                    className="genki-plan-control genki-plan-control-base w-full text-left flex flex-col gap-1 cursor-pointer"
                                  >
                                    <span className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                                      {item.title}
                                    </span>
                                    {item.summary && (
                                      <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                                        {item.summary}
                                      </p>
                                    )}
                                  </button>

                                  <div className="mt-1 pt-2 border-t border-black/[0.06] flex items-center justify-between gap-2">
                                    <span className="text-[13px] font-medium leading-[16px] text-[#6E6E78] truncate">
                                      {tagLabel}
                                    </span>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        data-pref-edit-id={item.id}
                                        onClick={(e) => handleOpenEditPreference(item, e)}
                                        className="genki-plan-control genki-plan-control-base min-h-[44px] px-2.5 text-[14px] font-medium text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent cursor-pointer"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        data-pref-delete-id={item.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMemoryToDelete(item);
                                        }}
                                        className="genki-plan-control genki-plan-control-base min-h-[44px] px-2.5 -mr-2 text-[14px] font-medium text-[#6E6E78] hover:text-[#E11D48] active:opacity-70 bg-transparent cursor-pointer"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Section 2: Nova's pending inferences (presented as questions) */}
                      <div id="preferences-pending-section" className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="genki-plan-subheading text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                            Needs confirmation
                          </h4>
                          {checkMemories.length > 0 && (
                            <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                              {checkMemories.length}
                            </span>
                          )}
                        </div>

                        {checkMemories.length === 0 ? (
                          <div
                            id="preferences-pending-empty"
                            className="rounded-[20px] p-4 bg-[#F2F2F7]/75 border border-black/[0.04] text-[13px] leading-[18px] text-[#6E6E78]"
                          >
                            No pending questions.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5">
                            {checkMemories.map((item) => (
                              <div
                                key={item.id}
                                data-pref-pending-id={item.id}
                                className="rounded-[20px] p-4 bg-[#F5F4FB] border border-[#5E5BAE]/15 flex flex-col gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedMemory(item)}
                                  className="genki-plan-control genki-plan-control-base w-full text-left flex flex-col gap-1 cursor-pointer"
                                >
                                  <span className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                                    {formatAsCheckQuestion(item.title)}
                                  </span>
                                  {item.learnedFrom && (
                                    <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                                      {item.learnedFrom}
                                    </span>
                                  )}
                                </button>

                                <div className="pt-1 flex items-center gap-2">
                                  <button
                                    type="button"
                                    data-pref-confirm-id={item.id}
                                    onClick={(e) => handleConfirmPendingMemory(item.id, e)}
                                    className="genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-3 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold transition-colors cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    data-pref-ignore-id={item.id}
                                    onClick={(e) => handleDismissPendingMemory(item.id, e)}
                                    className="genki-plan-control genki-plan-control-base min-h-[44px] px-4 rounded-[14px] bg-white hover:bg-[#F2F2F7] border border-black/[0.06] text-[#1C1C1E] text-[14px] font-medium transition-colors cursor-pointer"
                                  >
                                    Ignore
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        id="preferences-talk-nova-btn"
                        onClick={() => handleStartTalkToNovaMemory(null)}
                        className="genki-plan-control genki-plan-control-base w-full min-h-[44px] px-4 rounded-[16px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-[14px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4 text-[#5E5BAE] stroke-[2]" />
                        <span>Update in chat</span>
                      </button>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 4: HEALTH DATA (Honest Unconnected State)*/}
                  {/* ======================================================= */}
                  {selectedModule === 'health' && (
                    <div
                      id="health-data-secondary-page"
                      className="flex flex-col gap-4 text-[#1C1C1E]"
                    >
                      <div
                        id="health-data-empty-state"
                        className="p-4 rounded-[24px] bg-white border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-[12px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                            <Heart className="w-4 h-4 stroke-[2]" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="genki-plan-subheading text-[17px] font-semibold leading-[23px] text-[#1C1C1E]">
                              Apple Health is not connected
                            </h4>
                            <span className="text-[13px] leading-[18px] text-[#6E6E78]">
                              Not connected
                            </span>
                          </div>
                        </div>

                        <p className="text-[15px] font-normal leading-[22px] text-[#1C1C1E] mt-1">
                          No biometric or wearable metrics are connected. Metrics stay empty until a source is connected.
                        </p>
                        <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          You can plan your week, log activity on Today, and complete weekly reviews without connecting a wearable.
                        </p>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <span className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                          Metrics
                        </span>

                        <div className="rounded-[24px] p-4 bg-white border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col divide-y divide-black/[0.06]">
                          {HEALTH_METRICS_DEFINITIONS.map((metric) => {
                            const IconComponent = metric.icon;
                            return (
                              <div
                                key={metric.id}
                                data-health-metric={metric.id}
                                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-[10px] bg-[#F2F2F7] text-[#6E6E78] flex items-center justify-center shrink-0">
                                    <IconComponent className="w-4 h-4 stroke-[2]" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[15px] font-medium leading-[21px] text-[#1C1C1E]">
                                      {metric.name}
                                    </span>
                                    <span className="text-[13px] leading-[18px] text-[#6E6E78]">
                                      Unit: {metric.unit}
                                    </span>
                                  </div>
                                </div>

                                <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78] shrink-0">
                                  No data
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(sheetPortalContent, phoneFrameRef.current);
        }
        return sheetPortalContent;
      })()}

      {/* ============================================================ */}
      {/* SINGLE PREFERENCE DETAIL SHEET (Portal to Phone Frame)       */}
      {/* ============================================================ */}
      {(() => {
        const memoryDetailPortal = (
          <AnimatePresence>
            {selectedMemory && (
              <div className="absolute inset-0 z-55 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSelectedMemory(null)}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  className="relative w-full max-h-[82%] bg-white rounded-t-[32px] p-5 shadow-2xl border-t border-black/[0.05] overflow-y-auto z-10 flex flex-col gap-4 text-[#1C1C1E]"
                  id="memory-detail-sheet"
                >
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-black/[0.06]">
                    <div>
                      <span className="text-[13px] font-medium text-[#5E5BAE] block mb-1">
                        {selectedMemory.isConfirmed && selectedMemory.source === 'user_explicit'
                          ? 'Saved preference'
                          : 'Needs confirmation'}
                      </span>
                      <h3 className="genki-plan-sheet-heading text-[17px] font-semibold text-[#1C1C1E] leading-snug">
                        {selectedMemory.isConfirmed && selectedMemory.source === 'user_explicit'
                          ? selectedMemory.title
                          : formatAsCheckQuestion(selectedMemory.title)}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedMemory(null)}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] shrink-0 cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  {selectedMemory.summary && (
                    <p className="text-[15px] font-normal leading-[22px] text-[#1C1C1E]">
                      {selectedMemory.summary}
                    </p>
                  )}

                  {selectedMemory.learnedFrom && (
                    <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#6E6E78]">Source</span>
                      <p className="text-[13px] leading-[18px] text-[#1C1C1E]">
                        {selectedMemory.learnedFrom}
                      </p>
                    </div>
                  )}

                  {!selectedMemory.isConfirmed || selectedMemory.source !== 'user_explicit' ? (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleConfirmPendingMemory(selectedMemory.id)}
                        className="genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissPendingMemory(selectedMemory.id)}
                        className="genki-plan-control genki-plan-control-base min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-[15px] font-medium cursor-pointer transition-colors"
                      >
                        Ignore
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPreference(selectedMemory)}
                        className="genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemoryToDelete(selectedMemory)}
                        className="genki-plan-control genki-plan-control-base min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#FFE4E6]/60 text-[#E11D48] text-[15px] font-medium cursor-pointer transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(memoryDetailPortal, phoneFrameRef.current);
        }
        return memoryDetailPortal;
      })()}

      {/* ============================================================ */}
      {/* ADD / EDIT PREFERENCE BOTTOM SHEET FORM                      */}
      {/* ============================================================ */}
      {(() => {
        const isPrefSaveDisabled = !prefDraftTitle.trim();

        const prefFormPortal = (
          <AnimatePresence>
            {isPrefFormOpen && (
              <div
                style={focusKeyboardInset > 0 ? { paddingBottom: `${focusKeyboardInset}px` } : undefined}
                className="absolute inset-0 z-65 flex flex-col justify-end pointer-events-auto overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setIsPrefFormOpen(false)}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pref-form-sheet-title"
                  id="preference-edit-sheet"
                  className="relative w-full max-h-[88%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <h3
                      id="pref-form-sheet-title"
                      className="genki-plan-sheet-heading text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                    >
                      {prefFormEditingId ? 'Edit preference' : 'Add preference'}
                    </h3>

                    <button
                      type="button"
                      id="pref-form-close-btn"
                      onClick={() => setIsPrefFormOpen(false)}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <form
                    onSubmit={handleSavePreferenceForm}
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pref-input-title"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Preference
                        </label>
                        <input
                          id="pref-input-title"
                          type="text"
                          value={prefDraftTitle}
                          onChange={(e) => setPrefDraftTitle(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="e.g. Short walks after lunch"
                          className="genki-plan-field w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pref-input-tag"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Short label (optional)
                        </label>
                        <input
                          id="pref-input-tag"
                          type="text"
                          value={prefDraftTag}
                          onChange={(e) => setPrefDraftTag(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="e.g. After lunch"
                          className="genki-plan-field w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pref-input-summary"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Note (optional)
                        </label>
                        <textarea
                          id="pref-input-summary"
                          rows={2}
                          value={prefDraftSummary}
                          onChange={(e) => setPrefDraftSummary(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="Short context"
                          className="genki-plan-field w-full px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors resize-none"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="pref-form-cancel-btn"
                        onClick={() => setIsPrefFormOpen(false)}
                        className="genki-plan-control genki-plan-control-secondary min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="pref-form-save-btn"
                        disabled={isPrefSaveDisabled}
                        className={`genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold transition-colors ${
                          isPrefSaveDisabled
                            ? 'bg-[#5E5BAE]/40 text-white/80 cursor-not-allowed'
                            : 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
                        }`}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(prefFormPortal, phoneFrameRef.current);
        }
        return prefFormPortal;
      })()}

      {/* ============================================================ */}
      {/* TALK TO NOVA MEMORY CONVERSATION SHEET (Update / Add / Correct) */}
      {/* ============================================================ */}
      {(() => {
        const quickMemoryChips = editingMemory
          ? [
              'Prefer evenings after 6:30 PM instead',
              'Keep it shorter (5–10 minutes)',
              'Prefer quiet morning walks before work'
            ]
          : [
              'I prefer quiet 10-minute morning walks before work',
              'Keep movements low-impact for joint comfort',
              'I like calm screen-free wind-downs after 8:30 PM'
            ];

        const memoryChatPortal = (
          <AnimatePresence>
            {isMemoryChatOpen && (
              <div className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    setIsMemoryChatOpen(false);
                    setEditingMemory(null);
                  }}
                  className="absolute inset-0 bg-black/35 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  className="relative w-full h-[82%] bg-white/95 backdrop-blur-2xl rounded-t-[32px] shadow-2xl border-t border-black/[0.04] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                  id="memory-talk-sheet"
                >
                  <div className="px-6 pt-5 pb-3 border-b border-black/[0.05] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#E5DDFB] to-[#F3EEFE] border border-white shadow-xs overflow-hidden shrink-0 flex items-center justify-center">
                        <FurryNovaStaticAvatar size={36} className="w-full h-full" />
                      </div>
                      <div>
                        <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E] leading-tight">
                          Talk to Nova
                        </h4>
                        <span className="text-[13px] text-[#8E8E93] block">
                          {editingMemory
                            ? 'Refine memory • Confirms before saving'
                            : 'Add or update what Nova knows'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMemoryChatOpen(false);
                        setEditingMemory(null);
                      }}
                      className="genki-plan-control genki-plan-control-icon w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close conversation"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  {editingMemory && (
                    <div className="mx-6 mt-3 px-3.5 py-2 rounded-[14px] bg-[#F2F2F7]/75 border border-black/[0.04] flex items-center gap-2 text-[13px] text-[#6C6C70] shrink-0">
                      <CornerDownRight className="w-3.5 h-3.5 text-[#5E5BAE] shrink-0" />
                      <span className="truncate font-medium">{editingMemory.title}</span>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5 scrollbar-none">
                    {memoryChatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.sender === 'user' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-[20px] px-4 py-3 text-[13px] leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-[#5E5BAE] text-white rounded-br-[6px]'
                              : 'bg-[#F2F2F7]/90 text-[#1C1C1E] border border-black/[0.04] rounded-bl-[6px] shadow-2xs'
                          }`}
                        >
                          {msg.text}
                        </div>

                        {msg.proposal && (
                          <div className="mt-2.5 w-full max-w-[92%] bg-white rounded-[20px] p-4 border border-[#5E5BAE]/25 shadow-[0_4px_16px_-4px_rgba(28,28,45,0.05)] flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#5E5BAE]">
                                {msg.proposal.mode === 'update'
                                  ? 'Proposed Memory Update'
                                  : 'Proposed New Memory'}
                              </span>
                              <span className="text-[13px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full border border-black/5">
                                Needs confirmation
                              </span>
                            </div>

                            <h5 className="text-[13.5px] font-bold text-[#1C1C1E] leading-snug">
                              {msg.proposal.newTitle}
                            </h5>
                            <p className="text-[13px] text-[#6C6C70] leading-relaxed">
                              {msg.proposal.newSummary}
                            </p>

                            {msg.proposalAccepted ? (
                              <div className="py-2 px-3 rounded-[12px] bg-[#F4EEFE] text-[#5E5BAE] text-[13px] leading-[18px] font-bold flex items-center justify-center gap-1.5 border border-[#5E5BAE]/20">
                                <Check className="w-4 h-4 stroke-[2.5]" />
                                <span>Confirmed & Saved</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmMemoryProposal(msg.id)}
                                  className="genki-plan-control genki-plan-control-primary flex-1 py-2.5 px-3 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[13px] leading-[18px] font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>Confirm & Save</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsMemoryChatOpen(false);
                                    setEditingMemory(null);
                                  }}
                                  className="genki-plan-control genki-plan-control-base py-2.5 px-3 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#8E8E93] text-[13px] leading-[18px] font-semibold cursor-pointer"
                                >
                                  Keep as is
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {memoryChatMessages.length === 1 && (
                      <div className="pt-1 flex flex-col items-start gap-1.5">
                        <span className="text-[13px] text-[#8E8E93] pl-1">
                          Quick ways to {editingMemory ? 'adjust' : 'share'}:
                        </span>
                        {quickMemoryChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleSendMemoryChat(chip)}
                            className="genki-plan-control genki-plan-control-base text-left text-[13px] leading-[18px] font-semibold text-[#5E5BAE] bg-white hover:bg-[#FAFAFC] px-3.5 py-2 rounded-[16px] border border-[#5E5BAE]/20 shadow-2xs transition-all active:scale-98 cursor-pointer"
                          >
                            “{chip}”
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={memoryChatEndRef} />
                  </div>

                  <div className="p-4 bg-white/90 backdrop-blur-md border-t border-black/[0.06] flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={memoryChatInput}
                      onChange={(e) => setMemoryChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMemoryChat()}
                      placeholder="Tell Nova what feels right for you..."
                      className="genki-plan-field flex-1 bg-[#F2F2F7] px-4 py-2.5 rounded-full text-[13px] leading-[18px] text-[#1C1C1E] placeholder-[#8E8E93] border border-black/[0.06] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendMemoryChat()}
                      disabled={!memoryChatInput.trim()}
                      className={`genki-plan-control genki-plan-control-icon w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-all ${
                        memoryChatInput.trim()
                          ? 'bg-[#5E5BAE] text-white cursor-pointer shadow-xs'
                          : 'bg-black/10 text-black/30 cursor-not-allowed'
                      }`}
                      aria-label="Send message"
                    >
                      <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(memoryChatPortal, phoneFrameRef.current);
        }
        return memoryChatPortal;
      })()}

      {/* ============================================================ */}
      {/* PHASE COMMITMENT / GOAL DETAIL BOTTOM SHEET                  */}
      {/* ============================================================ */}
      {(() => {
        const isSaveDisabled = !focusDraftTitle.trim();
        const focusSheetHeading = !hasConfirmedCommitment
          ? 'Set a focus'
          : effectiveCommitment?.reviewRequested
          ? 'Review together'
          : 'About this goal';

        const focusAdjustPortal = (
          <AnimatePresence>
            {isFocusAdjustOpen && (
              <div
                style={focusKeyboardInset > 0 ? { paddingBottom: `${focusKeyboardInset}px` } : undefined}
                className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleCloseFocusAdjust}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="focus-adjust-sheet-title"
                  id="focus-adjust-sheet"
                  className="relative w-full max-h-[88%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <h3
                      id="focus-adjust-sheet-title"
                      className="genki-plan-sheet-heading text-[18px] font-semibold leading-[25px] tracking-[-0.015em] text-[#302D3D]"
                    >
                      {focusSheetHeading}
                    </h3>

                    <button
                      type="button"
                      id="focus-close-btn"
                      onClick={handleCloseFocusAdjust}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <form
                    onSubmit={handleSaveFocusAdjust}
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="focus-input-title"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#706A7C]"
                        >
                          Your focus
                        </label>
                        <input
                          id="focus-input-title"
                          type="text"
                          value={focusDraftTitle}
                          onChange={(e) => setFocusDraftTitle(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="What are you focusing on right now?"
                          className="genki-plan-field w-full min-h-[48px] px-3.5 py-2.5 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#302D3D] placeholder-[#706A7C]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="focus-input-approach"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#706A7C]"
                        >
                          Movement approach (optional)
                        </label>
                        <textarea
                          id="focus-input-approach"
                          rows={3}
                          value={focusDraftApproach}
                          onChange={(e) => setFocusDraftApproach(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="One short sentence on how you want to approach this"
                          className="genki-plan-field w-full px-3.5 py-2.5 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#302D3D] placeholder-[#706A7C]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors resize-none"
                        />
                      </div>

                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex flex-wrap items-center gap-2.5">
                      {hasConfirmedCommitment ? (
                        <button
                          type="button"
                          id="focus-keep-rhythm-btn"
                          onClick={handleKeepCurrentRhythm}
                          className="genki-plan-control genki-plan-control-secondary flex-1 min-h-[48px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors cursor-pointer"
                        >
                          Keep rhythm
                        </button>
                      ) : (
                        <button
                          type="button"
                          id="focus-cancel-btn"
                          onClick={handleCloseFocusAdjust}
                          className="genki-plan-control genki-plan-control-secondary min-h-[48px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      <button
                        type="submit"
                        id="focus-save-btn"
                        disabled={isSaveDisabled}
                        className={`genki-plan-control genki-plan-control-primary flex-1 min-h-[48px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors ${
                          isSaveDisabled
                            ? 'bg-[#5E5BAE]/40 text-white/80 cursor-not-allowed'
                            : 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
                        }`}
                      >
                        {hasConfirmedCommitment ? 'Save changes' : 'Save focus'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(focusAdjustPortal, phoneFrameRef.current);
        }
        return focusAdjustPortal;
      })()}

      {/* ============================================================ */}
      {/* THIS WEEK SETUP / ADJUST BOTTOM SHEET                        */}
      {/* ============================================================ */}
      {(() => {
        const weekCountOptions: (number | null)[] = [null, 1, 2, 3, 4, 5, 6, 7];
        const walkDurationPresets = ['10 min', '10–15 min', '15 min', '20 min', '30 min'];
        const stretchDurationPresets = ['5 min', '5–10 min', '10 min', '15 min'];

        const walkDurationOptions = walkDurationPresets.includes(weekDraft.walk.durationLabel)
          ? walkDurationPresets
          : [weekDraft.walk.durationLabel, ...walkDurationPresets];
        const stretchDurationOptions = stretchDurationPresets.includes(weekDraft.stretch.durationLabel)
          ? stretchDurationPresets
          : [weekDraft.stretch.durationLabel, ...stretchDurationPresets];

        const weekAdjustPortal = (
          <AnimatePresence>
            {isWeekAdjustOpen && (
              <div className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleCloseWeekAdjust}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="this-week-sheet-title"
                  id="this-week-adjust-sheet"
                  style={{
                    paddingBottom:
                      focusKeyboardInset > 0
                        ? `${focusKeyboardInset}px`
                        : 'env(safe-area-inset-bottom, 0px)',
                  }}
                  className="relative w-full max-h-[88%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <div>
                      <h3
                        id="this-week-sheet-title"
                        className="genki-plan-sheet-heading text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                      >
                        {editingWeekTarget === 'next_week' ? 'Next week' : 'This week'}
                      </h3>
                      <p
                        id="this-week-sheet-date-range"
                        className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                      >
                        {editingWeekTarget === 'next_week'
                          ? nextWeekBounds.rangeLabel
                          : currentWeekBounds.rangeLabel}
                      </p>
                    </div>

                    <button
                      type="button"
                      id="this-week-close-btn"
                      onClick={handleCloseWeekAdjust}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <form
                    onSubmit={handleSaveWeekAdjust}
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-5">
                      {/* Walk configuration */}
                      <div id="week-draft-walk" className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-[10px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                            <Footprints className="w-4 h-4 stroke-[2]" />
                          </div>
                          <span className="text-[17px] font-semibold leading-[23px] text-[#1C1C1E]">
                            Walk
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span
                            id="week-draft-walk-sessions-label"
                            className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                          >
                            {editingWeekTarget === 'next_week'
                              ? 'Sessions next week'
                              : 'Sessions this week'}
                          </span>
                          <div className="grid grid-cols-4 gap-2">
                            {weekCountOptions.map((opt) => {
                              const isSelected = weekDraft.walk.targetCount === opt;
                              return (
                                <button
                                  key={opt === null ? 'flex' : opt}
                                  type="button"
                                  data-week-walk-count={opt === null ? 'flexible' : String(opt)}
                                  onClick={() =>
                                    setWeekDraft((prev) => ({
                                      ...prev,
                                      walk: { ...prev.walk, targetCount: opt },
                                    }))
                                  }
                                  className={`genki-plan-control genki-plan-control-base min-h-[44px] px-2 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#5E5BAE] border-[#5E5BAE] text-white'
                                      : 'bg-[#F2F2F7] border-black/[0.05] text-[#1C1C1E] hover:bg-[#E5E5EA]'
                                  }`}
                                >
                                  {opt === null ? 'Flexible' : `${opt}×`}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-medium leading-[18px] text-[#6E6E78]">
                            Session duration
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {walkDurationOptions.map((dur) => {
                              const isSelected = weekDraft.walk.durationLabel === dur;
                              return (
                                <button
                                  key={dur}
                                  type="button"
                                  data-week-walk-duration={dur}
                                  onClick={() =>
                                    setWeekDraft((prev) => ({
                                      ...prev,
                                      walk: { ...prev.walk, durationLabel: dur },
                                    }))
                                  }
                                  className={`genki-plan-control genki-plan-control-base min-h-[44px] px-3.5 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#5E5BAE] border-[#5E5BAE] text-white'
                                      : 'bg-[#F2F2F7] border-black/[0.05] text-[#1C1C1E] hover:bg-[#E5E5EA]'
                                  }`}
                                >
                                  {dur}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-black/[0.06]" />

                      {/* Stretch configuration */}
                      <div id="week-draft-stretch" className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-[10px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 stroke-[2]" />
                          </div>
                          <span className="text-[17px] font-semibold leading-[23px] text-[#1C1C1E]">
                            Stretch
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span
                            id="week-draft-stretch-sessions-label"
                            className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                          >
                            {editingWeekTarget === 'next_week'
                              ? 'Sessions next week'
                              : 'Sessions this week'}
                          </span>
                          <div className="grid grid-cols-4 gap-2">
                            {weekCountOptions.map((opt) => {
                              const isSelected = weekDraft.stretch.targetCount === opt;
                              return (
                                <button
                                  key={opt === null ? 'flex' : opt}
                                  type="button"
                                  data-week-stretch-count={opt === null ? 'flexible' : String(opt)}
                                  onClick={() =>
                                    setWeekDraft((prev) => ({
                                      ...prev,
                                      stretch: { ...prev.stretch, targetCount: opt },
                                    }))
                                  }
                                  className={`genki-plan-control genki-plan-control-base min-h-[44px] px-2 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#5E5BAE] border-[#5E5BAE] text-white'
                                      : 'bg-[#F2F2F7] border-black/[0.05] text-[#1C1C1E] hover:bg-[#E5E5EA]'
                                  }`}
                                >
                                  {opt === null ? 'Flexible' : `${opt}×`}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <span className="text-[13px] font-medium leading-[18px] text-[#6E6E78]">
                            Session duration
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {stretchDurationOptions.map((dur) => {
                              const isSelected = weekDraft.stretch.durationLabel === dur;
                              return (
                                <button
                                  key={dur}
                                  type="button"
                                  data-week-stretch-duration={dur}
                                  onClick={() =>
                                    setWeekDraft((prev) => ({
                                      ...prev,
                                      stretch: { ...prev.stretch, durationLabel: dur },
                                    }))
                                  }
                                  className={`genki-plan-control genki-plan-control-base min-h-[44px] px-3.5 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
                                    isSelected
                                      ? 'bg-[#5E5BAE] border-[#5E5BAE] text-white'
                                      : 'bg-[#F2F2F7] border-black/[0.05] text-[#1C1C1E] hover:bg-[#E5E5EA]'
                                  }`}
                                >
                                  {dur}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-black/[0.06]" />

                      {/* Rest remains As needed (no completion quota) */}
                      <div
                        id="week-draft-rest"
                        className="rounded-[16px] p-3.5 bg-[#F2F2F7] border border-black/[0.04] flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-[10px] bg-white text-[#5E5BAE] flex items-center justify-center shrink-0">
                          <Moon className="w-4 h-4 stroke-[2]" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                              Rest
                            </span>
                            <span className="text-[13px] font-medium leading-[18px] text-[#5E5BAE]">
                              As needed
                            </span>
                          </div>
                          <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                            Rest is always welcome whenever you need it—no weekly target required.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="this-week-cancel-btn"
                        onClick={handleCloseWeekAdjust}
                        className="genki-plan-control genki-plan-control-secondary min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="this-week-save-btn"
                        className="genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold bg-[#5E5BAE] hover:bg-[#524FA0] text-white transition-colors cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(weekAdjustPortal, phoneFrameRef.current);
        }
        return weekAdjustPortal;
      })()}

      {/* ============================================================ */}
      {/* SELECTED WEEK ACTIVITY DETAIL SHEET (VIEW ACTIVITY / ALL)    */}
      {/* ============================================================ */}
      {(() => {
        const activeFilterKey = weekActivitySheet.filterTypeKey;
        const allWorkoutTypes = selectedWeekSnapshot.workoutSummary.allTypes;
        const matchedFilterType = activeFilterKey
          ? allWorkoutTypes.find((t) => t.key === activeFilterKey) ?? null
          : null;

        const filteredActivityItems = activeFilterKey
          ? selectedWeekSnapshot.activityItems.filter((item) =>
              item.workoutTypeKeys.includes(activeFilterKey)
            )
          : selectedWeekSnapshot.activityItems;

        const sheetTitle = matchedFilterType
          ? matchedFilterType.label
          : weekActivitySheet.expandAllTypes
          ? 'All workouts'
          : `${selectedWeekSnapshot.title} activity`;

        const formatItemDateTime = (dateKey: string, iso: string, hasExactTime: boolean) => {
          const localDt = parseLocalDateKey(dateKey);
          const datePart = localDt
            ? `${SHORT_WEEKDAYS[localDt.getDay()]}, ${SHORT_MONTH_NAMES[localDt.getMonth()]} ${localDt.getDate()}`
            : dateKey;
          if (!hasExactTime) return datePart;
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return datePart;
          const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${datePart} · ${time}`;
        };

        const closeActivitySheet = () =>
          setWeekActivitySheet({ open: false, filterTypeKey: null, expandAllTypes: false });

        const activityListPortal = (
          <AnimatePresence>
            {weekActivitySheet.open && (
              <div className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={closeActivitySheet}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="this-week-activity-sheet-title"
                  id="this-week-activity-sheet"
                  data-week-start={selectedWeekSnapshot.weekStartKey}
                  className="relative w-full max-h-[84%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                      <h3
                        id="this-week-activity-sheet-title"
                        className="genki-plan-sheet-heading text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#302D3D] truncate"
                      >
                        {sheetTitle}
                      </h3>
                      <p
                        id="this-week-activity-sheet-range"
                        className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums"
                      >
                        {selectedWeekSnapshot.rangeLabel}
                      </p>
                    </div>

                    <button
                      type="button"
                      id="this-week-activity-close-btn"
                      onClick={closeActivitySheet}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
                    {/* Full workout type summary (shown in View all or when multiple types exist) */}
                    {allWorkoutTypes.length > 0 && (
                      <div id="this-week-sheet-type-summary" className="flex flex-col">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#8B8498]">
                            Workout types ({allWorkoutTypes.length})
                          </span>
                          {activeFilterKey && (
                            <button
                              type="button"
                              id="this-week-sheet-clear-filter-btn"
                              onClick={() =>
                                setWeekActivitySheet((prev) => ({
                                  ...prev,
                                  filterTypeKey: null,
                                }))
                              }
                              className="min-h-[32px] px-1 text-[13px] font-medium text-[#5E5BAE] hover:text-[#4B4895] cursor-pointer"
                            >
                              Show all
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col divide-y divide-black/[0.06] border-y border-black/[0.06]">
                          {allWorkoutTypes.map((row) => {
                            const isSelected = activeFilterKey === row.key;
                            return (
                              <button
                                key={row.key}
                                type="button"
                                data-sheet-workout-type={row.key}
                                aria-pressed={isSelected}
                                onClick={() =>
                                  setWeekActivitySheet((prev) => ({
                                    ...prev,
                                    filterTypeKey: prev.filterTypeKey === row.key ? null : row.key,
                                  }))
                                }
                                className={`min-h-[44px] py-2 px-1.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                                  isSelected ? 'bg-[#F3F0FA] rounded-[8px]' : ''
                                }`}
                              >
                                <span
                                  className={`text-[15px] leading-[22px] truncate ${
                                    isSelected
                                      ? 'font-semibold text-[#514879]'
                                      : 'font-medium text-[#302D3D]'
                                  }`}
                                >
                                  {row.label}
                                </span>
                                <span className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums whitespace-nowrap shrink-0">
                                  {row.hasCompleteDurationData && row.trustworthyDurationMinutes > 0
                                    ? `${row.count} · ${row.trustworthyDurationMinutes} min`
                                    : `${row.count}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Chronological activity records for the selected week */}
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#8B8498] mb-1">
                        Records
                      </span>

                      {selectedWeekSnapshot.isWeekCoverageUnknown &&
                      filteredActivityItems.length === 0 ? (
                        <div className="py-3 flex flex-col gap-1">
                          <p
                            id="this-week-activity-empty"
                            className="text-[15px] font-normal leading-[22px] text-[#302D3D]"
                          >
                            {selectedWeekSnapshot.hasLoadFailure
                              ? 'Unable to load records for this week.'
                              : 'Earlier records are unavailable for this week.'}
                          </p>
                        </div>
                      ) : filteredActivityItems.length === 0 ? (
                        <div className="py-3 flex flex-col gap-1">
                          <p
                            id="this-week-activity-empty"
                            className="text-[15px] font-normal leading-[22px] text-[#302D3D]"
                          >
                            Nothing recorded for this week.
                          </p>
                          <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                            Completed tasks, logged workouts, and rest days will show here.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col divide-y divide-black/[0.06] -my-1">
                          {filteredActivityItems.map((item) => (
                            <div
                              key={item.id}
                              data-week-activity-item={item.id}
                              data-week-activity-kind={item.kind}
                              className="min-h-[60px] py-3 flex items-center justify-between gap-3"
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="text-[15px] font-medium leading-[21px] text-[#302D3D] truncate">
                                  {item.title}
                                </span>
                                <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                                  {formatItemDateTime(
                                    item.dateKey,
                                    item.occurredAt,
                                    item.hasExactTimestamp
                                  )}
                                  {' · '}
                                  {item.sourceLabel}
                                </span>
                                {item.workoutTypeLabels.length > 0 && (
                                  <span className="text-[12px] font-normal leading-[17px] text-[#8B8498] mt-0.5 truncate">
                                    {item.workoutTypeLabels.join(' · ')}
                                  </span>
                                )}
                              </div>
                              {item.trustworthyDurationMinutes !== null && (
                                <span className="text-[13px] font-medium leading-[18px] text-[#5E5BAE] tabular-nums whitespace-nowrap shrink-0">
                                  {item.trustworthyDurationMinutes} min
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white">
                    <button
                      type="button"
                      id="this-week-sheet-done-btn"
                      onClick={closeActivitySheet}
                      className="genki-plan-control genki-plan-control-primary w-full min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(activityListPortal, phoneFrameRef.current);
        }
        return activityListPortal;
      })()}

      {/* ============================================================ */}
      {/* CONFIRM / EDIT HABIT BOTTOM SHEET (For Your rhythm)          */}
      {/* ============================================================ */}
      {(() => {
        const isHabitSaveDisabled = !habitDraftLabel.trim();

        const habitConfirmPortal = (
          <AnimatePresence>
            {isHabitConfirmOpen && (
              <div
                style={focusKeyboardInset > 0 ? { paddingBottom: `${focusKeyboardInset}px` } : undefined}
                className="absolute inset-0 z-65 flex flex-col justify-end pointer-events-auto overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleCloseHabitConfirm}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="rhythm-habit-confirm-title"
                  id="rhythm-habit-confirm-sheet"
                  className="relative w-full max-h-[85%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <div>
                      <h3
                        id="rhythm-habit-confirm-title"
                        className="genki-plan-sheet-heading text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                      >
                        {editingHabitId ? 'Edit habit' : 'Confirm a habit'}
                      </h3>
                      <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78] mt-0.5">
                        Your rhythm follows one confirmed habit at a time.
                      </p>
                    </div>

                    <button
                      type="button"
                      id="rhythm-habit-confirm-close-btn"
                      onClick={handleCloseHabitConfirm}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <form
                    onSubmit={handleSaveHabitConfirm}
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="rhythm-habit-label-input"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#706A7C]"
                        >
                          Habit name
                        </label>
                        <input
                          id="rhythm-habit-label-input"
                          type="text"
                          value={habitDraftLabel}
                          onChange={(e) => setHabitDraftLabel(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="e.g. Evening walk"
                          className="genki-plan-field w-full min-h-[44px] px-3.5 py-2.5 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#302D3D] placeholder-[#706A7C]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="rhythm-habit-regular-input"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#706A7C]"
                        >
                          Regular action
                        </label>
                        <input
                          id="rhythm-habit-regular-input"
                          type="text"
                          value={habitDraftRegular}
                          onChange={(e) => setHabitDraftRegular(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="e.g. 20 min outdoor walk"
                          className="genki-plan-field w-full min-h-[44px] px-3.5 py-2.5 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#302D3D] placeholder-[#706A7C]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="rhythm-habit-minimum-input"
                          className="genki-plan-label text-[13px] font-medium leading-[18px] text-[#706A7C]"
                        >
                          Minimum action (optional)
                        </label>
                        <input
                          id="rhythm-habit-minimum-input"
                          type="text"
                          value={habitDraftMinimum}
                          onChange={(e) => setHabitDraftMinimum(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="e.g. 5 min stretch or short loop"
                          className="genki-plan-field w-full min-h-[44px] px-3.5 py-2.5 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[22px] text-[#302D3D] placeholder-[#706A7C]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                        <p className="text-[12px] font-normal leading-[17px] text-[#706A7C]">
                          Regular and minimum actions count equally toward your rhythm days.
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="rhythm-habit-confirm-cancel-btn"
                        onClick={handleCloseHabitConfirm}
                        className="genki-plan-control genki-plan-control-secondary min-h-[44px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="rhythm-habit-confirm-save-btn"
                        disabled={isHabitSaveDisabled}
                        className={`genki-plan-control genki-plan-control-primary flex-1 min-h-[44px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors ${
                          isHabitSaveDisabled
                            ? 'bg-[#5E5BAE]/40 text-white/80 cursor-not-allowed'
                            : 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
                        }`}
                      >
                        {editingHabitId ? 'Save changes' : 'Confirm habit'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(habitConfirmPortal, phoneFrameRef.current);
        }
        return habitConfirmPortal;
      })()}

      {/* ============================================================ */}
      {/* DELETE MEMORY CONFIRMATION MODAL                             */}
      {/* ============================================================ */}
      {(() => {
        const deleteModalPortal = (
          <AnimatePresence>
            {memoryToDelete && (
              <div className="absolute inset-0 z-65 flex items-center justify-center p-6 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMemoryToDelete(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  className="relative bg-white/95 backdrop-blur-2xl rounded-[26px] p-5 border border-black/[0.04] shadow-2xl z-10 w-full max-w-[310px] flex flex-col gap-3.5 text-[#1C1C1E]"
                >
                  <div className="flex items-center gap-2 text-[#E11D48]">
                    <Trash2 className="w-4 h-4 stroke-[2.2]" />
                    <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E]">Delete preference?</h4>
                  </div>

                  <p className="text-[13px] text-[#6E6E78] leading-[18px]">
                    Remove <strong className="text-[#1C1C1E]">“{memoryToDelete.title}”</strong> from your saved preferences?
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      id="pref-delete-cancel-btn"
                      onClick={() => setMemoryToDelete(null)}
                      className="genki-plan-control genki-plan-control-secondary flex-1 min-h-[44px] rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[14px] font-medium text-[#1C1C1E] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="pref-delete-confirm-btn"
                      onClick={handleDeleteMemoryConfirmed}
                      className="genki-plan-control genki-plan-control-destructive flex-1 min-h-[44px] rounded-[14px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[14px] font-semibold shadow-xs cursor-pointer transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(deleteModalPortal, phoneFrameRef.current);
        }
        return deleteModalPortal;
      })()}

      {/* ============================================================ */}
      {/* HOW PREFERENCES WORK INFO MODAL                              */}
      {/* ============================================================ */}
      {(() => {
        const memoryInfoPortal = (
          <AnimatePresence>
            {isMemoryInfoModalOpen && (
              <div className="absolute inset-0 z-65 flex items-center justify-center p-6 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMemoryInfoModalOpen(false)}
                  className="absolute inset-0 bg-black/35 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  className="relative bg-white/95 backdrop-blur-2xl rounded-[24px] p-5 border border-black/[0.04] shadow-2xl z-10 w-full max-w-[320px] flex flex-col gap-3.5 text-[#1C1C1E]"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#5E5BAE]" />
                      <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E]">Preferences</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMemoryInfoModalOpen(false)}
                      className="genki-plan-control genki-plan-control-icon w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-[13px] text-[#6E6E78] leading-[18px]">
                    <p>Only preferences you add or confirm are saved.</p>
                    <p>Pending questions stay unconfirmed until you choose Confirm or Ignore.</p>
                    <p>Editing preferences does not overwrite accepted Today tasks.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMemoryInfoModalOpen(false)}
                    className="genki-plan-control genki-plan-control-primary w-full min-h-[44px] rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold shadow-2xs mt-1 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(memoryInfoPortal, phoneFrameRef.current);
        }
        return memoryInfoPortal;
      })()}

      {/* ============================================================ */}
      {/* Lightweight Methodology Modal (Inside Your Rhythm)           */}
      {/* ============================================================ */}
      {(() => {
        const infoModalContent = (
          <AnimatePresence>
            {isMethodologyOpen && (
              <div className="absolute inset-0 z-60 flex items-center justify-center p-6 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMethodologyOpen(false)}
                  className="absolute inset-0 bg-black/35 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="relative bg-white/95 backdrop-blur-2xl rounded-[24px] p-5 border border-black/[0.04] shadow-2xl z-10 w-full max-w-[320px] flex flex-col gap-3.5 text-[#1C1C1E]"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 text-[#5E5BAE]" />
                      <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E]">How it’s measured</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMethodologyOpen(false)}
                      className="genki-plan-control genki-plan-control-icon w-7 h-7 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-[13px] leading-[18px] text-[#6C6C70] leading-relaxed">
                    <div>
                      <strong className="text-[#1C1C1E] font-semibold block mb-0.5">
                        • Active days (days)
                      </strong>
                      Count of unique calendar days with at least 1 logged activity.
                    </div>

                    <div>
                      <strong className="text-[#1C1C1E] font-semibold block mb-0.5">
                        • Activities (sessions)
                      </strong>
                      Total number of completed activity sessions across those active days.
                    </div>

                    <div>
                      <strong className="text-[#1C1C1E] font-semibold block mb-0.5">
                        • Duration (minutes) & Rest days
                      </strong>
                      Cumulative minutes of completed sessions, plus logged restorative rest days.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMethodologyOpen(false)}
                    className="genki-plan-control genki-plan-control-primary w-full py-2.5 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[13px] leading-[18px] font-semibold shadow-2xs mt-1 transition-colors cursor-pointer"
                  >
                    Got it
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(infoModalContent, phoneFrameRef.current);
        }
        return infoModalContent;
      })()}

      {/* ============================================================ */}
      {/* Month Picker Modal                                           */}
      {/* ============================================================ */}
      {(() => {
        const monthPickerModalContent = (
          <AnimatePresence>
            {isMonthPickerOpen && (
              <div className="absolute inset-0 z-60 flex items-center justify-center p-5 pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMonthPickerOpen(false)}
                  className="absolute inset-0 bg-black/35 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                  className="relative bg-white/95 backdrop-blur-2xl rounded-[26px] p-5 border border-black/[0.04] shadow-2xl z-10 w-full max-w-[325px] flex flex-col gap-3 text-[#1C1C1E]"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-black/[0.05]">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-[#5E5BAE]" />
                      <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E]">Select Month</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMonthPickerOpen(false)}
                      className="genki-plan-control genki-plan-control-icon w-7 h-7 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#F2F2F7]/80 rounded-[14px]">
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y - 1)}
                      className="genki-plan-control genki-plan-control-base px-2.5 py-1 text-[13px] leading-[18px] font-semibold text-[#5E5BAE] hover:bg-black/5 active:scale-95 rounded-[8px] transition-all cursor-pointer"
                      aria-label="Previous year"
                    >
                      ‹ {pickerYear - 1}
                    </button>
                    <span className="text-[13px] font-bold text-[#1C1C1E]">
                      {pickerYear}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y + 1)}
                      className="genki-plan-control genki-plan-control-base px-2.5 py-1 text-[13px] leading-[18px] font-semibold text-[#5E5BAE] hover:bg-black/5 active:scale-95 rounded-[8px] transition-all cursor-pointer"
                      aria-label="Next year"
                    >
                      {pickerYear + 1} ›
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                    {MONTH_NAMES.map((monthName, idx) => {
                      const isSelected = pickerYear === viewYear && idx === viewMonth;
                      const isCurrent =
                        pickerYear === deviceToday.year && idx === deviceToday.month;
                      const mPrefix = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`;
                      const mRecords = Object.values(effectiveActivityLogs).filter((r) =>
                        r.date.startsWith(mPrefix)
                      );
                      const mActive = mRecords.filter((r) => r.type === 'active').length;
                      const mRest = mRecords.filter((r) => r.type === 'rest' || r.hasRest === true).length;

                      return (
                        <button
                          key={`${pickerYear}-${idx}`}
                          type="button"
                          onClick={() => handleSelectMonth(pickerYear, idx)}
                          className={`genki-plan-control genki-plan-control-base w-full p-2.5 rounded-[16px] text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#5E5BAE] text-white font-bold shadow-2xs'
                              : 'bg-[#F2F2F7]/75 hover:bg-[#E5E5EA] text-[#1C1C1E] border border-black/[0.04]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[13px]">{monthName}</span>
                            {isCurrent && (
                              <span
                                className={`text-[13px] px-2 py-0.5 rounded-full font-semibold ${
                                  isSelected
                                    ? 'bg-white/20 text-white'
                                    : 'bg-[#F4EEFE] text-[#5E5BAE] border border-[#5E5BAE]/20'
                                }`}
                              >
                                Current
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-[13px] ${
                              isSelected ? 'text-white/80' : 'text-[#8E8E93]'
                            }`}
                          >
                            {mActive} active • {mRest} rest
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(monthPickerModalContent, phoneFrameRef.current);
        }
        return monthPickerModalContent;
      })()}

      {/* ============================================================ */}
      {/* Day Detail & Correction Modal (Unified Multi-Activity List)  */}
      {/* ============================================================ */}
      {(() => {
        const dayActivities = activeDayModalDate
          ? activityRecords.filter(
              (r) => r.dateKey === activeDayModalDate && r.category !== 'rest'
            )
          : [];
        const dayRestRecords = activeDayModalDate
          ? restRecords.filter((r) => r.dateKey === activeDayModalDate)
          : [];
        const hasAnyRecords = dayActivities.length > 0 || dayRestRecords.length > 0;
        const totalDayMinutes = dayActivities.reduce(
          (sum, r) => sum + (r.durationMinutes || 0),
          0
        );

        let formattedDateString = '';
        let isSelectedDayToday = false;

        if (activeDayModalDate) {
          const dObj = new Date(activeDayModalDate + 'T00:00:00');
          formattedDateString = dObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          isSelectedDayToday = activeDayModalDate === deviceToday.dateStr;
        }

        const isSaveDisabled = dayDraftType === 'active' && !dayDraftTitle.trim();

        const dayModalContent = (
          <AnimatePresence>
            {activeDayModalDate && (
              <div
                id="history-day-modal"
                className="absolute inset-0 z-60 flex items-center justify-center p-5 pointer-events-auto"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    setEditingActivityId(null);
                    setActiveDayModalDate(null);
                  }}
                  className="absolute inset-0 bg-black/40 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.94, opacity: 0 }}
                  transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                  className="relative bg-white/95 backdrop-blur-2xl rounded-[26px] p-5 border border-black/[0.04] shadow-2xl z-10 w-full max-w-[340px] flex flex-col gap-3.5 text-[#1C1C1E] max-h-[88%] overflow-y-auto"
                >
                  <div className="flex items-start justify-between pb-2 border-b border-black/[0.05]">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="genki-plan-subheading text-[15px] font-bold text-[#1C1C1E]">
                          {formattedDateString}
                        </h4>
                        {isSelectedDayToday && (
                          <span className="bg-[#5E5BAE] text-white text-[13px] px-2 py-0.5 rounded-full font-bold">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] text-[#8E8E93] block mt-0.5">
                        {hasAnyRecords
                          ? `${dayActivities.length} ${
                              dayActivities.length === 1 ? 'activity' : 'activities'
                            }${totalDayMinutes > 0 ? ` • ${totalDayMinutes} min` : ''}${
                              dayRestRecords.length > 0 ? ' • Rest logged' : ''
                            }`
                          : 'No record yet • Add below'}
                      </span>
                    </div>

                    <button
                      type="button"
                      id="history-day-modal-close"
                      onClick={() => {
                        setEditingActivityId(null);
                        setActiveDayModalDate(null);
                      }}
                      className="genki-plan-control genki-plan-control-icon w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer shrink-0 transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  {/* Individual Activity & Rest Records for This Day (Never Collapsed) */}
                  <div
                    id="history-day-records-list"
                    className="flex flex-col gap-2"
                  >
                    {!hasAnyRecords ? (
                      <div className="p-3.5 rounded-[18px] border bg-[#F2F2F7]/75 border-black/[0.04] text-[13px] text-[#8E8E93]">
                        No activity or rest recorded for this day
                      </div>
                    ) : (
                      <>
                        {dayActivities.map((rec) => {
                          const isBeingEdited = editingActivityId === rec.id;
                          const catLabel =
                            rec.category === 'walk'
                              ? 'Walk'
                              : rec.category === 'stretch'
                              ? 'Stretch'
                              : 'Other';
                          return (
                            <div
                              key={rec.id}
                              data-activity-id={rec.id}
                              className={`p-3 rounded-[16px] border flex items-start justify-between gap-2 ${
                                isBeingEdited
                                  ? 'bg-[#F4EEFE] border-[#5E5BAE]'
                                  : 'bg-[#F4EEFE]/70 border-[#5E5BAE]/15'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-semibold text-[#1C1C1E] leading-snug break-words">
                                  {rec.title}
                                </div>
                                <div className="text-[13px] font-medium text-[#5E5BAE] mt-0.5">
                                  {catLabel} • {rec.durationMinutes} min
                                </div>
                                {rec.note && (
                                  <p className="text-[13px] text-[#6C6C70] italic mt-0.5 break-words">
                                    “{rec.note}”
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  data-action="edit-day-activity"
                                  data-activity-id={rec.id}
                                  onClick={() => handleStartEditDayActivity(rec)}
                                  className="genki-plan-control genki-plan-control-base min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[13px] font-semibold text-[#5E5BAE] hover:bg-[#FAFAFC] transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  data-action="delete-day-activity"
                                  data-activity-id={rec.id}
                                  onClick={() => handleDeleteSingleDayActivity(rec.id)}
                                  className="genki-plan-control genki-plan-control-base min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[13px] font-semibold text-[#E11D48] hover:bg-[#FFF1F2] transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {dayRestRecords.map((restRec) => (
                          <div
                            key={restRec.id}
                            data-rest-id={restRec.id}
                            className="p-3 rounded-[16px] border bg-[#FFE4E6]/50 border-[#E11D48]/20 flex items-start justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold text-[#1C1C1E] leading-snug">
                                {restRec.title || 'Mindful rest day'}
                              </div>
                              <div className="text-[13px] font-medium text-[#E11D48] mt-0.5">
                                Rest • Not counted as exercise
                              </div>
                              {restRec.note && (
                                <p className="text-[13px] text-[#6C6C70] italic mt-0.5 break-words">
                                  “{restRec.note}”
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              data-action="delete-day-rest"
                              data-rest-id={restRec.id}
                              onClick={() => handleDeleteSingleDayRest(restRec.id)}
                              className="genki-plan-control genki-plan-control-base min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[13px] font-semibold text-[#E11D48] hover:bg-[#FFF1F2] transition-colors cursor-pointer shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] leading-[18px] font-bold text-[#1C1C1E]">
                        {editingActivityId
                          ? 'Edit Activity'
                          : dayDraftType === 'rest'
                          ? 'Log Rest Day'
                          : dayDraftType === 'none'
                          ? 'Clear Day'
                          : 'Add Activity'}
                      </span>
                      {editingActivityId && (
                        <button
                          type="button"
                          onClick={resetDayActivityDraft}
                          className="genki-plan-control genki-plan-control-base text-[13px] font-semibold text-[#5E5BAE] hover:underline cursor-pointer"
                        >
                          Cancel edit
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F2F2F7] rounded-[14px] border border-black/[0.04]">
                      <button
                        type="button"
                        id="history-day-mode-active"
                        onClick={() => {
                          setDayDraftType('active');
                          if (!dayDraftTitle.trim() || dayDraftType === 'rest') {
                            setDayDraftCategory('walk');
                            setDayDraftTitle('15-min mindful walk');
                            setDayDraftDuration(15);
                          }
                        }}
                        className={`genki-plan-control genki-plan-control-base py-1.5 rounded-[10px] text-[13px] leading-[18px] font-semibold transition-all cursor-pointer ${
                          dayDraftType === 'active'
                            ? 'bg-[#5E5BAE] text-white shadow-2xs font-bold'
                            : 'text-[#8E8E93] hover:text-[#1C1C1E]'
                        }`}
                      >
                        {editingActivityId ? 'Edit' : 'Add'}
                      </button>

                      <button
                        type="button"
                        id="history-day-mode-rest"
                        onClick={() => {
                          setEditingActivityId(null);
                          setDayDraftType('rest');
                          setDayDraftNote('');
                        }}
                        className={`genki-plan-control genki-plan-control-destructive py-1.5 rounded-[10px] text-[13px] leading-[18px] font-semibold transition-all cursor-pointer ${
                          dayDraftType === 'rest'
                            ? 'bg-[#E11D48] text-white shadow-2xs font-bold'
                            : 'text-[#8E8E93] hover:text-[#1C1C1E]'
                        }`}
                      >
                        Rest
                      </button>

                      <button
                        type="button"
                        id="history-day-mode-clear"
                        onClick={() => {
                          setEditingActivityId(null);
                          setDayDraftType('none');
                        }}
                        className={`genki-plan-control genki-plan-control-base py-1.5 rounded-[10px] text-[13px] leading-[18px] font-semibold transition-all cursor-pointer ${
                          dayDraftType === 'none'
                            ? 'bg-white text-[#1C1C1E] shadow-2xs font-bold'
                            : 'text-[#8E8E93] hover:text-[#1C1C1E]'
                        }`}
                      >
                        Clear
                      </button>
                    </div>

                    {dayDraftType === 'active' && (
                      <div className="flex flex-col gap-2 pt-1">
                        {!editingActivityId && (
                          <>
                            <span className="text-[13px] font-medium text-[#8E8E93]">
                              Quick Presets
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              {(
                                [
                                  { title: '15-min mindful walk', dur: 15, cat: 'walk' },
                                  { title: '10-min easy walk', dur: 10, cat: 'walk' },
                                  { title: '5-min desk stretch', dur: 5, cat: 'stretch' },
                                  { title: '10-min breath reset', dur: 10, cat: 'other' }
                                ] as const
                              ).map((preset) => (
                                <button
                                  key={preset.title}
                                  type="button"
                                  onClick={() => {
                                    setDayDraftCategory(preset.cat);
                                    setDayDraftTitle(preset.title);
                                    setDayDraftDuration(preset.dur);
                                  }}
                                  className={`genki-plan-control genki-plan-control-base p-2 rounded-[12px] text-left text-[13px] font-semibold border transition-all cursor-pointer ${
                                    dayDraftTitle === preset.title
                                      ? 'bg-[#F4EEFE] border-[#5E5BAE] text-[#5E5BAE] shadow-2xs'
                                      : 'bg-white border-black/[0.05] text-[#1C1C1E] hover:bg-[#FAFAFC]'
                                  }`}
                                >
                                  <div className="truncate">{preset.title}</div>
                                  <span className="text-[13px] text-[#8E8E93] block mt-0.5">
                                    {preset.dur} min
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        <div className="flex flex-col gap-1 mt-1">
                          <label className="genki-plan-label text-[13px] font-medium text-[#8E8E93]">
                            Category
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { value: 'walk', label: 'Walk' },
                                { value: 'stretch', label: 'Stretch' },
                                { value: 'other', label: 'Other' }
                              ] as const
                            ).map((cat) => (
                              <button
                                key={cat.value}
                                type="button"
                                data-day-category={cat.value}
                                onClick={() => setDayDraftCategory(cat.value)}
                                className={`genki-plan-control genki-plan-control-base py-1.5 rounded-[10px] text-[13px] leading-[18px] font-semibold border transition-all cursor-pointer ${
                                  dayDraftCategory === cat.value
                                    ? 'bg-[#5E5BAE] text-white border-[#5E5BAE]'
                                    : 'bg-white text-[#1C1C1E] border-black/[0.05] hover:bg-[#FAFAFC]'
                                }`}
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 mt-0.5">
                          <label className="genki-plan-label text-[13px] font-medium text-[#8E8E93]">
                            Duration
                          </label>
                          <div className="flex items-center gap-1">
                            {[5, 10, 15, 20, 30].map((dur) => (
                              <button
                                key={dur}
                                type="button"
                                data-day-duration={dur}
                                onClick={() => setDayDraftDuration(dur)}
                                className={`genki-plan-control genki-plan-control-base flex-1 py-1.5 rounded-[10px] text-[13px] leading-[18px] font-semibold border transition-all cursor-pointer ${
                                  dayDraftDuration === dur
                                    ? 'bg-[#5E5BAE] text-white border-[#5E5BAE]'
                                    : 'bg-white text-[#1C1C1E] border-black/[0.05] hover:bg-[#FAFAFC]'
                                }`}
                              >
                                {dur}m
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 mt-0.5">
                          <label className="genki-plan-label text-[13px] font-medium text-[#8E8E93]">
                            Activity Title
                          </label>
                          <input
                            id="history-day-title-input"
                            type="text"
                            value={dayDraftTitle}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setDayDraftTitle(nextVal);
                              const inferred = inferActivityCategory('', nextVal);
                              if (inferred === 'walk' || inferred === 'stretch') {
                                setDayDraftCategory(inferred);
                              }
                            }}
                            placeholder="Select a preset above or type here..."
                            className="genki-plan-field w-full px-3 py-2 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[13px] leading-[18px] text-[#1C1C1E] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    {dayDraftType === 'rest' && (
                      <div className="p-3 rounded-[16px] bg-[#FFE4E6]/50 border border-[#E11D48]/20 text-[13px] leading-relaxed text-[#1C1C1E]">
                        <p>
                          <strong>Rest is recorded independently.</strong> It does not add to exercise sessions or active minutes.
                        </p>
                      </div>
                    )}

                    {dayDraftType === 'none' && (
                      <div className="p-3 rounded-[16px] bg-[#F2F2F7]/80 border border-black/[0.04] text-[13px] leading-relaxed text-[#6E6E78]">
                        Removes all recorded activities and rest entries for this day.
                      </div>
                    )}

                    {dayDraftType !== 'none' && (
                      <div className="flex flex-col gap-1 mt-0.5">
                        <label className="genki-plan-label text-[13px] font-medium text-[#8E8E93]">
                          Note (Optional)
                        </label>
                        <input
                          id="history-day-note-input"
                          type="text"
                          value={dayDraftNote}
                          onChange={(e) => setDayDraftNote(e.target.value)}
                          placeholder="e.g. Easy pace around the block"
                          className="genki-plan-field w-full px-3 py-2 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-[13px] leading-[18px] text-[#1C1C1E] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>
                    )}
                  </div>

                  {isSaveDisabled && (
                    <p className="text-[13px] text-[#5E5BAE] font-medium text-center">
                      Select a preset or enter an activity name to save
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1 border-t border-black/[0.05]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingActivityId(null);
                        setActiveDayModalDate(null);
                      }}
                      className="genki-plan-control genki-plan-control-base flex-1 py-2.5 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[13px] leading-[18px] font-semibold text-[#1C1C1E] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      id="history-day-save-btn"
                      disabled={isSaveDisabled}
                      onClick={handleSaveDayRecord}
                      className={`genki-plan-control genki-plan-control-primary flex-1 py-2.5 rounded-[14px] text-[13px] leading-[18px] font-semibold shadow-sm transition-colors ${
                        isSaveDisabled
                          ? 'bg-[#5E5BAE]/40 text-white/70 cursor-not-allowed'
                          : 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
                      }`}
                    >
                      {dayDraftType === 'none'
                        ? 'Clear Day'
                        : dayDraftType === 'rest'
                        ? 'Save Rest'
                        : editingActivityId
                        ? 'Update Activity'
                        : 'Add Activity'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(dayModalContent, phoneFrameRef.current);
        }
        return dayModalContent;
      })()}
    </div>
  );
}
