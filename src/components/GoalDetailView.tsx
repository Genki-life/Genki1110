import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { JourneyActionResult } from './YourJourneyView';
import {
  AdjustGoalCommitmentInput,
  CompletedGoalNextStepChoice,
  ConfirmedActionStrategy,
  GoalReviewFeeling,
  PhaseCommitmentRecord,
  PlanFoundationStore,
  deriveCommitmentStrategyLine,
  formatGoalReviewFeelingLabel,
  getGoalReviewEvidence,
} from '../utils/planDataFoundation';

export type GoalDetailSubMode = 'overview' | 'adjust' | 'review' | 'confirm_completion';

export interface GoalNextStepSubmitInput {
  choice: CompletedGoalNextStepChoice;
  nextStrategySummary?: string;
  nextRegularAction?: string;
  nextMinimumAction?: string;
  nextFrequencyDescription?: string;
  newFocusSummary?: string;
  newFocusOriginalIntent?: string;
}

interface GoalDetailViewProps {
  store: PlanFoundationStore;
  commitment: PhaseCommitmentRecord;
  activeHabit: ConfirmedActionStrategy | null;
  referenceDate: Date;
  initialMode?: GoalDetailSubMode;
  onModeChange?: (mode: GoalDetailSubMode) => void;
  onAdjustGoal: (
    input: Omit<AdjustGoalCommitmentInput, 'dateKey' | 'timestamp' | 'activeHabit'>
  ) => JourneyActionResult;
  onKeepExploring: (input: {
    feeling?: GoalReviewFeeling;
    outsidePracticeNote?: string;
  }) => JourneyActionResult;
  onConfirmCompletion: (input: {
    feeling?: GoalReviewFeeling;
    outsidePracticeNote?: string;
  }) => JourneyActionResult;
  onApplyNextStep: (input: GoalNextStepSubmitInput) => JourneyActionResult;
}

const GOAL_FEELING_OPTIONS: Array<{ value: GoalReviewFeeling; label: string }> = [
  { value: 'steady', label: 'Feels steady' },
  { value: 'still_finding_fit', label: 'Still finding a fit' },
  { value: 'ready_to_wrap', label: 'Ready to wrap up' },
];

