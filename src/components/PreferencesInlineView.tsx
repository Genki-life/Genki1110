import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  ActivitiesPreference,
  BestTimePreference,
  PreferenceItem,
  SessionLengthPreference,
  WherePreference,
  formatActivitiesValue,
  formatAsCheckQuestion,
  formatBestTimeValue,
  formatSessionLengthValue,
  formatWhereValue,
  inferPreferenceKind,
} from '../utils/preferencesStore';
import {
  ActivitiesPickerControl,
  BestTimeTimelineControl,
  SessionLengthDualSlider,
  WhereIconCardsControl,
} from './PreferenceControls';

type PendingDecision = 'confirm' | 'ignore';

interface PreferencesDraftState {
  sessionLength: SessionLengthPreference;
  bestTime: BestTimePreference;
  where: WherePreference;
  activities: ActivitiesPreference;
  pendingDecisions: Record<string, PendingDecision>;
}

function extractCorePreferences(items: PreferenceItem[]): {
  sessionLength: SessionLengthPreference;
  bestTime: BestTimePreference;
  savedCueText: string | null;
  where: WherePreference;
  activities: ActivitiesPreference;
} {
  let sessionLength: SessionLengthPreference = { mode: 'unset' };
  let bestTime: BestTimePreference = { mode: 'unset' };
  let savedCueText: string | null = null;
  let where: WherePreference = { places: [] };
  let activities: ActivitiesPreference = { selected: [] };

  for (const item of items) {
    if (!item.isConfirmed || item.source !== 'user_explicit') continue;
    const kind = inferPreferenceKind(item);
    if (kind === 'session_length' && item.sessionLength) {
      sessionLength = { ...item.sessionLength };
    } else if (kind === 'best_time' && item.bestTime) {
      bestTime = { ...item.bestTime };
      if (item.bestTime.mode === 'cue' && item.bestTime.cueText?.trim()) {
        savedCueText = item.bestTime.cueText.trim();
      }
    } else if (kind === 'where' && item.where) {
      where = { places: [...item.where.places] };
    } else if (kind === 'activities' && item.activities) {
      activities = { selected: [...item.activities.selected] };
    }
  }

  return { sessionLength, bestTime, savedCueText, where, activities };
}

function areSessionLengthsEqual(
  a: SessionLengthPreference,
  b: SessionLengthPreference
): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'range') {
    return (a.minMinutes ?? 10) === (b.minMinutes ?? 10) && (a.maxMinutes ?? 20) === (b.maxMinutes ?? 20);
  }
  return true;
}

function areBestTimesEqual(a: BestTimePreference, b: BestTimePreference): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'window') {
    return (
      (a.startMinutes ?? 18 * 60) === (b.startMinutes ?? 18 * 60) &&
      (a.endMinutes ?? 20 * 60) === (b.endMinutes ?? 20 * 60)
    );
  }
  if (a.mode === 'cue') {
    return (a.cueText ?? '').trim().toLowerCase() === (b.cueText ?? '').trim().toLowerCase();
  }
  return true;
}

function areStringSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((v) => setA.has(v));
}

