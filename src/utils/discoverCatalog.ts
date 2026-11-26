import coverTrail from '../assets/images/discover_trail_1793765793796.jpg';
import coverStretch from '../assets/images/discover_stretch_1793765824456.jpg';
import coverEvening from '../assets/images/discover_evening_1793765838258.jpg';
import coverBreath from '../assets/images/discover_breath_1793765860138.jpg';
import type { DiscoverCatalogId } from './discoverStore';

export type DiscoverMediaType = 'audio' | 'video';
export type DiscoverCoverAspectRatio = '5/4' | '1/1';

export interface DiscoverPublisher {
  name: string;
  url: string;
}

export interface DiscoverItem {
  id: DiscoverCatalogId;
  title: string;
  contentType: 'Guide';
  /** Suggested practice duration (not media playback length) */
  suggestedDuration: string;
  category: 'Walk' | 'Stretch' | 'Breathe' | 'Unwind' | 'Yoga';
  /** Direct movement/activity label shown under the title */
  activityType: string;
  /** Fixed cover aspect ratio per item (5:4 default, 1:1 for select items) */
  coverAspectRatio: DiscoverCoverAspectRatio;
  coverUrl: string;
  /** Objective usage scenario — no unverified personalization claims */
  useCaseNote: string;
  /** Short, plain-English overview */
  overview: string;
  /** 3 concise, actionable steps for "How to try it" */
  steps: string[];
  /** Reserved optional media fields — playback UI may only render when mediaUrl is present */
  mediaType?: DiscoverMediaType;
  mediaUrl?: string;
  /** Reserved verified attribution — only shown when publisher name & verifiable URL exist */
  publisher?: DiscoverPublisher;
  /** Internal prototype provenance marker (not rendered in UI) */
  source: 'demo';
}

export const DISCOVER_ITEMS: DiscoverItem[] = [
  {
    id: 'walk-mindful',
    title: 'Gentle morning neighborhood walk',
    contentType: 'Guide',
    suggestedDuration: '15 min',
    category: 'Walk',
    activityType: 'Walking',
    coverAspectRatio: '5/4',
    coverUrl: coverTrail,
    useCaseNote: 'A gentle way to step outside.',
    overview:
      'A 15-minute walk at an easy pace to get fresh air and take a short break from screens. Move at whatever speed feels steady.',
    steps: [
      'Start at a comfortable pace without checking speed or distance.',
      'Let your gaze rest on trees, sky, or distant buildings instead of your phone.',
      'Take a few slow, easy breaths as your shoulders relax.',
    ],
    source: 'demo',
  },
  {
    id: 'desk-decompression',
    title: 'Desk stretch',
    contentType: 'Guide',
    suggestedDuration: '6 min',
    category: 'Stretch',
    activityType: 'Stretching',
    coverAspectRatio: '1/1',
    coverUrl: coverStretch,
    useCaseNote: 'A short break after desk work.',
    overview:
      'A 6-minute stretch for tight shoulders, neck, and upper back after sitting. You can do it standing or seated in everyday clothes.',
    steps: [
      'Roll your shoulders slowly back and down a few times.',
      'Gently lengthen the back of your neck and open your chest for two slow breaths.',
      'Stop as soon as you feel a light stretch—never push into discomfort.',
    ],
    source: 'demo',
  },
  {
    id: 'parasympathetic-breath',
    title: 'Slow 4-7-8 breathing reset',
    contentType: 'Guide',
    suggestedDuration: '8 min',
    category: 'Breathe',
    activityType: 'Breathing',
    coverAspectRatio: '5/4',
    coverUrl: coverBreath,
    useCaseNote: 'A quiet moment to slow down.',
    overview:
      'An 8-minute seated breathing practice with a longer exhale. A simple way to pause between parts of your day.',
    steps: [
      'Sit comfortably with your back supported and jaw relaxed.',
      'Breathe in softly through your nose for 4 counts, pause for 7, and exhale slowly for 8.',
      'If the 7-count pause feels tight, switch to an easier 4-4-6 count.',
    ],
    source: 'demo',
  },
  {
    id: 'evening-soundscape',
    title: 'Quiet evening wind-down & light floor stretch before bed',
    contentType: 'Guide',
    suggestedDuration: '20 min',
    category: 'Unwind',
    activityType: 'Yoga',
    coverAspectRatio: '5/4',
    coverUrl: coverEvening,
    useCaseNote: 'A calmer way to end the day.',
    overview:
      'A 20-minute evening routine focused on lower light, gentle floor poses, and stepping away from screens before turning in.',
    steps: [
      'Dim bright overhead lights and set your phone face-down nearby.',
      'Move through two slow seated twists and a supported child’s pose for a few easy breaths.',
      'Use the remaining time to read, stretch lightly, or sit quietly.',
    ],
    source: 'demo',
  },
  {
    id: 'morning-yoga-flow',
    title: 'Easy floor yoga for stiff hips and lower back',
    contentType: 'Guide',
    suggestedDuration: '12 min',
    category: 'Yoga',
    activityType: 'Yoga',
    coverAspectRatio: '1/1',
    coverUrl: coverStretch,
    useCaseNote: 'Loosen up gently without breaking a sweat.',
    overview:
      'A low-intensity floor sequence designed to wake up tight hips, hamstrings, and your lower back at an unhurried rhythm.',
    steps: [
      'Start on a mat or soft rug with slow cat-cow movements synced to your breath.',
      'Transition into a gentle low lunge on each side, keeping your weight balanced and soft.',
      'Finish lying on your back with knees bent side to side for five relaxed breaths.',
    ],
    source: 'demo',
  },
  {
    id: 'after-lunch-stroll',
    title: '10-minute outdoor reset walk after lunch',
    contentType: 'Guide',
    suggestedDuration: '10 min',
    category: 'Walk',
    activityType: 'Walking',
    coverAspectRatio: '5/4',
    coverUrl: coverTrail,
    useCaseNote: 'A light midday loop to clear afternoon fog.',
    overview:
      'A brief, easygoing stroll right after lunch to settle digestion and ease into the afternoon with a clearer head.',
    steps: [
      'Step outside for five minutes in one direction without setting a pace goal.',
      'Keep your arms loose and notice the air temperature or sunlight along your route.',
      'Turn back gently and take one deep exhale before returning to your desk.',
    ],
    source: 'demo',
  },
];
