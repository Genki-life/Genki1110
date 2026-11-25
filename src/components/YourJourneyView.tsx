import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getHabitJourneyNextStep,
  getHabitJourneyPointDetail,
  getHabitJourneyTimeline,
  getHabitRhythmModel,
  getHabitStatusExplanation,
  type ConfirmedActionStrategy,
  type JourneyNextStepExperiment,
  type PlanFoundationStore,
} from '../utils/planDataFoundation';
import { PlanRhythmChart } from './PlanRhythmChart';

export interface SharedWeeklyReviewProposalInput {
  id: string;
  resolutionKey: string;
  headline: string;
  reason: string;
  previousValue: string | number;
  nextValue: string | number;
  changeLabel: string;
}

export interface JourneyActionResult {
  ok: boolean;
  error?: string;
}

interface YourJourneyViewProps {
  store: PlanFoundationStore;
  habit: ConfirmedActionStrategy;
  confirmedHabitCount: number;
  referenceDate: Date;
  sharedWeeklyProposal: SharedWeeklyReviewProposalInput | null;
  sharedWeeklyExperiment?: JourneyNextStepExperiment | null;
  resolvedAdjustmentKeys: string[];
  onEditHabit: (habit: ConfirmedActionStrategy) => void;
  onSwitchHabit?: () => void;
  onRetryQuery: () => void;
  onOpenHistoryFromJourney: () => void;
  onOpenStartingFeelInNova: () => void;
  onHideStatusConclusion: () => JourneyActionResult;
  onShowStatusConclusion: () => JourneyActionResult;
  onOpenNextStepInNova: (step: JourneyNextStepExperiment) => void;
  onDismissNextStep: (step: JourneyNextStepExperiment) => JourneyActionResult;
}

const WINDOW_OPTIONS = [14, 30, 90] as const;
type JourneyWindowDays = (typeof WINDOW_OPTIONS)[number];