function buildCommittedPreferenceItems(
  savedItems: PreferenceItem[],
  draft: PreferencesDraftState
): PreferenceItem[] {
  const next: PreferenceItem[] = [];

  const existingConfirmedByKind = new Map<string, PreferenceItem>();
  for (const item of savedItems) {
    if (item.isConfirmed && item.source === 'user_explicit') {
      const kind = inferPreferenceKind(item);
      if (
        (kind === 'session_length' ||
          kind === 'best_time' ||
          kind === 'where' ||
          kind === 'activities') &&
        !existingConfirmedByKind.has(kind)
      ) {
        existingConfirmedByKind.set(kind, item);
      }
    }
  }

  // 1. Session length
  if (draft.sessionLength.mode !== 'unset') {
    const val = formatSessionLengthValue(draft.sessionLength);
    const existing = existingConfirmedByKind.get('session_length');
    next.push({
      ...(existing ?? {
        id: 'pref-session-length',
        category: 'feels_right',
        howItHelps: 'Guides default movement duration.',
      }),
      title: 'Session length',
      summary: val,
      shortTag: val,
      learnedFrom: 'Saved by you.',
      updatedAt: 'Updated just now',
      isConfirmed: true,
      source: 'user_explicit',
      prefKind: 'session_length',
      sessionLength: { ...draft.sessionLength },
    });
  }

  // 2. Best time
  if (draft.bestTime.mode !== 'unset') {
    const val = formatBestTimeValue(draft.bestTime);
    const existing = existingConfirmedByKind.get('best_time');
    next.push({
      ...(existing ?? {
        id: 'pref-best-time',
        category: 'feels_right',
        howItHelps: 'Helps suggest movement when it fits best.',
      }),
      title: 'Best time',
      summary: val,
      shortTag: val,
      learnedFrom: 'Saved by you.',
      updatedAt: 'Updated just now',
      isConfirmed: true,
      source: 'user_explicit',
      prefKind: 'best_time',
      bestTime: { ...draft.bestTime },
    });
  }

  // 3. Where
  if (draft.where.places.length > 0) {
    const val = formatWhereValue(draft.where);
    const existing = existingConfirmedByKind.get('where');
    next.push({
      ...(existing ?? {
        id: 'pref-where',
        category: 'feels_right',
        howItHelps: 'Prioritizes spaces you like to move in.',
      }),
      title: 'Where',
      summary: val,
      shortTag: val,
      learnedFrom: 'Saved by you.',
      updatedAt: 'Updated just now',
      isConfirmed: true,
      source: 'user_explicit',
      prefKind: 'where',
      where: { places: [...draft.where.places] },
    });
  }

  // 4. Activities
  if (draft.activities.selected.length > 0) {
    const val = formatActivitiesValue(draft.activities);
    const existing = existingConfirmedByKind.get('activities');
    next.push({
      ...(existing ?? {
        id: 'pref-activities',
        category: 'feels_right',
        howItHelps: 'Leans toward movement styles you enjoy.',
      }),
      title: 'Activities',
      summary: val,
      shortTag: val,
      learnedFrom: 'Saved by you.',
      updatedAt: 'Updated just now',
      isConfirmed: true,
      source: 'user_explicit',
      prefKind: 'activities',
      activities: { selected: [...draft.activities.selected] },
    });
  }

  // 5. Preserve any other already-confirmed scoped preferences (e.g., Less HIIT, shorter on busy days)
  const coreIds = new Set(Array.from(existingConfirmedByKind.values()).map((i) => i.id));
  for (const item of savedItems) {
    if (item.isConfirmed && item.source === 'user_explicit' && !coreIds.has(item.id)) {
      next.push(item);
    }
  }

  // 6. Process Needs confirmation items according to draft decisions (preserving each suggestion's scope!)
  for (const item of savedItems) {
    if (item.isConfirmed && item.source === 'user_explicit') continue;
    const decision = draft.pendingDecisions[item.id];
    if (decision === 'ignore') {
      // Ignored suggestions are removed on save
      continue;
    }
    if (decision === 'confirm') {
      const cleanTitle = item.title.replace(/\?+$/, '').trim();
      const isBusyDayScoped =
        item.id === 'demo-pref-short-sessions' || /\bbusy\s+days?\b/i.test(cleanTitle);

      if (isBusyDayScoped) {
        // Keep strictly scoped to busy days — NEVER touches general Session length
        next.push({
          ...item,
          category: 'feels_right',
          title: cleanTitle,
          summary: cleanTitle,
          shortTag: item.shortTag?.trim() || 'Shorter on busy days',
          learnedFrom: 'Confirmed by you.',
          updatedAt: 'Confirmed just now',
          isConfirmed: true,
          source: 'user_explicit',
          prefKind: 'custom',
          sessionLength: undefined,
        });
      } else if (item.prefKind === 'avoid_activity' || item.avoidActivity?.activity) {
        const avoidLabel =
          item.avoidActivity?.activity?.trim() ||
          cleanTitle.replace(/^suggest\s+less\s+/i, '').trim() ||
          cleanTitle;
        next.push({
          ...item,
          category: 'feels_right',
          title: cleanTitle,
          summary: avoidLabel,
          shortTag: item.shortTag?.trim() || `Less ${avoidLabel}`,
          learnedFrom: 'Confirmed by you.',
          updatedAt: 'Confirmed just now',
          isConfirmed: true,
          source: 'user_explicit',
          prefKind: 'avoid_activity',
          avoidActivity: { activity: avoidLabel },
        });
      } else {
        next.push({
          ...item,
          category: 'feels_right',
          title: cleanTitle,
          summary: item.summary || cleanTitle,
          learnedFrom: 'Confirmed by you.',
          updatedAt: 'Confirmed just now',
          isConfirmed: true,
          source: 'user_explicit',
          prefKind: item.prefKind ?? 'custom',
        });
      }
    } else {
      // Undecided pending item stays in Needs confirmation
      next.push(item);
    }
  }

  return next;
}

