import React from 'react';
import {
  type ConfirmedActionStrategy,
  type HabitStartFrictionLevel,
  type JourneyNextStepExperiment,
  type WeeklyHardFollowUpAnswer,
  type WeeklyReviewFitAnswer,
  type WeeklyReviewModel,
} from '../utils/planDataFoundation';

export const WEEKLY_FIT_OPTIONS: ReadonlyArray<{
  value: WeeklyReviewFitAnswer;
  label: string;
}> = [
  { value: 'hard_to_fit_in', label: 'Hard to fit in' },
  { value: 'about_right', label: 'About right' },
  { value: 'room_for_more', label: 'Room for more' },
];

export const WEEKLY_HARD_FOLLOWUP_OPTIONS: ReadonlyArray<{
  value: WeeklyHardFollowUpAnswer;
  label: string;
}> = [
  { value: 'too_long', label: 'Too long to start' },
  { value: 'timing_off', label: 'Timing didn’t line up' },
  { value: 'need_backup', label: 'Needed a backup option' },
  { value: 'busy_week', label: 'Just a busy week' },
];

export const WEEKLY_STARTING_FEEL_OPTIONS: ReadonlyArray<{
  value: HabitStartFrictionLevel;
  label: string;
}> = [
  { value: 'hard_to_start', label: 'Hard to start' },
  { value: 'manageable', label: 'Manageable' },
  { value: 'easier', label: 'Felt natural' },
];

interface WeeklyReviewDetailViewProps {
  model: WeeklyReviewModel;
  habit: ConfirmedActionStrategy | null;
  onOpenFitInNova: () => void;
  onOpenSuggestionInNova: (step: JourneyNextStepExperiment) => void;
  onOpenStartingFeelInNova: () => void;
  onOpenSelfReportInNova: () => void;
  onOpenHistory: () => void;
}

