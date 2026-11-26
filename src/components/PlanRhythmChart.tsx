import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HabitRhythmModel, HabitRhythmPoint } from '../utils/planDataFoundation';

interface PlanRhythmChartProps {
  model: HabitRhythmModel;
  interactive?: boolean;
  selectedDateKey?: string | null;
  onSelectDateKey?: (dateKey: string) => void;
  svgId?: string;
}

interface PlotPoint {
  x: number;
  y: number;
  point: HabitRhythmPoint;
}

const TOTAL_HEIGHT = 152;
const PLOT_TOP = 12;
const PLOT_HEIGHT = 112;
const PLOT_BOTTOM = PLOT_TOP + PLOT_HEIGHT; // 124; bottom axis padding = 28px; top + bottom = 40px
const Y_AXIS_LEFT_PAD = 22;
const RIGHT_PAD = 10;
const Y_TICKS = [7, 3, 0] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Fritsch-Carlson monotone cubic Hermite spline converted to SVG cubic Bezier commands.
 * Strictly preserves monotonicity between every pair of points:
 * - Zero overshoot above 7 or below 0
 * - Flat plateaus remain perfectly flat
 * - Separate segments break cleanly across null coverage gaps
 */
function buildMonotoneSegmentPath(pts: PlotPoint[]): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) {
    return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
  }

  const h: number[] = new Array(n - 1);
  const d: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = pts[i + 1].x - pts[i].x;
    h[i] = dx === 0 ? 1 : dx;
    d[i] = (pts[i + 1].y - pts[i].y) / h[i];
  }

  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];

  for (let i = 1; i < n - 1; i += 1) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }

  // Clamp one-sided endpoint slopes to prevent boundary overshoot
  if (m[0] * d[0] <= 0) {
    m[0] = 0;
  } else if (Math.abs(m[0]) > 3 * Math.abs(d[0])) {
    m[0] = 3 * d[0];
  }
  if (m[n - 1] * d[n - 2] <= 0) {
    m[n - 1] = 0;
  } else if (Math.abs(m[n - 1]) > 3 * Math.abs(d[n - 2])) {
    m[n - 1] = 3 * d[n - 2];
  }

  // Enforce Fritsch-Carlson monotonicity circle (alpha^2 + beta^2 <= 9)
  for (let i = 0; i < n - 1; i += 1) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / d[i];
    const beta = m[i + 1] / d[i];
    const sumSq = alpha * alpha + beta * beta;
    if (sumSq > 9) {
      const tau = 3 / Math.sqrt(sumSq);
      m[i] = tau * alpha * d[i];
      m[i + 1] = tau * beta * d[i];
    }
  }

  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const step = h[i];
    const minY = Math.min(p0.y, p1.y);
    const maxY = Math.max(p0.y, p1.y);
    const cp1x = p0.x + step / 3;
    const cp1y = clamp(p0.y + (m[i] * step) / 3, Math.max(PLOT_TOP, minY), Math.min(PLOT_BOTTOM, maxY));
    const cp2x = p1.x - step / 3;
    const cp2y = clamp(p1.y - (m[i + 1] * step) / 3, Math.max(PLOT_TOP, minY), Math.min(PLOT_BOTTOM, maxY));
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  return path;
}