export function YourJourneyView({
  store,
  habit,
  confirmedHabitCount,
  referenceDate,
  sharedWeeklyProposal,
  sharedWeeklyExperiment = null,
  resolvedAdjustmentKeys,
  onEditHabit,
  onSwitchHabit,
  onRetryQuery,
  onOpenHistoryFromJourney,
  onOpenStartingFeelInNova,
  onHideStatusConclusion,
  onShowStatusConclusion,
  onOpenNextStepInNova,
  onDismissNextStep,
}: YourJourneyViewProps) {
  const [windowDays, setWindowDays] = useState<JourneyWindowDays>(30);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [isWhyOpen, setIsWhyOpen] = useState<boolean>(false);
  const [isDisagreeOpen, setIsDisagreeOpen] = useState<boolean>(false);
  const [showAllTimelineEvents, setShowAllTimelineEvents] = useState<boolean>(false);
  const [nextStepError, setNextStepError] = useState<string | null>(null);

  const journeyModel = useMemo(
    () =>
      getHabitRhythmModel(store, habit.habitId, referenceDate, {
        windowDays,
      }),
    [store, habit.habitId, referenceDate, windowDays]
  );

  const defaultSelectedDateKey =
    journeyModel.latestValidPoint?.dateKey ??
    journeyModel.points[journeyModel.points.length - 1]?.dateKey ??
    null;

  useEffect(() => {
    setSelectedDateKey((prev) => {
      if (prev && journeyModel.points.some((p) => p.dateKey === prev)) {
        return prev;
      }
      return defaultSelectedDateKey;
    });
  }, [habit.habitId, windowDays, defaultSelectedDateKey, journeyModel.points]);

  const effectiveSelectedDateKey =
    selectedDateKey && journeyModel.points.some((p) => p.dateKey === selectedDateKey)
      ? selectedDateKey
      : defaultSelectedDateKey;

  const selectedPointIndex = useMemo(() => {
    if (!effectiveSelectedDateKey) return -1;
    return journeyModel.points.findIndex((p) => p.dateKey === effectiveSelectedDateKey);
  }, [journeyModel.points, effectiveSelectedDateKey]);

  const canStepPrevPoint = selectedPointIndex > 0;
  const canStepNextPoint =
    selectedPointIndex >= 0 && selectedPointIndex < journeyModel.points.length - 1;

  const handleStepPoint = (delta: -1 | 1) => {
    if (selectedPointIndex < 0) return;
    const nextIdx = selectedPointIndex + delta;
    if (nextIdx < 0 || nextIdx >= journeyModel.points.length) return;
    setSelectedDateKey(journeyModel.points[nextIdx].dateKey);
  };

  const pointDetail = useMemo(() => {
    if (!effectiveSelectedDateKey || journeyModel.statusCode === 'unavailable') return null;
    return getHabitJourneyPointDetail(store, habit.habitId, effectiveSelectedDateKey);
  }, [store, habit.habitId, effectiveSelectedDateKey, journeyModel.statusCode]);

  const statusExplanation = useMemo(
    () => getHabitStatusExplanation(store, journeyModel),
    [store, journeyModel]
  );

  const timelineEvents = useMemo(
    () => getHabitJourneyTimeline(store, habit.habitId, referenceDate),
    [store, habit.habitId, referenceDate]
  );

  const visibleTimelineEvents = showAllTimelineEvents
    ? timelineEvents
    : timelineEvents.slice(0, 5);
  const hiddenEarlierCount = Math.max(0, timelineEvents.length - 5);

  const nextStep = useMemo(
    () =>
      getHabitJourneyNextStep(store, habit, journeyModel, {
        sharedWeeklyProposal,
        sharedWeeklyExperiment,
        resolvedAdjustmentKeys,
      }),
    [
      store,
      habit,
      journeyModel,
      sharedWeeklyProposal,
      sharedWeeklyExperiment,
      resolvedAdjustmentKeys,
    ]
  );

  const habitDetailsList = [
    habit.regularAction ? `Regular: ${habit.regularAction}` : null,
    habit.minimumAction ? `Lighter: ${habit.minimumAction}` : null,
    habit.alternativeAction ? `Backup: ${habit.alternativeAction}` : null,
    habit.cueTiming ? `Cue: ${habit.cueTiming}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div
      id="view-journey-secondary-page"
      data-journey-habit-id={habit.habitId}
      data-journey-window={windowDays}
      data-journey-status={journeyModel.statusCode}
      className="flex flex-col text-[#1C1C1E]"
    >
      {/* 1. Current Habit */}
      <section
        id="journey-section-habit"
        aria-label="Current habit"
        className="pb-4 border-b border-[rgba(74,66,98,0.08)] flex flex-col gap-1.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">Habit</span>
            <h4
              id="journey-habit-label"
              className="mt-0.5 text-[18px] font-semibold leading-[25px] text-[#302D3D] break-words"
            >
              {habit.label}
            </h4>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {confirmedHabitCount > 1 && onSwitchHabit && (
              <button
                type="button"
                id="journey-switch-habit-btn"
                onClick={onSwitchHabit}
                className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[13px] font-medium leading-[18px] text-[#706A7C] hover:text-[#5E5BAE] cursor-pointer whitespace-nowrap"
              >
                Switch
              </button>
            )}
            <button
              type="button"
              id="journey-edit-habit-btn"
              onClick={() => onEditHabit(habit)}
              className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[15px] font-medium leading-[22px] text-[#5E5BAE] hover:text-[#4B4895] cursor-pointer whitespace-nowrap"
            >
              Edit
            </button>
          </div>
        </div>

        <div id="journey-habit-config" className="flex flex-col gap-1 mt-0.5">
          {habitDetailsList.map((line) => (
            <p key={line} className="text-[15px] font-normal leading-[22px] text-[#524C63] break-words">
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* 2. 14 / 30 / 90 days segmented switcher */}
      <section
        id="journey-section-window"
        aria-label="Display time window"
        className="pt-4 flex flex-col gap-2"
      >
        <div
          id="journey-window-switcher"
          role="group"
          aria-label="Time window"
          className="grid grid-cols-3 gap-1.5 p-1 rounded-[14px] bg-[#F3F1F8]"
        >
          {WINDOW_OPTIONS.map((days) => {
            const isSelected = windowDays === days;
            return (
              <button
                key={days}
                type="button"
                id={`journey-window-${days}`}
                aria-pressed={isSelected}
                onClick={() => setWindowDays(days)}
                className={`genki-plan-control min-h-[44px] px-2 rounded-[10px] text-[14px] font-semibold leading-[20px] whitespace-nowrap transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-white text-[#302D3D] shadow-[0_1px_4px_rgba(74,66,98,0.10)]'
                    : 'bg-transparent text-[#625A76] hover:text-[#302D3D]'
                }`}
              >
                {days} days
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Current status & Why */}
      <section
        id="journey-section-status"
        aria-label="Current rhythm status"
        className="pt-4 flex flex-col"
      >
        {statusExplanation.isHiddenByUser ? (
          <div
            id="journey-status-hidden-note"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[15px] font-medium leading-[22px] text-[#706A7C]">
              Status hidden
            </span>
            <button
              type="button"
              id="journey-show-conclusion-btn"
              onClick={() => {
                onShowStatusConclusion();
              }}
              className="genki-plan-control genki-plan-control-base min-h-[44px] px-2 text-[14px] font-medium leading-[20px] text-[#5E5BAE] cursor-pointer"
            >
              Show
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4
              id="journey-status-label"
              className="text-[20px] font-semibold leading-[27px] text-[#302D3D] tracking-[-0.015em]"
            >
              {journeyModel.statusLabel}
            </h4>
            <button
              type="button"
              id="journey-why-btn"
              aria-expanded={isWhyOpen}
              aria-controls="journey-why-panel"
              onClick={() => setIsWhyOpen((prev) => !prev)}
              className="genki-plan-control genki-plan-control-base min-h-[44px] px-1 text-[13px] font-medium leading-[18px] text-[#5E5BAE] hover:text-[#4B4895] cursor-pointer whitespace-nowrap"
            >
              Why
            </button>
          </div>
        )}

        <p
          id="journey-numeric-summary"
          className="mt-1 text-[15px] font-medium leading-[22px] text-[#302D3D] tabular-nums"
        >
          {journeyModel.numericSummary}
        </p>

        {/* Expanded factual explanation ("Why") */}
        {isWhyOpen && !statusExplanation.isHiddenByUser && (
          <div
            id="journey-why-panel"
            className="mt-3 rounded-[16px] bg-[#F7F5FB] border border-[#7770B6]/12 p-4 flex flex-col gap-3"
          >
            {journeyModel.factualBasis && (
              <p className="text-[13px] font-normal leading-[18px] text-[#524C63]">
                {journeyModel.factualBasis}
              </p>
            )}

            <p id="journey-why-rule" className="text-[13px] font-normal leading-[18px] text-[#524C63]">
              {statusExplanation.ruleSummary}
            </p>

            {statusExplanation.triggerRecords.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold leading-[18px] text-[#302D3D]">
                  Recent records
                </span>
                <ul id="journey-why-triggers" className="flex flex-col gap-1">
                  {statusExplanation.triggerRecords.map((item) => (
                    <li key={item} className="text-[13px] font-normal leading-[18px] text-[#524C63]">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {statusExplanation.selfReportSummary.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold leading-[18px] text-[#302D3D]">
                  Check-ins
                </span>
                <ul id="journey-why-self-reports" className="flex flex-col gap-1">
                  {statusExplanation.selfReportSummary.map((item) => (
                    <li key={item} className="text-[13px] font-normal leading-[18px] text-[#524C63]">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {statusExplanation.missingInformation.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold leading-[18px] text-[#302D3D]">
                  Not covered yet
                </span>
                <ul id="journey-why-missing" className="flex flex-col gap-1">
                  {statusExplanation.missingInformation.map((item) => (
                    <li key={item} className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-2">
              <button
                type="button"
                id="journey-disagree-btn"
                aria-expanded={isDisagreeOpen}
                aria-controls="journey-disagree-panel"
                onClick={() => setIsDisagreeOpen((prev) => !prev)}
                className="genki-plan-control genki-plan-control-base self-start min-h-[44px] px-1 text-[13px] font-medium leading-[18px] text-[#5E5BAE] cursor-pointer"
              >
                This doesn’t fit
              </button>

              {isDisagreeOpen && (
                <div id="journey-disagree-panel" className="flex flex-col gap-1.5 pt-1">
                  <button
                    type="button"
                    id="journey-fix-records-btn"
                    onClick={onOpenHistoryFromJourney}
                    className="genki-plan-control w-full min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-left text-[14px] font-medium leading-[20px] text-[#302D3D] hover:bg-[#F3F1F8] transition-colors cursor-pointer"
                  >
                    Review records in History
                  </button>

                  <button
                    type="button"
                    id="journey-add-feeling-btn"
                    onClick={onOpenStartingFeelInNova}
                    className="genki-plan-control w-full min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-left text-[14px] font-medium leading-[20px] text-[#302D3D] hover:bg-[#F3F1F8] transition-colors cursor-pointer"
                  >
                    Add how starting feels
                  </button>

                  <button
                    type="button"
                    id="journey-hide-conclusion-btn"
                    onClick={() => {
                      const res = onHideStatusConclusion();
                      if (res.ok) {
                        setIsWhyOpen(false);
                        setIsDisagreeOpen(false);
                      }
                    }}
                    className="genki-plan-control w-full min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-left text-[14px] font-medium leading-[20px] text-[#625A76] hover:bg-[#F3F1F8] transition-colors cursor-pointer"
                  >
                    Hide status note
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. Interactive Rolling 7-Day Practice Days Chart */}
      <section
        id="journey-section-chart"
        aria-label="Rolling 7-day practice days chart"
        className="flex flex-col"
      >
        {journeyModel.statusCode === 'unavailable' ? (
          <div
            id="journey-unavailable-state"
            className="mt-4 rounded-[16px] bg-[#F7F5FB]/90 border border-[#7770B6]/10 px-4 py-4 flex flex-col gap-3"
          >
            <p className="text-[15px] font-normal leading-[22px] text-[#706A7C]">
              Couldn’t load recent practice records.
            </p>
            <button
              type="button"
              id="journey-retry-btn"
              onClick={onRetryQuery}
              className="genki-plan-control self-start min-h-[48px] px-5 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <PlanRhythmChart
              model={journeyModel}
              interactive
              selectedDateKey={effectiveSelectedDateKey}
              onSelectDateKey={(dk) => setSelectedDateKey(dk)}
              svgId="journey-chart-svg"
            />
            {journeyModel.hasChartData &&
              journeyModel.validPointCount < journeyModel.windowDays && (
                <p
                  id="journey-partial-coverage-note"
                  className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums"
                >
                  {journeyModel.validPointCount} of {journeyModel.windowDays} days have 7-day data.
                </p>
              )}
          </>
        )}
      </section>

      {/* 5. Selected-Point Detail & 7-Day Date Status Strip */}
      {pointDetail && journeyModel.statusCode !== 'unavailable' && (
        <section
          id="journey-point-detail"
          aria-label="Selected day 7-day window breakdown"
          data-selected-as-of={pointDetail.asOfDateKey}
          className="mt-4 rounded-[18px] bg-[#F7F5FB]/90 border border-[#7770B6]/12 p-4 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              id="journey-point-prev-btn"
              disabled={!canStepPrevPoint}
              onClick={() => handleStepPoint(-1)}
              aria-label="Previous day"
              className={`genki-plan-control w-[44px] h-[44px] -ml-1.5 rounded-[12px] flex items-center justify-center shrink-0 transition-colors ${
                canStepPrevPoint
                  ? 'text-[#5E5BAE] hover:bg-[#5E5BAE]/10 cursor-pointer'
                  : 'text-[#B8B2C6] cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-[18px] h-[18px] stroke-[2.2]" />
            </button>

            <div id="journey-point-header" className="flex flex-col items-center text-center min-w-0">
              <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D] tabular-nums">
                {pointDetail.asOfShortLabel}
              </span>
              <span className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums">
                {pointDetail.windowRangeLabel}
              </span>
            </div>

            <button
              type="button"
              id="journey-point-next-btn"
              disabled={!canStepNextPoint}
              onClick={() => handleStepPoint(1)}
              aria-label="Next day"
              className={`genki-plan-control w-[44px] h-[44px] -mr-1.5 rounded-[12px] flex items-center justify-center shrink-0 transition-colors ${
                canStepNextPoint
                  ? 'text-[#5E5BAE] hover:bg-[#5E5BAE]/10 cursor-pointer'
                  : 'text-[#B8B2C6] cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-[18px] h-[18px] stroke-[2.2]" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <p
              id="journey-point-value"
              className="text-[15px] font-medium leading-[22px] text-[#302D3D] tabular-nums"
            >
              {pointDetail.distinctPracticeDayCount !== null
                ? `${pointDetail.distinctPracticeDayCount} of 7 days with movement`
                : 'Incomplete 7-day data'}
            </p>
            {pointDetail.gapExplanation && (
              <p
                id="journey-point-gap-explanation"
                className="text-[13px] font-normal leading-[18px] text-[#706A7C]"
              >
                {pointDetail.gapExplanation}
              </p>
            )}
          </div>

          {/* 7-Day Date Status Strip */}
          <div
            id="journey-date-strip"
            role="list"
            aria-label={`Daily statuses from ${pointDetail.windowRangeLabel}`}
            className="grid grid-cols-7 gap-1 pt-1"
          >
            {pointDetail.days.map((day) => (
              <div
                key={day.dateKey}
                role="listitem"
                data-strip-date={day.dateKey}
                data-strip-status={day.status}
                aria-label={day.accessibleLabel}
                className="flex flex-col items-center gap-1 py-1.5 rounded-[10px] bg-white/80 border border-[rgba(74,66,98,0.06)]"
              >
                <span aria-hidden="true" className="text-[11px] font-normal leading-[14px] text-[#706A7C]">
                  {day.weekdayShort.slice(0, 2)}
                </span>
                <span
                  aria-hidden="true"
                  className="text-[13px] font-medium leading-[18px] text-[#302D3D] tabular-nums"
                >
                  {day.dayNum}
                </span>
                <span aria-hidden="true" className="h-[14px] flex items-center justify-center">
                  {day.status === 'practice' && (
                    <span className="w-[8px] h-[8px] rounded-full bg-[#7770B6]" />
                  )}
                  {day.status === 'rest' && (
                    <span className="w-[10px] h-[2px] rounded-full bg-[#9A93A8]" />
                  )}
                  {day.status === 'paused' && (
                    <span className="inline-flex items-center gap-[2.5px]">
                      <span className="w-[2px] h-[9px] rounded-[1px] bg-[#706A7C]" />
                      <span className="w-[2px] h-[9px] rounded-[1px] bg-[#706A7C]" />
                    </span>
                  )}
                  {day.status === 'unrecorded' && (
                    <span className="w-[8px] h-[8px] rounded-full border-[1.5px] border-[#B8B2C6] bg-transparent" />
                  )}
                  {day.status === 'unknown' && (
                    <span className="text-[12px] font-semibold leading-none text-[#8B8498]">?</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          <p
            id="journey-strip-legend"
            className="text-[12px] font-normal leading-[17px] text-[#706A7C] flex flex-wrap items-center gap-x-2.5 gap-y-1"
          >
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="w-[6px] h-[6px] rounded-full bg-[#7770B6]" />
              Practice
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="w-[8px] h-[1.5px] rounded-full bg-[#9A93A8]" />
              Rest
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="font-semibold text-[#706A7C]">‖</span>
              Paused
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="w-[6px] h-[6px] rounded-full border-[1.25px] border-[#B8B2C6]" />
              Unrecorded
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="font-semibold text-[#8B8498]">?</span>
              Unknown
            </span>
          </p>

          <div
            id="journey-point-sources"
            className="pt-2.5 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-1.5"
          >
            <span className="text-[13px] font-semibold leading-[18px] text-[#302D3D]">Records</span>
            {pointDetail.windowSourceRecords.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {pointDetail.windowSourceRecords.map((rec) => (
                  <li
                    key={rec.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] leading-[18px]"
                  >
                    <span className="text-[#302D3D] font-medium break-words">{rec.title}</span>
                    <span className="text-[#706A7C] tabular-nums shrink-0">{rec.shortDateLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                No records linked to this habit in these 7 days.
              </p>
            )}
          </div>
        </section>
      )}

      {/* 6. Journey History */}
      <section
        id="journey-section-timeline"
        aria-labelledby="journey-timeline-heading"
        className="mt-6 pt-5 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-3"
      >
        <h4
          id="journey-timeline-heading"
          className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
        >
          History
        </h4>

        {timelineEvents.length === 0 ? (
          <p
            id="journey-timeline-empty"
            className="text-[15px] font-normal leading-[22px] text-[#706A7C]"
          >
            No milestones yet.
          </p>
        ) : (
          <>
            <ol id="journey-timeline-list" className="flex flex-col divide-y divide-[rgba(74,66,98,0.08)]">
              {visibleTimelineEvents.map((ev) => (
                <li
                  key={ev.id}
                  data-timeline-event={ev.kind}
                  data-timeline-status-tag={ev.statusTag ?? ''}
                  data-timeline-updated={ev.wasUpdatedAfterEdit ? 'true' : 'false'}
                  className="py-3 first:pt-0 last:pb-0 flex flex-col gap-0.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="text-[15px] font-semibold leading-[22px] text-[#302D3D]">
                      {ev.title}
                      {ev.statusTag ? (
                        <span className="font-normal text-[#5E5BAE]"> · {ev.statusTag}</span>
                      ) : null}
                      {ev.wasUpdatedAfterEdit ? (
                        <span className="font-normal text-[#706A7C]"> · Updated</span>
                      ) : null}
                    </span>
                    <span className="text-[13px] font-normal leading-[18px] text-[#706A7C] tabular-nums shrink-0">
                      {ev.shortDateLabel}
                    </span>
                  </div>
                  <p className="text-[15px] font-normal leading-[22px] text-[#524C63] break-words">
                    {ev.detail}
                  </p>
                </li>
              ))}
            </ol>

            {hiddenEarlierCount > 0 && !showAllTimelineEvents && (
              <button
                type="button"
                id="journey-show-earlier-btn"
                onClick={() => setShowAllTimelineEvents(true)}
                className="genki-plan-control genki-plan-control-base self-start min-h-[44px] px-1 text-[14px] font-medium leading-[20px] text-[#5E5BAE] hover:text-[#4B4895] cursor-pointer"
              >
                Show earlier ({hiddenEarlierCount})
              </button>
            )}

            {showAllTimelineEvents && timelineEvents.length > 5 && (
              <button
                type="button"
                id="journey-show-fewer-btn"
                onClick={() => setShowAllTimelineEvents(false)}
                className="genki-plan-control genki-plan-control-base self-start min-h-[44px] px-1 text-[14px] font-medium leading-[20px] text-[#706A7C] cursor-pointer"
              >
                Show recent 5
              </button>
            )}
          </>
        )}
      </section>

      {/* 7. Optional Next Step -> Nova Chat */}
      {nextStep && (
        <section
          id="journey-section-next-step"
          data-suggestion-id={nextStep.suggestionId}
          data-suggestion-kind={nextStep.kind}
          data-suggestion-status={nextStep.decisionStatus}
          aria-labelledby="journey-next-step-heading"
          className="mt-6 pt-5 border-t border-[rgba(74,66,98,0.08)] flex flex-col gap-3"
        >
          <span className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
            Optional next step
          </span>

          {nextStep.decisionStatus === 'accepted' ? (
            <div
              id="journey-next-step-applied"
              className="rounded-[16px] bg-[#F7F5FB] border border-[#7770B6]/14 p-4 flex flex-col gap-1"
            >
              <span className="text-[15px] font-semibold leading-[22px] text-[#514879]">
                Applied · {nextStep.title}
              </span>
              <p className="text-[13px] font-normal leading-[18px] text-[#706A7C]">
                {nextStep.afterLabel}
              </p>
            </div>
          ) : (
            <div className="rounded-[18px] bg-[#F7F5FB] border border-[#7770B6]/14 p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h4
                  id="journey-next-step-heading"
                  className="text-[15px] font-semibold leading-[22px] text-[#302D3D]"
                >
                  {nextStep.title}
                </h4>
                <p
                  id="journey-next-step-basis"
                  className="text-[15px] font-normal leading-[22px] text-[#524C63]"
                >
                  {nextStep.basis}
                </p>
              </div>

              {nextStepError && (
                <p role="alert" className="text-[13px] font-medium leading-[18px] text-[#B42318]">
                  {nextStepError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  id="journey-next-step-primary-btn"
                  onClick={() => onOpenNextStepInNova(nextStep)}
                  className="genki-plan-control min-h-[48px] px-4 rounded-[12px] bg-[#5E5BAE] hover:bg-[#524FA0] text-white text-[15px] font-semibold leading-[20px] transition-colors cursor-pointer"
                >
                  {nextStep.primaryCtaLabel}
                </button>
                <button
                  type="button"
                  id="journey-next-step-dismiss-btn"
                  onClick={() => {
                    const res = onDismissNextStep(nextStep);
                    if (!res.ok) {
                      setNextStepError(res.error ?? "Couldn't save right now. Try again.");
                    } else {
                      setNextStepError(null);
                    }
                  }}
                  className="genki-plan-control min-h-[44px] px-3.5 rounded-[12px] bg-white border border-[rgba(74,66,98,0.12)] text-[#524C63] text-[15px] font-medium leading-[20px] hover:bg-[#F3F1F8] transition-colors cursor-pointer"
                >
                  {nextStep.secondaryCtaLabel}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
