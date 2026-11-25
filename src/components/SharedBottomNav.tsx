import React, { useLayoutEffect, useRef, useState } from 'react';
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

export function SharedBottomNav({
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

  const [trackWidth, setTrackWidth] = useState<number>(361);
  const [navInnerWidth, setNavInnerWidth] = useState<number>(287);
  const [labelWidths, setLabelWidths] = useState<Record<PrimaryTabId, number>>(DEFAULT_LABEL_WIDTHS);
  const [hasMeasured, setHasMeasured] = useState<boolean>(false);
  const [isNovaPressed, setIsNovaPressed] = useState<boolean>(false);
  const [isNovaLaunching, setIsNovaLaunching] = useState<boolean>(false);

  React.useEffect(() => {
    if (!isHidden && isNovaLaunching) {
      setIsNovaLaunching(false);
    }
  }, [isHidden, isNovaLaunching]);

  const measureGeometry = () => {
    if (trackRef.current) {
      const tw = trackRef.current.clientWidth;
      if (tw > 0) setTrackWidth(tw);
    }
    if (navInnerRef.current) {
      const nw = navInnerRef.current.clientWidth;
      if (nw > 0) setNavInnerWidth(nw);
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

  // Responsive compact mode for narrow screens (<= 340px viewport => trackWidth <= 316px)
  const isCompact = trackWidth <= 316;
  const activePadX = isCompact ? 13 : 16;

  const getDesiredActiveWidth = (tabId: PrimaryTabId) => {
    const raw = 20 + 6 + labelWidths[tabId] + activePadX * 2;
    const maxSafe = Math.max(84, navInnerWidth - 88); // guarantees >= 44px per inactive tab
    return Math.min(raw, maxSafe);
  };

  const activePillWidth = getDesiredActiveWidth(activeTab);
  const inactiveSlotWidth = Math.max(44, (navInnerWidth - activePillWidth) / 2);

  const tabGeometries: Record<PrimaryTabId, { x: number; width: number }> = (() => {
    if (activeTab === 'Today') {
      return {
        Today: { x: 0, width: activePillWidth },
        Plan: { x: activePillWidth, width: inactiveSlotWidth },
        Discover: { x: activePillWidth + inactiveSlotWidth, width: inactiveSlotWidth },
      };
    }
    if (activeTab === 'Plan') {
      return {
        Today: { x: 0, width: inactiveSlotWidth },
        Plan: { x: inactiveSlotWidth, width: activePillWidth },
        Discover: { x: inactiveSlotWidth + activePillWidth, width: inactiveSlotWidth },
      };
    }
    return {
      Today: { x: 0, width: inactiveSlotWidth },
      Plan: { x: inactiveSlotWidth, width: inactiveSlotWidth },
      Discover: { x: inactiveSlotWidth * 2, width: activePillWidth },
    };
  })();

  const activePillRect = tabGeometries[activeTab];

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
            className="relative w-full h-full flex items-center"
          >
            {/* Single Sliding Frosted-Glass Active Tab Inner Capsule */}
            <motion.div
              id="nav-active-tab-pill"
              aria-hidden="true"
              initial={false}
              animate={{
                x: activePillRect.x,
                width: activePillRect.width,
              }}
              transition={tabTransition}
              className="liquid-glass-active-tab absolute left-0 top-0 bottom-0 rounded-full pointer-events-none z-0"
            />

            {/* 3 Tab Buttons */}
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              const geom = tabGeometries[tab.id];
              return (
                <motion.button
                  key={tab.id}
                  id={`nav-tab-${tab.id.toLowerCase()}`}
                  type="button"
                  tabIndex={isHidden ? -1 : undefined}
                  aria-label={tab.id}
                  aria-current={isActive ? 'page' : undefined}
                  initial={false}
                  animate={{ width: geom.width }}
                  transition={tabTransition}
                  onPointerEnter={() => onPrefetchTab?.(tab.id)}
                  onFocus={() => onPrefetchTab?.(tab.id)}
                  onPointerDown={() => onPrefetchTab?.(tab.id)}
                  onClick={() => {
                    if (tab.id === activeTab) return;
                    onSelectTab(tab.id);
                  }}
                  className={`genki-mobile-focus relative z-10 h-[46px] min-w-[44px] rounded-full flex items-center justify-center shrink-0 cursor-pointer select-none transition-colors duration-150 ${
                    isActive
                      ? 'text-[#5E5BAE]'
                      : 'text-[#3A3A40] hover:text-[#1C1C1E]'
                  }`}
                >
                  <span className="inline-flex items-center justify-center">
                    <Icon
                      className="w-[20px] h-[20px] shrink-0"
                      strokeWidth={isActive ? 2.2 : 1.9}
                    />
                    <motion.span
                      aria-hidden="true"
                      initial={false}
                      animate={{
                        width: isActive ? labelWidths[tab.id] : 0,
                        marginLeft: isActive ? 6 : 0,
                        opacity: isActive ? 1 : 0,
                      }}
                      transition={
                        !hasMeasured
                          ? { duration: 0 }
                          : shouldReduceMotion
                          ? { duration: 0.1 }
                          : isActive
                          ? {
                              width: TAB_SPRING,
                              marginLeft: TAB_SPRING,
                              opacity: { duration: 0.16, delay: 0.04, ease: 'easeOut' },
                            }
                          : {
                              width: TAB_SPRING,
                              marginLeft: TAB_SPRING,
                              opacity: { duration: 0.08, ease: 'easeIn' },
                            }
                      }
                      className="overflow-hidden whitespace-nowrap text-[13px] font-semibold leading-none tracking-[-0.01em] inline-block text-left"
                    >
                      {tab.id}
                    </motion.span>
                  </span>
                </motion.button>
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
}
