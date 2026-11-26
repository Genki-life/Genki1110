import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Sliders, Compass } from 'lucide-react';

export type PrimaryTabId = 'Today' | 'Plan' | 'Discover';

export interface SharedBottomNavProps {
  activeTab: PrimaryTabId;
  onSelectTab: (tab: PrimaryTabId) => void;
  onPrefetchTab?: (tab: PrimaryTabId) => void;
  onOpenNovaChat: () => void;
  isHidden: boolean;
  barRef: React.RefObject<HTMLDivElement | null>;
  shouldReduceMotion: boolean;
}

const TABS: Array<{ id: PrimaryTabId; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { id: 'Today', icon: Calendar },
  { id: 'Plan', icon: Sliders },
  { id: 'Discover', icon: Compass },
];

const TAB_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 33,
  mass: 0.8,
};

const DEFAULT_LABEL_WIDTHS: Record<PrimaryTabId, number> = {
  Today: 38,
  Plan: 28,
  Discover: 56,
};

interface TabStateLayout {
  pill: { x: number; width: number };
  tabs: Record<PrimaryTabId, { x: number; width: number }>;
}

function NovaFourPointStarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2.2C12.56 7.05 14.25 10.75 21.8 12C14.25 13.25 12.56 16.95 12 21.8C11.44 16.95 9.75 13.25 2.2 12C9.75 10.75 11.44 7.05 12 2.2Z" />
    </svg>
  );
}

