import type { ActivityCategory } from './weeklyPlanStore';
import {
  BestTimePreference,
  PreferenceItem,
  PreferencePlace,
  SessionLengthPreference,
  formatTimeWindowSentence,
  inferPreferenceKind,
} from './preferencesStore';

export interface ConfirmedPreferenceProfile {
  sessionLength: SessionLengthPreference | null;
  bestTime: BestTimePreference | null;
  places: PreferencePlace[];
  preferredActivities: string[];
  lessOfActivities: string[];
}

export interface SuggestionPlanCandidate {
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
  /** Structured metadata used by preference scoring */
  activityKey?: string;
  place?: PreferencePlace;
}

/**
 * Extracts ONLY user-confirmed preferences (`isConfirmed === true && source === 'user_explicit'`)
 * as structured inputs for future movement suggestions. Unconfirmed pending questions never apply.
 */
export function extractConfirmedPreferenceProfile(
  items: PreferenceItem[]
): ConfirmedPreferenceProfile {
  let sessionLength: SessionLengthPreference | null = null;
  let bestTime: BestTimePreference | null = null;
  const placesSet = new Set<PreferencePlace>();
  const preferredSet = new Set<string>();
  const lessOfSet = new Set<string>();

  for (const item of items) {
    if (!item.isConfirmed || item.source !== 'user_explicit') continue;
    const kind = inferPreferenceKind(item);

    if (kind === 'session_length' && item.sessionLength && item.sessionLength.mode !== 'unset') {
      if (!sessionLength) sessionLength = item.sessionLength;
    } else if (kind === 'best_time' && item.bestTime && item.bestTime.mode !== 'unset') {
      if (!bestTime) bestTime = item.bestTime;
    } else if (kind === 'where' && item.where?.places.length) {
      item.where.places.forEach((p) => placesSet.add(p));
    } else if (kind === 'activities' && item.activities?.selected.length) {
      item.activities.selected.forEach((a) => preferredSet.add(a.toLowerCase()));
    } else if (kind === 'avoid_activity' && item.avoidActivity?.activity) {
      lessOfSet.add(item.avoidActivity.activity.trim().toLowerCase());
    }
  }

  return {
    sessionLength,
    bestTime,
    places: Array.from(placesSet),
    preferredActivities: Array.from(preferredSet),
    lessOfActivities: Array.from(lessOfSet),
  };
}

function getTimingLeadClause(bestTime: BestTimePreference | null): string | null {
  if (!bestTime || bestTime.mode === 'unset' || bestTime.mode === 'flexible') {
    return null;
  }
  if (bestTime.mode === 'cue' && bestTime.cueText?.trim()) {
    const clean = bestTime.cueText.trim().replace(/[.!?]+$/, '');
    return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  }
  if (
    bestTime.mode === 'window' &&
    typeof bestTime.startMinutes === 'number' &&
    typeof bestTime.endMinutes === 'number'
  ) {
    const phrase = formatTimeWindowSentence(bestTime.startMinutes, bestTime.endMinutes);
    return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
  }
  return null;
}

function inferCandidateMeta(candidate: SuggestionPlanCandidate): {
  activityKey: string;
  place: PreferencePlace;
  duration: number;
} {
  const lower = `${candidate.id} ${candidate.title}`.toLowerCase();
  const activityKey =
    candidate.activityKey ||
    (lower.includes('hiit')
      ? 'hiit'
      : lower.includes('walk')
      ? 'walking'
      : lower.includes('cycl') || lower.includes('bike')
      ? 'cycling'
      : lower.includes('yoga')
      ? 'yoga'
      : lower.includes('strength')
      ? 'strength'
      : lower.includes('run')
      ? 'running'
      : lower.includes('pilates')
      ? 'pilates'
      : lower.includes('swim')
      ? 'swimming'
      : lower.includes('hik')
      ? 'hiking'
      : lower.includes('stretch') || lower.includes('shoulder') || lower.includes('mobility')
      ? 'stretching'
      : 'other');

  const place: PreferencePlace =
    candidate.place ||
    (lower.includes('gym')
      ? 'gym'
      : lower.includes('home') ||
        lower.includes('living room') ||
        lower.includes('seated') ||
        activityKey === 'stretching' ||
        activityKey === 'yoga' ||
        activityKey === 'pilates'
      ? 'home'
      : 'outdoors');

  const duration = candidate.durationMinutes ?? 10;
  return { activityKey, place, duration };
}

