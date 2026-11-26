import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Feather,
  Footprints,
  Plus,
  RotateCcw,
  Timer,
} from 'lucide-react';
import type {
  PlanNovaChatTextEvent,
  PlanNovaCommitResult,
} from './PlanNovaChatWidgets';

export interface HabitPlanSnapshot {
  habitName: string;
  regularAction: string;
  minimumAction: string;
}

export type HabitEditableField = 'name' | 'regular' | 'lighter';

interface HabitNovaConversationProps {
  initialSnapshot: HabitPlanSnapshot;
  isConfirmingNew?: boolean;
  onSaveHabit: (next: HabitPlanSnapshot) => PlanNovaCommitResult;
  incomingTextEvent: PlanNovaChatTextEvent | null;
  onScrollToBottom?: () => void;
  onUpdateInputPlaceholder?: (placeholder: string) => void;
  onFocusChatInput?: () => void;
}

const DEFAULT_INPUT_PLACEHOLDER = 'Ask Nova or describe a custom change…';

const HABIT_NAME_SUGGESTIONS = [
  'Short walks',
  'Morning stretch',
  'After-dinner walk',
  'Light mobility',
];

const REGULAR_DURATION_SUGGESTIONS = [
  '10-minute walk',
  '15-minute walk',
  '20-minute walk',
  '30-minute walk',
];