function formatShortIsoDate(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function GoalDetailView({
  store,
  commitment,
  activeHabit,
  referenceDate,
  initialMode = 'overview',
  onModeChange,
  onAdjustGoal,
  onKeepExploring,
  onConfirmCompletion,
  onApplyNextStep,
}: GoalDetailViewProps) {
  const [mode, setMode] = useState<GoalDetailSubMode>(initialMode);

  // Sync sub-mode when parent re-opens sheet in a specific mode
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const strategyLine = useMemo(
    () => deriveCommitmentStrategyLine(commitment),
    [commitment]
  );

  const primaryStrategyHabit = activeHabit ?? commitment.strategies[0] ?? null;

  const evidence = useMemo(
    () => getGoalReviewEvidence(store, commitment, primaryStrategyHabit, referenceDate),
    [store, commitment, primaryStrategyHabit, referenceDate]
  );

  // --- Adjust Goal state ---
  const [adjustMode, setAdjustMode] = useState<'adjust_strategy' | 'new_direction'>(
    'adjust_strategy'
  );
  const [adjustSummary, setAdjustSummary] = useState<string>('');
  const [adjustOriginalIntent, setAdjustOriginalIntent] = useState<string>('');
  const [adjustStrategySummary, setAdjustStrategySummary] = useState<string>('');
  const [adjustRegularAction, setAdjustRegularAction] = useState<string>('');
  const [adjustMinimumAction, setAdjustMinimumAction] = useState<string>('');
  const [adjustFrequency, setAdjustFrequency] = useState<string>('');
  const [adjustObservationWindow, setAdjustObservationWindow] = useState<string>('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustFailedRetryable, setAdjustFailedRetryable] = useState<boolean>(false);

  const openAdjustFlow = () => {
    setAdjustMode('adjust_strategy');
    setAdjustSummary(commitment.summary);
    setAdjustOriginalIntent(commitment.originalIntent ?? '');
    setAdjustStrategySummary(commitment.strategySummary ?? strategyLine ?? '');
    setAdjustRegularAction(primaryStrategyHabit?.regularAction ?? '');
    setAdjustMinimumAction(primaryStrategyHabit?.minimumAction ?? '');
    setAdjustFrequency(primaryStrategyHabit?.frequencyDescription ?? '');
    setAdjustObservationWindow(commitment.observationWindow ?? '');
    setAdjustError(null);
    setAdjustFailedRetryable(false);
    setMode('adjust');
  };

  const handleSelectAdjustMode = (nextAdjustMode: 'adjust_strategy' | 'new_direction') => {
    setAdjustMode(nextAdjustMode);
    setAdjustError(null);
    setAdjustFailedRetryable(false);
    if (nextAdjustMode === 'new_direction') {
      setAdjustSummary('');
      setAdjustOriginalIntent('');
      setAdjustStrategySummary('');
      setAdjustRegularAction('');
      setAdjustMinimumAction('');
      setAdjustFrequency('');
      setAdjustObservationWindow('');
    } else {
      setAdjustSummary(commitment.summary);
      setAdjustOriginalIntent(commitment.originalIntent ?? '');
      setAdjustStrategySummary(commitment.strategySummary ?? strategyLine ?? '');
      setAdjustRegularAction(primaryStrategyHabit?.regularAction ?? '');
      setAdjustMinimumAction(primaryStrategyHabit?.minimumAction ?? '');
      setAdjustFrequency(primaryStrategyHabit?.frequencyDescription ?? '');
      setAdjustObservationWindow(commitment.observationWindow ?? '');
    }
  };

  const submitAdjustGoal = () => {
    const trimmedSummary = adjustSummary.trim();
    if (!trimmedSummary) {
      setAdjustError('Enter a short focus summary before saving.');
      setAdjustFailedRetryable(false);
      return;
    }

    const res = onAdjustGoal({
      mode: adjustMode,
      summary: trimmedSummary,
      originalIntent:
        adjustOriginalIntent.trim() ||
        (adjustMode === 'new_direction' ? trimmedSummary : commitment.originalIntent),
      strategySummary:
        adjustStrategySummary.trim() ||
        (adjustRegularAction.trim()
          ? adjustFrequency.trim()
            ? `${adjustRegularAction.trim()} · ${adjustFrequency.trim()}`
            : adjustRegularAction.trim()
          : null),
      regularAction: adjustRegularAction.trim() || undefined,
      minimumAction: adjustMinimumAction.trim() || undefined,
      frequencyDescription: adjustFrequency.trim() || undefined,
      observationWindow: adjustObservationWindow.trim() || null,
    });

    if (!res.ok) {
      setAdjustError(
        res.error ?? 'Couldn’t save your changes. Your current goal stays unchanged.'
      );
      setAdjustFailedRetryable(true);
      return;
    }

    setAdjustError(null);
    setAdjustFailedRetryable(false);
    setMode('overview');
  };

  // --- Review Goal & Confirm Completion state ---
  const [reviewFeeling, setReviewFeeling] = useState<GoalReviewFeeling | undefined>(
    commitment.reviewReflection?.feeling
  );
  const [outsidePracticeNote, setOutsidePracticeNote] = useState<string>(
    commitment.reviewReflection?.outsidePracticeNote ?? ''
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewFailedAction, setReviewFailedAction] = useState<
    'keep_exploring' | 'confirm_completion' | null
  >(null);

  const openReviewFlow = () => {
    setReviewFeeling(commitment.reviewReflection?.feeling);
    setOutsidePracticeNote(commitment.reviewReflection?.outsidePracticeNote ?? '');
    setReviewError(null);
    setReviewFailedAction(null);
    setMode('review');
  };

  const submitKeepExploring = () => {
    const res = onKeepExploring({
      feeling: reviewFeeling,
      outsidePracticeNote: outsidePracticeNote.trim() || undefined,
    });
    if (!res.ok) {
      setReviewError(
        res.error ?? 'Couldn’t save your review right now. Please try again.'
      );
      setReviewFailedAction('keep_exploring');
      return;
    }
    setReviewError(null);
    setReviewFailedAction(null);
    setMode('overview');
  };

  const submitConfirmCompletion = () => {
    const res = onConfirmCompletion({
      feeling: reviewFeeling,
      outsidePracticeNote: outsidePracticeNote.trim() || undefined,
    });
    if (!res.ok) {
      setReviewError(
        res.error ?? 'Couldn’t save completion right now. Your goal is still in progress.'
      );
      setReviewFailedAction('confirm_completion');
      return;
    }
    setReviewError(null);
    setReviewFailedAction(null);
    setSelectedNextStep(null);
    setNextStepError(null);
    setNextStepFailedRetryable(false);
    setMode('overview');
  };

  // --- Post-Completion Next Step state ---
  const [selectedNextStep, setSelectedNextStep] =
    useState<CompletedGoalNextStepChoice | null>(null);
  const [buildRegularDraft, setBuildRegularDraft] = useState<string>('');
  const [buildMinimumDraft, setBuildMinimumDraft] = useState<string>('');
  const [buildFreqDraft, setBuildFreqDraft] = useState<string>('');
  const [buildStrategyDraft, setBuildStrategyDraft] = useState<string>('');
  const [newFocusSummaryDraft, setNewFocusSummaryDraft] = useState<string>('');
  const [newFocusIntentDraft, setNewFocusIntentDraft] = useState<string>('');
  const [newFocusStrategyDraft, setNewFocusStrategyDraft] = useState<string>('');
  const [newFocusRegularDraft, setNewFocusRegularDraft] = useState<string>('');
  const [newFocusMinimumDraft, setNewFocusMinimumDraft] = useState<string>('');
  const [newFocusFreqDraft, setNewFocusFreqDraft] = useState<string>('');
  const [nextStepError, setNextStepError] = useState<string | null>(null);
  const [nextStepFailedRetryable, setNextStepFailedRetryable] = useState<boolean>(false);

  const handleSelectNextStep = (choice: CompletedGoalNextStepChoice) => {
    setSelectedNextStep(choice);
    setNextStepError(null);
    setNextStepFailedRetryable(false);

    if (choice === 'build_a_little') {
      const baseAction =
        primaryStrategyHabit?.regularAction ||
        commitment.strategySummary ||
        commitment.summary;
      setBuildRegularDraft(baseAction);
      setBuildMinimumDraft(primaryStrategyHabit?.minimumAction ?? '');
      setBuildFreqDraft(primaryStrategyHabit?.frequencyDescription ?? '');
      setBuildStrategyDraft(commitment.strategySummary ?? strategyLine ?? baseAction);
    } else if (choice === 'new_focus') {
      setNewFocusSummaryDraft('');
      setNewFocusIntentDraft('');
      setNewFocusStrategyDraft('');
      setNewFocusRegularDraft('');
      setNewFocusMinimumDraft('');
      setNewFocusFreqDraft('');
    }
  };

  const submitSelectedNextStep = () => {
    if (!selectedNextStep) return;

    if (selectedNextStep === 'keep_rhythm') {
      const res = onApplyNextStep({ choice: 'keep_rhythm' });
      if (!res.ok) {
        setNextStepError(
          res.error ?? 'Couldn’t save your choice. Your completed goal stays saved.'
        );
        setNextStepFailedRetryable(true);
        return;
      }
      setSelectedNextStep(null);
      setNextStepError(null);
      setNextStepFailedRetryable(false);
      return;
    }

    if (selectedNextStep === 'build_a_little') {
      const trimmedAction = buildRegularDraft.trim();
      const trimmedStrategy = buildStrategyDraft.trim();
      if (!trimmedAction && !trimmedStrategy) {
        setNextStepError('Enter the updated movement strategy before confirming.');
        setNextStepFailedRetryable(false);
        return;
      }
      const res = onApplyNextStep({
        choice: 'build_a_little',
        nextRegularAction: trimmedAction || undefined,
        nextMinimumAction: buildMinimumDraft.trim() || undefined,
        nextFrequencyDescription: buildFreqDraft.trim() || undefined,
        nextStrategySummary:
          trimmedStrategy ||
          (trimmedAction && buildFreqDraft.trim()
            ? `${trimmedAction} · ${buildFreqDraft.trim()}`
            : trimmedAction),
      });
      if (!res.ok) {
        setNextStepError(
          res.error ?? 'Couldn’t save your update. Your completed goal stays saved.'
        );
        setNextStepFailedRetryable(true);
        return;
      }
      setSelectedNextStep(null);
      setNextStepError(null);
      setNextStepFailedRetryable(false);
      return;
    }

    // new_focus
    const trimmedSummary = newFocusSummaryDraft.trim();
    if (!trimmedSummary) {
      setNextStepError('Enter your new focus summary before confirming.');
      setNextStepFailedRetryable(false);
      return;
    }

    const res = onApplyNextStep({
      choice: 'new_focus',
      newFocusSummary: trimmedSummary,
      newFocusOriginalIntent: newFocusIntentDraft.trim() || trimmedSummary,
      nextStrategySummary:
        newFocusStrategyDraft.trim() ||
        (newFocusRegularDraft.trim()
          ? newFocusFreqDraft.trim()
            ? `${newFocusRegularDraft.trim()} · ${newFocusFreqDraft.trim()}`
            : newFocusRegularDraft.trim()
          : undefined),
      nextRegularAction: newFocusRegularDraft.trim() || undefined,
      nextMinimumAction: newFocusMinimumDraft.trim() || undefined,
      nextFrequencyDescription: newFocusFreqDraft.trim() || undefined,
    });
    if (!res.ok) {
      setNextStepError(
        res.error ?? 'Couldn’t save your new focus. Your completed goal stays saved.'
      );
      setNextStepFailedRetryable(true);
      return;
    }
    setSelectedNextStep(null);
    setNextStepError(null);
    setNextStepFailedRetryable(false);
  };

  const isCompleted = commitment.status === 'completed';
  const completedDateLabel = formatShortIsoDate(commitment.completedAt);
  const observationWindow =
    typeof commitment.observationWindow === 'string' && commitment.observationWindow.trim().length > 0
      ? commitment.observationWindow.trim()
      : null;

  const startingAmount =
    primaryStrategyHabit?.minimumAction?.trim() ||
    primaryStrategyHabit?.regularAction?.trim() ||
    null;

  const frequencyText = primaryStrategyHabit?.frequencyDescription?.trim() || null;

  const pastCommitments = store.pastCommitments ?? [];

  // ============================================================================
  // SUB-VIEW 1: OVERVIEW (About this goal / Completed + Next steps)
  // ============================================================================
  if (mode === 'overview') {
    return (
      <div
        id="view-goal-detail-page"
        data-goal-status={commitment.status}
        data-goal-version={commitment.version}
        className="flex flex-col gap-4 text-[15px] leading-[22px] text-[#302D3D]"
      >
        {/* Completed Banner */}
        {isCompleted && (
          <div
            id="goal-completed-banner"
            className="rounded-[18px] bg-[#F3F0FA] border border-[#7770B6]/20 p-4 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#5E5BAE] text-white inline-flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
                Goal completed
              </span>
              {completedDateLabel && (
                <span className="ml-auto text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums">
                  {completedDateLabel}
                </span>
              )}
            </div>
            <p className="text-[13px] font-normal leading-[18px] text-[#625A76]">
              Choose what feels right next whenever you’re ready — leaving this page keeps your completed goal saved.
            </p>
          </div>
        )}

        {/* Commitment Facts Card */}
        <section
          aria-label="Current goal details"
          className="rounded-[20px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.08)] p-4 flex flex-col gap-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
              Status
            </span>
            <span
              id="goal-detail-status-text"
              className={`text-[13px] font-semibold leading-[18px] ${
                isCompleted ? 'text-[#5E5BAE]' : 'text-[#302D3D]'
              }`}
            >
              {isCompleted ? 'Completed' : `In progress · v${commitment.version}`}
            </span>
          </div>

          {commitment.originalIntent && (
            <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Original intent
              </span>
              <p
                id="goal-detail-original-intent"
                className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
              >
                “{commitment.originalIntent}”
              </p>
            </div>
          )}

          <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
              Focus summary
            </span>
            <p
              id="goal-detail-summary"
              className="text-[15px] font-semibold leading-[22px] text-[#302D3D] break-words"
            >
              {commitment.summary}
            </p>
          </div>

          {strategyLine && (
            <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Confirmed movement strategy
              </span>
              <p
                id="goal-detail-strategy"
                className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
              >
                {strategyLine}
              </p>
            </div>
          )}

          {startingAmount && (
            <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Starting amount
              </span>
              <p
                id="goal-detail-starting-amount"
                className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
              >
                {startingAmount}
              </p>
            </div>
          )}

          {frequencyText && (
            <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Frequency
              </span>
              <p
                id="goal-detail-frequency"
                className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
              >
                {frequencyText}
              </p>
              <span className="text-[12px] font-normal leading-[16px] text-[#8B8498]">
                Describes your pace — not a score target.
              </span>
            </div>
          )}

          {/* Observation window ONLY rendered if explicitly agreed & saved */}
          {observationWindow && (
            <div
              id="goal-detail-observation-window"
              className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1"
            >
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Agreed observation window
              </span>
              <p className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words">
                {observationWindow}
              </p>
            </div>
          )}

          {/* Saved self-report reflection if present */}
          {commitment.reviewReflection &&
            (commitment.reviewReflection.feeling ||
              commitment.reviewReflection.outsidePracticeNote) && (
              <div
                id="goal-detail-saved-reflection"
                className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1"
              >
                <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                  Your latest check-in (self-report)
                </span>
                {commitment.reviewReflection.feeling && (
                  <p className="text-[14px] font-medium leading-[20px] text-[#514879]">
                    {formatGoalReviewFeelingLabel(commitment.reviewReflection.feeling)}
                  </p>
                )}
                {commitment.reviewReflection.outsidePracticeNote && (
                  <p className="text-[14px] font-normal leading-[20px] text-[#524C63] break-words">
                    “{commitment.reviewReflection.outsidePracticeNote}”
                  </p>
                )}
              </div>
            )}
        </section>

        {/* Actions: Active Goal -> Review goal + Adjust goal; Completed Goal -> 3 Next Steps */}
        {!isCompleted ? (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              id="goal-open-review-btn"
              onClick={openReviewFlow}
              className="genki-plan-control w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
            >
              Review goal
            </button>

            <button
              type="button"
              id="goal-open-adjust-btn"
              onClick={openAdjustFlow}
              className="genki-plan-control w-full min-h-[44px] px-4 rounded-[12px] bg-[#EEEDF6] hover:bg-[#E4E2F1] text-[#514C8C] text-[15px] font-semibold flex items-center justify-center cursor-pointer"
            >
              Adjust goal
            </button>
          </div>
        ) : (
          <section
            id="goal-next-step-options"
            aria-label="What would you like to do next?"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-0.5">
              <h4 className="text-[16px] font-semibold leading-[22px] text-[#302D3D]">
                What would you like to do next?
              </h4>
              <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                Pick a direction now, or come back later — nothing changes until you confirm.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                id="goal-next-keep-btn"
                aria-pressed={selectedNextStep === 'keep_rhythm'}
                onClick={() => handleSelectNextStep('keep_rhythm')}
                className={`genki-plan-control w-full min-h-[52px] px-4 py-3 rounded-[12px] border text-left flex items-center justify-between gap-3 cursor-pointer ${
                  selectedNextStep === 'keep_rhythm'
                    ? 'bg-[#EAE6F7] border-[#9F95CE] text-[#302D3D]'
                    : 'bg-[#F6F4FA] border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7]'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-semibold leading-[21px]">
                    Keep this rhythm
                  </span>
                  <span className="text-[13px] font-normal leading-[18px] text-[#625A76]">
                    Stay with your confirmed action amount without adding load.
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#706A7C] shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                id="goal-next-build-btn"
                aria-pressed={selectedNextStep === 'build_a_little'}
                onClick={() => handleSelectNextStep('build_a_little')}
                className={`genki-plan-control w-full min-h-[52px] px-4 py-3 rounded-[12px] border text-left flex items-center justify-between gap-3 cursor-pointer ${
                  selectedNextStep === 'build_a_little'
                    ? 'bg-[#EAE6F7] border-[#9F95CE] text-[#302D3D]'
                    : 'bg-[#F6F4FA] border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7]'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-semibold leading-[21px]">
                    Build a little
                  </span>
                  <span className="text-[13px] font-normal leading-[18px] text-[#625A76]">
                    Review and confirm a gentle next step on this same habit.
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#706A7C] shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                id="goal-next-new-focus-btn"
                aria-pressed={selectedNextStep === 'new_focus'}
                onClick={() => handleSelectNextStep('new_focus')}
                className={`genki-plan-control w-full min-h-[52px] px-4 py-3 rounded-[12px] border text-left flex items-center justify-between gap-3 cursor-pointer ${
                  selectedNextStep === 'new_focus'
                    ? 'bg-[#EAE6F7] border-[#9F95CE] text-[#302D3D]'
                    : 'bg-[#F6F4FA] border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7]'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px] font-semibold leading-[21px]">
                    Choose a new focus
                  </span>
                  <span className="text-[13px] font-normal leading-[18px] text-[#625A76]">
                    Start a fresh commitment while preserving this completed goal and history.
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#706A7C] shrink-0" aria-hidden="true" />
              </button>
            </div>

            {/* Concrete Confirmation Panel for selected next step */}
            {selectedNextStep && (
              <div
                id="goal-next-step-confirm-panel"
                className="rounded-[18px] bg-white border border-[rgba(74,66,98,0.12)] p-4 flex flex-col gap-3"
              >
                {selectedNextStep === 'keep_rhythm' && (
                  <>
                    <span className="text-[13px] font-semibold leading-[18px] text-[#5E5BAE]">
                      Preview · Same confirmed action
                    </span>
                    <p className="text-[15px] font-normal leading-[22px] text-[#302D3D]">
                      {strategyLine || commitment.summary}
                    </p>
                    {startingAmount && (
                      <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                        Starting amount stays: {startingAmount}
                      </p>
                    )}
                  </>
                )}

                {selectedNextStep === 'build_a_little' && (
                  <>
                    <span className="text-[13px] font-semibold leading-[18px] text-[#5E5BAE]">
                      Preview · Build gently on this goal
                    </span>
                    <div className="rounded-[12px] bg-[#F8F6FC] p-3 flex flex-col gap-1.5 text-[13px] leading-[18px]">
                      <div className="text-[#706A7C]">
                        Current: <span className="text-[#302D3D]">{strategyLine || commitment.summary}</span>
                      </div>
                      <div className="text-[#5E5BAE]">
                        Proposed:{' '}
                        <span className="font-semibold text-[#302D3D]">
                          {buildStrategyDraft.trim() || buildRegularDraft.trim() || '—'}
                        </span>
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Updated movement action
                      </span>
                      <input
                        id="goal-next-build-regular-input"
                        type="text"
                        value={buildRegularDraft}
                        onChange={(e) => {
                          setBuildRegularDraft(e.target.value);
                          setBuildStrategyDraft(
                            buildFreqDraft.trim()
                              ? `${e.target.value} · ${buildFreqDraft.trim()}`
                              : e.target.value
                          );
                          setNextStepError(null);
                        }}
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Frequency (descriptive only)
                      </span>
                      <input
                        id="goal-next-build-freq-input"
                        type="text"
                        value={buildFreqDraft}
                        onChange={(e) => {
                          setBuildFreqDraft(e.target.value);
                          setBuildStrategyDraft(
                            buildRegularDraft.trim() && e.target.value.trim()
                              ? `${buildRegularDraft.trim()} · ${e.target.value.trim()}`
                              : buildRegularDraft.trim()
                          );
                        }}
                        placeholder="e.g. A few mornings a week"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                  </>
                )}

                {selectedNextStep === 'new_focus' && (
                  <>
                    <span className="text-[13px] font-semibold leading-[18px] text-[#5E5BAE]">
                      Preview · Start a new focus
                    </span>
                    <div className="rounded-[12px] bg-[#F8F6FC] p-3 flex flex-col gap-1 text-[13px] leading-[18px]">
                      <div className="text-[#706A7C]">
                        Preserved goal:{' '}
                        <span className="text-[#302D3D]">{commitment.summary}</span>
                      </div>
                      <div className="text-[#5E5BAE]">
                        New focus:{' '}
                        <span className="font-semibold text-[#302D3D]">
                          {newFocusSummaryDraft.trim() || 'Enter below'}
                        </span>
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        New focus summary
                      </span>
                      <input
                        id="goal-next-new-summary-input"
                        type="text"
                        value={newFocusSummaryDraft}
                        onChange={(e) => {
                          setNewFocusSummaryDraft(e.target.value);
                          setNextStepError(null);
                        }}
                        placeholder="e.g. Unwind my shoulders after work"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Original intent (optional)
                      </span>
                      <input
                        id="goal-next-new-intent-input"
                        type="text"
                        value={newFocusIntentDraft}
                        onChange={(e) => setNewFocusIntentDraft(e.target.value)}
                        placeholder="In your own words"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Movement strategy
                      </span>
                      <input
                        id="goal-next-new-regular-input"
                        type="text"
                        value={newFocusRegularDraft}
                        onChange={(e) => {
                          setNewFocusRegularDraft(e.target.value);
                          setNewFocusStrategyDraft(e.target.value);
                        }}
                        placeholder="e.g. 8-min evening stretch"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Starting amount (optional)
                      </span>
                      <input
                        id="goal-next-new-minimum-input"
                        type="text"
                        value={newFocusMinimumDraft}
                        onChange={(e) => setNewFocusMinimumDraft(e.target.value)}
                        placeholder="e.g. 2-min shoulder roll"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-medium text-[#706A7C]">
                        Frequency (optional, descriptive only)
                      </span>
                      <input
                        id="goal-next-new-freq-input"
                        type="text"
                        value={newFocusFreqDraft}
                        onChange={(e) => setNewFocusFreqDraft(e.target.value)}
                        placeholder="e.g. Most weekdays"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    </label>
                  </>
                )}

                {nextStepError && (
                  <div
                    id="goal-next-step-error"
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                      {nextStepError}
                    </span>
                    {nextStepFailedRetryable && (
                      <button
                        type="button"
                        id="goal-next-retry-btn"
                        onClick={submitSelectedNextStep}
                        className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    id="goal-next-confirm-btn"
                    onClick={submitSelectedNextStep}
                    className="genki-plan-control flex-1 min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold cursor-pointer"
                  >
                    {selectedNextStep === 'keep_rhythm'
                      ? 'Keep this rhythm'
                      : 'Let’s try this'}
                  </button>
                  <button
                    type="button"
                    id="goal-next-cancel-btn"
                    onClick={() => {
                      setSelectedNextStep(null);
                      setNextStepError(null);
                      setNextStepFailedRetryable(false);
                    }}
                    className="genki-plan-control min-h-[44px] px-3 rounded-[12px] text-[14px] font-medium text-[#625A76] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Preserved Past Commitments */}
        {pastCommitments.length > 0 && (
          <section
            id="goal-past-commitments"
            aria-label="Previous goals"
            className="pt-2 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
          >
            <h4 className="text-[13px] font-semibold leading-[18px] text-[#706A7C]">
              Previous goals ({pastCommitments.length})
            </h4>
            <div className="flex flex-col gap-2">
              {pastCommitments
                .slice()
                .reverse()
                .map((past) => (
                  <div
                    key={`${past.id}-${past.version}`}
                    className="rounded-[14px] bg-[#F8F6FC] px-3.5 py-2.5 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-medium leading-[20px] text-[#302D3D] break-words">
                        {past.summary}
                      </span>
                      <span className="text-[12px] leading-[16px] text-[#706A7C] shrink-0">
                        {past.status === 'completed' ? 'Completed' : `v${past.version}`}
                      </span>
                    </div>
                    {past.strategySummary && (
                      <span className="text-[13px] leading-[18px] text-[#706A7C] break-words">
                        {past.strategySummary}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW 2: ADJUST GOAL (Before -> After + Let's try this)
  // ============================================================================
  if (mode === 'adjust') {
    const proposedStrategyPreview =
      adjustStrategySummary.trim() ||
      (adjustRegularAction.trim()
        ? adjustFrequency.trim()
          ? `${adjustRegularAction.trim()} · ${adjustFrequency.trim()}`
          : adjustRegularAction.trim()
        : '—');

    return (
      <div
        id="view-goal-adjust-page"
        className="flex flex-col gap-4 text-[15px] leading-[22px] text-[#302D3D]"
      >
        {/* Mode Switcher: Same habit strategy adjustment vs New direction */}
        <div
          role="group"
          aria-label="Type of change"
          className="grid grid-cols-2 gap-1.5 p-1 rounded-[14px] bg-[#F1EFF6]"
        >
          <button
            type="button"
            id="goal-adjust-mode-strategy"
            aria-pressed={adjustMode === 'adjust_strategy'}
            onClick={() => handleSelectAdjustMode('adjust_strategy')}
            className={`genki-plan-control min-h-[44px] px-3 rounded-[10px] text-[13px] font-semibold transition-colors cursor-pointer ${
              adjustMode === 'adjust_strategy'
                ? 'bg-white text-[#302D3D] shadow-xs'
                : 'bg-transparent text-[#625A76]'
            }`}
          >
            Adjust strategy
          </button>
          <button
            type="button"
            id="goal-adjust-mode-direction"
            aria-pressed={adjustMode === 'new_direction'}
            onClick={() => handleSelectAdjustMode('new_direction')}
            className={`genki-plan-control min-h-[44px] px-3 rounded-[10px] text-[13px] font-semibold transition-colors cursor-pointer ${
              adjustMode === 'new_direction'
                ? 'bg-white text-[#302D3D] shadow-xs'
                : 'bg-transparent text-[#625A76]'
            }`}
          >
            Change direction
          </button>
        </div>

        <p className="text-[13px] leading-[18px] text-[#706A7C]">
          {adjustMode === 'adjust_strategy'
            ? `Keeps this goal and habit lineage (next version v${commitment.version + 1}).`
            : 'Starts a new commitment while preserving your previous goal, history records, and accepted tasks.'}
        </p>

        {/* Editable Fields */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">Focus summary</span>
            <input
              id="goal-adjust-summary-input"
              type="text"
              value={adjustSummary}
              onChange={(e) => {
                setAdjustSummary(e.target.value);
                setAdjustError(null);
              }}
              placeholder="e.g. Build steady morning energy"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">
              Original intent (optional)
            </span>
            <input
              id="goal-adjust-intent-input"
              type="text"
              value={adjustOriginalIntent}
              onChange={(e) => setAdjustOriginalIntent(e.target.value)}
              placeholder="What brought you to this focus"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">
              Confirmed movement strategy
            </span>
            <input
              id="goal-adjust-strategy-input"
              type="text"
              value={adjustStrategySummary}
              onChange={(e) => {
                setAdjustStrategySummary(e.target.value);
                if (!adjustRegularAction) setAdjustRegularAction(e.target.value);
              }}
              placeholder="e.g. 10-min walk after lunch"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">
              Starting amount (optional)
            </span>
            <input
              id="goal-adjust-minimum-input"
              type="text"
              value={adjustMinimumAction}
              onChange={(e) => setAdjustMinimumAction(e.target.value)}
              placeholder="e.g. 3-min walk around the block"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">
              Frequency (optional, descriptive only)
            </span>
            <input
              id="goal-adjust-frequency-input"
              type="text"
              value={adjustFrequency}
              onChange={(e) => setAdjustFrequency(e.target.value)}
              placeholder="e.g. A few days a week"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[#706A7C]">
              Observation window (optional — leave blank if none agreed)
            </span>
            <input
              id="goal-adjust-window-input"
              type="text"
              value={adjustObservationWindow}
              onChange={(e) => setAdjustObservationWindow(e.target.value)}
              placeholder="e.g. Check in after 2 weeks"
              className="w-full min-h-[44px] px-3 py-2 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
            />
          </label>
        </div>

        {/* Explicit Current -> Proposed Comparison */}
        <div
          id="goal-adjust-diff"
          className="rounded-[16px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.10)] p-3.5 flex flex-col gap-2"
        >
          <span className="text-[12px] font-semibold leading-[16px] text-[#5E5BAE]">
            Current → Proposed
          </span>
          <div className="flex flex-col gap-1 text-[13px] leading-[18px]">
            <div>
              <span className="text-[#706A7C]">Current focus: </span>
              <span className="text-[#302D3D]">{commitment.summary}</span>
            </div>
            <div>
              <span className="text-[#5E5BAE]">Proposed focus: </span>
              <span className="font-semibold text-[#302D3D]">
                {adjustSummary.trim() || '—'}
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1 text-[13px] leading-[18px]">
            <div>
              <span className="text-[#706A7C]">Current strategy: </span>
              <span className="text-[#302D3D]">{strategyLine || 'None set'}</span>
            </div>
            <div>
              <span className="text-[#5E5BAE]">Proposed strategy: </span>
              <span className="font-semibold text-[#302D3D]">{proposedStrategyPreview}</span>
            </div>
          </div>
        </div>

        {adjustError && (
          <div
            id="goal-adjust-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
              {adjustError}
            </span>
            {adjustFailedRetryable && (
              <button
                type="button"
                id="goal-adjust-retry-btn"
                onClick={submitAdjustGoal}
                className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            id="goal-adjust-confirm-btn"
            onClick={submitAdjustGoal}
            className="genki-plan-control flex-1 min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold cursor-pointer"
          >
            Let’s try this
          </button>
          <button
            type="button"
            id="goal-adjust-cancel-btn"
            onClick={() => {
              setAdjustError(null);
              setAdjustFailedRetryable(false);
              setMode('overview');
            }}
            className="genki-plan-control min-h-[44px] px-4 rounded-[12px] bg-[#F1EFF6] text-[#524C63] text-[15px] font-medium cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW 3: REVIEW GOAL (Recent feedback + feelings + self-report + Keep exploring / Mark complete)
  // ============================================================================
  if (mode === 'review') {
    return (
      <div
        id="view-goal-review-page"
        className="flex flex-col gap-4 text-[15px] leading-[22px] text-[#302D3D]"
      >
        {/* Goal Summary Header */}
        <div className="rounded-[18px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.08)] p-4 flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
            Reviewing together
          </span>
          <p className="text-[16px] font-semibold leading-[22px] text-[#302D3D] break-words">
            {commitment.summary}
          </p>
          {strategyLine && (
            <p className="text-[14px] font-normal leading-[20px] text-[#625A76] break-words">
              {strategyLine}
            </p>
          )}
          {(evidence.startedDateLabel || evidence.latestMovementDateLabel) && (
            <p className="text-[13px] font-normal leading-[18px] text-[#706A7C] pt-1 tabular-nums">
              {evidence.startedDateLabel ? `Started ${evidence.startedDateLabel}` : ''}
              {evidence.startedDateLabel && evidence.latestMovementDateLabel ? ' · ' : ''}
              {evidence.latestMovementDateLabel
                ? `Latest movement ${evidence.latestMovementDateLabel}`
                : ''}
            </p>
          )}
        </div>

        {/* Recent Feedback Quotes from Weekly review & Your journey */}
        <section
          id="goal-review-recent-feedback"
          aria-label="Recent feedback"
          className="flex flex-col gap-2"
        >
          <h4 className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
            Recent feedback
          </h4>
          {evidence.recentFeedback.length > 0 ? (
            <div className="flex flex-col gap-2">
              {evidence.recentFeedback.map((item) => (
                <div
                  key={item.id}
                  data-feedback-source={item.sourceLabel}
                  className="rounded-[14px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.06)] px-3.5 py-2.5 flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[12px] leading-[16px] text-[#706A7C]">
                    <span className="font-medium text-[#5E5BAE]">{item.sourceLabel}</span>
                    <span className="tabular-nums">{item.dateLabel}</span>
                  </div>
                  <p className="text-[14px] font-normal leading-[20px] text-[#302D3D]">
                    {item.summary}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] font-normal leading-[20px] text-[#706A7C]">
              No recent Weekly review or Journey check-ins saved yet. You can still share how this goal feels below.
            </p>
          )}
        </section>

        {/* Optional Feeling Update (Strictly informational — never auto-completes) */}
        <section aria-label="How this goal feels now" className="flex flex-col gap-2">
          <p id="goal-review-feeling-label" className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
            How does this goal feel right now?
          </p>
          <div
            role="group"
            aria-labelledby="goal-review-feeling-label"
            className="grid grid-cols-3 gap-1.5"
          >
            {GOAL_FEELING_OPTIONS.map((opt) => {
              const selected = reviewFeeling === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  id={`goal-review-feeling-${opt.value}`}
                  aria-pressed={selected}
                  onClick={() =>
                    setReviewFeeling((prev) => (prev === opt.value ? undefined : opt.value))
                  }
                  className={`genki-plan-control min-h-[48px] px-2 py-2 rounded-[12px] border text-[13px] font-medium leading-[18px] text-center cursor-pointer ${
                    selected
                      ? 'bg-[#E5E0F3] border-[#BEB4DE] text-[#514879]'
                      : 'bg-[#F1EFF6] border-transparent text-[#615B73] hover:bg-[#EAE6F4]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Outside-app practice (Self-report only — never fabricates workout/task records) */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
            Any practice outside the app? (optional)
          </span>
          <textarea
            id="goal-review-outside-input"
            rows={2}
            value={outsidePracticeNote}
            onChange={(e) => setOutsidePracticeNote(e.target.value)}
            placeholder="e.g. Took a few short walks without logging them"
            className="w-full min-h-[64px] px-3 py-2.5 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] leading-[22px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white resize-none"
          />
          <span className="text-[12px] font-normal leading-[16px] text-[#8B8498]">
            Saved as your self-report — won’t change logged workouts or Done task counts.
          </span>
        </label>

        {reviewError && (
          <div
            id="goal-review-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
              {reviewError}
            </span>
            {reviewFailedAction === 'keep_exploring' && (
              <button
                type="button"
                id="goal-review-retry-btn"
                onClick={submitKeepExploring}
                className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Explicit decision actions */}
        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            id="goal-review-keep-exploring-btn"
            onClick={submitKeepExploring}
            className="genki-plan-control w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Keep exploring
          </button>

          <button
            type="button"
            id="goal-review-mark-complete-btn"
            onClick={() => {
              setReviewError(null);
              setReviewFailedAction(null);
              setMode('confirm_completion');
            }}
            className="genki-plan-control w-full min-h-[48px] px-4 rounded-[12px] bg-[#EEEDF6] hover:bg-[#E4E2F1] text-[#514C8C] text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Mark this goal complete?
          </button>

          <button
            type="button"
            id="goal-review-back-btn"
            onClick={() => {
              setReviewError(null);
              setMode('overview');
            }}
            className="genki-plan-control w-full min-h-[44px] px-4 rounded-[12px] bg-transparent text-[#625A76] text-[14px] font-medium flex items-center justify-center cursor-pointer"
          >
            Back to goal details
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SUB-VIEW 4: MARK THIS GOAL COMPLETE? (Explicit final confirmation gate)
  // ============================================================================
  return (
    <div
      id="view-goal-confirm-completion-page"
      className="flex flex-col gap-4 text-[15px] leading-[22px] text-[#302D3D]"
    >
      <div className="rounded-[18px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.10)] p-4 flex flex-col gap-2">
        <h4
          id="goal-confirm-completion-heading"
          className="text-[18px] font-semibold leading-[24px] text-[#302D3D]"
        >
          Mark this goal complete?
        </h4>
        <p className="text-[15px] font-semibold leading-[22px] text-[#514879] break-words">
          {commitment.summary}
        </p>
        {strategyLine && (
          <p className="text-[14px] font-normal leading-[20px] text-[#625A76] break-words">
            {strategyLine}
          </p>
        )}
        {(reviewFeeling || outsidePracticeNote.trim()) && (
          <div className="pt-2 mt-1 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-0.5 text-[13px] leading-[18px] text-[#625A76]">
            {reviewFeeling && (
              <span>Feeling: {formatGoalReviewFeelingLabel(reviewFeeling)}</span>
            )}
            {outsidePracticeNote.trim() && (
              <span>Self-report: “{outsidePracticeNote.trim()}”</span>
            )}
          </div>
        )}
      </div>

      <p className="text-[14px] font-normal leading-[20px] text-[#625A76]">
        Only your confirmation marks this goal complete. Afterward, you can keep this rhythm, build a little, or choose a new focus — and all past records stay preserved.
      </p>

      {reviewError && (
        <div
          id="goal-confirm-completion-error"
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
            {reviewError}
          </span>
          {reviewFailedAction === 'confirm_completion' && (
            <button
              type="button"
              id="goal-confirm-completion-retry-btn"
              onClick={submitConfirmCompletion}
              className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5 pt-1">
        <button
          type="button"
          id="goal-confirm-completion-btn"
          onClick={submitConfirmCompletion}
          className="genki-plan-control w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
        >
          Confirm completion
        </button>

        <button
          type="button"
          id="goal-confirm-keep-exploring-btn"
          onClick={submitKeepExploring}
          className="genki-plan-control w-full min-h-[44px] px-4 rounded-[12px] bg-[#EEEDF6] hover:bg-[#E4E2F1] text-[#514C8C] text-[15px] font-semibold flex items-center justify-center cursor-pointer"
        >
          Keep exploring
        </button>

        <button
          type="button"
          id="goal-confirm-back-btn"
          onClick={() => {
            setReviewError(null);
            setReviewFailedAction(null);
            setMode('review');
          }}
          className="genki-plan-control w-full min-h-[44px] px-4 rounded-[12px] bg-transparent text-[#625A76] text-[14px] font-medium flex items-center justify-center cursor-pointer"
        >
          Back
        </button>
      </div>
    </div>
  );
}