export const SharedBottomNav = React.memo(function SharedBottomNav({
  activeTab,
  onSelectTab,
  onPrefetchTab,
  onOpenNovaChat,
  isHidden,
  barRef,
  shouldReduceMotion,
}: SharedBottomNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const navInnerRef = useRef<HTMLDivElement>(null);
  const labelMeasureRefs = useRef<Record<PrimaryTabId, HTMLSpanElement | null>>({
    Today: null,
    Plan: null,
    Discover: null,
  });

  // Optimistic local visual tab so the pill begins moving on the very next frame (<1ms React commit)
  // without waiting on the parent App tree or lazy tab mount.
  const [visualTab, setVisualTab] = useState<PrimaryTabId>(activeTab);
  useEffect(() => {
    setVisualTab(activeTab);
  }, [activeTab]);

  const [trackWidth, setTrackWidth] = useState<number>(361);
  const [navInnerWidth, setNavInnerWidth] = useState<number>(287);
  const [labelWidths, setLabelWidths] = useState<Record<PrimaryTabId, number>>(DEFAULT_LABEL_WIDTHS);
  const [hasMeasured, setHasMeasured] = useState<boolean>(false);
  const [isNovaPressed, setIsNovaPressed] = useState<boolean>(false);
  const [isNovaLaunching, setIsNovaLaunching] = useState<boolean>(false);

  useEffect(() => {
    if (!isHidden && isNovaLaunching) {
      setIsNovaLaunching(false);
    }
  }, [isHidden, isNovaLaunching]);

  const measureGeometry = () => {
    if (trackRef.current) {
      const tw = trackRef.current.clientWidth;
      if (tw > 0) setTrackWidth((prev) => (prev === tw ? prev : tw));
    }
    if (navInnerRef.current) {
      const nw = navInnerRef.current.clientWidth;
      if (nw > 0) setNavInnerWidth((prev) => (prev === nw ? prev : nw));
    }
    const nextLabels: Record<PrimaryTabId, number> = { ...DEFAULT_LABEL_WIDTHS };
    let measuredAny = false;
    for (const tab of TABS) {
      const el = labelMeasureRefs.current[tab.id];
      if (el) {
        const w = Math.ceil(el.getBoundingClientRect().width);
        if (w > 0) {
          nextLabels[tab.id] = w;
          measuredAny = true;
        }
      }
    }
    if (measuredAny) {
      setLabelWidths((prev) =>
        prev.Today === nextLabels.Today &&
        prev.Plan === nextLabels.Plan &&
        prev.Discover === nextLabels.Discover
          ? prev
          : nextLabels
      );
    }
    setHasMeasured(true);
  };

  useLayoutEffect(() => {
    measureGeometry();

    const ro = new ResizeObserver(() => {
      measureGeometry();
    });
    if (trackRef.current) ro.observe(trackRef.current);
    if (navInnerRef.current) ro.observe(navInnerRef.current);

    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) measureGeometry();
      });
    }

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  // Precompute all 3 selected-tab target positions and widths once per available-width change;
  // tab switches simply index this table with zero DOM measurement.
  const isCompact = trackWidth <= 316;
  const tabLayoutsByState = useMemo<Record<PrimaryTabId, TabStateLayout>>(() => {
    const activePadX = isCompact ? 13 : 16;
    const maxSafe = Math.max(84, navInnerWidth - 88); // guarantees >= 44px per inactive tab

    const buildForActive = (target: PrimaryTabId): TabStateLayout => {
      const raw = 20 + 6 + labelWidths[target] + activePadX * 2;
      const activeWidth = Math.min(raw, maxSafe);
      const inactiveWidth = Math.max(44, (navInnerWidth - activeWidth) / 2);

      if (target === 'Today') {
        const tabs = {
          Today: { x: 0, width: activeWidth },
          Plan: { x: activeWidth, width: inactiveWidth },
          Discover: { x: activeWidth + inactiveWidth, width: inactiveWidth },
        };
        return { pill: tabs.Today, tabs };
      }
      if (target === 'Plan') {
        const tabs = {
          Today: { x: 0, width: inactiveWidth },
          Plan: { x: inactiveWidth, width: activeWidth },
          Discover: { x: inactiveWidth + activeWidth, width: inactiveWidth },
        };
        return { pill: tabs.Plan, tabs };
      }
      const tabs = {
        Today: { x: 0, width: inactiveWidth },
        Plan: { x: inactiveWidth, width: inactiveWidth },
        Discover: { x: inactiveWidth * 2, width: activeWidth },
      };
      return { pill: tabs.Discover, tabs };
    };

    return {
      Today: buildForActive('Today'),
      Plan: buildForActive('Plan'),
      Discover: buildForActive('Discover'),
    };
  }, [navInnerWidth, labelWidths, isCompact]);

  const currentLayout = tabLayoutsByState[visualTab];
  const activePillRect = currentLayout.pill;
  const tabGeometries = currentLayout.tabs;

  const tabTransition = !hasMeasured
    ? { duration: 0 }
    : shouldReduceMotion
    ? { duration: 0.1, ease: 'easeOut' as const }
    : TAB_SPRING;

  return (
    <motion.div
      ref={barRef}
      id="shared-bottom-nav-shell"
      aria-hidden={isHidden || undefined}
      initial={false}
      animate={{ opacity: isHidden ? 0 : 1 }}
      transition={{ duration: shouldReduceMotion ? 0.1 : 0.18, ease: 'easeOut' }}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)' }}
      className="absolute bottom-0 inset-x-0 z-30 px-4 max-[340px]:px-3 pt-0 pointer-events-none"
    >
      {/* Hidden intrinsic width measurers for tab labels */}
      <div
        aria-hidden="true"
        className="fixed -top-[9999px] -left-[9999px] pointer-events-none opacity-0 select-none flex"
      >
        {TABS.map((tab) => (
          <span
            key={tab.id}
            ref={(el) => {
              labelMeasureRefs.current[tab.id] = el;
            }}
            className="text-[13px] font-semibold leading-none tracking-[-0.01em] whitespace-nowrap"
          >
            {tab.id}
          </span>
        ))}
      </div>

      {/* Fixed Single-Row Track: Left Floating Tab Capsule + Right 54x54 Nova Bubble Entry */}
      <div
        ref={trackRef}
        id="shared-bottom-nav-track"
        className="relative w-full h-[54px] flex items-center gap-3 max-[340px]:gap-2"
      >
        {/* Left Floating White Liquid-Glass Tab Capsule */}
        <nav
          id="primary-tab-capsule"
          aria-label="Primary navigation"
          inert={isHidden ? true : undefined}
          className={`liquid-glass-pill flex-1 min-w-0 h-[54px] rounded-full p-[4px] ${
            isHidden ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <div
            ref={navInnerRef}
            className="relative w-full h-full"
          >
            {/* Single Sliding Frosted-Glass Active Tab Inner Capsule (continuous x + width spring) */}
            <motion.div
              id="nav-active-tab-pill"
              aria-hidden="true"
              initial={false}
              animate={{
                x: activePillRect.x,
                width: activePillRect.width,
              }}
              transition={tabTransition}
              style={{ willChange: 'transform, width', contain: 'layout paint style' }}
              className="liquid-glass-active-tab absolute left-0 top-0 bottom-0 rounded-full pointer-events-none z-0"
            />

            {/* 3 Tab Buttons: hitboxes snap cleanly to target slots while icon & label animate via GPU transform/opacity/clipPath */}
            {TABS.map((tab) => {
              const isActive = visualTab === tab.id;
              const Icon = tab.icon;
              const geom = tabGeometries[tab.id];
              const labelW = labelWidths[tab.id];
              const iconShiftX = isActive ? -((labelW + 6) / 2) : 0;

              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id.toLowerCase()}`}
                  type="button"
                  tabIndex={isHidden ? -1 : undefined}
                  aria-label={tab.id}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    left: `${geom.x}px`,
                    width: `${geom.width}px`,
                  }}
                  onPointerEnter={() => onPrefetchTab?.(tab.id)}
                  onFocus={() => onPrefetchTab?.(tab.id)}
                  onPointerDown={() => onPrefetchTab?.(tab.id)}
                  onClick={() => {
                    if (tab.id === visualTab) return;
                    // Update local pill state immediately (<1ms) so animation begins on next frame,
                    // while triggering parent page switch concurrently in the same tap.
                    setVisualTab(tab.id);
                    onSelectTab(tab.id);
                  }}
                  className={`genki-mobile-focus absolute top-0 bottom-0 z-10 h-[46px] min-w-[44px] rounded-full flex items-center justify-center cursor-pointer select-none transition-colors duration-150 ${
                    isActive
                      ? 'text-[#5E5BAE]'
                      : 'text-[#3A3A40] hover:text-[#1C1C1E]'
                  }`}
                >
                  <motion.span
                    initial={false}
                    animate={{ x: iconShiftX }}
                    transition={tabTransition}
                    style={{ willChange: 'transform' }}
                    className="relative inline-flex items-center justify-center w-[20px] h-[20px]"
                  >
                    <Icon
                      className="w-[20px] h-[20px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.9}
                    />
                    <motion.span
                      aria-hidden="true"
                      initial={false}
                      animate={{
                        opacity: isActive ? 1 : 0,
                        clipPath: isActive ? 'inset(0% 0% 0% 0%)' : 'inset(0% 100% 0% 0%)',
                      }}
                      transition={
                        !hasMeasured
                          ? { duration: 0 }
                          : shouldReduceMotion
                          ? { duration: 0.1 }
                          : isActive
                          ? {
                              clipPath: TAB_SPRING,
                              opacity: { duration: 0.15, delay: 0.03, ease: 'easeOut' },
                            }
                          : {
                              clipPath: { duration: 0.12, ease: 'easeIn' },
                              opacity: { duration: 0.08, ease: 'easeIn' },
                            }
                      }
                      style={{ left: '26px', willChange: 'opacity, clip-path' }}
                      className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] font-semibold leading-none tracking-[-0.01em] pointer-events-none"
                    >
                      {tab.id}
                    </motion.span>
                  </motion.span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right Fixed 54x54 Nova Bubble Entry — Direct Trigger to Existing Chat Drawer */}
        <button
          id="bottom-talk-to-nova-btn"
          type="button"
          tabIndex={isHidden ? -1 : undefined}
          aria-label="Talk to Nova"
          onPointerDown={() => setIsNovaPressed(true)}
          onPointerUp={() => setIsNovaPressed(false)}
          onPointerCancel={() => setIsNovaPressed(false)}
          onPointerLeave={() => setIsNovaPressed(false)}
          onClick={() => {
            setIsNovaPressed(false);
            setIsNovaLaunching(true);
            onOpenNovaChat();
          }}
          className={`genki-mobile-focus relative w-[54px] h-[54px] shrink-0 rounded-full flex items-center justify-center cursor-pointer select-none bg-transparent border-0 p-0 ${
            isHidden ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          {/* Translucent Lavender Morphing Bubble Body */}
          <motion.span
            id="nova-bubble-visual"
            aria-hidden="true"
            initial={false}
            animate={
              shouldReduceMotion
                ? { opacity: isNovaPressed ? 0.78 : 1 }
                : isNovaPressed
                ? { scaleX: 0.94, scaleY: 0.88, y: 1 }
                : isNovaLaunching
                ? { scaleX: 1.07, scaleY: 1.11, y: -4 }
                : { scaleX: 1, scaleY: 1, y: 0 }
            }
            transition={
              shouldReduceMotion
                ? { duration: 0.1, ease: 'easeOut' }
                : { type: 'spring', stiffness: 480, damping: 24, mass: 0.65 }
            }
            className={`nova-bubble-body w-[54px] h-[54px] flex items-center justify-center ${
              shouldReduceMotion ? '' : 'nova-bubble-animated'
            }`}
          >
            {/* Drifting Specular Highlight */}
            <span
              className={`nova-bubble-highlight ${
                shouldReduceMotion ? '' : 'nova-bubble-highlight-animated'
              }`}
            />
            {/* Soft Drifting Lavender Internal Caustic */}
            <span
              className={`nova-bubble-caustic ${
                shouldReduceMotion ? '' : 'nova-bubble-caustic-animated'
              }`}
            />
            {/* Delicate Top Glass Rim */}
            <span className="nova-bubble-rim" />

            {/* Secondary 4-Point Star Cue */}
            <NovaFourPointStarIcon className="relative z-10 w-[18px] h-[18px] text-[#5E5BAE]/85 drop-shadow-[0_1px_2px_rgba(255,255,255,0.65)]" />
          </motion.span>
        </button>
      </div>
    </motion.div>
  );
});
