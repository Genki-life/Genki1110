import React from 'react';

interface WorkoutActivityIconProps {
  typeKey: string;
  size?: number;
  className?: string;
}

/**
 * Presentation-friendly workout category label aligned with Apple Fitness naming
 * while keeping underlying HealthKit keys (`flexibility`, `walking`, `running`, etc.) intact.
 */
export function getWorkoutDisplayLabel(typeKey: string, fallbackLabel: string): string {
  if (typeKey === 'flexibility') return 'Stretching';
  return fallbackLabel;
}

/**
 * Monochrome Apple Fitness-style workout silhouette icons (24x24 viewBox, rendered at 20px default).
 * Uses `currentColor` so every icon inherits the Plan page's muted purple-gray palette.
 */
export const WorkoutActivityIcon: React.FC<WorkoutActivityIconProps> = ({
  typeKey,
  size = 20,
  className = '',
}) => {
  const key = typeKey.trim().toLowerCase();

  const commonSvgProps: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    focusable: false,
    className,
  };

  // Walking (Apple Fitness figure walking in side stride)
  if (key === 'walking' || key === 'walk' || key === 'hiking') {
    return (
      <svg {...commonSvgProps}>
        <circle cx="13.2" cy="4.4" r="2.2" fill="currentColor" />
        <path
          d="M12.3 8.2L10.8 13.4L14.5 16.2L15.4 20.6"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.7 13.8L8.2 20.5"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.1 12.1L10.4 9.1L12.6 8.3L15.2 10.7L17.2 11.4"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Running (Apple Fitness dynamic forward-leaning runner)
  if (key === 'running' || key === 'run') {
    return (
      <svg {...commonSvgProps}>
        <circle cx="15.3" cy="4.5" r="2.2" fill="currentColor" />
        <path
          d="M7.8 9.2L10.9 7.8L13.7 9.1L16.3 11.2L18.8 10.6"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.2 9.4L11.2 13.6L15.5 15.6L17.4 20.4"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.1 13.8L8.4 16.8L5.3 17.2"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Stretching / Flexibility (Apple Fitness arched overhead side stretch pose)
  if (key === 'flexibility' || key === 'stretch' || key === 'stretching' || key === 'cooldown') {
    return (
      <svg {...commonSvgProps}>
        <circle cx="12.2" cy="5.2" r="2.15" fill="currentColor" />
        {/* Overhead reaching arm + opposite hand on hip/leg */}
        <path
          d="M7.6 5.2C9.1 3.3 12.4 3.1 14.8 4.9"
          stroke="currentColor"
          strokeWidth="2.05"
          strokeLinecap="round"
        />
        <path
          d="M7.6 5.2L9.4 9.5L13.4 9.3L16.8 11.4"
          stroke="currentColor"
          strokeWidth="2.05"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Torso + wide-stance stretch legs */}
        <path
          d="M11.6 9.4L11.9 14.2L8.1 20.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.1 14.2L16.3 20.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Yoga / Mind & Body (seated lotus balance figure)
  if (key === 'yoga' || key === 'mindandbody' || key === 'pilates' || key === 'taichi') {
    return (
      <svg {...commonSvgProps}>
        <circle cx="12" cy="5" r="2.15" fill="currentColor" />
        <path
          d="M12 9V14.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M6.4 11.6L9.8 10.2H14.2L17.6 11.6"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.2 18.8C7.8 16.1 10.1 15 12 15C13.9 15 16.2 16.1 17.8 18.8"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M7.8 19.2H16.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Cycling (Apple Fitness cyclist silhouette)
  if (key === 'cycling' || key === 'bike') {
    return (
      <svg {...commonSvgProps}>
        <circle cx="15.2" cy="4.8" r="2" fill="currentColor" />
        <circle cx="6.8" cy="17.2" r="3.1" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.6" cy="17.2" r="3.1" stroke="currentColor" strokeWidth="2" />
        <path
          d="M13.2 8.2L9.8 11.6L13.1 13.7L12.1 17.4"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.2 8.2L16.3 10.3H18.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Strength / Core Training (Apple Fitness overhead dumbbell figure)
  if (
    key === 'traditionalstrengthtraining' ||
    key === 'functionalstrengthtraining' ||
    key === 'coretraining' ||
    key === 'strength'
  ) {
    return (
      <svg {...commonSvgProps}>
        <circle cx="12" cy="6.2" r="2.1" fill="currentColor" />
        <path
          d="M6.2 5.4V8.8M17.8 5.4V8.8M5 7.1H8.4M15.6 7.1H19"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8.2 7.6L9.6 10.8H14.4L15.8 7.6"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 10.8V15.2L9.2 20.4M12 15.2L14.8 20.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // Default active movement silhouette
  return (
    <svg {...commonSvgProps}>
      <circle cx="12.5" cy="4.6" r="2.15" fill="currentColor" />
      <path
        d="M7.8 10.4L11.1 8.8L13.9 9.5L16.8 11.4"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.2 9.2L11.4 14.1L14.8 20.4M11.4 14.1L8.4 20.4"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
