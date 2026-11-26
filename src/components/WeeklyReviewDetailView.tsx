import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import {
  type ConfirmedActionStrategy,
  type HabitStartFrictionLevel,
  type JourneyNextStepExperiment,
  type WeeklyHardFollowUpAnswer,
  type WeeklyReviewFitAnswer,
  type WeeklyReviewModel,
} from '../utils/planDataFoundation';
import {
  WEEKLY_FIT_EMOJI_OPTIONS,
  WEEKLY_STARTING_FEEL_EMOJI_OPTIONS,
  WeeklyEmojiSelector,
} from './WeeklyEmojiSelector';

export const WEEKLY_FIT_OPTIONS: ReadonlyArray<{
  value: WeeklyReviewFitAnswer;
  label: string;
}> = WEEKLY_FIT_EMOJI_OPTIONS.map(({ value, label }) => ({ value, label }));

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
}> = WEEKLY_STARTING_FEEL_EMOJI_OPTIONS.map(({ value, label }) => ({ value, label }));

export interface WeeklyReviewSaveResult {
  ok: boolean;
  error?: string;
}

interface WeeklyReviewDetailViewProps {
  model: WeeklyReviewModel;
  habit: ConfirmedActionStrategy | null;
  onSelectFit: (answer: WeeklyReviewFitAnswer) => WeeklyReviewSaveResult;
  onSelectStartingFeel: (level: HabitStartFrictionLevel) => WeeklyReviewSaveResult;
  onSetStartingFeelSpecialState: (
    state: 'skipped' | 'rested_all_week' | 'clear'
  ) => WeeklyReviewSaveResult;
  onStepWeek: (deltaWeeks: -1 | 1) => void;
  onOpenFitInNova: () => void;
  onOpenSuggestionInNova: (step: JourneyNextStepExperiment) => void;
  onOpenSelfReportInNova: () => void;
  onOpenHistory: () => void;
}

type StartingFeelRetryAction =
  | { kind: 'answer'; value: HabitStartFrictionLevel }
  | { kind: 'special'; value: 'skipped' | 'rested_all_week' | 'clear' };

