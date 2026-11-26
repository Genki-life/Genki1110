import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Clock,
  Footprints,
  MapPin,
  RotateCcw,
  Timer,
} from 'lucide-react';
import {
  ActivitiesPreference,
  AvoidActivityPreference,
  BestTimePreference,
  PreferenceItem,
  PreferenceKind,
  SessionLengthPreference,
  WherePreference,
  clampSessionMinutes,
  formatActivitiesConfirmation,
  formatActivitiesSentenceToken,
  formatActivitiesValue,
  formatBestTimeConfirmation,
  formatBestTimeSentenceToken,
  formatBestTimeValue,
  formatSessionLengthConfirmation,
  formatSessionLengthSentenceToken,
  formatSessionLengthValue,
  formatWhereConfirmation,
  formatWhereSentenceToken,
  formatWhereValue,
  hydrateStructuredPreference,
  inferPreferenceKind,
  parseAvoidActivityFromText,
} from '../utils/preferencesStore';
import {
  ActivitiesPickerControl,
  BestTimeTimelineControl,
  SessionLengthDualSlider,
  WhereIconCardsControl,
} from './PreferenceControls';
import type {
  PlanNovaChatTextEvent,
  PlanNovaCommitResult,
} from './PlanNovaChatWidgets';

export interface StructuredPreferenceSavePayload {
  kind: PreferenceKind;
  title: string;
  shortTag?: string;
  summary?: string;
  sessionLength?: SessionLengthPreference;
  bestTime?: BestTimePreference;
  where?: WherePreference;
  activities?: ActivitiesPreference;
  avoidActivity?: AvoidActivityPreference;
  /** Optional id of the specific preference item being edited or confirmed */
  targetItemId?: string;
}

interface PreferenceNovaConversationProps {
  mode: 'add' | 'edit' | 'confirm';
  existingItem?: PreferenceItem;
  allItems: PreferenceItem[];
  onSavePreference: (payload: StructuredPreferenceSavePayload) => PlanNovaCommitResult;
  onIgnorePending?: (itemId: string) => PlanNovaCommitResult;
  incomingTextEvent: PlanNovaChatTextEvent | null;
  onScrollToBottom?: () => void;
  onUpdateInputPlaceholder?: (placeholder: string) => void;
}

type TokenIconKind = 'timer' | 'clock' | 'map_pin' | 'footprints' | 'ban';

interface InlinePreferenceTokenProps {
  icon: TokenIconKind;
  phrase: string;
  ariaLabel: string;
  testId: string;
  isActive?: boolean;
  onClick: () => void;
}

function splitFirstWord(phrase: string): { first: string; rest: string } {
  const trimmed = phrase.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { first: trimmed, rest: '' };
  return {
    first: trimmed.slice(0, spaceIndex),
    rest: trimmed.slice(spaceIndex + 1),
  };
}

