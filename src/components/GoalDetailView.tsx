import React, { useMemo } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import {
  CompletedGoalNextStepChoice,
  ConfirmedActionStrategy,
  PhaseCommitmentRecord,
  PlanFoundationStore,
  deriveCommitmentStrategyLine,
  formatGoalReviewFeelingLabel,
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
  commitment: PhaseCommitmentRecord | null;
  activeHabit: ConfirmedActionStrategy | null;
  onOpenAdjustInNova: (initialMode: 'strategy' | 'direction') => void;
  onOpenReviewInNova: () => void;
  onOpenNextStepInNova: (choice: CompletedGoalNextStepChoice) => void;
}

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
  onOpenAdjustInNova,
  onOpenReviewInNova,
  onOpenNextStepInNova,
}: GoalDetailViewProps) {
  const strategyLine = useMemo(() => deriveCommitmentStrategyLine(commitment), [commitment]);
  const primaryStrategyHabit = activeHabit ?? commitment?.strategies?.[0] ?? null;

  const isCompleted = commitment?.status === 'completed';
  const completedDateLabel = formatShortIsoDate(commitment?.completedAt);
  const observationWindow =
    typeof commitment?.observationWindow === 'string' &&
    commitment.observationWindow.trim().length > 0
      ? commitment.observationWindow.trim()
      : null;

  const startingAmount =
    primaryStrategyHabit?.minimumAction?.trim() ||
    primaryStrategyHabit?.regularAction?.trim() ||
    null;

  const frequencyText = primaryStrategyHabit?.frequencyDescription?.trim() || null;
  const hasExplicitStrategy = Boolean(
    commitment?.strategySummary && commitment.strategySummary.trim().length > 0
  );
  const needsStrategyOrHabitCompletion = Boolean(
    commitment && (!hasExplicitStrategy || !primaryStrategyHabit)
  );
  const pastCommitments = store.pastCommitments ?? [];

  if (!commitment) {
    return (
      <div
        id="view-goal-detail-page"
        data-goal-status="empty"
        className="flex flex-col gap-4 text-[15px] leading-[22px] text-[#302D3D]"
      >
        <section className="rounded-[20px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.08)] p-4 flex flex-col gap-3">
          <p className="text-[15px] leading-[22px] text-[#524C63]">No focus set yet.</p>
          <button
            type="button"
            id="goal-open-adjust-btn"
            onClick={() => onOpenAdjustInNova('direction')}
            className="genki-plan-control genki-plan-control-primary w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Set a focus
          </button>
        </section>
      </div>
    );
  }

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
          className="rounded-[18px] bg-[#F3F0FA] border border-[#7770B6]/20 px-4 py-3 flex items-center gap-2"
        >
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
      )}

      {/* Missing strategy or habit prompt */}
      {!isCompleted && needsStrategyOrHabitCompletion && (
        <div
          id="goal-incomplete-plan-notice"
          className="rounded-[18px] bg-[#F4F1FA] border border-[#7770B6]/20 p-4 flex flex-col gap-2.5"
        >
          <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
            Add a starting strategy and habit
          </span>
          <button
            type="button"
            id="goal-complete-strategy-btn"
            onClick={() => onOpenAdjustInNova('strategy')}
            className="genki-plan-control genki-plan-control-primary w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Add strategy &amp; habit
          </button>
        </div>
      )}

      {/* Goal Facts Card */}
      <section
        aria-label="Current goal details"
        className="rounded-[20px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.08)] p-4 flex flex-col gap-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Status</span>
          <span
            id="goal-detail-status-text"
            className={`text-[13px] font-semibold leading-[18px] ${
              isCompleted ? 'text-[#5E5BAE]' : 'text-[#302D3D]'
            }`}
          >
            {isCompleted ? 'Completed' : 'In progress'}
          </span>
        </div>

        <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Goal</span>
          <p
            id="goal-detail-summary"
            className="text-[15px] font-semibold leading-[22px] text-[#302D3D] break-words"
          >
            {commitment.summary}
          </p>
        </div>

        {strategyLine && (
          <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Strategy</span>
            <p
              id="goal-detail-strategy"
              className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
            >
              {strategyLine}
            </p>
          </div>
        )}

        {primaryStrategyHabit && (
          <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Habit</span>
            <p
              id="goal-detail-tracked-habit"
              className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
            >
              {primaryStrategyHabit.label}
              {primaryStrategyHabit.regularAction &&
              primaryStrategyHabit.regularAction.toLowerCase() !==
                primaryStrategyHabit.label.toLowerCase()
                ? ` · ${primaryStrategyHabit.regularAction}`
                : ''}
            </p>
          </div>
        )}

        {startingAmount && (
          <div className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1">
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
              Lighter version
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
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Pace</span>
            <p
              id="goal-detail-frequency"
              className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
            >
              {frequencyText}
            </p>
          </div>
        )}

        {observationWindow && (
          <div
            id="goal-detail-observation-window"
            className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Window</span>
            <p className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words">
              {observationWindow}
            </p>
          </div>
        )}

        {commitment.reviewReflection &&
          (commitment.reviewReflection.feeling ||
            commitment.reviewReflection.outsidePracticeNote) && (
            <div
              id="goal-detail-saved-reflection"
              className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1"
            >
              <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">
                Latest check-in
              </span>
              {commitment.reviewReflection.feeling && (
                <p className="text-[15px] font-medium leading-[22px] text-[#514879]">
                  {formatGoalReviewFeelingLabel(commitment.reviewReflection.feeling)}
                </p>
              )}
              {commitment.reviewReflection.outsidePracticeNote && (
                <p className="text-[15px] font-normal leading-[22px] text-[#524C63] break-words">
                  “{commitment.reviewReflection.outsidePracticeNote}”
                </p>
              )}
            </div>
          )}
      </section>

      {/* Actions -> Nova Chat */}
      {!isCompleted ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            id="goal-open-review-btn"
            onClick={onOpenReviewInNova}
            className="genki-plan-control genki-plan-control-primary w-full min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#504D9D] text-white text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Review goal
          </button>

          <button
            type="button"
            id="goal-open-adjust-btn"
            onClick={() => onOpenAdjustInNova('strategy')}
            className="genki-plan-control w-full min-h-[44px] px-4 rounded-[12px] bg-[#EEEDF6] hover:bg-[#E4E2F1] text-[#514C8C] text-[15px] font-semibold flex items-center justify-center cursor-pointer"
          >
            Adjust goal
          </button>
        </div>
      ) : (
        <section
          id="goal-next-step-options"
          aria-label="Next step"
          className="flex flex-col gap-2.5"
        >
          <h4 className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">Next step</h4>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              id="goal-next-keep-btn"
              onClick={() => onOpenNextStepInNova('keep_rhythm')}
              className="genki-plan-control w-full min-h-[48px] px-4 py-3 rounded-[12px] bg-[#F6F4FA] border border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7] text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-[15px] font-semibold leading-[22px]">Keep this rhythm</span>
              <ChevronRight className="w-[18px] h-[18px] stroke-[2] text-[#6F687B] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              id="goal-next-build-btn"
              onClick={() => onOpenNextStepInNova('build_a_little')}
              className="genki-plan-control w-full min-h-[48px] px-4 py-3 rounded-[12px] bg-[#F6F4FA] border border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7] text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-[15px] font-semibold leading-[22px]">Build a little</span>
              <ChevronRight className="w-[18px] h-[18px] stroke-[2] text-[#6F687B] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              id="goal-next-new-focus-btn"
              onClick={() => onOpenNextStepInNova('new_focus')}
              className="genki-plan-control w-full min-h-[48px] px-4 py-3 rounded-[12px] bg-[#F6F4FA] border border-[rgba(74,66,98,0.08)] text-[#302D3D] hover:bg-[#EFEBF7] text-left flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-[15px] font-semibold leading-[22px]">Choose a new focus</span>
              <ChevronRight className="w-[18px] h-[18px] stroke-[2] text-[#6F687B] shrink-0" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Past Goals */}
      {pastCommitments.length > 0 && (
        <section
          id="goal-past-commitments"
          aria-label="Past goals"
          className="pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
        >
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Past goals</span>
          <ul className="flex flex-col gap-2">
            {pastCommitments.map((past) => {
              const dateLabel =
                formatShortIsoDate(past.completedAt) || formatShortIsoDate(past.updatedAt);
              return (
                <li
                  key={past.id}
                  className="rounded-[14px] bg-[#F8F6FC] border border-[rgba(74,66,98,0.06)] px-3.5 py-2.5 flex items-baseline justify-between gap-3"
                >
                  <span className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words">
                    {past.summary}
                  </span>
                  {dateLabel && (
                    <span className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums shrink-0">
                      {dateLabel}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