export interface PreferencesInlineViewProps {
  items: PreferenceItem[];
  onCommitAll: (nextItems: PreferenceItem[]) => boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export const PreferencesInlineView: React.FC<PreferencesInlineViewProps> = ({
  items,
  onCommitAll,
  onDirtyChange,
  scrollContainerRef,
}) => {
  const baseline = useMemo(() => extractCorePreferences(items), [items]);
  const pendingItems = useMemo(
    () => items.filter((m) => !m.isConfirmed || m.source !== 'user_explicit'),
    [items]
  );

  const [draft, setDraft] = useState<PreferencesDraftState>(() => ({
    sessionLength: baseline.sessionLength,
    bestTime: baseline.bestTime,
    where: baseline.where,
    activities: baseline.activities,
    pendingDecisions: {},
  }));

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const isDirty = useMemo(() => {
    if (!areSessionLengthsEqual(draft.sessionLength, baseline.sessionLength)) return true;
    if (!areBestTimesEqual(draft.bestTime, baseline.bestTime)) return true;
    if (!areStringSetsEqual(draft.where.places, baseline.where.places)) return true;
    if (!areStringSetsEqual(draft.activities.selected, baseline.activities.selected)) return true;
    const validPendingIds = new Set(pendingItems.map((p) => p.id));
    for (const key of Object.keys(draft.pendingDecisions)) {
      if (validPendingIds.has(key)) return true;
    }
    return false;
  }, [draft, baseline, pendingItems]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Clear stale 'saved' badge as soon as user starts editing again
  useEffect(() => {
    if (isDirty && saveStatus === 'saved') {
      setSaveStatus('idle');
    }
  }, [isDirty, saveStatus]);

  const handleTogglePendingDecision = (itemId: string, decision: PendingDecision) => {
    setSaveStatus('idle');
    setDraft((prev) => {
      const nextDecisions = { ...prev.pendingDecisions };
      if (nextDecisions[itemId] === decision) {
        delete nextDecisions[itemId];
      } else {
        nextDecisions[itemId] = decision;
      }
      return { ...prev, pendingDecisions: nextDecisions };
    });
  };

  const handleSave = () => {
    if (!isDirty) return;
    const nextItems = buildCommittedPreferenceItems(items, draft);
    const ok = onCommitAll(nextItems);
    if (!ok) {
      setSaveStatus('error');
      return;
    }

    const committedCore = extractCorePreferences(nextItems);
    setDraft({
      sessionLength: committedCore.sessionLength,
      bestTime: committedCore.bestTime,
      where: committedCore.where,
      activities: committedCore.activities,
      pendingDecisions: {},
    });
    setSaveStatus('saved');

    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      savedTimerRef.current = null;
    }, 2200);
  };

  const sessionLengthDisplay = formatSessionLengthValue(draft.sessionLength);
  const bestTimeDisplay = formatBestTimeValue(draft.bestTime);
  const whereDisplay = formatWhereValue(draft.where);
  const activitiesDisplay = formatActivitiesValue(draft.activities);

