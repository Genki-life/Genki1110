import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  Feather,
  RotateCcw,
  Target,
  Timer,
} from 'lucide-react';
import type {
  GoalReviewFeeling,
} from '../utils/planDataFoundation';
import type {
  PlanNovaChatTextEvent,
  PlanNovaCommitResult,
} from './PlanNovaChatWidgets';

export interface GoalPlanSnapshot {
  goalText: string;
  durationAction: string;
  frequency: string;
  lighterOption: string;
  habitLabel: string;
  hasConfirmedCommitment: boolean;
  status: 'draft' | 'active' | 'completed' | 'paused';
}

export type GoalEditableField = 'goal' | 'duration' | 'frequency' | 'lighter';

export type GoalNextStepChoice = 'keep_rhythm' | 'build_a_little' | 'new_focus';

export interface GoalHubHandlers {
  onSaveGoalPlan: (
    next: GoalPlanSnapshot,
    options?: { isNewDirection?: boolean }
  ) => PlanNovaCommitResult;
  onReviewGoal: (input: {
    decision: 'keep_exploring' | 'mark_complete';
    feeling?: GoalReviewFeeling;
  }) => PlanNovaCommitResult;
  onApplyNextStep: (input: {
    choice: GoalNextStepChoice;
    nextSnapshot: GoalPlanSnapshot;
  }) => PlanNovaCommitResult;
}

interface GoalNovaConversationProps {
  initialSnapshot: GoalPlanSnapshot;
  handlers: GoalHubHandlers;
  incomingTextEvent: PlanNovaChatTextEvent | null;
  onScrollToBottom?: () => void;
  onUpdateInputPlaceholder?: (placeholder: string) => void;
  onFocusChatInput?: () => void;
}

const DEFAULT_INPUT_PLACEHOLDER = 'Ask Nova or type a new goal…';

const DURATION_OPTIONS = [
  '10-minute walks',
  '15-minute walks',
  '20-minute walks',
  '30-minute walks',
];

const FREQUENCY_OPTIONS = [
  'Twice a week',
  '3 times a week',
  '4 times a week',
];

const LIGHTER_OPTIONS = [
  '2-minute walk',
  '5-minute walk',
  '5-minute stretch',
  '10-minute walk',
];

const GOAL_IDEAS = [
  'Get back into running',
  'Build a steady walking habit',
  'Feel more energized day to day',
];

function stripTrailingPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/, '').trim();
}

function lowercaseLeadSmart(value: string): string {
  const cleaned = stripTrailingPunctuation(value);
  if (!cleaned) return '';
  if (cleaned.startsWith('I ') || cleaned.startsWith("I'") || cleaned === 'I') {
    return cleaned;
  }
  if (cleaned.length >= 2 && cleaned[0] === cleaned[0].toUpperCase() && cleaned[1] === cleaned[1].toUpperCase()) {
    return cleaned;
  }
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function formatGoalInline(raw: string): string {
  const cleaned = lowercaseLeadSmart(raw);
  return cleaned || 'build a steady movement routine';
}

export function formatDurationPhrase(raw: string): string {
  const cleaned = lowercaseLeadSmart(raw);
  if (!cleaned) return '15-minute walks';
  const walkMatch = cleaned.match(/^(\d+)[\s-]*(?:min|minute|minutes)\s+(?:short\s+)?walk(s)?$/i);
  if (walkMatch) {
    return `${walkMatch[1]}-minute walks`;
  }
  return cleaned;
}

function canonicalDurationValue(raw: string): string {
  return formatDurationPhrase(raw).toLowerCase();
}

function canonicalFrequencyKey(raw: string): string {
  const cleaned = stripTrailingPunctuation(raw).toLowerCase();
  if (cleaned === 'twice a week' || cleaned === '2 times a week' || cleaned === 'two times a week') {
    return '2_per_week';
  }
  if (cleaned === 'three times a week' || cleaned === '3 times a week') {
    return '3_per_week';
  }
  if (cleaned === 'four times a week' || cleaned === '4 times a week') {
    return '4_per_week';
  }
  if (cleaned === 'five times a week' || cleaned === '5 times a week') {
    return '5_per_week';
  }
  if (cleaned === 'once a week' || cleaned === '1 time a week') {
    return '1_per_week';
  }
  if (cleaned === 'every day' || cleaned === 'daily' || cleaned === '7 times a week') {
    return 'daily';
  }
  return cleaned;
}

function formatFrequencyInline(raw: string): string {
  const cleaned = lowercaseLeadSmart(raw);
  if (!cleaned) return 'three times a week';
  return cleaned;
}

function resolveFrequencyOptionValue(raw: string): string {
  const key = canonicalFrequencyKey(raw);
  const matched = FREQUENCY_OPTIONS.find((opt) => canonicalFrequencyKey(opt) === key);
  if (matched) return matched;
  const cleaned = stripTrailingPunctuation(raw);
  return cleaned || '3 times a week';
}

function formatLighterInline(raw: string): string {
  const cleaned = lowercaseLeadSmart(raw);
  if (!cleaned) return '2-minute walk';
  return cleaned;
}

function getArticleBeforeLighter(phrase: string): string {
  const trimmed = phrase.trim().toLowerCase();
  if (!trimmed) return 'a';
  if (/^(a|an|the|some|my|your)\s/.test(trimmed)) return '';
  if (/^(8|11|18)\b/.test(trimmed) || /^[aeiou]/.test(trimmed)) return 'an';
  return 'a';
}

function buildStrategySummary(snapshot: GoalPlanSnapshot): string {
  const dur = formatDurationPhrase(snapshot.durationAction);
  const freq = formatFrequencyInline(snapshot.frequency);
  return `Start with ${dur} ${freq}.`;
}

function isWalkFocusedDuration(raw: string): boolean {
  const lower = raw.toLowerCase();
  return !lower || lower.includes('walk');
}

function buildNextStepUpSnapshot(current: GoalPlanSnapshot): {
  next: GoalPlanSnapshot;
  description: string;
} {
  const freqKey = canonicalFrequencyKey(current.frequency);
  const durMatch = current.durationAction.match(/(\d+)/);
  const mins = durMatch ? Number(durMatch[1]) : 15;

  if (freqKey === '2_per_week') {
    const next: GoalPlanSnapshot = { ...current, frequency: '3 times a week' };
    return { next, description: 'Move from twice a week to 3 times a week.' };
  }
  if (mins < 20 && isWalkFocusedDuration(current.durationAction)) {
    const next: GoalPlanSnapshot = { ...current, durationAction: '20-minute walks' };
    return { next, description: `Build from ${formatDurationPhrase(current.durationAction)} to 20-minute walks.` };
  }
  if (freqKey === '3_per_week') {
    const next: GoalPlanSnapshot = { ...current, frequency: '4 times a week' };
    return { next, description: 'Move from 3 times a week to 4 times a week.' };
  }
  const nextMins = Math.min(45, mins + 5);
  const nextDuration = isWalkFocusedDuration(current.durationAction)
    ? `${nextMins}-minute walks`
    : current.durationAction;
  const next: GoalPlanSnapshot = { ...current, durationAction: nextDuration };
  return { next, description: `Build gently to ${formatDurationPhrase(nextDuration)}.` };
}

function splitFirstWord(phrase: string): { first: string; rest: string } {
  const trimmed = phrase.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { first: trimmed, rest: '' };
  }
  return {
    first: trimmed.slice(0, spaceIndex),
    rest: trimmed.slice(spaceIndex + 1),
  };
}