function adaptCandidateDurationAndTiming(
  candidate: SuggestionPlanCandidate,
  profile: ConfirmedPreferenceProfile
): SuggestionPlanCandidate {
  let next = { ...candidate };

  // 1. Adapt duration smoothly when user specified a concrete session length range
  if (
    profile.sessionLength &&
    profile.sessionLength.mode === 'range' &&
    typeof profile.sessionLength.minMinutes === 'number' &&
    typeof profile.sessionLength.maxMinutes === 'number' &&
    typeof next.durationMinutes === 'number' &&
    next.durationMinutes > 0
  ) {
    const min = profile.sessionLength.minMinutes;
    const max = profile.sessionLength.maxMinutes;
    if (next.durationMinutes < min || next.durationMinutes > max) {
      const targetMins = next.durationMinutes > max ? max : min;
      const oldMins = next.durationMinutes;
      const replaceMinText = (str: string) =>
        str
          .replace(new RegExp(`\\b${oldMins}-minute\\b`, 'gi'), `${targetMins}-minute`)
          .replace(new RegExp(`\\b${oldMins}\\s*min\\b`, 'gi'), `${targetMins} min`);

      next = {
        ...next,
        durationMinutes: targetMins,
        title: replaceMinText(next.title),
        bubblePrompt: replaceMinText(next.bubblePrompt),
        detailTitle: replaceMinText(next.detailTitle),
        audioSubtitle: replaceMinText(next.audioSubtitle),
        fullDescription: replaceMinText(next.fullDescription),
      };
    }
  }

  // 2. Adapt timing window / life trigger cue when confirmed
  const timingLead = getTimingLeadClause(profile.bestTime);
  if (timingLead && next.activityCategory !== 'rest') {
    next = {
      ...next,
      subtitle: `${timingLead} could be a good fit for this based on your preferences.`,
      tip1: `Best window: ${timingLead.charAt(0).toLowerCase()}${timingLead.slice(1)} to match your saved rhythm.`,
    };
  }

  return next;
}

export function scoreCandidateForPreferences(
  candidate: SuggestionPlanCandidate,
  profile: ConfirmedPreferenceProfile
): number {
  const { activityKey, place, duration } = inferCandidateMeta(candidate);
  let score = 0;

  // Hard penalty for activities the user explicitly asked to see less of
  const lowerTitle = candidate.title.toLowerCase();
  for (const avoided of profile.lessOfActivities) {
    if (activityKey === avoided || lowerTitle.includes(avoided)) {
      score -= 100;
    }
  }

  // Session length match
  if (
    profile.sessionLength &&
    profile.sessionLength.mode === 'range' &&
    typeof profile.sessionLength.minMinutes === 'number' &&
    typeof profile.sessionLength.maxMinutes === 'number'
  ) {
    const { minMinutes, maxMinutes } = profile.sessionLength;
    if (duration >= minMinutes && duration <= maxMinutes) {
      score += 30;
    } else {
      const dist = duration < minMinutes ? minMinutes - duration : duration - maxMinutes;
      score -= Math.min(24, dist);
    }
  }

  // Place preference match
  if (profile.places.length > 0) {
    if (profile.places.includes(place)) {
      score += 20;
    } else {
      score -= 12;
    }
  }

  // Preferred activity match
  if (profile.preferredActivities.length > 0) {
    if (profile.preferredActivities.includes(activityKey)) {
      score += 25;
    }
  }

  return score;
}

/**
 * Selects and adapts the top `count` Today suggestion cards based on confirmed user preferences.
 * Guarantees distinct activities where possible and excludes avoided activities first.
 */
export function buildPreferenceAwareTodayPlans(
  profile: ConfirmedPreferenceProfile,
  pool: SuggestionPlanCandidate[],
  count = 3
): SuggestionPlanCandidate[] {
  const hasAnyPreference =
    Boolean(profile.sessionLength && profile.sessionLength.mode !== 'unset') ||
    Boolean(profile.bestTime && profile.bestTime.mode !== 'unset') ||
    profile.places.length > 0 ||
    profile.preferredActivities.length > 0 ||
    profile.lessOfActivities.length > 0;

  if (!hasAnyPreference) {
    return pool.slice(0, count);
  }

  const ranked = pool
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidateForPreferences(candidate, profile),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));

  return ranked
    .slice(0, count)
    .map(({ candidate }) => adaptCandidateDurationAndTiming(candidate, profile));
}

/**
 * Picks the best next alternative suggestion (e.g., for Today's "Plan B" or "Show me another option")
 * using the user's confirmed preferences while excluding the current and already-shown plans.
 */
export function pickPreferenceAwareAlternative(
  profile: ConfirmedPreferenceProfile,
  pool: SuggestionPlanCandidate[],
  excludedPlanIds: string[]
): SuggestionPlanCandidate | null {
  const excluded = new Set(excludedPlanIds);
  const eligible = pool.filter((p) => !excluded.has(p.id));
  if (eligible.length === 0) return null;

  const ranked = eligible
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreCandidateForPreferences(candidate, profile),
    }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));

  return adaptCandidateDurationAndTiming(ranked[0].candidate, profile);
}
