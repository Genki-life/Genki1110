import React from 'react';
import type {
  HabitStartFrictionLevel,
  WeeklyReviewFitAnswer,
} from '../utils/planDataFoundation';

export interface WeeklyEmojiOption<T extends string> {
  value: T;
  emoji: string;
  label: string;
}

export const WEEKLY_FIT_EMOJI_OPTIONS: ReadonlyArray<
  WeeklyEmojiOption<WeeklyReviewFitAnswer> & { hint: string }
> = [
  {
    value: 'hard_to_fit_in',
    emoji: '😕',
    label: 'Hard to fit',
    hint: 'We can make it easier.',
  },
  {
    value: 'about_right',
    emoji: '🙂',
    label: 'About right',
    hint: 'Let’s keep this pace.',
  },
  {
    value: 'room_for_more',
    emoji: '🙌',
    label: 'Room for more',
    hint: 'We can build gently.',
  },
];

export const WEEKLY_STARTING_FEEL_EMOJI_OPTIONS: ReadonlyArray<
  WeeklyEmojiOption<HabitStartFrictionLevel>
> = [
  {
    value: 'hard_to_start',
    emoji: '😕',
    label: 'Hard to start',
  },
  {
    value: 'manageable',
    emoji: '🙂',
    label: 'Took a nudge',
  },
  {
    value: 'easier',
    emoji: '😊',
    label: 'Easy to start',
  },
];

interface WeeklyEmojiSelectorProps<T extends string> {
  options: ReadonlyArray<WeeklyEmojiOption<T>>;
  selectedValue: T | null;
  onSelect: (value: T) => void;
  ariaLabelledBy: string;
  optionIdPrefix: string;
  className?: string;
}

export function WeeklyEmojiSelector<T extends string>({
  options,
  selectedValue,
  onSelect,
  ariaLabelledBy,
  optionIdPrefix,
  className = '',
}: WeeklyEmojiSelectorProps<T>) {
  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className={`genki-plan-feedback-grid ${className}`.trim()}
    >
      {options.map((opt) => {
        const isSelected = selectedValue === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            id={`${optionIdPrefix}-${opt.value}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(opt.value)}
            className="genki-plan-control genki-plan-control-feedback genki-plan-control-feedback-stacked"
          >
            <span aria-hidden="true" className="genki-plan-control-feedback-emoji">
              {opt.emoji}
            </span>
            <span className="genki-plan-control-feedback-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
