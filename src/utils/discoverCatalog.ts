import coverTrail from '../assets/images/discover_trail_1793765793796.jpg';
import coverStretch from '../assets/images/discover_stretch_1793765824456.jpg';
import coverEvening from '../assets/images/discover_evening_1793765838258.jpg';
import coverBreath from '../assets/images/discover_breath_1793765860138.jpg';
import type { DiscoverCatalogId } from './discoverStore';

export type DiscoverMediaType = 'audio' | 'video';

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
  category: 'Walk' | 'Stretch' | 'Breathe' | 'Unwind';
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
    title: 'Gentle walk',
    contentType: 'Guide',
    suggestedDuration: '15 min',
    category: 'Walk',
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
    title: 'Slow breathing',
    contentType: 'Guide',
    suggestedDuration: '8 min',
    category: 'Breathe',
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
    title: 'Evening wind-down',
    contentType: 'Guide',
    suggestedDuration: '20 min',
    category: 'Unwind',
    coverUrl: coverEvening,
    useCaseNote: 'A calmer way to end the day.',
    overview:
      'A 20-minute evening routine focused on lower light and stepping away from screens before turning in.',
    steps: [
      'Dim bright overhead lights and set your phone face-down nearby.',
      'Spend a few minutes tidying one small surface or making a warm caffeine-free drink.',
      'Use the remaining time to read, stretch lightly, or sit quietly.',
    ],
    source: 'demo',
  },
];