interface InlineSentenceTokenProps {
  icon: 'target' | 'timer' | 'calendar' | 'feather';
  phrase: string;
  ariaLabel: string;
  testId: string;
  onClick: () => void;
}

const InlineSentenceToken: React.FC<InlineSentenceTokenProps> = ({
  icon,
  phrase,
  ariaLabel,
  testId,
  onClick,
}) => {
  const { first, rest } = splitFirstWord(phrase);

  const IconComponent =
    icon === 'target'
      ? Target
      : icon === 'timer'
      ? Timer
      : icon === 'calendar'
      ? CalendarDays
      : Feather;

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ fontWeight: 650 }}
      className="inline text-left align-baseline text-[16px] leading-[26px] text-[#51489A] rounded-[6px] px-[2px] -mx-[2px] py-[1px] transition-colors hover:bg-[#51489A]/[0.08] active:bg-[#51489A]/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] focus-visible:ring-offset-1 cursor-pointer"
    >
      <span className="inline-flex items-center gap-[4px] whitespace-nowrap align-baseline">
        <IconComponent
          className="w-[14px] h-[14px] shrink-0 text-[#51489A] translate-y-[0.5px]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span>{first}</span>
      </span>
      {rest ? ` ${rest}` : ''}
    </button>
  );
};

type ThreadItem =
  | {
      id: string;
      kind: 'goal_sentence';
      snapshot: GoalPlanSnapshot;
    }
  | {
      id: string;
      kind: 'nova_text';
      text: string;
    }
  | {
      id: string;
      kind: 'user_text';
      text: string;
    }
  | {
      id: string;
      kind: 'select_confirm';
      field: 'duration' | 'frequency' | 'lighter';
      title: string;
      options: string[];
      originalValue: string;
      draftValue: string;
      status: 'active' | 'saved' | 'kept';
      resultText?: string;
      error?: string | null;
    }
  | {
      id: string;
      kind: 'goal_text_prompt';
      isNewFocus?: boolean;
      status: 'active' | 'resolved' | 'kept';
      resultText?: string;
    }
  | {
      id: string;
      kind: 'goal_text_confirm';
      proposedGoal: string;
      isNewFocus?: boolean;
      status: 'active' | 'saved' | 'kept';
      resultText?: string;
      error?: string | null;
    }
  | {
      id: string;
      kind: 'adjust_picker';
      status: 'active' | 'resolved';
      chosenLabel?: string;
    }
  | {
      id: string;
      kind: 'review_goal';
      status: 'active' | 'resolved';
      resultText?: string;
      error?: string | null;
    }
  | {
      id: string;
      kind: 'next_step';
      status: 'active' | 'confirm_build' | 'resolved';
      proposedBuild?: { next: GoalPlanSnapshot; description: string };
      resultText?: string;
      error?: string | null;
    };