export function WeeklyReviewDetailView({
  model,
  habit,
  onSelectFit,
  onSelectStartingFeel,
  onSetStartingFeelSpecialState,
  onStepWeek,
  onOpenFitInNova,
  onOpenSuggestionInNova,
  onOpenSelfReportInNova,
  onOpenHistory,
}: WeeklyReviewDetailViewProps) {
  const [fitError, setFitError] = useState<string | null>(null);
  const [fitRetryAnswer, setFitRetryAnswer] = useState<WeeklyReviewFitAnswer | null>(null);

  const [startingError, setStartingError] = useState<string | null>(null);
  const [startingRetryAction, setStartingRetryAction] =
    useState<StartingFeelRetryAction | null>(null);

  // Reset inline error states whenever the user switches to a different reviewed week
  useEffect(() => {
    setFitError(null);
    setFitRetryAnswer(null);
    setStartingError(null);
    setStartingRetryAction(null);
  }, [model.weekStartKey]);

  const handleFitSelect = (answer: WeeklyReviewFitAnswer) => {
    const res = onSelectFit(answer);
    if (!res.ok) {
      setFitError(res.error ?? 'Couldn’t save your feedback. Please try again.');
      setFitRetryAnswer(answer);
      return;
    }
    setFitError(null);
    setFitRetryAnswer(null);
  };

  const handleStartingFeelSelect = (level: HabitStartFrictionLevel) => {
    const res = onSelectStartingFeel(level);
    if (!res.ok) {
      setStartingError(res.error ?? 'Couldn’t save your answer. Please try again.');
      setStartingRetryAction({ kind: 'answer', value: level });
      return;
    }
    setStartingError(null);
    setStartingRetryAction(null);
  };

  const handleStartingSpecialState = (state: 'skipped' | 'rested_all_week' | 'clear') => {
    const res = onSetStartingFeelSpecialState(state);
    if (!res.ok) {
      setStartingError(res.error ?? 'Couldn’t update this right now. Please try again.');
      setStartingRetryAction({ kind: 'special', value: state });
      return;
    }
    setStartingError(null);
    setStartingRetryAction(null);
  };

  const handleStartingRetry = () => {
    if (!startingRetryAction) return;
    if (startingRetryAction.kind === 'answer') {
      handleStartingFeelSelect(startingRetryAction.value);
    } else {
      handleStartingSpecialState(startingRetryAction.value);
    }
  };

  const pendingSuggestion = model.pendingSuggestion;
  const followUpLabel =
    WEEKLY_HARD_FOLLOWUP_OPTIONS.find((o) => o.value === model.followUpAnswer)?.label ?? null;

  return (
    <div
      id="view-weekly-review-detail"
      data-review-week={model.weekStartKey}
      data-review-complete={model.fitAnswer ? 'true' : 'false'}
      data-starting-feel-status={model.startingFeelStatus}
      className="flex flex-col text-[#1C1C1E]"
    >
      {/* 1. Historical Week Switcher + Reviewed Week Facts */}
      <section
        id="weekly-review-detail-facts"
        aria-label="Reviewed week facts"
        className="pb-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
      >
        <div
          id="weekly-review-detail-week-nav"
          className="flex items-center justify-between gap-1 -mx-2"
        >
          <button
            type="button"
            id="weekly-review-detail-prev-week-btn"
            onClick={() => onStepWeek(-1)}
            disabled={!model.canGoPreviousWeek}
            aria-label="Previous reviewed week"
            className="genki-plan-week-nav-btn"
          >
            <ChevronLeft className="w-[18px] h-[18px] stroke-[2]" aria-hidden="true" />
          </button>

          <div className="flex-1 min-w-0 flex flex-col items-center text-center">
            <span
              id="weekly-review-detail-range-label"
              className="text-[13px] font-medium leading-[18px] text-[#625B70] tabular-nums truncate"
            >
              {model.rangeLabel}
            </span>
            {habit && (
              <span className="text-[12px] font-normal leading-[16px] text-[#6F687B] truncate max-w-full">
                {habit.label}
              </span>
            )}
          </div>

          <button
            type="button"
            id="weekly-review-detail-next-week-btn"
            onClick={() => onStepWeek(1)}
            disabled={!model.canGoNextWeek}
            aria-label="Next reviewed week"
            className="genki-plan-week-nav-btn"
          >
            <ChevronRight className="w-[18px] h-[18px] stroke-[2]" aria-hidden="true" />
          </button>
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

      {/* 2. Question 1 (Primary): How did movement fit into your week? */}
      <section
        id="weekly-review-detail-fit"
        aria-labelledby="weekly-review-detail-fit-q"
        className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col"
      >
        <h4
          id="weekly-review-detail-fit-q"
          className="genki-plan-feedback-question"
        >
          How did movement fit into your week?
        </h4>

        <WeeklyEmojiSelector
          options={WEEKLY_FIT_EMOJI_OPTIONS}
          selectedValue={model.fitAnswer}
          onSelect={handleFitSelect}
          ariaLabelledBy="weekly-review-detail-fit-q"
          optionIdPrefix="weekly-review-detail-fit-option"
          className="mt-[10px]"
        />

        {fitError ? (
          <div
            id="weekly-review-detail-fit-error"
            role="alert"
            className="mt-[10px] flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
              {fitError}
            </span>
            {fitRetryAnswer && (
              <button
                type="button"
                id="weekly-review-detail-fit-retry-btn"
                onClick={() => handleFitSelect(fitRetryAnswer)}
                className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        ) : model.fitAnswer ? (
          <div className="mt-[8px] flex items-center justify-between gap-2 min-h-[20px]">
            <span
              id="weekly-review-detail-fit-saved-status"
              role="status"
              aria-live="polite"
              className="text-[12px] font-medium leading-[17px] text-[#6F687B]"
            >
              Saved
            </span>
            {model.fitAnswer === 'hard_to_fit_in' && (
              <button
                type="button"
                id="weekly-review-detail-fit-followup-btn"
                onClick={onOpenFitInNova}
                className="text-[12px] font-medium leading-[17px] text-[#51489A] hover:underline py-1 cursor-pointer"
              >
                {followUpLabel ? `${followUpLabel} · Chat with Nova` : 'Share why with Nova'}
              </button>
            )}
          </div>
        ) : null}
      </section>

      {/* 3. Question 2 (Optional, Secondary Page Only): On days you moved, how did starting feel? */}
      {model.isRestedAllWeek ? (
        <section
          id="weekly-review-detail-starting-collapsed"
          aria-label="Rested all week"
          className="py-4 border-b border-[rgba(74,66,98,0.08)] flex items-center justify-between gap-3"
        >
          <p className="text-[13px] font-normal leading-[18px] text-[#6F687B]">
            Rested all week
          </p>
          {model.isRestedAllWeekExplicit && (
            <button
              type="button"
              id="weekly-review-detail-starting-restore-btn"
              onClick={() => handleStartingSpecialState('clear')}
              className="text-[13px] font-medium leading-[18px] text-[#51489A] hover:underline py-2 px-1 -my-2 cursor-pointer shrink-0"
            >
              Show question
            </button>
          )}
        </section>
      ) : (
        <section
          id="weekly-review-detail-starting-feel"
          aria-labelledby="weekly-review-detail-starting-q"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h4
              id="weekly-review-detail-starting-q"
              className="genki-plan-feedback-question"
            >
              On days you moved, how did starting feel?
            </h4>
            <span className="text-[12px] font-normal leading-[16px] text-[#6F687B] shrink-0">
              Optional
            </span>
          </div>

          <WeeklyEmojiSelector
            options={WEEKLY_STARTING_FEEL_EMOJI_OPTIONS}
            selectedValue={model.startingFeelAnswer}
            onSelect={handleStartingFeelSelect}
            ariaLabelledBy="weekly-review-detail-starting-q"
            optionIdPrefix="weekly-review-detail-starting-option"
            className="mt-[10px]"
          />

          {startingError ? (
            <div
              id="weekly-review-detail-starting-error"
              role="alert"
              className="mt-[10px] flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                {startingError}
              </span>
              {startingRetryAction && (
                <button
                  type="button"
                  id="weekly-review-detail-starting-retry-btn"
                  onClick={handleStartingRetry}
                  className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          ) : model.startingFeelStatus === 'answered' ? (
            <p
              id="weekly-review-detail-starting-saved-status"
              role="status"
              aria-live="polite"
              className="mt-[8px] text-[12px] font-medium leading-[17px] text-[#6F687B]"
            >
              Saved
            </p>
          ) : model.startingFeelStatus === 'skipped' ? (
            <div className="mt-[8px] flex items-center justify-between gap-2">
              <span
                id="weekly-review-detail-starting-skipped-status"
                role="status"
                aria-live="polite"
                className="text-[12px] font-normal leading-[17px] text-[#6F687B]"
              >
                Skipped
              </span>
              {!model.hasMovementRecords && (
                <button
                  type="button"
                  id="weekly-review-detail-starting-rested-btn"
                  onClick={() => handleStartingSpecialState('rested_all_week')}
                  className="text-[12px] font-medium leading-[17px] text-[#51489A] hover:underline py-1 cursor-pointer"
                >
                  Rested all week
                </button>
              )}
            </div>
          ) : !model.hasMovementRecords ? (
            <div className="mt-[8px] flex items-center justify-between gap-3">
              <button
                type="button"
                id="weekly-review-detail-starting-skip-btn"
                onClick={() => handleStartingSpecialState('skipped')}
                className="text-[12px] font-medium leading-[17px] text-[#6F687B] hover:text-[#211D2C] py-1 cursor-pointer"
              >
                Skip
              </button>
              <button
                type="button"
                id="weekly-review-detail-starting-rested-btn"
                onClick={() => handleStartingSpecialState('rested_all_week')}
                className="text-[12px] font-medium leading-[17px] text-[#51489A] hover:underline py-1 cursor-pointer"
              >
                Rested all week
              </button>
            </div>
          ) : null}
        </section>
      )}

      {/* 4. Optional Note (when no movement records logged) -> Nova */}
      {!model.hasMovementRecords && (
        <section
          id="weekly-review-detail-self-report"
          aria-label="Weekly note"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2 min-h-[44px] -my-2">
            <h4 className="font-sans text-[16px] font-semibold leading-[22px] text-[#211D2C]">
              Note
            </h4>
            <button
              type="button"
              id="weekly-review-self-report-edit-btn"
              onClick={onOpenSelfReportInNova}
              aria-label={
                model.selfReport.status === 'note' ? 'Edit weekly note' : 'Add weekly note'
              }
              className="w-11 h-11 min-w-[44px] min-h-[44px] -mr-2.5 rounded-full flex items-center justify-center text-[#51489A] hover:bg-[#51489A]/[0.08] active:bg-[#51489A]/[0.14] transition-colors shrink-0 cursor-pointer"
            >
              <Pencil className="w-[18px] h-[18px] stroke-[2]" aria-hidden="true" />
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
                : 'No movement logged that week.'}
            </p>
          )}
        </section>
      )}

      {/* 5. Optional Suggestion -> Review & confirm in Nova */}
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

      {/* 6. Confirmed Decisions */}
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

      {/* 7. Link to History */}
      <div className="pt-2">
        <button
          type="button"
          id="weekly-review-detail-history-btn"
          onClick={onOpenHistory}
          aria-label="Open activity history"
          className="genki-plan-control w-full min-h-[44px] py-2 flex items-center justify-between gap-2 text-left text-[15px] font-medium leading-[22px] text-[#211D2C] hover:text-[#51489A] transition-colors cursor-pointer"
        >
          <span>View history</span>
          <ChevronRight
            className="w-[18px] h-[18px] stroke-[2] text-[#6F687B] shrink-0"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
