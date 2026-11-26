import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, RotateCcw, Trash2 } from 'lucide-react';
import {
  ActivityCategory,
  ActivityCompletionRecord,
  ActivityUpdatePatch,
  ManualActivityInput,
  RestRecord,
  formatShortMonthDay,
  parseLocalDateKey,
  toLocalDateKey,
} from '../utils/weeklyPlanStore';
import {
  AdjustGoalCommitmentInput,
  GoalReviewFeeling,
  HabitStartFrictionLevel,
  WeeklyHardFollowUpAnswer,
  WeeklyReviewFitAnswer,
} from '../utils/planDataFoundation';
import { PreferenceItem } from '../utils/preferencesStore';
import {
  GoalNovaConversation,
  type GoalHubHandlers,
  type GoalPlanSnapshot,
} from './GoalNovaConversation';
import { HabitNovaConversation } from './HabitNovaConversation';
import {
  PreferenceNovaConversation,
  type StructuredPreferenceSavePayload,
} from './PreferenceNovaConversation';

export type PlanNovaSourceModule =
  | 'goal'
  | 'journey'
  | 'weekly_review'
  | 'history'
  | 'preferences'
  | 'week_activity';

export interface PlanNovaCommitResult {
  ok: boolean;
  error?: string;
  confirmedSummary?: string;
}

export interface PlanNovaChatTextEvent {
  seq: number;
  text: string;
}

export type PlanNovaChatRequest =
  | {
      id: string;
      kind: 'adjust_goal';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      hasExistingCommitment: boolean;
      initialMode: 'strategy' | 'direction';
      initialValues: {
        goalText: string;
        strategyText: string;
        habitName: string;
        habitRegularAction: string;
        habitMinimumAction: string;
        habitFrequency: string;
      };
      onCommit: (
        input: Omit<AdjustGoalCommitmentInput, 'dateKey' | 'timestamp' | 'activeHabit'>
      ) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'review_goal';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      goalTitle: string;
      initialFeeling: GoalReviewFeeling;
      initialNote?: string;
      onCommit: (input: {
        decision: 'keep_exploring' | 'mark_complete';
        feeling: GoalReviewFeeling;
        outsideAppNote?: string;
      }) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'goal_next_step';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      initialChoice: 'keep_rhythm' | 'build_a_little' | 'new_focus';
      currentGoalText: string;
      currentStrategyText: string;
      currentHabitName: string;
      currentHabitAction: string;
      onCommit: (input: {
        choice: 'keep_rhythm' | 'build_a_little' | 'new_focus';
        goalText: string;
        strategyText: string;
        habitName?: string;
        habitRegularAction?: string;
        habitMinimumAction?: string;
      }) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'edit_habit';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      handlesThreadLocally: true;
      isConfirmingNew: boolean;
      initialValues: {
        habitName: string;
        regularAction: string;
        minimumAction: string;
      };
      onCommit: (input: {
        habitName: string;
        regularAction: string;
        minimumAction?: string;
      }) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'starting_feel';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      initialValue: HabitStartFrictionLevel | null;
      contextLabel: 'journey' | 'weekly_review';
      onCommit: (value: HabitStartFrictionLevel) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'review_suggestion';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      suggestionTitle: string;
      beforeLabel: string;
      afterLabel: string;
      editableAfter?: boolean;
      initialAfterValue?: string;
      primaryConfirmLabel: string;
      onConfirm: (editedValue?: string) => PlanNovaCommitResult;
      onDismiss: () => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'weekly_fit';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      weekRangeLabel: string;
      initialFit: WeeklyReviewFitAnswer | null;
      initialFollowUp: WeeklyHardFollowUpAnswer | null;
      onCommit: (input: {
        fit: WeeklyReviewFitAnswer;
        followUp: WeeklyHardFollowUpAnswer | null;
      }) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'weekly_note';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      weekRangeLabel: string;
      initialNote: string;
      onCommit: (input: { note: string; skipped: boolean }) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'log_workout';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      initialDateKey: string;
      initialMode?: 'workout' | 'rest';
      initialEditActivityId?: string | null;
      initialRestNote?: string;
      externalImportIds?: string[];
      activityRecords: ActivityCompletionRecord[];
      restRecords: RestRecord[];
      onAddActivity: (input: ManualActivityInput) => PlanNovaCommitResult;
      onUpdateActivity: (recordId: string, patch: ActivityUpdatePatch) => PlanNovaCommitResult;
      onDeleteActivity: (recordId: string) => PlanNovaCommitResult;
      onUpsertRestDay: (dateKey: string, note?: string) => PlanNovaCommitResult;
      onDeleteRestRecord: (restId: string) => PlanNovaCommitResult;
      onClearDay: (dateKey: string) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'edit_preference';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      handlesThreadLocally: true;
      mode: 'add' | 'edit' | 'confirm';
      existingItem?: PreferenceItem;
      allItems: PreferenceItem[];
      onSave: (payload: StructuredPreferenceSavePayload) => PlanNovaCommitResult;
      onIgnorePending?: (itemId: string) => PlanNovaCommitResult;
    }
  | {
      id: string;
      kind: 'goal_hub';
      actionTitle: string;
      sourceModule: PlanNovaSourceModule;
      sourceLabel: string;
      introMessage: string;
      inputPlaceholder: string;
      handlesThreadLocally: true;
      initialSnapshot: GoalPlanSnapshot;
      handlers: GoalHubHandlers;
    };

interface PlanNovaChatWidgetProps {
  request: PlanNovaChatRequest;
  incomingTextEvent: PlanNovaChatTextEvent | null;
  onAppendNovaNotice: (text: string) => void;
  onClose: () => void;
  onScrollToBottom?: () => void;
  onUpdateInputPlaceholder?: (placeholder: string) => void;
  onFocusChatInput?: () => void;
}

const GOAL_DIRECTION_CHIPS = [
  'Stay active at an easy pace',
  'Build a walking routine',
  'Move more on busy weekdays',
  'Ease back into movement',
];

const STRATEGY_CHIPS = [
  '10 min walk, 3 times a week',
  '15 min walk after dinner',
  '5 min stretch on tired days',
  'Short walk twice a week',
];

type WorkoutCategory = Exclude<ActivityCategory, 'rest'>;

