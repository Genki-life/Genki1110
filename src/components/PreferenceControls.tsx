import React, { useRef } from 'react';
import { Check, Dumbbell, Home, Trees, X } from 'lucide-react';
import {
  ActivitiesPreference,
  BestTimePreference,
  COMMON_PREFERENCE_ACTIVITIES,
  PLACE_OPTIONS,
  PreferencePlace,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_STEP_MINUTES,
  SessionLengthPreference,
  TIMELINE_MAX_MINUTES,
  TIMELINE_MIN_MINUTES,
  TIMELINE_STEP_MINUTES,
  WherePreference,
  clampSessionMinutes,
  clampTimelineMinutes,
  formatClockMinutes,
  getActivityIconKey,
  getActivityLabel,
} from '../utils/preferencesStore';
import { WorkoutActivityIcon } from './WorkoutActivityIcon';

// ============================================================================
// CONTROL 1: Session length — Dual-Thumb Range Slider (5–60 min, step 5)
// ============================================================================

export interface SessionLengthDualSliderProps {
  value: SessionLengthPreference;
  onChange: (next: SessionLengthPreference) => void;
}

const SESSION_TICKS = [5, 20, 40, 60];

export const SessionLengthDualSlider: React.FC<SessionLengthDualSliderProps> = ({
  value,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingThumbRef = useRef<'min' | 'max' | null>(null);
  const overlapAnchorXRef = useRef<number | null>(null);

  const isUnset = value.mode === 'unset';
  const isFlexible = value.mode === 'flexible';
  const minVal =
    value.mode === 'range'
      ? clampSessionMinutes(value.minMinutes ?? 10)
      : 10;
  const maxVal =
    value.mode === 'range'
      ? clampSessionMinutes(value.maxMinutes ?? 20)
      : 20;

  const percentOf = (mins: number) =>
    ((mins - SESSION_MIN_MINUTES) / (SESSION_MAX_MINUTES - SESSION_MIN_MINUTES)) * 100;

  const minutesFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return minVal;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = SESSION_MIN_MINUTES + ratio * (SESSION_MAX_MINUTES - SESSION_MIN_MINUTES);
    return clampSessionMinutes(raw);
  };

  const applyThumbValue = (thumb: 'min' | 'max', nextMins: number) => {
    if (thumb === 'min') {
      const bounded = Math.min(nextMins, maxVal);
      onChange({ mode: 'range', minMinutes: bounded, maxMinutes: maxVal });
    } else {
      const bounded = Math.max(nextMins, minVal);
      onChange({ mode: 'range', minMinutes: minVal, maxMinutes: bounded });
    }
  };

  const handleThumbPointerDown = (
    thumb: 'min' | 'max',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();

    if (value.mode === 'range' && minVal === maxVal) {
      draggingThumbRef.current = null;
      overlapAnchorXRef.current = e.clientX;
    } else {
      draggingThumbRef.current = thumb;
      overlapAnchorXRef.current = null;
      if (isUnset || isFlexible) {
        onChange({ mode: 'range', minMinutes: minVal, maxMinutes: maxVal });
      }
    }
  };

  const handleThumbPointerMove = (
    fallbackThumb: 'min' | 'max',
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();

    let activeThumb = draggingThumbRef.current;
    if (!activeThumb) {
      const anchorX = overlapAnchorXRef.current ?? e.clientX;
      const dx = e.clientX - anchorX;
      if (Math.abs(dx) < 3) return;
      activeThumb = dx < 0 ? 'min' : 'max';
      draggingThumbRef.current = activeThumb;
    }

    const nextMins = minutesFromClientX(e.clientX);
    applyThumbValue(activeThumb ?? fallbackThumb, nextMins);
  };

  const handleThumbPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    draggingThumbRef.current = null;
    overlapAnchorXRef.current = null;
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const clickedMins = minutesFromClientX(e.clientX);
    if (isUnset || isFlexible) {
      const lo = Math.min(clickedMins, Math.min(SESSION_MAX_MINUTES, clickedMins + 5));
      const hi = Math.min(SESSION_MAX_MINUTES, Math.max(lo, clickedMins + 10));
      onChange({ mode: 'range', minMinutes: lo, maxMinutes: hi });
      return;
    }
    if (minVal === maxVal) {
      if (clickedMins < minVal) {
        onChange({ mode: 'range', minMinutes: clickedMins, maxMinutes: maxVal });
      } else {
        onChange({ mode: 'range', minMinutes: minVal, maxMinutes: clickedMins });
      }
      return;
    }
    const distMin = Math.abs(clickedMins - minVal);
    const distMax = Math.abs(clickedMins - maxVal);
    if (distMin <= distMax) {
      applyThumbValue('min', clickedMins);
    } else {
      applyThumbValue('max', clickedMins);
    }
  };

  const handleThumbKeyDown = (
    thumb: 'min' | 'max',
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    const current = thumb === 'min' ? minVal : maxVal;
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = SESSION_STEP_MINUTES;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -SESSION_STEP_MINUTES;
    else if (e.key === 'PageUp') delta = SESSION_STEP_MINUTES * 2;
    else if (e.key === 'PageDown') delta = -SESSION_STEP_MINUTES * 2;
    else if (e.key === 'Home') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'min' ? SESSION_MIN_MINUTES : minVal);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      applyThumbValue(thumb, thumb === 'max' ? SESSION_MAX_MINUTES : maxVal);
      return;
    } else {
      return;
    }
    e.preventDefault();
    applyThumbValue(thumb, clampSessionMinutes(current + delta));
  };

  const minPct = percentOf(minVal);
  const maxPct = percentOf(maxVal);
  const dimmed = isFlexible || isUnset;

  return (
    <div className="space-y-3" data-testid="pref-control-session-length">
      {isUnset && (
        <p className="text-[12px] leading-[17px] text-[#6F687B]">
          Drag the handles to choose a range, or select Flexible.
        </p>
      )}

      <div className="px-3 pt-1 pb-1">
        <div
          ref={trackRef}
          data-testid="session-length-track"
          onPointerDown={handleTrackPointerDown}
          className="relative h-[44px] flex items-center select-none touch-none cursor-pointer"
        >
          <div className="w-full h-[6px] rounded-full bg-[#ECEAF4]" />

          {!dimmed && (
            <div
              className="absolute h-[6px] rounded-full bg-[#51489A] pointer-events-none"
              style={{
                left: `${minPct}%`,
                width: `${Math.max(0, maxPct - minPct)}%`,
              }}
            />
          )}

          <div
            role="slider"
            tabIndex={0}
            data-testid="session-length-thumb-min"
            aria-label="Minimum session length"
            aria-valuemin={SESSION_MIN_MINUTES}
            aria-valuemax={maxVal}
            aria-valuenow={minVal}
            aria-valuetext={`${minVal} minutes`}
            onPointerDown={(e) => handleThumbPointerDown('min', e)}
            onPointerMove={(e) => handleThumbPointerMove('min', e)}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
            onKeyDown={(e) => handleThumbKeyDown('min', e)}
            style={{ left: `${minPct}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[44px] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none group z-10"
          >
            <span
              className={`w-[24px] h-[24px] rounded-full bg-white border-[2.5px] shadow-[0_2px_8px_rgba(81,72,154,0.22)] transition-transform group-active:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#51489A] group-focus-visible:ring-offset-2 ${
                dimmed ? 'border-[#B9B3CB]' : 'border-[#51489A]'
              }`}
            />
          </div>

          <div
            role="slider"
            tabIndex={0}
            data-testid="session-length-thumb-max"
            aria-label="Maximum session length"
            aria-valuemin={minVal}
            aria-valuemax={SESSION_MAX_MINUTES}
            aria-valuenow={maxVal}
            aria-valuetext={`${maxVal} minutes`}
            onPointerDown={(e) => handleThumbPointerDown('max', e)}
            onPointerMove={(e) => handleThumbPointerMove('max', e)}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
            onKeyDown={(e) => handleThumbKeyDown('max', e)}
            style={{ left: `${maxPct}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[44px] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none group z-20"
          >
            <span
              className={`w-[24px] h-[24px] rounded-full bg-white border-[2.5px] shadow-[0_2px_8px_rgba(81,72,154,0.22)] transition-transform group-active:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#51489A] group-focus-visible:ring-offset-2 ${
                dimmed ? 'border-[#B9B3CB]' : 'border-[#51489A]'
              }`}
            />
          </div>
        </div>

        <div className="relative h-[16px] mt-0.5 text-[11px] leading-[16px] text-[#6F687B] tabular-nums select-none">
          {SESSION_TICKS.map((tick) => {
            const pct = percentOf(tick);
            const alignClass =
              tick === SESSION_MIN_MINUTES
                ? 'translate-x-0'
                : tick === SESSION_MAX_MINUTES
                ? '-translate-x-full'
                : '-translate-x-1/2';
            return (
              <span
                key={tick}
                style={{ left: `${pct}%` }}
                className={`absolute top-0 ${alignClass}`}
              >
                {tick}m
              </span>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        data-testid="session-length-flexible-btn"
        aria-pressed={isFlexible}
        onClick={() => {
          if (isFlexible) {
            onChange({ mode: 'range', minMinutes: minVal, maxMinutes: maxVal });
          } else {
            onChange({ mode: 'flexible' });
          }
        }}
        className={`w-full min-h-[44px] px-3.5 rounded-[14px] border flex items-center justify-between gap-2 text-[14px] leading-[20px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
          isFlexible
            ? 'bg-[#F3EEFE] border-[#51489A] text-[#51489A] font-semibold'
            : 'bg-[#F8F7FB] border-black/[0.06] text-[#3F3A4D] font-medium hover:bg-[#F1EEF8]'
        }`}
      >
        <span>Flexible</span>
        {isFlexible && (
          <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
};

// ============================================================================
// CONTROL 2: Best time — Draggable Time Range Timeline (30-min snap + cues)
// ============================================================================

export interface BestTimeTimelineControlProps {
  value: BestTimePreference;
  onChange: (next: BestTimePreference) => void;
  /** Original saved natural cue (e.g. "after lunch") so user can keep or restore it inline */
  originalCueText?: string | null;
  /** Whether to show chat-specific copy ("type below...") */
  showChatHints?: boolean;
}

const TIMELINE_SPAN = TIMELINE_MAX_MINUTES - TIMELINE_MIN_MINUTES; // 960 min (6am–10pm)

function formatCueTitleCase(cue: string): string {
  const trimmed = cue.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const BestTimeTimelineControl: React.FC<BestTimeTimelineControlProps> = ({
  value,
  onChange,
  originalCueText = null,
  showChatHints = true,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragModeRef = useRef<'start' | 'end' | 'window' | null>(null);
  const windowDragOriginRef = useRef<{
    pointerStartMins: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const isUnset = value.mode === 'unset';
  const isFlexible = value.mode === 'flexible';
  const isCue = value.mode === 'cue';

  const startMins =
    value.mode === 'window'
      ? clampTimelineMinutes(value.startMinutes ?? 18 * 60)
      : 18 * 60;
  const endMins =
    value.mode === 'window'
      ? clampTimelineMinutes(value.endMinutes ?? 20 * 60)
      : 20 * 60;

  const pctOf = (mins: number) =>
    Math.max(0, Math.min(100, ((mins - TIMELINE_MIN_MINUTES) / TIMELINE_SPAN) * 100));

  const minutesFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return startMins;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampTimelineMinutes(TIMELINE_MIN_MINUTES + ratio * TIMELINE_SPAN);
  };

  const handleStartHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    dragModeRef.current = 'start';
    if (value.mode !== 'window') {
      onChange({ mode: 'window', startMinutes: startMins, endMinutes: endMins });
    }
  };

  const handleEndHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    dragModeRef.current = 'end';
    if (value.mode !== 'window') {
      onChange({ mode: 'window', startMinutes: startMins, endMinutes: endMins });
    }
  };

  const handleWindowBodyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragModeRef.current = 'window';
    windowDragOriginRef.current = {
      pointerStartMins: minutesFromClientX(e.clientX),
      origStart: startMins,
      origEnd: endMins,
    };
    if (value.mode !== 'window') {
      onChange({ mode: 'window', startMinutes: startMins, endMinutes: endMins });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    const pointerMins = minutesFromClientX(e.clientX);
    const mode = dragModeRef.current;
    if (mode === 'start') {
      const nextStart = Math.min(pointerMins, endMins - TIMELINE_STEP_MINUTES);
      onChange({
        mode: 'window',
        startMinutes: Math.max(TIMELINE_MIN_MINUTES, nextStart),
        endMinutes: endMins,
      });
    } else if (mode === 'end') {
      const nextEnd = Math.max(pointerMins, startMins + TIMELINE_STEP_MINUTES);
      onChange({
        mode: 'window',
        startMinutes: startMins,
        endMinutes: Math.min(TIMELINE_MAX_MINUTES, nextEnd),
      });
    } else if (mode === 'window' && windowDragOriginRef.current) {
      const { pointerStartMins, origStart, origEnd } = windowDragOriginRef.current;
      const duration = origEnd - origStart;
      const delta = pointerMins - pointerStartMins;
      const rawStart = origStart + delta;
      const clampedStart = Math.max(
        TIMELINE_MIN_MINUTES,
        Math.min(TIMELINE_MAX_MINUTES - duration, clampTimelineMinutes(rawStart))
      );
      onChange({
        mode: 'window',
        startMinutes: clampedStart,
        endMinutes: clampedStart + duration,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragModeRef.current = null;
    windowDragOriginRef.current = null;
  };

  const handleTrackClick = (e: React.PointerEvent<HTMLDivElement>) => {
    const clickedMins = minutesFromClientX(e.clientX);
    const duration = Math.max(60, endMins - startMins);
    const half = Math.round(duration / 2 / TIMELINE_STEP_MINUTES) * TIMELINE_STEP_MINUTES;
    const nextStart = Math.max(
      TIMELINE_MIN_MINUTES,
      Math.min(TIMELINE_MAX_MINUTES - duration, clampTimelineMinutes(clickedMins - half))
    );
    onChange({
      mode: 'window',
      startMinutes: nextStart,
      endMinutes: nextStart + duration,
    });
  };

  const handleHandleKeyDown = (
    side: 'start' | 'end',
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    let delta = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = TIMELINE_STEP_MINUTES;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -TIMELINE_STEP_MINUTES;
    else if (e.key === 'PageUp') delta = TIMELINE_STEP_MINUTES * 2;
    else if (e.key === 'PageDown') delta = -TIMELINE_STEP_MINUTES * 2;
    else return;
    e.preventDefault();

    if (side === 'start') {
      const next = Math.max(
        TIMELINE_MIN_MINUTES,
        Math.min(endMins - TIMELINE_STEP_MINUTES, startMins + delta)
      );
      onChange({ mode: 'window', startMinutes: next, endMinutes: endMins });
    } else {
      const next = Math.min(
        TIMELINE_MAX_MINUTES,
        Math.max(startMins + TIMELINE_STEP_MINUTES, endMins + delta)
      );
      onChange({ mode: 'window', startMinutes: startMins, endMinutes: next });
    }
  };

  const startPct = pctOf(startMins);
  const endPct = pctOf(endMins);
  const dimmed = isFlexible || isUnset || isCue;
  const activeCueText = (isCue ? value.cueText : originalCueText)?.trim() || null;

  return (
    <div className="space-y-3" data-testid="pref-control-best-time">
      {isUnset && (
        <p className="text-[12px] leading-[17px] text-[#6F687B]">
          {showChatHints
            ? 'Drag on the timeline, pick No fixed time, or type a life cue like “after lunch” below.'
            : 'Drag on the timeline to choose a time window, or select No fixed time.'}
        </p>
      )}

      {isCue && value.cueText && (
        <div
          data-testid="best-time-cue-banner"
          className="rounded-[14px] bg-[#F3EEFE] border border-[#51489A]/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-[13px] leading-[18px] text-[#51489A]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
            <span className="font-semibold truncate">{formatCueTitleCase(value.cueText)}</span>
          </div>
          <button
            type="button"
            data-testid="best-time-switch-window-btn"
            onClick={() =>
              onChange({ mode: 'window', startMinutes: startMins, endMinutes: endMins })
            }
            className="min-h-[32px] px-2 -mr-1 text-[12px] font-semibold underline underline-offset-2 shrink-0 cursor-pointer"
          >
            Set time window
          </button>
        </div>
      )}

      {!isCue && activeCueText && (
        <button
          type="button"
          data-testid="best-time-restore-cue-btn"
          onClick={() => onChange({ mode: 'cue', cueText: activeCueText })}
          className="w-full min-h-[40px] px-3.5 rounded-[14px] bg-[#F8F7FB] border border-black/[0.06] flex items-center justify-between gap-2 text-[13px] leading-[18px] text-[#3F3A4D] hover:bg-[#F1EEF8] transition-colors cursor-pointer"
        >
          <span className="truncate">Keep “{formatCueTitleCase(activeCueText)}”</span>
          <span className="text-[12px] font-medium text-[#51489A] shrink-0">Use saved</span>
        </button>
      )}

      <div className="px-3">
        <div className="grid grid-cols-[6fr_6fr_4fr] text-[11px] leading-[16px] font-medium text-[#6F687B] mb-1 select-none">
          <span className="text-left">Morning</span>
          <span className="text-center">Afternoon</span>
          <span className="text-right">Evening</span>
        </div>

        <div
          ref={trackRef}
          data-testid="best-time-track"
          onPointerDown={handleTrackClick}
          className="relative h-[48px] flex items-center select-none touch-none cursor-pointer"
        >
          <div className="relative w-full h-[26px] rounded-[12px] bg-[#F1EFF8] border border-black/[0.05] overflow-hidden">
            <div
              className="absolute top-0 bottom-0 w-px bg-black/[0.08]"
              style={{ left: `${pctOf(12 * 60)}%` }}
              aria-hidden="true"
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-black/[0.08]"
              style={{ left: `${pctOf(18 * 60)}%` }}
              aria-hidden="true"
            />
          </div>

          {!dimmed && (
            <div
              data-testid="best-time-window-body"
              role="group"
              aria-label="Move selected time window"
              onPointerDown={handleWindowBodyDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                left: `${startPct}%`,
                width: `${Math.max(4, endPct - startPct)}%`,
              }}
              className="absolute h-[28px] rounded-[12px] bg-[#51489A]/[0.18] border-[1.5px] border-[#51489A] touch-none cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
            >
              <span
                className="w-4 h-[3px] rounded-full bg-[#51489A]/45 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          )}

          <div
            role="slider"
            tabIndex={0}
            data-testid="best-time-thumb-start"
            aria-label="Start time"
            aria-valuemin={TIMELINE_MIN_MINUTES}
            aria-valuemax={endMins - TIMELINE_STEP_MINUTES}
            aria-valuenow={startMins}
            aria-valuetext={formatClockMinutes(startMins)}
            onPointerDown={handleStartHandleDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(e) => handleHandleKeyDown('start', e)}
            style={{ left: `${startPct}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[44px] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none group z-20"
          >
            <span
              className={`w-[24px] h-[24px] rounded-full bg-white border-[2.5px] shadow-[0_2px_8px_rgba(81,72,154,0.22)] transition-transform group-active:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#51489A] group-focus-visible:ring-offset-2 ${
                dimmed ? 'border-[#B9B3CB]' : 'border-[#51489A]'
              }`}
            />
          </div>

          <div
            role="slider"
            tabIndex={0}
            data-testid="best-time-thumb-end"
            aria-label="End time"
            aria-valuemin={startMins + TIMELINE_STEP_MINUTES}
            aria-valuemax={TIMELINE_MAX_MINUTES}
            aria-valuenow={endMins}
            aria-valuetext={formatClockMinutes(endMins)}
            onPointerDown={handleEndHandleDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(e) => handleHandleKeyDown('end', e)}
            style={{ left: `${endPct}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[44px] h-[44px] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none group z-30"
          >
            <span
              className={`w-[24px] h-[24px] rounded-full bg-white border-[2.5px] shadow-[0_2px_8px_rgba(81,72,154,0.22)] transition-transform group-active:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[#51489A] group-focus-visible:ring-offset-2 ${
                dimmed ? 'border-[#B9B3CB]' : 'border-[#51489A]'
              }`}
            />
          </div>
        </div>

        <div className="relative h-[16px] mt-0.5 text-[11px] leading-[16px] text-[#6F687B] tabular-nums select-none">
          <span className="absolute left-0 top-0">6 am</span>
          <span
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${pctOf(12 * 60)}%` }}
          >
            12 pm
          </span>
          <span
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${pctOf(18 * 60)}%` }}
          >
            6 pm
          </span>
          <span className="absolute right-0 top-0">10 pm</span>
        </div>
      </div>

      <button
        type="button"
        data-testid="best-time-flexible-btn"
        aria-pressed={isFlexible}
        onClick={() => {
          if (isFlexible) {
            onChange({ mode: 'window', startMinutes: startMins, endMinutes: endMins });
          } else {
            onChange({ mode: 'flexible' });
          }
        }}
        className={`w-full min-h-[44px] px-3.5 rounded-[14px] border flex items-center justify-between gap-2 text-[14px] leading-[20px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
          isFlexible
            ? 'bg-[#F3EEFE] border-[#51489A] text-[#51489A] font-semibold'
            : 'bg-[#F8F7FB] border-black/[0.06] text-[#3F3A4D] font-medium hover:bg-[#F1EEF8]'
        }`}
      >
        <span>No fixed time</span>
        {isFlexible && (
          <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>

      {showChatHints && (
        <p className="text-[12px] leading-[16px] text-[#6F687B]">
          Or type a life cue below, like “after lunch”.
        </p>
      )}
    </div>
  );
};

// ============================================================================
// CONTROL 3: Where — Multi-Select Icon Cards (Home, Outdoors, Gym)
// ============================================================================

export interface WhereIconCardsControlProps {
  value: WherePreference;
  onChange: (next: WherePreference) => void;
}

export const WhereIconCardsControl: React.FC<WhereIconCardsControlProps> = ({
  value,
  onChange,
}) => {
  const togglePlace = (place: PreferencePlace) => {
    const exists = value.places.includes(place);
    const nextPlaces = exists
      ? value.places.filter((p) => p !== place)
      : [...value.places, place];
    onChange({ places: nextPlaces });
  };

  return (
    <div
      className="grid grid-cols-3 gap-2.5"
      role="group"
      aria-label="Where you prefer to move"
      data-testid="pref-control-where"
    >
      {PLACE_OPTIONS.map((opt) => {
        const isSelected = value.places.includes(opt.key);
        const IconComp =
          opt.key === 'home' ? Home : opt.key === 'outdoors' ? Trees : Dumbbell;
        return (
          <button
            key={opt.key}
            type="button"
            data-testid={`where-card-${opt.key}`}
            aria-pressed={isSelected}
            onClick={() => togglePlace(opt.key)}
            className={`relative min-h-[82px] px-2 py-3 rounded-[16px] border flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
              isSelected
                ? 'bg-[#F3EEFE] border-[#51489A] text-[#51489A]'
                : 'bg-[#F8F7FB] border-black/[0.07] text-[#3F3A4D] hover:bg-[#F1EEF8]'
            }`}
          >
            {isSelected && (
              <span
                data-testid={`where-card-check-${opt.key}`}
                className="absolute top-2 right-2 w-[18px] h-[18px] rounded-full bg-[#51489A] text-white flex items-center justify-center"
                aria-hidden="true"
              >
                <Check className="w-[11px] h-[11px]" strokeWidth={2.8} />
              </span>
            )}
            <IconComp
              className={`w-[22px] h-[22px] ${
                isSelected ? 'text-[#51489A]' : 'text-[#555066]'
              }`}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="text-[13px] leading-[17px] font-semibold whitespace-nowrap">
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// CONTROL 4: Activities — Icon + Label Multi-Select Grid
// ============================================================================

export interface ActivitiesPickerControlProps {
  value: ActivitiesPreference;
  onChange: (next: ActivitiesPreference) => void;
  /** Whether to show the separate "Selected" shelf above the grid (used in Nova chat) */
  showSelectedShelf?: boolean;
  /** Whether to show chat-specific copy ("Want less of something? Tell Nova below...") */
  showChatHints?: boolean;
}

export const ActivitiesPickerControl: React.FC<ActivitiesPickerControlProps> = ({
  value,
  onChange,
  showSelectedShelf = true,
  showChatHints = true,
}) => {
  const toggleActivity = (key: string) => {
    const exists = value.selected.includes(key);
    const next = exists
      ? value.selected.filter((k) => k !== key)
      : [...value.selected, key];
    onChange({ selected: next });
  };

  const removeActivity = (key: string) => {
    onChange({ selected: value.selected.filter((k) => k !== key) });
  };

  const presetKeys = new Set(COMMON_PREFERENCE_ACTIVITIES.map((a) => a.key));
  const extraCustomActivities = value.selected
    .filter((k) => !presetKeys.has(k))
    .map((key) => ({
      key,
      label: getActivityLabel(key),
      iconKey: getActivityIconKey(key),
    }));

  const gridItems = showSelectedShelf
    ? COMMON_PREFERENCE_ACTIVITIES
    : [...COMMON_PREFERENCE_ACTIVITIES, ...extraCustomActivities];

  return (
    <div className="space-y-3" data-testid="pref-control-activities">
      {showSelectedShelf && (
        <div
          data-testid="activities-selected-area"
          className="rounded-[14px] bg-[#F8F7FB] border border-black/[0.05] p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between text-[12px] leading-[16px] text-[#6F687B]">
            <span>Selected</span>
            <span className="tabular-nums">{value.selected.length}</span>
          </div>

          {value.selected.length === 0 ? (
            <p className="text-[13px] leading-[18px] text-[#6F687B] py-1">
              Tap activities below to add them here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {value.selected.map((key) => {
                const label = getActivityLabel(key);
                const iconKey = getActivityIconKey(key);
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid={`activity-selected-chip-${key}`}
                    aria-label={`Remove ${label}`}
                    onClick={() => removeActivity(key)}
                    className="min-h-[36px] pl-2.5 pr-2 py-1 rounded-[12px] bg-[#F3EEFE] border border-[#51489A]/35 text-[#51489A] inline-flex items-center gap-1.5 text-[13px] leading-[18px] font-semibold hover:bg-[#EAE2FD] active:opacity-80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A]"
                  >
                    <WorkoutActivityIcon typeKey={iconKey} size={15} className="shrink-0" />
                    <span>{label}</span>
                    <X className="w-[14px] h-[14px] shrink-0 opacity-80" strokeWidth={2.2} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        className="grid grid-cols-3 gap-2"
        role="group"
        aria-label="Choose preferred activities"
      >
        {gridItems.map((act) => {
          const isSelected = value.selected.includes(act.key);
          return (
            <button
              key={act.key}
              type="button"
              data-testid={`activity-option-${act.key}`}
              aria-pressed={isSelected}
              onClick={() => toggleActivity(act.key)}
              className={`relative min-h-[70px] px-2 py-2.5 rounded-[14px] border flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
                isSelected
                  ? 'bg-[#F3EEFE] border-[#51489A] text-[#51489A]'
                  : 'bg-[#F8F7FB] border-black/[0.06] text-[#3F3A4D] hover:bg-[#F1EEF8]'
              }`}
            >
              {isSelected && (
                <span
                  data-testid={`activity-option-check-${act.key}`}
                  className="absolute top-1.5 right-1.5 w-[16px] h-[16px] rounded-full bg-[#51489A] text-white flex items-center justify-center"
                  aria-hidden="true"
                >
                  <Check className="w-[10px] h-[10px]" strokeWidth={2.8} />
                </span>
              )}
              <WorkoutActivityIcon typeKey={act.iconKey} size={20} />
              <span className="text-[12px] leading-[16px] font-medium whitespace-nowrap">
                {act.label}
              </span>
            </button>
          );
        })}
      </div>

      {showChatHints && (
        <p className="text-[12px] leading-[16px] text-[#6F687B]">
          Want less of something? Tell Nova below, like “less HIIT”.
        </p>
      )}
    </div>
  );
};
