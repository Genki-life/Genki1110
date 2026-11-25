import React, { useEffect, useRef, useState } from 'react';

export type RhythmMilestoneId = 'start' | 'break' | 'here' | 'next';

interface RhythmMilestoneConfig {
  id: RhythmMilestoneId;
  label: string;
  description: string;
}

const RHYTHM_MILESTONES: Record<RhythmMilestoneId, RhythmMilestoneConfig> = {
  start: {
    id: 'start',
    label: 'Start small',
    description: 'A short walk made it easier to get started.',
  },
  break: {
    id: 'break',
    label: 'Took a break',
    description: 'A break gave you room to come back at your own pace.',
  },
  here: {
    id: 'here',
    label: 'You’re here',
    description: 'You’ve started walking again. Keep it easy for now.',
  },
  next: {
    id: 'next',
    label: 'Possible next step',
    description: 'Keep the walks short until they feel easier to fit in.',
  },
};

const GRAPHIC_HEIGHT = 152;
const DEFAULT_WIDTH = 320;

export const IllustrativeRhythmGraphic: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [selectedId, setSelectedId] = useState<RhythmMilestoneId>('here');

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
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

  // Fixed illustrative node geometry (1:1 CSS pixels, zero statistical coupling)
  // 0% -> ~68-70%: solid past path with gentle start, brief pause dip, and restart
  // ~68-70%: current point ("You’re here", selected by default)
  // ~70% -> 90%: gentle, roughly level dashed line to hollow dot ("Possible next step")
  const w = Math.max(220, width);
  const h = GRAPHIC_HEIGHT;

  const p1 = { x: Math.round(w * 0.1), y: 94 }; // Start small
  const p2 = { x: Math.round(w * 0.35), y: 109 }; // Took a break (lower pause)
  const p3 = { x: Math.round(w * 0.53), y: 82 }; // Restarted (unlabeled dot only)
  const pNow = { x: Math.round(w * 0.68), y: 66 }; // You're here (~70% width)
  const pNext = { x: Math.round(w * 0.9), y: 64 }; // Possible next step (roughly level)

  // Smooth cubic Bézier curve through past nodes arriving gently level at pNow
  const pastPathD = [
    `M ${p1.x} ${p1.y}`,
    `C ${Math.round(p1.x + (p2.x - p1.x) * 0.44)} ${p1.y - 5}, ${Math.round(p2.x - (p2.x - p1.x) * 0.44)} ${p2.y}, ${p2.x} ${p2.y}`,
    `C ${Math.round(p2.x + (p3.x - p2.x) * 0.46)} ${p2.y}, ${Math.round(p3.x - (p3.x - p2.x) * 0.44)} ${p3.y + 8}, ${p3.x} ${p3.y}`,
    `C ${Math.round(p3.x + (pNow.x - p3.x) * 0.42)} ${p3.y - 8}, ${Math.round(pNow.x - (pNow.x - p3.x) * 0.48)} ${pNow.y}, ${pNow.x} ${pNow.y}`,
  ].join(' ');

  // Soft translucent lavender wash solely under the walked past path
  const pastAreaD = `${pastPathD} L ${pNow.x} ${h} L ${p1.x} ${h} Z`;

  // Roughly level dashed segment to the optional future point (no upward prediction)
  const futurePathD = [
    `M ${pNow.x + 8} ${pNow.y}`,
    `C ${Math.round(pNow.x + (pNext.x - pNow.x) * 0.48)} ${pNow.y}, ${Math.round(pNext.x - (pNext.x - pNow.x) * 0.48)} ${pNext.y}, ${pNext.x - 4} ${pNext.y}`,
  ].join(' ');

  const activeMilestone = RHYTHM_MILESTONES[selectedId];

  const renderInteractiveDot = (
    id: RhythmMilestoneId,
    cx: number,
    cy: number,
    options: { isHollowDefault?: boolean; defaultFill?: string; defaultRadius?: number } = {}
  ) => {
    const isSelected = selectedId === id;
    if (isSelected) {
      return (
        <g key={id} data-node-id={id} data-selected="true">
          <circle
            id={`rhythm-node-${id}-ring`}
            cx={cx}
            cy={cy}
            r="8"
            fill="rgba(119, 112, 182, 0.22)"
            stroke="rgba(119, 112, 182, 0.36)"
            strokeWidth="1"
          />
          <circle
            id={`rhythm-node-${id}`}
            cx={cx}
            cy={cy}
            r="4"
            fill="#5E5BAE"
          />
        </g>
      );
    }

    if (options.isHollowDefault) {
      return (
        <circle
          key={id}
          id={`rhythm-node-${id}`}
          data-node-id={id}
          data-selected="false"
          cx={cx}
          cy={cy}
          r="4"
          fill="#F7F5FC"
          stroke="#958DC4"
          strokeWidth="1.75"
        />
      );
    }

    return (
      <circle
        key={id}
        id={`rhythm-node-${id}`}
        data-node-id={id}
        data-selected="false"
        cx={cx}
        cy={cy}
        r={options.defaultRadius ?? 3.5}
        fill={options.defaultFill ?? '#7770B6'}
        stroke="#F7F5FC"
        strokeWidth="1.5"
      />
    );
  };

  return (
    <div className="flex flex-col">
      <div
        ref={containerRef}
        id="plan-rhythm-illustrative-chart"
        data-selected-node={selectedId}
        role="group"
        aria-label="Illustrative habit journey milestones"
        className="genki-plan-rhythm-graphic-canvas"
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="block w-full h-full overflow-visible pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="genkiRhythmPastWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7770B6" stopOpacity="0.13" />
              <stop offset="78%" stopColor="#7770B6" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#7770B6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Subtle lavender area under the already-walked path */}
          <path d={pastAreaD} fill="url(#genkiRhythmPastWash)" />

          {/* Future optional step: gentle, roughly level soft-lavender dashed line */}
          <path
            id="rhythm-future-dashed-path"
            d={futurePathD}
            fill="none"
            stroke="#A8A0D2"
            strokeWidth="1.75"
            strokeDasharray="4 4"
            strokeLinecap="round"
          />

          {/* Walked past path: 2px solid purple line */}
          <path
            id="rhythm-past-solid-path"
            d={pastPathD}
            fill="none"
            stroke="#7770B6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Unlabeled restart dot on past path */}
          <circle
            id="rhythm-node-restart"
            cx={p3.x}
            cy={p3.y}
            r="3.5"
            fill="#7770B6"
            stroke="#F7F5FC"
            strokeWidth="1.5"
          />

          {/* Interactive labeled milestone dots */}
          {renderInteractiveDot('start', p1.x, p1.y, { defaultFill: '#7770B6', defaultRadius: 3.5 })}
          {renderInteractiveDot('break', p2.x, p2.y, { defaultFill: '#8E86BE', defaultRadius: 3.5 })}
          {renderInteractiveDot('here', pNow.x, pNow.y, { defaultFill: '#7770B6', defaultRadius: 4 })}
          {renderInteractiveDot('next', pNext.x, pNext.y, { isHollowDefault: true })}
        </svg>

        {/* Shared dot + label hit-target buttons (>= 44x44px each, zero overlap) */}
        <button
          type="button"
          id="rhythm-node-btn-start"
          aria-pressed={selectedId === 'start'}
          aria-controls="plan-rhythm-guidance"
          aria-label="Start small"
          onClick={() => setSelectedId('start')}
          data-selected={selectedId === 'start' ? 'true' : 'false'}
          className="genki-plan-rhythm-node-btn genki-plan-rhythm-node-btn-start"
          style={{
            left: '4px',
            top: `${p1.y - 14}px`,
            width: `${Math.max(66, Math.min(72, Math.round(w * 0.24)))}px`,
            height: '52px',
          }}
        >
          <span
            id="rhythm-label-start"
            className="genki-plan-rhythm-node-label"
            style={{ top: '27px', left: `${Math.max(4, p1.x - 20)}px` }}
          >
            Start small
          </span>
        </button>

        <button
          type="button"
          id="rhythm-node-btn-break"
          aria-pressed={selectedId === 'break'}
          aria-controls="plan-rhythm-guidance"
          aria-label="Took a break"
          onClick={() => setSelectedId('break')}
          data-selected={selectedId === 'break' ? 'true' : 'false'}
          className="genki-plan-rhythm-node-btn genki-plan-rhythm-node-btn-break"
          style={{
            left: `${p2.x}px`,
            top: `${p2.y - 15}px`,
            width: `${Math.max(52, Math.min(74, Math.round(w * 0.24)))}px`,
            height: '52px',
            transform: 'translateX(-50%)',
          }}
        >
          <span
            id="rhythm-label-break"
            className="genki-plan-rhythm-node-label genki-plan-rhythm-node-label-mid"
            style={{ top: '28px', left: '50%', transform: 'translateX(-50%)' }}
          >
            Took a break
          </span>
        </button>

        <button
          type="button"
          id="rhythm-node-btn-here"
          aria-pressed={selectedId === 'here'}
          aria-controls="plan-rhythm-guidance"
          aria-label="You’re here"
          onClick={() => setSelectedId('here')}
          data-selected={selectedId === 'here' ? 'true' : 'false'}
          className="genki-plan-rhythm-node-btn genki-plan-rhythm-node-btn-here"
          style={{
            left: `${pNow.x}px`,
            top: `${pNow.y - 46}px`,
            width: '74px',
            height: '58px',
            transform: 'translateX(-50%)',
          }}
        >
          <span
            id="rhythm-label-current"
            className="genki-plan-rhythm-node-label genki-plan-rhythm-current-label"
            style={{ top: '8px', left: '50%', transform: 'translateX(-50%)' }}
          >
            You’re here
          </span>
        </button>

        <button
          type="button"
          id="rhythm-node-btn-next"
          aria-pressed={selectedId === 'next'}
          aria-controls="plan-rhythm-guidance"
          aria-label="Possible next step"
          onClick={() => setSelectedId('next')}
          data-selected={selectedId === 'next' ? 'true' : 'false'}
          className="genki-plan-rhythm-node-btn genki-plan-rhythm-node-btn-next"
          style={{
            right: '4px',
            top: `${pNext.y - 14}px`,
            width: '66px',
            height: '66px',
          }}
        >
          <span
            id="rhythm-label-next"
            className="genki-plan-rhythm-node-label genki-plan-rhythm-next-label"
            style={{ top: '30px', right: '4px' }}
          >
            Possible next step
          </span>
        </button>
      </div>

      <p
        id="plan-rhythm-guidance"
        role="status"
        aria-live="polite"
        data-selected-node={selectedId}
        className="genki-plan-rhythm-guidance"
      >
        {activeMilestone.description}
      </p>
    </div>
  );
};