const WORKOUT_PRESETS: Array<{
  label: string;
  title: string;
  category: WorkoutCategory;
  durationMinutes: number;
}> = [
  { label: 'Walk · 10m', title: 'Short walk', category: 'walk', durationMinutes: 10 },
  { label: 'Walk · 20m', title: 'Neighborhood walk', category: 'walk', durationMinutes: 20 },
  { label: 'Stretch · 5m', title: 'Gentle stretch', category: 'stretch', durationMinutes: 5 },
  { label: 'Yoga · 15m', title: 'Yoga', category: 'stretch', durationMinutes: 15 },
  { label: 'Run · 15m', title: 'Easy run', category: 'other', durationMinutes: 15 },
  { label: 'Bike · 20m', title: 'Cycling', category: 'other', durationMinutes: 20 },
];


const WEEKLY_FIT_CHOICES: Array<{ value: WeeklyReviewFitAnswer; label: string }> = [
  { value: 'hard_to_fit_in', label: 'Hard to fit' },
  { value: 'about_right', label: 'About right' },
  { value: 'room_for_more', label: 'Room for more' },
];

const WEEKLY_HARD_FOLLOWUPS: Array<{ value: WeeklyHardFollowUpAnswer; label: string }> = [
  { value: 'too_long', label: 'Too long to start' },
  { value: 'timing_off', label: "Timing didn't line up" },
  { value: 'need_backup', label: 'Needed a backup' },
  { value: 'busy_week', label: 'Just a busy week' },
];

const WEEKLY_NOTE_CHIPS = [
  'Walked outside without logging',
  'Did light stretches at home',
  'Mostly rested this week',
  'Busy schedule this week',
];

function formatDateReadable(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  if (!d || Number.isNaN(d.getTime())) return dateKey;
  return formatShortMonthDay(d);
}

function parseWorkoutInputText(raw: string): {
  title: string;
  category?: WorkoutCategory;
  durationMinutes?: number;
} {
  const cleaned = raw.trim();
  const lower = cleaned.toLowerCase();
  const minMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes|m)\b/);
  const durationMinutes = minMatch ? Math.min(240, Math.max(1, Number(minMatch[1]))) : undefined;

  let category: WorkoutCategory | undefined;
  if (/\b(walk|walking|stroll|hike|hiking)\b/.test(lower)) {
    category = 'walk';
  } else if (/\b(stretch|stretching|yoga|mobility|pilates)\b/.test(lower)) {
    category = 'stretch';
  } else if (/\b(run|running|jog|bike|cycling|swim|swimming|strength|gym|workout)\b/.test(lower)) {
    category = 'other';
  }

  return {
    title: cleaned,
    category,
    durationMinutes,
  };
}

export const PlanNovaChatWidget: React.FC<PlanNovaChatWidgetProps> = ({
  request,
  ...rest
}) => {
  if (request.kind === 'goal_hub') {
    return (
      <GoalNovaConversation
        key={request.id}
        initialSnapshot={request.initialSnapshot}
        handlers={request.handlers}
        incomingTextEvent={rest.incomingTextEvent}
        onScrollToBottom={rest.onScrollToBottom}
        onUpdateInputPlaceholder={rest.onUpdateInputPlaceholder}
        onFocusChatInput={rest.onFocusChatInput}
      />
    );
  }
  if (request.kind === 'edit_habit') {
    return (
      <HabitNovaConversation
        key={request.id}
        initialSnapshot={request.initialValues}
        isConfirmingNew={request.isConfirmingNew}
        onSaveHabit={(next) =>
          request.onCommit({
            habitName: next.habitName,
            regularAction: next.regularAction,
            minimumAction: next.minimumAction.trim() || undefined,
          })
        }
        incomingTextEvent={rest.incomingTextEvent}
        onScrollToBottom={rest.onScrollToBottom}
        onUpdateInputPlaceholder={rest.onUpdateInputPlaceholder}
        onFocusChatInput={rest.onFocusChatInput}
      />
    );
  }
  if (request.kind === 'edit_preference') {
    return (
      <PreferenceNovaConversation
        key={request.id}
        mode={request.mode}
        existingItem={request.existingItem}
        allItems={request.allItems}
        onSavePreference={request.onSave}
        onIgnorePending={request.onIgnorePending}
        incomingTextEvent={rest.incomingTextEvent}
        onScrollToBottom={rest.onScrollToBottom}
        onUpdateInputPlaceholder={rest.onUpdateInputPlaceholder}
      />
    );
  }
  return <LegacyPlanNovaChatWidget {...rest} request={request} />;
};

const LegacyPlanNovaChatWidget: React.FC<
  Omit<PlanNovaChatWidgetProps, 'request'> & {
    request: Exclude<
      PlanNovaChatRequest,
      { kind: 'goal_hub' } | { kind: 'edit_habit' } | { kind: 'edit_preference' }
    >;
  }
