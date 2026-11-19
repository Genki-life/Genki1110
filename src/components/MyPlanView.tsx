import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  applyWeeklyAdjustmentProposal,
  buildWeeklyAdjustmentProposal,
  buildWeeklyReviewObservation,
  buildWeeklyReviewSummary,
  formatReviewOnSundayLabel,
  getLastCompletedWeekBounds,
  getLocalWeekBounds,
  getNextWeekBounds,
  getWeeklyScheduleFieldValue,
  inferActivityCategory,
  isDateKeyInWeek,
  loadResolvedAdjustmentKeys,
  loadWeeklyReviewFeedbacks,
  loadWeeklySchedulesByWeek,
  saveResolvedAdjustmentKeys,
  saveWeeklyReviewFeedbacks,
  saveWeeklySchedulesByWeek,
  setWeeklyScheduleFieldValue,
} from '../utils/weeklyPlanStore';
import {
  FOCUS_STORAGE_KEY,
  LEGACY_DIRECTION_STORAGE_KEYS,
  initializePrototypeDemoData,
} from '../utils/prototypeDemoSeed';
import {
  PlanPhase,
  PlanPathState,
  loadInitialPlanPath,
  savePlanPathState,
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
type SecondaryModuleType = 'path' | 'history' | 'preferences' | 'health' | null;

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

export function MyPlanView({
  phoneFrameRef,
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

  // 3. Secondary Sheet Navigation ('activity' | 'rhythm' | 'direction' | 'memory' | 'health' | null)
  const [selectedModule, setSelectedModule] = useState<SecondaryModuleType>(null);

  // 4. Methodology Info Popup State (Inside Your Rhythm Secondary Sheet)
  const [isMethodologyOpen, setIsMethodologyOpen] = useState<boolean>(false);

  // Ensure one-time versioned prototype demo initialization ran before reading Plan stores
  const hasCheckedDemoInitRef = useRef<boolean>(false);
  if (!hasCheckedDemoInitRef.current) {
    initializePrototypeDemoData(new Date(deviceToday.year, deviceToday.month, deviceToday.day));
    hasCheckedDemoInitRef.current = true;
  }

  // 5. Your Focus & Up Next Shared Phase State
  const [direction, setDirection] = useState<DirectionState>(() =>
    loadInitialFocus(new Date(deviceToday.year, deviceToday.month, deviceToday.day))
  );
  const [planPath, setPlanPath] = useState<PlanPathState>(() =>
    loadInitialPlanPath(direction.phase)
  );
  const [isFocusAdjustOpen, setIsFocusAdjustOpen] = useState<boolean>(false);
  const [focusDraftTitle, setFocusDraftTitle] = useState<string>(direction.goalTitle);
  const [focusDraftApproach, setFocusDraftApproach] = useState<string>(direction.executionApproach);
  const [focusDraftReview, setFocusDraftReview] = useState<string>(direction.nextReviewDate);
  const [focusKeyboardInset, setFocusKeyboardInset] = useState<number>(0);
  const [directionToast, setDirectionToast] = useState<boolean>(false);

  // 5a. Up Next Detail & Edit Path Sheet State
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [isConfirmingPhaseSwitch, setIsConfirmingPhaseSwitch] = useState<boolean>(false);
  const [isPathEditOpen, setIsPathEditOpen] = useState<boolean>(false);
  const [pathDraftPhases, setPathDraftPhases] = useState<PlanPhase[]>(() =>
    planPath.phases.slice(0, 3)
  );

  // 5b. Per-Week Schedules (Indexed by local Monday YYYY-MM-DD weekStartKey) & Sheet State
  const [weeklySchedulesByWeek, setWeeklySchedulesByWeek] = useState<WeeklySchedulesByWeek>(() =>
    loadWeeklySchedulesByWeek(new Date(deviceToday.year, deviceToday.month, deviceToday.day))
  );
  const [editingWeekTarget, setEditingWeekTarget] = useState<'this_week' | 'next_week' | null>(null);
  const isWeekAdjustOpen = editingWeekTarget !== null;
  const [weekDraft, setWeekDraft] = useState<WeeklySchedule>(() => DEFAULT_WEEKLY_DRAFT);
  const [activeWeekCategoryList, setActiveWeekCategoryList] = useState<'walk' | 'stretch' | null>(null);

  // 5c. Weekly Review Feedback & On-Demand Adjustment State (Strictly targets Next week)
  const [weeklyReviewFeedbacks, setWeeklyReviewFeedbacks] = useState<
    Record<string, WeeklyReviewFeedback>
  >(loadWeeklyReviewFeedbacks);
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

  // VisualViewport keyboard avoidance for all bottom-sheet forms
  useEffect(() => {
    if (
      (!isFocusAdjustOpen &&
        !isPathEditOpen &&
        !isPrefFormOpen &&
        !isWeekAdjustOpen &&
        !isMemoryChatOpen &&
        !activeDayModalDate) ||
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
    isPathEditOpen,
    isPrefFormOpen,
    isWeekAdjustOpen,
    isMemoryChatOpen,
    activeDayModalDate,
  ]);

  // Shared phase derivations for BOTH Your focus and Up next (single source of truth)
  const visiblePhases = useMemo(() => planPath.phases.slice(0, 3), [planPath.phases]);
  const currentPhaseIndex = useMemo(() => {
    const idx = visiblePhases.findIndex((p) => p.id === planPath.currentPhaseId);
    return idx >= 0 ? idx : 0;
  }, [visiblePhases, planPath.currentPhaseId]);
  const currentPhase = visiblePhases[currentPhaseIndex] ?? visiblePhases[0];

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

  // This week reads from the SAME unified activityRecords store as History and Weekly review
  const thisWeekCompletions = useMemo(() => {
    return activityRecords
      .filter(
        (record) =>
          record.category !== 'rest' &&
          isDateKeyInWeek(
            record.dateKey,
            currentWeekBounds.weekStartKey,
            currentWeekBounds.weekEndKey
          )
      )
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [activityRecords, currentWeekBounds.weekStartKey, currentWeekBounds.weekEndKey]);

  const thisWeekWalkRecords = useMemo(
    () => thisWeekCompletions.filter((r) => r.category === 'walk'),
    [thisWeekCompletions]
  );

  const thisWeekStretchRecords = useMemo(
    () => thisWeekCompletions.filter((r) => r.category === 'stretch'),
    [thisWeekCompletions]
  );

  // Last completed calendar week (Monday start -> Sunday end) for Weekly review
  const lastCompletedWeekBounds = useMemo(
    () => getLastCompletedWeekBounds(new Date(deviceToday.year, deviceToday.month, deviceToday.day)),
    [deviceToday.year, deviceToday.month, deviceToday.day]
  );

  // Weekly review reads from the SAME unified activityRecords & restRecords store as History
  const lastWeekCompletions = useMemo(() => {
    return activityRecords.filter(
      (record) =>
        record.category !== 'rest' &&
        isDateKeyInWeek(
          record.dateKey,
          lastCompletedWeekBounds.weekStartKey,
          lastCompletedWeekBounds.weekEndKey
        )
    );
  }, [
    activityRecords,
    lastCompletedWeekBounds.weekStartKey,
    lastCompletedWeekBounds.weekEndKey,
  ]);

  const lastWeekRestDayCount = useMemo(() => {
    const uniqueRestDates = new Set(
      restRecords
        .filter((r) =>
          isDateKeyInWeek(
            r.dateKey,
            lastCompletedWeekBounds.weekStartKey,
            lastCompletedWeekBounds.weekEndKey
          )
        )
        .map((r) => r.dateKey)
    );
    return uniqueRestDates.size;
  }, [
    restRecords,
    lastCompletedWeekBounds.weekStartKey,
    lastCompletedWeekBounds.weekEndKey,
  ]);

  const lastWeekSummaryText = useMemo(
    () => buildWeeklyReviewSummary(lastWeekCompletions),
    [lastWeekCompletions]
  );

  const lastWeekObservationText = useMemo(
    () => buildWeeklyReviewObservation(lastWeekCompletions, lastWeekRestDayCount),
    [lastWeekCompletions, lastWeekRestDayCount]
  );

  const lastWeekFeedback =
    weeklyReviewFeedbacks[lastCompletedWeekBounds.weekStartKey] ?? null;

  const selectedWeeklyReviewFeeling = lastWeekFeedback?.feeling ?? null;

  // Base schedule for Next week adjustment: prefer Next week's own schedule, else current week's cadence (never mutating This week)
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

  const handleSelectWeeklyReviewFeeling = (feeling: WeeklyReviewFeeling) => {
    const weekStartKey = lastCompletedWeekBounds.weekStartKey;
    const nextFeedbacks: Record<string, WeeklyReviewFeedback> = {
      ...weeklyReviewFeedbacks,
      [weekStartKey]: {
        weekStartKey,
        feeling,
        updatedAt: new Date().toISOString(),
      },
    };
    setWeeklyReviewFeedbacks(nextFeedbacks);
    saveWeeklyReviewFeedbacks(nextFeedbacks);
  };

  const handleAcceptAdjustment = () => {
    if (!activeAdjustmentProposal || !adjustmentTargetBaseSchedule) return;
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
  };

  const handleUndoAdjustment = () => {
    if (!lastAppliedAdjustment) return;
    const {
      proposal,
      targetWeekStartKey,
      targetActivity,
      targetField,
      previousValue,
      appliedValue,
    } = lastAppliedAdjustment;

    const latestTargetSchedule = weeklySchedulesByWeek[targetWeekStartKey];
    if (!latestTargetSchedule) {
      setLastAppliedAdjustment(null);
      return;
    }

    // Safety guard: if the user already manually modified this exact field after accepting,
    // never overwrite the user's newer value — simply clear the Undo entry.
    const currentFieldVal = getWeeklyScheduleFieldValue(
      latestTargetSchedule,
      targetActivity,
      targetField
    );
    if (currentFieldVal !== appliedValue) {
      setLastAppliedAdjustment(null);
      return;
    }

    // Restore ONLY that single field on that target week, preserving all other edits
    const restoredTargetSchedule = setWeeklyScheduleFieldValue(
      latestTargetSchedule,
      targetActivity,
      targetField,
      previousValue
    );
    const nextByWeek: WeeklySchedulesByWeek = {
      ...weeklySchedulesByWeek,
      [targetWeekStartKey]: restoredTargetSchedule,
    };
    setWeeklySchedulesByWeek(nextByWeek);
    saveWeeklySchedulesByWeek(nextByWeek);

    const nextResolved = resolvedAdjustmentKeys.filter(
      (k) => k !== proposal.resolutionKey && k !== proposal.id
    );
    setResolvedAdjustmentKeys(nextResolved);
    saveResolvedAdjustmentKeys(nextResolved);
    setLastAppliedAdjustment(null);
  };

  const handleDismissAdjustment = () => {
    if (!activeAdjustmentProposal) return;
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

  // --- Handlers for Your Focus ---
  const handleOpenFocusAdjust = () => {
    setFocusDraftTitle(direction.goalTitle);
    setFocusDraftApproach(direction.executionApproach);
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
    setIsFocusAdjustOpen(false);
    setDirectionToast(true);
    setTimeout(() => setDirectionToast(false), 2600);
  };

  const handleFieldFocusScroll = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 120);
  };

  // --- Handlers for Up Next & View Path ---
  const syncFocusPhaseName = (nextPhaseName: string) => {
    setDirection((prev) => {
      const updated = { ...prev, phase: nextPhaseName };
      persistFocusToStorage(updated);
      return updated;
    });
  };

  const handleOpenPhaseDetail = (phaseId: string) => {
    setSelectedPhaseId(phaseId);
    setIsConfirmingPhaseSwitch(false);
  };

  const handleClosePhaseDetail = () => {
    setSelectedPhaseId(null);
    setIsConfirmingPhaseSwitch(false);
  };

  const handleConfirmPhaseSwitch = (targetPhase: PlanPhase) => {
    const nextState: PlanPathState = {
      phases: visiblePhases,
      currentPhaseId: targetPhase.id,
      source: 'user',
      isSample: false,
    };
    setPlanPath(nextState);
    savePlanPathState(nextState);
    syncFocusPhaseName(targetPhase.name);
    setSelectedPhaseId(null);
    setIsConfirmingPhaseSwitch(false);
    showPlanToast(`Current phase: ${targetPhase.name}`);
  };

  const handleOpenPathEdit = () => {
    setPathDraftPhases(visiblePhases.map((p) => ({ ...p })));
    setIsPathEditOpen(true);
  };

  const handleClosePathEdit = () => {
    setIsPathEditOpen(false);
  };

  const handleSavePathEdit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanedPhases: PlanPhase[] = pathDraftPhases.slice(0, 3).map((draft, idx) => {
      const existing = visiblePhases[idx];
      return {
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim() || existing?.description || '',
      };
    });

    if (cleanedPhases.some((p) => !p.name)) return;

    const nextState: PlanPathState = {
      phases: cleanedPhases,
      currentPhaseId: currentPhase.id,
      source: 'user',
      isSample: false,
    };
    setPlanPath(nextState);
    savePlanPathState(nextState);

    const updatedCurrent = cleanedPhases.find((p) => p.id === currentPhase.id) ?? cleanedPhases[0];
    if (updatedCurrent) {
      syncFocusPhaseName(updatedCurrent.name);
    }

    setIsPathEditOpen(false);
    showPlanToast('Path updated');
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
    <div className="flex-1 overflow-y-auto px-5 pt-[18px] pb-[calc(104px+env(safe-area-inset-bottom,0px))] flex flex-col gap-6 z-10 scrollbar-none select-none">
      {/* Toast Notifications */}
      <AnimatePresence>
        {directionToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#5E5BAE] text-white px-4 py-2.5 rounded-[18px] text-xs font-semibold shadow-md flex items-center justify-between z-20 shrink-0"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Focus updated</span>
            </div>
            <span className="text-[11px] text-white/80">Saved</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dayUpdateToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#5E5BAE] text-white px-4 py-2.5 rounded-[18px] text-xs font-semibold shadow-md flex items-center justify-between z-20 shrink-0"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{dayUpdateToast}</span>
            </div>
            <span className="text-[11px] text-white/80">Updated</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* 1. Your focus                                                */}
      {/* ============================================================ */}
      <section
        id="plan-module-focus"
        aria-labelledby="plan-heading-focus"
        className="flex flex-col gap-2.5"
      >
        <h2
          id="plan-heading-focus"
          className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
        >
          Your focus
        </h2>

        <div className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          <p
            id="focus-card-title"
            className="text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-[#1C1C1E]"
          >
            {direction.goalTitle}
          </p>

          <p
            id="focus-card-phase"
            className="mt-3 text-[13px] font-medium leading-[18px] text-[#5E5BAE]"
          >
            {currentPhase.name}
          </p>

          {direction.executionApproach && (
            <p
              id="focus-card-approach"
              className="mt-1 text-[15px] font-normal leading-[21px] text-[#1C1C1E]"
            >
              {direction.executionApproach}
            </p>
          )}

          <div className="mt-4 pt-2 border-t border-black/[0.06] flex items-center justify-between gap-3">
            <span
              id="focus-card-review"
              className="text-[13px] font-normal leading-[18px] text-[#6E6E78] min-w-0"
            >
              {direction.nextReviewDate}
            </span>

            <button
              type="button"
              id="plan-focus-action-btn"
              onClick={handleOpenFocusAdjust}
              className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
            >
              Adjust
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. This week                                                 */}
      {/* ============================================================ */}
      <section
        id="plan-module-this-week"
        aria-labelledby="plan-heading-this-week"
        className="flex flex-col gap-2.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="plan-heading-this-week"
            className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
          >
            This week
          </h2>
          <span
            id="this-week-date-range"
            className="text-[13px] font-normal leading-[18px] text-[#6E6E78] shrink-0"
          >
            {currentWeekBounds.rangeLabel}
          </span>
        </div>

        <div className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          {!weeklySchedule ? (
            <>
              <p
                id="this-week-empty-text"
                className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]"
              >
                Start with a simple week.
              </p>

              <div className="mt-4 pt-2 border-t border-black/[0.06] flex items-center justify-end">
                <button
                  type="button"
                  id="plan-week-action-btn"
                  onClick={() => handleOpenWeekAdjust('this_week')}
                  className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
                >
                  Set up
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-black/[0.06] -my-1">
                {/* Row 1: Walk */}
                <button
                  type="button"
                  id="this-week-row-walk"
                  onClick={() => setActiveWeekCategoryList('walk')}
                  className="w-full min-h-[64px] py-2.5 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[12px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                      <Footprints className="w-4 h-4 stroke-[2]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        id="this-week-walk-title"
                        className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]"
                      >
                        Walk
                      </span>
                      <span
                        id="this-week-walk-subtitle"
                        className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                      >
                        {weeklySchedule.walk.targetCount !== null
                          ? `${weeklySchedule.walk.targetCount} × ${weeklySchedule.walk.durationLabel}`
                          : `Flexible · ${weeklySchedule.walk.durationLabel}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {thisWeekWalkRecords.length > 0 && (
                      <span
                        id="this-week-progress-walk"
                        className="text-[13px] font-medium leading-[18px] text-[#5E5BAE]"
                      >
                        {weeklySchedule.walk.targetCount !== null
                          ? `${thisWeekWalkRecords.length} of ${weeklySchedule.walk.targetCount}`
                          : `${thisWeekWalkRecords.length} ${
                              thisWeekWalkRecords.length === 1 ? 'session' : 'sessions'
                            }`}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#6E6E78] stroke-[2]" />
                  </div>
                </button>

                {/* Row 2: Stretch */}
                <button
                  type="button"
                  id="this-week-row-stretch"
                  onClick={() => setActiveWeekCategoryList('stretch')}
                  className="w-full min-h-[64px] py-2.5 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[12px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 stroke-[2]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        id="this-week-stretch-title"
                        className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]"
                      >
                        Stretch
                      </span>
                      <span
                        id="this-week-stretch-subtitle"
                        className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                      >
                        {weeklySchedule.stretch.targetCount !== null
                          ? `${weeklySchedule.stretch.targetCount} × ${weeklySchedule.stretch.durationLabel}`
                          : `Flexible · ${weeklySchedule.stretch.durationLabel}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {thisWeekStretchRecords.length > 0 && (
                      <span
                        id="this-week-progress-stretch"
                        className="text-[13px] font-medium leading-[18px] text-[#5E5BAE]"
                      >
                        {weeklySchedule.stretch.targetCount !== null
                          ? `${thisWeekStretchRecords.length} of ${weeklySchedule.stretch.targetCount}`
                          : `${thisWeekStretchRecords.length} ${
                              thisWeekStretchRecords.length === 1 ? 'session' : 'sessions'
                            }`}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#6E6E78] stroke-[2]" />
                  </div>
                </button>

                {/* Row 3: Rest (As needed, never counted as exercise target) */}
                <div
                  id="this-week-row-rest"
                  className="w-full min-h-[64px] py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-[12px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                      <Moon className="w-4 h-4 stroke-[2]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        id="this-week-rest-title"
                        className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]"
                      >
                        Rest
                      </span>
                      <span
                        id="this-week-rest-subtitle"
                        className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                      >
                        As needed
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-end">
                <button
                  type="button"
                  id="plan-week-action-btn"
                  onClick={() => handleOpenWeekAdjust('this_week')}
                  className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
                >
                  Adjust week
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2b. On-demand adjustment card (Shown only with clear evidence) */}
      {/* ============================================================ */}
      {(activeAdjustmentProposal || lastAppliedAdjustment) && (
        <section
          id="plan-module-adjustment"
          aria-labelledby="plan-heading-adjustment"
          className="flex flex-col gap-2.5"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="plan-heading-adjustment"
              className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
            >
              A small adjustment
            </h2>
            <span
              id="plan-adjustment-target-week"
              className="text-[13px] font-normal leading-[18px] text-[#6E6E78] shrink-0"
            >
              Next week ·{' '}
              {lastAppliedAdjustment
                ? lastAppliedAdjustment.proposal.targetWeekRangeLabel
                : activeAdjustmentProposal?.targetWeekRangeLabel}
            </span>
          </div>

          <div className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
            {lastAppliedAdjustment ? (
              <div
                id="plan-adjustment-updated-state"
                className="flex items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    id="plan-adjustment-updated-label"
                    className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]"
                  >
                    Updated
                  </span>
                  <span
                    id="plan-adjustment-updated-change"
                    className="text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                  >
                    Next week ({lastAppliedAdjustment.proposal.targetWeekRangeLabel}) ·{' '}
                    {lastAppliedAdjustment.proposal.changeLabel}
                  </span>
                </div>

                <button
                  type="button"
                  id="plan-adjustment-undo-btn"
                  onClick={handleUndoAdjustment}
                  className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
                >
                  Undo
                </button>
              </div>
            ) : activeAdjustmentProposal ? (
              <>
                <p
                  id="plan-adjustment-headline"
                  className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]"
                >
                  {activeAdjustmentProposal.headline}
                </p>

                <p
                  id="plan-adjustment-change"
                  className="mt-1 text-[15px] font-medium leading-[21px] text-[#5E5BAE]"
                >
                  {activeAdjustmentProposal.changeLabel}
                </p>

                <p
                  id="plan-adjustment-reason"
                  className="mt-1 text-[13px] font-normal leading-[18px] text-[#6E6E78]"
                >
                  {activeAdjustmentProposal.reason}
                </p>

                <div className="mt-3.5 pt-3 border-t border-black/[0.06] flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    id="plan-adjustment-accept-btn"
                    onClick={handleAcceptAdjustment}
                    className="min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold leading-[20px] transition-colors cursor-pointer"
                  >
                    Try this
                  </button>

                  <button
                    type="button"
                    id="plan-adjustment-dismiss-btn"
                    onClick={handleDismissAdjustment}
                    className="min-h-[44px] px-3.5 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-[14px] font-medium leading-[20px] transition-colors cursor-pointer"
                  >
                    Keep my plan
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 3. Up next                                                   */}
      {/* ============================================================ */}
      <section
        id="plan-module-up-next"
        aria-labelledby="plan-heading-up-next"
        className="flex flex-col gap-2.5"
      >
        <h2
          id="plan-heading-up-next"
          className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
        >
          Up next
        </h2>

        <div className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="flex flex-col">
            {visiblePhases.map((phase, idx) => {
              const isCurrent = idx === currentPhaseIndex;
              const isNext = idx === currentPhaseIndex + 1;
              const isCollapsedPhase = !isCurrent && !isNext;
              const hasTopLine = idx > 0;
              const hasBottomLine = idx < visiblePhases.length - 1;

              return (
                <button
                  key={phase.id}
                  type="button"
                  id={`up-next-phase-row-${idx}`}
                  data-phase-id={phase.id}
                  data-phase-state={isCurrent ? 'current' : isNext ? 'next' : 'collapsed'}
                  onClick={() => handleOpenPhaseDetail(phase.id)}
                  className="w-full min-h-[44px] flex items-stretch gap-3 text-left transition-opacity active:opacity-70 cursor-pointer group"
                >
                  {/* Vertical timeline rail: small dots & thin connecting line */}
                  <div
                    className="w-4 shrink-0 flex flex-col items-center"
                    aria-hidden="true"
                  >
                    <div
                      className={`w-[1.5px] ${
                        isCurrent ? 'h-[13px]' : 'h-[14px]'
                      } shrink-0 ${hasTopLine ? 'bg-[#DEDCEB]' : 'bg-transparent'}`}
                    />
                    <span
                      data-phase-dot={isCurrent ? 'current' : 'future'}
                      className={`rounded-full shrink-0 transition-colors ${
                        isCurrent
                          ? 'w-2.5 h-2.5 bg-[#5E5BAE] ring-[3px] ring-[#5E5BAE]/15'
                          : 'w-2 h-2 bg-[#CFCDE3]'
                      }`}
                    />
                    <div
                      className={`w-[1.5px] flex-1 min-h-[10px] ${
                        hasBottomLine ? 'bg-[#DEDCEB]' : 'bg-transparent'
                      }`}
                    />
                  </div>

                  {/* Phase content */}
                  <div
                    className={`flex-1 min-w-0 flex items-start justify-between gap-2 ${
                      isCurrent ? 'pt-2 pb-4' : isNext ? 'pt-2 pb-3.5' : 'py-2'
                    }`}
                  >
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-[15px] font-semibold leading-[20px] ${
                            isCollapsedPhase ? 'text-[#6E6E78]' : 'text-[#1C1C1E]'
                          }`}
                        >
                          {phase.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[12px] font-medium leading-[18px] text-[#5E5BAE] shrink-0">
                            Current
                          </span>
                        )}
                      </div>

                      {isCurrent && (
                        <p className="mt-1 text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          {phase.description}
                        </p>
                      )}

                      {isNext && (
                        <p className="mt-0.5 text-[13px] font-normal leading-[18px] text-[#6E6E78] line-clamp-1">
                          {phase.description}
                        </p>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-[#6E6E78]/70 stroke-[2] shrink-0 mt-0.5" />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-end">
            <button
              type="button"
              id="plan-up-next-view-path-btn"
              onClick={() => setSelectedModule('path')}
              className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
            >
              View path
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. Weekly review                                             */}
      {/* ============================================================ */}
      <section
        id="plan-module-weekly-review"
        aria-labelledby="plan-heading-weekly-review"
        className="flex flex-col gap-2.5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="plan-heading-weekly-review"
            className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
          >
            Weekly review
          </h2>
          <span
            id="weekly-review-date-range"
            className="text-[13px] font-normal leading-[18px] text-[#6E6E78] shrink-0"
          >
            {lastCompletedWeekBounds.rangeLabel}
          </span>
        </div>

        <div className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col">
          <p
            id="weekly-review-summary"
            className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]"
          >
            {lastWeekSummaryText}
          </p>

          {lastWeekObservationText && (
            <p
              id="weekly-review-observation"
              className="mt-1 text-[13px] font-normal leading-[18px] text-[#6E6E78]"
            >
              {lastWeekObservationText}
            </p>
          )}

          <div className="mt-3.5 pt-3 border-t border-black/[0.06] flex flex-col gap-2.5">
            <p
              id="weekly-review-question"
              className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
            >
              How did the week feel?
            </p>

            <div
              role="group"
              aria-labelledby="weekly-review-question"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { value: 'too_much', label: 'Too much' },
                  { value: 'about_right', label: 'About right' },
                  { value: 'ready_for_more', label: 'Ready for more' },
                ] as const
              ).map((opt) => {
                const isSelected = selectedWeeklyReviewFeeling === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    id={`weekly-review-option-${opt.value}`}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectWeeklyReviewFeeling(opt.value)}
                    className={`min-h-[44px] px-3.5 py-2 rounded-[14px] text-[14px] font-medium leading-[20px] border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#5E5BAE] border-[#5E5BAE] text-white'
                        : 'bg-[#F2F2F7] border-black/[0.05] text-[#1C1C1E] hover:bg-[#E5E5EA]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-black/[0.06] flex items-center justify-end">
            {selectedWeeklyReviewFeeling ? (
              <button
                type="button"
                id="weekly-review-adjust-next-week-btn"
                onClick={() => handleOpenWeekAdjust('next_week')}
                className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer"
              >
                Adjust next week
              </button>
            ) : (
              <button
                type="button"
                id="weekly-review-view-history-btn"
                onClick={() => setSelectedModule('history')}
                className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer"
              >
                View history
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. Bottom Auxiliary Entries: History, Preferences, Health data */}
      {/* ============================================================ */}
      <section
        id="plan-auxiliary-entries"
        aria-label="Additional plan sections"
        className="rounded-[24px] p-4 bg-[rgba(255,255,255,0.88)] border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05),0_1px_2px_rgba(0,0,0,0.02)] flex flex-col divide-y divide-black/[0.06]"
      >
        <button
          type="button"
          id="plan-entry-history"
          onClick={() => setSelectedModule('history')}
          className="w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <span className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]">
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
          onClick={() => setSelectedModule('preferences')}
          className="w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]">
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
          onClick={() => setSelectedModule('health')}
          className="w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
        >
          <span className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]">
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
                  onClick={() => {
                    setSelectedModule(null);
                  }}
                  className="absolute inset-0 bg-black/25 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                  className="relative w-full max-h-[88%] bg-white/95 backdrop-blur-2xl rounded-t-[32px] p-5 sm:p-6 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-2xl border-t border-white/90 overflow-y-auto z-10 flex flex-col gap-4 text-[#1C1C1E]"
                  id="my-plan-secondary-sheet"
                >
                  {/* Sheet Header with clear Back navigation */}
                  <div className="flex flex-col gap-1.5 pb-3 border-b border-black/[0.06] shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        id="secondary-sheet-back-btn"
                        onClick={() => {
                          setSelectedModule(null);
                        }}
                        className="min-h-[44px] -ml-2 px-2 flex items-center gap-1 text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 transition-opacity cursor-pointer"
                        aria-label="Return to Plan"
                      >
                        <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
                        <span>Plan</span>
                      </button>

                      {selectedModule === 'preferences' && (
                        <button
                          type="button"
                          onClick={() => setIsMemoryInfoModalOpen(true)}
                          className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#5E5BAE] transition-colors cursor-pointer"
                          aria-label="How preferences work"
                        >
                          <HelpCircle className="w-4 h-4 stroke-[2.2]" />
                        </button>
                      )}
                    </div>

                    <div>
                      <h3 className="text-[22px] font-semibold leading-[28px] text-[#1C1C1E] tracking-[-0.02em]">
                        {selectedModule === 'path' && 'Your path'}
                        {selectedModule === 'history' && 'History'}
                        {selectedModule === 'preferences' && 'Preferences'}
                        {selectedModule === 'health' && 'Health data'}
                      </h3>
                      <p className="text-[13px] leading-[18px] text-[#6E6E78] mt-0.5">
                        {selectedModule === 'path' && 'Flexible pacing phases · move only when you choose'}
                        {selectedModule === 'history' && 'Activity calendar, 6-month trend & detailed stats'}
                        {selectedModule === 'preferences' && 'Saved preferences and pending questions'}
                        {selectedModule === 'health' && 'Wearable & Apple Health connection status'}
                      </p>
                    </div>
                  </div>

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 0: VIEW PATH (All 3 Phases + Edit Entry) */}
                  {/* ======================================================= */}
                  {selectedModule === 'path' && (
                    <div id="view-path-secondary-page" className="flex flex-col gap-4 text-[#1C1C1E]">
                      <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                        Staying at your current pace, stepping back, or taking a rest day are all valid choices. Phases never advance automatically.
                      </p>

                      <div className="rounded-[24px] p-4 bg-white border border-black/[0.04] shadow-[0_2px_12px_-4px_rgba(28,28,45,0.05)] flex flex-col">
                        <div className="flex flex-col">
                          {visiblePhases.map((phase, idx) => {
                            const isCurrent = idx === currentPhaseIndex;
                            const hasTopLine = idx > 0;
                            const hasBottomLine = idx < visiblePhases.length - 1;

                            return (
                              <button
                                key={phase.id}
                                type="button"
                                id={`view-path-phase-row-${idx}`}
                                onClick={() => handleOpenPhaseDetail(phase.id)}
                                className="w-full min-h-[44px] flex items-stretch gap-3 text-left transition-opacity active:opacity-70 cursor-pointer"
                              >
                                <div
                                  className="w-4 shrink-0 flex flex-col items-center"
                                  aria-hidden="true"
                                >
                                  <div
                                    className={`w-[1.5px] ${
                                      isCurrent ? 'h-[13px]' : 'h-[14px]'
                                    } shrink-0 ${hasTopLine ? 'bg-[#DEDCEB]' : 'bg-transparent'}`}
                                  />
                                  <span
                                    className={`rounded-full shrink-0 ${
                                      isCurrent
                                        ? 'w-2.5 h-2.5 bg-[#5E5BAE] ring-[3px] ring-[#5E5BAE]/15'
                                        : 'w-2 h-2 bg-[#CFCDE3]'
                                    }`}
                                  />
                                  <div
                                    className={`w-[1.5px] flex-1 min-h-[10px] ${
                                      hasBottomLine ? 'bg-[#DEDCEB]' : 'bg-transparent'
                                    }`}
                                  />
                                </div>

                                <div className="flex-1 min-w-0 py-2.5 flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0 flex flex-col">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-[15px] font-semibold leading-[20px] text-[#1C1C1E]">
                                        {phase.name}
                                      </span>
                                      {isCurrent && (
                                        <span className="text-[12px] font-medium leading-[18px] text-[#5E5BAE] shrink-0">
                                          Current
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                                      {phase.description}
                                    </p>
                                  </div>

                                  <ChevronRight className="w-4 h-4 text-[#6E6E78]/70 stroke-[2] shrink-0 mt-0.5" />
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-2 pt-2 border-t border-black/[0.06] flex items-center justify-end">
                          <button
                            type="button"
                            id="view-path-edit-btn"
                            onClick={handleOpenPathEdit}
                            className="min-h-[44px] min-w-[44px] px-2 -mr-2 flex items-center justify-end text-[15px] font-medium leading-[21px] text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer shrink-0"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ======================================================= */}
                  {/* SECONDARY PAGE 1: HISTORY (Activity Calendar + 6-Month Trend + Detailed Stats) */}
                  {/* ======================================================= */}
                  {selectedModule === 'history' && (
                    <div className="flex flex-col gap-4 text-xs text-[#3C3C43]">
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
                            className="min-h-[44px] flex items-center gap-1.5 text-[14px] font-semibold text-[#1C1C1E] bg-[#F2F2F7] hover:bg-[#E5E5EA] active:scale-95 px-3.5 py-2 rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0"
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
                              className="min-h-[44px] flex items-center gap-1.5 text-[13px] font-semibold text-[#5E5BAE] bg-[#5E5BAE]/10 hover:bg-[#5E5BAE]/18 active:scale-95 px-3.5 py-2 rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0"
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
                            <span key={idx} className="text-[11px] font-semibold text-[#6E6E78] uppercase tracking-wider">
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
                                  className="w-full min-h-[44px] flex items-center justify-center rounded-[10px] cursor-pointer group active:scale-92 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E5BAE]/50"
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
                        <span className="text-xs font-semibold text-[#1C1C1E] pl-3">
                          {currentRecentData.rangeLabel}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRhythmFilter('7d')}
                            className={`min-h-[44px] px-4 rounded-full text-xs font-semibold transition-all cursor-pointer ${
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
                            className={`min-h-[44px] px-4 rounded-full text-xs font-semibold transition-all cursor-pointer ${
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
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#5E5BAE]">
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
                          <span className="text-[11px] font-medium text-[#6E6E78]">Active days</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#1C1C1E] leading-none">
                              {currentRecentData.activeDaysCount}
                            </span>
                            <span className="text-[11px] text-[#6E6E78] block mt-0.5">days</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[11px] font-medium text-[#6E6E78]">Activities</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#5E5BAE] leading-none">
                              {currentRecentData.completedCount}
                            </span>
                            <span className="text-[11px] text-[#6E6E78] block mt-0.5">sessions</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[11px] font-medium text-[#6E6E78]">Duration</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#1C1C1E] leading-none">
                              {currentRecentData.activeMinutes}
                            </span>
                            <span className="text-[11px] text-[#6E6E78] block mt-0.5">minutes</span>
                          </div>
                        </div>

                        <div className="bg-[#F2F2F7]/75 p-3 rounded-[16px] border border-black/[0.03] flex flex-col justify-between min-h-[68px]">
                          <span className="text-[11px] font-medium text-[#6E6E78]">Rest days</span>
                          <div className="mt-1">
                            <span className="text-[18px] font-bold text-[#E59980] leading-none">
                              {currentRecentData.restDaysCount}
                            </span>
                            <span className="text-[11px] text-[#6E6E78] block mt-0.5">rests</span>
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

                        <div className="pt-2 border-t border-black/[0.04] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#6E6E78]">
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
                          <span className="text-[11px] text-[#6E6E78]">
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
                                            <span className="text-[12px] text-[#5E5BAE] font-semibold">
                                              Today
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[12px] text-[#6E6E78] mt-0.5 truncate">
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
                                          <div className="text-[11px] text-[#6E6E78] mt-0.5 italic truncate">
                                            “{rec.note}”
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenDayDetail(rec.date)}
                                      className="min-h-[44px] min-w-[52px] px-3 rounded-[12px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[12px] font-semibold text-[#5E5BAE] shrink-0 transition-colors cursor-pointer"
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
                        className="w-full min-h-[44px] py-2.5 px-3 rounded-[16px] bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.04] text-[12px] font-medium text-[#6E6E78] hover:text-[#1C1C1E] flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99]"
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
                          <h4 className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                            Your preferences
                          </h4>
                          <button
                            type="button"
                            id="preferences-add-btn"
                            onClick={handleOpenAddPreference}
                            className="min-h-[44px] px-2 -mr-2 text-[14px] font-medium text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent transition-opacity cursor-pointer"
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
                                    className="w-full text-left flex flex-col gap-1 cursor-pointer"
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
                                    <span className="text-[12px] font-medium leading-[16px] text-[#6E6E78] truncate">
                                      {tagLabel}
                                    </span>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        data-pref-edit-id={item.id}
                                        onClick={(e) => handleOpenEditPreference(item, e)}
                                        className="min-h-[44px] px-2.5 text-[14px] font-medium text-[#5E5BAE] hover:text-[#4B4895] active:opacity-70 bg-transparent cursor-pointer"
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
                                        className="min-h-[44px] px-2.5 -mr-2 text-[14px] font-medium text-[#6E6E78] hover:text-[#E11D48] active:opacity-70 bg-transparent cursor-pointer"
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
                          <h4 className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
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
                                  className="w-full text-left flex flex-col gap-1 cursor-pointer"
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
                                    className="flex-1 min-h-[44px] px-3 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold transition-colors cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    data-pref-ignore-id={item.id}
                                    onClick={(e) => handleDismissPendingMemory(item.id, e)}
                                    className="min-h-[44px] px-4 rounded-[14px] bg-white hover:bg-[#F2F2F7] border border-black/[0.06] text-[#1C1C1E] text-[14px] font-medium transition-colors cursor-pointer"
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
                        className="w-full min-h-[44px] px-4 rounded-[16px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-[14px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
                            <h4 className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]">
                              Apple Health is not connected
                            </h4>
                            <span className="text-[13px] leading-[18px] text-[#6E6E78]">
                              Not connected
                            </span>
                          </div>
                        </div>

                        <p className="text-[15px] font-normal leading-[21px] text-[#1C1C1E] mt-1">
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
                      <span className="text-[12px] font-medium text-[#5E5BAE] block mb-1">
                        {selectedMemory.isConfirmed && selectedMemory.source === 'user_explicit'
                          ? 'Saved preference'
                          : 'Needs confirmation'}
                      </span>
                      <h3 className="text-[17px] font-semibold text-[#1C1C1E] leading-snug">
                        {selectedMemory.isConfirmed && selectedMemory.source === 'user_explicit'
                          ? selectedMemory.title
                          : formatAsCheckQuestion(selectedMemory.title)}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedMemory(null)}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] shrink-0 cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  {selectedMemory.summary && (
                    <p className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]">
                      {selectedMemory.summary}
                    </p>
                  )}

                  {selectedMemory.learnedFrom && (
                    <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] flex flex-col gap-1">
                      <span className="text-[12px] font-medium text-[#6E6E78]">Source</span>
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
                        className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissPendingMemory(selectedMemory.id)}
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] text-[15px] font-medium cursor-pointer transition-colors"
                      >
                        Ignore
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPreference(selectedMemory)}
                        className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemoryToDelete(selectedMemory)}
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#FFE4E6]/60 text-[#E11D48] text-[15px] font-medium cursor-pointer transition-colors"
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
                      className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                    >
                      {prefFormEditingId ? 'Edit preference' : 'Add preference'}
                    </h3>

                    <button
                      type="button"
                      id="pref-form-close-btn"
                      onClick={() => setIsPrefFormOpen(false)}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
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
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
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
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pref-input-tag"
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
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
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="pref-input-summary"
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
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
                          className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors resize-none"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="pref-form-cancel-btn"
                        onClick={() => setIsPrefFormOpen(false)}
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="pref-form-save-btn"
                        disabled={isPrefSaveDisabled}
                        className={`flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold transition-colors ${
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
                        <h4 className="text-[15px] font-bold text-[#1C1C1E] leading-tight">
                          Talk to Nova
                        </h4>
                        <span className="text-[11px] text-[#8E8E93] block">
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
                      className="w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close conversation"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  {editingMemory && (
                    <div className="mx-6 mt-3 px-3.5 py-2 rounded-[14px] bg-[#F2F2F7]/75 border border-black/[0.04] flex items-center gap-2 text-[11.5px] text-[#6C6C70] shrink-0">
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
                              <span className="text-[10px] text-[#8E8E93] bg-[#F2F2F7] px-2 py-0.5 rounded-full border border-black/5">
                                Needs confirmation
                              </span>
                            </div>

                            <h5 className="text-[13.5px] font-bold text-[#1C1C1E] leading-snug">
                              {msg.proposal.newTitle}
                            </h5>
                            <p className="text-[12px] text-[#6C6C70] leading-relaxed">
                              {msg.proposal.newSummary}
                            </p>

                            {msg.proposalAccepted ? (
                              <div className="py-2 px-3 rounded-[12px] bg-[#F4EEFE] text-[#5E5BAE] text-xs font-bold flex items-center justify-center gap-1.5 border border-[#5E5BAE]/20">
                                <Check className="w-4 h-4 stroke-[2.5]" />
                                <span>Confirmed & Saved</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmMemoryProposal(msg.id)}
                                  className="flex-1 py-2.5 px-3 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                                  className="py-2.5 px-3 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#8E8E93] text-xs font-semibold cursor-pointer"
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
                        <span className="text-[11px] text-[#8E8E93] pl-1">
                          Quick ways to {editingMemory ? 'adjust' : 'share'}:
                        </span>
                        {quickMemoryChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleSendMemoryChat(chip)}
                            className="text-left text-xs font-semibold text-[#5E5BAE] bg-white hover:bg-[#FAFAFC] px-3.5 py-2 rounded-[16px] border border-[#5E5BAE]/20 shadow-2xs transition-all active:scale-98 cursor-pointer"
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
                      className="flex-1 bg-[#F2F2F7] px-4 py-2.5 rounded-full text-xs text-[#1C1C1E] placeholder-[#8E8E93] border border-black/[0.06] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendMemoryChat()}
                      disabled={!memoryChatInput.trim()}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
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
      {/* YOUR FOCUS ADJUST BOTTOM SHEET FORM                          */}
      {/* ============================================================ */}
      {(() => {
        const isSaveDisabled = !focusDraftTitle.trim();

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
                      className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                    >
                      Your focus
                    </h3>

                    <button
                      type="button"
                      id="focus-close-btn"
                      onClick={handleCloseFocusAdjust}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
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
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Focus
                        </label>
                        <input
                          id="focus-input-title"
                          type="text"
                          value={focusDraftTitle}
                          onChange={(e) => setFocusDraftTitle(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="What are you focusing on?"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="focus-input-approach"
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Current approach
                        </label>
                        <textarea
                          id="focus-input-approach"
                          rows={3}
                          value={focusDraftApproach}
                          onChange={(e) => setFocusDraftApproach(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder="One short note on how you want to keep this doable"
                          className="w-full px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors resize-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="focus-input-review"
                          className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                        >
                          Review date
                        </label>
                        <input
                          id="focus-input-review"
                          type="text"
                          value={focusDraftReview}
                          onChange={(e) => setFocusDraftReview(e.target.value)}
                          onFocus={handleFieldFocusScroll}
                          placeholder={`e.g. ${formatReviewOnSundayLabel(
                            new Date(deviceToday.year, deviceToday.month, deviceToday.day)
                          )}`}
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                        <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          A gentle check-in date you can change anytime.
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="focus-cancel-btn"
                        onClick={handleCloseFocusAdjust}
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="focus-save-btn"
                        disabled={isSaveDisabled}
                        className={`flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold transition-colors ${
                          isSaveDisabled
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
                        className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
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
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
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
                          <span className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]">
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
                                  className={`min-h-[44px] px-2 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
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
                                  className={`min-h-[44px] px-3.5 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
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
                          <span className="text-[16px] font-semibold leading-[22px] text-[#1C1C1E]">
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
                                  className={`min-h-[44px] px-2 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
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
                                  className={`min-h-[44px] px-3.5 rounded-[12px] text-[13px] font-medium border transition-colors cursor-pointer ${
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
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="this-week-save-btn"
                        className="flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold bg-[#5E5BAE] hover:bg-[#524FA0] text-white transition-colors cursor-pointer"
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
      {/* THIS WEEK CATEGORY ACTIVITY LIST SHEET (WALK / STRETCH)      */}
      {/* ============================================================ */}
      {(() => {
        const recordsForModal =
          activeWeekCategoryList === 'walk'
            ? thisWeekWalkRecords
            : activeWeekCategoryList === 'stretch'
            ? thisWeekStretchRecords
            : [];

        const categoryTitle = activeWeekCategoryList === 'walk' ? 'Walk' : 'Stretch';

        const formatCompletionDateTime = (iso: string) => {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return '';
          const weekday = SHORT_WEEKDAYS[d.getDay()];
          const month = SHORT_MONTH_NAMES[d.getMonth()];
          const day = d.getDate();
          const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          return `${weekday}, ${month} ${day} · ${time}`;
        };

        const activityListPortal = (
          <AnimatePresence>
            {activeWeekCategoryList && (
              <div className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setActiveWeekCategoryList(null)}
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
                  className="relative w-full max-h-[80%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-[10px] bg-[#5E5BAE]/[0.08] text-[#5E5BAE] flex items-center justify-center shrink-0">
                        {activeWeekCategoryList === 'walk' ? (
                          <Footprints className="w-4 h-4 stroke-[2]" />
                        ) : (
                          <Sparkles className="w-4 h-4 stroke-[2]" />
                        )}
                      </div>
                      <div>
                        <h3
                          id="this-week-activity-sheet-title"
                          className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                        >
                          {categoryTitle}
                        </h3>
                        <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          {currentWeekBounds.rangeLabel}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      id="this-week-activity-close-btn"
                      onClick={() => setActiveWeekCategoryList(null)}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col">
                    {recordsForModal.length === 0 ? (
                      <div className="py-4 flex flex-col gap-1">
                        <p
                          id="this-week-activity-empty"
                          className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]"
                        >
                          Nothing recorded yet.
                        </p>
                        <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          Completed {categoryTitle.toLowerCase()} sessions from Today will show here.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-black/[0.06] -my-1">
                        {recordsForModal.map((rec) => (
                          <div
                            key={rec.id}
                            data-week-activity-item={rec.id}
                            className="min-h-[60px] py-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[15px] font-medium leading-[21px] text-[#1C1C1E] truncate">
                                {rec.title}
                              </span>
                              <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                                {formatCompletionDateTime(rec.completedAt)}
                              </span>
                            </div>
                            <span className="text-[13px] font-medium leading-[18px] text-[#5E5BAE] shrink-0">
                              {rec.durationMinutes} min
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white">
                    <button
                      type="button"
                      id="this-week-view-today-btn"
                      onClick={() => {
                        setActiveWeekCategoryList(null);
                        onNavigateToToday?.();
                      }}
                      className="w-full min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                    >
                      View Today
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
      {/* UP NEXT PHASE DETAIL & CONFIRMATION SHEET                    */}
      {/* ============================================================ */}
      {(() => {
        const selectedPhaseIdx = selectedPhaseId
          ? visiblePhases.findIndex((p) => p.id === selectedPhaseId)
          : -1;
        const selectedPhase = selectedPhaseIdx >= 0 ? visiblePhases[selectedPhaseIdx] : null;
        const isSelectedCurrent = selectedPhase ? selectedPhase.id === currentPhase.id : false;

        const phaseContextLabel = !selectedPhase
          ? ''
          : isSelectedCurrent
          ? 'Current phase'
          : selectedPhaseIdx === currentPhaseIndex + 1
          ? 'Next phase'
          : selectedPhaseIdx < currentPhaseIndex
          ? 'Earlier phase'
          : 'Later phase';

        const phaseDetailPortal = (
          <AnimatePresence>
            {selectedPhase && (
              <div className="absolute inset-0 z-60 flex flex-col justify-end pointer-events-auto overflow-hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleClosePhaseDetail}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="up-next-detail-title"
                  id="up-next-phase-detail-sheet"
                  className="relative w-full max-h-[82%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <div>
                      <h3
                        id="up-next-detail-title"
                        className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                      >
                        {selectedPhase.name}
                      </h3>
                      <p
                        id="up-next-detail-context"
                        className={`text-[13px] font-medium leading-[18px] ${
                          isSelectedCurrent ? 'text-[#5E5BAE]' : 'text-[#6E6E78]'
                        }`}
                      >
                        {phaseContextLabel}
                      </p>
                    </div>

                    <button
                      type="button"
                      id="up-next-detail-close-btn"
                      onClick={handleClosePhaseDetail}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-3.5">
                    <p
                      id="up-next-detail-description"
                      className="text-[15px] font-normal leading-[21px] text-[#1C1C1E]"
                    >
                      {selectedPhase.description}
                    </p>

                    <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                      {isSelectedCurrent
                        ? 'Stay at this pace as long as it feels helpful. Keeping your rhythm, easing back, or resting are all valid choices.'
                        : 'Phases only shift when you confirm. Switching won’t change your Today tasks or activity history.'}
                    </p>

                    {!isSelectedCurrent && isConfirmingPhaseSwitch && (
                      <div
                        id="up-next-switch-confirm-box"
                        className="mt-1 rounded-[18px] p-4 bg-[#F5F4FB] border border-[#5E5BAE]/20 flex flex-col gap-2"
                      >
                        <p className="text-[15px] font-semibold leading-[21px] text-[#1C1C1E]">
                          Switch current phase to “{selectedPhase.name}”?
                        </p>
                        <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          Your focus will update to this phase. Today tasks and past logs remain unchanged.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                    {isSelectedCurrent ? (
                      <>
                        {selectedModule !== 'path' && (
                          <button
                            type="button"
                            id="up-next-detail-view-path-btn"
                            onClick={() => {
                              handleClosePhaseDetail();
                              setSelectedModule('path');
                            }}
                            className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                          >
                            View path
                          </button>
                        )}
                        <button
                          type="button"
                          id="up-next-keep-pace-btn"
                          onClick={handleClosePhaseDetail}
                          className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                        >
                          Keep current pace
                        </button>
                      </>
                    ) : !isConfirmingPhaseSwitch ? (
                      <>
                        <button
                          type="button"
                          id="up-next-detail-cancel-btn"
                          onClick={handleClosePhaseDetail}
                          className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          id="up-next-request-switch-btn"
                          onClick={() => setIsConfirmingPhaseSwitch(true)}
                          className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                        >
                          {selectedPhaseIdx < currentPhaseIndex
                            ? 'Step back to this phase'
                            : 'Switch to this phase'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          id="up-next-confirm-cancel-btn"
                          onClick={() => setIsConfirmingPhaseSwitch(false)}
                          className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          id="up-next-confirm-switch-btn"
                          onClick={() => handleConfirmPhaseSwitch(selectedPhase)}
                          className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                        >
                          Confirm switch
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(phaseDetailPortal, phoneFrameRef.current);
        }
        return phaseDetailPortal;
      })()}

      {/* ============================================================ */}
      {/* EDIT PATH BOTTOM SHEET FORM (Opened from View path -> Edit)  */}
      {/* ============================================================ */}
      {(() => {
        const isPathSaveDisabled = pathDraftPhases.some((p) => !p.name.trim());

        const editPathPortal = (
          <AnimatePresence>
            {isPathEditOpen && (
              <div
                style={focusKeyboardInset > 0 ? { paddingBottom: `${focusKeyboardInset}px` } : undefined}
                className="absolute inset-0 z-65 flex flex-col justify-end pointer-events-auto overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleClosePathEdit}
                  className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                />

                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 290 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="edit-path-sheet-title"
                  id="edit-path-sheet"
                  className="relative w-full max-h-[88%] bg-white rounded-t-[32px] shadow-2xl border-t border-black/[0.05] z-10 flex flex-col overflow-hidden text-[#1C1C1E]"
                >
                  <div className="px-5 pt-5 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0">
                    <div>
                      <h3
                        id="edit-path-sheet-title"
                        className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                      >
                        Edit path
                      </h3>
                      <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                        Update phase names and short pacing notes
                      </p>
                    </div>

                    <button
                      type="button"
                      id="edit-path-close-btn"
                      onClick={handleClosePathEdit}
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>

                  <form
                    onSubmit={handleSavePathEdit}
                    className="flex-1 min-h-0 flex flex-col overflow-hidden"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-5">
                      {pathDraftPhases.map((draft, idx) => {
                        const isDraftCurrent = draft.id === currentPhase.id;
                        return (
                          <div
                            key={draft.id}
                            className={`flex flex-col gap-2.5 ${
                              idx > 0 ? 'pt-4 border-t border-black/[0.06]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-semibold leading-[18px] text-[#1C1C1E]">
                                Phase {idx + 1}
                              </span>
                              {isDraftCurrent && (
                                <span className="text-[12px] font-medium leading-[18px] text-[#5E5BAE]">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label
                                htmlFor={`edit-path-name-${idx}`}
                                className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                              >
                                Phase name
                              </label>
                              <input
                                id={`edit-path-name-${idx}`}
                                type="text"
                                value={draft.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPathDraftPhases((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, name: val } : item
                                    )
                                  );
                                }}
                                onFocus={handleFieldFocusScroll}
                                placeholder="Phase name"
                                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                              />
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label
                                htmlFor={`edit-path-desc-${idx}`}
                                className="text-[13px] font-medium leading-[18px] text-[#6E6E78]"
                              >
                                Short description
                              </label>
                              <input
                                id={`edit-path-desc-${idx}`}
                                type="text"
                                value={draft.description}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPathDraftPhases((prev) =>
                                    prev.map((item, i) =>
                                      i === idx ? { ...item, description: val } : item
                                    )
                                  );
                                }}
                                onFocus={handleFieldFocusScroll}
                                placeholder="One-line pacing direction"
                                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F2F2F7] border border-black/[0.06] text-[15px] font-normal leading-[21px] text-[#1C1C1E] placeholder-[#6E6E78]/70 focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="shrink-0 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white flex items-center gap-3">
                      <button
                        type="button"
                        id="edit-path-cancel-btn"
                        onClick={handleClosePathEdit}
                        className="min-h-[44px] px-4 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[15px] font-medium text-[#1C1C1E] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        id="edit-path-save-btn"
                        disabled={isPathSaveDisabled}
                        className={`flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold transition-colors ${
                          isPathSaveDisabled
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
          return createPortal(editPathPortal, phoneFrameRef.current);
        }
        return editPathPortal;
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
                    <h4 className="text-[15px] font-bold text-[#1C1C1E]">Delete preference?</h4>
                  </div>

                  <p className="text-[13px] text-[#6E6E78] leading-[18px]">
                    Remove <strong className="text-[#1C1C1E]">“{memoryToDelete.title}”</strong> from your saved preferences?
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      id="pref-delete-cancel-btn"
                      onClick={() => setMemoryToDelete(null)}
                      className="flex-1 min-h-[44px] rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[14px] font-medium text-[#1C1C1E] cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      id="pref-delete-confirm-btn"
                      onClick={handleDeleteMemoryConfirmed}
                      className="flex-1 min-h-[44px] rounded-[14px] bg-[#E11D48] hover:bg-[#BE123C] text-white text-[14px] font-semibold shadow-xs cursor-pointer transition-colors"
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
                      <h4 className="text-[15px] font-bold text-[#1C1C1E]">Preferences</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMemoryInfoModalOpen(false)}
                      className="w-8 h-8 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
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
                    className="w-full min-h-[44px] rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[14px] font-semibold shadow-2xs mt-1 transition-colors cursor-pointer"
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
                      <h4 className="text-[15px] font-bold text-[#1C1C1E]">How it’s measured</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMethodologyOpen(false)}
                      className="w-7 h-7 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs text-[#6C6C70] leading-relaxed">
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
                    className="w-full py-2.5 rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-xs font-semibold shadow-2xs mt-1 transition-colors cursor-pointer"
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
                      <h4 className="text-[15px] font-bold text-[#1C1C1E]">Select Month</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMonthPickerOpen(false)}
                      className="w-7 h-7 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#F2F2F7]/80 rounded-[14px]">
                    <button
                      type="button"
                      onClick={() => setPickerYear((y) => y - 1)}
                      className="px-2.5 py-1 text-xs font-semibold text-[#5E5BAE] hover:bg-black/5 active:scale-95 rounded-[8px] transition-all cursor-pointer"
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
                      className="px-2.5 py-1 text-xs font-semibold text-[#5E5BAE] hover:bg-black/5 active:scale-95 rounded-[8px] transition-all cursor-pointer"
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
                          className={`w-full p-2.5 rounded-[16px] text-left flex items-center justify-between transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#5E5BAE] text-white font-bold shadow-2xs'
                              : 'bg-[#F2F2F7]/75 hover:bg-[#E5E5EA] text-[#1C1C1E] border border-black/[0.04]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[13px]">{monthName}</span>
                            {isCurrent && (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
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
                            className={`text-[11px] ${
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
                        <h4 className="text-[15px] font-bold text-[#1C1C1E]">
                          {formattedDateString}
                        </h4>
                        {isSelectedDayToday && (
                          <span className="bg-[#5E5BAE] text-white text-[9.5px] px-2 py-0.5 rounded-full font-bold">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#8E8E93] block mt-0.5">
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
                      className="w-11 h-11 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] cursor-pointer shrink-0 transition-colors"
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
                                <div className="text-[11px] font-medium text-[#5E5BAE] mt-0.5">
                                  {catLabel} • {rec.durationMinutes} min
                                </div>
                                {rec.note && (
                                  <p className="text-[11px] text-[#6C6C70] italic mt-0.5 break-words">
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
                                  className="min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[11px] font-semibold text-[#5E5BAE] hover:bg-[#FAFAFC] transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  data-action="delete-day-activity"
                                  data-activity-id={rec.id}
                                  onClick={() => handleDeleteSingleDayActivity(rec.id)}
                                  className="min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[11px] font-semibold text-[#E11D48] hover:bg-[#FFF1F2] transition-colors cursor-pointer"
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
                              <div className="text-[11px] font-medium text-[#E11D48] mt-0.5">
                                Rest • Not counted as exercise
                              </div>
                              {restRec.note && (
                                <p className="text-[11px] text-[#6C6C70] italic mt-0.5 break-words">
                                  “{restRec.note}”
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              data-action="delete-day-rest"
                              data-rest-id={restRec.id}
                              onClick={() => handleDeleteSingleDayRest(restRec.id)}
                              className="min-h-[36px] px-2.5 rounded-[10px] bg-white border border-black/[0.06] text-[11px] font-semibold text-[#E11D48] hover:bg-[#FFF1F2] transition-colors cursor-pointer shrink-0"
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
                      <span className="text-xs font-bold text-[#1C1C1E]">
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
                          className="text-[11px] font-semibold text-[#5E5BAE] hover:underline cursor-pointer"
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
                        className={`py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer ${
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
                        className={`py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer ${
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
                        className={`py-1.5 rounded-[10px] text-xs font-semibold transition-all cursor-pointer ${
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
                            <span className="text-[11px] font-medium text-[#8E8E93]">
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
                                  className={`p-2 rounded-[12px] text-left text-[11px] font-semibold border transition-all cursor-pointer ${
                                    dayDraftTitle === preset.title
                                      ? 'bg-[#F4EEFE] border-[#5E5BAE] text-[#5E5BAE] shadow-2xs'
                                      : 'bg-white border-black/[0.05] text-[#1C1C1E] hover:bg-[#FAFAFC]'
                                  }`}
                                >
                                  <div className="truncate">{preset.title}</div>
                                  <span className="text-[10px] text-[#8E8E93] block mt-0.5">
                                    {preset.dur} min
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}

                        <div className="flex flex-col gap-1 mt-1">
                          <label className="text-[11px] font-medium text-[#8E8E93]">
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
                                className={`py-1.5 rounded-[10px] text-xs font-semibold border transition-all cursor-pointer ${
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
                          <label className="text-[11px] font-medium text-[#8E8E93]">
                            Duration
                          </label>
                          <div className="flex items-center gap-1">
                            {[5, 10, 15, 20, 30].map((dur) => (
                              <button
                                key={dur}
                                type="button"
                                data-day-duration={dur}
                                onClick={() => setDayDraftDuration(dur)}
                                className={`flex-1 py-1.5 rounded-[10px] text-xs font-semibold border transition-all cursor-pointer ${
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
                          <label className="text-[11px] font-medium text-[#8E8E93]">
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
                            className="w-full px-3 py-2 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-xs text-[#1C1C1E] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                          />
                        </div>
                      </div>
                    )}

                    {dayDraftType === 'rest' && (
                      <div className="p-3 rounded-[16px] bg-[#FFE4E6]/50 border border-[#E11D48]/20 text-[11.5px] leading-relaxed text-[#1C1C1E]">
                        <p>
                          <strong>Rest is recorded independently.</strong> It does not add to exercise sessions or active minutes.
                        </p>
                      </div>
                    )}

                    {dayDraftType === 'none' && (
                      <div className="p-3 rounded-[16px] bg-[#F2F2F7]/80 border border-black/[0.04] text-[11.5px] leading-relaxed text-[#6E6E78]">
                        Removes all recorded activities and rest entries for this day.
                      </div>
                    )}

                    {dayDraftType !== 'none' && (
                      <div className="flex flex-col gap-1 mt-0.5">
                        <label className="text-[11px] font-medium text-[#8E8E93]">
                          Note (Optional)
                        </label>
                        <input
                          id="history-day-note-input"
                          type="text"
                          value={dayDraftNote}
                          onChange={(e) => setDayDraftNote(e.target.value)}
                          placeholder="e.g. Easy pace around the block"
                          className="w-full px-3 py-2 rounded-[12px] bg-[#F2F2F7] border border-black/[0.06] text-xs text-[#1C1C1E] focus:outline-none focus:border-[#5E5BAE] focus:bg-white transition-colors"
                        />
                      </div>
                    )}
                  </div>

                  {isSaveDisabled && (
                    <p className="text-[11px] text-[#5E5BAE] font-medium text-center">
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
                      className="flex-1 py-2.5 rounded-[14px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      id="history-day-save-btn"
                      disabled={isSaveDisabled}
                      onClick={handleSaveDayRecord}
                      className={`flex-1 py-2.5 rounded-[14px] text-xs font-semibold shadow-sm transition-colors ${
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
