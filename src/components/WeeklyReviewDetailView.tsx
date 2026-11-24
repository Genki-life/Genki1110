import React, { useEffect, useState } from 'react';
import {
  type ConfirmedActionStrategy,
  type HabitStartFrictionLevel,
  type JourneyNextStepExperiment,
  type WeeklyHardFollowUpAnswer,
  type WeeklyReviewFitAnswer,
  type WeeklyReviewModel,
} from '../utils/planDataFoundation';
import type { JourneyActionResult } from './YourJourneyView';

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
  onSelectFitAnswer: (answer: WeeklyReviewFitAnswer) => JourneyActionResult;
  onSelectFollowUp: (answer: WeeklyHardFollowUpAnswer) => JourneyActionResult;
  onConfirmSuggestion: (
    step: JourneyNextStepExperiment,
    editedValue?: string
  ) => JourneyActionResult;
  onDismissSuggestion: (step: JourneyNextStepExperiment) => JourneyActionResult;
  onSelectStartingFeel: (level: HabitStartFrictionLevel) => JourneyActionResult;
  onSaveSelfReport: (noteOrSkipped: string) => JourneyActionResult;
  onOpenHistory: () => void;
}

export function WeeklyReviewDetailView({
  model,
  habit,
  onSelectFitAnswer,
  onSelectFollowUp,
  onConfirmSuggestion,
  onDismissSuggestion,
  onSelectStartingFeel,
  onSaveSelfReport,
  onOpenHistory,
}: WeeklyReviewDetailViewProps) {
  // Fit answer error + retry
  const [fitError, setFitError] = useState<string | null>(null);
  const [failedFitAnswer, setFailedFitAnswer] = useState<WeeklyReviewFitAnswer | null>(null);

  // Follow-up error + retry
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [failedFollowUp, setFailedFollowUp] = useState<WeeklyHardFollowUpAnswer | null>(null);

  // Pending suggestion Before -> After state
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [draftAfterValue, setDraftAfterValue] = useState<string>(
    model.pendingSuggestion?.suggestedFieldValue ?? model.pendingSuggestion?.afterLabel ?? ''
  );
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [failedSuggestionAction, setFailedSuggestionAction] = useState<'confirm' | 'dismiss' | null>(
    null
  );

  // Optional "How did starting feel?" error + retry
  const [startingFeelError, setStartingFeelError] = useState<string | null>(null);
  const [failedStartingFeel, setFailedStartingFeel] = useState<HabitStartFrictionLevel | null>(null);

  // No-movement self-report note state
  const [isEditingSelfReport, setIsEditingSelfReport] = useState<boolean>(false);
  const [selfReportDraft, setSelfReportDraft] = useState<string>(model.selfReport.note);
  const [selfReportError, setSelfReportError] = useState<string | null>(null);
  const [failedSelfReportPayload, setFailedSelfReportPayload] = useState<string | null>(null);

  const pendingSuggestion = model.pendingSuggestion;
  const isSuggestionEditable =
    pendingSuggestion?.kind === 'make_smaller' ||
    pendingSuggestion?.kind === 'shift_cue' ||
    pendingSuggestion?.kind === 'add_alternative';

  useEffect(() => {
    setIsConfirming(false);
    setSuggestionError(null);
    setFailedSuggestionAction(null);
    setDraftAfterValue(
      pendingSuggestion?.suggestedFieldValue ?? pendingSuggestion?.afterLabel ?? ''
    );
  }, [pendingSuggestion?.suggestionId]);

  useEffect(() => {
    setSelfReportDraft(model.selfReport.note);
  }, [model.selfReport.note, model.weekStartKey]);

  const handleFieldFocusScroll = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const target = e.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 140);
  };

  const triggerFitSelect = (answer: WeeklyReviewFitAnswer) => {
    const res = onSelectFitAnswer(answer);
    if (!res.ok) {
      setFitError(res.error ?? 'Couldn’t save your answer. Please try again.');
      setFailedFitAnswer(answer);
      return;
    }
    setFitError(null);
    setFailedFitAnswer(null);
  };

  const triggerFollowUpSelect = (answer: WeeklyHardFollowUpAnswer) => {
    const res = onSelectFollowUp(answer);
    if (!res.ok) {
      setFollowUpError(res.error ?? 'Couldn’t save your follow-up answer. Please try again.');
      setFailedFollowUp(answer);
      return;
    }
    setFollowUpError(null);
    setFailedFollowUp(null);
  };

  const triggerConfirmSuggestion = () => {
    if (!pendingSuggestion) return;
    const trimmed = draftAfterValue.trim();
    if (isSuggestionEditable && !trimmed) {
      setSuggestionError('Enter a short description before confirming.');
      setFailedSuggestionAction(null);
      return;
    }
    const res = onConfirmSuggestion(
      pendingSuggestion,
      isSuggestionEditable ? trimmed : undefined
    );
    if (!res.ok) {
      setSuggestionError(
        res.error ?? 'Couldn’t save this update. Your plan and history were not changed.'
      );
      setFailedSuggestionAction('confirm');
      return;
    }
    setSuggestionError(null);
    setFailedSuggestionAction(null);
    setIsConfirming(false);
  };

  const triggerDismissSuggestion = () => {
    if (!pendingSuggestion) return;
    const res = onDismissSuggestion(pendingSuggestion);
    if (!res.ok) {
      setSuggestionError(res.error ?? 'Couldn’t save your choice right now. Please try again.');
      setFailedSuggestionAction('dismiss');
      return;
    }
    setSuggestionError(null);
    setFailedSuggestionAction(null);
    setIsConfirming(false);
  };

  const triggerStartingFeelSelect = (level: HabitStartFrictionLevel) => {
    const res = onSelectStartingFeel(level);
    if (!res.ok) {
      setStartingFeelError(res.error ?? 'Couldn’t save how starting felt. Please try again.');
      setFailedStartingFeel(level);
      return;
    }
    setStartingFeelError(null);
    setFailedStartingFeel(null);
  };

  const triggerSaveSelfReport = (payload: string) => {
    const res = onSaveSelfReport(payload);
    if (!res.ok) {
      setSelfReportError(res.error ?? 'Couldn’t save your note. Please try again.');
      setFailedSelfReportPayload(payload);
      return;
    }
    setSelfReportError(null);
    setFailedSelfReportPayload(null);
    setIsEditingSelfReport(false);
  };

  const showSelfReportEditor =
    !model.hasMovementRecords &&
    (isEditingSelfReport || model.selfReport.status === 'none');

  return (
    <div
      id="view-weekly-review-detail"
      data-review-week={model.weekStartKey}
      className="flex flex-col text-[#1C1C1E]"
    >
      {/* 1. Reviewed Week Factual Summary */}
      <section
        id="weekly-review-detail-facts"
        aria-label="Reviewed week facts"
        className="pb-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-1.5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium leading-[18px] text-[#706A7C] tabular-nums">
            Completed week · {model.rangeLabel}
          </span>
          {habit && (
            <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
              {habit.label} · {habit.version}
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

      {/* 2. No-Movement Self-Report Note OR Skip (Retains user_self_report source, never creates fake Done/workouts) */}
      {!model.hasMovementRecords && (
        <section
          id="weekly-review-detail-self-report"
          aria-label="Self-report note for week without movement records"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-[16px] font-semibold leading-[22px] text-[#302D3D]">
              Optional note for this week
            </h4>
            <span className="text-[12px] font-normal leading-[16px] text-[#706A7C]">
              Self-report only
            </span>
          </div>

          {!showSelfReportEditor && model.selfReport.status === 'note' ? (
            <div
              id="weekly-review-self-report-saved"
              data-source={model.selfReport.source}
              className="rounded-[14px] bg-[#F7F5FB] border border-[#7770B6]/12 p-3.5 flex flex-col gap-2"
            >
              <p className="text-[15px] font-normal leading-[22px] text-[#302D3D] break-words">
                {model.selfReport.note}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-normal leading-[16px] text-[#706A7C]">
                  Source: Self-report (not counted as a logged workout)
                </span>
                <button
                  type="button"
                  id="weekly-review-self-report-edit-btn"
                  onClick={() => {
                    setSelfReportDraft(model.selfReport.note);
                    setIsEditingSelfReport(true);
                    setSelfReportError(null);
                  }}
                  className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[14px] font-medium text-[#5E5BAE] cursor-pointer"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : !showSelfReportEditor && model.selfReport.status === 'skipped' ? (
            <div
              id="weekly-review-self-report-skipped"
              data-source={model.selfReport.source}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-[14px] font-normal leading-[20px] text-[#706A7C]">
                Skipped adding a self-report note.
              </span>
              <button
                type="button"
                id="weekly-review-self-report-add-btn"
                onClick={() => {
                  setSelfReportDraft('');
                  setIsEditingSelfReport(true);
                  setSelfReportError(null);
                }}
                className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[14px] font-medium text-[#5E5BAE] cursor-pointer"
              >
                Add note
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                No movement records were logged last week. Add a short note if you’d like, or skip.
                Notes stay marked as self-report and won’t create workout records.
              </p>
              <textarea
                id="weekly-review-self-report-input"
                rows={2}
                value={selfReportDraft}
                onChange={(e) => {
                  setSelfReportDraft(e.target.value);
                  setSelfReportError(null);
                }}
                onFocus={handleFieldFocusScroll}
                placeholder="e.g., Walked outdoors without tracking, or took a break while traveling"
                className="w-full min-h-[56px] px-3 py-2.5 rounded-[12px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] font-normal leading-[22px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white resize-none"
              />

              {selfReportError && (
                <div
                  id="weekly-review-self-report-error"
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                    {selfReportError}
                  </span>
                  {failedSelfReportPayload !== null && (
                    <button
                      type="button"
                      id="weekly-review-self-report-retry-btn"
                      onClick={() => triggerSaveSelfReport(failedSelfReportPayload)}
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
                  id="weekly-review-self-report-save-btn"
                  disabled={!selfReportDraft.trim()}
                  onClick={() => triggerSaveSelfReport(selfReportDraft.trim())}
                  className={`genki-plan-control flex-1 min-h-[48px] px-4 rounded-[12px] text-[15px] font-semibold transition-colors ${
                    selfReportDraft.trim()
                      ? 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white cursor-pointer'
                      : 'bg-[#5E5BAE]/35 text-white/80 cursor-not-allowed'
                  }`}
                >
                  Save note
                </button>
                <button
                  type="button"
                  id="weekly-review-self-report-skip-btn"
                  onClick={() => {
                    if (isEditingSelfReport && model.selfReport.status === 'note') {
                      setIsEditingSelfReport(false);
                      setSelfReportError(null);
                    } else {
                      triggerSaveSelfReport('__skipped__');
                    }
                  }}
                  className="genki-plan-control min-h-[44px] px-3.5 rounded-[12px] bg-[#F1EFF6] text-[#524C63] text-[14px] font-medium hover:bg-[#E7E4F1] cursor-pointer"
                >
                  {isEditingSelfReport && model.selfReport.status === 'note' ? 'Cancel' : 'Skip'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. Saved Answer (Editable, preserves applied plan versions & history) */}
      <section
        id="weekly-review-detail-fit"
        aria-labelledby="weekly-review-detail-fit-q"
        className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2.5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium leading-[16px] text-[#706A7C]">
            Saved answer
          </span>
          {model.fitAnswerLabel && (
            <span
              id="weekly-review-detail-fit-saved-label"
              className="text-[13px] font-medium leading-[18px] text-[#5E5BAE]"
            >
              {model.fitAnswerLabel}
            </span>
          )}
        </div>

        <h4
          id="weekly-review-detail-fit-q"
          className="text-[16px] font-semibold leading-[22px] text-[#302D3D]"
        >
          How did movement fit into your week?
        </h4>

        <div
          role="group"
          aria-labelledby="weekly-review-detail-fit-q"
          className="genki-plan-feedback-grid"
        >
          {WEEKLY_FIT_OPTIONS.map((opt) => {
            const isSelected = model.fitAnswer === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                id={`weekly-review-detail-opt-${opt.value}`}
                aria-pressed={isSelected}
                onClick={() => triggerFitSelect(opt.value)}
                className="genki-plan-control genki-plan-control-feedback"
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {fitError && (
          <div
            id="weekly-review-detail-fit-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
              {fitError}
            </span>
            {failedFitAnswer && (
              <button
                type="button"
                id="weekly-review-detail-fit-retry-btn"
                onClick={() => triggerFitSelect(failedFitAnswer)}
                className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <p className="text-[12px] font-normal leading-[17px] text-[#706A7C]">
          You can update your answer anytime. Already-applied plan updates and journey history stay
          intact.
        </p>

        {/* Single follow-up when "Hard to fit in" is selected */}
        {model.fitAnswer === 'hard_to_fit_in' && (
          <div
            id="weekly-review-detail-followup"
            className="mt-2 pt-3 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
          >
            <p
              id="weekly-review-detail-followup-q"
              className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
            >
              What made it hardest to fit in?
            </p>
            <div
              role="group"
              aria-labelledby="weekly-review-detail-followup-q"
              className="grid grid-cols-2 gap-2"
            >
              {WEEKLY_HARD_FOLLOWUP_OPTIONS.map((opt) => {
                const active = model.followUpAnswer === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    id={`weekly-review-detail-followup-${opt.value}`}
                    aria-pressed={active}
                    onClick={() => triggerFollowUpSelect(opt.value)}
                    className={`genki-plan-control min-h-[48px] px-3 py-2 rounded-[12px] text-[13px] font-medium leading-[18px] text-center border transition-colors cursor-pointer ${
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

            {followUpError && (
              <div
                id="weekly-review-detail-followup-error"
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                  {followUpError}
                </span>
                {failedFollowUp && (
                  <button
                    type="button"
                    id="weekly-review-detail-followup-retry-btn"
                    onClick={() => triggerFollowUpSelect(failedFollowUp)}
                    className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Room for more: explicitly records willingness only */}
        {model.fitAnswer === 'room_for_more' && (
          <p
            id="weekly-review-detail-room-note"
            className="mt-1 rounded-[12px] bg-[#F7F5FB] px-3.5 py-2.5 text-[13px] font-normal leading-[19px] text-[#524C63]"
          >
            Willingness recorded. Your current plan stays unchanged unless you choose to edit it.
          </p>
        )}
      </section>

      {/* 4. Pending Suggestion (Before -> After) — strictly separated from Saved Answer & Confirmed Decisions */}
      {pendingSuggestion && pendingSuggestion.decisionStatus === 'pending' && (
        <section
          id="weekly-review-detail-pending-suggestion"
          data-suggestion-id={pendingSuggestion.suggestionId}
          aria-labelledby="weekly-review-detail-suggestion-heading"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-3"
        >
          <span className="text-[12px] font-medium leading-[16px] text-[#5E5BAE]">
            Pending suggestion · shared with Your journey
          </span>

          <div className="rounded-[16px] bg-[#F7F5FB] border border-[#7770B6]/14 p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h4
                id="weekly-review-detail-suggestion-heading"
                className="text-[16px] font-semibold leading-[22px] text-[#302D3D]"
              >
                {pendingSuggestion.title}
              </h4>
              <p className="text-[14px] font-normal leading-[20px] text-[#524C63]">
                {pendingSuggestion.basis}
              </p>
            </div>

            {!isConfirming ? (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  id="weekly-review-detail-review-diff-btn"
                  onClick={() => {
                    setDraftAfterValue(
                      pendingSuggestion.suggestedFieldValue ?? pendingSuggestion.afterLabel
                    );
                    setSuggestionError(null);
                    setIsConfirming(true);
                  }}
                  className="genki-plan-control min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer"
                >
                  {pendingSuggestion.primaryCtaLabel}
                </button>
                <button
                  type="button"
                  id="weekly-review-detail-dismiss-btn"
                  onClick={triggerDismissSuggestion}
                  className="genki-plan-control min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-[#524C63] text-[14px] font-medium hover:bg-[#F3F1F8] cursor-pointer"
                >
                  {pendingSuggestion.secondaryCtaLabel}
                </button>
              </div>
            ) : (
              <div
                id="weekly-review-detail-diff-box"
                className="rounded-[14px] bg-white border border-[rgba(74,66,98,0.12)] p-3.5 flex flex-col gap-3"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-medium leading-[16px] text-[#706A7C]">
                      Before
                    </span>
                    <span
                      id="weekly-review-detail-diff-before"
                      className="text-[15px] font-normal leading-[22px] text-[#524C63] break-words"
                    >
                      {pendingSuggestion.beforeLabel}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium leading-[16px] text-[#5E5BAE]">
                      After
                    </span>
                    {isSuggestionEditable ? (
                      <input
                        id="weekly-review-detail-diff-after-input"
                        type="text"
                        value={draftAfterValue}
                        onChange={(e) => {
                          setDraftAfterValue(e.target.value);
                          setSuggestionError(null);
                        }}
                        onFocus={handleFieldFocusScroll}
                        aria-label="Updated plan setting"
                        className="w-full min-h-[44px] px-3 py-2 rounded-[10px] bg-[#F7F5FB] border border-[rgba(74,66,98,0.16)] text-[15px] font-normal leading-[22px] text-[#302D3D] focus:outline-none focus:border-[#5E5BAE] focus:bg-white"
                      />
                    ) : (
                      <span
                        id="weekly-review-detail-diff-after"
                        className="text-[15px] font-medium leading-[22px] text-[#302D3D] break-words"
                      >
                        {pendingSuggestion.afterLabel}
                      </span>
                    )}
                  </div>
                </div>

                {suggestionError && (
                  <div
                    id="weekly-review-detail-suggestion-error"
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                      {suggestionError}
                    </span>
                    {failedSuggestionAction && (
                      <button
                        type="button"
                        id="weekly-review-detail-suggestion-retry-btn"
                        onClick={() =>
                          failedSuggestionAction === 'confirm'
                            ? triggerConfirmSuggestion()
                            : triggerDismissSuggestion()
                        }
                        className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    id="weekly-review-detail-confirm-btn"
                    onClick={triggerConfirmSuggestion}
                    className="genki-plan-control flex-1 min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer"
                  >
                    {pendingSuggestion.kind === 'keep_rhythm'
                      ? 'Confirm keeping rhythm'
                      : 'Confirm update'}
                  </button>
                  <button
                    type="button"
                    id="weekly-review-detail-cancel-diff-btn"
                    onClick={() => {
                      setIsConfirming(false);
                      setSuggestionError(null);
                      setFailedSuggestionAction(null);
                    }}
                    className="genki-plan-control min-h-[44px] px-3 rounded-[12px] text-[14px] font-medium text-[#625A76] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. Confirmed Decisions (Immutable history for this week) */}
      {model.confirmedDecisions.length > 0 && (
        <section
          id="weekly-review-detail-confirmed-decisions"
          aria-label="Confirmed decisions"
          className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2"
        >
          <span className="text-[12px] font-medium leading-[16px] text-[#706A7C]">
            Confirmed decisions
          </span>
          <ul className="flex flex-col gap-2">
            {model.confirmedDecisions.map((dec) => {
              const planVer =
                dec.payload && typeof dec.payload.resultingPlanVersion === 'string'
                  ? dec.payload.resultingPlanVersion
                  : null;
              return (
                <li
                  key={dec.id}
                  data-decision-status={dec.decision}
                  className="rounded-[14px] bg-[#F7F5FB] border border-[#7770B6]/12 px-3.5 py-2.5 flex flex-col gap-0.5"
                >
                  <span className="text-[14px] font-semibold leading-[20px] text-[#514879]">
                    {dec.decision === 'accepted' ? 'Applied' : 'Decided'} · {dec.summary}
                  </span>
                  {planVer && (
                    <span className="text-[12px] font-normal leading-[16px] text-[#706A7C]">
                      Plan version: {planVer}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 6. Optional Question: "How did starting feel?" (Reuses same-context answer across Weekly review & Your journey) */}
      <section
        id="weekly-review-detail-starting-feel"
        aria-labelledby="weekly-review-detail-starting-q"
        className="py-5 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-2.5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium leading-[16px] text-[#706A7C]">
            Optional check-in
          </span>
          {model.startingFeelSourceLabel && (
            <span
              id="weekly-review-detail-starting-source"
              className="text-[12px] font-normal leading-[16px] text-[#5E5BAE]"
            >
              {model.startingFeelSourceLabel}
            </span>
          )}
        </div>

        <h4
          id="weekly-review-detail-starting-q"
          className="text-[16px] font-semibold leading-[22px] text-[#302D3D]"
        >
          How did starting feel?
        </h4>

        <div
          role="group"
          aria-labelledby="weekly-review-detail-starting-q"
          className="genki-plan-feedback-grid"
        >
          {WEEKLY_STARTING_FEEL_OPTIONS.map((opt) => {
            const active = model.startingFeelAnswer === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                id={`weekly-review-detail-starting-${opt.value}`}
                aria-pressed={active}
                onClick={() => triggerStartingFeelSelect(opt.value)}
                className="genki-plan-control genki-plan-control-feedback"
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {startingFeelError && (
          <div
            id="weekly-review-detail-starting-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[13px] font-medium leading-[18px] text-[#B42318]">
              {startingFeelError}
            </span>
            {failedStartingFeel && (
              <button
                type="button"
                id="weekly-review-detail-starting-retry-btn"
                onClick={() => triggerStartingFeelSelect(failedStartingFeel)}
                className="genki-plan-control min-h-[44px] px-3 rounded-[10px] bg-[#EEEDF6] text-[#514C8C] text-[13px] font-semibold cursor-pointer"
              >
                Retry
              </button>
            )}
          </div>
        )}
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