> = ({
  request,
  incomingTextEvent,
  onAppendNovaNotice,
  onClose,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const [confirmedSummary, setConfirmedSummary] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const lastHandledSeqRef = useRef<number>(0);
  const retryActionRef = useRef<(() => void) | null>(null);

  // Reset shared status when request ID changes
  useEffect(() => {
    setIsSubmitting(false);
    setIsCommitted(false);
    setConfirmedSummary(null);
    setErrorMsg(null);
    submitLockRef.current = false;
    retryActionRef.current = null;
    lastHandledSeqRef.current = 0;
  }, [request.id]);

  // --- Per-kind draft states ---
  // 1. adjust_goal
  const [goalMode, setGoalMode] = useState<'strategy' | 'direction'>(
    request.kind === 'adjust_goal' ? request.initialMode : 'strategy'
  );
  const [goalText, setGoalText] = useState(
    request.kind === 'adjust_goal'
      ? request.initialValues.goalText
      : request.kind === 'goal_next_step'
      ? request.currentGoalText
      : ''
  );
  const [strategyText, setStrategyText] = useState(
    request.kind === 'adjust_goal'
      ? request.initialValues.strategyText
      : request.kind === 'goal_next_step'
      ? request.currentStrategyText
      : ''
  );
  const [habitName, setHabitName] = useState(
    request.kind === 'adjust_goal'
      ? request.initialValues.habitName
      : request.kind === 'goal_next_step'
      ? request.currentHabitName
      : ''
  );
  const [habitRegular, setHabitRegular] = useState(
    request.kind === 'adjust_goal'
      ? request.initialValues.habitRegularAction
      : request.kind === 'goal_next_step'
      ? request.currentHabitAction
      : ''
  );
  const [habitMinimum, setHabitMinimum] = useState(
    request.kind === 'adjust_goal' ? request.initialValues.habitMinimumAction : ''
  );

  // 2. review_goal
  const [reviewFeeling, setReviewFeeling] = useState<GoalReviewFeeling>(
    request.kind === 'review_goal' ? request.initialFeeling : 'steady'
  );
  const [reviewDecision, setReviewDecision] = useState<'keep_exploring' | 'mark_complete'>(
    'keep_exploring'
  );
  const [reviewNote, setReviewNote] = useState(
    request.kind === 'review_goal' ? request.initialNote ?? '' : ''
  );

  // 3. goal_next_step
  const [nextStepChoice, setNextStepChoice] = useState<
    'keep_rhythm' | 'build_a_little' | 'new_focus'
  >(request.kind === 'goal_next_step' ? request.initialChoice : 'keep_rhythm');

  // 5. starting_feel
  const [startingFeelDraft, setStartingFeelDraft] = useState<HabitStartFrictionLevel | null>(
    request.kind === 'starting_feel' ? request.initialValue : null
  );

  // 6. review_suggestion editable after value
  const [suggestionAfterDraft, setSuggestionAfterDraft] = useState<string>(
    request.kind === 'review_suggestion'
      ? request.initialAfterValue ?? request.afterLabel
      : ''
  );

  // 7. weekly_fit
  const [fitDraft, setFitDraft] = useState<WeeklyReviewFitAnswer | null>(
    request.kind === 'weekly_fit' ? request.initialFit : null
  );
  const [followUpDraft, setFollowUpDraft] = useState<WeeklyHardFollowUpAnswer | null>(
    request.kind === 'weekly_fit' ? request.initialFollowUp : null
  );

  // 8. weekly_note
  const [weeklyNoteDraft, setWeeklyNoteDraft] = useState(
    request.kind === 'weekly_note' ? request.initialNote : ''
  );

  // 9. log_workout
  const [logDateKey, setLogDateKey] = useState(
    request.kind === 'log_workout' ? request.initialDateKey : toLocalDateKey(new Date())
  );
  const [logMode, setLogMode] = useState<'workout' | 'rest' | 'clear'>('workout');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [pendingDeleteActivityId, setPendingDeleteActivityId] = useState<string | null>(null);
  const [pendingDeleteRestId, setPendingDeleteRestId] = useState<string | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState('Short walk');
  const [workoutCategory, setWorkoutCategory] = useState<WorkoutCategory>('walk');
  const [workoutDuration, setWorkoutDuration] = useState<string>('10');
  const [workoutNote, setWorkoutNote] = useState('');
  const [restNote, setRestNote] = useState('');


  // Sync draft state when request changes
  useEffect(() => {
    if (request.kind === 'adjust_goal') {
      setGoalMode(request.initialMode);
      setGoalText(request.initialValues.goalText);
      setStrategyText(request.initialValues.strategyText);
      setHabitName(request.initialValues.habitName);
      setHabitRegular(request.initialValues.habitRegularAction);
      setHabitMinimum(request.initialValues.habitMinimumAction);
    } else if (request.kind === 'review_goal') {
      setReviewFeeling(request.initialFeeling);
      setReviewDecision('keep_exploring');
      setReviewNote(request.initialNote ?? '');
    } else if (request.kind === 'goal_next_step') {
      setNextStepChoice(request.initialChoice);
      setGoalText(request.currentGoalText);
      setStrategyText(request.currentStrategyText);
      setHabitName(request.currentHabitName);
      setHabitRegular(request.currentHabitAction);
      setHabitMinimum('');
    } else if (request.kind === 'starting_feel') {
      setStartingFeelDraft(request.initialValue);
    } else if (request.kind === 'review_suggestion') {
      setSuggestionAfterDraft(request.initialAfterValue ?? request.afterLabel);
    } else if (request.kind === 'weekly_fit') {
      setFitDraft(request.initialFit);
      setFollowUpDraft(request.initialFollowUp);
    } else if (request.kind === 'weekly_note') {
      setWeeklyNoteDraft(request.initialNote);
    } else if (request.kind === 'log_workout') {
      setLogDateKey(request.initialDateKey);
      setPendingDeleteActivityId(null);
      setPendingDeleteRestId(null);
      const externalSet = new Set(request.externalImportIds ?? []);
      const targetEditRec = request.initialEditActivityId
        ? request.activityRecords.find((r) => r.id === request.initialEditActivityId) ?? null
        : null;
      if (targetEditRec && !externalSet.has(targetEditRec.id)) {
        setLogMode('workout');
        setEditingRecordId(targetEditRec.id);
        setWorkoutTitle(targetEditRec.title);
        setWorkoutCategory(targetEditRec.category === 'rest' ? 'other' : targetEditRec.category);
        setWorkoutDuration(String(targetEditRec.durationMinutes || 10));
        setWorkoutNote(targetEditRec.note ?? '');
        setRestNote('');
      } else if (request.initialMode === 'rest') {
        setLogMode('rest');
        setEditingRecordId(null);
        setWorkoutTitle('Short walk');
        setWorkoutCategory('walk');
        setWorkoutDuration('10');
        setWorkoutNote('');
        setRestNote(request.initialRestNote ?? '');
      } else {
        setLogMode('workout');
        setEditingRecordId(null);
        setWorkoutTitle('Short walk');
        setWorkoutCategory('walk');
        setWorkoutDuration('10');
        setWorkoutNote('');
        setRestNote('');
      }
    }
  }, [request]);

  // Apply freeform user message from Nova's bottom input bar to the active draft (never auto-commits)
  useEffect(() => {
    if (!incomingTextEvent || incomingTextEvent.seq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = incomingTextEvent.seq;
    if (isCommitted) return;

    const text = incomingTextEvent.text.trim();
    if (!text) return;
    setErrorMsg(null);

    if (request.kind === 'adjust_goal') {
      if (goalMode === 'direction') {
        setGoalText(text);
        onAppendNovaNotice('Updated the goal draft. Review and confirm when ready.');
      } else {
        setStrategyText(text);
        onAppendNovaNotice('Updated the strategy draft. Review and confirm when ready.');
      }
    } else if (request.kind === 'review_goal') {
      setReviewNote(text);
      onAppendNovaNotice('Added your note to the review draft. Confirm when ready.');
    } else if (request.kind === 'goal_next_step') {
      if (nextStepChoice === 'new_focus') {
        setGoalText(text);
      } else {
        setStrategyText(text);
      }
      onAppendNovaNotice('Updated your next-step draft. Confirm when ready.');
    } else if (request.kind === 'starting_feel') {
      const lower = text.toLowerCase();
      if (lower.includes('hard') || lower.includes('tough') || lower.includes('difficult')) {
        setStartingFeelDraft('hard_to_start');
      } else if (lower.includes('easy') || lower.includes('easier') || lower.includes('natural')) {
        setStartingFeelDraft('easier');
      } else {
        setStartingFeelDraft('manageable');
      }
      onAppendNovaNotice('Selected the matching option below. Confirm to save.');
    } else if (request.kind === 'review_suggestion') {
      if (request.editableAfter) {
        setSuggestionAfterDraft(text);
        onAppendNovaNotice('Updated the proposed setting below. Confirm to apply.');
      }
    } else if (request.kind === 'weekly_fit') {
      const lower = text.toLowerCase();
      if (lower.includes('hard') || lower.includes('busy') || lower.includes('long')) {
        setFitDraft('hard_to_fit_in');
        if (lower.includes('busy')) setFollowUpDraft('busy_week');
        else if (lower.includes('long')) setFollowUpDraft('too_long');
        else if (lower.includes('time') || lower.includes('timing')) setFollowUpDraft('timing_off');
      } else if (lower.includes('more') || lower.includes('easy')) {
        setFitDraft('room_for_more');
        setFollowUpDraft(null);
      } else {
        setFitDraft('about_right');
        setFollowUpDraft(null);
      }
      onAppendNovaNotice('Updated your draft answer. Tap Confirm to save.');
    } else if (request.kind === 'weekly_note') {
      setWeeklyNoteDraft(text);
      onAppendNovaNotice('Updated your note draft. Tap Confirm to save.');
    } else if (request.kind === 'log_workout') {
      const lower = text.toLowerCase();
      if (lower.includes('rest day') || lower === 'rest') {
        setLogMode('rest');
        setRestNote(text);
        onAppendNovaNotice('Drafted a rest day. Tap Confirm to save.');
      } else {
        const parsed = parseWorkoutInputText(text);
        setLogMode('workout');
        setWorkoutTitle(parsed.title);
        if (parsed.category) setWorkoutCategory(parsed.category);
        if (parsed.durationMinutes) setWorkoutDuration(String(parsed.durationMinutes));
        onAppendNovaNotice('Filled your workout draft. Check the details and confirm.');
      }
    }
  }, [
    incomingTextEvent,
    isCommitted,
    request.kind,
    goalMode,
    nextStepChoice,
    habitName,
    onAppendNovaNotice,
  ]);

  const runCommit = (fn: () => PlanNovaCommitResult, fallbackSummary: string) => {
    if (submitLockRef.current || isCommitted) return;
    submitLockRef.current = true;
    retryActionRef.current = () => runCommit(fn, fallbackSummary);
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const result = fn();
      if (result.ok) {
        setIsCommitted(true);
        const summary = result.confirmedSummary || fallbackSummary;
        setConfirmedSummary(summary);
        onAppendNovaNotice(summary);
      } else {
        setErrorMsg(result.error || "Couldn't save your change. Try again.");
      }
    } catch {
      setErrorMsg("Couldn't save your change. Try again.");
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  // Day records for log_workout
  const dayActivities = useMemo(() => {
    if (request.kind !== 'log_workout') return [];
    return request.activityRecords.filter((r) => r.dateKey === logDateKey);
  }, [request, logDateKey]);

  const dayRests = useMemo(() => {
    if (request.kind !== 'log_workout') return [];
    return request.restRecords.filter((r) => r.dateKey === logDateKey);
  }, [request, logDateKey]);

  const renderFooterButtons = (
    confirmLabel: string,
    onConfirmClick: () => void,
    disabledConfirm = false,
    extraSecondary?: { label: string; onClick: () => void; danger?: boolean }
  ) => {
    if (isCommitted) {
      return (
        <div className="pt-2 space-y-2.5">
          {confirmedSummary && (
            <div className="flex items-start gap-2 rounded-[14px] bg-[#F3F0FA] border border-[#5E5BAE]/20 px-3 py-2 text-[13px] leading-[18px] text-[#4E4A93]">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#5E5BAE]" />
              <span>{confirmedSummary}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-[14px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold transition-colors cursor-pointer"
          >
            Back to {request.sourceLabel}
          </button>
        </div>
      );
    }

    return (
      <div className="pt-2 space-y-2">
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            {retryActionRef.current && (
              <button
                type="button"
                onClick={() => retryActionRef.current?.()}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 shrink-0 font-semibold text-[#9A3832] underline underline-offset-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] px-3.5 rounded-[14px] border border-black/[0.08] bg-white hover:bg-[#F5F5F7] text-[#3F3A4D] text-[14px] font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {extraSecondary && (
            <button
              type="button"
              onClick={extraSecondary.onClick}
              disabled={isSubmitting}
              className={`min-h-[44px] px-3.5 rounded-[14px] border text-[14px] font-semibold transition-colors cursor-pointer ${
                extraSecondary.danger
                  ? 'border-[#F3CBC5] bg-[#FFF4F2] text-[#9A3832] hover:bg-[#FDE9E6]'
                  : 'border-black/[0.08] bg-[#F7F6FA] text-[#555066] hover:bg-[#EFECE6]'
              }`}
            >
              {extraSecondary.label}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirmClick}
            disabled={disabledConfirm || isSubmitting}
            className={`flex-1 min-h-[44px] px-4 rounded-[14px] text-[15px] font-semibold transition-colors ${
              disabledConfirm || isSubmitting
                ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed'
                : 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
            }`}
          >
            {isSubmitting ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // WIDGET RENDERERS BY KIND
  // =========================================================================

  if (request.kind === 'adjust_goal') {
    const canSave =
      goalMode === 'direction'
        ? goalText.trim().length > 0 && strategyText.trim().length > 0
        : strategyText.trim().length > 0;
    const beforeSummary = request.hasExistingCommitment
      ? goalMode === 'direction'
        ? request.initialValues.goalText
        : request.initialValues.strategyText || request.initialValues.habitRegularAction
      : '';
    const afterSummary =
      goalMode === 'direction'
        ? `${goalText.trim() || '—'}${strategyText.trim() ? ` · ${strategyText.trim()}` : ''}`
        : strategyText.trim() || '—';

    return (
      <div
        id="plan-nova-widget-adjust-goal"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {request.hasExistingCommitment && !isCommitted && (
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-[12px] bg-[#F3F2F8]">
            <button
              type="button"
              onClick={() => setGoalMode('strategy')}
              className={`min-h-[36px] rounded-[10px] text-[13px] font-semibold transition-colors cursor-pointer ${
                goalMode === 'strategy'
                  ? 'bg-white text-[#5E5BAE] shadow-2xs'
                  : 'text-[#666076]'
              }`}
            >
              Adjust strategy
            </button>
            <button
              type="button"
              onClick={() => setGoalMode('direction')}
              className={`min-h-[36px] rounded-[10px] text-[13px] font-semibold transition-colors cursor-pointer ${
                goalMode === 'direction'
                  ? 'bg-white text-[#5E5BAE] shadow-2xs'
                  : 'text-[#666076]'
              }`}
            >
              Change goal
            </button>
          </div>
        )}

        {!isCommitted && (
          <>
            {(goalMode === 'direction' || !request.hasExistingCommitment) && (
              <div className="space-y-1.5">
                <label className="block text-[13px] font-semibold text-[#555066]">
                  Goal
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_DIRECTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setGoalText(chip)}
                      className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium border transition-colors cursor-pointer ${
                        goalText === chip
                          ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                          : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="e.g. Stay active at an easy pace"
                  className="w-full min-h-[42px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[15px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#555066]">
                Strategy
              </label>
              <div className="flex flex-wrap gap-1.5">
                {STRATEGY_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setStrategyText(chip)}
                    className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium border transition-colors cursor-pointer ${
                      strategyText === chip
                        ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                        : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={strategyText}
                onChange={(e) => setStrategyText(e.target.value)}
                placeholder="e.g. 10 min walk, 3 times a week"
                className="w-full min-h-[42px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[15px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 pt-0.5">
              <div>
                <label className="block text-[13px] font-semibold text-[#555066] mb-1">
                  Habit (optional)
                </label>
                <input
                  type="text"
                  value={habitRegular}
                  onChange={(e) => setHabitRegular(e.target.value)}
                  placeholder="Regular action, e.g. 10-minute walk"
                  className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                />
              </div>
              <input
                type="text"
                value={habitMinimum}
                onChange={(e) => setHabitMinimum(e.target.value)}
                placeholder="Lighter version (optional), e.g. 5-minute walk"
                className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
              />
            </div>

            {beforeSummary && (
              <div className="rounded-[12px] bg-[#F7F6FA] border border-black/[0.06] px-3 py-2 text-[13px] leading-[18px] space-y-1">
                <div className="text-[#787287]">Before: {beforeSummary}</div>
                <div className="text-[#1C1C1E] font-medium">After: {afterSummary}</div>
              </div>
            )}
          </>
        )}

        {renderFooterButtons(
          request.hasExistingCommitment ? 'Confirm change' : 'Save goal',
          () => {
            if (!canSave) return;
            runCommit(
              () =>
                request.onCommit({
                  mode:
                    request.hasExistingCommitment && goalMode === 'strategy'
                      ? 'adjust_strategy'
                      : 'new_direction',
                  summary:
                    goalText.trim() ||
                    request.initialValues.goalText ||
                    strategyText.trim(),
                  strategySummary: strategyText.trim(),
                  habitLabel: habitName.trim() || undefined,
                  regularAction: habitRegular.trim() || undefined,
                  minimumAction: habitMinimum.trim() || undefined,
                  frequencyDescription: request.initialValues.habitFrequency || undefined,
                }),
              'Goal updated.'
            );
          },
          !canSave
        )}
      </div>
    );
  }

  if (request.kind === 'review_goal') {
    const feelings: Array<{ value: GoalReviewFeeling; label: string }> = [
      { value: 'steady', label: 'Feels steady' },
      { value: 'still_finding_fit', label: 'Still finding a fit' },
      { value: 'ready_to_wrap', label: 'Ready to wrap up' },
    ];

    return (
      <div
        id="plan-nova-widget-review-goal"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <>
            <div className="space-y-1.5">
              <div className="text-[13px] font-semibold text-[#555066]">
                How does "{request.goalTitle}" feel right now?
              </div>
              <div className="flex flex-wrap gap-1.5">
                {feelings.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={reviewFeeling === item.value}
                    onClick={() => {
                      setReviewFeeling(item.value);
                      if (item.value === 'ready_to_wrap') {
                        setReviewDecision('mark_complete');
                      }
                    }}
                    className={`min-h-[38px] px-3 rounded-[12px] text-[13px] font-semibold border transition-colors cursor-pointer ${
                      reviewFeeling === item.value
                        ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                        : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[13px] font-semibold text-[#555066]">Decision</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={reviewDecision === 'keep_exploring'}
                  onClick={() => setReviewDecision('keep_exploring')}
                  className={`min-h-[40px] px-3 rounded-[12px] text-[13px] font-semibold border transition-colors cursor-pointer ${
                    reviewDecision === 'keep_exploring'
                      ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                      : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                  }`}
                >
                  Keep exploring
                </button>
                <button
                  type="button"
                  aria-pressed={reviewDecision === 'mark_complete'}
                  onClick={() => setReviewDecision('mark_complete')}
                  className={`min-h-[40px] px-3 rounded-[12px] text-[13px] font-semibold border transition-colors cursor-pointer ${
                    reviewDecision === 'mark_complete'
                      ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                      : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                  }`}
                >
                  Mark complete
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-semibold text-[#555066]">
                Note (optional)
              </label>
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Any movement outside the app?"
                className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
              />
            </div>
          </>
        )}

        {renderFooterButtons(
          reviewDecision === 'mark_complete' ? 'Confirm complete' : 'Save check-in',
          () => {
            runCommit(
              () =>
                request.onCommit({
                  decision: reviewDecision,
                  feeling: reviewFeeling,
                  outsideAppNote: reviewNote.trim() || undefined,
                }),
              reviewDecision === 'mark_complete' ? 'Goal marked complete.' : 'Review saved.'
            );
          }
        )}
      </div>
    );
  }

  if (request.kind === 'goal_next_step') {
    const choices: Array<{ value: 'keep_rhythm' | 'build_a_little' | 'new_focus'; label: string }> = [
      { value: 'keep_rhythm', label: 'Keep this rhythm' },
      { value: 'build_a_little', label: 'Build a little' },
      { value: 'new_focus', label: 'Choose a new focus' },
    ];
    const needsGoal = nextStepChoice === 'new_focus';
    const canSave =
      nextStepChoice === 'keep_rhythm' ||
      (strategyText.trim().length > 0 && (!needsGoal || goalText.trim().length > 0));

    return (
      <div
        id="plan-nova-widget-goal-next-step"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={nextStepChoice === c.value}
                  onClick={() => setNextStepChoice(c.value)}
                  className={`min-h-[38px] px-3 rounded-[12px] text-[13px] font-semibold border transition-colors cursor-pointer ${
                    nextStepChoice === c.value
                      ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                      : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {nextStepChoice === 'new_focus' && (
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-[#555066]">New goal</label>
                <input
                  type="text"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="What do you want to focus on next?"
                  className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                />
              </div>
            )}

            {nextStepChoice !== 'keep_rhythm' && (
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-[#555066]">Strategy</label>
                <input
                  type="text"
                  value={strategyText}
                  onChange={(e) => setStrategyText(e.target.value)}
                  placeholder="e.g. 15 min walk, 3 times a week"
                  className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                />
              </div>
            )}
          </>
        )}

        {renderFooterButtons(
          'Confirm next step',
          () => {
            if (!canSave) return;
            runCommit(
              () =>
                request.onCommit({
                  choice: nextStepChoice,
                  goalText: goalText.trim() || request.currentGoalText,
                  strategyText: strategyText.trim() || request.currentStrategyText,
                  habitName: habitName.trim() || undefined,
                  habitRegularAction: habitRegular.trim() || undefined,
                  habitMinimumAction: habitMinimum.trim() || undefined,
                }),
              'Next step saved.'
            );
          },
          !canSave
        )}
      </div>
    );
  }

  if (request.kind === 'starting_feel') {
    const options: Array<{ value: HabitStartFrictionLevel; label: string }> = [
      { value: 'hard_to_start', label: 'Hard to start' },
      { value: 'manageable', label: 'Took a nudge' },
      {
        value: 'easier',
        label: request.contextLabel === 'weekly_review' ? 'Easy to start' : 'Feels easier',
      },
    ];

    return (
      <div
        id="plan-nova-widget-starting-feel"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <div className="grid grid-cols-1 gap-2">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={startingFeelDraft === opt.value}
                onClick={() => setStartingFeelDraft(opt.value)}
                className={`min-h-[44px] px-3.5 rounded-[12px] text-[14px] font-semibold text-left border transition-colors cursor-pointer ${
                  startingFeelDraft === opt.value
                    ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                    : 'bg-[#F7F6FA] border-black/[0.06] text-[#3F3A4D]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {renderFooterButtons(
          'Confirm',
          () => {
            if (!startingFeelDraft) return;
            runCommit(() => request.onCommit(startingFeelDraft), 'Check-in saved.');
          },
          !startingFeelDraft
        )}
      </div>
    );
  }

  if (request.kind === 'review_suggestion') {
    const needsText = Boolean(request.editableAfter);
    const canConfirm = !needsText || suggestionAfterDraft.trim().length > 0;

    return (
      <div
        id="plan-nova-widget-review-suggestion"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <div className="rounded-[12px] bg-[#F7F6FA] border border-black/[0.06] px-3 py-2.5 text-[13px] leading-[19px] space-y-1.5">
            <div className="font-semibold text-[#1C1C1E]">{request.suggestionTitle}</div>
            <div className="text-[#787287]">Before: {request.beforeLabel}</div>
            {request.editableAfter ? (
              <div className="space-y-1">
                <label className="block text-[12px] font-semibold text-[#5E5BAE]">After</label>
                <input
                  type="text"
                  value={suggestionAfterDraft}
                  onChange={(e) => setSuggestionAfterDraft(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 rounded-[10px] bg-white border border-black/[0.1] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                />
              </div>
            ) : (
              <div className="text-[#1C1C1E] font-medium">After: {request.afterLabel}</div>
            )}
          </div>
        )}

        {renderFooterButtons(
          request.primaryConfirmLabel,
          () =>
            runCommit(
              () =>
                request.onConfirm(
                  request.editableAfter ? suggestionAfterDraft.trim() : undefined
                ),
              'Adjustment applied.'
            ),
          !canConfirm,
          {
            label: 'Not now',
            onClick: () => runCommit(() => request.onDismiss(), 'Kept your current plan.'),
          }
        )}
      </div>
    );
  }

  if (request.kind === 'weekly_fit') {
    return (
      <div
        id="plan-nova-widget-weekly-fit"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <>
            <div className="text-[13px] font-semibold text-[#555066]">
              {request.weekRangeLabel}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {WEEKLY_FIT_CHOICES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={fitDraft === opt.value}
                  onClick={() => {
                    setFitDraft(opt.value);
                    if (opt.value !== 'hard_to_fit_in') setFollowUpDraft(null);
                  }}
                  className={`min-h-[42px] px-2 rounded-[12px] text-[13px] font-semibold border transition-colors cursor-pointer ${
                    fitDraft === opt.value
                      ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                      : 'bg-[#F7F6FA] border-black/[0.06] text-[#3F3A4D]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {fitDraft === 'hard_to_fit_in' && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[13px] font-semibold text-[#555066]">
                  What got in the way? (optional)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKLY_HARD_FOLLOWUPS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={followUpDraft === item.value}
                      onClick={() =>
                        setFollowUpDraft((prev) => (prev === item.value ? null : item.value))
                      }
                      className={`min-h-[36px] px-3 rounded-[10px] text-[12px] font-semibold border transition-colors cursor-pointer ${
                        followUpDraft === item.value
                          ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                          : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {renderFooterButtons(
          'Confirm',
          () => {
            if (!fitDraft) return;
            runCommit(
              () => request.onCommit({ fit: fitDraft, followUp: followUpDraft }),
              'Weekly answer saved.'
            );
          },
          !fitDraft
        )}
      </div>
    );
  }

  if (request.kind === 'weekly_note') {
    return (
      <div
        id="plan-nova-widget-weekly-note"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {WEEKLY_NOTE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setWeeklyNoteDraft(chip)}
                  className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium border transition-colors cursor-pointer ${
                    weeklyNoteDraft === chip
                      ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                      : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={weeklyNoteDraft}
              onChange={(e) => setWeeklyNoteDraft(e.target.value)}
              placeholder="Optional note for this week"
              className="w-full min-h-[42px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
            />
          </>
        )}

        {renderFooterButtons(
          'Save note',
          () => {
            if (!weeklyNoteDraft.trim()) return;
            runCommit(
              () => request.onCommit({ note: weeklyNoteDraft.trim(), skipped: false }),
              'Weekly note saved.'
            );
          },
          !weeklyNoteDraft.trim(),
          {
            label: 'Skip',
            onClick: () =>
              runCommit(
                () => request.onCommit({ note: '', skipped: true }),
                'Skipped weekly note.'
              ),
          }
        )}
      </div>
    );
  }

  if (request.kind === 'log_workout') {
    const hasDayItems = dayActivities.length > 0 || dayRests.length > 0;
    const parsedDuration = Number(workoutDuration);
    const validDuration =
      Number.isFinite(parsedDuration) && parsedDuration > 0
        ? Math.min(240, Math.round(parsedDuration))
        : 10;

    return (
      <div
        id="plan-nova-widget-log-workout"
        className="w-full rounded-[20px] bg-white border border-black/[0.07] p-3.5 shadow-xs space-y-3"
      >
        {!isCommitted && (
          <>
            {/* Date row */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[#555066]">
                Date · {formatDateReadable(logDateKey)}
              </span>
              <input
                type="date"
                aria-label="Activity date"
                value={logDateKey}
                onChange={(e) => {
                  if (e.target.value) {
                    setLogDateKey(e.target.value);
                    setEditingRecordId(null);
                    setPendingDeleteActivityId(null);
                    setPendingDeleteRestId(null);
                  }
                }}
                className="min-h-[34px] px-2.5 rounded-[10px] bg-[#F7F6FA] border border-black/[0.08] text-[13px] text-[#1C1C1E]"
              />
            </div>

            {/* Existing records on selected date */}
            {hasDayItems && (
              <div className="space-y-1.5 rounded-[12px] bg-[#F7F6FA] border border-black/[0.05] p-2.5">
                <div className="text-[12px] font-semibold text-[#787287]">
                  Logged on {formatDateReadable(logDateKey)}
                </div>
                {dayActivities.map((rec) => {
                  const isEditingThis = editingRecordId === rec.id;
                  const isDeletingThis = pendingDeleteActivityId === rec.id;
                  const isExternalImport = Boolean(request.externalImportIds?.includes(rec.id));
                  return (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between gap-2 text-[13px] text-[#1C1C1E]"
                    >
                      <div className="min-w-0 flex flex-col">
                        <span className="truncate font-medium">
                          {rec.title}
                          {rec.durationMinutes ? ` · ${rec.durationMinutes}m` : ''}
                        </span>
                        {isExternalImport && (
                          <span className="text-[11px] font-normal text-[#787287]">
                            Apple Health · imported
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isExternalImport && (
                          <button
                            type="button"
                            onClick={() => {
                              setLogMode('workout');
                              setEditingRecordId(rec.id);
                              setPendingDeleteActivityId(null);
                              setPendingDeleteRestId(null);
                              setWorkoutTitle(rec.title);
                              setWorkoutCategory(
                                rec.category === 'rest' ? 'other' : rec.category
                              );
                              setWorkoutDuration(String(rec.durationMinutes || 10));
                              setWorkoutNote(rec.note ?? '');
                            }}
                            className={`px-2 py-1 rounded-[8px] text-[12px] font-semibold cursor-pointer ${
                              isEditingThis
                                ? 'bg-[#5E5BAE] text-white'
                                : 'bg-white border border-black/[0.08] text-[#5E5BAE]'
                            }`}
                          >
                            {isEditingThis ? 'Editing' : 'Edit'}
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete ${rec.title}`}
                          onClick={() => {
                            setEditingRecordId(null);
                            setPendingDeleteRestId(null);
                            setPendingDeleteActivityId(isDeletingThis ? null : rec.id);
                          }}
                          className={`p-1.5 rounded-[8px] cursor-pointer ${
                            isDeletingThis
                              ? 'bg-[#9A3832] text-white'
                              : 'bg-white border border-black/[0.08] text-[#787287] hover:text-[#9A3832]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {dayRests.map((rest) => {
                  const isDeletingRest = pendingDeleteRestId === rest.id;
                  return (
                    <div
                      key={rest.id}
                      className="flex items-center justify-between gap-2 text-[13px] text-[#555066]"
                    >
                      <span className="truncate">Rest day{rest.note ? ` · ${rest.note}` : ''}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteActivityId(null);
                          setPendingDeleteRestId(isDeletingRest ? null : rest.id);
                        }}
                        className={`px-2 py-1 rounded-[8px] text-[12px] font-semibold cursor-pointer ${
                          isDeletingRest
                            ? 'bg-[#9A3832] text-white'
                            : 'bg-white border border-black/[0.08] text-[#787287]'
                        }`}
                      >
                        {isDeletingRest ? 'Removing' : 'Remove'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mode tabs */}
            {!pendingDeleteActivityId && !pendingDeleteRestId && (
              <>
                <div className="flex gap-1.5 p-1 rounded-[12px] bg-[#F3F2F8]">
                  <button
                    type="button"
                    onClick={() => setLogMode('workout')}
                    className={`flex-1 min-h-[34px] rounded-[9px] text-[13px] font-semibold cursor-pointer ${
                      logMode === 'workout' ? 'bg-white text-[#5E5BAE] shadow-2xs' : 'text-[#666076]'
                    }`}
                  >
                    {editingRecordId ? 'Edit workout' : 'Workout'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecordId(null);
                      setLogMode('rest');
                    }}
                    className={`flex-1 min-h-[34px] rounded-[9px] text-[13px] font-semibold cursor-pointer ${
                      logMode === 'rest' ? 'bg-white text-[#5E5BAE] shadow-2xs' : 'text-[#666076]'
                    }`}
                  >
                    Rest day
                  </button>
                  {hasDayItems && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecordId(null);
                        setLogMode('clear');
                      }}
                      className={`px-2.5 min-h-[34px] rounded-[9px] text-[13px] font-semibold cursor-pointer ${
                        logMode === 'clear'
                          ? 'bg-white text-[#9A3832] shadow-2xs'
                          : 'text-[#666076]'
                      }`}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {logMode === 'workout' && (
                  <div className="space-y-2.5">
                    {!editingRecordId && (
                      <div className="flex flex-wrap gap-1.5">
                        {WORKOUT_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setWorkoutTitle(p.title);
                              setWorkoutCategory(p.category);
                              setWorkoutDuration(String(p.durationMinutes));
                            }}
                            className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-medium border cursor-pointer ${
                              workoutTitle === p.title &&
                              Number(workoutDuration) === p.durationMinutes
                                ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                                : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      value={workoutTitle}
                      onChange={(e) => setWorkoutTitle(e.target.value)}
                      placeholder="Workout name"
                      className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                    />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1.5">
                        {(['walk', 'stretch', 'other'] as WorkoutCategory[]).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setWorkoutCategory(cat)}
                            className={`min-h-[34px] px-2.5 rounded-[10px] text-[12px] font-semibold border capitalize cursor-pointer ${
                              workoutCategory === cat
                                ? 'bg-[#F3EEFE] border-[#5E5BAE] text-[#4E4A93]'
                                : 'bg-[#F7F6FA] border-black/[0.06] text-[#555066]'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={workoutDuration}
                          onChange={(e) => setWorkoutDuration(e.target.value)}
                          aria-label="Duration minutes"
                          className="w-14 min-h-[34px] px-2 rounded-[10px] bg-[#F7F6FA] border border-black/[0.08] text-[13px] text-center text-[#1C1C1E]"
                        />
                        <span className="text-[12px] text-[#787287]">min</span>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={workoutNote}
                      onChange={(e) => setWorkoutNote(e.target.value)}
                      placeholder="Optional note"
                      aria-label="Workout note"
                      className="w-full min-h-[38px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[13px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                    />
                  </div>
                )}

                {logMode === 'rest' && (
                  <input
                    type="text"
                    value={restNote}
                    onChange={(e) => setRestNote(e.target.value)}
                    placeholder="Optional note (e.g. Recovery day)"
                    className="w-full min-h-[40px] px-3 rounded-[12px] bg-[#F7F6FA] border border-black/[0.08] text-[14px] text-[#1C1C1E] outline-none focus:border-[#5E5BAE]"
                  />
                )}

                {logMode === 'clear' && (
                  <p className="text-[13px] leading-[18px] text-[#787287]">
                    Remove all logged workouts and rest entries on {formatDateReadable(logDateKey)}.
                  </p>
                )}
              </>
            )}

            {(pendingDeleteActivityId || pendingDeleteRestId) && (
              <p className="text-[13px] leading-[18px] text-[#9A3832]">
                Confirm removing this entry from {formatDateReadable(logDateKey)}?
              </p>
            )}
          </>
        )}

        {renderFooterButtons(
          pendingDeleteActivityId || pendingDeleteRestId
            ? 'Confirm remove'
            : logMode === 'clear'
            ? 'Clear day'
            : logMode === 'rest'
            ? 'Save rest day'
            : editingRecordId
            ? 'Save changes'
            : 'Confirm workout',
          () => {
            if (pendingDeleteActivityId) {
              runCommit(
                () => request.onDeleteActivity(pendingDeleteActivityId),
                `Removed workout on ${formatDateReadable(logDateKey)}.`
              );
              return;
            }
            if (pendingDeleteRestId) {
              runCommit(
                () => request.onDeleteRestRecord(pendingDeleteRestId),
                `Removed rest day on ${formatDateReadable(logDateKey)}.`
              );
              return;
            }
            if (logMode === 'clear') {
              runCommit(
                () => request.onClearDay(logDateKey),
                `Cleared entries on ${formatDateReadable(logDateKey)}.`
              );
              return;
            }
            if (logMode === 'rest') {
              runCommit(
                () => request.onUpsertRestDay(logDateKey, restNote.trim() || undefined),
                `Saved rest day for ${formatDateReadable(logDateKey)}.`
              );
              return;
            }
            const cleanTitle = workoutTitle.trim();
            if (!cleanTitle) return;
            if (editingRecordId) {
              runCommit(
                () =>
                  request.onUpdateActivity(editingRecordId, {
                    dateKey: logDateKey,
                    title: cleanTitle,
                    category: workoutCategory,
                    durationMinutes: validDuration,
                    note: workoutNote.trim() || undefined,
                  }),
                `Updated "${cleanTitle}" (${validDuration} min).`
              );
            } else {
              runCommit(
                () =>
                  request.onAddActivity({
                    dateKey: logDateKey,
                    title: cleanTitle,
                    category: workoutCategory,
                    durationMinutes: validDuration,
                    note: workoutNote.trim() || undefined,
                  }),
                `Logged "${cleanTitle}" (${validDuration} min) on ${formatDateReadable(logDateKey)}.`
              );
            }
          },
          logMode === 'workout' && !pendingDeleteActivityId && !pendingDeleteRestId && !workoutTitle.trim()
        )}
      </div>
    );
  }

  return null;
};
