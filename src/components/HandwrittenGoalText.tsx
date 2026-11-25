import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

interface MeasuredLine {
  text: string;
  top: number;
  minX: number;
  maxX: number;
  spanPx: number;
  isLastLine: boolean;
}

interface HandwrittenGoalTextProps {
  text: string;
  isActive: boolean;
}

const BENCHMARK_CHAR_WEIGHT = 18.5; // Benchmark: "run 5km per day again" (~2.4s)
const BASE_ANIMATION_MS = 2400;
const MIN_ANIMATION_MS = 2000;
const MAX_SINGLE_LINE_MS = 2850;
const MAX_MULTILINE_MS = 3200;
const INTER_LINE_LIFT_MS = 85;
const INK_FEATHER_PX = 16;
const SLANT_OVERHANG_PX = 10;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function splitTrailingWord(text: string): { leadingText: string; lastWord: string } {
  const match = text.match(/^(.*?)(\S+)$/s);
  if (!match) {
    return { leadingText: '', lastWord: text };
  }
  return {
    leadingText: match[1],
    lastWord: match[2],
  };
}

function getTextWeight(text: string): number {
  let total = 0;
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) total += 0.35;
    else if (/[.,!?;:'"’“”\-–—]/.test(ch)) total += 0.5;
    else if (/[mwMW]/.test(ch)) total += 1.25;
    else total += 1;
  }
  return total;
}

function computeTotalAnimationMs(fullText: string, lineCount: number): number {
  const weight = getTextWeight(fullText);
  if (lineCount <= 1) {
    const raw = BASE_ANIMATION_MS + (weight - BENCHMARK_CHAR_WEIGHT) * 32;
    return Math.round(Math.min(MAX_SINGLE_LINE_MS, Math.max(MIN_ANIMATION_MS, raw)));
  }
  const raw = BASE_ANIMATION_MS + (weight - BENCHMARK_CHAR_WEIGHT) * 34 + (lineCount - 1) * 180;
  return Math.round(Math.min(MAX_MULTILINE_MS, Math.max(2600, raw)));
}

function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node as Text).data.length > 0) {
        nodes.push(node as Text);
      }
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      // Skip the inline pencil wrapper so only goal text characters are measured
      if (el.dataset.inlinePencil === 'true') return;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        walk(child);
      }
    }
  };
  walk(root);
  return nodes;
}

function measureWrappedLines(containerEl: HTMLElement, sizerEl: HTMLElement): MeasuredLine[] {
  const textNodes = collectTextNodes(sizerEl);
  if (textNodes.length === 0) return [];

  const containerRect = containerEl.getBoundingClientRect();
  if (containerRect.width <= 0) return [];

  const computedStyle = window.getComputedStyle(containerEl);
  const parsedLineHeight = parseFloat(computedStyle.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0 ? parsedLineHeight : 40;
  const lineBreakThreshold = Math.max(8, lineHeight * 0.45);

  const range = document.createRange();

  interface RawCharEntry {
    char: string;
    left: number;
    right: number;
    top: number;
  }

  const rawLines: Array<{ anchorTop: number; entries: RawCharEntry[] }> = [];

  for (const textNode of textNodes) {
    const graphemes = Array.from(textNode.data);
    let utf16Offset = 0;

    for (const ch of graphemes) {
      const nextOffset = utf16Offset + ch.length;
      range.setStart(textNode, utf16Offset);
      range.setEnd(textNode, nextOffset);
      const rects = range.getClientRects();
      utf16Offset = nextOffset;

      const rect = rects.length > 0 ? rects[rects.length - 1] : null;
      if (!rect) continue;

      const relTop = rect.top - containerRect.top;
      const relLeft = rect.left - containerRect.left;
      const relRight = rect.right - containerRect.left;

      const entry: RawCharEntry = {
        char: ch,
        left: relLeft,
        right: Math.max(relRight, relLeft + 1),
        top: relTop,
      };

      const currentLine = rawLines[rawLines.length - 1];
      if (!currentLine || Math.abs(relTop - currentLine.anchorTop) > lineBreakThreshold) {
        rawLines.push({ anchorTop: relTop, entries: [entry] });
      } else {
        currentLine.entries.push(entry);
      }
    }
  }

  range.detach?.();

  const cleaned = rawLines
    .map((line, lineIdx) => {
      let startIdx = 0;
      let endIdx = line.entries.length - 1;
      while (startIdx <= endIdx && /\s/.test(line.entries[startIdx].char)) startIdx += 1;
      while (endIdx >= startIdx && /\s/.test(line.entries[endIdx].char)) endIdx -= 1;

      const trimmedEntries = startIdx <= endIdx ? line.entries.slice(startIdx, endIdx + 1) : line.entries;
      const lineText = trimmedEntries.map((e) => e.char).join('');
      if (!lineText) return null;

      let minX = Infinity;
      let maxX = -Infinity;
      for (const e of trimmedEntries) {
        if (e.left < minX) minX = e.left;
        if (e.right > maxX) maxX = e.right;
      }

      if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
        minX = 0;
        maxX = containerRect.width;
      }

      const spanPx = Math.max(12, maxX - minX + INK_FEATHER_PX + SLANT_OVERHANG_PX);

      return {
        text: lineText,
        top: lineIdx * lineHeight,
        minX,
        maxX,
        spanPx,
        isLastLine: false,
      };
    })
    .filter((l): l is MeasuredLine => l !== null);

  if (cleaned.length > 0) {
    cleaned[cleaned.length - 1].isLastLine = true;
  }

  return cleaned;
}