const LIGHTER_OPTION_SUGGESTIONS = [
  '2-minute walk',
  '5-minute walk',
  '5-minute stretch',
  '10-minute walk',
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
  if (
    cleaned.length >= 2 &&
    cleaned[0] === cleaned[0].toUpperCase() &&
    cleaned[1] === cleaned[1].toUpperCase()
  ) {
    return cleaned;
  }
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

function capitalizeLead(value: string): string {
  const cleaned = stripTrailingPunctuation(value);
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function getIndefiniteArticle(phrase: string): string {
  const trimmed = phrase.trim().toLowerCase();
  if (!trimmed) return 'a';
  if (/^(a|an|the|some|my|your)\s/.test(trimmed)) return '';
  if (/^(8|11|18)\b/.test(trimmed) || /^[aeiou]/.test(trimmed)) return 'an';
  return 'a';
}

function normalizeDurationPhrase(raw: string): string {
  const cleaned = stripTrailingPunctuation(raw);
  if (!cleaned) return '15-minute walk';
  const minOnly = cleaned.match(/^(\d+)\s*(?:min|mins|minute|minutes|m)$/i);
  if (minOnly) {
    return `${minOnly[1]}-minute walk`;
  }
  const walkMatch = cleaned.match(/^(\d+)[\s-]*(?:min|mins|minute|minutes)\s+walk(s)?$/i);
  if (walkMatch) {
    return `${walkMatch[1]}-minute walk`;
  }
  return lowercaseLeadSmart(cleaned);
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

interface InlineHabitTokenProps {
  icon: 'footprints' | 'timer' | 'feather' | 'plus';
  phrase: string;
  ariaLabel: string;
  testId: string;
  onClick: () => void;
}

const InlineHabitToken: React.FC<InlineHabitTokenProps> = ({
  icon,
  phrase,
  ariaLabel,
  testId,
  onClick,
}) => {
  const { first, rest } = splitFirstWord(phrase);

  const IconComponent =
    icon === 'footprints'
      ? Footprints
      : icon === 'timer'
      ? Timer
      : icon === 'feather'
      ? Feather
      : Plus;

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
          strokeWidth={icon === 'plus' ? 2.1 : 1.75}
          aria-hidden="true"
        />
        <span>{first}</span>
      </span>
      {rest ? ` ${rest}` : ''}
    </button>
  );
};

type HabitThreadItem =
  | {
      id: string;
      kind: 'habit_sentence';
      snapshot: HabitPlanSnapshot;
    }
  | {
      id: string;
      kind: 'user_text';
      text: string;
    }
  | {
      id: string;
      kind: 'field_confirm';
      field: HabitEditableField;
      title: string;
      hint: string;
      options: string[];
      originalValue: string;
      draftValue: string;
      status: 'active' | 'saved' | 'cancelled';
      resultText?: string;
      error?: string | null;
    };

function buildOptionsForField(
  field: HabitEditableField,
  currentValue: string
): { options: string[]; selected: string } {
  const baseList =
    field === 'name'
      ? HABIT_NAME_SUGGESTIONS
      : field === 'regular'
      ? REGULAR_DURATION_SUGGESTIONS
      : LIGHTER_OPTION_SUGGESTIONS;

  const trimmed = stripTrailingPunctuation(currentValue);
  if (!trimmed) {
    const fallbackSelected = field === 'lighter' ? '5-minute walk' : baseList[0];
    return { options: [...baseList], selected: fallbackSelected };
  }

  const matched = baseList.find((opt) => opt.toLowerCase() === trimmed.toLowerCase());
  if (matched) {
    return { options: [...baseList], selected: matched };
  }

  const normalized =
    field === 'name' ? capitalizeLead(trimmed) : normalizeDurationPhrase(trimmed);
  return {
    options: [normalized, ...baseList],
    selected: normalized,
  };
}

export const HabitNovaConversation: React.FC<HabitNovaConversationProps> = ({
  initialSnapshot,
  isConfirmingNew = false,
  onSaveHabit,
  incomingTextEvent,
  onScrollToBottom,
  onUpdateInputPlaceholder,
}) => {
  const normalizedInitial = useMemo<HabitPlanSnapshot>(
    () => ({
      habitName: stripTrailingPunctuation(initialSnapshot.habitName) || 'Short walks',
      regularAction:
        stripTrailingPunctuation(initialSnapshot.regularAction) || '15-minute walk',
      minimumAction: stripTrailingPunctuation(initialSnapshot.minimumAction),
    }),
    [initialSnapshot.habitName, initialSnapshot.regularAction, initialSnapshot.minimumAction]
  );

  const [currentSnapshot, setCurrentSnapshot] = useState<HabitPlanSnapshot>(normalizedInitial);
  const currentSnapshotRef = useRef<HabitPlanSnapshot>(normalizedInitial);
  currentSnapshotRef.current = currentSnapshot;

  const idCounterRef = useRef(1);
  const nextId = (prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  };

  const [items, setItems] = useState<HabitThreadItem[]>(() => [
    {
      id: 'habit-sentence-initial',
      kind: 'habit_sentence',
      snapshot: normalizedInitial,
    },
  ]);

  const lastHandledSeqRef = useRef<number>(incomingTextEvent?.seq ?? 0);

  useEffect(() => {
    onScrollToBottom?.();
  }, [items, onScrollToBottom]);

  useEffect(() => {
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  }, [onUpdateInputPlaceholder]);

  const latestHabitSentenceId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].kind === 'habit_sentence') return items[i].id;
    }
    return null;
  }, [items]);

  const openFieldCard = (field: HabitEditableField, customDraft?: string) => {
    const snap = currentSnapshotRef.current;
    const currentVal =
      field === 'name'
        ? snap.habitName
        : field === 'regular'
        ? snap.regularAction
        : snap.minimumAction;

    const base = buildOptionsForField(field, currentVal);
    let options = base.options;
    let draftValue = base.selected;

    if (customDraft && stripTrailingPunctuation(customDraft)) {
      const customFormatted =
        field === 'name'
          ? capitalizeLead(customDraft)
          : normalizeDurationPhrase(customDraft);
      const existingMatch = options.find(
        (opt) => opt.toLowerCase() === customFormatted.toLowerCase()
      );
      if (existingMatch) {
        draftValue = existingMatch;
      } else {
        options = [customFormatted, ...options];
        draftValue = customFormatted;
      }
    }

    const isWalk =
      snap.habitName.toLowerCase().includes('walk') ||
      snap.regularAction.toLowerCase().includes('walk');

    const title =
      field === 'name'
        ? 'What would you like to call this habit?'
        : field === 'regular'
        ? isWalk
          ? 'How long should each walk be?'
          : 'How long should each session be?'
        : snap.minimumAction
        ? 'What feels doable on busy days?'
        : 'Add a lighter option for busy days';

    const hint =
      field === 'name'
        ? 'Pick an option or type your own below.'
        : 'Pick an option or describe your own below.';

    const placeholder =
      field === 'name'
        ? 'Type a custom habit name…'
        : field === 'regular'
        ? 'Type a custom duration, e.g. 25-minute walk…'
        : 'Type a custom lighter option, e.g. 3-minute walk…';

    setItems((prev) => [
      ...prev.map((it) =>
        it.kind === 'field_confirm' && it.status === 'active'
          ? { ...it, status: 'cancelled' as const, resultText: 'Switched to another field.' }
          : it
      ),
      {
        id: nextId(`habit-confirm-${field}`),
        kind: 'field_confirm',
        field,
        title,
        hint,
        options,
        originalValue: currentVal,
        draftValue,
        status: 'active',
      },
    ]);
    onUpdateInputPlaceholder?.(placeholder);
  };

  // Handle custom text typed in the existing bottom Nova chat input bar (never auto-saves)
  useEffect(() => {
    if (!incomingTextEvent || incomingTextEvent.seq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = incomingTextEvent.seq;

    const text = stripTrailingPunctuation(incomingTextEvent.text);
    if (!text) return;

    const activeCard = [...items]
      .reverse()
      .find((it) => it.kind === 'field_confirm' && it.status === 'active') as
      | Extract<HabitThreadItem, { kind: 'field_confirm' }>
      | undefined;

    if (activeCard) {
      const formatted =
        activeCard.field === 'name'
          ? capitalizeLead(text)
          : normalizeDurationPhrase(text);
      setItems((prev) => {
        const next: HabitThreadItem[] = [];
        for (const it of prev) {
          if (it.id === activeCard.id && it.kind === 'field_confirm') {
            next.push({ id: nextId('usr'), kind: 'user_text', text });
            const matched = it.options.find(
              (opt) => opt.toLowerCase() === formatted.toLowerCase()
            );
            next.push({
              ...it,
              options: matched ? it.options : [formatted, ...it.options],
              draftValue: matched ?? formatted,
              error: null,
            });
          } else {
            next.push(it);
          }
        }
        return next;
      });
      return;
    }

    // No card currently open: infer which field the user described and open its confirm card
    const lower = text.toLowerCase();
    const isLighterMention =
      /\b(busy|tough|fallback|lighter|minimum|backup)\b/.test(lower);
    const isDurationMention = /\b(\d+)\s*(min|mins|minute|minutes|m)\b/.test(lower);
    const targetField: HabitEditableField = isLighterMention
      ? 'lighter'
      : isDurationMention
      ? 'regular'
      : 'name';

    setItems((prev) => [...prev, { id: nextId('usr'), kind: 'user_text', text }]);
    openFieldCard(targetField, text);
  }, [incomingTextEvent, items]);

  const handleSaveField = (itemId: string) => {
    const target = items.find((it) => it.id === itemId);
    if (!target || target.kind !== 'field_confirm' || target.status !== 'active') return;

    const snap = currentSnapshotRef.current;
    const trimmedDraft = stripTrailingPunctuation(target.draftValue);
    if (!trimmedDraft) return;

    const nextSnapshot: HabitPlanSnapshot = {
      ...snap,
      ...(target.field === 'name'
        ? { habitName: capitalizeLead(trimmedDraft) }
        : target.field === 'regular'
        ? { regularAction: normalizeDurationPhrase(trimmedDraft) }
        : { minimumAction: normalizeDurationPhrase(trimmedDraft) }),
    };

    const res = onSaveHabit(nextSnapshot);
    if (!res.ok) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId && it.kind === 'field_confirm'
            ? { ...it, error: res.error || 'Couldn’t save your change. Try again.' }
            : it
        )
      );
      return;
    }

    const resultText =
      target.field === 'name'
        ? `Updated habit to ${nextSnapshot.habitName}.`
        : target.field === 'regular'
        ? `Updated to ${nextSnapshot.regularAction}.`
        : snap.minimumAction
        ? `Updated lighter option to ${nextSnapshot.minimumAction}.`
        : `Added ${nextSnapshot.minimumAction} as your lighter option.`;

    setCurrentSnapshot(nextSnapshot);
    setItems((prev) => [
      ...prev.map((it) =>
        it.id === itemId && it.kind === 'field_confirm'
          ? { ...it, status: 'saved' as const, resultText, error: null }
          : it
      ),
      {
        id: nextId('habit-sentence'),
        kind: 'habit_sentence',
        snapshot: nextSnapshot,
      },
    ]);
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  };

  const handleCancelField = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId || it.kind !== 'field_confirm') return it;
        const keptText =
          it.field === 'name'
            ? 'Kept current habit name.'
            : it.field === 'regular'
            ? 'Kept current duration.'
            : 'Kept current lighter option.';
        return { ...it, status: 'cancelled' as const, resultText: keptText, error: null };
      })
    );
    onUpdateInputPlaceholder?.(DEFAULT_INPUT_PLACEHOLDER);
  };

  return (
    <div
      id="plan-nova-habit-conversation"
      data-confirming-new={isConfirmingNew ? 'true' : 'false'}
      className="w-full space-y-3.5 font-sans"
    >
      {items.map((item) => {
        if (item.kind === 'habit_sentence') {
          const habitInline = lowercaseLeadSmart(item.snapshot.habitName) || 'short walks';
          const regularInline =
            lowercaseLeadSmart(item.snapshot.regularAction) || '15-minute walk';
          const regularArticle = getIndefiniteArticle(regularInline);
          const lighterInline = lowercaseLeadSmart(item.snapshot.minimumAction);
          const lighterArticle = lighterInline ? getIndefiniteArticle(lighterInline) : '';
          const isLatest = item.id === latestHabitSentenceId;

          return (
            <div key={item.id} className="flex flex-col items-start">
              <div
                data-testid={isLatest ? 'habit-sentence-latest' : 'habit-sentence-history'}
                className="w-full rounded-[22px] rounded-bl-xs bg-[#F6F5FA] border border-black/[0.045] px-4 py-3.5 shadow-2xs"
              >
                <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
                  For{' '}
                  <InlineHabitToken
                    icon="footprints"
                    phrase={habitInline}
                    ariaLabel={`Edit habit name: ${habitInline}`}
                    testId={isLatest ? 'habit-token-name' : `habit-token-name-${item.id}`}
                    onClick={() => openFieldCard('name')}
                  />
                  , let’s start with {regularArticle ? `${regularArticle} ` : ''}
                  <InlineHabitToken
                    icon="timer"
                    phrase={regularInline}
                    ariaLabel={`Edit regular duration: ${regularInline}`}
                    testId={isLatest ? 'habit-token-regular' : `habit-token-regular-${item.id}`}
                    onClick={() => openFieldCard('regular')}
                  />
                  {lighterInline ? (
                    <>
                      , with {lighterArticle ? `${lighterArticle} ` : ''}
                      <InlineHabitToken
                        icon="feather"
                        phrase={lighterInline}
                        ariaLabel={`Edit lighter option: ${lighterInline}`}
                        testId={
                          isLatest ? 'habit-token-lighter' : `habit-token-lighter-${item.id}`
                        }
                        onClick={() => openFieldCard('lighter')}
                      />{' '}
                      on busy days.
                    </>
                  ) : (
                    <>
                      .{' '}
                      <InlineHabitToken
                        icon="plus"
                        phrase="Add a lighter option"
                        ariaLabel="Add a lighter option for busy days"
                        testId={
                          isLatest
                            ? 'habit-token-add-lighter'
                            : `habit-token-add-lighter-${item.id}`
                        }
                        onClick={() => openFieldCard('lighter')}
                      />
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        }

        if (item.kind === 'user_text') {
          return (
            <div key={item.id} className="flex flex-col items-end">
              <div className="max-w-[85%] px-4 py-2.5 rounded-[20px] rounded-br-xs bg-[#51489A] text-white shadow-[0_3px_12px_rgba(81,72,154,0.2)] font-medium text-[15px] leading-[22px]">
                {item.text}
              </div>
            </div>
          );
        }

        if (item.kind === 'field_confirm') {
          if (item.status !== 'active') {
            return (
              <div
                key={item.id}
                data-testid={`habit-confirm-settled-${item.field}`}
                className="w-full rounded-[18px] bg-[#F6F5FA] border border-black/[0.05] px-4 py-3 space-y-1"
              >
                <p className="text-[12px] leading-[16px] text-[#6F687B]">{item.title}</p>
                <div className="flex items-center gap-1.5 text-[14px] leading-[20px] font-medium text-[#51489A]">
                  {item.status === 'saved' && (
                    <Check
                      className="w-4 h-4 shrink-0 text-[#51489A]"
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  )}
                  <span>{item.resultText}</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              data-testid={`habit-confirm-card-${item.field}`}
              className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3"
            >
              <div className="space-y-0.5">
                <p className="text-[16px] leading-[22px] font-semibold text-[#211D2C]">
                  {item.title}
                </p>
                <p className="text-[12px] leading-[16px] font-normal text-[#6F687B]">
                  {item.hint}
                </p>
              </div>

              <div className="space-y-2" role="radiogroup" aria-label={item.title}>
                {item.options.map((opt) => {
                  const isSelected =
                    item.draftValue.trim().toLowerCase() === opt.trim().toLowerCase();
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id && it.kind === 'field_confirm'
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
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveField(item.id)}
                    className="inline-flex items-center gap-1 shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  data-testid="habit-confirm-cancel-btn"
                  onClick={() => handleCancelField(item.id)}
                  className="min-h-[44px] px-4 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="habit-confirm-save-btn"
                  onClick={() => handleSaveField(item.id)}
                  className="flex-1 min-h-[44px] px-4 rounded-[14px] bg-[#51489A] hover:bg-[#463E8A] text-white text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save change
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