export const GoalNovaConversation: React.FC<GoalNovaConversationProps> = ({
  initialSnapshot,
  handlers,
  incomingTextEvent,
  onScrollToBottom,
  onUpdateInputPlaceholder,
  onFocusChatInput,
}) => {
  const [currentSnapshot, setCurrentSnapshot] = useState<GoalPlanSnapshot>(initialSnapshot);
  const currentSnapshotRef = useRef<GoalPlanSnapshot>(initialSnapshot);
  currentSnapshotRef.current = currentSnapshot;

  const idCounterRef = useRef(1);
  const nextId = (prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  };

  const [items, setItems] = useState<ThreadItem[]>(() => [
    {
      id: 'goal-sentence-initial',
      kind: 'goal_sentence',
      snapshot: initialSnapshot,
    },
  ]);

  const lastHandledSeqRef = useRef<number>(incomingTextEvent?.seq ?? 0);

  useEffect(() => {
    onScrollToBottom?.();
  }, [items, onScrollToBottom]);

  useEffect(() => {
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  }, [onUpdateInputPlaceholder]);

  const latestGoalSentenceId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].kind === 'goal_sentence') return items[i].id;
    }
    return null;
  }, [items]);

  const openFieldFlow = (field: GoalEditableField, opts?: { isNewFocus?: boolean }) => {
    const snap = currentSnapshotRef.current;

    if (field === 'frequency') {
      const currentOption = resolveFrequencyOptionValue(snap.frequency);
      const options = FREQUENCY_OPTIONS.some(
        (opt) => canonicalFrequencyKey(opt) === canonicalFrequencyKey(currentOption)
      )
        ? [...FREQUENCY_OPTIONS]
        : [currentOption, ...FREQUENCY_OPTIONS];
      const title = isWalkFocusedDuration(snap.durationAction)
        ? 'How often would you like to walk?'
        : 'How often would you like to do this?';

      setItems((prev) => [
        ...prev,
        {
          id: nextId('confirm-freq'),
          kind: 'select_confirm',
          field: 'frequency',
          title,
          options,
          originalValue: currentOption,
          draftValue: currentOption,
          status: 'active',
        },
      ]);
      onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
      return;
    }

    if (field === 'duration') {
      const formatted = formatDurationPhrase(snap.durationAction);
      const matched = DURATION_OPTIONS.find(
        (opt) => canonicalDurationValue(opt) === canonicalDurationValue(formatted)
      );
      const currentOption = matched ?? formatted;
      const options = matched ? [...DURATION_OPTIONS] : [currentOption, ...DURATION_OPTIONS];
      const title = isWalkFocusedDuration(snap.durationAction)
        ? 'How long would you like to walk?'
        : 'How long should each session be?';

      setItems((prev) => [
        ...prev,
        {
          id: nextId('confirm-dur'),
          kind: 'select_confirm',
          field: 'duration',
          title,
          options,
          originalValue: currentOption,
          draftValue: currentOption,
          status: 'active',
        },
      ]);
      onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
      return;
    }

    if (field === 'lighter') {
      const formatted = formatLighterInline(snap.lighterOption);
      const matched = LIGHTER_OPTIONS.find(
        (opt) => opt.toLowerCase() === formatted.toLowerCase()
      );
      const currentOption = matched ?? formatted;
      const options = matched ? [...LIGHTER_OPTIONS] : [currentOption, ...LIGHTER_OPTIONS];

      setItems((prev) => [
        ...prev,
        {
          id: nextId('confirm-lighter'),
          kind: 'select_confirm',
          field: 'lighter',
          title: 'What feels doable on tougher days?',
          options,
          originalValue: currentOption,
          draftValue: currentOption,
          status: 'active',
        },
      ]);
      onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
      return;
    }

    // field === 'goal'
    setItems((prev) => [
      ...prev,
      {
        id: nextId('goal-prompt'),
        kind: 'goal_text_prompt',
        isNewFocus: opts?.isNewFocus,
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.(
      opts?.isNewFocus ? 'Type your next goal…' : 'Describe your new goal…'
    );
    window.setTimeout(() => {
      onFocusChatInput?.();
    }, 60);
  };

  const openAdjustPicker = () => {
    setItems((prev) => [
      ...prev,
      {
        id: nextId('adjust-picker'),
        kind: 'adjust_picker',
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  };

  const openReviewCard = () => {
    setItems((prev) => [
      ...prev,
      {
        id: nextId('review-goal'),
        kind: 'review_goal',
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  };

  const proposeGoalText = (rawText: string, sourcePromptId?: string, isNewFocus?: boolean) => {
    const cleaned = stripTrailingPunctuation(rawText);
    if (!cleaned) return;
    const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    setItems((prev) => {
      const nextPrev = sourcePromptId
        ? prev.map((item) =>
            item.id === sourcePromptId && item.kind === 'goal_text_prompt'
              ? { ...item, status: 'resolved' as const, resultText: `Selected “${normalized}”.` }
              : item
          )
        : prev.map((item) =>
            item.kind === 'goal_text_prompt' && item.status === 'active'
              ? { ...item, status: 'resolved' as const }
              : item
          );

      return [
        ...nextPrev,
        {
          id: nextId('goal-text-confirm'),
          kind: 'goal_text_confirm',
          proposedGoal: normalized,
          isNewFocus,
          status: 'active',
        },
      ];
    });
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  };

  // Handle text typed in the existing bottom Nova chat input bar
  useEffect(() => {
    if (!incomingTextEvent || incomingTextEvent.seq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = incomingTextEvent.seq;

    const text = incomingTextEvent.text.trim();
    if (!text) return;

    const activeGoalPrompt = [...items]
      .reverse()
      .find((it) => it.kind === 'goal_text_prompt' && it.status === 'active') as
      | Extract<ThreadItem, { kind: 'goal_text_prompt' }>
      | undefined;

    const lower = text.toLowerCase();
    const looksLikeFrequency =
      !activeGoalPrompt &&
      (/\b(twice|once|three|four|five|\d+)\s+times?\s+a\s+week\b/.test(lower) ||
        /\b(\d+)\s*(x|days?)\s*(a|per)\s*week\b/.test(lower));
    const looksLikeDuration =
      !activeGoalPrompt && /\b(\d+)\s*(min|minute|minutes)\b/.test(lower);

    if (looksLikeFrequency) {
      const resolved = resolveFrequencyOptionValue(text);
      const snap = currentSnapshotRef.current;
      const options = FREQUENCY_OPTIONS.some(
        (opt) => canonicalFrequencyKey(opt) === canonicalFrequencyKey(resolved)
      )
        ? [...FREQUENCY_OPTIONS]
        : [resolved, ...FREQUENCY_OPTIONS];
      setItems((prev) => [
        ...prev,
        { id: nextId('usr'), kind: 'user_text', text },
        {
          id: nextId('confirm-freq'),
          kind: 'select_confirm',
          field: 'frequency',
          title: 'How often would you like to walk?',
          options,
          originalValue: resolveFrequencyOptionValue(snap.frequency),
          draftValue: resolved,
          status: 'active',
        },
      ]);
      return;
    }

    if (looksLikeDuration) {
      const formatted = formatDurationPhrase(text);
      const snap = currentSnapshotRef.current;
      const matched = DURATION_OPTIONS.find(
        (opt) => canonicalDurationValue(opt) === canonicalDurationValue(formatted)
      );
      const targetOption = matched ?? formatted;
      const options = matched ? [...DURATION_OPTIONS] : [targetOption, ...DURATION_OPTIONS];
      setItems((prev) => [
        ...prev,
        { id: nextId('usr'), kind: 'user_text', text },
        {
          id: nextId('confirm-dur'),
          kind: 'select_confirm',
          field: 'duration',
          title: 'How long would you like to walk?',
          options,
          originalValue: formatDurationPhrase(snap.durationAction),
          draftValue: targetOption,
          status: 'active',
        },
      ]);
      return;
    }

    // Default: propose updating the goal (requires confirmation before saving)
    const cleaned = stripTrailingPunctuation(text);
    const normalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    setItems((prev) => [
      ...prev.map((item) =>
        item.kind === 'goal_text_prompt' && item.status === 'active'
          ? { ...item, status: 'resolved' as const }
          : item
      ),
      { id: nextId('usr'), kind: 'user_text', text },
      {
        id: nextId('goal-text-confirm'),
        kind: 'goal_text_confirm',
        proposedGoal: normalized,
        isNewFocus: activeGoalPrompt?.isNewFocus,
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  }, [incomingTextEvent, items, onUpdateInputPlaceholder]);

  const handleSaveSelectConfirm = (itemId: string) => {
    const target = items.find((it) => it.id === itemId);
    if (!target || target.kind !== 'select_confirm' || target.status !== 'active') return;

    const snap = currentSnapshotRef.current;
    const nextSnapshot: GoalPlanSnapshot = {
      ...snap,
      hasConfirmedCommitment: true,
      status: 'active',
      ...(target.field === 'frequency'
        ? { frequency: target.draftValue }
        : target.field === 'duration'
        ? { durationAction: target.draftValue }
        : { lighterOption: target.draftValue }),
    };

    const res = handlers.onSaveGoalPlan(nextSnapshot);
    if (!res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'select_confirm'
            ? { ...it, error: res.error || 'Couldn’t save your change. Please try again.' }
            : it
        )
      );
      return;
    }

    const resultText =
      target.field === 'frequency'
        ? `Updated to ${lowercaseLeadSmart(target.draftValue)}.`
        : target.field === 'duration'
        ? `Updated to ${lowercaseLeadSmart(target.draftValue)}.`
        : `Updated lighter option to ${lowercaseLeadSmart(target.draftValue)}.`;

    setCurrentSnapshot(nextSnapshot);
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'select_confirm'
          ? { ...it, status: 'saved' as const, resultText, error: null }
          : it
      ),
      {
        id: nextId('goal-sentence'),
        kind: 'goal_sentence',
        snapshot: nextSnapshot,
      },
    ]);
  };

  const handleKeepCurrentSelect = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || it.kind !== 'select_confirm') return it;
        const keptText =
          it.field === 'frequency'
            ? 'Kept current pace.'
            : it.field === 'duration'
            ? 'Kept current duration.'
            : 'Kept current lighter option.';
        return { ...it, status: 'kept' as const, resultText: keptText, error: null };
      })
    );
  };

  const handleSaveGoalTextConfirm = (itemId: string) => {
    const target = items.find((it) => it.id === itemId);
    if (!target || target.kind !== 'goal_text_confirm' || target.status !== 'active') return;

    const snap = currentSnapshotRef.current;
    const nextSnapshot: GoalPlanSnapshot = {
      ...snap,
      goalText: target.proposedGoal,
      hasConfirmedCommitment: true,
      status: 'active',
    };

    const res = target.isNewFocus
      ? handlers.onApplyNextStep({ choice: 'new_focus', nextSnapshot })
      : handlers.onSaveGoalPlan(nextSnapshot, { isNewDirection: false });

    if (!res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'goal_text_confirm'
            ? { ...it, error: res.error || 'Couldn’t save your goal. Please try again.' }
            : it
        )
      );
      return;
    }

    setCurrentSnapshot(nextSnapshot);
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'goal_text_confirm'
          ? {
              ...it,
              status: 'saved' as const,
              resultText: `Updated goal to “${target.proposedGoal}”.`,
              error: null,
            }
          : it
      ),
      {
        id: nextId('goal-sentence'),
        kind: 'goal_sentence',
        snapshot: nextSnapshot,
      },
    ]);
  };

  const handleKeepCurrentGoalText = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId && it.kind === 'goal_text_confirm'
          ? { ...it, status: 'kept' as const, resultText: 'Kept current goal.', error: null }
          : it
      )
    );
  };

  const handleReviewChoice = (
    itemId: string,
    choice: 'still_working' | 'reached' | 'change'
  ) => {
    if (choice === 'change') {
      setItems((prev) => [
        ...prev.map((it) =>
          it.id === itemId && it.kind === 'review_goal'
            ? { ...it, status: 'resolved' as const, resultText: 'I’d like a change.', error: null }
            : it
        ),
        {
          id: nextId('adjust-picker'),
          kind: 'adjust_picker',
          status: 'active',
        },
      ]);
      return;
    }

    if (choice === 'still_working') {
      const res = handlers.onReviewGoal({ decision: 'keep_exploring', feeling: 'steady' });
      if (!res.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId && it.kind === 'review_goal'
              ? { ...it, error: res.error || 'Couldn’t save your check-in. Try again.' }
              : it
          )
        );
        return;
      }
      setItems((prev) => [
        ...prev.map((it) =>
          it.id === itemId && it.kind === 'review_goal'
            ? {
                ...it,
                status: 'resolved' as const,
                resultText: 'Still working on it — check-in saved.',
                error: null,
              }
            : it
        ),
        {
          id: nextId('nova-note'),
          kind: 'nova_text',
          text: 'Steady progress counts. Tap any part of your goal above whenever you want to adjust it.',
        },
      ]);
      return;
    }

    // choice === 'reached'
    const res = handlers.onReviewGoal({ decision: 'mark_complete' });
    if (!res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'review_goal'
            ? { ...it, error: res.error || 'Couldn’t save completion. Try again.' }
            : it
        )
      );
      return;
    }

    const updatedSnap: GoalPlanSnapshot = {
      ...currentSnapshotRef.current,
      status: 'completed',
    };
    setCurrentSnapshot(updatedSnap);
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'review_goal'
          ? {
              ...it,
              status: 'resolved' as const,
              resultText: 'Marked goal as reached.',
              error: null,
            }
          : it
      ),
      {
        id: nextId('next-step'),
        kind: 'next_step',
        status: 'active',
      },
    ]);
  };

  const handleNextStepAction = (itemId: string, choice: GoalNextStepChoice) => {
    const snap = currentSnapshotRef.current;

    if (choice === 'keep_rhythm') {
      const nextSnapshot: GoalPlanSnapshot = { ...snap, status: 'active' };
      const res = handlers.onApplyNextStep({ choice: 'keep_rhythm', nextSnapshot });
      if (!res.ok) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId && it.kind === 'next_step'
              ? { ...it, error: res.error || 'Couldn’t save your next step. Try again.' }
              : it
          )
        );
        return;
      }
      setCurrentSnapshot(nextSnapshot);
      setItems((prev) => [
        ...prev.map((it) =>
          it.id === itemId && it.kind === 'next_step'
            ? { ...it, status: 'resolved' as const, resultText: 'Keeping this rhythm.', error: null }
            : it
        ),
        {
          id: nextId('goal-sentence'),
          kind: 'goal_sentence',
          snapshot: nextSnapshot,
        },
      ]);
      return;
    }

    if (choice === 'build_a_little') {
      const proposedBuild = buildNextStepUpSnapshot(snap);
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'next_step'
            ? { ...it, status: 'confirm_build' as const, proposedBuild, error: null }
            : it
        )
      );
      return;
    }

    // choice === 'new_focus'
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'next_step'
          ? { ...it, status: 'resolved' as const, resultText: 'Starting a new focus.', error: null }
          : it
      ),
      {
        id: nextId('goal-prompt'),
        kind: 'goal_text_prompt',
        isNewFocus: true,
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.('Type your next goal…');
    window.setTimeout(() => {
      onFocusChatInput?.();
    }, 60);
  };

  const handleConfirmBuildNextStep = (itemId: string) => {
    const target = items.find((it) => it.id === itemId);
    if (!target || target.kind !== 'next_step' || !target.proposedBuild) return;

    const nextSnapshot: GoalPlanSnapshot = {
      ...target.proposedBuild.next,
      status: 'active',
    };
    const res = handlers.onApplyNextStep({ choice: 'build_a_little', nextSnapshot });
    if (!res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'next_step'
            ? { ...it, error: res.error || 'Couldn’t save your next step. Try again.' }
            : it
        )
      );
      return;
    }

    setCurrentSnapshot(nextSnapshot);
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'next_step'
          ? {
              ...it,
              status: 'resolved' as const,
              resultText: `Built gently — ${lowercaseLeadSmart(target.proposedBuild!.description)}`,
              error: null,
            }
          : it
      ),
      {
        id: nextId('goal-sentence'),
        kind: 'goal_sentence',
        snapshot: nextSnapshot,
      },
    ]);
  };

  const handleAdjustPickerChoice = (
    itemId: string,
    field: GoalEditableField,
    label: string
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId && it.kind === 'adjust_picker'
          ? { ...it, status: 'resolved' as const, chosenLabel: label }
          : it
      )
    );
    openFieldFlow(field);
  };

  return (
    <div id="plan-nova-goal-conversation" className="w-full space-y-3.5">
      {items.map((item) => {
        if (item.kind === 'goal_sentence') {
          const goalInline = formatGoalInline(item.snapshot.goalText);
          const durationInline = formatDurationPhrase(item.snapshot.durationAction);
          const frequencyInline = formatFrequencyInline(item.snapshot.frequency);
          const lighterInline = formatLighterInline(item.snapshot.lighterOption);
          const lighterArticle = getArticleBeforeLighter(lighterInline);
          const isLatest = item.id === latestGoalSentenceId;

          return (
            <div key={item.id} className="flex flex-col items-start">
              <div
                data-testid={isLatest ? 'goal-sentence-latest' : 'goal-sentence-history'}
                className="w-full rounded-[22px] rounded-bl-xs bg-[#F6F5FA] border border-black/[0.045] px-4 py-3.5 shadow-2xs"
              >
                <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
                  To{' '}
                  <InlineSentenceToken
                    icon="target"
                    phrase={goalInline}
                    ariaLabel={`Change goal: ${goalInline}`}
                    testId={isLatest ? 'goal-token-goal' : `goal-token-goal-${item.id}`}
                    onClick={() => openFieldFlow('goal')}
                  />
                  , let’s start with{' '}
                  <InlineSentenceToken
                    icon="timer"
                    phrase={durationInline}
                    ariaLabel={`Change walk duration: ${durationInline}`}
                    testId={isLatest ? 'goal-token-duration' : `goal-token-duration-${item.id}`}
                    onClick={() => openFieldFlow('duration')}
                  />{' '}
                  <InlineSentenceToken
                    icon="calendar"
                    phrase={frequencyInline}
                    ariaLabel={`Change weekly frequency: ${frequencyInline}`}
                    testId={isLatest ? 'goal-token-frequency' : `goal-token-frequency-${item.id}`}
                    onClick={() => openFieldFlow('frequency')}
                  />
                  , with {lighterArticle ? `${lighterArticle} ` : ''}
                  <InlineSentenceToken
                    icon="feather"
                    phrase={lighterInline}
                    ariaLabel={`Change lighter option: ${lighterInline}`}
                    testId={isLatest ? 'goal-token-lighter' : `goal-token-lighter-${item.id}`}
                    onClick={() => openFieldFlow('lighter')}
                  />{' '}
                  on tougher days.
                </p>
              </div>

              {isLatest && (
                <div
                  data-testid="goal-sentence-actions"
                  className="w-full flex items-center gap-[8px] mt-2.5"
                >
                  <button
                    type="button"
                    data-testid="goal-review-btn"
                    onClick={openReviewCard}
                    className="flex-1 h-[44px] min-h-[44px] px-3 rounded-[14px] bg-[#EFEBF8] hover:bg-[#E7E0F6] active:scale-[0.98] text-[#51489A] text-[13px] leading-[18px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] focus-visible:ring-offset-1 whitespace-nowrap cursor-pointer"
                  >
                    Review goal
                  </button>
                  <button
                    type="button"
                    data-testid="goal-adjust-btn"
                    onClick={openAdjustPicker}
                    className="flex-1 h-[44px] min-h-[44px] px-3 rounded-[14px] bg-[#EFEBF8] hover:bg-[#E7E0F6] active:scale-[0.98] text-[#51489A] text-[13px] leading-[18px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] focus-visible:ring-offset-1 whitespace-nowrap cursor-pointer"
                  >
                    Adjust goal
                  </button>
                </div>
              )}
            </div>
          );
        }

        if (item.kind === 'nova_text') {
          return (
            <div key={item.id} className="flex flex-col items-start">
              <div className="max-w-[88%] px-4 py-2.5 rounded-[20px] rounded-bl-xs bg-[#F2F2F7]/90 text-[#1C1C1E] border border-black/[0.04] shadow-2xs text-[15px] leading-[22px]">
                {item.text}
              </div>
            </div>
          );
        }

        if (item.kind === 'user_text') {
          return (
            <div key={item.id} className="flex flex-col items-end">
              <div className="max-w-[85%] px-4 py-2.5 rounded-[20px] rounded-br-xs bg-[#5E5BAE] text-white shadow-[0_3px_12px_rgba(94,91,174,0.2)] font-medium text-[15px] leading-[22px]">
                {item.text}
              </div>
            </div>
          );
        }

        if (item.kind === 'select_confirm') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                data-testid={`goal-confirm-settled-${item.field}`}
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[13px] leading-[18px] text-[#7A748B]">{item.title}</p>
                <div className="flex items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#51489A]">
                  {item.status === 'saved' && (
                    <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
                  )}
                  <span>{item.resultText}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid={`goal-confirm-card-${item.field}`}
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                {item.title}
              </p>

              <div className="space-y-2" role="radiogroup" aria-label={item.title}>
                {item.options.map((opt) => {
                  const isSelected =
                    item.field === 'frequency'
                      ? canonicalFrequencyKey(item.draftValue) === canonicalFrequencyKey(opt)
                      : item.draftValue.toLowerCase() === opt.toLowerCase();
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id && it.kind === 'select_confirm'
                              ? { ...it, draftValue: opt, error: null }
                              : it
                          )
                        )
                      }
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] border text-left flex items-center justify-between gap-2 text-[14px] leading-[20px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] cursor-pointer ${
                        isSelected
                          ? 'bg-[#F3EEFE] border-[#51489A] text-[#51489A] font-semibold'
                          : 'bg-[#F8F7FB] border-black/[0.06] text-[#3F3A4D] font-medium hover:bg-[#F1EEF8]'
                      }`}
                    >
                      <span>{opt}</span>
                      {isSelected && (
                        <Check
                          className="w-4 h-4 shrink-0 text-[#51489A]"
                          strokeWidth={2.25}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {item.error && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{item.error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSelectConfirm(item.id)}
                    className="inline-flex items-center gap-1 shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  data-testid="goal-confirm-keep-btn"
                  onClick={() => handleKeepCurrentSelect(item.id)}
                  className="min-h-[44px] px-4 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Keep current
                </button>
                <button
                  type="button"
                  data-testid="goal-confirm-save-btn"
                  onClick={() => handleSaveSelectConfirm(item.id)}
                  className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#51489A] hover:bg-[#463E8A] text-white text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save change
                </button>
              </div>
            </div>
          );
        }

        if (item.kind === 'goal_text_prompt') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 text-[13px] leading-[19px] text-[#7A748B]"
              >
                {item.resultText || 'Goal input ready.'}
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid="goal-text-prompt-card"
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <div className="space-y-1">
                <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                  {item.isNewFocus
                    ? 'What goal would you like to focus on next?'
                    : 'What would you like your goal to be?'}
                </p>
                <p className="text-[13px] leading-[18px] text-[#6E687E]">
                  Type it in the message box below, or pick an idea to review first.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {GOAL_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => proposeGoalText(idea, item.id, item.isNewFocus)}
                    className="min-h-[38px] px-3 py-1.5 rounded-[12px] bg-[#F6F5FA] hover:bg-[#EFEBF8] border border-black/[0.06] text-[13px] leading-[18px] font-medium text-[#51489A] transition-colors cursor-pointer"
                  >
                    {idea}
                  </button>
                ))}
              </div>

              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setItems((prev) =>
                      prev.map((it) =>
                        it.id === item.id && it.kind === 'goal_text_prompt'
                          ? { ...it, status: 'kept' as const, resultText: 'Kept current goal.' }
                          : it
                      )
                    );
                    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
                  }}
                  className="min-h-[44px] px-4 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors cursor-pointer"
                >
                  Keep current
                </button>
              </div>
            </div>
          );
        }

        if (item.kind === 'goal_text_confirm') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                data-testid="goal-confirm-settled-goal"
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[13px] leading-[18px] text-[#7A748B]">Goal</p>
                <div className="flex items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#51489A]">
                  {item.status === 'saved' && (
                    <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
                  )}
                  <span>{item.resultText}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid="goal-confirm-card-goal"
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <div className="space-y-1">
                <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                  {item.isNewFocus ? 'Start this new goal?' : 'Update your goal?'}
                </p>
                <p className="text-[14px] leading-[20px] text-[#51489A] font-medium bg-[#F6F5FA] rounded-[12px] px-3 py-2.5 border border-black/[0.05]">
                  “{item.proposedGoal}”
                </p>
              </div>

              {item.error && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{item.error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveGoalTextConfirm(item.id)}
                    className="inline-flex items-center gap-1 shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  data-testid="goal-confirm-keep-btn"
                  onClick={() => handleKeepCurrentGoalText(item.id)}
                  className="min-h-[44px] px-4 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Keep current
                </button>
                <button
                  type="button"
                  data-testid="goal-confirm-save-btn"
                  onClick={() => handleSaveGoalTextConfirm(item.id)}
                  className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#51489A] hover:bg-[#463E8A] text-white text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save change
                </button>
              </div>
            </div>
          );
        }

        if (item.kind === 'adjust_picker') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[13px] leading-[18px] text-[#7A748B]">
                  What would you like to change?
                </p>
                <p className="text-[14px] leading-[20px] font-medium text-[#51489A]">
                  {item.chosenLabel}
                </p>
              </div>
            );
          }

          const pickerChoices: Array<{
            field: GoalEditableField;
            label: string;
            Icon: React.FC<{ className?: string; strokeWidth?: number }>;
          }> = [
            { field: 'goal', label: 'Goal', Icon: Target },
            { field: 'duration', label: 'Walk duration', Icon: Timer },
            { field: 'frequency', label: 'Weekly pace', Icon: CalendarDays },
            { field: 'lighter', label: 'Lighter option', Icon: Feather },
          ];

          return (
            <div
              key={item.id}
              data-testid="goal-adjust-picker-card"
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                What would you like to change?
              </p>

              <div className="grid grid-cols-2 gap-2">
                {pickerChoices.map(({ field, label, Icon }) => (
                  <button
                    key={field}
                    type="button"
                    data-testid={`goal-adjust-choice-${field}`}
                    onClick={() => handleAdjustPickerChoice(item.id, field, label)}
                    className="min-h-[44px] px-3 py-2.5 rounded-[14px] bg-[#F6F5FA] hover:bg-[#EFEBF8] active:scale-[0.98] border border-black/[0.06] text-[#51489A] text-[13px] leading-[18px] font-semibold flex items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] cursor-pointer"
                  >
                    <Icon
                      className="w-[14px] h-[14px] shrink-0 text-[#51489A]"
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (item.kind === 'review_goal') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                data-testid="goal-review-settled"
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[13px] leading-[18px] text-[#7A748B]">How is this goal going?</p>
                <div className="flex items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#51489A]">
                  <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
                  <span>{item.resultText}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid="goal-review-card"
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                How is this goal going?
              </p>

              {item.error && (
                <div
                  role="alert"
                  className="flex items-center gap-1.5 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{item.error}</span>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="goal-review-still-working"
                  onClick={() => handleReviewChoice(item.id, 'still_working')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  Still working on it
                </button>
                <button
                  type="button"
                  data-testid="goal-review-reached"
                  onClick={() => handleReviewChoice(item.id, 'reached')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  I’ve reached it
                </button>
                <button
                  type="button"
                  data-testid="goal-review-change"
                  onClick={() => handleReviewChoice(item.id, 'change')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  I’d like a change
                </button>
              </div>
            </div>
          );
        }

        if (item.kind === 'next_step') {
          if (item.status === 'resolved') {
            return (
              <div
                key={item.id}
                data-testid="goal-next-step-settled"
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[13px] leading-[18px] text-[#7A748B]">Next step</p>
                <div className="flex items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#51489A]">
                  <Check className="w-4 h-4 shrink-0 text-[#51489A]" strokeWidth={2.2} aria-hidden="true" />
                  <span>{item.resultText}</span>
                </div>
              </div>
            );
          }

          if (item.status === 'confirm_build' && item.proposedBuild) {
            return (
              <div
                key={item.id}
                data-testid="goal-next-step-build-confirm"
                className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
              >
                <div className="space-y-1">
                  <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                    Build a little from here?
                  </p>
                  <p className="text-[14px] leading-[20px] text-[#51489A] font-medium bg-[#F6F5FA] rounded-[12px] px-3 py-2.5 border border-black/[0.05]">
                    {item.proposedBuild.description}
                  </p>
                </div>

                {item.error && (
                  <div
                    role="alert"
                    className="flex items-center gap-1.5 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{item.error}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((it) =>
                          it.id === item.id && it.kind === 'next_step'
                            ? { ...it, status: 'active' as const, error: null }
                            : it
                        )
                      )
                    }
                    className="min-h-[44px] px-4 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Keep current
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmBuildNextStep(item.id)}
                    className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#51489A] hover:bg-[#463E8A] text-white text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Save change
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid="goal-next-step-card"
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <div className="space-y-1">
                <p className="text-[15px] leading-[22px] font-semibold text-[#1C1C1E]">
                  Nice work reaching this goal.
                </p>
                <p className="text-[13px] leading-[18px] text-[#6E687E]">
                  What would you like to do next?
                </p>
              </div>

              {item.error && (
                <div
                  role="alert"
                  className="flex items-center gap-1.5 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{item.error}</span>
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  data-testid="goal-next-keep-rhythm"
                  onClick={() => handleNextStepAction(item.id, 'keep_rhythm')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  Keep this rhythm
                </button>
                <button
                  type="button"
                  data-testid="goal-next-build-little"
                  onClick={() => handleNextStepAction(item.id, 'build_a_little')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  Build a little
                </button>
                <button
                  type="button"
                  data-testid="goal-next-new-focus"
                  onClick={() => handleNextStepAction(item.id, 'new_focus')}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-[14px] bg-[#F8F7FB] hover:bg-[#EFEBF8] border border-black/[0.06] text-left text-[14px] leading-[20px] font-medium text-[#2E2A3B] hover:text-[#51489A] transition-colors cursor-pointer"
                >
                  Start a new focus
                </button>
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export { buildStrategySummary };