function buildPenMask(revealEdgePx: number, featherPx: number): string {
  const solidEnd = Math.max(0, revealEdgePx - featherPx);
  const midHigh = Math.max(0, revealEdgePx - featherPx * 0.58);
  const midLow = Math.max(0, revealEdgePx - featherPx * 0.24);
  const tip = Math.max(0, revealEdgePx);
  return `linear-gradient(102deg, #000 0px, #000 ${solidEnd.toFixed(1)}px, rgba(0,0,0,0.84) ${midHigh.toFixed(1)}px, rgba(0,0,0,0.30) ${midLow.toFixed(1)}px, transparent ${tip.toFixed(1)}px)`;
}

export const HandwrittenGoalText: React.FC<HandwrittenGoalTextProps> = ({ text, isActive }) => {
  const trimmed = text.trim();
  const { leadingText, lastWord } = splitTrailingWord(trimmed);

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const sizerRef = useRef<HTMLSpanElement | null>(null);
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const rafIdRef = useRef<number | null>(null);
  const lastCompletedTextRef = useRef<string | null>(null);

  const [measuredLines, setMeasuredLines] = useState<MeasuredLine[]>([]);
  const [animState, setAnimState] = useState<'idle' | 'animating' | 'complete'>(() =>
    prefersReducedMotion() ? 'complete' : 'idle'
  );
  const [pencilRevealMode, setPencilRevealMode] = useState<'instant' | 'fade'>(() =>
    prefersReducedMotion() ? 'instant' : 'fade'
  );
  const [playNonce, setPlayNonce] = useState<number>(0);

  // Playback lifecycle:
  // - Reduced motion: show full text + pencil immediately without fade.
  // - Inactive (background pre-warm / sheet open): wait until visible, or finish cleanly if interrupted.
  // - First entry to Plan or changed goal text: play continuous writing reveal once, then fade pencil in (180ms).
  // - Returning to Plan with unchanged goal text: show full text + pencil immediately.
  useEffect(() => {
    if (!trimmed) {
      setPencilRevealMode('instant');
      setAnimState('complete');
      return;
    }

    if (prefersReducedMotion()) {
      lastCompletedTextRef.current = trimmed;
      setPencilRevealMode('instant');
      setAnimState('complete');
      return;
    }

    if (!isActive) {
      if (animState === 'animating') {
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        lastCompletedTextRef.current = trimmed;
        setPencilRevealMode('instant');
        setAnimState('complete');
      } else if (lastCompletedTextRef.current !== null && lastCompletedTextRef.current !== trimmed) {
        setAnimState('idle');
      }
      return;
    }

    if (lastCompletedTextRef.current === trimmed) {
      setPencilRevealMode('instant');
      setAnimState('complete');
      return;
    }

    setPencilRevealMode('fade');
    setAnimState('animating');
    setPlayNonce((n) => n + 1);
  }, [trimmed, isActive]);

  // Measure actual wrapped lines (with inline pencil space already reserved) before animating
  useLayoutEffect(() => {
    if (animState !== 'animating' || !trimmed) return;
    let cancelled = false;

    const runMeasure = () => {
      if (cancelled) return;
      const containerEl = containerRef.current;
      const sizerEl = sizerRef.current;
      if (!containerEl || !sizerEl) {
        lastCompletedTextRef.current = trimmed;
        setPencilRevealMode('instant');
        setAnimState('complete');
        return;
      }

      const lines = measureWrappedLines(containerEl, sizerEl);
      if (lines.length === 0) {
        lastCompletedTextRef.current = trimmed;
        setPencilRevealMode('instant');
        setAnimState('complete');
        return;
      }
      lineRefs.current = new Array(lines.length).fill(null);
      setMeasuredLines(lines);
    };

    const fontsReady =
      typeof document !== 'undefined' && document.fonts && document.fonts.ready
        ? Promise.race([
            document.fonts.ready,
            new Promise<void>((resolve) => window.setTimeout(resolve, 140)),
          ])
        : Promise.resolve();

    void fontsReady.then(() => {
      if (!cancelled) {
        window.requestAnimationFrame(runMeasure);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [animState, trimmed, playNonce]);

  // Constant-velocity continuous pen-stroke reveal across all wrapped lines (~2.4s baseline, up to ~3.2s)
  useEffect(() => {
    if (animState !== 'animating' || measuredLines.length === 0) return;

    const totalAnimationMs = computeTotalAnimationMs(trimmed, measuredLines.length);
    const totalLiftMs = Math.max(0, measuredLines.length - 1) * INTER_LINE_LIFT_MS;
    const writingMs = Math.max(600, totalAnimationMs - totalLiftMs);
    const totalSpanPx = measuredLines.reduce((acc, l) => acc + l.spanPx, 0);

    const schedule: Array<{ startMs: number; endMs: number; line: MeasuredLine }> = [];
    let cursorMs = 0;
    for (let i = 0; i < measuredLines.length; i += 1) {
      const line = measuredLines[i];
      // Duration proportional to actual ink span so pen speed (px/ms) stays uniform from first char to final stroke
      const dur = (line.spanPx / Math.max(totalSpanPx, 1)) * writingMs;
      schedule.push({ startMs: cursorMs, endMs: cursorMs + dur, line });
      cursorMs += dur + INTER_LINE_LIFT_MS;
    }

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      let allDone = true;

      for (let i = 0; i < schedule.length; i += 1) {
        const el = lineRefs.current[i];
        if (!el) continue;
        const { startMs, endMs, line } = schedule[i];
        const lineDur = Math.max(1, endMs - startMs);

        if (elapsed <= startMs) {
          allDone = false;
          const hiddenMask = buildPenMask(0, INK_FEATHER_PX);
          el.style.webkitMaskImage = hiddenMask;
          el.style.maskImage = hiddenMask;
        } else if (elapsed >= endMs) {
          el.style.webkitMaskImage = 'none';
          el.style.maskImage = 'none';
        } else {
          allDone = false;
          // Uniform linear progression so end-of-line characters preserve the exact same rhythm
          const p = Math.min(1, Math.max(0, (elapsed - startMs) / lineDur));
          const revealEdge = line.minX + p * line.spanPx;
          const mask = buildPenMask(revealEdge, INK_FEATHER_PX);
          el.style.webkitMaskImage = mask;
          el.style.maskImage = mask;
        }
      }

      if (allDone || elapsed >= totalAnimationMs + 32) {
        rafIdRef.current = null;
        lastCompletedTextRef.current = trimmed;
        setAnimState('complete');
        return;
      }

      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [animState, measuredLines, trimmed]);

  const isOverlayActive = animState === 'animating' && measuredLines.length > 0;
  const hideStaticText = animState === 'idle' || animState === 'animating';
  const isPencilVisible = animState === 'complete';
  const targetDurationMs = computeTotalAnimationMs(trimmed, Math.max(1, measuredLines.length));

  return (
    <span
      ref={containerRef}
      id="plan-header-intent"
      data-handwriting-state={animState}
      data-handwriting-lines={measuredLines.length || undefined}
      data-handwriting-duration-ms={targetDurationMs}
      className="genki-plan-header-intent"
    >
      {/* Always in normal document flow so both wrapped text and trailing pencil reserve final layout from frame 0 */}
      <span
        ref={sizerRef}
        className="genki-plan-handwriting-sizer"
        style={{ visibility: hideStaticText ? 'hidden' : 'visible' }}
      >
        {leadingText}
        <span className="genki-plan-handwriting-tail">
          {lastWord}
          <span
            id="plan-header-inline-pencil"
            data-inline-pencil="true"
            data-pencil-visible={isPencilVisible ? 'true' : 'false'}
            data-pencil-reveal={pencilRevealMode}
            aria-hidden="true"
            className="genki-plan-header-inline-pencil"
          >
            <Pencil className="w-[13px] h-[13px] stroke-[1.75]" aria-hidden="true" />
          </span>
        </span>
      </span>

      {/* Line-by-line continuous pen-stroke reveal overlay (matches sizer centering down to sub-pixel, zero cursor) */}
      {isOverlayActive && (
        <span aria-hidden="true" className="genki-plan-handwriting-overlay">
          {measuredLines.map((line, idx) => {
            const initialMask = buildPenMask(0, INK_FEATHER_PX);
            return (
              <span
                key={`${playNonce}-${idx}`}
                ref={(el) => {
                  lineRefs.current[idx] = el;
                }}
                className="genki-plan-handwriting-line"
                style={{
                  top: `${line.top}px`,
                  WebkitMaskImage: initialMask,
                  maskImage: initialMask,
                }}
              >
                {line.text}
                {line.isLastLine && (
                  <span className="genki-plan-header-inline-pencil-spacer" aria-hidden="true" />
                )}
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
};