  return (
    <div
      id="preferences-secondary-page"
      className="flex-1 min-h-0 flex flex-col text-[#211D2C] font-sans"
    >
      {/* Scrollable editor body: 20px horizontal padding, 24px gap between sections, generous bottom space */}
      <div
        ref={scrollContainerRef}
        id="my-plan-secondary-sheet-body"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[20px] pt-5 pb-8 flex flex-col gap-[24px]"
      >
        {/* 1. Session length */}
        <section
          id="pref-section-session-length"
          data-pref-section="session_length"
          aria-labelledby="pref-heading-session-length"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              id="pref-heading-session-length"
              className="text-[15px] leading-[20px] font-semibold text-[#211D2C] shrink-0"
            >
              Session length
            </h4>
            <span
              data-pref-value-for="session_length"
              className={`text-[13px] leading-[18px] tabular-nums text-right truncate ${
                sessionLengthDisplay === 'Not set'
                  ? 'text-[#6F687B] font-normal'
                  : 'text-[#51489A] font-medium'
              }`}
            >
              {sessionLengthDisplay}
            </span>
          </div>

          <SessionLengthDualSlider
            value={draft.sessionLength}
            onChange={(next) => {
              setSaveStatus('idle');
              setDraft((prev) => ({ ...prev, sessionLength: next }));
            }}
          />
        </section>

        {/* 2. Best time */}
        <section
          id="pref-section-best-time"
          data-pref-section="best_time"
          aria-labelledby="pref-heading-best-time"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              id="pref-heading-best-time"
              className="text-[15px] leading-[20px] font-semibold text-[#211D2C] shrink-0"
            >
              Best time
            </h4>
            <span
              data-pref-value-for="best_time"
              className={`text-[13px] leading-[18px] tabular-nums text-right truncate ${
                bestTimeDisplay === 'Not set'
                  ? 'text-[#6F687B] font-normal'
                  : 'text-[#51489A] font-medium'
              }`}
            >
              {bestTimeDisplay}
            </span>
          </div>

          <BestTimeTimelineControl
            value={draft.bestTime}
            originalCueText={baseline.savedCueText}
            showChatHints={false}
            onChange={(next) => {
              setSaveStatus('idle');
              setDraft((prev) => ({ ...prev, bestTime: next }));
            }}
          />
        </section>

        {/* 3. Where */}
        <section
          id="pref-section-where"
          data-pref-section="where"
          aria-labelledby="pref-heading-where"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              id="pref-heading-where"
              className="text-[15px] leading-[20px] font-semibold text-[#211D2C] shrink-0"
            >
              Where
            </h4>
            <span
              data-pref-value-for="where"
              className={`text-[13px] leading-[18px] text-right truncate ${
                whereDisplay === 'Not set'
                  ? 'text-[#6F687B] font-normal'
                  : 'text-[#51489A] font-medium'
              }`}
            >
              {whereDisplay}
            </span>
          </div>

          <WhereIconCardsControl
            value={draft.where}
            onChange={(next) => {
              setSaveStatus('idle');
              setDraft((prev) => ({ ...prev, where: next }));
            }}
          />
        </section>

        {/* 4. Activities */}
        <section
          id="pref-section-activities"
          data-pref-section="activities"
          aria-labelledby="pref-heading-activities"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h4
              id="pref-heading-activities"
              className="text-[15px] leading-[20px] font-semibold text-[#211D2C] shrink-0"
            >
              Activities
            </h4>
            <span
              data-pref-value-for="activities"
              className={`text-[13px] leading-[18px] text-right truncate max-w-[65%] ${
                activitiesDisplay === 'Not set'
                  ? 'text-[#6F687B] font-normal'
                  : 'text-[#51489A] font-medium'
              }`}
            >
              {activitiesDisplay}
            </span>
          </div>

          <ActivitiesPickerControl
            value={draft.activities}
            showSelectedShelf={false}
            showChatHints={false}
            onChange={(next) => {
              setSaveStatus('idle');
              setDraft((prev) => ({ ...prev, activities: next }));
            }}
          />
        </section>

        {/* 5. Needs confirmation (only rendered when pending items exist) */}
        {pendingItems.length > 0 && (
          <section
            id="preferences-pending-section"
            aria-labelledby="pref-heading-pending"
            className="flex flex-col gap-3 pt-4 border-t border-black/[0.06]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h4
                id="pref-heading-pending"
                className="text-[15px] leading-[20px] font-semibold text-[#211D2C]"
              >
                Needs confirmation
              </h4>
              <span
                id="preferences-pending-count"
                className="text-[13px] leading-[18px] font-normal text-[#6F687B] tabular-nums"
              >
                {pendingItems.length}
              </span>
            </div>

            <div className="rounded-[18px] bg-[#F8F7FB] border border-black/[0.06] divide-y divide-black/[0.06] overflow-hidden">
              {pendingItems.map((item) => {
                const decision = draft.pendingDecisions[item.id];
                const questionLabel = formatAsCheckQuestion(item.title);
                return (
                  <div
                    key={item.id}
                    data-pref-pending-id={item.id}
                    data-pref-pending-decision={decision ?? 'undecided'}
                    className="px-4 py-3.5 flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] leading-[20px] font-medium text-[#211D2C] min-w-0">
                        {questionLabel}
                      </p>
                      {decision && (
                        <span
                          data-testid={`pending-status-${item.id}`}
                          className={`text-[12px] leading-[18px] font-medium shrink-0 whitespace-nowrap ${
                            decision === 'confirm' ? 'text-[#51489A]' : 'text-[#6F687B]'
                          }`}
                        >
                          {decision === 'confirm' ? 'Confirmed' : 'Ignored'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`pending-confirm-${item.id}`}
                        aria-pressed={decision === 'confirm'}
                        onClick={() => handleTogglePendingDecision(item.id, 'confirm')}
                        className={`min-h-[38px] px-3.5 rounded-[12px] border text-[13px] leading-[18px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
                          decision === 'confirm'
                            ? 'bg-[#51489A] border-[#51489A] text-white'
                            : 'bg-white border-black/[0.09] text-[#211D2C] hover:bg-[#F3EEFE] hover:border-[#51489A]/35 hover:text-[#51489A]'
                        }`}
                      >
                        {decision === 'confirm' && (
                          <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.6} aria-hidden="true" />
                        )}
                        <span>Confirm</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`pending-ignore-${item.id}`}
                        aria-pressed={decision === 'ignore'}
                        onClick={() => handleTogglePendingDecision(item.id, 'ignore')}
                        className={`min-h-[38px] px-3.5 rounded-[12px] border text-[13px] leading-[18px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] ${
                          decision === 'ignore'
                            ? 'bg-[#2E2A3B] border-[#2E2A3B] text-white'
                            : 'bg-white border-black/[0.09] text-[#625B70] hover:bg-[#EFECE6]/70'
                        }`}
                      >
                        <span>Ignore</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Fixed bottom Save preferences bar */}
      <div
        id="preferences-save-bar"
        className="shrink-0 px-[20px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))] border-t border-black/[0.06] bg-white/95 backdrop-blur-md flex flex-col gap-2"
      >
        {saveStatus === 'error' && (
          <div
            role="alert"
            id="preferences-save-error"
            className="flex items-center justify-between gap-2 text-[13px] leading-[18px] text-[#9A3832]"
          >
            <span>Couldn’t save preferences. Your changes are still here.</span>
            <button
              type="button"
              id="preferences-retry-save-btn"
              onClick={handleSave}
              className="font-semibold underline underline-offset-2 shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        <button
          type="button"
          id="preferences-save-btn"
          data-save-status={saveStatus}
          disabled={!isDirty}
          onClick={handleSave}
          className={`w-full h-[48px] rounded-[14px] text-[15px] leading-[20px] font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#51489A] focus-visible:ring-offset-2 ${
            isDirty
              ? 'bg-[#51489A] text-white hover:bg-[#453D86] active:scale-[0.99] cursor-pointer'
              : saveStatus === 'saved'
              ? 'bg-[#F3EEFE] text-[#51489A] border border-[#51489A]/25 cursor-default'
              : 'bg-[#ECEAF4] text-[#8E889C] cursor-not-allowed'
          }`}
        >
          {saveStatus === 'saved' && !isDirty ? (
            <>
              <Check className="w-[17px] h-[17px]" strokeWidth={2.5} aria-hidden="true" />
              <span role="status">Saved</span>
            </>
          ) : (
            <span>Save preferences</span>
          )}
        </button>
      </div>
    </div>
  );
};
