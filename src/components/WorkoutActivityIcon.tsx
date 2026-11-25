import React from 'react';

interface WorkoutActivityIconProps {
  typeKey: string;
  size?: number;
  className?: string;
}

/**
 * Presentation-friendly workout category label aligned with Apple Fitness naming
 * while keeping underlying HealthKit keys intact.
 */
export function getWorkoutDisplayLabel(typeKey: string, fallbackLabel: string): string {
  if (typeKey === 'flexibility') return 'Stretching';
  if (typeKey === 'functionalStrengthTraining') return 'Functional Strength Training';
  return fallbackLabel;
}

/**
 * Distinct monochrome Apple Fitness-style workout silhouette icons (24x24 viewBox, rendered at 20px default).
 * Every supported HealthKit workout type maps to its own recognizable pose using `currentColor`.
 */
export const WorkoutActivityIcon: React.FC<WorkoutActivityIconProps> = ({
  typeKey,
  size = 20,
  className = '',
}) => {
  const key = typeKey.trim().toLowerCase();

  const makeSvgProps = (variant: string): React.SVGProps<SVGSVGElement> & { 'data-icon-variant': string } => ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    focusable: false,
    'data-icon-variant': variant,
    className,
  });

  // 1. Walking (upright walking figure in side stride)
  if (key === 'walking' || key === 'walk') {
    return (
      <svg {...makeSvgProps('walking')}>
        <circle cx="13.2" cy="4.4" r="2.15" fill="currentColor" />
        <path
          d="M12.3 8.2L10.9 13.4L14.5 16.2L15.4 20.6"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.8 13.8L8.3 20.5"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.1 12.2L10.4 9.1L12.6 8.3L15.2 10.7L17.2 11.4"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 2. Cycling (cyclist on two-wheeled bicycle)
  if (key === 'cycling' || key === 'bike') {
    return (
      <svg {...makeSvgProps('cycling')}>
        <circle cx="15.3" cy="4.7" r="2" fill="currentColor" />
        <circle cx="6.6" cy="17.2" r="3.1" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.6" cy="17.2" r="3.1" stroke="currentColor" strokeWidth="2" />
        <path
          d="M13.2 8.2L9.7 11.5L13.1 13.7L12.1 17.4"
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

  // 3. Yoga (seated lotus meditation pose)
  if (key === 'yoga' || key === 'mindandbody' || key === 'taichi') {
    return (
      <svg {...makeSvgProps('yoga')}>
        <circle cx="12" cy="4.9" r="2.15" fill="currentColor" />
        <path
          d="M12 9V14.5"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M6.2 12.2L9.6 10.3H14.4L17.8 12.2"
          stroke="currentColor"
          strokeWidth="2.05"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 18.8C7.6 16.1 10 15.1 12 15.1C14 15.1 16.4 16.1 18 18.8"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <path
          d="M7.6 19.3H16.4"
          stroke="currentColor"
          strokeWidth="2.15"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 4. Running (dynamic forward-leaning sprinter)
  if (key === 'running' || key === 'run') {
    return (
      <svg {...makeSvgProps('running')}>
        <circle cx="15.3" cy="4.5" r="2.15" fill="currentColor" />
        <path
          d="M7.7 9.2L10.9 7.8L13.7 9.1L16.3 11.2L18.8 10.5"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.2 9.4L11.2 13.6L15.5 15.6L17.4 20.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.1 13.8L8.4 16.8L5.2 17.2"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 5. Swimming (freestyle swimmer over water wave)
  if (key === 'swimming' || key === 'swim') {
    return (
      <svg {...makeSvgProps('swimming')}>
        <circle cx="17.6" cy="7.4" r="2" fill="currentColor" />
        <path
          d="M5.4 12.2L11.2 10.6L15.2 12.1L19.4 10.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.2 10.6L13.6 7.4L16.2 8.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.8 16.6C5.4 15.4 7 15.4 8.6 16.6C10.2 17.8 11.8 17.8 13.4 16.6C15 15.4 16.6 15.4 18.2 16.6C19.2 17.3 20 17.4 20.6 17.2"
          stroke="currentColor"
          strokeWidth="1.95"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 6. Functional Strength Training (athletic lunge/squat with overhead kettlebell/dumbbells)
  if (key === 'functionalstrengthtraining') {
    return (
      <svg {...makeSvgProps('functional-strength')}>
        <circle cx="12" cy="7.2" r="2" fill="currentColor" />
        {/* Raised dumbbells/weights in athletic V-press */}
        <path
          d="M6.4 4.2L8.4 5.4M17.6 4.2L15.6 5.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
        <path
          d="M7.4 4.9L9.7 10.2H14.3L16.6 4.9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Deep athletic squat / functional stance */}
        <path
          d="M12 10.4V14.6L8.3 16.4L7.2 20.5"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 14.6L15.7 16.4L16.8 20.5"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 7. Hiking (uphill hiker with backpack & trekking pole)
  if (key === 'hiking' || key === 'hike') {
    return (
      <svg {...makeSvgProps('hiking')}>
        <circle cx="12.6" cy="4.4" r="2" fill="currentColor" />
        {/* Backpack silhouette behind torso */}
        <path
          d="M7.8 8.4L6.8 12.2L8.9 12.7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Torso + uphill stride */}
        <path
          d="M11.6 8.1L10.3 13.4L13.7 16.3L14.4 20.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.3 13.6L7.6 20.4"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Front arm holding trekking pole planted on ground */}
        <path
          d="M11.6 8.8L15.2 11.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M15.4 10.5L17.4 20.6"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 8. Pilates (classic Pilates teaser / V-sit core balance pose)
  if (key === 'pilates') {
    return (
      <svg {...makeSvgProps('pilates')}>
        <circle cx="6.8" cy="7.6" r="2" fill="currentColor" />
        {/* Reclined V-sit torso + straight legs lifted at 45 deg */}
        <path
          d="M8.4 10.6L11.4 16.6L19.2 10.4"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Arms reaching parallel forward toward lifted toes */}
        <path
          d="M9.6 12.4L15.8 10.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Subtle mat baseline */}
        <path
          d="M6.4 19.6H17.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 9. Jump Rope (airborne jumper with curved overhead rope arc)
  if (key === 'jumprope') {
    return (
      <svg {...makeSvgProps('jump-rope')}>
        {/* Curved jump rope arc */}
        <path
          d="M5.4 12.6C5.4 5.4 18.6 5.4 18.6 12.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="7.8" r="1.95" fill="currentColor" />
        {/* Arms out holding handles */}
        <path
          d="M7.2 12.9L9.8 11.4H14.2L16.8 12.9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Jumping torso + tucked/airborne legs */}
        <path
          d="M12 11.4V15.4L9.7 19.6M12 15.4L14.3 19.6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 10. Stretching / Flexibility (arched overhead side stretch pose)
  if (key === 'flexibility' || key === 'stretch' || key === 'stretching' || key === 'cooldown') {
    return (
      <svg {...makeSvgProps('flexibility')}>
        <circle cx="12.2" cy="5.2" r="2.1" fill="currentColor" />
        <path
          d="M7.6 5.2C9.1 3.3 12.4 3.1 14.8 4.9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M7.6 5.2L9.4 9.5L13.4 9.3L16.8 11.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.6 9.4L11.9 14.2L8.1 20.4M12.1 14.2L16.3 20.4"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 11. Traditional Strength Training (overhead barbell press)
  if (key === 'traditionalstrengthtraining' || key === 'strength') {
    return (
      <svg {...makeSvgProps('traditional-strength')}>
        <circle cx="12" cy="7.4" r="2" fill="currentColor" />
        <path
          d="M5.2 5.2H18.8M6.2 3.8V6.6M17.8 3.8V6.6"
          stroke="currentColor"
          strokeWidth="1.95"
          strokeLinecap="round"
        />
        <path
          d="M8.5 5.4L9.8 10.8H14.2L15.5 5.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 10.8V15.4L9.4 20.4M12 15.4L14.6 20.4"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // 12. Core Training (plank silhouette)
  if (key === 'coretraining' || key === 'core') {
    return (
      <svg {...makeSvgProps('core-training')}>
        <circle cx="18.2" cy="10.2" r="1.95" fill="currentColor" />
        <path
          d="M4.8 16.8L15.4 11.6L16.2 16.8"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.2 16.8H17.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default fallback movement silhouette
  return (
    <svg {...makeSvgProps('generic')}>
      <circle cx="12.5" cy="4.6" r="2.1" fill="currentColor" />
      <path
        d="M7.8 10.4L11.1 8.8L13.9 9.5L16.8 11.4"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.2 9.2L11.4 14.1L14.8 20.4M11.4 14.1L8.4 20.4"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
