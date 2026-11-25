import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Sliders, Compass, Plus, ArrowUp, X, FileText } from 'lucide-react';

export type PrimaryTabId = 'Today' | 'Plan' | 'Discover';

export interface BottomNavAttachmentItem {
  id: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  previewUrl?: string;
}

export interface SharedBottomNavProps {
  activeTab: PrimaryTabId;
  onSelectTab: (tab: PrimaryTabId) => void;
  onPrefetchTab?: (tab: PrimaryTabId) => void;
  isHidden: boolean;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmitMessage: (text: string) => void;
  onAttachClick: () => void;
  attachments: BottomNavAttachmentItem[];
  onRemoveAttachment: (id: string) => void;
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

const NOVA_MORPH_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 35,
  mass: 0.85,
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
      <path d="M12 1.75C12.58 6.82 14.32 10.68 22.25 12C14.32 13.32 12.58 17.18 12 22.25C11.42 17.18 9.68 13.32 1.75 12C9.68 10.68 11.42 6.82 12 1.75Z" />
    </svg>
  );
}

export function SharedBottomNav({
  activeTab,
  onSelectTab,
  onPrefetchTab,
  isHidden,
  isExpanded,
  onExpandedChange,
  inputValue,
  onInputChange,
  onSubmitMessage,
  onAttachClick,
  attachments,
  onRemoveAttachment,
  barRef,
  shouldReduceMotion,
}: SharedBottomNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const navInnerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const labelMeasureRefs = useRef<Record<PrimaryTabId, HTMLSpanElement | null>>({
    Today: null,
    Plan: null,
    Discover: null,
  });

  const [trackWidth, setTrackWidth] = useState<number>(361);
  const [navInnerWidth, setNavInnerWidth] = useState<number>(287);
  const [labelWidths, setLabelWidths] = useState<Record<PrimaryTabId, number>>(DEFAULT_LABEL_WIDTHS);
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const [hasMeasured, setHasMeasured] = useState<boolean>(false);

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

  // Keyboard avoidance via window.visualViewport when expanded
  useEffect(() => {
    if (!isExpanded || typeof window === 'undefined') {
      setKeyboardOffset(0);
      return;
    }

    const updateKeyboardOffset = () => {
      const vv = window.visualViewport;
      if (!vv) {
        setKeyboardOffset(0);
        return;
      }
      const rawOffset = Math.round(window.innerHeight - (vv.height + vv.offsetTop));
      setKeyboardOffset(rawOffset > 20 ? rawOffset : 0);
    };

    updateKeyboardOffset();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateKeyboardOffset);
    vv?.addEventListener('scroll', updateKeyboardOffset);
    window.addEventListener('resize', updateKeyboardOffset);

    return () => {
      vv?.removeEventListener('resize', updateKeyboardOffset);
      vv?.removeEventListener('scroll', updateKeyboardOffset);
      window.removeEventListener('resize', updateKeyboardOffset);
    };
  }, [isExpanded]);

  // Focus management on expand/collapse & Escape key dismissal
  useEffect(() => {
    if (!isExpanded) return;

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, shouldReduceMotion ? 20 : 120);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExpandedChange(false);
        window.requestAnimationFrame(() => {
          triggerBtnRef.current?.focus({ preventScroll: true });
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded, onExpandedChange, shouldReduceMotion]);

  // Responsive compact mode for narrow screens (<= 340px viewport => trackWidth <= 316px)
  const isCompact = trackWidth <= 316;
  const activePadX = isCompact ? 13 : 16;

  // Deterministic active/inactive widths so the sliding glass pill and all 3 tab slots
  // morph together smoothly with zero ResizeObserver feedback jitter.
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
  const canSend = inputValue.trim().length > 0 || attachments.length > 0;

  const handleCloseExpanded = () => {
    onExpandedChange(false);
    window.requestAnimationFrame(() => {
      triggerBtnRef.current?.focus({ preventScroll: true });
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    onSubmitMessage(inputValue.trim());
  };

  const tabTransition = !hasMeasured
    ? { duration: 0 }
    : shouldReduceMotion
    ? { duration: 0.1, ease: 'easeOut' as const }
    : TAB_SPRING;

  const novaContainerTransition = shouldReduceMotion
    ? { duration: 0.12, ease: 'easeOut' as const }
    : NOVA_MORPH_SPRING;

  const bottomPaddingStyle: React.CSSProperties =
    isExpanded && keyboardOffset > 0
      ? { paddingBottom: `${keyboardOffset + 10}px` }
      : { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' };

  return (
    <div
      ref={barRef}
      id="shared-bottom-nav-shell"
      aria-hidden={isHidden || undefined}
      style={bottomPaddingStyle}
      className={`absolute bottom-0 inset-x-0 z-30 px-4 max-[340px]:px-3 pt-0 pointer-events-none transition-[opacity,padding-bottom] duration-150 ${
        isHidden ? 'opacity-0 invisible' : 'opacity-100 visible'
      }`}
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

      {/* Compact attachment strip above expanded Talk to Nova input bar */}
      <AnimatePresence>
        {isExpanded && !isHidden && attachments.length > 0 && (
          <motion.div
            key="bottom-nova-attachments"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0.08 : 0.16 }}
            className="mb-2 pointer-events-auto liquid-glass-pill rounded-[18px] px-2.5 py-2 flex flex-col gap-1.5 max-h-[104px] overflow-y-auto"
          >
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-2 min-w-0">
                {att.kind === 'image' && att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt=""
                    className="w-8 h-8 rounded-[8px] object-cover shrink-0 border border-black/[0.06]"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-8 h-8 rounded-[8px] bg-[#ECEAF4] text-[#5E5BAE] flex items-center justify-center shrink-0"
                  >
                    <FileText className="w-4 h-4 stroke-[1.75]" />
                  </div>
                )}
                <span className="flex-1 min-w-0 truncate text-[13px] leading-[18px] font-medium text-[#1C1C1E]">
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                  className="genki-mobile-focus w-7 h-7 rounded-full flex items-center justify-center text-[#70677F] hover:bg-black/[0.06] active:bg-black/[0.1] transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 stroke-[2]" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single-row floating track: Left Tab Capsule + Right Nova Button / Expanded Input Bar */}
      <div
        ref={trackRef}
        id="shared-bottom-nav-track"
        className="relative w-full h-[54px]"
      >
        {/* Left Floating White Liquid-Glass Tab Capsule */}
        <motion.nav
          id="primary-tab-capsule"
          aria-label="Primary navigation"
          aria-hidden={isExpanded || isHidden || undefined}
          inert={isExpanded || isHidden ? true : undefined}
          initial={false}
          animate={{
            opacity: isExpanded ? 0 : 1,
            scale: isExpanded ? (shouldReduceMotion ? 1 : 0.94) : 1,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0.1 }
              : isExpanded
              ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
              : { duration: 0.22, delay: 0.06, ease: [0.22, 1, 0.36, 1] }
          }
          style={{
            width: `calc(100% - ${isCompact ? 62 : 66}px)`,
            transformOrigin: 'left center',
          }}
          className={`liquid-glass-pill absolute left-0 top-0 bottom-0 h-[54px] rounded-full p-[4px] ${
            isExpanded || isHidden ? 'pointer-events-none' : 'pointer-events-auto'
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
                  tabIndex={isExpanded || isHidden ? -1 : undefined}
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
        </motion.nav>

        {/* Right Standalone Circular Nova Button — Morphs Right-to-Left into Full Editable Input Bar */}
        <motion.div
          id="bottom-nova-morph-shell"
          initial={false}
          animate={{
            width: isExpanded ? trackWidth : 54,
          }}
          transition={novaContainerTransition}
          className={`liquid-glass-nova-btn absolute right-0 top-0 bottom-0 h-[54px] rounded-full z-20 ${
            isHidden ? 'pointer-events-none' : 'pointer-events-auto'
          } ${isExpanded ? 'liquid-glass-nova-expanded' : ''}`}
        >
          {/* Collapsed State: Circular 54×54 Nova Sparkle Button */}
          <motion.button
            ref={triggerBtnRef}
            id="bottom-talk-to-nova-btn"
            type="button"
            tabIndex={isExpanded || isHidden ? -1 : undefined}
            aria-label="Talk to Nova"
            aria-expanded={isExpanded}
            aria-controls="bottom-talk-to-nova-bar"
            aria-hidden={isExpanded || isHidden || undefined}
            initial={false}
            animate={{
              opacity: isExpanded ? 0 : 1,
              scale: isExpanded ? (shouldReduceMotion ? 1 : 0.72) : 1,
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0.08 }
                : isExpanded
                ? { duration: 0.09, ease: 'easeIn' }
                : { duration: 0.14, delay: 0.11, ease: 'easeOut' }
            }
            onClick={() => {
              if (!isExpanded) onExpandedChange(true);
            }}
            className={`genki-mobile-focus absolute inset-0 w-full h-full rounded-full flex items-center justify-center text-[#5E5BAE] cursor-pointer active:scale-[0.94] transition-transform ${
              isExpanded || isHidden ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            <NovaFourPointStarIcon className="w-[22px] h-[22px]" />
          </motion.button>

          {/* Expanded State: Full-Width Editable Talk to Nova Input Bar */}
          <motion.form
            id="bottom-talk-to-nova-bar"
            onSubmit={handleFormSubmit}
            aria-hidden={!isExpanded || isHidden || undefined}
            inert={!isExpanded || isHidden ? true : undefined}
            initial={false}
            animate={{
              opacity: isExpanded ? 1 : 0,
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0.1 }
                : isExpanded
                ? { duration: 0.15, delay: 0.13, ease: 'easeOut' }
                : { duration: 0.08, delay: 0, ease: 'easeIn' }
            }
            style={{ width: trackWidth > 0 ? trackWidth : '100%' }}
            className={`absolute right-0 top-0 bottom-0 h-[54px] flex items-center pl-[6px] pr-[7px] gap-1 ${
              isExpanded && !isHidden ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {/* Left + Attachment Button */}
            <button
              type="button"
              id="home-add-attachment-btn"
              tabIndex={!isExpanded || isHidden ? -1 : undefined}
              onClick={onAttachClick}
              aria-label="Add attachment"
              className="genki-chat-attach-btn shrink-0"
            >
              <Plus className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
            </button>

            {/* Editable Input Field */}
            <input
              ref={inputRef}
              id="bottom-nova-input"
              type="text"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              tabIndex={!isExpanded || isHidden ? -1 : undefined}
              placeholder="Talk to Nova…"
              aria-label="Talk to Nova"
              name="bottom-nova-message"
              autoComplete="off"
              className="flex-1 min-w-0 bg-transparent text-[16px] leading-[22px] text-[#1C1C1E] placeholder:text-[#6E6E78] outline-none px-1"
            />

            {/* Send Button */}
            <button
              type="submit"
              id="bottom-nova-send-btn"
              disabled={!canSend}
              tabIndex={!isExpanded || isHidden ? -1 : undefined}
              aria-label="Send message"
              className={`genki-mobile-focus w-[36px] h-[36px] rounded-full flex items-center justify-center shrink-0 transition-all ${
                canSend
                  ? 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white active:scale-95 shadow-[0_2px_8px_rgba(94,91,174,0.28)] cursor-pointer'
                  : 'bg-[#5E5BAE]/10 text-[#5E5BAE]/40 cursor-default'
              }`}
            >
              <ArrowUp className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              id="bottom-nova-close-btn"
              tabIndex={!isExpanded || isHidden ? -1 : undefined}
              onClick={handleCloseExpanded}
              aria-label="Close Talk to Nova"
              className="genki-mobile-focus w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 text-[#5C5968] hover:bg-black/[0.05] active:bg-black/[0.09] transition-colors cursor-pointer"
            >
              <X className="w-[18px] h-[18px] stroke-[2]" aria-hidden="true" />
            </button>
          </motion.form>
        </motion.div>
      </div>
    </div>
  );
}
