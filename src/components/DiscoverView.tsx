import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Bookmark,
  X,
  ChevronLeft,
  Play,
} from 'lucide-react';
import {
  DISCOVER_ITEMS,
  type DiscoverItem,
  type DiscoverMediaType,
  type DiscoverPublisher,
} from '../utils/discoverCatalog';

export { DISCOVER_ITEMS };
export type { DiscoverItem, DiscoverMediaType, DiscoverPublisher };

type DetailOrigin = 'feed' | 'saved';

interface DetailViewState {
  item: DiscoverItem;
  origin: DetailOrigin;
}

interface DiscoverViewProps {
  phoneFrameRef?: React.RefObject<HTMLDivElement | null>;
  isActive?: boolean;
  savedItemIds: string[];
  onToggleSave: (id: string) => void;
  isSavedSheetOpen: boolean;
  setIsSavedSheetOpen: (open: boolean) => void;
}

export function DiscoverView({
  phoneFrameRef,
  isActive = true,
  savedItemIds,
  onToggleSave,
  isSavedSheetOpen,
  setIsSavedSheetOpen,
}: DiscoverViewProps) {
  const shouldReduceMotion = useReducedMotion();
  const [detailState, setDetailState] = useState<DetailViewState | null>(null);

  // Scroll containers & remembered scroll positions
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const savedSheetScrollRef = useRef<HTMLDivElement | null>(null);
  const feedScrollTopRef = useRef<number>(0);
  const savedScrollTopRef = useRef<number>(0);

  // Dialog containers & trigger focus restoration refs
  const detailSheetRef = useRef<HTMLDivElement | null>(null);
  const savedSheetRef = useRef<HTMLDivElement | null>(null);
  const feedTriggerRef = useRef<HTMLElement | null>(null);
  const savedReturnItemIdRef = useRef<string | null>(null);
  const wasSavedOpenRef = useRef<boolean>(false);

  const selectedItem = detailState?.item ?? null;
  const isSavedDialogVisible = isSavedSheetOpen && !detailState;
  const hasOpenOverlay = Boolean(detailState || isSavedSheetOpen);

  const openDetailFromFeed = useCallback(
    (item: DiscoverItem, triggerEl: HTMLElement | null) => {
      feedScrollTopRef.current = feedScrollRef.current?.scrollTop ?? 0;
      feedTriggerRef.current = triggerEl;
      savedReturnItemIdRef.current = null;
      setDetailState({ item, origin: 'feed' });
    },
    []
  );

  const openDetailFromSaved = useCallback((item: DiscoverItem) => {
    savedScrollTopRef.current = savedSheetScrollRef.current?.scrollTop ?? 0;
    savedReturnItemIdRef.current = item.id;
    setDetailState({ item, origin: 'saved' });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailState((prev) => {
      if (!prev) return null;
      if (prev.origin === 'feed') {
        const targetScroll = feedScrollTopRef.current;
        const triggerToFocus = feedTriggerRef.current;
        window.requestAnimationFrame(() => {
          if (feedScrollRef.current) {
            feedScrollRef.current.scrollTop = targetScroll;
          }
          if (triggerToFocus && triggerToFocus.isConnected) {
            triggerToFocus.focus({ preventScroll: true });
          }
        });
      }
      return null;
    });
  }, []);

  const closeSavedSheet = useCallback(() => {
    savedScrollTopRef.current = 0;
    savedReturnItemIdRef.current = null;
    setIsSavedSheetOpen(false);
    window.requestAnimationFrame(() => {
      const topSavedBtn = document.getElementById('top-saved-btn');
      if (topSavedBtn && topSavedBtn.isConnected) {
        topSavedBtn.focus({ preventScroll: true });
      }
    });
  }, [setIsSavedSheetOpen]);

  // If Saved is closed externally while viewing a Detail opened from Saved, reset detail cleanly
  useEffect(() => {
    if (!isSavedSheetOpen && detailState?.origin === 'saved') {
      setDetailState(null);
    }
  }, [isSavedSheetOpen, detailState?.origin]);

  // Move focus into Detail dialog when it opens
  useEffect(() => {
    if (!isActive || !detailState) return;
    const rafId = window.requestAnimationFrame(() => {
      detailSheetRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isActive, detailState]);

  // Restore Saved scroll position and focus when Saved opens or returns from Detail
  useLayoutEffect(() => {
    if (!isActive) return;

    if (isSavedDialogVisible) {
      const targetScroll = savedScrollTopRef.current;
      const returnId = savedReturnItemIdRef.current;

      const applyScrollAndFocus = () => {
        if (savedSheetScrollRef.current) {
          savedSheetScrollRef.current.scrollTop = targetScroll;
        }
        if (returnId) {
          const itemBtn = savedSheetRef.current?.querySelector<HTMLButtonElement>(
            `button[data-saved-item-open="${returnId}"]`
          );
          if (itemBtn && itemBtn.isConnected) {
            itemBtn.focus({ preventScroll: true });
          } else {
            savedSheetRef.current?.focus({ preventScroll: true });
          }
        } else if (!wasSavedOpenRef.current) {
          savedSheetRef.current?.focus({ preventScroll: true });
        }
      };

      applyScrollAndFocus();
      const rafId = window.requestAnimationFrame(applyScrollAndFocus);
      wasSavedOpenRef.current = true;
      return () => window.cancelAnimationFrame(rafId);
    }

    if (!isSavedSheetOpen) {
      wasSavedOpenRef.current = false;
    }
  }, [isActive, isSavedDialogVisible, isSavedSheetOpen]);

  // Single-layer Escape handling: exits only the topmost active Discover dialog
  useEffect(() => {
    if (!isActive || !hasOpenOverlay) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (detailState) {
        closeDetail();
      } else if (isSavedSheetOpen) {
        closeSavedSheet();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, hasOpenOverlay, detailState, isSavedSheetOpen, closeDetail, closeSavedSheet]);

  const savedItems = DISCOVER_ITEMS.filter((item) => savedItemIds.includes(item.id));

  const sheetMotionProps = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.01 },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'spring' as const, damping: 28, stiffness: 280 },
      };

  const backdropTransition = shouldReduceMotion ? { duration: 0.01 } : { duration: 0.18 };

  return (
    <div
      ref={feedScrollRef}
      id="discover-feed-scroll"
      inert={hasOpenOverlay || undefined}
      aria-hidden={hasOpenOverlay || undefined}
      className="flex-1 overflow-y-auto px-5 pt-3 pb-[calc(88px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3 scrollbar-none overscroll-contain z-10 text-[#1C1C1E]"
    >
      {/* Intro Subtitle */}
      <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78] m-0">
        Find a gentle break.
      </p>

      {/* Vertical Feed Stream */}
      <div className="flex flex-col gap-4">
        {DISCOVER_ITEMS.map((item, idx) => {
          const isSaved = savedItemIds.includes(item.id);
          const hasPlayableMedia = Boolean(item.mediaUrl && item.mediaType);

          return (
            <article
              key={item.id}
              data-discover-card={item.id}
              className="group bg-white hover:bg-[#FAFAFC] transition-colors duration-200 rounded-[24px] p-4 border border-black/[0.04] shadow-[0_4px_16px_-4px_rgba(28,28,45,0.05),0_1px_3px_rgba(0,0,0,0.02)] relative select-none"
            >
              {/* Primary Card Open Trigger (sibling to Bookmark button — no nested buttons) */}
              <button
                type="button"
                data-discover-card-open={item.id}
                onClick={(e) => openDetailFromFeed(item, e.currentTarget)}
                aria-label={`Open ${item.title}`}
                className="genki-mobile-focus w-full text-left flex flex-col gap-3 cursor-pointer motion-safe:active:scale-[0.99] transition-transform rounded-[16px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
              >
                {/* 1. Fixed 2:1 Cover Container (reserves height before image loads) */}
                <div className="relative w-full aspect-[2/1] rounded-[16px] overflow-hidden bg-[#5E5BAE]/[0.08] border border-black/[0.04] shrink-0">
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    loading={idx < 2 ? 'eager' : 'lazy'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center motion-safe:group-hover:scale-[1.02] transition-transform duration-500"
                  />

                  {/* Subtle top scrim for badge legibility */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/10 pointer-events-none" />

                  {/* Category Pill (top-left, 12px / 500 / 16px, no uppercase) */}
                  <div className="absolute top-3 left-3 right-14 flex items-center pointer-events-none">
                    <span className="px-2.5 py-1 rounded-full bg-white/92 backdrop-blur-md border border-white/95 text-[13px] font-medium leading-[18px] text-[#5E5BAE] shadow-2xs">
                      {item.category}
                    </span>
                  </div>

                  {/* Reserved play indicator — renders ONLY if a real mediaUrl exists */}
                  {hasPlayableMedia && (
                    <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-white/92 text-[#1C1C1E] flex items-center justify-center shadow-xs pointer-events-none">
                      <Play className="w-3 h-3 fill-current ml-0.5" />
                    </div>
                  )}
                </div>

                {/* 2. Text Group: Title -> 4px -> Scenario -> 8px -> Practice Duration */}
                <div className="flex flex-col min-w-0">
                  <h3 className="genki-mobile-row-title text-[17px] font-semibold leading-[23px] tracking-[-0.015em] text-[#1C1C1E] group-hover:text-[#5E5BAE] transition-colors break-words">
                    {item.title}
                  </h3>

                  <p className="genki-mobile-body mt-1 text-[15px] font-normal leading-[22px] text-[#6E6E78] break-words">
                    {item.useCaseNote}
                  </p>

                  <span className="mt-2 text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                    Practice · {item.suggestedDuration}
                  </span>
                </div>
              </button>

              {/* Sibling Bookmark Button: >=44x44px hit box with 32px visual circle */}
              <button
                type="button"
                data-discover-card-save={item.id}
                onClick={() => onToggleSave(item.id)}
                className="genki-mobile-control genki-mobile-icon-well absolute top-[22px] right-[22px] z-20 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer motion-safe:active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                aria-label={isSaved ? `Remove ${item.title} from saved` : `Save ${item.title}`}
                aria-pressed={isSaved}
                title={isSaved ? 'Saved' : 'Save'}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors shadow-2xs ${
                    isSaved
                      ? 'bg-[#5E5BAE] text-white border-[#5E5BAE]'
                      : 'bg-white/90 hover:bg-white text-[#1C1C1E] border-white/95'
                  }`}
                >
                  <Bookmark
                    className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : 'stroke-[2.2]'}`}
                  />
                </span>
              </button>
            </article>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* SINGLE OVERLAY PORTAL: DETAIL OR SAVED SHEET (No competing backdrops) */}
      {/* ============================================================ */}
      {(() => {
        const isSelectedSaved = selectedItem ? savedItemIds.includes(selectedItem.id) : false;
        const detailHasPlayableMedia = Boolean(selectedItem?.mediaUrl && selectedItem?.mediaType);
        const returnToSaved = detailState?.origin === 'saved';

        const overlayContent = (
          <AnimatePresence>
            {hasOpenOverlay && (
              <div className="absolute inset-0 z-50 flex flex-col justify-end pointer-events-auto overflow-hidden">
                {/* Single shared backdrop — exits only the topmost active layer */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={backdropTransition}
                  onClick={detailState ? closeDetail : closeSavedSheet}
                  className="absolute inset-0 bg-black/25 backdrop-blur-xs"
                  aria-hidden="true"
                />

                {selectedItem ? (
                  <motion.div
                    key={`detail-${selectedItem.id}`}
                    ref={detailSheetRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="discover-detail-title"
                    {...sheetMotionProps}
                    className="relative w-full max-h-[88%] bg-white/96 backdrop-blur-2xl rounded-t-[32px] shadow-2xl border-t border-white/90 z-10 flex flex-col text-[#1C1C1E] overflow-hidden outline-none"
                    id="discover-detail-sheet"
                  >
                    {/* Sticky Top Toolbar (all interactive controls >=44x44px) */}
                    <div className="px-5 pt-3 pb-2 border-b border-black/[0.06] flex items-center justify-between gap-2 shrink-0 bg-white/90">
                      <div className="flex items-center min-w-0">
                        {returnToSaved && (
                          <button
                            type="button"
                            id="discover-detail-back-saved-btn"
                            onClick={closeDetail}
                            className="genki-mobile-control genki-mobile-tertiary -ml-2 min-w-[44px] min-h-[44px] px-2 inline-flex items-center gap-1 rounded-full text-[15px] font-medium text-[#5E5BAE] hover:bg-[#5E5BAE]/10 transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                            aria-label="Back to Saved"
                          >
                            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
                            <span>Saved</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 -mr-1.5">
                        {/* Save Button (>=44x44px) */}
                        <button
                          type="button"
                          id="discover-detail-save-btn"
                          onClick={() => onToggleSave(selectedItem.id)}
                          className="genki-mobile-control genki-mobile-icon-well w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                          aria-label={
                            isSelectedSaved
                              ? `Remove ${selectedItem.title} from saved`
                              : `Save ${selectedItem.title}`
                          }
                          aria-pressed={isSelectedSaved}
                        >
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                              isSelectedSaved
                                ? 'bg-[#5E5BAE] text-white border-[#5E5BAE]'
                                : 'bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#1C1C1E] border-black/[0.04]'
                            }`}
                          >
                            <Bookmark
                              className={`w-4 h-4 ${isSelectedSaved ? 'fill-current' : 'stroke-[2.2]'}`}
                            />
                          </span>
                        </button>

                        {/* Close Button (>=44x44px) */}
                        <button
                          type="button"
                          id="discover-detail-close-btn"
                          onClick={closeDetail}
                          className="genki-mobile-control genki-mobile-icon-well w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                          aria-label={returnToSaved ? 'Back to Saved' : `Close ${selectedItem.title}`}
                        >
                          <span className="w-9 h-9 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] transition-colors">
                            <X className="w-4 h-4 stroke-[2.2]" />
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Single-Column Natural Reading Body */}
                    <div
                      id="discover-detail-scroll"
                      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] flex flex-col gap-6"
                    >
                      {/* Cover + Title + Auxiliary Meta */}
                      <div className="flex flex-col">
                        <div className="relative w-full aspect-[2/1] rounded-[16px] overflow-hidden bg-[#5E5BAE]/[0.08] border border-black/[0.04] shrink-0">
                          <img
                            src={selectedItem.coverUrl}
                            alt={selectedItem.title}
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover object-center"
                          />

                          {/* Reserved media entry: renders ONLY when a real mediaUrl + mediaType exist */}
                          {detailHasPlayableMedia && selectedItem.mediaUrl && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent flex items-end justify-end p-3">
                              <a
                                href={selectedItem.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[44px] px-4 rounded-full bg-white/90 hover:bg-white text-[#1C1C1E] inline-flex items-center gap-1.5 shadow-xs text-[13px] font-semibold"
                              >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                <span>
                                  {selectedItem.mediaType === 'video' ? 'Play video' : 'Play audio'}
                                </span>
                              </a>
                            </div>
                          )}
                        </div>

                        <h2
                          id="discover-detail-title"
                          className="genki-mobile-sheet-title mt-4 text-[22px] font-semibold leading-[28px] tracking-[-0.02em] text-[#1C1C1E] break-words"
                        >
                          {selectedItem.title}
                        </h2>

                        <p className="mt-1.5 text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          {selectedItem.category} · Practice · {selectedItem.suggestedDuration}
                        </p>

                        {selectedItem.publisher?.name && selectedItem.publisher?.url && (
                          <a
                            href={selectedItem.publisher.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 text-[13px] font-normal leading-[18px] text-[#6E6E78] hover:text-[#5E5BAE] underline-offset-2 hover:underline self-start"
                          >
                            Produced by {selectedItem.publisher.name}
                          </a>
                        )}
                      </div>

                      {/* Overview Section (no tinted card box, 8px heading-to-body gap) */}
                      <section className="flex flex-col gap-2">
                        <h3 className="genki-mobile-section-title text-[17px] font-semibold leading-[23px] tracking-[-0.015em] text-[#1C1C1E]">
                          Overview
                        </h3>
                        <p className="genki-mobile-body text-[15px] font-normal leading-[22px] text-[#3C3C43] break-words m-0">
                          {selectedItem.overview}
                        </p>
                      </section>

                      {/* How to try it Section (8px heading-to-list gap, 12px step spacing) */}
                      <section className="flex flex-col gap-2">
                        <h3 className="genki-mobile-section-title text-[17px] font-semibold leading-[23px] tracking-[-0.015em] text-[#1C1C1E]">
                          How to try it
                        </h3>
                        <ol className="flex flex-col gap-3 list-none p-0 m-0">
                          {selectedItem.steps.map((step, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 text-[15px] font-normal leading-[22px] text-[#3C3C43]"
                            >
                              <span
                                aria-hidden="true"
                                className="w-5 h-5 mt-[1px] rounded-full bg-[#5E5BAE]/10 text-[#5E5BAE] text-[13px] font-semibold leading-[18px] flex items-center justify-center shrink-0"
                              >
                                {idx + 1}
                              </span>
                              <span className="min-w-0 flex-1 break-words">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    </div>
                  </motion.div>
                ) : isSavedDialogVisible ? (
                  <motion.div
                    key="saved-sheet"
                    ref={savedSheetRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="discover-saved-title"
                    {...sheetMotionProps}
                    className="relative w-full max-h-[85%] bg-white/96 backdrop-blur-2xl rounded-t-[32px] shadow-2xl border-t border-white/90 z-10 flex flex-col text-[#1C1C1E] overflow-hidden outline-none"
                    id="discover-saved-sheet"
                  >
                    {/* Saved Header */}
                    <div className="px-5 pt-3.5 pb-2.5 border-b border-black/[0.06] flex items-center justify-between gap-2 shrink-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <h3
                          id="discover-saved-title"
                          className="genki-mobile-sheet-title text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]"
                        >
                          Saved
                        </h3>
                        <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                          {savedItems.length}
                        </span>
                      </div>

                      <button
                        type="button"
                        id="discover-saved-close-btn"
                        onClick={closeSavedSheet}
                        className="genki-mobile-control genki-mobile-icon-well -mr-1.5 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                        aria-label="Close Saved"
                      >
                        <span className="w-9 h-9 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#6E6E78] hover:text-[#1C1C1E] transition-colors">
                          <X className="w-4 h-4 stroke-[2.2]" />
                        </span>
                      </button>
                    </div>

                    {/* Saved List Body */}
                    <div
                      ref={savedSheetScrollRef}
                      id="discover-saved-scroll"
                      className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3"
                    >
                      {savedItems.length === 0 ? (
                        <div
                          id="discover-saved-empty"
                          className="py-12 flex flex-col items-center justify-center text-center gap-2"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6E6E78]">
                            <Bookmark className="w-5 h-5 stroke-[1.8]" />
                          </div>
                          <span className="text-[15px] font-semibold leading-[22px] text-[#1C1C1E]">
                            No saved guides yet.
                          </span>
                          <p className="text-[13px] font-normal leading-[18px] text-[#6E6E78] max-w-[220px] m-0">
                            Save a guide to find it here.
                          </p>
                        </div>
                      ) : (
                        savedItems.map((item) => (
                          <div
                            key={item.id}
                            data-saved-row={item.id}
                            className="min-h-[80px] bg-[#F2F2F7]/70 hover:bg-[#E5E5EA]/70 px-3 py-3 rounded-[18px] border border-black/[0.04] flex items-center gap-2 group transition-colors"
                          >
                            {/* Sibling Primary Button: Open Detail from Saved */}
                            <button
                              type="button"
                              data-saved-item-open={item.id}
                              onClick={() => openDetailFromSaved(item)}
                              className="genki-mobile-focus flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                              aria-label={`Open ${item.title}`}
                            >
                              <img
                                src={item.coverUrl}
                                alt={item.title}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 rounded-[14px] object-cover object-center bg-[#5E5BAE]/[0.08] shrink-0"
                              />
                              <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <h4 className="genki-mobile-row-title text-[15px] font-semibold leading-[22px] text-[#1C1C1E] group-hover:text-[#5E5BAE] transition-colors line-clamp-2 break-words">
                                  {item.title}
                                </h4>
                                <span className="text-[13px] font-normal leading-[18px] text-[#6E6E78]">
                                  Practice · {item.suggestedDuration}
                                </span>
                              </div>
                            </button>

                            {/* Sibling Unsave Button (>=44x44px hit box) */}
                            <button
                              type="button"
                              data-saved-item-remove={item.id}
                              onClick={() => onToggleSave(item.id)}
                              className="genki-mobile-control genki-mobile-icon-well w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                              aria-label={`Remove ${item.title} from saved`}
                              aria-pressed={true}
                              title={`Remove ${item.title} from saved`}
                            >
                              <span className="w-8 h-8 rounded-full bg-black/5 hover:bg-[#FFE4E6] text-[#6E6E78] hover:text-[#E11D48] flex items-center justify-center transition-colors">
                                <X className="w-3.5 h-3.5 stroke-[2.2]" />
                              </span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </div>
            )}
          </AnimatePresence>
        );

        if (phoneFrameRef?.current) {
          return createPortal(overlayContent, phoneFrameRef.current);
        }
        return overlayContent;
      })()}
    </div>
  );
}