export function PlanRhythmChart({
  model,
  interactive = false,
  selectedDateKey = null,
  onSelectDateKey,
  svgId = 'rhythm-chart-svg',
}: PlanRhythmChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(313);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next >= 180) {
        setChartWidth((prev) => (prev === next ? prev : next));
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const geometry = useMemo(() => {
    const plotWidth = Math.max(120, chartWidth - Y_AXIS_LEFT_PAD - RIGHT_PAD);
    const totalPoints = Math.max(2, model.points.length);

    const xForIndex = (idx: number) =>
      Y_AXIS_LEFT_PAD + (idx / (totalPoints - 1)) * plotWidth;

    const yForValue = (val: number) => {
      const clamped = clamp(val, 0, 7);
      return PLOT_BOTTOM - (clamped / 7) * PLOT_HEIGHT;
    };

    const renderedSegments = model.segments.map((seg) => {
      const plotPts: PlotPoint[] = seg.map((pt) => ({
        x: xForIndex(pt.index),
        y: yForValue(pt.value ?? 0),
        point: pt,
      }));
      return {
        key: `${seg[0].dateKey}..${seg[seg.length - 1].dateKey}`,
        points: plotPts,
        pathD: buildMonotoneSegmentPath(plotPts),
      };
    });

    const latestMarker =
      model.latestValidPoint && model.latestValidPoint.value !== null
        ? {
            x: xForIndex(model.latestValidPoint.index),
            y: yForValue(model.latestValidPoint.value),
            point: model.latestValidPoint,
          }
        : null;

    const selectedPoint =
      interactive && selectedDateKey
        ? model.points.find((p) => p.dateKey === selectedDateKey) ?? null
        : null;

    const selectedMarker = selectedPoint
      ? {
          x: xForIndex(selectedPoint.index),
          y:
            selectedPoint.value !== null
              ? yForValue(selectedPoint.value)
              : PLOT_BOTTOM - 10,
          hasValue: selectedPoint.value !== null,
          point: selectedPoint,
        }
      : null;

    const startPt = model.points[0];
    const midIndex = Math.floor((model.points.length - 1) / 2);
    const midPt = model.points[midIndex];
    const endPt = model.points[model.points.length - 1];

    return {
      plotWidth,
      xForIndex,
      yForValue,
      renderedSegments,
      latestMarker,
      selectedMarker,
      xLabels: [
        startPt ? { x: xForIndex(startPt.index), label: startPt.shortDateLabel, anchor: 'start' as const } : null,
        midPt ? { x: xForIndex(midPt.index), label: midPt.shortDateLabel, anchor: 'middle' as const } : null,
        endPt ? { x: xForIndex(endPt.index), label: endPt.shortDateLabel, anchor: 'end' as const } : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    };
  }, [chartWidth, model.points, model.segments, model.latestValidPoint, interactive, selectedDateKey]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || !onSelectDateKey || model.points.length === 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const clampedX = clamp(relX, Y_AXIS_LEFT_PAD, Y_AXIS_LEFT_PAD + geometry.plotWidth);
    const ratio =
      geometry.plotWidth > 0 ? (clampedX - Y_AXIS_LEFT_PAD) / geometry.plotWidth : 1;
    const idx = Math.round(ratio * (model.points.length - 1));
    const safeIdx = clamp(idx, 0, model.points.length - 1);
    const pt = model.points[safeIdx];
    if (pt) {
      onSelectDateKey(pt.dateKey);
    }
  };

  if (!model.hasChartData) {
    const shownDates =
      model.formattedPracticeDates.length > 5
        ? `${model.formattedPracticeDates.slice(-5).join(', ')} (+${model.formattedPracticeDates.length - 5} earlier)`
        : model.formattedPracticeDates.join(', ');

    return (
      <div
        id={interactive ? 'journey-insufficient-state' : 'rhythm-insufficient-state'}
        ref={wrapRef}
        className="mt-[16px] rounded-[16px] bg-[#F7F5FB]/90 border border-[#7770B6]/10 px-3.5 py-3.5 flex flex-col gap-1.5"
      >
        <p className="text-[16px] font-semibold leading-[22px] text-[#211D2C]">
          Your rhythm starts here.
        </p>

        {model.formattedPracticeDates.length > 0 ? (
          <p
            id={interactive ? 'journey-recorded-dates' : 'rhythm-recorded-dates'}
            className="text-[14px] font-normal leading-[21px] text-[#625B70]"
          >
            Recorded on {shownDates}.
          </p>
        ) : (
          <p className="text-[14px] font-normal leading-[21px] text-[#625B70]">
            Your rolling 7-day curve appears once 7 full days of history are covered.
          </p>
        )}

        {model.formattedPracticeDates.length > 0 && (
          <p className="text-[12px] font-normal leading-[16px] text-[#6F687B]">
            Needs 7 covered days to plot your rolling 7-day line.
          </p>
        )}

        <p
          id={interactive ? 'journey-today-in-progress' : 'rhythm-today-in-progress'}
          className="text-[12px] font-normal leading-[16px] text-[#6F687B] pt-0.5 tabular-nums"
        >
          {model.todayInProgress.hasPracticeToday
            ? `Today · in progress · recorded (${model.todayInProgress.shortDateLabel})`
            : `Today · in progress (${model.todayInProgress.shortDateLabel})`}
        </p>
      </div>
    );
  }

  return (
    <div
      id={interactive ? 'journey-chart-block' : 'rhythm-chart-block'}
      ref={wrapRef}
      className="mt-[16px] flex flex-col"
    >
      {/* Chart axis caption + dynamic real Through date */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 mb-1.5">
        <span
          id={interactive ? 'journey-chart-caption' : 'rhythm-chart-caption'}
          className="text-[12px] font-normal leading-[16px] text-[#6F687B]"
        >
          Days with movement · rolling 7 days
        </span>
        {model.latestValidPoint && (
          <span
            id={interactive ? 'journey-chart-through-date' : 'rhythm-chart-through-date'}
            className="text-[12px] font-normal leading-[16px] text-[#6F687B] tabular-nums shrink-0"
          >
            Through {model.latestValidPoint.shortDateLabel}
          </span>
        )}
      </div>

      {/* Exact 152px total height: 112px plot area + 40px axes & padding. Never blocks vertical scroll! */}
      <svg
        ref={svgRef}
        id={svgId}
        role="img"
        aria-label={model.accessibleChartSummary}
        width="100%"
        height={TOTAL_HEIGHT}
        viewBox={`0 0 ${chartWidth} ${TOTAL_HEIGHT}`}
        onClick={interactive ? handleSvgClick : undefined}
        className={`block w-full overflow-visible select-none ${
          interactive ? 'cursor-pointer' : ''
        }`}
      >
        {/* Fixed Y-axis guides & labels (0, 3, 7) */}
        {Y_TICKS.map((tick) => {
          const y = geometry.yForValue(tick);
          return (
            <g key={tick}>
              <line
                x1={Y_AXIS_LEFT_PAD}
                y1={y}
                x2={chartWidth - RIGHT_PAD}
                y2={y}
                stroke={tick === 0 ? 'rgba(74, 66, 98, 0.14)' : 'rgba(74, 66, 98, 0.08)'}
                strokeWidth="1"
              />
              <text
                x={Y_AXIS_LEFT_PAD - 8}
                y={y + 4}
                textAnchor="end"
                fill="#6F687B"
                fontSize="12"
                fontWeight="400"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Selected point vertical hairline (interactive Journey mode only) */}
        {geometry.selectedMarker && (
          <line
            id="journey-selected-hairline"
            x1={geometry.selectedMarker.x}
            y1={PLOT_TOP}
            x2={geometry.selectedMarker.x}
            y2={PLOT_BOTTOM}
            stroke="rgba(94, 91, 174, 0.30)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {/* Contiguous non-null curve segments (breaks cleanly across unknown/insufficient gaps) */}
        {geometry.renderedSegments.map((seg) =>
          seg.points.length >= 2 ? (
            <path
              key={seg.key}
              data-rhythm-segment={seg.key}
              d={seg.pathD}
              fill="none"
              stroke="#8B82BD"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <circle
              key={seg.key}
              data-rhythm-single-point={seg.points[0].point.dateKey}
              cx={seg.points[0].x}
              cy={seg.points[0].y}
              r="3"
              fill="#8B82BD"
            />
          )
        )}

        {/* Latest valid point marker (when not superseded by selectedMarker on same date) */}
        {geometry.latestMarker &&
          (!geometry.selectedMarker ||
            geometry.selectedMarker.point.dateKey !== geometry.latestMarker.point.dateKey) && (
            <g
              id={interactive ? 'journey-latest-point-marker' : 'rhythm-latest-point-marker'}
              data-date={geometry.latestMarker.point.dateKey}
            >
              <circle
                cx={geometry.latestMarker.x}
                cy={geometry.latestMarker.y}
                r="6"
                fill="rgba(139, 130, 189, 0.22)"
              />
              <circle
                cx={geometry.latestMarker.x}
                cy={geometry.latestMarker.y}
                r="3"
                fill="#8B82BD"
              />
            </g>
          )}

        {/* Selected point marker (interactive Journey mode) */}
        {geometry.selectedMarker && (
          <g
            id="journey-selected-point-marker"
            data-selected-date={geometry.selectedMarker.point.dateKey}
            data-has-value={geometry.selectedMarker.hasValue ? 'true' : 'false'}
          >
            {geometry.selectedMarker.hasValue ? (
              <>
                <circle
                  cx={geometry.selectedMarker.x}
                  cy={geometry.selectedMarker.y}
                  r="7.5"
                  fill="rgba(94, 91, 174, 0.22)"
                />
                <circle
                  cx={geometry.selectedMarker.x}
                  cy={geometry.selectedMarker.y}
                  r="4"
                  fill="#5E5BAE"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              </>
            ) : (
              <circle
                cx={geometry.selectedMarker.x}
                cy={geometry.selectedMarker.y}
                r="4"
                fill="#FFFFFF"
                stroke="#8B8498"
                strokeWidth="1.5"
              />
            )}
          </g>
        )}

        {/* X-axis real local date labels */}
        {geometry.xLabels.map((lbl, idx) => (
          <text
            key={`${lbl.label}-${idx}`}
            x={lbl.x}
            y={TOTAL_HEIGHT - 5}
            textAnchor={lbl.anchor}
            fill="#6F687B"
            fontSize="12"
            fontWeight="400"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {lbl.label}
          </text>
        ))}
      </svg>

      {/* Today shown strictly separately as in progress (never included in ended-day curve) */}
      <p
        id={interactive ? 'journey-today-in-progress' : 'rhythm-today-in-progress'}
        className="mt-1 text-[12px] font-normal leading-[16px] text-[#6F687B] tabular-nums"
      >
        {model.todayInProgress.hasPracticeToday
          ? `Today · in progress · recorded (${model.todayInProgress.shortDateLabel})`
          : `Today · in progress`}
      </p>
    </div>
  );
}
