import React, { useEffect, useRef, useState } from 'react';

const GRAPHIC_HEIGHT = 152;
const DEFAULT_WIDTH = 320;

export const IllustrativeRhythmGraphic: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);

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
  // 0% -> 70%: solid past path with gentle start, brief pause dip, and restart
  // 70%: prominent current point ("You're here")
  // 70% -> 90%: gentle, roughly level dashed line to hollow dot ("Possible next step")
  const w = Math.max(220, width);
  const h = GRAPHIC_HEIGHT;

  const p1 = { x: Math.round(w * 0.1), y: 94 }; // Start small
  const p2 = { x: Math.round(w * 0.34), y: 109 }; // Took a break (lower pause)
  const p3 = { x: Math.round(w * 0.53), y: 82 }; // Restarted (dot only)
  const pNow = { x: Math.round(w * 0.7), y: 66 }; // You're here (~70% width)
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

  return (
    <div
      ref={containerRef}
      id="plan-rhythm-illustrative-chart"
      role="img"
      aria-label="Illustrative habit journey: solid purple path from Start small through a brief dip at Took a break and a restart dot up to the highlighted current point You’re here at 70 percent width, followed by a gentle flat dashed line to a hollow Possible next step dot."
      className="genki-plan-rhythm-graphic-canvas"
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="block w-full h-full overflow-visible"
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

        {/* Three small past nodes (Start small, Took a break, Restart dot) */}
        <circle
          id="rhythm-node-start"
          cx={p1.x}
          cy={p1.y}
          r="3.5"
          fill="#7770B6"
          stroke="#F7F5FC"
          strokeWidth="1.5"
        />
        <circle
          id="rhythm-node-break"
          cx={p2.x}
          cy={p2.y}
          r="3.5"
          fill="#8E86BE"
          stroke="#F7F5FC"
          strokeWidth="1.5"
        />
        <circle
          id="rhythm-node-restart"
          cx={p3.x}
          cy={p3.y}
          r="3.5"
          fill="#7770B6"
          stroke="#F7F5FC"
          strokeWidth="1.5"
        />

        {/* Current point at ~70%: 16px soft lavender outer ring + 8px solid purple dot */}
        <circle
          id="rhythm-node-current-ring"
          cx={pNow.x}
          cy={pNow.y}
          r="8"
          fill="rgba(119, 112, 182, 0.22)"
          stroke="rgba(119, 112, 182, 0.34)"
          strokeWidth="1"
        />
        <circle
          id="rhythm-node-current-dot"
          cx={pNow.x}
          cy={pNow.y}
          r="4"
          fill="#5E5BAE"
        />

        {/* Future endpoint: hollow circle dot */}
        <circle
          id="rhythm-node-next"
          cx={pNext.x}
          cy={pNext.y}
          r="4"
          fill="#F7F5FC"
          stroke="#958DC4"
          strokeWidth="1.75"
        />
      </svg>

      {/* Crisp HTML labels overlaid at exact coordinates (no SVG text scaling distortion) */}
      <span
        id="rhythm-label-start"
        aria-hidden="true"
        className="genki-plan-rhythm-node-label"
        style={{ left: `${Math.max(10, p1.x - 16)}px`, top: `${p1.y + 13}px` }}
      >
        Start small
      </span>

      <span
        id="rhythm-label-break"
        aria-hidden="true"
        className="genki-plan-rhythm-node-label genki-plan-rhythm-node-label-mid"
        style={{
          left: `${p2.x}px`,
          top: `${p2.y + 13}px`,
          transform: 'translateX(-50%)',
        }}
      >
        Took a break
      </span>

      <span
        id="rhythm-label-current"
        aria-hidden="true"
        className="genki-plan-rhythm-current-label"
        style={{
          left: `${pNow.x}px`,
          top: `${pNow.y - 38}px`,
          transform: 'translateX(-50%)',
        }}
      >
        You’re here
      </span>

      <span
        id="rhythm-label-next"
        aria-hidden="true"
        className="genki-plan-rhythm-next-label"
        style={{
          right: '10px',
          top: `${pNext.y + 16}px`,
        }}
      >
        Possible next step
      </span>
    </div>
  );
};
