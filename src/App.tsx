import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  ArrowUp,
  Check,
  ChevronRight,
  ChevronDown,
  X,
  Clock,
  Sparkles,
  Wifi,
  CornerDownRight,
  Bookmark,
  CloudSun,
  Footprints,
  Heart,
  Maximize2,
  FileText,
  Plus
} from 'lucide-react';
import { SharedBottomNav, type PrimaryTabId } from './components/SharedBottomNav';

import { FurryNovaStaticAvatar } from './components/Avatar3D/FurryNovaStaticAvatar';
import { LazyNovaAvatar3D, loadNovaAvatar3D } from './components/Avatar3D/loadNovaAvatar3D';
import {
  ActivityCategory,
  ActivityUpdatePatch,
  ManualActivityInput,
  inferActivityCategory,
  inferDurationMinutes,
  saveUnifiedActivities,
  saveUnifiedRestRecords,
  toLocalDateKey,
} from './utils/weeklyPlanStore';
import {
  PlanFoundationStore,
  addExerciseSession,
  clearRecordsForDate,
  completeTaskCard,
  createEmptyPlanFoundationStore,
  loadPlanFoundationStore,
  mapActivityCategoryToExerciseType,
  projectLegacyActivityRecords,
  projectLegacyRestRecords,
  recordAlternativePlanReplacement,
  recordLifecycleEvent,
  removeExerciseSession,
  removeLifecycleEvent,
  savePlanFoundationStore,
  undoTaskCardCompletion,
  updateExerciseSession,
} from './utils/planDataFoundation';
import { PlanLoadingView } from './components/PlanLoadingView';
import { DiscoverLoadingView } from './components/DiscoverLoadingView';
import {
  loadSavedDiscoverIds,
  saveSavedDiscoverIds,
  toggleSavedDiscoverId,
} from './utils/discoverStore';
import {
  getActivePreviewProfileIdFromUrl,
  getInitialTabFromUrl,
  isPreviewResetRequestedFromUrl,
} from './utils/previewRuntime';
import type {
  PlanNovaChatRequest,
  PlanNovaChatTextEvent,
} from './components/PlanNovaChatWidgets';

let planNovaWidgetPromise: Promise<{
  default: typeof import('./components/PlanNovaChatWidgets').PlanNovaChatWidget;
}> | null = null;
function loadPlanNovaChatWidget() {
  if (!planNovaWidgetPromise) {
    planNovaWidgetPromise = import('./components/PlanNovaChatWidgets')
      .then((module) => ({ default: module.PlanNovaChatWidget }))
      .catch((error) => {
        planNovaWidgetPromise = null;
        throw error;
      });
  }
  return planNovaWidgetPromise;
}
const LazyPlanNovaChatWidget = React.lazy(loadPlanNovaChatWidget);

let planViewPromise: Promise<{ default: typeof import('./components/MyPlanView').MyPlanView }> | null = null;
function loadPlanView() {
  if (!planViewPromise) {
    planViewPromise = import('./components/MyPlanView')
      .then((module) => ({ default: module.MyPlanView }))
      .catch((error) => {
        planViewPromise = null;
        throw error;
      });
  }
  return planViewPromise;
}
const LazyMyPlanView = React.lazy(loadPlanView);

let discoverViewPromise: Promise<{ default: typeof import('./components/DiscoverView').DiscoverView }> | null = null;
function loadDiscoverView() {
  if (!discoverViewPromise) {
    discoverViewPromise = import('./components/DiscoverView')
      .then((module) => ({ default: module.DiscoverView }))
      .catch((error) => {
        discoverViewPromise = null;
        throw error;
      });
  }
  return discoverViewPromise;
}
const LazyDiscoverView = React.lazy(loadDiscoverView);

import mindfulWalkThumbUrl from './assets/images/mindful_walk_thumb_1793264566501.jpg';
import discoverBreathUrl from './assets/images/discover_breath_1793765860138.jpg';
import discoverTrailUrl from './assets/images/discover_trail_1793765793796.jpg';
import discoverEveningUrl from './assets/images/discover_evening_1793765838258.jpg';
import stretchPoseSvgUrl from './assets/illustrations/stretch-pose.svg';
import shoulderNeckPoseSvgUrl from './assets/illustrations/shoulder-neck-pose.svg';

// Plan Information Model
interface PlanItem {
  id: string;
  title: string;
  bubblePrompt: string;
  subtitle: string;
  fullDescription: string;
  detailTitle: string;
  audioTitle: string;
  audioSubtitle: string;
  tip1: string;
  tip2: string;
  thumbnailUrl: string;
  mediaType: 'article';
  activityCategory?: ActivityCategory;
  durationMinutes?: number;
}

const DEFAULT_WALK_PLAN: PlanItem = {
  id: 'walk',
  title: 'Take a 15-minute walk',
  bubblePrompt: 'How about a 15-minute walk?',
  subtitle: 'After lunch could be a good time, based on your usual routine and gentle midday light.',
  fullDescription:
    'After lunch could be a good time, based on your usual routine. Stepping outside for an unhurried 15-minute stroll helps aid light digestion, softens afternoon screen fatigue, and resets mental clarity without pushing your heart rate.',
  detailTitle: '15-minute Mindful Walk',
  audioTitle: 'Morning Tree Trail Guide',
  audioSubtitle: 'Guided walking notes · 15 min',
  tip1: 'Best window: right after lunch (1:15 PM) to aid light digestion and mental reset.',
  tip2: 'Zero pace requirement. Walk as slowly as you like—just let your eyes rest from screens.',
  thumbnailUrl: mindfulWalkThumbUrl,
  mediaType: 'article',
  activityCategory: 'walk',
  durationMinutes: 15
};

const STRETCH_PLAN: PlanItem = {
  id: 'stretch',
  title: '5-minute stretch at home',
  bubblePrompt: 'How about a 5-minute stretch?',
  subtitle: 'Gentle body reset in your living room whenever you have a quiet moment to unwind.',
  fullDescription:
    'Gentle body reset in your living room whenever you have a moment. This short guided sequence targets lower-back stiffness and tight hips from prolonged sitting—no mat, workout clothes, or floor space required.',
  detailTitle: '5-minute Home Gentle Stretch',
  audioTitle: 'Living Room Calming Flow',
  audioSubtitle: 'Guided stretch · 5 min',
  tip1: 'No mat or workout clothes required. Stand or sit comfortably near your desk or couch.',
  tip2: 'Focus on loosening tense shoulders, neck, and lower back with deep, unhurried breaths.',
  thumbnailUrl: stretchPoseSvgUrl,
  mediaType: 'article',
  activityCategory: 'stretch',
  durationMinutes: 5
};

const MOBILITY_PLAN: PlanItem = {
  id: 'mobility',
  title: '8-minute shoulder & neck release',
  bubblePrompt: 'How about an 8-minute shoulder release?',
  subtitle: 'Unwind upper-body tension after screen time with slow, guided movements and calm pacing.',
  fullDescription:
    'Unwind upper-body tension after screen time with slow, guided movements. Designed for mid-afternoon desk breaks to drop elevated shoulders, gently lengthen neck muscles, and pair smooth motion with relaxed exhales.',
  detailTitle: '8-minute Shoulder & Neck Release',
  audioTitle: 'Unhurried Posture Reset',
  audioSubtitle: 'Shoulder & neck guide · 8 min',
  tip1: 'Great for mid-afternoon when your shoulders start creeping up toward your ears.',
  tip2: 'Move only within a comfortable range—let gravity and slow exhales do the work.',
  thumbnailUrl: shoulderNeckPoseSvgUrl,
  mediaType: 'article',
  activityCategory: 'stretch',
  durationMinutes: 8
};

const BREATH_RESET_PLAN: PlanItem = {
  id: 'breath',
  title: '3-minute seated breath reset',
  bubblePrompt: 'How about a 3-minute breath reset?',
  subtitle: 'A quiet pause right where you are to slow your heart rate and clear your head.',
  fullDescription:
    'A quiet pause right where you are to slow your heart rate and clear your head. Lengthening each exhale gently signals physical safety to your nervous system whenever the day starts feeling rushed.',
  detailTitle: '3-minute Seated Breath Reset',
  audioTitle: 'Steady Horizon Breathing',
  audioSubtitle: 'Guided breathing notes • 3 min',
  tip1: 'Keep your feet flat on the floor and let your hands rest heavy on your lap.',
  tip2: 'Make each exhale slightly longer than your inhale to signal calm to your nervous system.',
  thumbnailUrl: discoverBreathUrl,
  mediaType: 'article',
  activityCategory: 'other',
  durationMinutes: 3
};

const TOMORROW_WALK_PLAN: PlanItem = {
  id: 'tomorrow',
  title: '15-minute walk (Moved to tomorrow)',
  bubblePrompt: 'Move your 15-minute walk to tomorrow?',
  subtitle: 'Rescheduled for tomorrow morning. Take today to rest without guilt.',
  fullDescription:
    'Rescheduled for tomorrow morning. Giving yourself room to rest today keeps your weekly rhythm sustainable without guilt—your walk window is softly queued for tomorrow morning.',
  detailTitle: 'Rescheduled Walk for Tomorrow',
  audioTitle: 'Quiet Evening Wind-down Notes',
  audioSubtitle: 'Gentle pacing overview • 10 min',
  tip1: 'Planned for tomorrow at 9:30 AM before your calendar fills up.',
  tip2: 'Today is officially a recharge window. Rest is an essential part of the journey.',
  thumbnailUrl: discoverTrailUrl,
  mediaType: 'article',
  activityCategory: 'walk',
  durationMinutes: 15
};

const REST_DAY_PLAN: PlanItem = {
  id: 'rest',
  title: 'Mindful rest day',
  bubblePrompt: 'How about taking a gentle rest day?',
  subtitle: 'Activity paused for today. Give yourself permission to unwind completely.',
  fullDescription:
    'Activity paused for today. Give yourself permission to unwind completely—recovery days protect long-term energy and keep movement feeling welcoming rather than obligatory.',
  detailTitle: 'Rest & Recovery Day',
  audioTitle: 'Gentle Evening Rest Guide',
  audioSubtitle: 'Restorative notes • 20 min',
  tip1: 'Stay hydrated and give your body space to recuperate.',
  tip2: 'No checklists tonight. Nova will check back in tomorrow morning.',
  thumbnailUrl: discoverEveningUrl,
  mediaType: 'article',
  activityCategory: 'rest',
  durationMinutes: 0
};

const REST_DAY_BUBBLE_BODY = 'It’s okay to slow down. I’m here with you.';

const REST_DAY_COPY = {
  overlayTitle: 'Take today at your own pace.',
  overlaySubtitle: 'There’s no rush. Rest is part of taking care of yourself.',
  resumeLabel: 'Resume',
  bubbleBody: REST_DAY_BUBBLE_BODY,
  bubbleAriaLabel: `Nova: ${REST_DAY_BUBBLE_BODY} View your paused plans.`,
} as const;

const SKIP_TASK_COPY = {
  overlayTitle: 'Saved for another day.',
  overlaySubtitle: 'It’s okay to skip this one. You can come back whenever you’re ready.',
  resumeLabel: 'Resume',
} as const;

const ALL_SKIPPED_BUBBLE_BODY = 'No pressure today. I’m here whenever you’re ready.';

const ALL_SKIPPED_BUBBLE_COPY = {
  bubbleBody: ALL_SKIPPED_BUBBLE_BODY,
  bubbleAriaLabel: `Nova: ${ALL_SKIPPED_BUBBLE_BODY} View your skipped plans.`,
} as const;

interface CardPausedOverlayProps {
  mode: 'rest' | 'skipped' | null;
  isCenterCard: boolean;
  shouldReduceMotion: boolean;
  onResume: () => void;
}