export function WeeklyReviewDetailView({
  model,
  habit,
  onOpenFitInNova,
  onOpenSuggestionInNova,
  onOpenStartingFeelInNova,
  onOpenSelfReportInNova,
  onOpenHistory,
}: WeeklyReviewDetailViewProps) {
  const pendingSuggestion = model.pendingSuggestion;
  const followUpLabel =
    WEEKLY_HARD_FOLLOWUP_OPTIONS.find((o) => o.value === model.followUpAnswer)?.label ?? null;
  const startingFeelLabel =
    WEEKLY_STARTING_FEEL_OPTIONS.find((o) => o.value === model.startingFeelAnswer)?.label ?? null;

  return (
    <div
      id="view-weekly-review-detail"
      data-review-week={model.weekStartKey}
      className="flex flex-col text-[#1C1C1E]"
    >
      {/* 1. Reviewed Week Summary */}
      <section
        id="weekly-review-detail-facts"
        aria-label="Reviewed week facts"
        className="pb-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-1.5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C] tabular-nums">
            {model.rangeLabel}
          </span>
          {habit && (
            <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
              {habit.label}
            </span>
          )}
        </div>

        <p
          id="weekly-review-detail-fact-line"
          className="text-[15px] font-medium leading-[22px] text-[#302D3D]"
        >
          {model.factLine}
        </p>

        <p className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums">
          {model.movementDaysCount} movement {model.movementDaysCount === 1 ? 'day' : 'days'} ·{' '}
          {model.doneTaskCount} {model.doneTaskCount === 1 ? 'task' : 'tasks'} done
          {model.restDaysCount > 0
            ? ` · ${model.restDaysCount} rest ${model.restDaysCount === 1 ? 'day' : 'days'}`
            : ''}
        </p>
      </section>

      {/* 2. Optional Note (when no movement records logged) -> Nova */}
      {!model.hasMovementRecords && (
        <section
          id="weekly-review-detail-self-report"
          aria-label="Weekly note"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">Note</h4>
            <button
              type="button"
              id="weekly-review-self-report-edit-btn"
              onClick={onOpenSelfReportInNova}
              className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[15px] font-medium text-[#5E5BAE] cursor-pointer"
            >
              {model.selfReport.status === 'note' ? 'Edit' : 'Add note'}
            </button>
          </div>

          {model.selfReport.status === 'note' ? (
            <p
              id="weekly-review-self-report-saved"
              data-source={model.selfReport.source}
              className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words"
            >
              {model.selfReport.note}
            </p>
          ) : (
            <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
              {model.selfReport.status === 'skipped'
                ? 'Skipped'
                : 'No movement logged last week.'}
            </p>
          )}
        </section>
      )}

      {/* 3. Saved Weekly Answer -> Edit in Nova */}
      <section
        id="weekly-review-detail-fit"
        aria-labelledby="weekly-review-detail-fit-q"
        className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h4
            id="weekly-review-detail-fit-q"
            className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
          >
            How did it fit?
          </h4>
          <button
            type="button"
            id="weekly-review-detail-fit-edit-btn"
            onClick={onOpenFitInNova}
            className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[15px] font-medium text-[#5E5BAE] cursor-pointer"
          >
            {model.fitAnswerLabel ? 'Edit' : 'Answer'}
          </button>
        </div>

        {model.fitAnswerLabel ? (
          <div className="flex flex-col gap-0.5">
            <span
              id="weekly-review-detail-fit-saved-label"
              className="text-[15px] font-medium leading-[22px] text-[#514879]"
            >
              {model.fitAnswerLabel}
            </span>
            {followUpLabel && (
              <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                {followUpLabel}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">Not answered yet.</p>
        )}
      </section>

      {/* 4. Optional Suggestion -> Review in Nova */}
      {pendingSuggestion && pendingSuggestion.decisionStatus === 'pending' && (
        <section
          id="weekly-review-detail-pending-suggestion"
          data-suggestion-id={pendingSuggestion.suggestionId}
          aria-labelledby="weekly-review-detail-suggestion-heading"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-3"
        >
          <div className="rounded-[16px] bg-[#F7F5FB] border border-[#7770B6]/14 p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h4
                id="weekly-review-detail-suggestion-heading"
                className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
              >
                {pendingSuggestion.title}
              </h4>
              <p className="text-[15px] font-normal leading-[22px] text-[#524C63]">
                {pendingSuggestion.basis}
              </p>
            </div>

            <button
              type="button"
              id="weekly-review-detail-review-diff-btn"
              onClick={() => onOpenSuggestionInNova(pendingSuggestion)}
              className="genki-plan-control genki-plan-control-primary self-start min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer"
            >
              {pendingSuggestion.primaryCtaLabel}
            </button>
          </div>
        </section>
      )}

      {/* 5. Confirmed Decisions */}
      {model.confirmedDecisions.length > 0 && (
        <section
          id="weekly-review-detail-confirmed-decisions"
          aria-label="Confirmed decisions"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
        >
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C]">Decisions</span>
          <ul className="flex flex-col gap-2">
            {model.confirmedDecisions.map((dec) => (
              <li
                key={dec.id}
                data-decision-status={dec.decision}
                className="rounded-[14px] bg-[#F7F5FB] border border-[#7770B6]/12 px-3.5 py-2.5 text-[15px] font-medium leading-[22px] text-[#514879]"
              >
                {dec.decision === 'accepted' ? 'Applied' : 'Decided'} · {dec.summary}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6. How did starting feel? -> Nova */}
      <section
        id="weekly-review-detail-starting-feel"
        aria-labelledby="weekly-review-detail-starting-q"
        className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h4
            id="weekly-review-detail-starting-q"
            className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
          >
            How did starting feel?
          </h4>
          <button
            type="button"
            id="weekly-review-detail-starting-edit-btn"
            onClick={onOpenStartingFeelInNova}
            className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[15px] font-medium text-[#5E5BAE] cursor-pointer"
          >
            {startingFeelLabel ? 'Edit' : 'Answer'}
          </button>
        </div>

        <p className="text-[15px] font-normal leading-[22px] text-[#524C63]">
          {startingFeelLabel ?? 'Not answered yet.'}
        </p>
      </section>

      {/* 7. Link to History */}
      <div className="pt-4 flex items-center justify-end">
        <button
          type="button"
          id="weekly-review-detail-history-btn"
          onClick={onOpenHistory}
          className="genki-plan-text-action"
        >
          View history
        </button>
      </div>
    </div>
  );
}