const InlinePreferenceToken: React.FC<InlinePreferenceTokenProps> = ({
  icon,
  phrase,
  ariaLabel,
  testId,
  isActive = false,
  onClick,
}) => {
  const { first, rest } = splitFirstWord(phrase);

  const IconComponent =
    icon === 'timer'
      ? Timer
      : icon === 'clock'
      ? Clock
      : icon === 'map_pin'
      ? MapPin
      : icon === 'footprints'
      ? Footprints
      : Ban;

  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      aria-expanded={isActive}
      onClick={onClick}
      style={{ fontWeight: 650 }}
      className={`inline text-left align-baseline text-[16px] leading-[26px] text-[#51489A] rounded-[6px] px-[3px] -mx-[3px] py-[1px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] focus-visible:ring-offset-1 cursor-pointer ${
        isActive
          ? 'bg-[#51489A]/[0.10]'
          : 'hover:bg-[#51489A]/[0.08] active:bg-[#51489A]/[0.14]'
      }`}
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

// ============================================================================
// MAIN THREAD COMPONENT
// ============================================================================

type PrefThreadEntry =
  | {
      id: string;
      entryType: 'add_picker';
    }
  | {
      id: string;
      entryType: 'pref_editor';
      prefKind: PreferenceKind;
      targetItemId?: string;
      isPendingConfirm: boolean;
      controlExpanded: boolean;
      status: 'active' | 'saved' | 'cancelled' | 'ignored';
      sessionLength: SessionLengthPreference;
      savedSessionLength: SessionLengthPreference;
      bestTime: BestTimePreference;
      savedBestTime: BestTimePreference;
      where: WherePreference;
      savedWhere: WherePreference;
      activities: ActivitiesPreference;
      savedActivities: ActivitiesPreference;
      avoidActivity: AvoidActivityPreference;
      customTitle: string;
      savedCustomTitle: string;
      error?: string | null;
      settledNote?: string;
    }
  | {
      id: string;
      entryType: 'user_text';
      text: string;
    }
  | {
      id: string;
      entryType: 'nova_notice';
      text: string;
    };

function buildInitialEditorState(
  kind: PreferenceKind,
  item: PreferenceItem | undefined,
  allItems: PreferenceItem[],
  isPendingConfirm: boolean,
  expandInitially: boolean
): Omit<Extract<PrefThreadEntry, { entryType: 'pref_editor' }>, 'id' | 'entryType'> {
  const hydrated = item ? hydrateStructuredPreference(item) : undefined;

  // For existing confirmed item of same kind when adding from "+" or confirming
  const existingConfirmedOfKind = !hydrated
    ? allItems.find(
        (m) => m.isConfirmed && m.source === 'user_explicit' && inferPreferenceKind(m) === kind
      )
    : undefined;
  const sourceItem = hydrated ?? (existingConfirmedOfKind ? hydrateStructuredPreference(existingConfirmedOfKind) : undefined);

  const sessionLength: SessionLengthPreference =
    sourceItem?.sessionLength ?? { mode: isPendingConfirm ? 'unset' : 'range', minMinutes: 10, maxMinutes: 20 };
  const bestTime: BestTimePreference =
    sourceItem?.bestTime ?? { mode: isPendingConfirm ? 'unset' : 'window', startMinutes: 18 * 60, endMinutes: 20 * 60 };
  const where: WherePreference =
    sourceItem?.where ?? { places: isPendingConfirm ? [] : ['home'] };
  const activities: ActivitiesPreference =
    sourceItem?.activities ?? { selected: isPendingConfirm ? [] : ['walking'] };
  const avoidActivity: AvoidActivityPreference =
    sourceItem?.avoidActivity ?? {
      activity: (sourceItem?.title ?? 'HIIT').replace(/^suggest\s+less\s+/i, '').replace(/\?+$/, '').trim() || 'HIIT',
    };
  const customTitle = (sourceItem?.title ?? '').replace(/\?+$/, '').trim();

  return {
    prefKind: kind,
    targetItemId: item?.id ?? existingConfirmedOfKind?.id,
    isPendingConfirm,
    controlExpanded: expandInitially,
    status: 'active',
    sessionLength,
    savedSessionLength: sessionLength,
    bestTime,
    savedBestTime: bestTime,
    where,
    savedWhere: where,
    activities,
    savedActivities: activities,
    avoidActivity,
    customTitle,
    savedCustomTitle: customTitle,
    error: null,
  };
}

function getPlaceholderForKind(kind: PreferenceKind | null): string {
  if (kind === 'best_time') return 'Or type a life cue, e.g. after lunch…';
  if (kind === 'activities') return 'Tell Nova what to suggest less of, e.g. less HIIT…';
  return 'Tell Nova a preference, e.g. after lunch or less HIIT…';
}

export const PreferenceNovaConversation: React.FC<PreferenceNovaConversationProps> = ({
  mode,
  existingItem,
  allItems,
  onSavePreference,
  onIgnorePending,
  incomingTextEvent,
  onScrollToBottom,
  onUpdateInputPlaceholder,
}) => {
  const idCounterRef = useRef(1);
  const nextId = (prefix: string) => {
    idCounterRef.current += 1;
    return `${prefix}-${idCounterRef.current}`;
  };

  const [entries, setEntries] = useState<PrefThreadEntry[]>(() => {
    if (mode === 'add' && !existingItem) {
      return [{ id: 'pref-add-picker', entryType: 'add_picker' }];
    }
    const hydrated = existingItem ? hydrateStructuredPreference(existingItem) : undefined;
    const kind = hydrated ? inferPreferenceKind(hydrated) : 'session_length';
    return [
      {
        id: 'pref-editor-initial',
        entryType: 'pref_editor',
        ...buildInitialEditorState(
          kind,
          hydrated,
          allItems,
          mode === 'confirm',
          true
        ),
      },
    ];
  });

  const lastHandledSeqRef = useRef<number>(incomingTextEvent?.seq ?? 0);

  useEffect(() => {
    onScrollToBottom?.();
  }, [entries, onScrollToBottom]);

  const activeEditor = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const e = entries[i];
      if (e.entryType === 'pref_editor' && e.status === 'active') return e;
    }
    return null;
  }, [entries]);

  useEffect(() => {
    onUpdateInputPlaceholder?.(getPlaceholderForKind(activeEditor?.prefKind ?? null));
  }, [activeEditor?.prefKind, onUpdateInputPlaceholder]);

  const openEditorKind = (
    kind: PreferenceKind,
    opts?: {
      customAvoidActivity?: string;
      customCueText?: string;
      customTitle?: string;
      isPendingConfirm?: boolean;
      targetItem?: PreferenceItem;
    }
  ) => {
    const base = buildInitialEditorState(
      kind,
      opts?.targetItem,
      allItems,
      Boolean(opts?.isPendingConfirm),
      true
    );

    if (kind === 'avoid_activity' && opts?.customAvoidActivity) {
      base.avoidActivity = { activity: opts.customAvoidActivity };
      base.isPendingConfirm = true;
      base.targetItemId = undefined;
    }
    if (kind === 'best_time' && opts?.customCueText) {
      base.bestTime = { mode: 'cue', cueText: opts.customCueText };
    }
    if (kind === 'custom' && opts?.customTitle) {
      base.customTitle = opts.customTitle;
    }

    setEntries((prev) => [
      ...prev.map((entry) =>
        entry.entryType === 'pref_editor' && entry.status === 'active'
          ? {
              ...entry,
              controlExpanded: false,
              status: 'cancelled' as const,
              sessionLength: entry.savedSessionLength,
              bestTime: entry.savedBestTime,
              where: entry.savedWhere,
              activities: entry.savedActivities,
              customTitle: entry.savedCustomTitle,
            }
          : entry
      ),
      {
        id: nextId(`pref-editor-${kind}`),
        entryType: 'pref_editor',
        ...base,
      },
    ]);
  };

  // Handle bottom chat input submissions (never auto-commits)
  useEffect(() => {
    if (!incomingTextEvent || incomingTextEvent.seq <= lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = incomingTextEvent.seq;

    const raw = incomingTextEvent.text.trim();
    if (!raw) return;

    const lower = raw.toLowerCase();
    const avoided = parseAvoidActivityFromText(raw);

    // 1. User wants to receive less of a specific activity -> independent "Suggest less X?" confirmation card
    if (avoided) {
      setEntries((prev) => [
        ...prev,
        { id: nextId('usr'), entryType: 'user_text', text: raw },
        {
          id: nextId('pref-editor-avoid'),
          entryType: 'pref_editor',
          ...buildInitialEditorState('avoid_activity', undefined, allItems, true, true),
          avoidActivity: { activity: avoided },
          targetItemId: undefined,
        },
      ]);
      return;
    }

    // 2. If Best time is currently active, treat freeform text as a life trigger cue (kept verbatim!)
    if (activeEditor && activeEditor.prefKind === 'best_time') {
      const cleanCue = raw.replace(/[.!?]+$/, '').trim();
      setEntries((prev) => [
        ...prev.map((entry) =>
          entry.id === activeEditor.id && entry.entryType === 'pref_editor'
            ? {
                ...entry,
                controlExpanded: true,
                bestTime: { mode: 'cue' as const, cueText: cleanCue },
                error: null,
              }
            : entry
        ),
        { id: nextId('usr'), entryType: 'user_text', text: raw },
      ]);
      return;
    }

    // 3. Detect natural life trigger cue from anywhere (e.g. "after lunch", "before work")
    if (/\b(after|before|during|right after)\s+[a-z\s]{2,24}/i.test(lower)) {
      const cleanCue = raw.replace(/[.!?]+$/, '').trim();
      setEntries((prev) => [
        ...prev,
        { id: nextId('usr'), entryType: 'user_text', text: raw },
      ]);
      openEditorKind('best_time', { customCueText: cleanCue });
      return;
    }

    // 4. Detect duration range or single minute mention
    const rangeMatch = lower.match(/(\d+)\s*[–-]\s*(\d+)\s*(?:min|mins|minute|minutes|m)\b/);
    const singleMinMatch = lower.match(/\b(\d+)\s*(?:min|mins|minute|minutes|m)\b/);
    if (rangeMatch || singleMinMatch || /\bflexible\b/.test(lower)) {
      const nextSession: SessionLengthPreference = /\bflexible\b/.test(lower)
        ? { mode: 'flexible' }
        : rangeMatch
        ? {
            mode: 'range',
            minMinutes: Math.min(
              clampSessionMinutes(Number(rangeMatch[1])),
              clampSessionMinutes(Number(rangeMatch[2]))
            ),
            maxMinutes: Math.max(
              clampSessionMinutes(Number(rangeMatch[1])),
              clampSessionMinutes(Number(rangeMatch[2]))
            ),
          }
        : {
            mode: 'range',
            minMinutes: clampSessionMinutes(Number(singleMinMatch![1])),
            maxMinutes: clampSessionMinutes(Number(singleMinMatch![1])),
          };

      if (activeEditor && activeEditor.prefKind === 'session_length') {
        setEntries((prev) => [
          ...prev.map((entry) =>
            entry.id === activeEditor.id && entry.entryType === 'pref_editor'
              ? { ...entry, controlExpanded: true, sessionLength: nextSession, error: null }
              : entry
          ),
          { id: nextId('usr'), entryType: 'user_text', text: raw },
        ]);
        return;
      }

      setEntries((prev) => [
        ...prev,
        { id: nextId('usr'), entryType: 'user_text', text: raw },
        {
          id: nextId('pref-editor-session'),
          entryType: 'pref_editor',
          ...buildInitialEditorState('session_length', undefined, allItems, false, true),
          sessionLength: nextSession,
        },
      ]);
      return;
    }

    // 5. Fallback: update active custom editor or open a custom confirmation card
    if (activeEditor && activeEditor.prefKind === 'custom') {
      setEntries((prev) => [
        ...prev.map((entry) =>
          entry.id === activeEditor.id && entry.entryType === 'pref_editor'
            ? { ...entry, customTitle: raw, error: null }
            : entry
        ),
        { id: nextId('usr'), entryType: 'user_text', text: raw },
      ]);
      return;
    }

    setEntries((prev) => [
      ...prev,
      { id: nextId('usr'), entryType: 'user_text', text: raw },
    ]);
    openEditorKind('custom', { customTitle: raw });
  }, [incomingTextEvent, activeEditor, allItems]);

  const updateEditor = (
    entryId: string,
    updater: (
      entry: Extract<PrefThreadEntry, { entryType: 'pref_editor' }>
    ) => Extract<PrefThreadEntry, { entryType: 'pref_editor' }>
  ) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId && e.entryType === 'pref_editor' ? updater(e) : e
      )
    );
  };

  const canSaveEditor = (
    entry: Extract<PrefThreadEntry, { entryType: 'pref_editor' }>
  ): boolean => {
    if (entry.prefKind === 'session_length') {
      return entry.sessionLength.mode !== 'unset';
    }
    if (entry.prefKind === 'best_time') {
      if (entry.bestTime.mode === 'unset') return false;
      if (entry.bestTime.mode === 'cue') return Boolean(entry.bestTime.cueText?.trim());
      return true;
    }
    if (entry.prefKind === 'where') {
      return entry.where.places.length > 0;
    }
    if (entry.prefKind === 'activities') {
      return entry.activities.selected.length > 0;
    }
    if (entry.prefKind === 'avoid_activity') {
      return Boolean(entry.avoidActivity.activity.trim());
    }
    return Boolean(entry.customTitle.trim());
  };

  const handleSaveEntry = (entryId: string) => {
    const target = entries.find((e) => e.id === entryId);
    if (!target || target.entryType !== 'pref_editor' || target.status !== 'active') return;
    if (!canSaveEditor(target)) return;

    let payload: StructuredPreferenceSavePayload;
    let confirmationSentence: string;

    if (target.prefKind === 'session_length') {
      const formatted = formatSessionLengthValue(target.sessionLength);
      payload = {
        kind: 'session_length',
        title: 'Session length',
        shortTag: formatted,
        summary: formatted,
        sessionLength: target.sessionLength,
        targetItemId: target.targetItemId,
      };
      confirmationSentence = formatSessionLengthConfirmation(target.sessionLength);
    } else if (target.prefKind === 'best_time') {
      const formatted = formatBestTimeValue(target.bestTime);
      payload = {
        kind: 'best_time',
        title: 'Best time',
        shortTag: formatted,
        summary: formatted,
        bestTime: target.bestTime,
        targetItemId: target.targetItemId,
      };
      confirmationSentence = formatBestTimeConfirmation(target.bestTime);
    } else if (target.prefKind === 'where') {
      const formatted = formatWhereValue(target.where);
      payload = {
        kind: 'where',
        title: 'Where',
        shortTag: formatted,
        summary: formatted,
        where: target.where,
        targetItemId: target.targetItemId,
      };
      confirmationSentence = formatWhereConfirmation(target.where);
    } else if (target.prefKind === 'activities') {
      const formatted = formatActivitiesValue(target.activities);
      payload = {
        kind: 'activities',
        title: 'Activities',
        shortTag: formatted,
        summary: formatted,
        activities: target.activities,
        targetItemId: target.targetItemId,
      };
      confirmationSentence = formatActivitiesConfirmation(target.activities);
    } else if (target.prefKind === 'avoid_activity') {
      const act = target.avoidActivity.activity.trim();
      payload = {
        kind: 'avoid_activity',
        title: `Suggest less ${act}`,
        shortTag: `Less ${act}`,
        summary: act,
        avoidActivity: { activity: act },
        targetItemId: target.targetItemId,
      };
      confirmationSentence = `I’ll suggest less ${act} going forward.`;
    } else {
      const title = target.customTitle.trim();
      payload = {
        kind: 'custom',
        title,
        shortTag: title.length <= 20 ? title : `${title.slice(0, 19).trim()}…`,
        summary: title,
        targetItemId: target.targetItemId,
      };
      confirmationSentence = `Saved — I’ll keep “${title}” in mind.`;
    }

    const res = onSavePreference(payload);
    if (!res.ok) {
      updateEditor(entryId, (e) => ({
        ...e,
        error: res.error || 'Couldn’t save preference. Try again.',
      }));
      return;
    }

    setEntries((prev) => [
      ...prev.map((e) =>
        e.id === entryId && e.entryType === 'pref_editor'
          ? {
              ...e,
              status: 'saved' as const,
              controlExpanded: false,
              savedSessionLength: e.sessionLength,
              savedBestTime: e.bestTime,
              savedWhere: e.where,
              savedActivities: e.activities,
              savedCustomTitle: e.customTitle,
              error: null,
              settledNote: 'Saved',
            }
          : e
      ),
      {
        id: nextId('nova-confirm'),
        entryType: 'nova_notice',
        text: confirmationSentence,
      },
    ]);
  };

  const handleCancelEntry = (entryId: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId && e.entryType === 'pref_editor'
          ? {
              ...e,
              status: 'cancelled' as const,
              controlExpanded: false,
              sessionLength: e.savedSessionLength,
              bestTime: e.savedBestTime,
              where: e.savedWhere,
              activities: e.savedActivities,
              customTitle: e.savedCustomTitle,
              error: null,
              settledNote: 'No changes saved.',
            }
          : e
      )
    );
  };

  const handleIgnoreEntry = (entryId: string) => {
    const target = entries.find((e) => e.id === entryId);
    if (!target || target.entryType !== 'pref_editor' || target.status !== 'active') return;

    if (target.targetItemId && onIgnorePending) {
      const res = onIgnorePending(target.targetItemId);
      if (!res.ok) {
        updateEditor(entryId, (e) => ({
          ...e,
          error: res.error || 'Couldn’t update preferences. Try again.',
        }));
        return;
      }
    }

    setEntries((prev) => [
      ...prev.map((e) =>
        e.id === entryId && e.entryType === 'pref_editor'
          ? {
              ...e,
              status: 'ignored' as const,
              controlExpanded: false,
              error: null,
              settledNote: 'Ignored',
            }
          : e
      ),
      {
        id: nextId('nova-ignored'),
        entryType: 'nova_notice',
        text: 'Okay, I won’t save that preference.',
      },
    ]);
  };

  const handleTokenClick = (
    entry: Extract<PrefThreadEntry, { entryType: 'pref_editor' }>
  ) => {
    if (entry.status === 'active') {
      updateEditor(entry.id, (e) => ({ ...e, controlExpanded: true }));
      return;
    }
    // Re-opening after saving or cancelling spawns a fresh active editor with the latest values
    setEntries((prev) => [
      ...prev,
      {
        ...entry,
        id: nextId(`pref-editor-${entry.prefKind}`),
        entryType: 'pref_editor',
        status: 'active',
        controlExpanded: true,
        isPendingConfirm: false,
        error: null,
        settledNote: undefined,
      },
    ]);
  };

  const renderSentenceForEntry = (
    entry: Extract<PrefThreadEntry, { entryType: 'pref_editor' }>
  ) => {
    const isActive = entry.status === 'active' && entry.controlExpanded;

    if (entry.prefKind === 'session_length') {
      const tokenText = formatSessionLengthSentenceToken(entry.sessionLength);
      const isFlex = entry.sessionLength.mode === 'flexible';
      return (
        <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
          {isFlex ? 'I’ll suggest sessions with ' : 'I’ll suggest sessions that usually take '}
          <InlinePreferenceToken
            icon="timer"
            phrase={tokenText}
            ariaLabel={`Adjust session length: ${tokenText}`}
            testId="pref-token-session-length"
            isActive={isActive}
            onClick={() => handleTokenClick(entry)}
          />
          .
        </p>
      );
    }

    if (entry.prefKind === 'best_time') {
      const tokenText = formatBestTimeSentenceToken(entry.bestTime);
      const isFlex = entry.bestTime.mode === 'flexible';
      return (
        <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
          {isFlex ? 'I’ll look for chances to move with ' : 'I’ll look for chances to move '}
          <InlinePreferenceToken
            icon="clock"
            phrase={tokenText}
            ariaLabel={`Adjust best time: ${tokenText}`}
            testId="pref-token-best-time"
            isActive={isActive}
            onClick={() => handleTokenClick(entry)}
          />
          .
        </p>
      );
    }

    if (entry.prefKind === 'where') {
      const tokenText = formatWhereSentenceToken(entry.where);
      return (
        <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
          I’ll favor movement you can do{' '}
          <InlinePreferenceToken
            icon="map_pin"
            phrase={tokenText}
            ariaLabel={`Adjust where you move: ${tokenText}`}
            testId="pref-token-where"
            isActive={isActive}
            onClick={() => handleTokenClick(entry)}
          />
          .
        </p>
      );
    }

    if (entry.prefKind === 'activities') {
      const tokenText = formatActivitiesSentenceToken(entry.activities);
      return (
        <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
          I’ll lean toward{' '}
          <InlinePreferenceToken
            icon="footprints"
            phrase={tokenText}
            ariaLabel={`Adjust preferred activities: ${tokenText}`}
            testId="pref-token-activities"
            isActive={isActive}
            onClick={() => handleTokenClick(entry)}
          />
          .
        </p>
      );
    }

    if (entry.prefKind === 'avoid_activity') {
      const act = entry.avoidActivity.activity.trim() || 'this activity';
      return (
        <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
          Should I{' '}
          <InlinePreferenceToken
            icon="ban"
            phrase={`suggest less ${act}`}
            ariaLabel={`Review preference: Suggest less ${act}`}
            testId="pref-token-avoid-activity"
            isActive={isActive}
            onClick={() => handleTokenClick(entry)}
          />
          ?
        </p>
      );
    }

    return (
      <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
        I’ll keep{' '}
        <InlinePreferenceToken
          icon="footprints"
          phrase={entry.customTitle || 'this preference'}
          ariaLabel={`Edit preference: ${entry.customTitle || 'preference'}`}
          testId="pref-token-custom"
          isActive={isActive}
          onClick={() => handleTokenClick(entry)}
        />{' '}
        in mind for future suggestions.
      </p>
    );
  };

  return (
    <div id="plan-nova-preference-conversation" className="w-full space-y-3.5 font-sans">
      {entries.map((entry) => {
        if (entry.entryType === 'add_picker') {
          return (
            <div key={entry.id} className="flex flex-col items-start">
              <div
                data-testid="pref-add-launcher"
                className="w-full rounded-[22px] rounded-bl-xs bg-[#F6F5FA] border border-black/[0.045] px-4 py-3.5 shadow-2xs"
              >
                <p className="font-sans text-[16px] leading-[26px] font-normal text-[#625B70]">
                  What would you like to set —{' '}
                  <InlinePreferenceToken
                    icon="timer"
                    phrase="session length"
                    ariaLabel="Set session length preference"
                    testId="pref-add-token-session-length"
                    onClick={() => openEditorKind('session_length')}
                  />
                  ,{' '}
                  <InlinePreferenceToken
                    icon="clock"
                    phrase="best time"
                    ariaLabel="Set best time preference"
                    testId="pref-add-token-best-time"
                    onClick={() => openEditorKind('best_time')}
                  />
                  ,{' '}
                  <InlinePreferenceToken
                    icon="map_pin"
                    phrase="where you move"
                    ariaLabel="Set where you prefer to move"
                    testId="pref-add-token-where"
                    onClick={() => openEditorKind('where')}
                  />
                  , or{' '}
                  <InlinePreferenceToken
                    icon="footprints"
                    phrase="activities"
                    ariaLabel="Set preferred activities"
                    testId="pref-add-token-activities"
                    onClick={() => openEditorKind('activities')}
                  />
                  ?
                </p>
              </div>
            </div>
          );
        }

        if (entry.entryType === 'user_text') {
          return (
            <div key={entry.id} className="flex flex-col items-end">
              <div className="max-w-[85%] px-4 py-2.5 rounded-[20px] rounded-br-xs bg-[#51489A] text-white shadow-[0_3px_12px_rgba(81,72,154,0.2)] font-medium text-[15px] leading-[22px]">
                {entry.text}
              </div>
            </div>
          );
        }

        if (entry.entryType === 'nova_notice') {
          return (
            <div key={entry.id} className="flex flex-col items-start">
              <div
                data-testid="pref-nova-confirmation"
                className="w-full rounded-[22px] rounded-bl-xs bg-[#F6F5FA] border border-black/[0.045] px-4 py-3 shadow-2xs"
              >
                <p className="font-sans text-[16px] leading-[26px] font-normal text-[#211D2C]">
                  {entry.text}
                </p>
              </div>
            </div>
          );
        }

        if (entry.entryType === 'pref_editor') {
          const saveEnabled = canSaveEditor(entry);

          return (
            <div key={entry.id} className="flex flex-col items-start space-y-2.5">
              {/* Nova's inline-token sentence */}
              <div
                data-testid={`pref-sentence-${entry.prefKind}`}
                className="w-full rounded-[22px] rounded-bl-xs bg-[#F6F5FA] border border-black/[0.045] px-4 py-3.5 shadow-2xs"
              >
                {renderSentenceForEntry(entry)}
              </div>

              {/* Embedded interactive control card below current Nova message */}
              {entry.status === 'active' && entry.controlExpanded && (
                <div
                  data-testid={`pref-card-${entry.prefKind}`}
                  className="w-full rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-[0_2px_10px_rgba(28,28,45,0.04)] space-y-3.5"
                >
                  {entry.prefKind === 'session_length' && (
                    <SessionLengthDualSlider
                      value={entry.sessionLength}
                      onChange={(next) =>
                        updateEditor(entry.id, (e) => ({
                          ...e,
                          sessionLength: next,
                          error: null,
                        }))
                      }
                    />
                  )}

                  {entry.prefKind === 'best_time' && (
                    <BestTimeTimelineControl
                      value={entry.bestTime}
                      onChange={(next) =>
                        updateEditor(entry.id, (e) => ({
                          ...e,
                          bestTime: next,
                          error: null,
                        }))
                      }
                    />
                  )}

                  {entry.prefKind === 'where' && (
                    <WhereIconCardsControl
                      value={entry.where}
                      onChange={(next) =>
                        updateEditor(entry.id, (e) => ({
                          ...e,
                          where: next,
                          error: null,
                        }))
                      }
                    />
                  )}

                  {entry.prefKind === 'activities' && (
                    <ActivitiesPickerControl
                      value={entry.activities}
                      onChange={(next) =>
                        updateEditor(entry.id, (e) => ({
                          ...e,
                          activities: next,
                          error: null,
                        }))
                      }
                    />
                  )}

                  {entry.prefKind === 'avoid_activity' && (
                    <div
                      data-testid="pref-control-avoid-activity"
                      className="space-y-1.5"
                    >
                      <p className="text-[16px] leading-[22px] font-semibold text-[#211D2C]">
                        Suggest less {entry.avoidActivity.activity}?
                      </p>
                      <p className="text-[13px] leading-[19px] text-[#625B70]">
                        Nova will hold back on {entry.avoidActivity.activity} in future suggestions.
                      </p>
                    </div>
                  )}

                  {entry.prefKind === 'custom' && (
                    <div data-testid="pref-control-custom" className="space-y-2">
                      <label
                        htmlFor={`custom-pref-input-${entry.id}`}
                        className="block text-[13px] font-semibold text-[#555066]"
                      >
                        Preference
                      </label>
                      <input
                        id={`custom-pref-input-${entry.id}`}
                        type="text"
                        value={entry.customTitle}
                        onChange={(ev) =>
                          updateEditor(entry.id, (e) => ({
                            ...e,
                            customTitle: ev.target.value,
                            error: null,
                          }))
                        }
                        placeholder="e.g. Easy pace on Mondays"
                        className="w-full min-h-[44px] px-3.5 rounded-[14px] bg-[#F8F7FB] border border-black/[0.08] text-[15px] text-[#211D2C] outline-none focus:border-[#51489A]"
                      />
                    </div>
                  )}

                  {entry.error && (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-2 rounded-[12px] bg-[#FFF4F2] border border-[#F3CBC5] px-3 py-2 text-[13px] leading-[18px] text-[#9A3832]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{entry.error}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveEntry(entry.id)}
                        className="inline-flex items-center gap-1 shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Footer Actions: Cancel, optional Ignore (pending), Save preference */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      data-testid="pref-cancel-btn"
                      onClick={() => handleCancelEntry(entry.id)}
                      className="min-h-[44px] px-3.5 rounded-[14px] border border-black/[0.09] bg-white hover:bg-[#F5F5F7] text-[#4C475B] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Cancel
                    </button>

                    {entry.isPendingConfirm && (
                      <button
                        type="button"
                        data-testid="pref-ignore-btn"
                        onClick={() => handleIgnoreEntry(entry.id)}
                        className="min-h-[44px] px-3.5 rounded-[14px] border border-black/[0.08] bg-[#F8F7FB] hover:bg-[#EFECE6] text-[#555066] text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Ignore
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="pref-save-btn"
                      disabled={!saveEnabled}
                      onClick={() => handleSaveEntry(entry.id)}
                      className={`flex-1 min-h-[44px] px-4 rounded-[14px] text-[14px] font-semibold transition-colors whitespace-nowrap ${
                        saveEnabled
                          ? 'bg-[#51489A] hover:bg-[#463E8A] text-white cursor-pointer'
                          : 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed'
                      }`}
                    >
                      Save preference
                    </button>
                  </div>
                </div>
              )}

              {/* Compact settled indicator if cancelled or ignored */}
              {entry.status === 'cancelled' && entry.settledNote && (
                <p
                  data-testid={`pref-settled-cancelled-${entry.prefKind}`}
                  className="text-[12px] leading-[16px] text-[#6F687B] px-1"
                >
                  {entry.settledNote}
                </p>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