function CardPausedOverlay({
  mode,
  isCenterCard,
  shouldReduceMotion,
  onResume,
}: CardPausedOverlayProps) {
  const copy = mode === 'rest' ? REST_DAY_COPY : SKIP_TASK_COPY;

  return (
    <AnimatePresence initial={false}>
      {mode !== null && (
        <motion.div
          key="card-paused-overlay"
          data-card-paused-overlay={mode}
          data-card-rest-overlay={mode === 'rest' ? 'true' : undefined}
          data-card-skip-overlay={mode === 'skipped' ? 'true' : undefined}
          data-rest-center={isCenterCard ? 'true' : 'false'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.18,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background: 'rgba(255, 255, 255, 0.78)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 35,
          }}
          className={`flex flex-col items-center justify-center px-[24px] text-center ${
            isCenterCard ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {isCenterCard && (
            <div className="flex flex-col items-center justify-center w-full">
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  lineHeight: '25px',
                  color: '#514D60',
                  margin: 0,
                }}
                className="text-center"
              >
                {copy.overlayTitle}
              </h3>
              <p
                style={{
                  marginTop: '8px',
                  fontSize: '13px',
                  fontWeight: 400,
                  lineHeight: '20px',
                  color: '#817B8E',
                  maxWidth: '230px',
                  marginBottom: 0,
                }}
                className="text-center"
              >
                {copy.overlaySubtitle}
              </p>
              <button
                type="button"
                data-card-action={mode === 'rest' ? 'restart-rest-day' : 'resume-skipped-task'}
                onClick={(e) => {
                  e.stopPropagation();
                  onResume();
                }}
                style={{
                  marginTop: '18px',
                  minWidth: '88px',
                  height: '44px',
                }}
                className="genki-mobile-control genki-mobile-restart flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer transition-opacity duration-150 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#766D98] rounded-[16px]"
              >
                <span
                  style={{
                    height: '44px',
                    minWidth: '88px',
                    paddingLeft: '20px',
                    paddingRight: '20px',
                    borderRadius: '12px',
                    background: '#EEEDF6',
                    border: '1px solid rgba(118, 109, 152, 0.18)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#514C8C',
                    boxShadow: 'none',
                  }}
                  className="inline-flex items-center justify-center whitespace-nowrap"
                >
                  {copy.resumeLabel}
                </span>
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SuggestionMediaThumbnailProps {
  src: string;
  title: string;
  mediaType: 'article';
  compact?: boolean;
  squareSize?: number;
  isHiddenForTransition?: boolean;
  isInteractive: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  didSwipeCarouselRef: React.MutableRefObject<boolean>;
  lastCarouselSwipeTimeRef: React.MutableRefObject<number>;
  onOpenDetail: () => void;
}

function SuggestionMediaThumbnail({
  src,
  title,
  compact = false,
  squareSize,
  isHiddenForTransition = false,
  isInteractive,
  buttonRef,
  didSwipeCarouselRef,
  lastCarouselSwipeTimeRef,
  onOpenDetail,
}: SuggestionMediaThumbnailProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgElRef = useRef<HTMLImageElement>(null);
  const pressOriginRef = useRef<{ x: number; y: number; movedOver8px: boolean } | null>(null);

  useEffect(() => {
    setImgError(false);
    const el = imgElRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setImgLoaded(true);
    } else {
      setImgLoaded(false);
    }
  }, [src]);

  const width = squareSize ?? (compact ? 72 : 80);
  const height = squareSize ?? (compact ? 60 : 64);
  const borderRadius = squareSize ? '11px' : '12px';

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={isInteractive ? 0 : -1}
      data-card-action="open-media-detail"
      aria-label={`View details: ${title}`}
      onPointerDown={(e) => {
        pressOriginRef.current = { x: e.clientX, y: e.clientY, movedOver8px: false };
      }}
      onPointerMove={(e) => {
        if (!pressOriginRef.current) return;
        const dist = Math.hypot(
          e.clientX - pressOriginRef.current.x,
          e.clientY - pressOriginRef.current.y
        );
        if (dist > 8) {
          pressOriginRef.current.movedOver8px = true;
        }
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (!touch) return;
        pressOriginRef.current = { x: touch.clientX, y: touch.clientY, movedOver8px: false };
      }}
      onTouchMove={(e) => {
        if (!pressOriginRef.current) return;
        const touch = e.touches[0];
        if (!touch) return;
        const dist = Math.hypot(
          touch.clientX - pressOriginRef.current.x,
          touch.clientY - pressOriginRef.current.y
        );
        if (dist > 8) {
          pressOriginRef.current.movedOver8px = true;
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        const origin = pressOriginRef.current;
        pressOriginRef.current = null;
        const movedFromOrigin =
          origin &&
          (origin.movedOver8px ||
            (e.clientX !== 0 &&
              e.clientY !== 0 &&
              Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8));
        if (
          !isInteractive ||
          movedFromOrigin ||
          didSwipeCarouselRef.current ||
          performance.now() - lastCarouselSwipeTimeRef.current < 240
        ) {
          e.preventDefault();
          return;
        }
        onOpenDetail();
      }}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius,
      }}
      className={`genki-mobile-focus relative shrink-0 overflow-hidden bg-[#EBEBF0] border border-black/[0.06] shadow-[0_2px_8px_rgba(38,38,63,0.06)] group active:scale-[0.97] transition-transform select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE] ${
        isInteractive ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div
        className={`w-full h-full relative ${
          isHiddenForTransition ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {!imgError ? (
          <img
            ref={imgElRef}
            src={src}
            alt={title}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover object-center transition-opacity duration-200 group-hover:scale-105 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div
            data-testid="media-thumb-fallback"
            className="w-full h-full bg-[#EAEAF0] flex items-center justify-center text-[#8E8E93]"
          >
            <FileText className="w-5 h-5 stroke-[1.8]" aria-hidden="true" />
          </div>
        )}

        {/* Overlay indicator: bottom-right 18px expand icon for all guide/article media */}
        {!imgError && (
          <div
            data-thumb-badge="article"
            style={{ width: '18px', height: '18px', right: '5px', bottom: '5px' }}
            className="absolute rounded-[5px] bg-black/36 backdrop-blur-[2px] flex items-center justify-center pointer-events-none"
          >
            <Maximize2
              style={{ width: '10px', height: '10px' }}
              className="text-white stroke-[2.3]"
              aria-hidden="true"
            />
          </div>
        )}
      </div>
    </button>
  );
}

interface SuggestionCardItemState {
  id: string;
  /** Stable per-task-instance identifier for deduplicating Today completions & Undo without guessing by date+slot */
  taskInstanceId: string;
  /** Exact unified TaskCompletionRecord.id written when this card was completed */
  completedRecordId?: string | null;
  /** Original plan ID before any Plan B / alternative replacement */
  originalPlanId?: string;
  /** Plan IDs replaced on this same logical task instance */
  replacedFromPlanIds?: string[];
  plan: PlanItem;
  planState: 'suggested' | 'accepted' | 'completed';
  showPlanBHint: boolean;
  isSkipped?: boolean;
}

const preloadedPlanImages = new Set<string>();

function preloadPlanThumbnail(src: string): Promise<void> {
  if (!src || preloadedPlanImages.has(src) || typeof Image === 'undefined') {
    if (src) preloadedPlanImages.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) preloadedPlanImages.add(src);
      resolve();
    };
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {}).finally(() => finish(true));
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = src;
    if (img.complete) {
      finish(img.naturalWidth > 0);
    } else {
      window.setTimeout(() => finish(false), 700);
    }
  });
}

const CARD_UPDATE_SPARKLES = [
  { left: '3.8%', top: '24%', size: 12, delayMs: 180, color: '#A18ACD', nudgeX: 0, nudgeY: 0 },
  { left: '38%', top: '11%', size: 10, delayMs: 280, color: '#B9A3E2', nudgeX: 0, nudgeY: 0 },
  { left: '16%', top: '46%', size: 15, delayMs: 340, color: '#C5B4EB', nudgeX: 0, nudgeY: 0 },
  { left: '70%', top: '12%', size: 14, delayMs: 390, color: '#C5B4EB', nudgeX: 0, nudgeY: 0 },
  { left: '26%', top: '65%', size: 11, delayMs: 470, color: '#A18ACD', nudgeX: 0, nudgeY: 0 },
  { left: '77%', top: '45%', size: 13, delayMs: 560, color: '#A18ACD', nudgeX: 0, nudgeY: 0 },
  { left: '89%', top: '58%', size: 10, delayMs: 670, color: '#B9A3E2', nudgeX: 0, nudgeY: 0 },
  { left: '10%', top: '84%', size: 14, delayMs: 740, color: '#B9A3E2', nudgeX: 0, nudgeY: 0 },
  { left: '90%', top: '84%', size: 12, delayMs: 820, color: '#C5B4EB', nudgeX: 0, nudgeY: 0 },
] as const;

interface CardStaticThumbPreviewProps {
  src: string;
  title: string;
  squareSize?: number;
}

function CardStaticThumbPreview({ src, title, squareSize = 40 }: CardStaticThumbPreviewProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        width: `${squareSize}px`,
        height: `${squareSize}px`,
        borderRadius: '11px',
      }}
      className="relative shrink-0 overflow-hidden bg-[#EBEBF0] border border-black/[0.06] shadow-[0_2px_8px_rgba(38,38,63,0.06)] select-none"
    >
      {!imgError ? (
        <>
          <img
            src={src}
            alt={title}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-center"
          />
          <div
            style={{ width: '18px', height: '18px', right: '5px', bottom: '5px' }}
            className="absolute rounded-[5px] bg-black/36 backdrop-blur-[2px] flex items-center justify-center pointer-events-none"
          >
            <Maximize2
              style={{ width: '10px', height: '10px' }}
              className="text-white stroke-[2.3]"
              aria-hidden="true"
            />
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-[#EAEAF0] flex items-center justify-center text-[#8E8E93]">
          <FileText className="w-5 h-5 stroke-[1.8]" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

interface CardWipeAnimState {
  cardId: string;
  runId: number;
  oldPlan: PlanItem;
  newPlan: PlanItem;
}

interface CardContentWipeRowProps {
  displayPlan: PlanItem;
  wipeAnim: CardWipeAnimState | null;
  shouldReduceMotion: boolean;
  isCenterCard: boolean;
  cardState: 'suggested' | 'accepted' | 'completed';
  isThumbnailHiddenForDetail: boolean;
  cardContainerRef: React.RefObject<HTMLDivElement | null>;
  cardSweepGlowRef: React.RefObject<HTMLDivElement | null>;
  cardThumbnailRef: React.Ref<HTMLButtonElement>;
  didSwipeCarouselRef: React.MutableRefObject<boolean>;
  lastCarouselSwipeTimeRef: React.MutableRefObject<number>;
  onOpenDetail: () => void;
  onWipeComplete: (runId: number) => void;
}

const SPARKLE_STAR_PATH =
  'M12 1 C13.1 7.6 16.4 10.9 23 12 C16.4 13.1 13.1 16.4 12 23 C10.9 16.4 7.6 13.1 1 12 C7.6 10.9 10.9 7.6 12 1 Z';

function CardContentWipeRow({
  displayPlan,
  wipeAnim,
  shouldReduceMotion,
  isCenterCard,
  cardState,
  isThumbnailHiddenForDetail,
  cardContainerRef,
  cardSweepGlowRef,
  cardThumbnailRef,
  didSwipeCarouselRef,
  lastCarouselSwipeTimeRef,
  onOpenDetail,
  onWipeComplete,
}: CardContentWipeRowProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const newLayerRef = useRef<HTMLDivElement>(null);
  const oldLayerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!wipeAnim) {
      return;
    }

    const stage = stageRef.current;
    const newLayer = newLayerRef.current;
    const oldLayer = oldLayerRef.current;
    const cardEl = cardContainerRef.current;
    if (!stage || !newLayer || !oldLayer) return;

    let rafId = 0;
    let settleTimer = 0;
    let completeTimer = 0;
    let cancelled = false;
    const runId = wipeAnim.runId;

    if (shouldReduceMotion) {
      stage.style.height = '';
      stage.style.transition = '';
      newLayer.style.maskImage = '';
      newLayer.style.webkitMaskImage = '';
      oldLayer.style.maskImage = '';
      oldLayer.style.webkitMaskImage = '';
      newLayer.style.transition = 'opacity 150ms ease-out';
      oldLayer.style.transition = 'opacity 150ms ease-out';
      newLayer.style.opacity = '0';
      oldLayer.style.opacity = '1';
      void stage.offsetHeight;
      newLayer.style.opacity = '1';
      oldLayer.style.opacity = '0';

      completeTimer = window.setTimeout(() => {
        if (cancelled) return;
        newLayer.style.transition = '';
        newLayer.style.opacity = '';
        onWipeComplete(runId);
      }, 165);

      return () => {
        cancelled = true;
        window.clearTimeout(completeTimer);
      };
    }

    const oldHeight = oldLayer.scrollHeight;
    const newHeight = newLayer.scrollHeight;
    const maxHeight = Math.max(oldHeight, newHeight);

    stage.style.transition = 'none';
    stage.style.height = `${maxHeight}px`;

    // Measure stage layout offset relative to outer card container so the 48px card sweep
    // and the 6px feathered content mask move along the exact same physical X boundary.
    let contentOffsetX = 20;
    if (cardEl) {
      let offsetAcc = 0;
      let cursor: HTMLElement | null = stage;
      while (cursor && cursor !== cardEl) {
        offsetAcc += cursor.offsetLeft;
        cursor = cursor.offsetParent as HTMLElement | null;
      }
      if (cursor === cardEl) {
        contentOffsetX = offsetAcc;
      }
    }

    const cardWidth = cardEl?.clientWidth || stage.clientWidth + contentOffsetX * 2 || 310;
    const GLOW_HALF_W = 24; // 48px wide glow strip
    const START_CENTER_X = -28; // Completely outside card left edge (right edge at -4px)
    const END_CENTER_X = cardWidth + 28; // Completely outside card right edge (left edge at cardWidth + 4px)
    const TOTAL_TRAVEL = END_CENTER_X - START_CENTER_X;

    const applyUnifiedProgress = (p: number) => {
      const clampedP = Math.max(0, Math.min(1, p));
      const cardBoundaryX = START_CENTER_X + clampedP * TOTAL_TRAVEL;
      const contentBoundaryX = cardBoundaryX - contentOffsetX;
      // 6px feather width centered on contentBoundaryX
      const featherStart = (contentBoundaryX - 3).toFixed(2);
      const featherEnd = (contentBoundaryX + 3).toFixed(2);

      const newMask = `linear-gradient(90deg, rgba(0,0,0,1) ${featherStart}px, rgba(0,0,0,0) ${featherEnd}px)`;
      const oldMask = `linear-gradient(90deg, rgba(0,0,0,0) ${featherStart}px, rgba(0,0,0,1) ${featherEnd}px)`;
      newLayer.style.maskImage = newMask;
      newLayer.style.webkitMaskImage = newMask;
      oldLayer.style.maskImage = oldMask;
      oldLayer.style.webkitMaskImage = oldMask;

      const glowEl = cardSweepGlowRef.current;
      if (glowEl) {
        glowEl.style.transform = `translate3d(${(cardBoundaryX - GLOW_HALF_W).toFixed(2)}px, 0, 0)`;
        glowEl.style.opacity = '1';
      }
    };

    newLayer.style.transition = '';
    oldLayer.style.transition = '';
    newLayer.style.opacity = '1';
    oldLayer.style.opacity = '1';
    applyUnifiedProgress(0);

    let startTime: number | null = null;
    const WIPE_DURATION_MS = 850;
    const HEIGHT_SETTLE_MS = 180;
    const TOTAL_EFFECT_MS = 1400; // 9th sparkle (820ms delay + 550ms duration = 1370ms)

    const tick = (now: number) => {
      if (cancelled) return;
      if (startTime === null) startTime = now;
      const elapsed = Math.max(0, now - startTime);
      const p = Math.min(1, elapsed / WIPE_DURATION_MS);

      applyUnifiedProgress(p);

      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        newLayer.style.maskImage = '';
        newLayer.style.webkitMaskImage = '';
        oldLayer.style.opacity = '0';
        const glowEl = cardSweepGlowRef.current;
        if (glowEl) {
          glowEl.style.opacity = '0';
        }

        const targetHeight = newLayer.scrollHeight;
        if (Math.abs(targetHeight - maxHeight) > 0.5) {
          stage.style.transition = `height ${HEIGHT_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          void stage.offsetHeight;
          stage.style.height = `${targetHeight}px`;
          settleTimer = window.setTimeout(() => {
            if (cancelled) return;
            stage.style.transition = '';
            stage.style.height = '';
          }, HEIGHT_SETTLE_MS + 16);
        } else {
          stage.style.transition = '';
          stage.style.height = '';
        }

        const remainingMs = Math.max(HEIGHT_SETTLE_MS + 20, TOTAL_EFFECT_MS - elapsed);
        completeTimer = window.setTimeout(() => {
          if (cancelled) return;
          onWipeComplete(runId);
        }, remainingMs);
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.clearTimeout(completeTimer);
      if (stage) {
        stage.style.transition = '';
        stage.style.height = '';
      }
      if (newLayer) {
        newLayer.style.maskImage = '';
        newLayer.style.webkitMaskImage = '';
        newLayer.style.opacity = '';
        newLayer.style.transition = '';
      }
      if (oldLayer) {
        oldLayer.style.maskImage = '';
        oldLayer.style.webkitMaskImage = '';
        oldLayer.style.opacity = '';
        oldLayer.style.transition = '';
      }
      const glowEl = cardSweepGlowRef.current;
      if (glowEl) {
        glowEl.style.opacity = '0';
      }
    };
  }, [wipeAnim?.runId, shouldReduceMotion, cardContainerRef, cardSweepGlowRef, onWipeComplete]);

  if (!wipeAnim) {
    return (
      <div className="flex items-center justify-between gap-2.5">
        <h2
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          className="genki-mobile-row-title text-[16.5px] sm:text-[17px] font-bold tracking-[-0.02em] text-[#1C1C1E] leading-snug flex-1"
        >
          {displayPlan.title}
        </h2>

        {cardState !== 'suggested' && (
          <SuggestionMediaThumbnail
            src={displayPlan.thumbnailUrl}
            title={displayPlan.title}
            mediaType={displayPlan.mediaType}
            squareSize={40}
            isHiddenForTransition={isThumbnailHiddenForDetail}
            isInteractive={isCenterCard}
            buttonRef={isCenterCard ? cardThumbnailRef : undefined}
            didSwipeCarouselRef={didSwipeCarouselRef}
            lastCarouselSwipeTimeRef={lastCarouselSwipeTimeRef}
            onOpenDetail={onOpenDetail}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative"
      data-card-wipe-state={shouldReduceMotion ? 'reduced-fade' : 'wiping'}
    >
      <div ref={stageRef} className="relative overflow-hidden">
        {/* Bottom layer: Final new plan content */}
        <div ref={newLayerRef} className="flex items-center justify-between gap-2.5">
          <h2
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            className="genki-mobile-row-title text-[16.5px] sm:text-[17px] font-bold tracking-[-0.02em] text-[#1C1C1E] leading-snug flex-1"
          >
            {wipeAnim.newPlan.title}
          </h2>

          {cardState !== 'suggested' && (
            <SuggestionMediaThumbnail
              src={wipeAnim.newPlan.thumbnailUrl}
              title={wipeAnim.newPlan.title}
              mediaType={wipeAnim.newPlan.mediaType}
              squareSize={40}
              isHiddenForTransition={isThumbnailHiddenForDetail}
              isInteractive={isCenterCard}
              buttonRef={isCenterCard ? cardThumbnailRef : undefined}
              didSwipeCarouselRef={didSwipeCarouselRef}
              lastCarouselSwipeTimeRef={lastCarouselSwipeTimeRef}
              onOpenDetail={onOpenDetail}
            />
          )}
        </div>

        {/* Top layer: Initial old plan content (masked left-to-right synchronously with card sweep) */}
        <div
          ref={oldLayerRef}
          aria-hidden="true"
          className="absolute top-0 inset-x-0 pointer-events-none select-none flex items-center justify-between gap-2.5"
        >
          <h2
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
            className="genki-mobile-row-title text-[16.5px] sm:text-[17px] font-bold tracking-[-0.02em] text-[#1C1C1E] leading-snug flex-1"
          >
            {wipeAnim.oldPlan.title}
          </h2>

          {cardState !== 'suggested' && (
            <CardStaticThumbPreview
              src={wipeAnim.oldPlan.thumbnailUrl}
              title={wipeAnim.oldPlan.title}
              squareSize={40}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Chat Action Chip
interface ChatActionOption {
  label: string;
  action: 'accept' | 'show_another' | 'focus_input' | 'keep_plan' | 'skip_task';
  targetPlan?: PlanItem;
  primary?: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  options?: ChatActionOption[];
  disabled?: boolean;
  selectedOptionLabel?: string;
}


// Shared mobile typography and controls, used by Today and Discover (including portals).
// Unlayered, explicitly named classes avoid Tailwind preflight layer-order regressions.
const GENKI_MOBILE_UI_STYLES = `
#today-brand-title {font-size:32px;font-weight:700;line-height:38px;letter-spacing:-.024em;}
.genki-mobile-sheet-title {font-size:22px;font-weight:600;line-height:28px;letter-spacing:-.02em;}
.genki-mobile-section-title {font-size:18px;font-weight:600;line-height:24px;letter-spacing:-.015em;}
.genki-mobile-row-title {font-size:17px;font-weight:600;line-height:23px;letter-spacing:-.015em;}
.genki-mobile-body {font-size:15px;font-weight:400;line-height:22px;}
.genki-mobile-meta {font-size:13px;font-weight:400;line-height:18px;}
.genki-mobile-control {min-height:44px;min-width:44px;font-size:15px;font-weight:500;line-height:20px;touch-action:manipulation;transition:background-color 150ms ease,color 150ms ease,opacity 150ms ease;}
.genki-mobile-control:focus-visible,.genki-mobile-focus:focus-visible,.genki-mobile-input:focus-visible {outline:2px solid #5E5BAE;outline-offset:2px;}
.genki-mobile-control:disabled {opacity:.45;cursor:not-allowed;}
.genki-mobile-control:not(:disabled):active {opacity:.75;}
.genki-mobile-primary {min-height:48px;border-radius:14px;padding:12px 16px;background:#5E5BAE;color:white;font-weight:600;box-shadow:none;display:inline-flex;align-items:center;justify-content:center;}
.genki-mobile-primary:not(:disabled):hover {background:#504D9D;}
.genki-mobile-secondary {min-height:44px;border-radius:12px;padding:10px 16px;background:#EEEDF6;color:#514C8C;font-weight:600;box-shadow:none;border-color:transparent;display:inline-flex;align-items:center;justify-content:center;}
.genki-mobile-secondary:not(:disabled):hover {background:#E4E2F1;}
.genki-mobile-tertiary {min-height:44px;border-radius:12px;font-size:15px;font-weight:500;line-height:20px;}
.genki-mobile-icon-well {width:44px;height:44px;min-width:44px;min-height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.genki-mobile-icon-well > span {width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:999px;}
.genki-mobile-icon-well svg {width:20px;height:20px;}
.genki-mobile-send {width:44px;height:44px;flex-shrink:0;border-radius:999px;}
.genki-mobile-send svg {width:20px;height:20px;}
.genki-mobile-chat-entry {font-size:15px;font-weight:500;line-height:22px;}
.genki-mobile-input {font-size:16px;line-height:22px;min-height:44px;min-width:0;}
#discover-feed-scroll > div > article {padding:18px;}
#discover-detail-sheet .genki-mobile-section-title {margin:0;}
.genki-chat-attach-btn {width:44px;height:44px;min-width:44px;min-height:44px;flex-shrink:0;border-radius:50%;background:transparent;border:none;color:#70677F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;transition:background-color 150ms ease;}
.genki-chat-attach-btn:active {background:rgba(112,103,127,0.08);}
.genki-chat-attach-btn:focus-visible {outline:2px solid #5E5BAE;outline-offset:2px;}
@media(prefers-reduced-motion:reduce) {.genki-mobile-control,.genki-chat-attach-btn {transition:none;}}
`;

export default function App() {
  const activePreviewProfileId = useMemo(() => getActivePreviewProfileIdFromUrl(), []);
  const initialTab = useMemo(() => getInitialTabFromUrl(), []);
  const [activeTab, setActiveTab] = useState<'Today' | 'Plan' | 'Discover'>(initialTab);
  const [planEntryCount, setPlanEntryCount] = useState<number>(initialTab === 'Plan' ? 1 : 0);
  const [hasVisitedPlan, setHasVisitedPlan] = useState<boolean>(initialTab === 'Plan');
  const [hasVisitedDiscover, setHasVisitedDiscover] = useState<boolean>(initialTab === 'Discover');

  useEffect(() => {
    if (!activePreviewProfileId || !isPreviewResetRequestedFromUrl()) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // ignore URL rewrite errors
    }
  }, [activePreviewProfileId]);

  // Single shared persistent PlanFoundationStore backing Today, Plan, History, This week, and Weekly review.
  // In production shared URLs (activePreviewProfileId === null), prototypeDemoSeed.ts is NEVER imported or downloaded.
  // In AI Studio dev preview or explicit ?preview=plan-review, prototypeDemoSeed.ts loads dynamically on mount
  // into its isolated preview storage namespace so official user records remain untouched.
  const previewSeedModuleRef = useRef<typeof import('./utils/prototypeDemoSeed') | null>(null);
  const initialPlanStoreRef = useRef<PlanFoundationStore | null>(null);
  if (initialPlanStoreRef.current === null) {
    const bootNow = new Date();
    initialPlanStoreRef.current = activePreviewProfileId
      ? createEmptyPlanFoundationStore()
      : loadPlanFoundationStore({ now: bootNow });
  }
  const initialTodayDateKeyRef = useRef<string>(toLocalDateKey(new Date()));

  const [planStore, setPlanStore] = useState<PlanFoundationStore>(
    () => initialPlanStoreRef.current!
  );
  const planStoreRef = useRef<PlanFoundationStore>(planStore);
  planStoreRef.current = planStore;

  const updatePlanStore = useCallback(
    (updater: (prev: PlanFoundationStore) => PlanFoundationStore): boolean => {
      const prev = planStoreRef.current;
      const next = updater(prev);
      if (next === prev) return true;
      let saved = false;
      if (activePreviewProfileId) {
        if (previewSeedModuleRef.current) {
          saved = previewSeedModuleRef.current.savePreviewProfileStore(
            activePreviewProfileId,
            next
          );
        } else {
          saved = true;
          void import('./utils/prototypeDemoSeed')
            .then((mod) => {
              previewSeedModuleRef.current = mod;
              mod.savePreviewProfileStore(activePreviewProfileId, next);
            })
            .catch(() => {});
        }
      } else {
        saved = savePlanFoundationStore(next);
        if (saved) {
          // Mirror clean non-demo legacy keys for compatibility across reload/external readers
          saveUnifiedActivities(projectLegacyActivityRecords(next));
          saveUnifiedRestRecords(projectLegacyRestRecords(next));
        }
      }
      if (!saved) return false;
      planStoreRef.current = next;
      setPlanStore(next);
      return true;
    },
    [activePreviewProfileId]
  );

  const activityRecords = useMemo(
    () => projectLegacyActivityRecords(planStore),
    [planStore]
  );
  const restRecords = useMemo(
    () => projectLegacyRestRecords(planStore),
    [planStore]
  );
  const activityRecordsRef = useRef(activityRecords);
  activityRecordsRef.current = activityRecords;
  const restRecordsRef = useRef(restRecords);
  restRecordsRef.current = restRecords;

  // 3 independent suggestion cards state (starts at index 0 -> 1 / 3: "How about a 5-minute stretch?")
  const [cardsState, setCardsState] = useState<SuggestionCardItemState[]>(() => {
    const todayKey = initialTodayDateKeyRef.current;
    const existingTasks = initialPlanStoreRef.current!.taskCompletions.filter(
      (t) => t.status === 'done'
    );
    const baseCards: { id: string; plan: PlanItem }[] = [
      { id: 'card-0', plan: STRETCH_PLAN },
      { id: 'card-1', plan: DEFAULT_WALK_PLAN },
      { id: 'card-2', plan: MOBILITY_PLAN },
    ];
    return baseCards.map(({ id, plan }) => {
      const taskInstanceId = `today-task::${todayKey}::${id}`;
      // Match existing Today completion by stable logicalTaskId (or legacy `${todayKey}::${id}`)
      const matched = existingTasks.find(
        (rec) =>
          rec.logicalTaskId === taskInstanceId || rec.logicalTaskId === `${todayKey}::${id}`
      );
      return {
        id,
        taskInstanceId: matched?.logicalTaskId ?? taskInstanceId,
        completedRecordId: matched ? matched.id : null,
        originalPlanId: matched?.originalPlanId ?? plan.id,
        replacedFromPlanIds: matched?.replacedFromPlanIds ?? [],
        plan,
        planState: matched ? 'completed' : 'suggested',
        showPlanBHint: true,
        isSkipped: false,
      };
    });
  });

  const [activeVirtualIndex, setActiveVirtualIndex] = useState<number>(0);
  const activeCardIndex = ((activeVirtualIndex % 3) + 3) % 3;
  const activeCardIndexRef = useRef<number>(activeCardIndex);
  activeCardIndexRef.current = activeCardIndex;
  const cardsStateRef = useRef<SuggestionCardItemState[]>(cardsState);
  cardsStateRef.current = cardsState;
  const chatTargetCardIdxRef = useRef<number>(activeCardIndex);

  const initialTodayRestEvent = initialPlanStoreRef.current!.lifecycleEvents.find(
    (e) => e.type === 'rest' && e.source === 'today' && e.dateKey === initialTodayDateKeyRef.current
  );
  const todayRestRecordIdRef = useRef<string | null>(
    initialTodayRestEvent?.legacyRestRecordId ?? initialTodayRestEvent?.id ?? null
  );

  const currentCard = cardsState[activeCardIndex];
  const currentPlan = currentCard.plan;
  const planState = currentCard.planState;
  const showPlanBHint = currentCard.showPlanBHint;

  const setCurrentPlan = useCallback((nextPlan: PlanItem, targetIdx?: number) => {
    const idx = targetIdx ?? activeCardIndexRef.current;
    setCardsState(prev =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const prevReplaced = item.replacedFromPlanIds ?? [];
        const nextReplaced =
          item.plan.id !== nextPlan.id && !prevReplaced.includes(item.plan.id)
            ? [...prevReplaced, item.plan.id]
            : prevReplaced;
        return {
          ...item,
          originalPlanId: item.originalPlanId ?? item.plan.id,
          replacedFromPlanIds: nextReplaced,
          plan: nextPlan,
        };
      })
    );
  }, []);

  const setPlanState = useCallback((nextState: 'suggested' | 'accepted' | 'completed', targetIdx?: number) => {
    const idx = targetIdx ?? activeCardIndexRef.current;
    setCardsState(prev =>
      prev.map((item, i) => (i === idx ? { ...item, planState: nextState } : item))
    );
  }, []);

  const recordCardCompleted = useCallback((targetIdx?: number) => {
    const idx = targetIdx ?? activeCardIndexRef.current;
    const card = cardsStateRef.current[idx];
    if (!card || card.planState === 'completed') return;

    const category =
      card.plan.activityCategory ?? inferActivityCategory(card.plan.id, card.plan.title);
    if (category === 'rest') {
      setPlanState('completed', idx);
      return;
    }

    const now = new Date();
    const dateKey = toLocalDateKey(now);
    const stableLogicalTaskId = card.taskInstanceId;
    const plannedDurationMinutes =
      typeof card.plan.durationMinutes === 'number'
        ? card.plan.durationMinutes
        : inferDurationMinutes(card.plan.title);
    const exerciseType = mapActivityCategoryToExerciseType(category, card.plan.id);

    setCardsState((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, planState: 'completed', completedRecordId: stableLogicalTaskId }
          : item
      )
    );

    updatePlanStore((prev) => {
      const { store } = completeTaskCard(prev, {
        logicalTaskId: stableLogicalTaskId,
        dateKey,
        completedAt: now.toISOString(),
        hasExactTimestamp: true,
        cardId: card.id,
        planId: card.plan.id,
        originalPlanId: card.originalPlanId ?? card.plan.id,
        replacedFromPlanIds: card.replacedFromPlanIds ?? [],
        title: card.plan.title,
        exerciseSegments: [
          {
            exerciseType,
            title: card.plan.title,
            plannedDurationMinutes,
            // Planned duration NEVER masquerades as trustworthy actual duration
            actualDurationMinutes: null,
            durationTrust: 'unknown',
            linkedHabitId: null,
          },
        ],
        // Explicit habit linkage only; never guess habitId from title keywords
        linkedHabitIds: [],
        note: 'Completed on Today',
      });
      return store;
    });
  }, [setPlanState, updatePlanStore]);

  const undoCardCompleted = useCallback((targetIdx: number) => {
    const card = cardsStateRef.current[targetIdx];
    if (!card) return;

    hasCompletedRef.current = false;
    isHoldingRef.current = false;
    holdProgressRef.current = 0;
    setIsCompletedPop(false);
    setHoldProgress(0);

    // Strictly remove ONLY the exact record created by this card instance — never guess by current date + slot index
    const recordIdToRemove = card.completedRecordId;
    const logicalTaskId = card.taskInstanceId;

    setCardsState((prev) =>
      prev.map((item, i) =>
        i === targetIdx
          ? { ...item, planState: 'accepted', completedRecordId: null }
          : item
      )
    );

    if (recordIdToRemove || logicalTaskId) {
      updatePlanStore((prev) =>
        undoTaskCardCompletion(prev, {
          ...(recordIdToRemove ? { taskCompletionId: recordIdToRemove } : {}),
          logicalTaskId,
        })
      );
    }
  }, [updatePlanStore]);

  // Unified History / Plan mutations (single source of truth synchronized with Today)
  // Manual exercise logs NEVER create or increment Done task counts.
  const handleAddManualActivity = useCallback((input: ManualActivityInput): boolean => {
    const exerciseType = mapActivityCategoryToExerciseType(input.category);
    const cleanDuration =
      typeof input.durationMinutes === 'number' && input.durationMinutes > 0
        ? Math.round(input.durationMinutes)
        : null;
    return updatePlanStore((prev) => {
      const { store } = addExerciseSession(prev, {
        exerciseType,
        dateKey: input.dateKey,
        actualDurationMinutes: cleanDuration,
        durationTrust: cleanDuration !== null ? 'user_reported_actual' : 'unknown',
        plannedDurationMinutes: null,
        source: 'manual',
        linkedHabitId: null,
        title: input.title,
        note: input.note,
      });
      return store;
    });
  }, [updatePlanStore]);

  const handleUpdateActivity = useCallback((recordId: string, patch: ActivityUpdatePatch): boolean => {
    const exerciseType = mapActivityCategoryToExerciseType(patch.category);
    const cleanDuration =
      typeof patch.durationMinutes === 'number' && patch.durationMinutes > 0
        ? Math.round(patch.durationMinutes)
        : null;
    return updatePlanStore((prev) =>
      updateExerciseSession(prev, recordId, {
        ...(patch.dateKey ? { dateKey: patch.dateKey } : {}),
        exerciseType,
        title: patch.title,
        actualDurationMinutes: cleanDuration,
        durationTrust: cleanDuration !== null ? 'user_reported_actual' : 'unknown',
        note: patch.note,
      })
    );
  }, [updatePlanStore]);

  const handleDeleteActivity = useCallback((recordId: string): boolean => {
    const ok = updatePlanStore((prev) =>
      removeExerciseSession(prev, recordId, { cascadeTaskUndo: true })
    );
    if (!ok) return false;
    // If a Today card was linked to this deleted record, clear its completed binding so Today stays consistent
    setCardsState((prev) =>
      prev.map((item) =>
        item.completedRecordId === recordId || item.taskInstanceId === recordId
          ? { ...item, planState: item.planState === 'completed' ? 'accepted' : item.planState, completedRecordId: null }
          : item
      )
    );
    return true;
  }, [updatePlanStore]);

  const handleUpsertRestDay = useCallback((dateKey: string, note?: string): boolean => {
    return updatePlanStore((prev) => {
      const { store } = recordLifecycleEvent(prev, {
        type: 'rest',
        dateKey,
        source: 'plan',
        title: 'Mindful rest day',
        note: note?.trim() || 'Restorative recovery day',
        legacyRestRecordId: `rest::manual::${dateKey}`,
      });
      return store;
    });
  }, [updatePlanStore]);

  const handleDeleteRestRecord = useCallback((restId: string): boolean => {
    const ok = updatePlanStore((prev) => removeLifecycleEvent(prev, restId));
    if (!ok) return false;
    if (todayRestRecordIdRef.current === restId) {
      todayRestRecordIdRef.current = null;
      setIsRestDay(false);
    }
    return true;
  }, [updatePlanStore]);

  const handleClearDayRecords = useCallback((dateKey: string): boolean => {
    const removedActivityIds = new Set(
      activityRecordsRef.current.filter((r) => r.dateKey === dateKey).map((r) => r.id)
    );
    const hadTodayRest = restRecordsRef.current.some(
      (r) => r.dateKey === dateKey && r.id === todayRestRecordIdRef.current
    );

    const ok = updatePlanStore((prev) => clearRecordsForDate(prev, dateKey));
    if (!ok) return false;

    if (hadTodayRest) {
      todayRestRecordIdRef.current = null;
      setIsRestDay(false);
    }

    if (removedActivityIds.size > 0) {
      setCardsState((prev) =>
        prev.map((item) =>
          item.completedRecordId && removedActivityIds.has(item.completedRecordId)
            ? {
                ...item,
                planState: item.planState === 'completed' ? 'accepted' : item.planState,
                completedRecordId: null,
              }
            : item
        )
      );
    }
    return true;
  }, [updatePlanStore]);

  const setShowPlanBHint = useCallback((show: boolean, targetIdx?: number) => {
    const idx = targetIdx ?? activeCardIndexRef.current;
    setCardsState(prev =>
      prev.map((item, i) => (i === idx ? { ...item, showPlanBHint: show } : item))
    );
  }, []);

  const setCardSkipped = useCallback((cardId: string, skipped: boolean) => {
    setCardsState(prev =>
      prev.map((item) => (item.id === cardId ? { ...item, isSkipped: skipped } : item))
    );
  }, []);

  const unskippedCardIndices = useMemo(
    () =>
      cardsState.reduce<number[]>((acc, item, idx) => {
        if (!item.isSkipped) acc.push(idx);
        return acc;
      }, []),
    [cardsState]
  );
  const allCardsSkipped = unskippedCardIndices.length === 0;
  const bubbleCardIndex = useMemo(() => {
    if (allCardsSkipped) return activeCardIndex;
    if (!cardsState[activeCardIndex]?.isSkipped) return activeCardIndex;
    return unskippedCardIndices[0] ?? activeCardIndex;
  }, [allCardsSkipped, activeCardIndex, cardsState, unskippedCardIndices]);
  const bubblePlan = cardsState[bubbleCardIndex]?.plan ?? currentPlan;

  // Whether any unskipped suggestion has entered 'accepted' (In progress) or 'completed' (Done) state
  const hasAnyAcceptedOrCompleted = useMemo(
    () =>
      cardsState.some(
        (item) =>
          !item.isSkipped &&
          (item.planState === 'accepted' || item.planState === 'completed')
      ),
    [cardsState]
  );

  // Open expanded suggestion card positioned directly on the clicked list row's suggestion
  const handleSelectListRow = useCallback((targetIdx: number) => {
    setActiveVirtualIndex((prev) => {
      const currentMod = ((prev % 3) + 3) % 3;
      let diff = targetIdx - currentMod;
      if (diff > 1) diff -= 3;
      if (diff < -1) diff += 3;
      return prev + diff;
    });
    setIsPlanCardOpen(true);
  }, []);

  type TodayWeatherCondition =
    | 'thunderstorm'
    | 'rain'
    | 'drizzle'
    | 'partly-cloudy'
    | 'snow'
    | 'sleet'
    | 'clear'
    | 'cloudy'
    | 'fog';

  interface TodayWeatherState {
    available: boolean;
    temperatureC: number | null;
    condition: TodayWeatherCondition | null;
  }

  const WEATHER_ASSET_MAP: Partial<Record<TodayWeatherCondition, string>> = {
    thunderstorm: '/assets/weather/thunderstorm.png',
    rain: '/assets/weather/rain.png',
    drizzle: '/assets/weather/rain.png',
    'partly-cloudy': '/assets/weather/partly-cloudy.png',
    snow: '/assets/weather/snow.png',
    sleet: '/assets/weather/snow.png',
  };

  // Measured visible bounds inside each 512x512 weather PNG (alpha > 12) for vertical center & right-edge alignment
  const WEATHER_ASSET_INSETS: Record<string, { centerYRatio: number; rightRatio: number }> = {
    '/assets/weather/thunderstorm.png': { centerYRatio: 255.5 / 512, rightRatio: 88 / 512 },
    '/assets/weather/rain.png': { centerYRatio: 255.5 / 512, rightRatio: 88 / 512 },
    '/assets/weather/partly-cloudy.png': { centerYRatio: 252 / 512, rightRatio: 88 / 512 },
    '/assets/weather/snow.png': { centerYRatio: 255.5 / 512, rightRatio: 88 / 512 },
  };

  // Single unified weather state shared by both weather visual and temperature text
  const [todayWeather] = useState<TodayWeatherState>(() => {
    const validConditions: TodayWeatherCondition[] = [
      'thunderstorm',
      'rain',
      'drizzle',
      'partly-cloudy',
      'snow',
      'sleet',
      'clear',
      'cloudy',
      'fog',
    ];
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('weather')?.trim().toLowerCase();
      if (param === 'unavailable' || param === 'none') {
        return { available: false, temperatureC: null, condition: null };
      }
      if (param && (validConditions as string[]).includes(param)) {
        return {
          available: true,
          temperatureC: 18,
          condition: param as TodayWeatherCondition,
        };
      }
    }
    return {
      available: true,
      temperatureC: 18,
      condition: 'partly-cloudy',
    };
  });

  const weatherAssetSrc =
    todayWeather.available && todayWeather.condition
      ? WEATHER_ASSET_MAP[todayWeather.condition] ?? null
      : null;

  // Collapsed suggestion bubble vertical swipe states (3 suggestions share 1 bubble)
  const [bubbleDragY, setBubbleDragY] = useState<number>(0);
  const [isDraggingBubble, setIsDraggingBubble] = useState<boolean>(false);
  const [isBubblePressed, setIsBubblePressed] = useState<boolean>(false);
  const [bubbleSwipeDir, setBubbleSwipeDir] = useState<1 | -1>(1);
  const bubbleDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startTime: number;
  } | null>(null);
  const didSwipeBubbleRef = useRef<boolean>(false);
  const lastBubbleSwipeTimeRef = useRef<number>(-1000);

  // Carousel drag & swipe states
  const [dragDeltaX, setDragDeltaX] = useState<number>(0);
  const [isDraggingCarousel, setIsDraggingCarousel] = useState<boolean>(false);
  const carouselDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    startTime: number;
    axis: 'x' | 'y' | null;
  } | null>(null);
  const didSwipeCarouselRef = useRef<boolean>(false);
  const lastCarouselSwipeTimeRef = useRef<number>(-1000);

  // Today home defaults to ambient normal state (card collapsed into bubble below Nova)
  const [isPlanCardOpen, setIsPlanCardOpen] = useState<boolean>(false);
  const [isRestDay, setIsRestDay] = useState<boolean>(() => Boolean(initialTodayRestEvent));
  const bubbleDisplayMode: 'rest' | 'all-skipped' | 'suggestion' = isRestDay
    ? 'rest'
    : allCardsSkipped
    ? 'all-skipped'
    : 'suggestion';
  const fullBubbleText =
    bubbleDisplayMode === 'rest'
      ? REST_DAY_COPY.bubbleBody
      : bubbleDisplayMode === 'all-skipped'
      ? ALL_SKIPPED_BUBBLE_COPY.bubbleBody
      : bubblePlan.bubblePrompt;
  const prevBubbleDisplayModeRef = useRef<'rest' | 'all-skipped' | 'suggestion'>('suggestion');
  const isBubbleModeTransitioning = prevBubbleDisplayModeRef.current !== bubbleDisplayMode;
  useEffect(() => {
    prevBubbleDisplayModeRef.current = bubbleDisplayMode;
  }, [bubbleDisplayMode]);

  
  // Avatar mode: '3d' procedural fur character (default) or '2d' static fallback
  const [avatarMode, setAvatarMode] = useState<'3d' | '2d'>('3d');
  const [shouldMountToday3D, setShouldMountToday3D] = useState<boolean>(false);
  const [isAvatarFirstFrameReady, setIsAvatarFirstFrameReady] = useState<boolean>(false);
  const [isHomeLayoutReady, setIsHomeLayoutReady] = useState<boolean>(false);

  // Hydrate isolated dev preview profile asynchronously ONLY when activePreviewProfileId is active
  // (never loaded in production shared deployments without ?preview=plan-review).
  useEffect(() => {
    if (!activePreviewProfileId) return;
    let cancelled = false;
    const resetRequested = isPreviewResetRequestedFromUrl();
    void import('./utils/prototypeDemoSeed')
      .then((mod) => {
        if (cancelled) return;
        previewSeedModuleRef.current = mod;
        const loaded = mod.loadPreviewProfileStore(activePreviewProfileId, {
          now: new Date(),
          reset: resetRequested,
        });
        planStoreRef.current = loaded;
        setPlanStore(loaded);

        const todayKey = initialTodayDateKeyRef.current;
        const doneTasks = loaded.taskCompletions.filter((t) => t.status === 'done');
        setCardsState((prev) =>
          prev.map((item) => {
            const matched = doneTasks.find(
              (rec) =>
                rec.logicalTaskId === item.taskInstanceId ||
                rec.logicalTaskId === `${todayKey}::${item.id}`
            );
            if (!matched) return item;
            return {
              ...item,
              taskInstanceId: matched.logicalTaskId ?? item.taskInstanceId,
              completedRecordId: matched.id,
              originalPlanId: matched.originalPlanId ?? item.originalPlanId,
              replacedFromPlanIds: matched.replacedFromPlanIds ?? item.replacedFromPlanIds,
              planState: 'completed',
            };
          })
        );
        const todayRest = loaded.lifecycleEvents.find(
          (e) => e.type === 'rest' && e.source === 'today' && e.dateKey === todayKey
        );
        if (todayRest) {
          todayRestRecordIdRef.current = todayRest.legacyRestRecordId ?? todayRest.id;
          setIsRestDay(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activePreviewProfileId]);

  // Defer Today 3D Avatar chunk download & WebGL initialization until after interactive UI & static Nova paint
  useEffect(() => {
    if (avatarMode !== '3d' || shouldMountToday3D) return;
    if (activeTab !== 'Today') return;
    let cancelled = false;
    let rafId2: number | null = null;
    const rafId1 = window.requestAnimationFrame(() => {
      rafId2 = window.requestAnimationFrame(() => {
        if (!cancelled) {
          void loadNovaAvatar3D().catch(() => {});
          setShouldMountToday3D(true);
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId1);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
    };
  }, [avatarMode, shouldMountToday3D, activeTab]);

  // Discover tab saved bookmarks state (versioned localStorage, starts empty when unset)
  const [savedItemIds, setSavedItemIds] = useState<string[]>(() => loadSavedDiscoverIds());
  const [isSavedSheetOpen, setIsSavedSheetOpen] = useState<boolean>(false);
  const [isPlanOverlayOpen, setIsPlanOverlayOpen] = useState<boolean>(false);

  const handleToggleSave = useCallback((id: string) => {
    setSavedItemIds((prev) => {
      const next = toggleSavedDiscoverId(prev, id);
      saveSavedDiscoverIds(next);
      return next;
    });
  }, []);

  // Lightly idle-prefetch Plan & Discover JS chunks ONLY after Today UI & Avatar settle (never blocks first paint)
  useEffect(() => {
    if (!isHomeLayoutReady) return;
    let cancelled = false;
    let idleId: number | null = null;
    let timerId: number | null = null;

    const prefetchSecondaryTabs = () => {
      if (cancelled) return;
      void loadPlanView().catch(() => {});
      void loadDiscoverView().catch(() => {});
    };

    const delayMs = isAvatarFirstFrameReady || avatarMode === '2d' ? 350 : 2200;
    timerId = window.setTimeout(() => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(prefetchSecondaryTabs, { timeout: 1500 });
      } else {
        prefetchSecondaryTabs();
      }
    }, delayMs);

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [isHomeLayoutReady, isAvatarFirstFrameReady, avatarMode]);

  // Hold-to-complete animation state (3 seconds = 3000ms)
  const HOLD_DURATION_MS = 3000;
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [waveTimeSec, setWaveTimeSec] = useState(0);
  const [isCompletedPop, setIsCompletedPop] = useState(false);
  const [isAccessibleConfirmOpen, setIsAccessibleConfirmOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const fallTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const waveOriginRef = useRef<number>(0);
  const holdProgressRef = useRef<number>(0);
  const lastTouchTimeRef = useRef<number>(0);
  const isHoldingRef = useRef<boolean>(false);
  const hasCompletedRef = useRef<boolean>(false);

  // Detail Sheet state
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Chat modal overlay state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatSheetExited, setIsChatSheetExited] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sheetInput, setSheetInput] = useState('');
  const [inputPlaceholder, setInputPlaceholder] = useState('Type your response…');
  const [activePlanChat, setActivePlanChat] = useState<PlanNovaChatRequest | null>(null);
  const [planChatTextEvent, setPlanChatTextEvent] = useState<PlanNovaChatTextEvent | null>(null);
  const lastPlanUserMessageRef = useRef<string>('');
  interface PendingChatAttachment {
    id: string;
    file: File;
    name: string;
    kind: 'image' | 'pdf' | 'text';
    previewUrl?: string;
  }
  const [chatAttachments, setChatAttachments] = useState<PendingChatAttachment[]>([]);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentSourceRef = useRef<'home' | 'drawer'>('drawer');
  const chatAttachmentsRef = useRef<PendingChatAttachment[]>([]);
  chatAttachmentsRef.current = chatAttachments;

  // Adjust-in-Chat -> Today Card replacement animation state & refs
  const adjustSessionRef = useRef<{ cardId: string; initialOldPlan: PlanItem } | null>(null);
  const [pendingPlanUpdate, setPendingPlanUpdate] = useState<{
    cardId: string;
    oldPlan: PlanItem;
    newPlan: PlanItem;
  } | null>(null);
  const pendingPlanUpdateRef = useRef<{
    cardId: string;
    oldPlan: PlanItem;
    newPlan: PlanItem;
  } | null>(null);
  pendingPlanUpdateRef.current = pendingPlanUpdate;
  const [activeCardWipeAnim, setActiveCardWipeAnim] = useState<CardWipeAnimState | null>(null);
  const cardWipeRunIdRef = useRef<number>(0);
  const cardWipeDelayTimerRef = useRef<number | null>(null);
  const cardWipeCancelledRef = useRef<boolean>(false);
  const expectedCardIdDuringWipeRef = useRef<string | null>(null);
  const expectedVirtualIdxDuringWipeRef = useRef<number | null>(null);
  const isProgrammaticCenteringRef = useRef<boolean>(false);
  const cardSweepGlowRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);

  // Media Thumbnail continuous transition refs and states
  interface MediaFrameRect {
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius: number;
  }
  const cardThumbnailRef = useRef<HTMLButtonElement>(null);
  const detailSheetRef = useRef<HTMLDivElement>(null);
  const detailHeaderRef = useRef<HTMLDivElement>(null);
  const detailScrollBodyRef = useRef<HTMLDivElement>(null);
  const detailMediaHeroRef = useRef<HTMLDivElement>(null);
  const floatingMediaRef = useRef<HTMLDivElement>(null);
  const transitionRunIdRef = useRef<number>(0);
  const [detailTransitionRunId, setDetailTransitionRunId] = useState<number>(0);
  const [detailTransitionPhase, setDetailTransitionPhase] = useState<'idle' | 'opening' | 'open' | 'closing'>('idle');
  const [detailThumbRect, setDetailThumbRect] = useState<MediaFrameRect | null>(null);
  const [detailFloatingStartRect, setDetailFloatingStartRect] = useState<MediaFrameRect | null>(null);
  const [detailTargetRect, setDetailTargetRect] = useState<MediaFrameRect | null>(null);

  // Layout and transition geometry refs
  const phoneFrameRef = useRef<HTMLDivElement>(null);
  const homeAvatarRef = useRef<HTMLDivElement>(null);
  const chatSheetRef = useRef<HTMLDivElement>(null);
  const planCardRef = useRef<HTMLDivElement>(null);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const [cardContentHeight, setCardContentHeight] = useState<number | null>(null);
  const companionContentRef = useRef<HTMLDivElement>(null);
  const [companionGroupHeight, setCompanionGroupHeight] = useState<number | null>(null);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState<number>(76);
  const shouldReduceMotion = Boolean(useReducedMotion());

  const [frameSize, setFrameSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' && window.innerWidth > 0 ? Math.min(window.innerWidth, 393) : 393,
    height: typeof window !== 'undefined' && window.innerHeight > 0 ? Math.min(window.innerHeight, 852) : 844,
  }));
  const [sheetMeasuredHeight, setSheetMeasuredHeight] = useState<number>(0);

  // Exact bottom offset for expanded suggestion card: strictly above shared bottom navigation with guaranteed spacing (>= 14px)
  const cardBottomOffset = Math.max(bottomBarHeight + 14, 90);

  // Maximum card height to guarantee it stays strictly above Talk to Nova and leaves Nova's face visible
  const maxCardAllowedHeight = useMemo(() => {
    // Leave room for top status bar + header + Nova's face
    // On short screens (< 680px), leave at least 195px; on regular screens, leave 240px
    const topReserved = frameSize.height < 680 ? 195 : 240;
    return Math.max(180, frameSize.height - cardBottomOffset - topReserved);
  }, [frameSize.height, cardBottomOffset]);

  // Transition state: 'idle' (resting on home) | 'opening' | 'open' (docked at drawer) | 'closing'
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'opening' | 'open' | 'closing'>('idle');

  // Live tracked position for the single persistent Avatar on Today home
  const [homeAvatarRect, setHomeAvatarRect] = useState<{ top: number; left: number; width: number; height: number }>(() => {
    const initW = typeof window !== 'undefined' && window.innerWidth > 0 ? Math.min(window.innerWidth, 393) : 393;
    const initH = typeof window !== 'undefined' && window.innerHeight > 0 ? Math.min(window.innerHeight, 852) : 844;
    const initSize = initH < 700 ? 204 : 248;
    return {
      top: initH < 700 ? 117 : 228,
      left: (initW - initSize) / 2,
      width: initSize,
      height: initSize,
    };
  });

  // Typing posture state for Nova
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Measure live rect of homeAvatar inside phoneFrame at this exact instant
  const getLiveHomeAvatarRect = useCallback(() => {
    if (homeAvatarRef.current && phoneFrameRef.current) {
      const fRect = phoneFrameRef.current.getBoundingClientRect();
      const hRect = homeAvatarRef.current.getBoundingClientRect();
      if (fRect.width > 0 && fRect.height > 0 && hRect.width > 0 && hRect.height > 0) {
        return {
          top: hRect.top - fRect.top,
          left: hRect.left - fRect.left,
          width: hRect.width,
          height: hRect.height,
        };
      }
    }
    const fWidth = phoneFrameRef.current?.clientWidth || 393;
    const defaultSize = frameSize.height < 700 ? 204 : 248;
    return {
      top: frameSize.height < 700 ? 117 : 228,
      left: (fWidth - defaultSize) / 2,
      width: defaultSize,
      height: defaultSize,
    };
  }, [frameSize.height]);

  // Convert any element's viewport rect into phoneFrameRef padding-box local coordinates
  const toFrameLocalRect = useCallback((el: HTMLElement | null, fallbackRadius: number): MediaFrameRect | null => {
    const frameEl = phoneFrameRef.current;
    if (!el || !frameEl) return null;
    const fRect = frameEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (fRect.width <= 0 || fRect.height <= 0 || elRect.width <= 0 || elRect.height <= 0) {
      return null;
    }
    const radius = parseFloat(window.getComputedStyle(el).borderTopLeftRadius);
    return {
      top: elRect.top - (fRect.top + frameEl.clientTop),
      left: elRect.left - (fRect.left + frameEl.clientLeft),
      width: elRect.width,
      height: elRect.height,
      borderRadius: Number.isFinite(radius) ? radius : fallbackRadius,
    };
  }, []);

  // Measure live rect of cardThumbnail inside phoneFrame at this exact instant
  const getLiveThumbnailRect = useCallback((): MediaFrameRect | null => {
    return toFrameLocalRect(cardThumbnailRef.current, 12);
  }, [toFrameLocalRect]);

  // Measure settled (y = 0) rect of detailMediaHeroRef inside phoneFrame, canceling drawer slide transform
  const measureSettledDetailHeroRect = useCallback((): MediaFrameRect | null => {
    const frameEl = phoneFrameRef.current;
    const sheetEl = detailSheetRef.current;
    const heroEl = detailMediaHeroRef.current;
    if (!frameEl || !sheetEl || !heroEl) return null;

    const heroRect = heroEl.getBoundingClientRect();
    const sheetRect = sheetEl.getBoundingClientRect();
    if (heroRect.width <= 0 || heroRect.height <= 0 || sheetRect.height <= 0) {
      return null;
    }

    const settledSheetTop = frameEl.clientHeight - sheetRect.height;
    const settledSheetLeft = sheetEl.offsetLeft;
    const radius = parseFloat(window.getComputedStyle(heroEl).borderTopLeftRadius);

    return {
      top: settledSheetTop + (heroRect.top - sheetRect.top),
      left: settledSheetLeft + (heroRect.left - sheetRect.left),
      width: heroRect.width,
      height: heroRect.height,
      borderRadius: Number.isFinite(radius) ? radius : 22,
    };
  }, []);

  // Update frame dimensions and bottom bar whenever phoneFrameRef or bottomBarRef resizes
  useEffect(() => {
    const frameEl = phoneFrameRef.current;
    if (!frameEl) return;
    const updateSize = () => {
      const rect = frameEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setFrameSize({ width: rect.width, height: rect.height });
        if (homeAvatarRef.current) {
          const hRect = homeAvatarRef.current.getBoundingClientRect();
          if (hRect.width > 0 && hRect.height > 0) {
            setIsHomeLayoutReady(true);
          }
        }
      }
      if (bottomBarRef.current) {
        const bHeight = bottomBarRef.current.offsetHeight;
        if (bHeight > 0) {
          setBottomBarHeight(bHeight);
        }
      }
      const liveHome = getLiveHomeAvatarRect();
      if (liveHome && liveHome.width > 0 && liveHome.height > 0) {
        setHomeAvatarRect(liveHome);
      }
    };
    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(frameEl);
    if (bottomBarRef.current) {
      ro.observe(bottomBarRef.current);
    }
    if (homeAvatarRef.current) {
      ro.observe(homeAvatarRef.current);
    }
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [activeTab, getLiveHomeAvatarRect]);

  // Synchronize home avatar position on frameSize or tab changes
  useEffect(() => {
    if (activeTab !== 'Today') return;
    const updateHome = () => {
      const rect = getLiveHomeAvatarRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setHomeAvatarRect(rect);
        if (phoneFrameRef.current && homeAvatarRef.current) {
          const fRect = phoneFrameRef.current.getBoundingClientRect();
          const hRect = homeAvatarRef.current.getBoundingClientRect();
          if (fRect.width > 0 && fRect.height > 0 && hRect.width > 0 && hRect.height > 0) {
            setIsHomeLayoutReady(true);
          }
        }
      }
    };
    updateHome();
    const timer = setTimeout(updateHome, 60);
    return () => clearTimeout(timer);
  }, [frameSize, activeTab, getLiveHomeAvatarRect]);

  // App-level first-entrance animation & typewriter state for Today Nova bubble (plays once per app launch)
  const bubbleEntranceRef = useRef<HTMLDivElement>(null);
  const hasFinishedInitialBubbleEntranceRef = useRef<boolean>(
    typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
  const isEntranceRunningRef = useRef<boolean>(false);
  const activeEntranceRunIdRef = useRef<number>(0);
  const bubbleEntranceStartRafRef = useRef<number | null>(null);
  const bubbleEntranceFinishTimerRef = useRef<number | null>(null);
  const bubbleTypewriterStartDelayTimerRef = useRef<number | null>(null);
  const bubbleTypewriterRafRef = useRef<number | null>(null);
  const bubbleTypewriterSafetyTimerRef = useRef<number | null>(null);
  const bubbleTypewriterTargetTextRef = useRef<string>('');
  const bubbleAutoRotatePausedUntilRef = useRef<number>(0);
  const [bubbleEntrancePhase, setBubbleEntrancePhase] = useState<'waiting' | 'entering' | 'done'>(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return 'done';
    }
    return 'waiting';
  });
  const [isBubbleTypewriterActive, setIsBubbleTypewriterActive] = useState<boolean>(false);
  const [bubbleTypedChars, setBubbleTypedChars] = useState<number>(0);

  const clearInitialBubbleEntranceTimers = useCallback(() => {
    if (bubbleEntranceStartRafRef.current !== null) {
      cancelAnimationFrame(bubbleEntranceStartRafRef.current);
      bubbleEntranceStartRafRef.current = null;
    }
    if (bubbleEntranceFinishTimerRef.current !== null) {
      window.clearTimeout(bubbleEntranceFinishTimerRef.current);
      bubbleEntranceFinishTimerRef.current = null;
    }
    if (bubbleTypewriterStartDelayTimerRef.current !== null) {
      window.clearTimeout(bubbleTypewriterStartDelayTimerRef.current);
      bubbleTypewriterStartDelayTimerRef.current = null;
    }
    if (bubbleTypewriterRafRef.current !== null) {
      cancelAnimationFrame(bubbleTypewriterRafRef.current);
      bubbleTypewriterRafRef.current = null;
    }
    if (bubbleTypewriterSafetyTimerRef.current !== null) {
      window.clearTimeout(bubbleTypewriterSafetyTimerRef.current);
      bubbleTypewriterSafetyTimerRef.current = null;
    }
  }, []);

  const finishInitialBubbleEntranceImmediately = useCallback(() => {
    activeEntranceRunIdRef.current += 1;
    clearInitialBubbleEntranceTimers();
    isEntranceRunningRef.current = false;
    hasFinishedInitialBubbleEntranceRef.current = true;
    bubbleTypewriterTargetTextRef.current = '';
    setIsBubbleTypewriterActive(false);
    setBubbleTypedChars(0);
    setBubbleEntrancePhase('done');
  }, [clearInitialBubbleEntranceTimers]);

  // StrictMode-safe unmount cleanup for any running entrance RAF/timers
  useEffect(() => {
    return () => {
      activeEntranceRunIdRef.current += 1;
      clearInitialBubbleEntranceTimers();
      isEntranceRunningRef.current = false;
    };
  }, [clearInitialBubbleEntranceTimers]);

  const isAvatarDisplayed = avatarMode === '2d' || isAvatarFirstFrameReady;
  const isBubbleShownOnToday = isRestDay || !hasAnyAcceptedOrCompleted;

  // Trigger bubble pop-in & typewriter strictly once on first Today launch when layout + Avatar are ready
  useEffect(() => {
    if (shouldReduceMotion) {
      if (bubbleEntrancePhase !== 'done' || isBubbleTypewriterActive) {
        finishInitialBubbleEntranceImmediately();
      }
      return;
    }
    if (hasFinishedInitialBubbleEntranceRef.current || isEntranceRunningRef.current) {
      return;
    }
    if (activeTab !== 'Today' || isPlanCardOpen || isChatOpen || !isHomeLayoutReady || !isAvatarDisplayed) {
      return;
    }
    if (!isBubbleShownOnToday) {
      // Today opened directly onto "Today with Nova" board; mark first entrance consumed without injecting a bubble
      finishInitialBubbleEntranceImmediately();
      return;
    }

    isEntranceRunningRef.current = true;
    const runId = ++activeEntranceRunIdRef.current;
    const targetText = fullBubbleText;
    const totalChars = targetText.length;
    const typewriterDuration = Math.min(1600, Math.max(600, totalChars * 25));
    bubbleTypewriterTargetTextRef.current = targetText;
    setIsBubbleTypewriterActive(true);
    setBubbleTypedChars(0);

    bubbleEntranceStartRafRef.current = requestAnimationFrame(() => {
      bubbleEntranceStartRafRef.current = null;
      if (activeEntranceRunIdRef.current !== runId) return;

      // Flush initial (opacity: 0, translateY(-5px), scale(0.94)) state before starting CSS pop-in
      if (bubbleEntranceRef.current) {
        void bubbleEntranceRef.current.offsetHeight;
      }

      const popInStartNow = performance.now();
      bubbleAutoRotatePausedUntilRef.current = popInStartNow + 100 + typewriterDuration + 4000;
      setBubbleEntrancePhase('entering');

      bubbleEntranceFinishTimerRef.current = window.setTimeout(() => {
        bubbleEntranceFinishTimerRef.current = null;
        if (activeEntranceRunIdRef.current !== runId) return;
        setBubbleEntrancePhase('done');
      }, 270);

      bubbleTypewriterStartDelayTimerRef.current = window.setTimeout(() => {
        bubbleTypewriterStartDelayTimerRef.current = null;
        if (activeEntranceRunIdRef.current !== runId) return;

        const typeStartTime = performance.now();
        bubbleAutoRotatePausedUntilRef.current = typeStartTime + typewriterDuration + 4000;

        const finalizeTypewriter = () => {
          if (activeEntranceRunIdRef.current !== runId) return;
          if (bubbleTypewriterRafRef.current !== null) {
            cancelAnimationFrame(bubbleTypewriterRafRef.current);
            bubbleTypewriterRafRef.current = null;
          }
          if (bubbleTypewriterSafetyTimerRef.current !== null) {
            window.clearTimeout(bubbleTypewriterSafetyTimerRef.current);
            bubbleTypewriterSafetyTimerRef.current = null;
          }
          bubbleAutoRotatePausedUntilRef.current = performance.now() + 4000;
          hasFinishedInitialBubbleEntranceRef.current = true;
          isEntranceRunningRef.current = false;
          bubbleTypewriterTargetTextRef.current = '';
          setIsBubbleTypewriterActive(false);
          setBubbleEntrancePhase('done');
        };

        bubbleTypewriterSafetyTimerRef.current = window.setTimeout(
          finalizeTypewriter,
          typewriterDuration + 120
        );

        const stepTypewriter = (now: number) => {
          if (activeEntranceRunIdRef.current !== runId) {
            bubbleTypewriterRafRef.current = null;
            return;
          }
          const elapsed = Math.max(0, now - typeStartTime);
          const nextCount =
            elapsed >= typewriterDuration || totalChars === 0
              ? totalChars
              : Math.min(totalChars, Math.floor((elapsed / typewriterDuration) * totalChars));
          setBubbleTypedChars((prev) => (prev === nextCount ? prev : nextCount));

          if (elapsed < typewriterDuration && nextCount < totalChars) {
            bubbleTypewriterRafRef.current = requestAnimationFrame(stepTypewriter);
          } else {
            finalizeTypewriter();
          }
        };

        bubbleTypewriterRafRef.current = requestAnimationFrame(stepTypewriter);
      }, 100);
    });
  }, [
    shouldReduceMotion,
    activeTab,
    isPlanCardOpen,
    isChatOpen,
    isHomeLayoutReady,
    isAvatarDisplayed,
    isBubbleShownOnToday,
    fullBubbleText,
    bubbleEntrancePhase,
    isBubbleTypewriterActive,
    finishInitialBubbleEntranceImmediately,
  ]);

  // Cancel initial entrance & snap to final copy on tab switch, card open, chat open, or state copy change mid-typing
  useEffect(() => {
    const isActiveOrPending =
      isEntranceRunningRef.current || isBubbleTypewriterActive || bubbleEntrancePhase === 'entering';
    const leftBubbleView = activeTab !== 'Today' || isPlanCardOpen || isChatOpen || !isBubbleShownOnToday;
    const textChangedMidTyping =
      isActiveOrPending &&
      bubbleTypewriterTargetTextRef.current !== '' &&
      bubbleTypewriterTargetTextRef.current !== fullBubbleText;

    if ((isActiveOrPending && leftBubbleView) || textChangedMidTyping) {
      finishInitialBubbleEntranceImmediately();
    }
  }, [
    activeTab,
    isPlanCardOpen,
    isChatOpen,
    isBubbleShownOnToday,
    fullBubbleText,
    isBubbleTypewriterActive,
    bubbleEntrancePhase,
    finishInitialBubbleEntranceImmediately,
  ]);

  // Dynamically observe chatSheet height when open or resizing
  useEffect(() => {
    const sheetEl = chatSheetRef.current;
    if (!sheetEl) return;
    const updateSheet = () => {
      if (sheetEl.clientHeight > 0) {
        setSheetMeasuredHeight(sheetEl.clientHeight);
      }
    };
    updateSheet();
    const ro = new ResizeObserver(() => updateSheet());
    ro.observe(sheetEl);
    return () => ro.disconnect();
  }, [isChatOpen]);

  // Pre-paint DOM measurement for settled detail hero target rect while opening
  useLayoutEffect(() => {
    if (!isDetailOpen || detailTransitionPhase !== 'opening') return;

    const scrollEl = detailScrollBodyRef.current;
    if (scrollEl && scrollEl.scrollTop !== 0) {
      scrollEl.scrollTop = 0;
    }

    const isSameRect = (a: MediaFrameRect | null, b: MediaFrameRect | null) => {
      if (a === b) return true;
      if (!a || !b) return false;
      return (
        Math.abs(a.top - b.top) <= 0.25 &&
        Math.abs(a.left - b.left) <= 0.25 &&
        Math.abs(a.width - b.width) <= 0.25 &&
        Math.abs(a.height - b.height) <= 0.25 &&
        Math.abs(a.borderRadius - b.borderRadius) <= 0.25
      );
    };

    const syncTarget = () => {
      const measured = measureSettledDetailHeroRect();
      if (!measured) return;
      setDetailTargetRect((prev) => (isSameRect(prev, measured) ? prev : measured));
    };

    syncTarget();

    const ro = new ResizeObserver(() => {
      syncTarget();
    });
    if (detailSheetRef.current) ro.observe(detailSheetRef.current);
    if (detailHeaderRef.current) ro.observe(detailHeaderRef.current);
    if (detailMediaHeroRef.current) ro.observe(detailMediaHeroRef.current);

    return () => ro.disconnect();
  }, [isDetailOpen, detailTransitionPhase, currentPlan.id, frameSize, measureSettledDetailHeroRect]);

  // Dynamically observe planCard content height to animate height smoothly downward
  useEffect(() => {
    const el = cardContentRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.offsetHeight > 0) {
        setCardContentHeight(el.offsetHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(() => updateHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [planState, currentPlan, isPlanCardOpen]);

  // Dynamically observe companion bubble/board content height for 240ms ease-in-out transition
  useEffect(() => {
    const el = companionContentRef.current;
    if (!el) return;
    const updateCompanionHeight = () => {
      if (el.offsetHeight > 0) {
        setCompanionGroupHeight(el.offsetHeight);
      }
    };
    updateCompanionHeight();
    const ro = new ResizeObserver(() => updateCompanionHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasAnyAcceptedOrCompleted, isRestDay, allCardsSkipped, bubbleCardIndex, cardsState, frameSize]);

  // Target coordinates for Nova docked at top edge of chat sheet
  const drawerAvatarSize = frameSize.height < 700 ? 112 : 124;
  const drawerWidth = drawerAvatarSize;
  const drawerHeight = drawerAvatarSize;
  const drawerLeft = (frameSize.width - drawerWidth) / 2;
  const effectiveSheetHeight = sheetMeasuredHeight > 0
    ? sheetMeasuredHeight
    : Math.min(frameSize.height * 0.74, 580);
  const sheetTop = frameSize.height - effectiveSheetHeight;
  // Nova peeks naturally over the rounded drawer edge: ~52% above, lower body resting inside the pt-14 header space
  const drawerTop = sheetTop - drawerAvatarSize * 0.52;

  const cancelPendingAndActiveCardUpdate = useCallback(() => {
    cardWipeCancelledRef.current = true;
    if (cardWipeDelayTimerRef.current !== null) {
      window.clearTimeout(cardWipeDelayTimerRef.current);
      cardWipeDelayTimerRef.current = null;
    }
    expectedCardIdDuringWipeRef.current = null;
    expectedVirtualIdxDuringWipeRef.current = null;
    pendingPlanUpdateRef.current = null;
    setPendingPlanUpdate(null);
    setActiveCardWipeAnim(null);
  }, []);

  const cancelHoldImmediate = useCallback(() => {
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (fallTimerRef.current) {
      cancelAnimationFrame(fallTimerRef.current);
      fallTimerRef.current = null;
    }
    isHoldingRef.current = false;
    hasCompletedRef.current = false;
    holdStartRef.current = 0;
    holdProgressRef.current = 0;
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const handleExitRestDay = useCallback(() => {
    setIsRestDay(false);
    const restIdToRemove = todayRestRecordIdRef.current;
    todayRestRecordIdRef.current = null;
    if (restIdToRemove) {
      updatePlanStore((prev) => removeLifecycleEvent(prev, restIdToRemove));
    }
  }, [updatePlanStore]);

  const handleResumeSkippedCard = useCallback((cardId: string) => {
    setCardSkipped(cardId, false);
  }, [setCardSkipped]);

  const centerCarouselOnCardIdx = useCallback((targetIdx: number) => {
    isProgrammaticCenteringRef.current = true;
    setActiveVirtualIndex((prev) => {
      const currentMod = ((prev % 3) + 3) % 3;
      let diff = targetIdx - currentMod;
      if (diff > 1) diff -= 3;
      if (diff < -1) diff += 3;
      const nextVal = prev + diff;
      expectedVirtualIdxDuringWipeRef.current = nextVal;
      return nextVal;
    });
    setIsPlanCardOpen(true);
    window.setTimeout(() => {
      isProgrammaticCenteringRef.current = false;
    }, 0);
  }, []);

  // Open & Close triggers for Continuous Detail Transition
  const openDetailWithTransition = useCallback(() => {
    cancelPendingAndActiveCardUpdate();
    const thumbRect = getLiveThumbnailRect();
    let startRect = thumbRect;

    // If re-opening mid-flight during closing, continue from current floating visual rect
    if (detailTransitionPhase === 'closing' && floatingMediaRef.current) {
      const midFlightRect = toFrameLocalRect(floatingMediaRef.current, 16);
      if (midFlightRect) {
        startRect = midFlightRect;
      }
    }

    if (!thumbRect || !startRect) {
      setIsDetailOpen(true);
      setDetailTransitionPhase('open');
      return;
    }

    const nextRunId = transitionRunIdRef.current + 1;
    transitionRunIdRef.current = nextRunId;
    setDetailTransitionRunId(nextRunId);
    setDetailThumbRect(thumbRect);
    setDetailFloatingStartRect(startRect);
    setDetailTargetRect(null);
    setIsDetailOpen(true);
    setDetailTransitionPhase('opening');
  }, [cancelPendingAndActiveCardUpdate, getLiveThumbnailRect, toFrameLocalRect, detailTransitionPhase]);

  const closeDetailWithTransition = useCallback(() => {
    const thumbRect = getLiveThumbnailRect();
    let startRect: MediaFrameRect | null = null;

    if (detailTransitionPhase === 'opening' && floatingMediaRef.current) {
      // Mid-flight during opening: capture current live floating position
      startRect = toFrameLocalRect(floatingMediaRef.current, 16);
    }
    if (!startRect) {
      // Open (possibly scrolled): capture actual current visual rect of detailMediaHeroRef
      startRect = toFrameLocalRect(detailMediaHeroRef.current, 22) ?? detailTargetRect;
    }

    const nextRunId = transitionRunIdRef.current + 1;
    transitionRunIdRef.current = nextRunId;
    setDetailTransitionRunId(nextRunId);

    if (!thumbRect || !startRect) {
      setIsDetailOpen(false);
      setDetailTransitionPhase('idle');
      setDetailThumbRect(null);
      setDetailFloatingStartRect(null);
      setDetailTargetRect(null);
      return;
    }

    setDetailThumbRect(thumbRect);
    setDetailFloatingStartRect(startRect);
    setIsDetailOpen(false);
    setDetailTransitionPhase('closing');
  }, [getLiveThumbnailRect, toFrameLocalRect, detailTransitionPhase, detailTargetRect]);

  // Handle escape key to close detail modal or expanded suggestion card
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDetailOpen) {
          closeDetailWithTransition();
        } else if (!isChatOpen && isPlanCardOpen) {
          setIsPlanCardOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDetailOpen, isChatOpen, isPlanCardOpen, closeDetailWithTransition]);

  // Coordinated Transition Open / Close triggers
  const openChatWithTransition = useCallback((chatSetup?: () => void) => {
    cancelPendingAndActiveCardUpdate();
    setActivePlanChat(null);
    setPlanChatTextEvent(null);
    lastPlanUserMessageRef.current = '';
    const liveRect = getLiveHomeAvatarRect();
    if (liveRect && liveRect.width > 0) {
      setHomeAvatarRect(liveRect);
    }
    if (chatSetup) chatSetup();
    setIsChatSheetExited(false);
    setIsChatOpen(true);
    setTransitionPhase('opening');
  }, [cancelPendingAndActiveCardUpdate, getLiveHomeAvatarRect]);

  const openPlanNovaChat = useCallback((request: PlanNovaChatRequest) => {
    adjustSessionRef.current = null;
    setActivePlanChat(request);
    setPlanChatTextEvent(null);
    lastPlanUserMessageRef.current = '';
    setSheetInput('');
    setInputPlaceholder(request.inputPlaceholder || 'Type to update draft…');
    isNearBottomRef.current = true;
    setChatMessages([
      {
        id: `plan-intro-${request.id}`,
        sender: 'ai',
        text: request.introMessage,
      },
    ]);
    setIsChatSheetExited(false);
    setIsChatOpen(true);
    setTransitionPhase('opening');
  }, []);

  const handleAppendPlanNovaNotice = useCallback((text: string) => {
    isNearBottomRef.current = true;
    setChatMessages((prev) => [
      ...prev,
      {
        id: `plan-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'ai',
        text,
      },
    ]);
  }, []);

  const closeChatWithTransition = useCallback(() => {
    const liveRect = getLiveHomeAvatarRect();
    if (liveRect && liveRect.width > 0) {
      setHomeAvatarRect(liveRect);
    }
    setIsChatOpen(false);
    setActivePlanChat(null);
    setPlanChatTextEvent(null);
    lastPlanUserMessageRef.current = '';
    setTransitionPhase('closing');
    setIsTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [getLiveHomeAvatarRect]);

  // Monitor user scrolling: if user scrolls up, do not force scroll down on new messages
  const handleChatScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom < 80;
  }, []);

  // Auto-scroll chat to latest message only if user is already near bottom
  useEffect(() => {
    if (!isChatOpen) return;
    if (isNearBottomRef.current) {
      const timer = setTimeout(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [chatMessages, isChatOpen]);

  // Adjust scroll when virtual keyboard / visualViewport shifts
  useEffect(() => {
    if (!isChatOpen || typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportChange = () => {
      if (isNearBottomRef.current) {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    };
    window.visualViewport.addEventListener('resize', handleViewportChange);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
    };
  }, [isChatOpen]);

  // 1. Initial State Handlers
  // "Sounds good" directly accepts current recommendation into "YOUR PLAN"
  const handleSoundsGood = (targetCardIdx?: number) => {
    const idx = typeof targetCardIdx === 'number' ? targetCardIdx : activeCardIndexRef.current;
    hasCompletedRef.current = false;
    isHoldingRef.current = false;
    holdProgressRef.current = 0;
    setPlanState('accepted', idx);
    setHoldProgress(0);
  };

  // Click "Plan B" on initial suggestion: Opens chat with proactive alternative
  const handleInitialPlanB = (targetCardIdx?: number) => {
    const idx = typeof targetCardIdx === 'number' ? targetCardIdx : activeCardIndexRef.current;
    chatTargetCardIdxRef.current = idx;
    const targetCard = cardsState[idx];
    const targetPlan = targetCard?.plan || currentPlan;
    const alternative = targetPlan.id === 'walk' ? STRETCH_PLAN : BREATH_RESET_PLAN;
    const alternativeText = targetPlan.id === 'walk'
      ? 'How about a 5-minute stretch at home instead?'
      : 'How about a 3-minute seated breath reset instead?';

    openChatWithTransition(() => {
      if (targetCard) {
        adjustSessionRef.current = {
          cardId: targetCard.id,
          initialOldPlan: targetPlan,
        };
      }
      setShowPlanBHint(false, idx);
      setInputPlaceholder('Tell Nova what changed…');
      isNearBottomRef.current = true;
      setChatMessages([
        {
          id: 'msg-init-alt',
          sender: 'ai',
          text: alternativeText,
          options: [
            {
              label: 'Sounds good',
              action: 'accept',
              targetPlan: alternative
            },
            {
              label: 'Show me another option',
              action: 'show_another'
            },
            {
              label: 'Tell Nova what changed',
              action: 'focus_input'
            }
          ]
        }
      ]);
    });
  };

  // 2. Accepted State Handlers
  // Click "Plan B" on already accepted plan: Proactively offers alternative while keeping current plan until accepted
  const handleAcceptedPlanB = (targetCardIdx?: number) => {
    const idx = typeof targetCardIdx === 'number' ? targetCardIdx : activeCardIndexRef.current;
    chatTargetCardIdxRef.current = idx;
    const targetCard = cardsState[idx];
    const targetPlan = targetCard?.plan || currentPlan;

    openChatWithTransition(() => {
      if (targetCard) {
        adjustSessionRef.current = {
          cardId: targetCard.id,
          initialOldPlan: targetPlan,
        };
      }
      setInputPlaceholder('Tell Nova what changed…');
      isNearBottomRef.current = true;
      const alternative = targetPlan.id === 'walk'
        ? STRETCH_PLAN
        : targetPlan.id === 'stretch'
        ? BREATH_RESET_PLAN
        : TOMORROW_WALK_PLAN;
      const alternativeText = targetPlan.id === 'walk'
        ? 'How about a 5-minute stretch at home instead?'
        : targetPlan.id === 'stretch'
        ? 'How about a 3-minute seated breath reset instead?'
        : 'Would moving your walk to tomorrow work better?';

      setChatMessages([
        {
          id: 'msg-accepted-alt',
          sender: 'ai',
          text: alternativeText,
          options: [
            {
              label: 'Sounds good',
              action: 'accept',
              targetPlan: alternative
            },
            {
              label: 'Show me another option',
              action: 'show_another'
            },
            {
              label: 'Tell Nova what changed',
              action: 'focus_input'
            }
          ]
        }
      ]);
    });
  };

  // "Not today" on accepted plan: opens dialogue without auto-modifying or triggering global rest
  const handleNotToday = (targetCardIdx?: number) => {
    const idx = typeof targetCardIdx === 'number' ? targetCardIdx : activeCardIndexRef.current;
    chatTargetCardIdxRef.current = idx;

    openChatWithTransition(() => {
      adjustSessionRef.current = null;
      setInputPlaceholder('Tell Nova what changed…');
      isNearBottomRef.current = true;
      setChatMessages([
        {
          id: 'msg-not-today',
          sender: 'ai',
          text: 'Totally fine! Rest days are just as healthy. Shall we skip just this task, or take today off and reset tomorrow?',
          options: [
            {
              label: 'Skip just this task',
              action: 'skip_task'
            },
            {
              label: 'Sounds good (Take today off)',
              action: 'accept',
              targetPlan: REST_DAY_PLAN
            },
            {
              label: 'Keep plan for now',
              action: 'keep_plan'
            },
            {
              label: 'Tell Nova what changed',
              action: 'focus_input'
            }
          ]
        }
      ]);
    });
  };

  // 3. Option Action Handler inside chat
  const handleOptionClick = (option: ChatActionOption, messageId?: string) => {
    isNearBottomRef.current = true;
    if (option.action === 'accept' && option.targetPlan) {
      // Explicit "Take today off" enters global Today rest mode without modifying underlying tasks
      if (option.targetPlan.id === 'rest') {
        cancelHoldImmediate();
        adjustSessionRef.current = null;
        cancelPendingAndActiveCardUpdate();
        setIsRestDay(true);
        const todayKey = toLocalDateKey(new Date());
        const todayRestLegacyId = `rest::today::${todayKey}`;
        todayRestRecordIdRef.current = todayRestLegacyId;
        updatePlanStore((prev) => {
          const { store } = recordLifecycleEvent(prev, {
            type: 'rest',
            dateKey: todayKey,
            source: 'today',
            title: 'Rest day',
            note: 'Chosen on Today',
            legacyRestRecordId: todayRestLegacyId,
          });
          return store;
        });

        const now = Date.now();
        setChatMessages((prev) => [
          ...prev.map((m) =>
            m.id === messageId
              ? { ...m, disabled: true, selectedOptionLabel: option.label }
              : { ...m, disabled: true }
          ),
          {
            id: `usr-${now}`,
            sender: 'user',
            text: 'Sounds good.'
          },
          {
            id: `ai-${now + 1}`,
            sender: 'ai',
            text: 'Sounds good. I’ve updated today to a rest day.'
          }
        ]);
        return;
      }

      // User accepts alternative: update target card's plan in background, switch to accepted state, keep drawer open
      const targetIdx = chatTargetCardIdxRef.current ?? activeCardIndexRef.current;
      const targetCard = cardsState[targetIdx];
      cancelHoldImmediate();
      setCurrentPlan(option.targetPlan, targetIdx);
      setPlanState('accepted', targetIdx);

      // Keep logical task identity synchronized if this card already had a completion record
      if (targetCard && targetCard.plan.id !== option.targetPlan.id) {
        const nextCat =
          option.targetPlan.activityCategory ??
          inferActivityCategory(option.targetPlan.id, option.targetPlan.title);
        const nextExerciseType = mapActivityCategoryToExerciseType(nextCat, option.targetPlan.id);
        const nextPlannedDur =
          typeof option.targetPlan.durationMinutes === 'number'
            ? option.targetPlan.durationMinutes
            : inferDurationMinutes(option.targetPlan.title);
        updatePlanStore((prev) =>
          recordAlternativePlanReplacement(prev, {
            logicalTaskId: targetCard.taskInstanceId,
            previousPlanId: targetCard.plan.id,
            nextPlanId: option.targetPlan!.id,
            nextTitle: option.targetPlan!.title,
            nextExerciseSegments: [
              {
                exerciseType: nextExerciseType,
                title: option.targetPlan!.title,
                plannedDurationMinutes: nextPlannedDur,
                actualDurationMinutes: null,
                durationTrust: 'unknown',
                linkedHabitId: null,
              },
            ],
          })
        );
      }

      const activeAdjust = adjustSessionRef.current;
      if (targetCard && activeAdjust && activeAdjust.cardId === targetCard.id) {
        if (option.targetPlan.id !== activeAdjust.initialOldPlan.id) {
          const nextPending = {
            cardId: targetCard.id,
            oldPlan: activeAdjust.initialOldPlan,
            newPlan: option.targetPlan,
          };
          pendingPlanUpdateRef.current = nextPending;
          setPendingPlanUpdate(nextPending);
          preloadPlanThumbnail(option.targetPlan.thumbnailUrl);
        } else {
          pendingPlanUpdateRef.current = null;
          setPendingPlanUpdate(null);
        }
      }

      // Determine Nova confirmation copy matching the accepted alternative
      let replyText = 'Sounds good. I’ve added the 5-minute stretch to your plan.';
      if (option.targetPlan.id === 'tomorrow' || option.targetPlan.id === 'tomorrow_walk') {
        replyText = 'Sounds good. I’ve moved your walk to tomorrow.';
      } else if (option.targetPlan.id === 'stretch') {
        replyText = 'Sounds good. I’ve added the 5-minute stretch to your plan.';
      } else if (option.targetPlan.id === 'breath') {
        replyText = 'Sounds good. I’ve updated your plan to the 3-minute seated breath reset.';
      } else {
        replyText = `Sounds good. I’ve updated your plan to ${option.targetPlan.title.toLowerCase()}.`;
      }

      const now = Date.now();
      setChatMessages((prev) => [
        ...prev.map((m) =>
          m.id === messageId
            ? { ...m, disabled: true, selectedOptionLabel: option.label }
            : { ...m, disabled: true }
        ),
        {
          id: `usr-${now}`,
          sender: 'user',
          text: 'Sounds good.'
        },
        {
          id: `ai-${now + 1}`,
          sender: 'ai',
          text: replyText
        }
      ]);
      // Chat drawer remains OPEN so user can continue chatting; no setIsChatOpen(false)
    } else if (option.action === 'skip_task') {
      // Single-task Not today: skip only the targeted card while preserving its content, order & pre-skip state
      const targetIdx = chatTargetCardIdxRef.current ?? activeCardIndexRef.current;
      const targetCard = cardsState[targetIdx];
      cancelHoldImmediate();
      if (targetCard) {
        setCardSkipped(targetCard.id, true);
        if (pendingPlanUpdateRef.current?.cardId === targetCard.id) {
          cancelPendingAndActiveCardUpdate();
        }
      }
      const now = Date.now();
      setChatMessages((prev) => [
        ...prev.map((m) =>
          m.id === messageId
            ? { ...m, disabled: true, selectedOptionLabel: option.label }
            : { ...m, disabled: true }
        ),
        {
          id: `usr-${now}`,
          sender: 'user',
          text: 'Skip just this task.'
        },
        {
          id: `ai-${now + 1}`,
          sender: 'ai',
          text: 'Got it. I’ve paused just that task for today—your other plans stay as they are.'
        }
      ]);
    } else if (option.action === 'show_another') {
      // Show next alternative option: disable prior cards, record user's choice
      setChatMessages((prev) => {
        const disabledPrev = prev.map((m) =>
          m.id === messageId
            ? { ...m, disabled: true, selectedOptionLabel: option.label }
            : { ...m, disabled: true }
        );
        const hasTomorrowWalk = prev.some((m) =>
          m.options?.some((o) => o.targetPlan?.id === 'tomorrow' || o.targetPlan?.id === 'tomorrow_walk')
        );

        const nextAiMsg: ChatMessage = !hasTomorrowWalk
          ? {
              id: `ai-${Date.now() + 1}`,
              sender: 'ai',
              text: 'Would moving your walk to tomorrow work better?',
              options: [
                {
                  label: 'Sounds good',
                  action: 'accept',
                  targetPlan: TOMORROW_WALK_PLAN
                },
                {
                  label: 'Show me another option',
                  action: 'show_another'
                },
                {
                  label: 'Tell Nova what changed',
                  action: 'focus_input'
                }
              ]
            }
          : {
              id: `ai-${Date.now() + 1}`,
              sender: 'ai',
              text: 'How about taking today as a gentle rest day? No pressure at all—we can reset tomorrow.',
              options: [
                {
                  label: 'Sounds good (Take today off)',
                  action: 'accept',
                  targetPlan: REST_DAY_PLAN
                },
                {
                  label: 'Tell Nova what changed',
                  action: 'focus_input'
                }
              ]
            };

        return [
          ...disabledPrev,
          {
            id: `usr-${Date.now()}`,
            sender: 'user',
            text: 'Show me another option'
          },
          nextAiMsg
        ];
      });
    } else if (option.action === 'focus_input') {
      // Keep conversation open, disable option card, Nova replies with pure prompt, focus input
      setInputPlaceholder('Tell Nova what changed…');
      isNearBottomRef.current = true;
      const now = Date.now();
      setChatMessages((prev) => [
        ...prev.map((m) =>
          m.id === messageId
            ? { ...m, disabled: true, selectedOptionLabel: option.label }
            : { ...m, disabled: true }
        ),
        {
          id: `usr-${now}`,
          sender: 'user',
          text: 'Tell Nova what changed'
        },
        {
          id: `ai-${now + 1}`,
          sender: 'ai',
          text: 'Of course. What changed for you today?'
        }
      ]);
      setTimeout(() => {
        chatInputRef.current?.focus();
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 120);
    } else if (option.action === 'keep_plan') {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, disabled: true, selectedOptionLabel: option.label }
            : m
        )
      );
      closeChatWithTransition();
    }
  };

  // Handle typing input and reset typing state timer
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSheetInput(val);
    if (val.trim().length > 0) {
      setIsTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 2400);
    } else {
      setIsTyping(false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }
  };

  // Revoke any staged attachment preview object URLs on unmount
  useEffect(() => {
    return () => {
      chatAttachmentsRef.current.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, []);

  // Keep latest message visible when attachment preview changes scroll area height
  useEffect(() => {
    if (!isChatOpen || !isNearBottomRef.current) return;
    const id = window.requestAnimationFrame(() => {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [chatAttachments.length, isChatOpen]);

  const openGeneralNovaChat = useCallback(() => {
    openChatWithTransition(() => {
      adjustSessionRef.current = null;
      setInputPlaceholder('Type your response…');
      setChatMessages([
        {
          id: 'msg-open-input',
          sender: 'ai',
          text: "Hi! How's your day shaping up? Tell me whatever is on your mind."
        }
      ]);
    });
  }, [openChatWithTransition]);

  const isSharedBottomNavHidden =
    isChatOpen ||
    isDetailOpen ||
    isSavedSheetOpen ||
    (activeTab === 'Plan' && isPlanOverlayOpen);

  const handleAttachmentButtonClick = (source: 'home' | 'drawer') => {
    attachmentSourceRef.current = source;
    chatFileInputRef.current?.click();
  };

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const source = attachmentSourceRef.current;
    attachmentSourceRef.current = 'drawer';

    if (!fileList || fileList.length === 0) {
      e.target.value = '';
      return;
    }

    const added: PendingChatAttachment[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList[i];
      const lowerName = file.name.toLowerCase();
      const isImage =
        file.type.startsWith('image/') ||
        /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/.test(lowerName);
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
      const isText = file.type === 'text/plain' || lowerName.endsWith('.txt');

      if (!isImage && !isPdf && !isText) continue;

      added.push({
        id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        kind: isImage ? 'image' : isPdf ? 'pdf' : 'text',
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      });
    }

    e.target.value = '';

    if (added.length > 0) {
      setChatAttachments((prev) => [...prev, ...added]);
      if (source === 'home' && !isChatOpen) {
        openGeneralNovaChat();
      }
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setChatAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  };

  // 4. Send freeform chat message
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;
    const text = sheetInput.trim();
    setSheetInput('');
    setIsTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    isNearBottomRef.current = true;

    if (activePlanChat) {
      // Prevent duplicate submission of identical unconfirmed user text
      if (lastPlanUserMessageRef.current === text) return;
      lastPlanUserMessageRef.current = text;
      setChatMessages((prev) => [
        ...prev,
        {
          id: `plan-usr-${Date.now()}`,
          sender: 'user',
          text,
        },
      ]);
      setPlanChatTextEvent((prev) => ({ seq: (prev?.seq ?? 0) + 1, text }));
      return;
    }

    setChatMessages((prev) => [
      ...prev.map((m) => ({ ...m, disabled: true })),
      {
        id: `usr-${Date.now()}`,
        sender: 'user',
        text
      },
      {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: "Got it! Listening to your body is what matters most. How about a 5-minute breather or taking today off?",
        options: [
          {
            label: 'Sounds good (5-min stretch)',
            action: 'accept',
            targetPlan: STRETCH_PLAN
          },
          {
            label: 'Take today off',
            action: 'accept',
            targetPlan: REST_DAY_PLAN
          },
          {
            label: 'Keep current plan',
            action: 'keep_plan'
          }
        ]
      }
    ]);
  };

  // Hold-to-complete logic (3 seconds = 3000ms)
  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (fallTimerRef.current) {
      cancelAnimationFrame(fallTimerRef.current);
      fallTimerRef.current = null;
    }
    isHoldingRef.current = false;
    setIsHolding(false);

    const startProg = holdProgressRef.current;
    if (startProg > 0 && startProg < 100 && !hasCompletedRef.current) {
      const fallStart = performance.now();
      const fallDuration = 220;
      const fallUpdate = () => {
        if (isHoldingRef.current) return;
        const now = performance.now();
        const elapsed = now - fallStart;
        const factor = Math.max(0, 1 - elapsed / fallDuration);
        const nextProg = startProg * factor;
        holdProgressRef.current = nextProg;
        setHoldProgress(nextProg);
        if (waveOriginRef.current > 0) {
          setWaveTimeSec((now - waveOriginRef.current) / 1000);
        }
        if (elapsed < fallDuration && !isHoldingRef.current) {
          fallTimerRef.current = requestAnimationFrame(fallUpdate);
        } else if (!isHoldingRef.current) {
          fallTimerRef.current = null;
          holdProgressRef.current = 0;
          setHoldProgress(0);
        }
      };
      fallTimerRef.current = requestAnimationFrame(fallUpdate);
    } else if (!hasCompletedRef.current) {
      holdProgressRef.current = 0;
      setHoldProgress(0);
    }
    holdStartRef.current = 0;
  }, []);

  const startHold = useCallback((e?: React.SyntheticEvent | Event) => {
    const activeIdx = activeCardIndexRef.current;
    const activeCard = cardsState[activeIdx];
    if (isRestDay || activeCard?.isSkipped || activeCard?.planState === 'completed') return;
    if (e && e.type === 'mousedown' && performance.now() - lastTouchTimeRef.current < 600) return;
    if (e && e.type === 'touchstart') {
      lastTouchTimeRef.current = performance.now();
    }
    if (e && 'button' in e && (e as React.MouseEvent).button !== 0) return;
    if (isHoldingRef.current) return;

    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (fallTimerRef.current) {
      cancelAnimationFrame(fallTimerRef.current);
      fallTimerRef.current = null;
    }

    const now = performance.now();
    isHoldingRef.current = true;
    hasCompletedRef.current = false;
    setIsHolding(true);
    holdProgressRef.current = 0;
    setHoldProgress(0);
    holdStartRef.current = now;
    if (waveOriginRef.current === 0) {
      waveOriginRef.current = now;
    }

    const update = () => {
      if (!isHoldingRef.current) return;
      const frameNow = performance.now();
      const elapsed = frameNow - holdStartRef.current;
      const progress = Math.min((elapsed / HOLD_DURATION_MS) * 100, 100);
      holdProgressRef.current = progress;
      setHoldProgress(progress);
      setWaveTimeSec((frameNow - waveOriginRef.current) / 1000);

      if (progress >= 100) {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          isHoldingRef.current = false;
          holdTimerRef.current = null;
          setIsHolding(false);
          holdProgressRef.current = 100;
          setHoldProgress(100);
          setIsCompletedPop(true);
          setTimeout(() => setIsCompletedPop(false), 180);
          recordCardCompleted(activeCardIndexRef.current);
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(50); } catch (_) {}
          }
        }
      } else {
        holdTimerRef.current = requestAnimationFrame(update);
      }
    };

    holdTimerRef.current = requestAnimationFrame(update);
  }, [cardsState, isRestDay, recordCardCompleted]);

  // Cancel any active hold when switching cards
  useEffect(() => {
    hasCompletedRef.current = false;
    cancelHold();
  }, [activeVirtualIndex, cancelHold]);

  // Safety guard: ensure transitionPhase returns to idle if Avatar onAnimationComplete doesn't fire
  useEffect(() => {
    if (isChatOpen || transitionPhase !== 'closing') return;
    const fallback = window.setTimeout(() => {
      setTransitionPhase('idle');
    }, 450);
    return () => window.clearTimeout(fallback);
  }, [isChatOpen, transitionPhase]);

  // Trigger card content wipe animation immediately once Chat is closed AND Avatar/backdrop have returned home
  useEffect(() => {
    if (
      isChatOpen ||
      transitionPhase !== 'idle' ||
      activeTab !== 'Today' ||
      isDetailOpen ||
      !pendingPlanUpdate
    ) {
      return;
    }

    const update = pendingPlanUpdate;
    const targetIdx = cardsState.findIndex((c) => c.id === update.cardId);
    if (targetIdx === -1) {
      cancelPendingAndActiveCardUpdate();
      return;
    }

    let cancelled = false;
    cardWipeCancelledRef.current = false;
    adjustSessionRef.current = null;
    expectedCardIdDuringWipeRef.current = update.cardId;
    cancelHoldImmediate();

    const needsCarouselCenter = activeCardIndexRef.current !== targetIdx || !isPlanCardOpen;
    if (needsCarouselCenter) {
      centerCarouselOnCardIdx(targetIdx);
    } else {
      expectedVirtualIdxDuringWipeRef.current = activeVirtualIndex;
    }

    const launchWipe = () => {
      if (cancelled || cardWipeCancelledRef.current) return;
      const nextRunId = cardWipeRunIdRef.current + 1;
      cardWipeRunIdRef.current = nextRunId;
      pendingPlanUpdateRef.current = null;
      setPendingPlanUpdate(null);
      setActiveCardWipeAnim({
        cardId: update.cardId,
        runId: nextRunId,
        oldPlan: update.oldPlan,
        newPlan: update.newPlan,
      });
    };

    const startAfterPreload = () => {
      if (preloadedPlanImages.has(update.newPlan.thumbnailUrl)) {
        launchWipe();
      } else {
        preloadPlanThumbnail(update.newPlan.thumbnailUrl).then(() => {
          launchWipe();
        });
      }
    };

    if (needsCarouselCenter) {
      const rafId = window.requestAnimationFrame(() => {
        startAfterPreload();
      });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(rafId);
      };
    }

    startAfterPreload();

    return () => {
      cancelled = true;
      if (cardWipeDelayTimerRef.current !== null) {
        window.clearTimeout(cardWipeDelayTimerRef.current);
        cardWipeDelayTimerRef.current = null;
      }
    };
  }, [
    isChatOpen,
    transitionPhase,
    activeTab,
    isDetailOpen,
    pendingPlanUpdate,
    cardsState,
    isPlanCardOpen,
    activeVirtualIndex,
    cancelHoldImmediate,
    centerCarouselOnCardIdx,
    cancelPendingAndActiveCardUpdate,
  ]);

  // Interrupt and cleanly settle any pending/active card replacement on user navigation or card close
  useEffect(() => {
    if (!activeCardWipeAnim && cardWipeDelayTimerRef.current === null) return;
    const activeSlotMatches =
      expectedVirtualIdxDuringWipeRef.current === null ||
      activeVirtualIndex === expectedVirtualIdxDuringWipeRef.current;

    if (
      activeTab !== 'Today' ||
      !isPlanCardOpen ||
      isDetailOpen ||
      isChatOpen ||
      (!isProgrammaticCenteringRef.current && !activeSlotMatches)
    ) {
      cancelPendingAndActiveCardUpdate();
    }
  }, [
    activeTab,
    isPlanCardOpen,
    isDetailOpen,
    isChatOpen,
    activeVirtualIndex,
    activeCardWipeAnim,
    cancelPendingAndActiveCardUpdate,
  ]);

  const handleCardWipeComplete = useCallback((completedRunId: number) => {
    setActiveCardWipeAnim((prev) => {
      if (!prev || prev.runId !== completedRunId) return prev;
      expectedCardIdDuringWipeRef.current = null;
      expectedVirtualIdxDuringWipeRef.current = null;
      return null;
    });
  }, []);

  // Carousel card width & horizontal step (leaves ~40px on each side of 393px screen for peeking cards)
  const carouselCardWidth = useMemo(
    () => Math.min(312, Math.max(268, frameSize.width - 80)),
    [frameSize.width]
  );
  const carouselStepX = carouselCardWidth + 14;
  const virtualSlots = useMemo(
    () => [-3, -2, -1, 0, 1, 2, 3].map((offset) => activeVirtualIndex + offset),
    [activeVirtualIndex]
  );

  // Collapsed suggestion bubble vertical swipe handlers (swipe up = next, swipe down = prev, tap = open card)
  const handleBubblePointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    setIsBubblePressed(true);
    didSwipeBubbleRef.current = false;
    bubbleDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      startTime: performance.now(),
    };
  }, []);

  const handleBubbleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    setIsBubblePressed(true);
    if (bubbleDragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    didSwipeBubbleRef.current = false;
    bubbleDragRef.current = {
      pointerId: -999,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startTime: performance.now(),
    };
  }, []);

  const canRotateBubble = !isRestDay && unskippedCardIndices.length > 1;

  const stepBubbleSuggestion = useCallback((step: 1 | -1) => {
    if (!canRotateBubble) return;
    finishInitialBubbleEntranceImmediately();
    setBubbleSwipeDir(step);
    setActiveVirtualIndex((prev) => {
      const currentMod = ((prev % 3) + 3) % 3;
      const baseIdx = !cardsState[currentMod]?.isSkipped
        ? currentMod
        : (unskippedCardIndices[0] ?? currentMod);
      for (let offset = 1; offset <= 3; offset++) {
        const candidate = (((baseIdx + step * offset) % 3) + 3) % 3;
        if (!cardsState[candidate]?.isSkipped) {
          let diff = candidate - currentMod;
          if (step > 0 && diff <= 0) diff += 3;
          if (step < 0 && diff >= 0) diff -= 3;
          return prev + diff;
        }
      }
      return prev;
    });
  }, [canRotateBubble, cardsState, unskippedCardIndices, finishInitialBubbleEntranceImmediately]);

  const handleBubbleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
    if (isPlanCardOpen || !canRotateBubble) return;
    if (Math.abs(e.deltaY) >= 12 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const now = performance.now();
      if (now - lastBubbleSwipeTimeRef.current < 280) return;
      lastBubbleSwipeTimeRef.current = now;
      const step: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      stepBubbleSuggestion(step);
    }
  }, [isPlanCardOpen, canRotateBubble, stepBubbleSuggestion]);

  useEffect(() => {
    if (isPlanCardOpen || !canRotateBubble) {
      bubbleDragRef.current = null;
      setIsDraggingBubble(false);
      setBubbleDragY(0);
      return;
    }

    const updateBubbleDrag = (clientX: number, clientY: number) => {
      const drag = bubbleDragRef.current;
      if (!drag) return;
      drag.currentX = clientX;
      drag.currentY = clientY;
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;

      if (Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx)) {
        setIsDraggingBubble(true);
        const dampedY = Math.max(-10, Math.min(10, dy * 0.32));
        setBubbleDragY(dampedY);
      }
      if (Math.abs(dy) >= 12 && Math.abs(dy) > Math.abs(dx)) {
        didSwipeBubbleRef.current = true;
      }
    };

    const completeBubbleDrag = () => {
      const drag = bubbleDragRef.current;
      if (!drag) return;
      const dx = drag.currentX - drag.startX;
      const dy = drag.currentY - drag.startY;

      if (Math.abs(dy) >= 12 && Math.abs(dy) > Math.abs(dx)) {
        didSwipeBubbleRef.current = true;
        lastBubbleSwipeTimeRef.current = performance.now();
        // Swipe up (dy < 0) advances to next unskipped item; swipe down (dy > 0) goes to previous unskipped item
        const step: 1 | -1 = dy < 0 ? 1 : -1;
        stepBubbleSuggestion(step);
      }

      setIsDraggingBubble(false);
      setIsBubblePressed(false);
      setBubbleDragY(0);
      bubbleDragRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = bubbleDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      updateBubbleDrag(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = bubbleDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      completeBubbleDrag();
    };

    const onTouchMove = (e: TouchEvent) => {
      const drag = bubbleDragRef.current;
      if (!drag || drag.pointerId !== -999) return;
      const touch = e.touches[0];
      if (!touch) return;
      updateBubbleDrag(touch.clientX, touch.clientY);
    };

    const onTouchEnd = () => {
      const drag = bubbleDragRef.current;
      if (!drag || drag.pointerId !== -999) return;
      completeBubbleDrag();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isPlanCardOpen, canRotateBubble, stepBubbleSuggestion]);

  const handleCarouselPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    didSwipeCarouselRef.current = false;
    carouselDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      startTime: performance.now(),
      axis: null,
    };
  }, []);

  const handleCarouselTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (carouselDragRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    didSwipeCarouselRef.current = false;
    carouselDragRef.current = {
      pointerId: -999,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      startTime: performance.now(),
      axis: null,
    };
  }, []);

  // Global drag tracking for the 3-card suggestion carousel
  useEffect(() => {
    if (!isPlanCardOpen) {
      carouselDragRef.current = null;
      setIsDraggingCarousel(false);
      setDragDeltaX(0);
      return;
    }

    const updateDragPosition = (clientX: number, clientY: number, rawEvent: Event) => {
      const drag = carouselDragRef.current;
      if (!drag) return;
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;
      drag.currentX = clientX;

      if (drag.axis === null) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          drag.axis = 'x';
          didSwipeCarouselRef.current = true;
          cancelHold();
          setIsDraggingCarousel(true);
        } else if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
          drag.axis = 'y';
        }
      }

      if (drag.axis === 'x') {
        if (rawEvent.cancelable) {
          rawEvent.preventDefault();
        }
        setDragDeltaX(dx);
      }
    };

    const completeDrag = () => {
      const drag = carouselDragRef.current;
      if (!drag) return;
      if (drag.axis === 'x') {
        lastCarouselSwipeTimeRef.current = performance.now();
        const dx = drag.currentX - drag.startX;
        const dt = Math.max(16, performance.now() - drag.startTime);
        const vx = dx / dt;
        let step = 0;
        if (dx < -40 || (dx < -16 && vx < -0.25)) {
          step = 1;
        } else if (dx > 40 || (dx > 16 && vx > 0.25)) {
          step = -1;
        }
        if (step !== 0) {
          setActiveVirtualIndex((prev) => prev + step);
        }
        setIsDraggingCarousel(false);
        setDragDeltaX(0);
      }
      carouselDragRef.current = null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = carouselDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      updateDragPosition(e.clientX, e.clientY, e);
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = carouselDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      completeDrag();
    };

    const onTouchMove = (e: TouchEvent) => {
      const drag = carouselDragRef.current;
      if (!drag || drag.pointerId !== -999) return;
      const touch = e.touches[0];
      if (!touch) return;
      updateDragPosition(touch.clientX, touch.clientY, e);
    };

    const onTouchEnd = () => {
      const drag = carouselDragRef.current;
      if (!drag || drag.pointerId !== -999) return;
      completeDrag();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isPlanCardOpen, cancelHold]);

  // Handle touch moving outside button boundary (finger slide out)
  const handleTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (!isHoldingRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isInside =
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom;
    if (!isInside) {
      cancelHold();
    }
  };

  // Keyboard accessibility: hold Space or Enter for 3 seconds to complete
  const handleDoneKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const activeCard = cardsState[activeCardIndexRef.current];
    if (isRestDay || activeCard?.isSkipped || activeCard?.planState === 'completed') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat && !isHoldingRef.current) {
        startHold();
      }
    }
  };

  const handleDoneKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!hasCompletedRef.current) {
        cancelHold();
      }
    }
  };

  // Screen reader / assistive technology click: detail === 0
  const handleDoneClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const activeCard = cardsState[activeCardIndexRef.current];
    // Assistive technology (screen reader) synthesized click
    if (
      e.detail === 0 &&
      !isRestDay &&
      !activeCard?.isSkipped &&
      activeCard?.planState !== 'completed' &&
      !hasCompletedRef.current
    ) {
      cancelHold();
      setIsAccessibleConfirmOpen(true);
      return;
    }
    // Standard mouse click or touch tap: do nothing;
    // cancelHold() already animates fallback to 0 on release.
  };

  // Global listeners when user is actively holding: mouseup, touchend, blur, window visibility
  useEffect(() => {
    if (!isHolding) return;

    const handleWindowBlur = () => cancelHold();
    const handleVisibility = () => {
      if (document.hidden) cancelHold();
    };
    const handleGlobalMouseUp = () => cancelHold();
    const handleGlobalTouchEnd = () => cancelHold();

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);
    window.addEventListener('touchcancel', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  }, [isHolding, cancelHold]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) cancelAnimationFrame(holdTimerRef.current);
      if (fallTimerRef.current) cancelAnimationFrame(fallTimerRef.current);
    };
  }, []);

  // Handle push message action
  const handleTellPlanB = () => {
    openChatWithTransition(() => {
      setChatMessages([
        {
          id: 'msg-push',
          sender: 'user',
          text: "About yesterday's walk..."
        },
        {
          id: 'ai-push',
          sender: 'ai',
          text: "I'm listening! Did you get a chance to step outside, or did life get in the way?",
          options: [
            {
              label: 'Did 5-minute stretch instead',
              action: 'accept',
              targetPlan: STRETCH_PLAN
            },
            {
              label: 'Life got busy, took rest',
              action: 'accept',
              targetPlan: REST_DAY_PLAN
            },
            {
              label: 'Tell Nova what changed',
              action: 'focus_input'
            }
          ]
        }
      ]);
    });
  };

  return (
    <div className="min-h-screen bg-[#E5E5EA] flex items-center justify-center p-0 sm:py-6 font-sans antialiased select-none text-[#1C1C1E]">
      <style>{GENKI_MOBILE_UI_STYLES}</style>
      {/* 393 × 852 px Native Smartphone Frame */}
      <div 
        ref={phoneFrameRef}
        className="w-full max-w-[393px] h-[100dvh] sm:h-[844px] sm:max-h-[852px] bg-[#F2F2F7] relative flex flex-col justify-between overflow-hidden sm:rounded-[44px] sm:shadow-[0_28px_72px_-16px_rgba(28,28,30,0.18)] sm:border sm:border-white/90"
      >
        
        {/* Apple Health Style Top Pink-Lavender Gradient transitioning smoothly to #F2F2F7 */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {/* Primary vertical top wash: soft pink-lavender at top fading into #F2F2F7 by ~45% */}
          <div className="absolute top-0 inset-x-0 h-[380px] bg-gradient-to-b from-[#DDD2FC]/85 via-[#F3D1EE]/55 to-transparent" />
          {/* Left soft periwinkle-lavender bloom */}
          <div className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-radial from-[#C9BEFC]/75 via-[#DDD5FC]/35 to-transparent blur-2xl" />
          {/* Right soft rose-pink bloom */}
          <div className="absolute -top-16 -right-14 w-72 h-72 rounded-full bg-radial from-[#FAD0E5]/80 via-[#F6DCEB]/40 to-transparent blur-2xl" />
          {/* Subtle central aura behind companion */}
          <div className="absolute top-[36%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-radial from-[#E6DEFC]/65 via-[#F7DFEE]/40 to-transparent blur-2xl" />
          {/* Gentle lower ambient blooms so floating bottom glass controls subtly refract soft lavender-pink color */}
          <div className="absolute -bottom-8 -left-8 w-64 h-44 rounded-full bg-radial from-[#DDD2FC]/55 via-[#E8DDFC]/25 to-transparent blur-2xl" />
          <div className="absolute -bottom-8 -right-8 w-64 h-44 rounded-full bg-radial from-[#FAD0E5]/55 via-[#F6DFED]/25 to-transparent blur-2xl" />
        </div>

        {/* Continuous Unified 3D Nova Avatar (Flies seamlessly between Home and Chat Drawer; stays mounted across tabs) */}
        <motion.div
          id="today-unified-avatar-container"
          aria-hidden={activeTab !== 'Today'}
          style={{
            visibility: activeTab === 'Today' ? 'visible' : 'hidden',
            opacity: activeTab === 'Today' ? 1 : 0,
            pointerEvents: activeTab === 'Today' ? 'auto' : 'none',
          }}
          className={`absolute flex items-center justify-center select-none ${
            activeTab !== 'Today'
              ? 'invisible opacity-0 pointer-events-none -z-10'
              : isChatOpen || transitionPhase !== 'idle'
              ? 'visible opacity-100 z-50 pointer-events-auto'
              : 'visible opacity-100 z-25 pointer-events-auto'
          }`}
          initial={false}
          animate={{
            top: isChatOpen ? drawerTop : homeAvatarRect.top,
            left: isChatOpen ? drawerLeft : homeAvatarRect.left,
            width: isChatOpen ? drawerWidth : homeAvatarRect.width,
            height: isChatOpen ? drawerHeight : homeAvatarRect.height,
          }}
          transition={
            transitionPhase === 'idle' && !isChatOpen
              ? { duration: 0 }
              : shouldReduceMotion
              ? { duration: 0.05 }
              : {
                  duration: isChatOpen ? 0.42 : 0.36,
                  ease: isChatOpen ? [0.32, 0.72, 0, 1] : [0.25, 1, 0.5, 1],
                }
          }
          onAnimationComplete={() => {
            if (!isChatOpen) {
              setTransitionPhase('idle');
            } else {
              setTransitionPhase('open');
            }
          }}
        >
          {/* Soft lilac & warm blush halo behind character (subtler when docked) */}
          <motion.div 
            animate={{ opacity: isChatOpen ? 0.35 : 0.85, scale: isChatOpen ? 0.85 : 1 }}
            transition={{ duration: isChatOpen ? 0.25 : 0.32 }}
            className="absolute inset-1 rounded-full bg-radial from-[#F4EEFE]/90 via-[#FDF1F5]/45 to-transparent blur-2xl pointer-events-none -z-10" 
          />

          <div
            className={`w-full h-full relative flex items-center justify-center ${
              activeTab === 'Today' ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
          >
            {(avatarMode === '2d' || !isAvatarFirstFrameReady) && (
              <FurryNovaStaticAvatar
                size={isChatOpen ? drawerWidth : homeAvatarRect.width}
                isListening={isChatOpen && (isTyping || sheetInput.trim().length > 0)}
                className="w-full h-full"
              />
            )}
            {avatarMode === '3d' && shouldMountToday3D && (
              <div
                className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
                  isAvatarFirstFrameReady ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                <React.Suspense fallback={null}>
                  <LazyNovaAvatar3D
                    isActiveTab={activeTab === 'Today'}
                    isTransitioning={transitionPhase === 'opening' || transitionPhase === 'closing'}
                    className="w-full h-full"
                    mode="3d"
                    isListening={isChatOpen && (isTyping || sheetInput.trim().length > 0)}
                    onReady={() => setIsAvatarFirstFrameReady(true)}
                    onBoop={() => {
                      // gentle boop feedback
                    }}
                  />
                </React.Suspense>
              </div>
            )}
          </div>
        </motion.div>

        {/* Continuous Shared-Element Media Transition Element */}
        {((detailTransitionPhase === 'opening' && detailFloatingStartRect && detailTargetRect) ||
          (detailTransitionPhase === 'closing' && detailFloatingStartRect && detailThumbRect)) && (() => {
          const runIdForElement = detailTransitionRunId;
          const isOpening = detailTransitionPhase === 'opening';
          const fromRect = detailFloatingStartRect!;
          const toRect = isOpening ? detailTargetRect! : detailThumbRect!;

          return (
            <motion.div
              key={runIdForElement}
              ref={floatingMediaRef}
              data-floating-media="true"
              data-target-top={toRect.top}
              data-target-left={toRect.left}
              data-target-width={toRect.width}
              data-target-height={toRect.height}
              data-target-radius={toRect.borderRadius}
              initial={
                shouldReduceMotion
                  ? {
                      top: isOpening ? toRect.top : fromRect.top,
                      left: isOpening ? toRect.left : fromRect.left,
                      width: isOpening ? toRect.width : fromRect.width,
                      height: isOpening ? toRect.height : fromRect.height,
                      borderRadius: isOpening ? toRect.borderRadius : fromRect.borderRadius,
                      borderColor: isOpening ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                      opacity: isOpening ? 0 : 1,
                    }
                  : {
                      top: fromRect.top,
                      left: fromRect.left,
                      width: fromRect.width,
                      height: fromRect.height,
                      borderRadius: fromRect.borderRadius,
                      borderColor: isOpening ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      boxShadow: isOpening
                        ? '0 2px 8px rgba(38, 38, 63, 0.06)'
                        : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                      opacity: 1,
                    }
              }
              animate={
                shouldReduceMotion
                  ? {
                      top: isOpening ? toRect.top : fromRect.top,
                      left: isOpening ? toRect.left : fromRect.left,
                      width: isOpening ? toRect.width : fromRect.width,
                      height: isOpening ? toRect.height : fromRect.height,
                      borderRadius: isOpening ? toRect.borderRadius : fromRect.borderRadius,
                      borderColor: 'rgba(0, 0, 0, 0.04)',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                      opacity: isOpening ? 1 : 0,
                    }
                  : {
                      top: toRect.top,
                      left: toRect.left,
                      width: toRect.width,
                      height: toRect.height,
                      borderRadius: toRect.borderRadius,
                      borderColor: isOpening ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.06)',
                      boxShadow: isOpening
                        ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                        : '0 2px 8px rgba(38, 38, 63, 0.06)',
                      opacity: 1,
                    }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0.05 }
                  : {
                      duration: isOpening ? 0.40 : 0.36,
                      ease: isOpening ? [0.32, 0.72, 0, 1] : [0.25, 1, 0.5, 1],
                    }
              }
              onAnimationComplete={() => {
                if (runIdForElement !== transitionRunIdRef.current) return;
                if (isOpening) {
                  setDetailTransitionPhase('open');
                } else {
                  setDetailTransitionPhase('idle');
                  setDetailThumbRect(null);
                  setDetailFloatingStartRect(null);
                  setDetailTargetRect(null);
                }
              }}
              className="absolute z-[55] overflow-hidden border pointer-events-none"
            >
              {/* The image: exact same crop and centering as thumbnail and detail hero */}
              <img
                src={currentPlan.thumbnailUrl}
                alt={currentPlan.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center absolute inset-0"
              />

              {/* Detail Media Info (Bottom): matches detail hero typography & gradient */}
              <motion.div
                initial={{ opacity: isOpening ? 0 : 1 }}
                animate={{ opacity: isOpening ? 1 : 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.05 }
                    : isOpening
                    ? { duration: 0.24, delay: 0.16 }
                    : { duration: 0.16, delay: 0 }
                }
                className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent flex items-end p-4 sm:p-4.5 pointer-events-none"
              >
                <div className="flex items-center justify-between w-full text-white">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="text-[15px] font-semibold leading-[22px] tracking-[-0.01em]">
                      {currentPlan.audioTitle}
                    </div>
                    <div className="text-[13px] sm:text-[13px] text-white/85 mt-0.5 font-normal">
                      {currentPlan.audioSubtitle}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}

        {/* 1. iOS Status Bar (44px Height Standard Safe Area) */}
        <div className="pt-3.5 pb-1 px-7 flex items-center justify-between text-[13px] leading-[18px] font-semibold text-[#1C1C1E] select-none shrink-0 z-30">
          <span className="tracking-tight">9:41</span>
          <div className="flex items-center gap-1.5">
            {/* Cellular signal bars */}
            <svg className="w-4 h-3 fill-current" viewBox="0 0 17 12">
              <rect x="0" y="9" width="2.5" height="3" rx="0.5" />
              <rect x="4" y="6" width="2.5" height="6" rx="0.5" />
              <rect x="8" y="3" width="2.5" height="9" rx="0.5" />
              <rect x="12" y="0" width="2.5" height="12" rx="0.5" />
            </svg>
            <Wifi className="w-3.5 h-3.5 stroke-[2.4]" />
            {/* Battery icon */}
            <div className="w-5 h-2.5 border border-[#1C1C1E] rounded-[3px] p-0.5 flex items-center">
              <div className="w-full h-full bg-[#1C1C1E] rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* 2. Top Header Bar (Fixed 48px outer flow height so Today header never pushes Avatar or tasks) */}
        <header
          onClick={() => {
            if (activeTab === 'Today' && isPlanCardOpen) {
              setIsPlanCardOpen(false);
            }
          }}
          className="relative px-5 pt-1 pb-1.5 h-[48px] overflow-visible shrink-0 z-20"
        >
          {/* Today Unified Header (Kept mounted across tabs so weather PNG never re-fetches) */}
          {(() => {
            const isShortViewport = frameSize.height < 700;
            const iconSize = isShortViewport ? 96 : 112;
            // Stable slot dimensions matching tallest weather subject (336x331 / 512) so switching states never shifts the greeting
            const iconSlotWidth = isShortViewport ? 63 : 74;
            const iconSlotHeight = isShortViewport ? 62 : 72;
            const insets = weatherAssetSrc ? WEATHER_ASSET_INSETS[weatherAssetSrc] : null;
            const imgTop = insets ? Number((iconSlotHeight / 2 - iconSize * insets.centerYRatio).toFixed(2)) : 0;
            const imgRight = insets ? Number((-iconSize * insets.rightRatio).toFixed(2)) : 0;

            return (
              <div
                id="today-header-top-row"
                aria-hidden={activeTab !== 'Today'}
                className={`w-full items-center justify-between select-none ${
                  activeTab === 'Today' ? 'flex' : 'hidden'
                }`}
              >
                <span
                  id="today-brand-title"
                  className="text-[32px] font-bold leading-[38px] tracking-[-0.024em] text-[#1C1C1E] shrink-0"
                >
                  Genki
                </span>

                {weatherAssetSrc && (
                  <div
                    id="today-weather-icon-wrap"
                    aria-hidden="true"
                    style={{
                      width: `${iconSlotWidth}px`,
                      height: `${iconSlotHeight}px`,
                    }}
                    className="relative overflow-visible shrink-0 pointer-events-none select-none"
                  >
                    <img
                      id="today-weather-icon-img"
                      src={weatherAssetSrc}
                      alt=""
                      aria-hidden="true"
                      width={iconSize}
                      height={iconSize}
                      decoding="async"
                      draggable={false}
                      style={{
                        position: 'absolute',
                        top: `${imgTop}px`,
                        right: `${imgRight}px`,
                        width: `${iconSize}px`,
                        height: `${iconSize}px`,
                        maxWidth: 'none',
                        objectFit: 'contain',
                        opacity: 0.88,
                      }}
                      className="block pointer-events-none select-none"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Plan / Discover Header */}
          {activeTab !== 'Today' && (
            <div className="w-full flex items-center justify-between">
              <span
                id="tab-brand-title"
                className="text-[32px] font-bold leading-[38px] tracking-[-0.024em] text-[#1C1C1E]"
              >
                {activeTab}
              </span>
              {activeTab === 'Discover' && (
                <button
                  type="button"
                  id="top-saved-btn"
                  onClick={() => setIsSavedSheetOpen(true)}
                  className="genki-mobile-control genki-mobile-secondary liquid-glass-bubble flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] leading-[18px] font-semibold text-[#5E5BAE] transition-colors cursor-pointer active:scale-95 min-h-[34px]"
                  aria-label={`View saved guides (${savedItemIds.length})`}
                >
                  <Bookmark className="w-3.5 h-3.5 fill-current" />
                  <span>Saved ({savedItemIds.length})</span>
                </button>
              )}
            </div>
          )}
        </header>

        {/* 3. Main Body Content: Today View */}
        <div
          id="today-scroll-container"
          onScroll={() => {
            const liveRect = getLiveHomeAvatarRect();
            if (liveRect && liveRect.width > 0 && liveRect.height > 0) {
              setHomeAvatarRect(liveRect);
            }
          }}
          style={{
            paddingBottom: `${Math.max(bottomBarHeight + 16, 92)}px`,
          }}
          className={`flex-1 relative ${
            isPlanCardOpen ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden no-scrollbar'
          } pt-1 flex-col items-center justify-start ${
            activeTab === 'Today' ? 'flex' : 'hidden'
          }`}
        >
          {/* Click-outside backdrop: transparent hit-area across entire screen, with feathered lower glass blur (no horizontal line) */}
          <AnimatePresence>
            {isPlanCardOpen && (
              <>
                {/* Full-screen click-outside dismiss target */}
                <motion.div
                  key="today-card-backdrop-dismiss"
                  id="today-card-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.05 : 0.2 }}
                  onClick={() => setIsPlanCardOpen(false)}
                  className="absolute inset-0 z-15 cursor-pointer"
                  aria-label="Close suggestion card"
                />

                {/* Feathered lower glass blur behind cards only — no hard horizontal boundary line */}
                <motion.div
                  key="today-card-backdrop-blur"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.05 : 0.24 }}
                  style={{
                    bottom: `${Math.max(bottomBarHeight - 16, 60)}px`,
                    WebkitMaskImage:
                      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.95) 72%, transparent 100%)',
                    maskImage:
                      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 38%, rgba(0,0,0,0.95) 72%, transparent 100%)',
                  }}
                  className="absolute inset-x-0 top-[360px] z-15 bg-white/22 backdrop-blur-[6px] pointer-events-none"
                />
              </>
            )}
          </AnimatePresence>

          {/* Unified Companion Cluster (Top-anchored so Nova stays stationary while Bubble or 3-Row Board grows naturally below Nova) */}
          <div className="w-full flex flex-col items-center justify-start shrink-0 relative z-20">
            {/* 1. Top layout spacer anchoring Nova at a stable vertical position across all states */}
            <div
              aria-hidden="true"
              style={{
                height: frameSize.height < 700 ? '34px' : '145px',
              }}
              className="w-full shrink-0 pointer-events-none"
            />

            {/* 2. 3D Nova Avatar Layout Anchor / Spacer (Single persistent 3D Avatar is rendered in today-unified-avatar-container) */}
            <div
              ref={homeAvatarRef}
              aria-hidden="true"
              style={{
                width: frameSize.height < 700 ? '204px' : '248px',
                height: frameSize.height < 700 ? '204px' : '248px',
              }}
              className="relative flex items-center justify-center shrink-0 pointer-events-none opacity-0 select-none"
            />

            {/* 3. Below Nova: Content-sized container (16px below Nova visible bottom on normal screen, 12px on 375x667 short screen) */}
            <div
              id="today-companion-text-group"
              aria-hidden={isPlanCardOpen}
              style={{
                marginTop: '-5px',
                height: companionGroupHeight !== null ? `${companionGroupHeight}px` : 'auto',
                opacity: isPlanCardOpen ? 0 : 1,
                transition: shouldReduceMotion
                  ? 'none'
                  : 'height 240ms ease-in-out, opacity 200ms ease-out',
                pointerEvents: isPlanCardOpen ? 'none' : 'auto',
                overflow: 'visible',
              }}
              className={`w-full flex flex-col items-center justify-start shrink-0 select-none ${
                isPlanCardOpen ? 'scale-95 pointer-events-none' : 'scale-100 pointer-events-auto'
              }`}
            >
              <div
                ref={companionContentRef}
                className="w-full flex flex-col items-center justify-start shrink-0 relative"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {isRestDay || !hasAnyAcceptedOrCompleted ? (
                    /* 1. Global Rest Day OR All suggestions unaccepted: Nova Dialog Bubble */
                    <motion.div
                      key="companion-nova-bubble"
                      id="today-suggestion-bubble-container"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: {
                          duration: shouldReduceMotion ? 0 : 0.15,
                          ease: 'easeOut',
                        },
                      }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: shouldReduceMotion ? 0 : 0.15,
                          ease: 'easeOut',
                        },
                      }}
                      className="w-full flex justify-center shrink-0 overflow-visible"
                    >
                      {/* Unified First-Entrance Group: animates body, pointer tail, and lower stack layers together from top center (50% 0%) */}
                      <div
                        ref={bubbleEntranceRef}
                        id="today-bubble-entrance-group"
                        data-bubble-entrance-phase={shouldReduceMotion ? 'done' : bubbleEntrancePhase}
                        data-bubble-typewriter-active={
                          !shouldReduceMotion && isBubbleTypewriterActive ? 'true' : 'false'
                        }
                        style={{
                          width: 'calc(100% - 72px)',
                          maxWidth: '360px',
                          marginTop: frameSize.height < 700 ? '11px' : '8px',
                          transformOrigin: '50% 0%',
                          opacity: !shouldReduceMotion && bubbleEntrancePhase === 'waiting' ? 0 : 1,
                          transform:
                            shouldReduceMotion || bubbleEntrancePhase === 'done'
                              ? undefined
                              : bubbleEntrancePhase === 'waiting'
                              ? 'translateY(-5px) scale(0.94)'
                              : 'translateY(0px) scale(1)',
                          transition:
                            shouldReduceMotion || bubbleEntrancePhase !== 'entering'
                              ? 'none'
                              : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                        className="relative flex flex-col items-center shrink-0 overflow-visible"
                      >
                        {/* Stack Group Wrapper: reserves bottom stack height for remaining unskipped suggestions (removed in rest / single / all-skipped) */}
                        <div
                          id="today-suggestion-bubble-stack"
                          style={{
                            width: '100%',
                            paddingBottom:
                              isRestDay || unskippedCardIndices.length <= 1
                                ? '0px'
                                : unskippedCardIndices.length === 2
                                ? '8px'
                                : '16px',
                            overflow: 'visible',
                            transform: isBubblePressed ? 'scale(0.985)' : 'scale(1)',
                            transition: shouldReduceMotion ? 'none' : 'transform 120ms ease-out',
                          }}
                          className="relative flex flex-col items-center shrink-0 overflow-visible"
                        >
                        <div
                          id="today-suggestion-stack-stage"
                          style={{ overflow: 'visible' }}
                          className="relative w-full"
                        >
                          {/* Layer 3 (Lowest decorative layer): shown only when >= 3 unskipped suggestions and not resting */}
                          {!isRestDay && unskippedCardIndices.length >= 3 && (
                            <div
                              id="today-bubble-stack-layer-3"
                              aria-hidden="true"
                              style={{
                                position: 'absolute',
                                top: '16px',
                                bottom: '-16px',
                                left: '20px',
                                right: '20px',
                                borderRadius: '22px',
                                background: 'rgba(255, 255, 255, 0.20)',
                                border: '1px solid rgba(118, 109, 152, 0.12)',
                                boxShadow: 'none',
                                pointerEvents: 'none',
                                zIndex: 10,
                              }}
                            />
                          )}

                          {/* Layer 2 (Middle decorative layer): shown only when >= 2 unskipped suggestions and not resting */}
                          {!isRestDay && unskippedCardIndices.length >= 2 && (
                            <div
                              id="today-bubble-stack-layer-2"
                              aria-hidden="true"
                              style={{
                                position: 'absolute',
                                top: '8px',
                                bottom: '-8px',
                                left: '10px',
                                right: '10px',
                                borderRadius: '24px',
                                background: 'rgba(255, 255, 255, 0.32)',
                                border: '1px solid rgba(118, 109, 152, 0.12)',
                                boxShadow: 'none',
                                pointerEvents: 'none',
                                zIndex: 20,
                              }}
                            />
                          )}

                          {/* Layer 1 (Main interactive bubble): top layer, radius 26px, padding 14px 18px 16px, fill rgba(255,255,255,0.48), border 1px solid rgba(255,255,255,0.85), blur 16px, shadow 0 6px 20px rgba(70,60,100,0.045) */}
                          <button
                            id="today-top-suggestion-btn"
                            type="button"
                            onPointerDown={handleBubblePointerDown}
                            onPointerUp={() => setIsBubblePressed(false)}
                            onPointerCancel={() => setIsBubblePressed(false)}
                            onPointerLeave={() => {
                              if (!isDraggingBubble) setIsBubblePressed(false);
                            }}
                            onTouchStart={handleBubbleTouchStart}
                            onTouchEnd={() => setIsBubblePressed(false)}
                            onTouchCancel={() => setIsBubblePressed(false)}
                            onWheel={handleBubbleWheel}
                            onClick={(e) => {
                              setIsBubblePressed(false);
                              if (
                                didSwipeBubbleRef.current ||
                                performance.now() - lastBubbleSwipeTimeRef.current < 260
                              ) {
                                didSwipeBubbleRef.current = false;
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              finishInitialBubbleEntranceImmediately();
                              if (
                                bubbleDisplayMode === 'suggestion' &&
                                bubbleCardIndex !== activeCardIndex
                              ) {
                                centerCarouselOnCardIdx(bubbleCardIndex);
                              } else {
                                setIsPlanCardOpen(true);
                              }
                            }}
                            aria-expanded={isPlanCardOpen}
                            aria-label={
                              bubbleDisplayMode === 'rest'
                                ? REST_DAY_COPY.bubbleAriaLabel
                                : bubbleDisplayMode === 'all-skipped'
                                ? ALL_SKIPPED_BUBBLE_COPY.bubbleAriaLabel
                                : `Open Nova’s suggestions: ${bubblePlan.bubblePrompt}`
                            }
                            style={{
                              touchAction: 'pan-y',
                              width: '100%',
                              height: 'auto',
                              paddingTop: '14px',
                              paddingBottom: '16px',
                              paddingLeft: '18px',
                              paddingRight: '18px',
                              borderRadius: '26px',
                              background: 'rgba(255, 255, 255, 0.48)',
                              backdropFilter: 'blur(16px)',
                              WebkitBackdropFilter: 'blur(16px)',
                              boxShadow: '0 6px 20px rgba(70, 60, 100, 0.045)',
                              zIndex: 30,
                              overflow: 'visible',
                            }}
                            className="genki-mobile-focus relative text-left flex flex-col justify-center cursor-pointer select-none overflow-visible"
                          >
                            {/* Continuous border ring with 26px top-center mask exclusion so pointer base has zero horizontal border line or seam */}
                            <div
                              id="today-bubble-border-ring"
                              aria-hidden="true"
                              style={{
                                borderRadius: '26px',
                                border: '1px solid rgba(255, 255, 255, 0.85)',
                                WebkitMaskImage:
                                  'linear-gradient(#000, #000), linear-gradient(#000, #000)',
                                WebkitMaskSize: '100% 100%, 26px 2px',
                                WebkitMaskPosition: '0 0, center top',
                                WebkitMaskRepeat: 'no-repeat',
                                WebkitMaskComposite: 'xor',
                                maskImage:
                                  'linear-gradient(#000, #000), linear-gradient(#000, #000)',
                                maskSize: '100% 100%, 26px 2px',
                                maskPosition: '0 0, center top',
                                maskRepeat: 'no-repeat',
                                maskComposite: 'exclude',
                              }}
                              className="absolute inset-0 pointer-events-none"
                            />

                            {/* Top-center pointer towards Avatar: base width 26px, height 14px, tip radius ~2px, same fill & continuous SVG stroke */}
                            <div
                              id="today-bubble-pointer"
                              aria-hidden="true"
                              style={{
                                width: '26px',
                                height: '14px',
                                top: '-14px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                              }}
                              className="absolute pointer-events-none"
                            >
                              <div
                                style={{
                                  width: '26px',
                                  height: '14px',
                                  background: 'rgba(255, 255, 255, 0.48)',
                                  backdropFilter: 'blur(16px)',
                                  WebkitBackdropFilter: 'blur(16px)',
                                  clipPath:
                                    "path('M 0 14 L 11.53 0.64 A 2 2 0 0 1 14.47 0.64 L 26 14 Z')",
                                }}
                              />
                              <svg
                                id="today-bubble-pointer-svg"
                                width="26"
                                height="14"
                                viewBox="0 0 26 14"
                                className="absolute inset-0 pointer-events-none overflow-visible"
                              >
                                <path
                                  d="M 0 14 L 11.53 1.14 A 2 2 0 0 1 14.47 1.14 L 26 14"
                                  fill="none"
                                  stroke="rgba(255, 255, 255, 0.85)"
                                  strokeWidth="1"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>

                            {/* Row 1: Only "Nova" speaker label (12px, weight 500, line-height 16px, #766D98) */}
                            <div className="w-full flex items-center">
                              <span
                                id="today-bubble-speaker"
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 500,
                                  lineHeight: '18px',
                                  color: '#766D98',
                                }}
                              >
                                Nova
                              </span>
                            </div>

                            {/* Row 2 (6px below Nova): Suggestion body (16px, weight 500, line-height 23px, #393640, natural wrap, full text, no ellipsis, no right chevron padding) */}
                            {(() => {
                              const showTypewriterPlaceholder =
                                !shouldReduceMotion &&
                                (bubbleEntrancePhase === 'waiting' ||
                                  (isBubbleTypewriterActive &&
                                    (bubbleTypewriterTargetTextRef.current === '' ||
                                      bubbleTypewriterTargetTextRef.current === fullBubbleText)));
                              const visibleBubbleBodyText = showTypewriterPlaceholder
                                ? bubbleEntrancePhase === 'waiting'
                                  ? ''
                                  : fullBubbleText.slice(0, bubbleTypedChars)
                                : fullBubbleText;

                              return (
                                <div
                                  style={{
                                    marginTop: '6px',
                                  }}
                                  className="relative w-full flex items-center"
                                >
                                  <div className="relative w-full overflow-visible">
                                    {/* Invisible full-text sizer preserves exact multi-line height from frame 1 without height jump or Avatar shift */}
                                    {showTypewriterPlaceholder && (
                                      <span
                                        id="today-bubble-suggestion-sizer"
                                        aria-hidden="true"
                                        style={{
                                          fontSize: '16px',
                                          fontWeight: 500,
                                          lineHeight: '23px',
                                          display: 'block',
                                          whiteSpace: 'normal',
                                          overflow: 'visible',
                                          textOverflow: 'clip',
                                          wordBreak: 'break-word',
                                          visibility: 'hidden',
                                          pointerEvents: 'none',
                                        }}
                                        className="w-full"
                                      >
                                        {fullBubbleText}
                                      </span>
                                    )}
                                    <AnimatePresence
                                      mode="popLayout"
                                      initial={false}
                                      custom={{
                                        dir: bubbleSwipeDir,
                                        pureFade:
                                          bubbleDisplayMode !== 'suggestion' ||
                                          isBubbleModeTransitioning,
                                      }}
                                    >
                                      <motion.span
                                        key={
                                          bubbleDisplayMode === 'rest'
                                            ? 'rest-day-bubble'
                                            : bubbleDisplayMode === 'all-skipped'
                                            ? 'all-skipped-bubble'
                                            : `${bubbleCardIndex}-${bubblePlan.id}`
                                        }
                                        id="today-bubble-suggestion-text"
                                        custom={{
                                          dir: bubbleSwipeDir,
                                          pureFade:
                                            bubbleDisplayMode !== 'suggestion' ||
                                            isBubbleModeTransitioning,
                                        }}
                                        variants={{
                                          enter: (c: { dir: 1 | -1; pureFade: boolean }) =>
                                            shouldReduceMotion || c.pureFade
                                              ? { opacity: 0 }
                                              : { opacity: 0, y: c.dir >= 0 ? 10 : -10 },
                                          center: {
                                            opacity: 1,
                                            y: canRotateBubble ? bubbleDragY : 0,
                                          },
                                          exit: (c: { dir: 1 | -1; pureFade: boolean }) =>
                                            shouldReduceMotion || c.pureFade
                                              ? { opacity: 0 }
                                              : { opacity: 0, y: c.dir >= 0 ? -10 : 10 },
                                        }}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={
                                          shouldReduceMotion
                                            ? { duration: 0 }
                                            : bubbleDisplayMode !== 'suggestion' ||
                                              isBubbleModeTransitioning
                                            ? { duration: 0.15, ease: 'easeInOut' }
                                            : isDraggingBubble
                                            ? { duration: 0 }
                                            : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                                        }
                                        style={{
                                          fontSize: '16px',
                                          fontWeight: 500,
                                          lineHeight: '23px',
                                          color: '#393640',
                                          display: 'block',
                                          whiteSpace: 'normal',
                                          overflow: 'visible',
                                          textOverflow: 'clip',
                                          wordBreak: 'break-word',
                                          ...(showTypewriterPlaceholder
                                            ? { position: 'absolute', top: 0, left: 0, right: 0 }
                                            : {}),
                                        }}
                                        className="w-full"
                                      >
                                        {visibleBubbleBodyText}
                                      </motion.span>
                                    </AnimatePresence>
                                  </div>
                                </div>
                              );
                            })()}
                          </button>
                        </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    /* 2. Any task in progress or completed (when not resting): Today with Nova Board */
                    <motion.div
                      key="companion-nova-board"
                      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: {
                          duration: shouldReduceMotion ? 0 : 0.15,
                          ease: 'easeOut',
                        },
                      }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: shouldReduceMotion ? 0 : 0.15,
                          ease: 'easeOut',
                        },
                      }}
                      className="w-full flex justify-center shrink-0"
                    >
                      <div
                        id="today-with-nova-list"
                        role="region"
                        aria-label="Today with Nova"
                        style={{
                          width: 'calc(100% - 40px)',
                          maxWidth: '360px',
                          height: 'auto',
                          borderRadius: '20px',
                          background: 'rgba(255, 255, 255, 0.72)',
                          border: '1px solid rgba(255, 255, 255, 0.80)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          boxShadow: '0 8px 24px rgba(70, 60, 100, 0.06)',
                          padding: '16px 16px 8px 16px',
                          overflow: 'visible',
                        }}
                        className="relative z-10 flex flex-col shrink-0 select-none"
                      >
                        {/* Board Title: "Today with Nova" (13px, 600, 18px, #655C9E, 8px spacing to list) */}
                        <div
                          style={{
                            marginBottom: '8px',
                          }}
                          className="flex items-center shrink-0"
                        >
                          <span
                            id="today-with-nova-title"
                            style={{
                              fontSize: '18px',
                              fontWeight: 600,
                              lineHeight: '24px',
                              color: '#655C9E',
                            }}
                          >
                            Today with Nova
                          </span>
                        </div>

                        {/* 3 Shared Task Rows: min-height 48px, 3-col grid (minmax(0,1fr) auto 12px), gap 8px, py 10px */}
                        <div className="flex flex-col shrink-0">
                          {cardsState.map((item, idx) => {
                            const statusLabel = item.isSkipped
                              ? 'Skipped'
                              : item.planState === 'completed'
                              ? 'Done'
                              : item.planState === 'accepted'
                              ? 'In progress'
                              : 'To try';

                            return (
                              <button
                                key={item.id}
                                id={`today-list-row-${idx}`}
                                data-list-row-index={idx}
                                data-list-row-status={statusLabel}
                                type="button"
                                onClick={() => handleSelectListRow(idx)}
                                style={{
                                  minHeight: '48px',
                                  display: 'grid',
                                  gridTemplateColumns: 'minmax(0, 1fr) auto 12px',
                                  columnGap: '8px',
                                  alignItems: 'center',
                                  paddingTop: '10px',
                                  paddingBottom: '10px',
                                  paddingLeft: '0px',
                                  paddingRight: '0px',
                                  borderBottom:
                                    idx < 2 ? '1px solid rgba(60, 60, 67, 0.07)' : 'none',
                                  background: 'transparent',
                                  borderRadius: '0px',
                                }}
                                className="genki-mobile-focus w-full text-left cursor-pointer active:opacity-75 transition-opacity shrink-0"
                              >
                                {/* Col 1: Task Title (14px, 500, 20px, #34323B, max 2 lines, no strikethrough) */}
                                <span
                                  data-list-row-title={idx}
                                  style={{
                                    fontSize: '15px',
                                    fontWeight: 500,
                                    lineHeight: '22px',
                                    color: '#34323B',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    wordBreak: 'break-word',
                                    textDecoration: 'none',
                                  }}
                                >
                                  {item.plan.title}
                                </span>

                                {/* Col 2: Status (no capsule background, 11px, 500, 16px) */}
                                {item.isSkipped ? (
                                  <span
                                    data-list-row-badge={idx}
                                    style={{
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      lineHeight: '18px',
                                      color: '#85818F',
                                    }}
                                    className="inline-flex items-center whitespace-nowrap"
                                  >
                                    Skipped
                                  </span>
                                ) : item.planState === 'completed' ? (
                                  <span
                                    data-list-row-badge={idx}
                                    style={{
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      lineHeight: '18px',
                                      color: '#52786A',
                                      gap: '4px',
                                    }}
                                    className="inline-flex items-center whitespace-nowrap"
                                  >
                                    <Check
                                      style={{
                                        width: '10px',
                                        height: '10px',
                                        color: '#52786A',
                                        flexShrink: 0,
                                      }}
                                      strokeWidth={2.5}
                                      aria-hidden="true"
                                    />
                                    <span>Done</span>
                                  </span>
                                ) : item.planState === 'accepted' ? (
                                  <span
                                    data-list-row-badge={idx}
                                    style={{
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      lineHeight: '18px',
                                      color: '#655C9E',
                                      gap: '4px',
                                    }}
                                    className="inline-flex items-center whitespace-nowrap"
                                  >
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        width: '5px',
                                        height: '5px',
                                        borderRadius: '9999px',
                                        backgroundColor: '#655C9E',
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span>In progress</span>
                                  </span>
                                ) : (
                                  <span
                                    data-list-row-badge={idx}
                                    style={{
                                      fontSize: '13px',
                                      fontWeight: 500,
                                      lineHeight: '18px',
                                      color: '#85818F',
                                    }}
                                    className="inline-flex items-center whitespace-nowrap"
                                  >
                                    To try
                                  </span>
                                )}

                                {/* Col 3: Right Chevron (12px, #AAA5B5) */}
                                <ChevronRight
                                  style={{
                                    width: '12px',
                                    height: '12px',
                                    color: '#AAA5B5',
                                  }}
                                  strokeWidth={2}
                                  aria-hidden="true"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Hidden 3D/2D debug toggle preserved */}
              <button
                type="button"
                onClick={() => setAvatarMode(prev => prev === '3d' ? '2d' : '3d')}
                className="genki-mobile-focus hidden px-1.5 py-0.5 rounded-full text-[13px] font-medium text-[#8E8E93]/70 hover:text-[#5E5BAE] bg-black/[0.03] hover:bg-[#5E5BAE]/10 active:scale-95 transition-all cursor-pointer select-none border border-black/[0.04]"
                title={avatarMode === '3d' ? "Switch to 2D Nova" : "Switch to 3D Fur Avatar"}
                aria-label="Toggle 3D/2D Avatar"
              >
                {avatarMode === '3d' ? '3D' : '2D'}
              </button>
            </div>
          </div>

          {/* 3. Floating Suggestion Card Carousel: Positioned 8–12px below Nova's visible bottom so Nova's full body & face remain clear */}
          <AnimatePresence>
            {isPlanCardOpen && (
              <motion.div
                key="today-floating-plan-card"
                id="expanded-plan-card"
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 24, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 16, scale: 0.96 }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0.05 }
                    : { duration: 0.32, ease: [0.32, 0.72, 0, 1] }
                }
                style={{
                  bottom:
                    frameSize.height < 700
                      ? `${Math.max(bottomBarHeight + 8, 84)}px`
                      : `${Math.max(bottomBarHeight + 12, 88)}px`,
                }}
                className="absolute inset-x-0 w-full z-30 flex flex-col items-center justify-end pointer-events-none"
              >
                {/* Carousel Track: 1:1 Horizontal Drag + Vertical Scroll Passthrough */}
                <div
                  id="today-suggestion-carousel-track"
                  onPointerDown={handleCarouselPointerDown}
                  onTouchStart={handleCarouselTouchStart}
                  onClickCapture={(e) => {
                    if (
                      didSwipeCarouselRef.current ||
                      performance.now() - lastCarouselSwipeTimeRef.current < 220
                    ) {
                      didSwipeCarouselRef.current = false;
                      e.stopPropagation();
                      e.preventDefault();
                    }
                  }}
                  style={{ touchAction: 'pan-y' }}
                  className="relative w-full grid grid-cols-1 grid-rows-1 place-items-center pointer-events-none select-none"
                >
                  {virtualSlots.map((vIdx) => {
                    const slotCardIdx = ((vIdx % 3) + 3) % 3;
                    const cardItem = cardsState[slotCardIdx];
                    const cardPlan = cardItem.plan;
                    const cardState = cardItem.planState;

                    const isCenterCard = vIdx === activeVirtualIndex;
                    const isSideNeighbor = Math.abs(vIdx - activeVirtualIndex) === 1;

                    const dragProgress = Math.max(
                      -1.15,
                      Math.min(1.15, dragDeltaX / carouselStepX)
                    );
                    const effectiveOffset = vIdx - activeVirtualIndex + dragProgress;
                    const absOffset = Math.abs(effectiveOffset);

                    const translateX = effectiveOffset * carouselStepX;
                    const translateY = Math.pow(Math.min(absOffset, 2.2), 1.05) * 15;
                    const rotate = -effectiveOffset * 10.5;
                    const scale = Math.max(0.82, 1 - absOffset * 0.075);
                    const opacity =
                      absOffset <= 1.15
                        ? 1 - absOffset * 0.05
                        : absOffset >= 1.85
                        ? 0
                        : 0.94 * (1 - (absOffset - 1.15) / 0.7);
                    const zIndex = 30 - Math.round(absOffset * 10);

                    // De-emphasize inner text/buttons and hide Close button on side cards so they act purely as switching cues
                    const innerContentOpacity = Math.max(0.12, 1 - absOffset * 0.88);
                    const closeBtnOpacity = Math.max(0, 1 - absOffset * 2.6);

                    const cardProgress = isCenterCard ? holdProgress : 0;
                    const isCardSkipped = Boolean(cardItem.isSkipped);
                    const pauseOverlayMode: 'rest' | 'skipped' | null = isRestDay
                      ? 'rest'
                      : isCardSkipped
                      ? 'skipped'
                      : null;
                    const isCardPaused = pauseOverlayMode !== null;

                    return (
                      <div
                        key={vIdx}
                        ref={isCenterCard ? planCardRef : undefined}
                        data-card-index={slotCardIdx}
                        data-card-active={isCenterCard ? 'true' : 'false'}
                        data-card-offset={vIdx - activeVirtualIndex}
                        aria-hidden={!isCenterCard && !isSideNeighbor}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCenterCard && isSideNeighbor) {
                            setActiveVirtualIndex(vIdx);
                          }
                        }}
                        style={{
                          width: `${carouselCardWidth}px`,
                          minHeight: frameSize.height < 700 ? '172px' : '194px',
                          transform: `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(2)}deg)`,
                          opacity,
                          zIndex,
                          transition: isDraggingCarousel
                            ? 'none'
                            : shouldReduceMotion
                            ? 'transform 80ms linear, opacity 80ms linear'
                            : 'transform 430ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease-out',
                          willChange: 'transform, opacity',
                          isolation: 'isolate',
                        }}
                        className={`relative col-start-1 row-start-1 rounded-[26px] overflow-hidden today-suggestion-card border border-white/95 flex flex-col justify-between ${
                          isCenterCard
                            ? 'shadow-[0_14px_36px_rgba(38,38,63,0.16)] pointer-events-auto'
                            : isSideNeighbor
                            ? 'shadow-[0_8px_22px_rgba(38,38,63,0.08)] pointer-events-auto cursor-pointer'
                            : 'pointer-events-none'
                        }`}
                      >
                        {/* Close Card Button: 44x44px touch target kept above rest overlay so user can always close */}
                        <button
                          type="button"
                          id={isCenterCard ? 'close-plan-card-btn' : undefined}
                          tabIndex={isCenterCard ? 0 : -1}
                          style={{
                            opacity: closeBtnOpacity,
                            top: '0px',
                            right: '6px',
                            width: '44px',
                            height: '44px',
                            zIndex: isCenterCard ? 40 : 20,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCenterCard) {
                              setIsPlanCardOpen(false);
                            }
                          }}
                          className={`genki-mobile-control genki-mobile-icon-well absolute rounded-full flex items-center justify-center group active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#5E5BAE] ${
                            isCenterCard ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none'
                          }`}
                          aria-label="Close suggestion card"
                        >
                          <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[#6C6C70] group-hover:text-[#1C1C1E] bg-[#F2F2F7] group-hover:bg-[#E5E5EA] transition-colors pointer-events-none">
                            <X className="w-3.5 h-3.5 stroke-[2.2]" />
                          </span>
                        </button>

                        {/* Top Card Header: Compacted, 20px horizontal padding, 44x44 close hit area kept clear of title & thumbnail */}
                        <div
                          inert={isCardPaused ? true : undefined}
                          style={{ opacity: innerContentOpacity }}
                          className={`px-[20px] pt-0 w-full shrink-0 ${
                            isCenterCard && !isCardPaused ? 'pointer-events-auto' : 'pointer-events-none'
                          }`}
                        >
                          <div className="h-[44px] flex items-center pr-[36px]">
                            <div className="relative h-4 flex-1 select-none">
                              <span
                                className={`text-[13px] font-medium tracking-normal text-[#5E5BAE] absolute inset-0 transition-opacity ${
                                  shouldReduceMotion ? 'duration-75' : 'duration-200'
                                } ${
                                  cardState === 'suggested'
                                    ? 'opacity-100'
                                    : 'opacity-0 pointer-events-none'
                                }`}
                              >
                                Today’s suggestion
                              </span>
                              <span
                                className={`text-[13px] font-medium tracking-normal text-[#5E5BAE] absolute inset-0 transition-opacity ${
                                  shouldReduceMotion ? 'duration-75' : 'duration-250 delay-100'
                                } ${
                                  cardState !== 'suggested'
                                    ? 'opacity-100'
                                    : 'opacity-0 pointer-events-none'
                                }`}
                              >
                                YOUR PLAN
                              </span>
                            </div>
                          </div>

                          {/* Title Row: Full width in suggested state; during/before Adjust wipe holds old snapshot then wipes to new */}
                          {(() => {
                            const isPendingOldPreview =
                              isCenterCard &&
                              !isChatOpen &&
                              pendingPlanUpdate?.cardId === cardItem.id;
                            const rowDisplayPlan = isPendingOldPreview
                              ? pendingPlanUpdate.oldPlan
                              : cardPlan;
                            const rowWipeAnim =
                              isCenterCard && activeCardWipeAnim?.cardId === cardItem.id
                                ? activeCardWipeAnim
                                : null;

                            return (
                              <CardContentWipeRow
                                displayPlan={rowDisplayPlan}
                                wipeAnim={rowWipeAnim}
                                shouldReduceMotion={Boolean(shouldReduceMotion)}
                                isCenterCard={isCenterCard}
                                cardState={cardState}
                                isThumbnailHiddenForDetail={
                                  isCenterCard &&
                                  ((detailTransitionPhase === 'opening' && detailTargetRect !== null) ||
                                    detailTransitionPhase === 'open' ||
                                    detailTransitionPhase === 'closing')
                                }
                                cardContainerRef={planCardRef}
                                cardSweepGlowRef={cardSweepGlowRef}
                                cardThumbnailRef={cardThumbnailRef}
                                didSwipeCarouselRef={didSwipeCarouselRef}
                                lastCarouselSwipeTimeRef={lastCarouselSwipeTimeRef}
                                onOpenDetail={openDetailWithTransition}
                                onWipeComplete={handleCardWipeComplete}
                              />
                            );
                          })()}
                        </div>

                        {/* Card Body Content: 20px horizontal padding */}
                        <div
                          ref={isCenterCard ? cardContentRef : undefined}
                          inert={isCardPaused ? true : undefined}
                          style={{ opacity: innerContentOpacity }}
                          className={`px-[20px] ${
                            cardState === 'suggested' ? 'pb-3' : 'pb-1.5'
                          } w-full flex-1 flex flex-col justify-between ${
                            isCenterCard && !isCardPaused ? 'pointer-events-auto' : 'pointer-events-none'
                          }`}
                        >
                          {/* 2. SUGGESTED EXTRA: 10px below title -> Two-Column Content Row (minmax(0,1fr) + 80px/72px thumb, 12px gap) -> 18px gap -> 2 Buttons (>=44px) */}
                          {cardState === 'suggested' ? (
                            <div style={{ marginTop: '10px' }} className="flex-1 flex flex-col justify-between">
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    frameSize.width <= 375 ? 'minmax(0, 1fr) 72px' : 'minmax(0, 1fr) 80px',
                                  columnGap: '12px',
                                  alignItems: 'start',
                                  minHeight: frameSize.width <= 375 ? '60px' : '64px',
                                }}
                                className="w-full"
                              >
                                <p
                                  style={{
                                    fontSize: '15px',
                                    lineHeight: '22px',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                  }}
                                  className="text-[#6C6C70] font-normal break-words m-0"
                                >
                                  {cardPlan.subtitle}
                                </p>

                                <SuggestionMediaThumbnail
                                  src={cardPlan.thumbnailUrl}
                                  title={cardPlan.title}
                                  mediaType={cardPlan.mediaType}
                                  compact={frameSize.width <= 375}
                                  isHiddenForTransition={
                                    isCenterCard &&
                                    ((detailTransitionPhase === 'opening' && detailTargetRect !== null) ||
                                      detailTransitionPhase === 'open' ||
                                      detailTransitionPhase === 'closing')
                                  }
                                  isInteractive={isCenterCard}
                                  buttonRef={isCenterCard ? cardThumbnailRef : undefined}
                                  didSwipeCarouselRef={didSwipeCarouselRef}
                                  lastCarouselSwipeTimeRef={lastCarouselSwipeTimeRef}
                                  onOpenDetail={openDetailWithTransition}
                                />
                              </div>

                              <div style={{ marginTop: '18px' }} className="grid grid-cols-2 gap-2.5">
                                <button
                                  type="button"
                                  data-card-action="sounds-good"
                                  tabIndex={isCenterCard ? 0 : -1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCenterCard) {
                                      handleSoundsGood(slotCardIdx);
                                    }
                                  }}
                                  className="genki-mobile-control genki-mobile-primary min-h-[44px] px-3.5 rounded-[15px] bg-[#5E5BAE] hover:bg-[#524FA0] active:bg-[#484591] active:scale-[0.98] text-white text-[13.5px] font-semibold shadow-[0_4px_14px_rgba(94,91,174,0.22)] transition-colors flex items-center justify-center text-center cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                                >
                                  Sounds good
                                </button>
                                <button
                                  type="button"
                                  data-card-action="adjust-initial"
                                  tabIndex={isCenterCard ? 0 : -1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isCenterCard) {
                                      handleInitialPlanB(slotCardIdx);
                                    }
                                  }}
                                  className="genki-mobile-control genki-mobile-secondary min-h-[44px] w-full px-3.5 rounded-[15px] bg-[#F2F2F7] hover:bg-[#E5E5EA] active:scale-[0.98] text-[#1C1C1E] text-[13.5px] font-semibold transition-colors flex items-center justify-center text-center cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                                >
                                  Adjust
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* 3. ACCEPTED / COMPLETED EXTRA: Circular Wave Done Button + Auxiliary Operations */
                            <div className="flex-1 flex flex-col justify-between gap-1 pt-0.5">
                              {/* Horizontally Centered Circular Wave Done Button + "Hold to complete" */}
                              <div className="flex flex-col items-center justify-center">
                                {(() => {
                                  const progressVal =
                                    cardState === 'completed'
                                      ? 1
                                      : Math.max(0, Math.min(1, cardProgress / 100));
                                  const waterY = 76 * (1 - progressVal);
                                  const ampCoef = shouldReduceMotion
                                    ? 0
                                    : Math.max(0, Math.min(1, progressVal / 0.12, (1 - progressVal) / 0.12));
                                  const mainAmp = 2 * ampCoef;
                                  const fgAmp = 1.5 * ampCoef;
                                  const fgOpacity =
                                    progressVal >= 1 ? 0 : 0.25 * Math.min(1, (1 - progressVal) / 0.06);

                                  let mainWavePath = '';
                                  let fgWavePath = '';
                                  if (progressVal >= 1) {
                                    mainWavePath = 'M 0 76 L 0 0 L 76 0 L 76 76 Z';
                                  } else if (progressVal > 0) {
                                    const mainPts: string[] = [];
                                    const fgPts: string[] = [];
                                    for (let x = 0; x <= 76; x += 2) {
                                      const y1 =
                                        waterY +
                                        mainAmp *
                                          Math.sin(((x / 56) - (waveTimeSec / 1.6)) * 2 * Math.PI);
                                      mainPts.push(`${x} ${Math.max(0, Math.min(76, y1)).toFixed(2)}`);

                                      const y2 =
                                        waterY +
                                        fgAmp *
                                          Math.sin(((x / 42) + (waveTimeSec / 2.1) + 0.35) * 2 * Math.PI);
                                      fgPts.push(`${x} ${Math.max(0, Math.min(76, y2)).toFixed(2)}`);
                                    }
                                    mainWavePath = `M 0 76 L ${mainPts.join(' L ')} L 76 76 Z`;
                                    fgWavePath = `M 0 76 L ${fgPts.join(' L ')} L 76 76 Z`;
                                  }

                                  const clipId = `waveClip-${vIdx}`;

                                  return (
                                    <button
                                      type="button"
                                      tabIndex={isCenterCard ? 0 : -1}
                                      onMouseDown={isCenterCard ? startHold : undefined}
                                      onMouseUp={isCenterCard ? cancelHold : undefined}
                                      onMouseLeave={isCenterCard ? cancelHold : undefined}
                                      onTouchStart={isCenterCard ? startHold : undefined}
                                      onTouchEnd={isCenterCard ? cancelHold : undefined}
                                      onTouchCancel={isCenterCard ? cancelHold : undefined}
                                      onTouchMove={isCenterCard ? handleTouchMove : undefined}
                                      onContextMenu={(e) => e.preventDefault()}
                                      onKeyDown={isCenterCard ? handleDoneKeyDown : undefined}
                                      onKeyUp={isCenterCard ? handleDoneKeyUp : undefined}
                                      onBlur={isCenterCard ? cancelHold : undefined}
                                      onClick={isCenterCard ? handleDoneClick : undefined}
                                      aria-label={
                                        cardState === 'completed'
                                          ? 'Plan completed'
                                          : 'Hold for 3 seconds to complete'
                                      }
                                      style={{
                                        width: '76px',
                                        height: '76px',
                                        touchAction: 'none',
                                        transform:
                                          isCenterCard && isCompletedPop && !shouldReduceMotion
                                            ? 'scale(1.04)'
                                            : 'scale(1)',
                                        transition: shouldReduceMotion
                                          ? 'none'
                                          : 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                                      }}
                                      className="genki-mobile-focus relative rounded-full overflow-hidden flex items-center justify-center select-none cursor-pointer bg-[#EFEDF8] border border-[rgba(100,88,177,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6558B1]"
                                    >
                                      <svg
                                        width="76"
                                        height="76"
                                        viewBox="0 0 76 76"
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                        aria-hidden="true"
                                      >
                                        <defs>
                                          <clipPath id={clipId}>
                                            {mainWavePath ? <path d={mainWavePath} /> : <rect x="0" y="76" width="76" height="0" />}
                                          </clipPath>
                                        </defs>

                                        {/* Uncovered "Done" text in #6558B1 */}
                                        {cardState !== 'completed' && (
                                          <text
                                            x="38"
                                            y="38"
                                            dominantBaseline="central"
                                            textAnchor="middle"
                                            fontSize="16"
                                            fontWeight="600"
                                            fill="#6558B1"
                                          >
                                            Done
                                          </text>
                                        )}

                                        {/* Main solid water body (#6558B1) & translucent foreground wave (#8B7CC8 @ 0.25) */}
                                        {mainWavePath && (
                                          <path d={mainWavePath} fill="#6558B1" />
                                        )}
                                        {fgWavePath && fgOpacity > 0 && (
                                          <path d={fgWavePath} fill="#8B7CC8" fillOpacity={fgOpacity} />
                                        )}

                                        {/* White "Done" text clipped strictly to water body */}
                                        {cardState !== 'completed' && mainWavePath && (
                                          <g clipPath={`url(#${clipId})`}>
                                            <text
                                              x="38"
                                              y="38"
                                              dominantBaseline="central"
                                              textAnchor="middle"
                                              fontSize="16"
                                              fontWeight="600"
                                              fill="#FFFFFF"
                                            >
                                              Done
                                            </text>
                                          </g>
                                        )}
                                      </svg>

                                      {cardState === 'completed' && (
                                        <Check className="relative z-10 w-6 h-6 stroke-[2.75] text-white pointer-events-none" />
                                      )}
                                    </button>
                                  );
                                })()}

                                <span
                                  style={{ marginTop: '10px', fontSize: '12px', lineHeight: '16px' }}
                                  className="whitespace-nowrap text-center font-normal"
                                >
                                  {cardState === 'completed' ? (
                                    <span className="text-[#6558B1] font-semibold">Completed</span>
                                  ) : (
                                    <span className="text-[#8B849F]">Hold to complete</span>
                                  )}
                                </span>
                              </div>

                              {/* Bottom Section: Side-by-Side "Adjust" and "Not today" (or Undo completion), >=44px hit height */}
                              <div className="flex items-center justify-center gap-3 pt-0.5 border-t border-black/[0.05]">
                                {cardState === 'completed' ? (
                                  <button
                                    type="button"
                                    data-card-action="undo-completion"
                                    tabIndex={isCenterCard ? 0 : -1}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isCenterCard) {
                                        undoCardCompleted(slotCardIdx);
                                      }
                                    }}
                                    className="genki-mobile-control genki-mobile-tertiary min-h-[44px] px-6 rounded-[12px] text-[13px] leading-[18px] font-semibold text-[#5E5BAE] hover:text-[#494692] hover:bg-[#5E5BAE]/8 transition-colors whitespace-nowrap underline underline-offset-3 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                                  >
                                    Undo completion
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      data-card-action="adjust-accepted"
                                      tabIndex={isCenterCard ? 0 : -1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isCenterCard) {
                                          handleAcceptedPlanB(slotCardIdx);
                                        }
                                      }}
                                      className="genki-mobile-control genki-mobile-secondary min-h-[44px] px-5 rounded-[12px] text-[13px] leading-[18px] font-semibold text-[#5E5BAE] hover:text-[#494692] hover:bg-[#5E5BAE]/8 transition-colors whitespace-nowrap cursor-pointer active:scale-95 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                                    >
                                      Adjust
                                    </button>
                                    <button
                                      type="button"
                                      data-card-action="not-today"
                                      tabIndex={isCenterCard ? 0 : -1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isCenterCard) {
                                          handleNotToday(slotCardIdx);
                                        }
                                      }}
                                      className="genki-mobile-control genki-mobile-tertiary min-h-[44px] px-5 rounded-[12px] text-[13px] leading-[18px] font-semibold text-[#6C6C70] hover:text-[#1C1C1E] hover:bg-black/[0.04] transition-colors whitespace-nowrap cursor-pointer active:scale-95 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE]"
                                    >
                                      Not today
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Full-Card Decorative Replacement Overlay: 48px light sweep + 9 scattered 4-pointed SVG sparkles */}
                        {isCenterCard && activeCardWipeAnim?.cardId === cardItem.id && !shouldReduceMotion && (
                          <div
                            aria-hidden="true"
                            data-card-effect-overlay="true"
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: 'inherit',
                              overflow: 'hidden',
                              pointerEvents: 'none',
                              zIndex: 30,
                            }}
                          >
                            <div
                              ref={cardSweepGlowRef}
                              data-card-wipe-glow="true"
                              style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: '48px',
                                transform: 'translate3d(-52px, 0, 0)',
                                pointerEvents: 'none',
                                background:
                                  'linear-gradient(90deg, transparent 0%, rgba(177,153,232,0.18) 25%, rgba(210,193,250,0.48) 46%, rgba(255,255,255,0.85) 52%, rgba(210,193,250,0.24) 70%, transparent 100%)',
                              }}
                            />

                            <div data-card-sparkles="true" className="absolute inset-0 pointer-events-none">
                              {CARD_UPDATE_SPARKLES.map((sp, sIdx) => (
                                <span
                                  key={sIdx}
                                  data-card-sparkle-idx={sIdx}
                                  style={{
                                    position: 'absolute',
                                    left: sp.left,
                                    top: sp.top,
                                    transform: `translate(-50%, -50%) translate(${sp.nudgeX}px, ${sp.nudgeY}px)`,
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <svg
                                    width={sp.size}
                                    height={sp.size}
                                    viewBox="0 0 24 24"
                                    style={{ animationDelay: `${sp.delayMs}ms` }}
                                    className="block genki-sparkle-item"
                                  >
                                    <path d={SPARKLE_STAR_PATH} fill={sp.color} />
                                  </svg>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reusable Paused Overlay: Global Rest Day (priority) or Single-Task Skip */}
                        <CardPausedOverlay
                          mode={pauseOverlayMode}
                          isCenterCard={isCenterCard}
                          shouldReduceMotion={Boolean(shouldReduceMotion)}
                          onResume={
                            pauseOverlayMode === 'rest'
                              ? handleExitRestDay
                              : () => handleResumeSkippedCard(cardItem.id)
                          }
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Indicator Dots: Clear spacing from card bottom above and Talk to Nova below */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2.5 mb-0 flex items-center justify-center gap-1.5 pointer-events-auto z-30 py-0.5 px-2"
                  role="tablist"
                  aria-label="Suggestion cards pagination"
                >
                  {[0, 1, 2].map((dotIdx) => {
                    const isDotActive = activeCardIndex === dotIdx;
                    return (
                      <button
                        key={dotIdx}
                        type="button"
                        role="tab"
                        aria-selected={isDotActive}
                        aria-label={`Suggestion card ${dotIdx + 1}`}
                        onClick={() => {
                          if (dotIdx === activeCardIndex) return;
                          const diff = ((dotIdx - activeCardIndex + 3) % 3);
                          const step = diff === 1 ? 1 : -1;
                          setActiveVirtualIndex((prev) => prev + step);
                        }}
                        className={`genki-mobile-focus h-1.5 rounded-full transition-all duration-300 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5E5BAE] ${
                          isDotActive
                            ? 'w-4 bg-[#1C1C1E]/75'
                            : 'w-1.5 bg-[#1C1C1E]/20 hover:bg-[#1C1C1E]/35'
                        }`}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3. Main Body Content: Plan View (Merged My Plan + Memory) */}
        <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'Plan' ? 'flex' : 'hidden'}`}>
          {(hasVisitedPlan || activeTab === 'Plan') && (
            <React.Suspense fallback={<PlanLoadingView />}>
              <LazyMyPlanView
                phoneFrameRef={phoneFrameRef}
                isActive={activeTab === 'Plan'}
                planEntryToken={planEntryCount}
                previewProfileId={activePreviewProfileId}
                planStore={planStore}
                onUpdatePlanStore={updatePlanStore}
                activityRecords={activityRecords}
                restRecords={restRecords}
                onAddManualActivity={handleAddManualActivity}
                onUpdateActivity={handleUpdateActivity}
                onDeleteActivity={handleDeleteActivity}
                onUpsertRestDay={handleUpsertRestDay}
                onDeleteRestRecord={handleDeleteRestRecord}
                onClearDayRecords={handleClearDayRecords}
                onNavigateToToday={() => setActiveTab('Today')}
                isNovaChatOpen={isChatOpen}
                onOpenPlanNovaChat={openPlanNovaChat}
                onOverlayChange={setIsPlanOverlayOpen}
              />
            </React.Suspense>
          )}
        </div>

        {/* 3. Main Body Content: Discover View */}
        <div className={`flex-1 flex flex-col min-h-0 ${activeTab === 'Discover' ? 'flex' : 'hidden'}`}>
          {(hasVisitedDiscover || activeTab === 'Discover') && (
            <React.Suspense fallback={<DiscoverLoadingView />}>
              <LazyDiscoverView
                phoneFrameRef={phoneFrameRef}
                isActive={activeTab === 'Discover'}
                savedItemIds={savedItemIds}
                onToggleSave={handleToggleSave}
                isSavedSheetOpen={isSavedSheetOpen}
                setIsSavedSheetOpen={setIsSavedSheetOpen}
              />
            </React.Suspense>
          )}
        </div>

        {/* 4. Shared Single-Row Floating Bottom Navigation: Left Tab Capsule + Right Morphing Nova Bubble */}
        <SharedBottomNav
          activeTab={activeTab as PrimaryTabId}
          onSelectTab={(nextTab) => {
            if (nextTab === 'Plan') {
              setHasVisitedPlan(true);
              if (activeTab !== 'Plan') {
                setPlanEntryCount((count) => count + 1);
              }
            }
            if (nextTab === 'Discover') setHasVisitedDiscover(true);
            setActiveTab(nextTab);
          }}
          onPrefetchTab={(tabId) => {
            if (tabId === 'Plan') void loadPlanView().catch(() => {});
            if (tabId === 'Discover') void loadDiscoverView().catch(() => {});
          }}
          onOpenNovaChat={openGeneralNovaChat}
          isHidden={isSharedBottomNavHidden}
          barRef={bottomBarRef}
          shouldReduceMotion={shouldReduceMotion}
        />

        {/* 6. Rich Media Plan Detail Sheet with Smooth Entrance & Exit */}
        <AnimatePresence>
          {isDetailOpen && (
            <div className="absolute inset-0 z-50 overflow-hidden flex flex-col justify-end pointer-events-auto">
              {/* Dimmed Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={shouldReduceMotion ? { duration: 0.05 } : { duration: 0.36, ease: "easeInOut" }}
                onClick={closeDetailWithTransition}
                className="absolute inset-0 bg-black/20 backdrop-blur-xs"
              />

              {/* Sheet Container */}
              <motion.div
                ref={detailSheetRef}
                initial={shouldReduceMotion ? { y: 0, opacity: 0 } : { y: '100%' }}
                animate={shouldReduceMotion ? { y: 0, opacity: 1 } : { y: 0 }}
                exit={shouldReduceMotion ? { y: 0, opacity: 0 } : { y: '100%' }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.05 }
                    : {
                        duration: 0.40,
                        ease: [0.32, 0.72, 0, 1],
                      }
                }
                className="relative bg-white/95 backdrop-blur-2xl rounded-t-[32px] border-t border-white/90 shadow-[0_-16px_48px_rgba(28,28,45,0.12)] flex flex-col h-[75%] max-h-[580px] z-10 text-[#1C1C1E]"
              >
                {/* Sheet Header: Apple HIG Clean Title, No Redundant Pills */}
                <div 
                  ref={detailHeaderRef}
                  className="px-5 pt-4 pb-3 border-b border-black/[0.06] flex items-center justify-between shrink-0"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="genki-mobile-sheet-title text-[19px] sm:text-[20px] font-bold text-[#1C1C1E] tracking-[-0.02em] leading-tight">
                      {currentPlan.detailTitle}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeDetailWithTransition}
                    className="genki-mobile-control genki-mobile-icon-well w-8 h-8 rounded-full flex items-center justify-center text-[#6C6C70] hover:text-[#1C1C1E] bg-[#F2F2F7] hover:bg-[#E5E5EA] active:scale-95 transition-colors cursor-pointer shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4 stroke-[2.2]" />
                  </button>
                </div>

                {/* Sheet Content: Media & Clean Guideline Rows (No Nested Card-in-Card) */}
                <div
                  ref={detailScrollBodyRef}
                  className="flex-1 overflow-y-auto px-5 py-4 space-y-6"
                >
                  {/* Media Hero Banner: Clean guide/article cover with matching resource */}
                  <div
                    ref={detailMediaHeroRef}
                    data-detail-media-hero="true"
                    className="relative w-full h-40 sm:h-44 rounded-[22px] overflow-hidden border border-black/[0.04] shadow-xs shrink-0"
                  >
                    <div
                      className={`w-full h-full relative ${
                        detailTransitionPhase === 'open' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <img
                        src={currentPlan.thumbnailUrl}
                        alt={currentPlan.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-center"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent flex items-end p-4 sm:p-4.5">
                        <div className="flex items-center justify-between w-full text-white">
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="text-[15px] font-semibold leading-[22px] tracking-[-0.01em]">
                              {currentPlan.audioTitle}
                            </div>
                            <div className="text-[13px] sm:text-[13px] text-white/85 mt-0.5 font-normal">
                              {currentPlan.audioSubtitle}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Full Description & Clean Practical Guidelines */}
                  <motion.div
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0.05 }
                        : {
                            delay: 0.16,
                            duration: 0.26,
                            ease: "easeOut",
                          }
                    }
                    className="space-y-4 pt-1"
                  >
                    <p
                      id="detail-full-description"
                      className="genki-mobile-body text-[14px] text-[#3C3C43] leading-[21px]"
                    >
                      {currentPlan.fullDescription}
                    </p>

                    <div className="h-px bg-black/[0.05]" />

                    <h4 className="genki-mobile-row-title text-[14px] font-semibold text-[#1C1C1E] tracking-tight">
                      Gentle Guidelines
                    </h4>
                    
                    <div className="space-y-3">
                      {/* Tip 1 */}
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#5E5BAE]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-[#5E5BAE] stroke-[2.2]" />
                        </div>
                        <p className="genki-mobile-body text-[13.5px] text-[#3C3C43] leading-relaxed flex-1">
                          {currentPlan.tip1}
                        </p>
                      </div>

                      <div className="h-px bg-black/[0.04]" />

                      {/* Tip 2 */}
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#FF7A32]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#FF7A32] stroke-[2.2]" />
                        </div>
                        <p className="genki-mobile-body text-[13.5px] text-[#3C3C43] leading-relaxed flex-1">
                          {currentPlan.tip2}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* Sheet Bottom Safe Area & Action */}
                <div className="p-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white/95 backdrop-blur-md flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={closeDetailWithTransition}
                    className="genki-mobile-control genki-mobile-secondary w-full py-3 rounded-[18px] bg-[#F2F2F7] hover:bg-[#E5E5EA] text-[#5E5BAE] text-[13.5px] font-semibold text-center active:scale-[0.99] transition-colors min-h-[44px] cursor-pointer"
                  >
                    Back to Today
                  </button>
                  <div className="w-32 h-1 bg-[#1C1C1E]/20 rounded-full mx-auto" />
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Single Persistent Hidden File Input shared by Home '+' and Chat Drawer '+' */}
        <input
          ref={chatFileInputRef}
          id="chat-attachment-file-input"
          type="file"
          multiple
          accept="image/*,.pdf,application/pdf,.txt,text/plain"
          onChange={handleAttachmentSelect}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* 7. AI Conversation Drawer / Sheet with smooth entrance and exit */}
        <AnimatePresence onExitComplete={() => setIsChatSheetExited(true)}>
          {isChatOpen && (
            <div
              id="nova-chat-drawer-overlay"
              className={`absolute inset-0 ${activePlanChat ? 'z-[70]' : 'z-40'} overflow-hidden flex flex-col justify-end pointer-events-auto`}
            >
              {/* Dimmed Backdrop (Softened to bg-black/16 backdrop-blur-[1.5px] so Home contours remain discernible) */}
              <motion.div 
                onClick={closeChatWithTransition} 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={shouldReduceMotion ? { duration: 0.05 } : { duration: 0.36, ease: "easeInOut" }}
                className="absolute inset-0 bg-black/16 backdrop-blur-[1.5px]" 
              />

              {/* Drawer Sheet */}
              <motion.div 
                ref={chatSheetRef}
                initial={shouldReduceMotion ? { y: 0, opacity: 0 } : { y: '100%' }}
                animate={shouldReduceMotion ? { y: 0, opacity: 1 } : { y: 0 }}
                exit={shouldReduceMotion ? { y: 0, opacity: 0 } : { y: '100%' }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0.05 }
                    : {
                        duration: 0.40,
                        ease: [0.32, 0.72, 0, 1],
                      }
                }
                className={`relative bg-white/95 backdrop-blur-2xl rounded-t-[32px] border-t border-white/90 shadow-[0_-16px_48px_rgba(28,28,45,0.14)] flex flex-col ${
                  activePlanChat ? 'h-[86%] max-h-[720px]' : 'h-[74%] max-h-[580px]'
                } z-10 text-[#1C1C1E]`}
              >
                {/* Close Button Top-Right (Independent of Nova) */}
                <button
                  type="button"
                  onClick={closeChatWithTransition}
                  className="genki-mobile-control genki-mobile-icon-well absolute top-3.5 right-4 z-40 w-8 h-8 rounded-full flex items-center justify-center text-[#6C6C70] hover:text-[#1C1C1E] bg-[#F2F2F7] hover:bg-[#E5E5EA] active:scale-95 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 stroke-[2.2]" />
                </button>

                {/* Header: Plan edit action title + compact Nova avatar, or centered "Nova" for Today chat */}
                {activePlanChat ? (
                  <div className="pt-4 pb-3 px-5 pr-14 border-b border-black/[0.06] flex items-center gap-2.5 shrink-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#F3F0FA] flex items-center justify-center">
                      <FurryNovaStaticAvatar size={32} isListening={isTyping} className="w-8 h-8" />
                    </div>
                    <div className="min-w-0">
                      <h3
                        id="nova-chat-header-title"
                        className="text-[17px] leading-[22px] font-bold text-[#1C1C1E] tracking-tight truncate"
                      >
                        {activePlanChat.actionTitle}
                      </h3>
                      <p className="text-[12px] leading-[16px] text-[#787287] truncate">
                        Nova · {activePlanChat.sourceLabel}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="pt-14 pb-2 px-5 border-b border-black/[0.06] flex items-center justify-center shrink-0">
                    <h3 className="genki-mobile-sheet-title text-[17px] font-bold text-[#1C1C1E] tracking-tight text-center">
                      Nova
                    </h3>
                  </div>
                )}

                {/* Animated Inner Content (Header, Messages, Input) */}
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.05 }
                      : {
                          delay: 0.16,
                          duration: 0.26,
                          ease: "easeOut",
                        }
                  }
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  {/* Chat Messages Body */}
                  <div 
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                    className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3.5 text-[15px] leading-[22px]"
                  >
                    {chatMessages.map((msg) => {
                      // If AI message has options, render as a genuine frosted chat bubble
                      if (msg.sender === 'ai' && msg.options && msg.options.length > 0) {
                        return (
                          <div
                            key={msg.id}
                            className="flex flex-col items-start transition-opacity duration-200"
                          >
                            <div className="max-w-[85%] bg-[#F2F2F7]/90 rounded-[22px] rounded-bl-xs border border-black/[0.04] p-4 shadow-2xs space-y-2.5">
                              {/* Suggestion Text */}
                              <p className="genki-mobile-body text-[13.5px] leading-relaxed text-[#1C1C1E]">
                                {msg.text}
                              </p>

                              {/* Action Options: If active (not disabled), show all selectable options */}
                              {!msg.disabled && (
                                <div className="flex flex-col items-start gap-2 pt-1">
                                  {msg.options.map((opt, optIdx) => (
                                    <button
                                      key={optIdx}
                                      type="button"
                                      onClick={() => handleOptionClick(opt, msg.id)}
                                      className="genki-mobile-control genki-mobile-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[16px] border border-[#5E5BAE]/20 bg-[#F4EEFE] hover:bg-[#EDE7FB] active:scale-[0.98] text-[#5E5BAE] text-[13px] leading-[18px] font-semibold text-left transition-colors select-none min-h-[38px] shadow-2xs cursor-pointer"
                                    >
                                      <span>{opt.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* If handled/disabled message: unselected operations are collapsed.
                                  Only the chosen option (if any) is shown as a subtle, non-clickable status chip. */}
                              {msg.disabled && msg.selectedOptionLabel && (
                                <div className="pt-0.5">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[14px] border border-[#5E5BAE]/20 bg-[#EBE7FA]/80 text-[13px] font-medium text-[#5E5BAE] select-none cursor-default">
                                    <Check className="w-3 h-3 stroke-[2.5] text-[#5E5BAE]" />
                                    <span>{msg.selectedOptionLabel}</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // Standard chat bubble (e.g. user messages or regular AI text)
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] px-4 py-2.5 rounded-[20px] ${
                              msg.sender === 'user'
                                ? 'bg-[#5E5BAE] text-white rounded-br-xs shadow-[0_3px_12px_rgba(94,91,174,0.2)] font-medium'
                                : 'bg-[#F2F2F7]/90 text-[#1C1C1E] border border-black/[0.04] rounded-bl-xs shadow-2xs'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      );
                    })}
                    {activePlanChat && (
                      <div className="pt-1">
                        <React.Suspense
                          fallback={
                            <div className="w-full h-24 rounded-[20px] bg-white/80 border border-black/[0.06] animate-pulse" />
                          }
                        >
                          <LazyPlanNovaChatWidget
                            key={activePlanChat.id}
                            request={activePlanChat}
                            incomingTextEvent={planChatTextEvent}
                            onAppendNovaNotice={handleAppendPlanNovaNotice}
                            onClose={closeChatWithTransition}
                          />
                        </React.Suspense>
                      </div>
                    )}
                    <div ref={chatMessagesEndRef} />
                  </div>

                  {/* Chat Input Bar inside sheet with Home Indicator safe area */}
                  <form
                    onSubmit={handleSendChatMessage}
                    className="p-4 pb-6 border-t border-black/[0.06] bg-white/95 backdrop-blur-md shrink-0 flex flex-col gap-2"
                  >
                    {/* Compact Attachment Preview Area (expands above input bar, naturally shrinking message scroll region) */}
                    {chatAttachments.length > 0 && (
                      <div
                        id="chat-attachment-preview"
                        className="flex flex-col gap-1.5 max-h-[112px] overflow-y-auto rounded-[14px] bg-[#F7F6FA] border border-black/[0.06] px-2.5 py-2"
                      >
                        {chatAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 min-w-0"
                          >
                            {att.kind === 'image' && att.previewUrl ? (
                              <img
                                src={att.previewUrl}
                                alt=""
                                className="w-9 h-9 rounded-[8px] object-cover shrink-0 border border-black/[0.06]"
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                className="w-9 h-9 rounded-[8px] bg-[#ECEAF4] text-[#5E5BAE] flex items-center justify-center shrink-0"
                              >
                                <FileText className="w-4 h-4 stroke-[1.75]" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 flex flex-col">
                              <span className="text-[13px] leading-[18px] font-medium text-[#1C1C1E] truncate">
                                {att.name}
                              </span>
                              <span className="text-[11px] leading-[15px] text-[#70677F]">
                                Not sent to Nova
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(att.id)}
                              aria-label={`Remove ${att.name}`}
                              className="genki-mobile-focus w-8 h-8 min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center text-[#70677F] hover:bg-black/[0.06] active:bg-black/[0.1] transition-colors shrink-0 cursor-pointer"
                            >
                              <X className="w-4 h-4 stroke-[2]" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      id="chat-input-pill"
                      className="bg-[#F2F2F7] rounded-full pl-1.5 pr-1.5 py-1 flex items-center border border-black/[0.04] shadow-2xs focus-within:border-[#5E5BAE]/60 focus-within:ring-2 focus-within:ring-[#5E5BAE]/15 transition-all min-w-0"
                    >
                      <button
                        type="button"
                        id="chat-add-attachment-btn"
                        onClick={() => handleAttachmentButtonClick('drawer')}
                        aria-label="Add attachment"
                        className="genki-chat-attach-btn mr-[4px]"
                      >
                        <Plus className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <input
                        ref={chatInputRef}
                        type="text"
                        value={sheetInput}
                        onChange={handleInputChange}
                        onFocus={() => {
                          isNearBottomRef.current = true;
                          setTimeout(() => {
                            chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                          }, 150);
                        }}
                        placeholder={inputPlaceholder}
                        className="genki-mobile-input flex-1 min-w-0 bg-transparent text-[16px] leading-[22px] text-[#1C1C1E] placeholder-[#8E8E93] outline-none"
                        aria-label="Message Nova"
                        name="nova-message"
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        disabled={!sheetInput.trim()}
                        aria-label="Send message"
                        className={`genki-mobile-control genki-mobile-send ml-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                          sheetInput.trim()
                            ? 'bg-[#5E5BAE] hover:bg-[#524FA0] text-white active:scale-95 shadow-2xs'
                            : 'bg-[#E5E5EA] text-[#8E8E93]'
                        }`}
                      >
                        <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                    <div className="w-32 h-1 bg-[#1C1C1E]/20 rounded-full mx-auto" />
                  </form>
                </motion.div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 7. Accessible Confirmation Dialog (Keyboard & Screen Reader Users) */}
        {isAccessibleConfirmOpen && (
          <div 
            className="absolute inset-0 z-50 bg-black/25 backdrop-blur-xs flex items-center justify-center p-6 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accessible-dialog-title"
          >
            <div className="bg-white/95 backdrop-blur-2xl border border-white/90 rounded-[24px] p-6 w-full max-w-[310px] shadow-[0_16px_48px_rgba(28,28,45,0.18)] animate-in zoom-in-95 duration-150 flex flex-col gap-3.5 text-[#1C1C1E]">
              <div>
                <h3 id="accessible-dialog-title" className="genki-mobile-sheet-title text-base font-bold text-[#1C1C1E]">
                  Mark plan as complete?
                </h3>
                <p className="genki-mobile-body text-[13px] leading-[18px] text-[#6C6C70] mt-1.5 leading-relaxed">
                  Confirm that you’ve completed <span className="font-semibold text-[#1C1C1E]">“{currentPlan.title}”</span> for today.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAccessibleConfirmOpen(false)}
                  className="genki-mobile-control genki-mobile-secondary px-3.5 py-2 rounded-[16px] bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-black/[0.04] text-[13px] leading-[18px] font-semibold text-[#6C6C70] hover:text-[#1C1C1E] active:scale-95 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hasCompletedRef.current = true;
                    isHoldingRef.current = false;
                    holdProgressRef.current = 100;
                    setIsAccessibleConfirmOpen(false);
                    recordCardCompleted(activeCardIndexRef.current);
                    setHoldProgress(100);
                  }}
                  className="genki-mobile-control genki-mobile-primary px-4 py-2 rounded-[16px] bg-[#5E5BAE] hover:bg-[#524FA0] active:bg-[#484591] text-white text-[13px] leading-[18px] font-bold shadow-[0_4px_14px_rgba(94,91,174,0.22)] active:scale-95 transition-colors min-h-[44px]"
                >
                  Confirm Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
