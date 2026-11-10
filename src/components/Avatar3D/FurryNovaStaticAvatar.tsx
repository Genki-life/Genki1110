import React from 'react';

export interface FurryNovaStaticAvatarProps {
  className?: string;
  size?: number;
  isListening?: boolean;
}

/**
 * High-fidelity static vector avatar of the plush lavender-violet Fur Nova companion.
 * Visually identical to the 3D Mochi-Puff creature (lavender fur with petal-pink tips,
 * puffy ears, glossy dark button eyes with catchlights, rosy blush, and sweet smile).
 */
export function FurryNovaStaticAvatar({
  className = '',
  size = 128,
  isListening = false
}: FurryNovaStaticAvatarProps) {
  return (
    <div 
      className={`relative select-none pointer-events-none flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label="Nova Avatar"
    >
      <svg
        viewBox="0 0 160 160"
        className="w-full h-full drop-shadow-[0_8px_20px_rgba(100,50,220,0.22)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Main Body Plush Fur Gradient */}
          <radialGradient id="novaBodyGrad" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#A881FF" />
            <stop offset="55%" stopColor="#753FE6" />
            <stop offset="85%" stopColor="#5522C8" />
            <stop offset="100%" stopColor="#4314A8" />
          </radialGradient>

          {/* Ear Pink Tips Gradient */}
          <linearGradient id="earLeftGrad" x1="20%" y1="0%" x2="60%" y2="100%">
            <stop offset="0%" stopColor="#FFAFD1" />
            <stop offset="50%" stopColor="#A47BFA" />
            <stop offset="100%" stopColor="#6C35DE" />
          </linearGradient>

          <linearGradient id="earRightGrad" x1="80%" y1="0%" x2="40%" y2="100%">
            <stop offset="0%" stopColor="#FFAFD1" />
            <stop offset="50%" stopColor="#A47BFA" />
            <stop offset="100%" stopColor="#6C35DE" />
          </linearGradient>

          {/* Rosy Blush Gradient */}
          <radialGradient id="blushGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF7096" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#FF85A8" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#FF85A8" stopOpacity="0" />
          </radialGradient>

          {/* Eye Specular Glow */}
          <radialGradient id="eyeGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#25123A" />
            <stop offset="100%" stopColor="#0B0314" />
          </radialGradient>

          {/* Top Head Highlight */}
          <linearGradient id="headHighlight" x1="50%" y1="15%" x2="50%" y2="55%">
            <stop offset="0%" stopColor="#FFC2DE" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#A881FF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* --- Ears with Pink Tips --- */}
        {/* Left Ear */}
        <g className="origin-bottom-right">
          <path
            d="M 44 56 C 30 32 38 12 56 16 C 68 18 70 36 64 54 Z"
            fill="url(#earLeftGrad)"
          />
          {/* Inner Ear Soft Pink Glow */}
          <path
            d="M 46 50 C 38 34 43 20 54 22 C 61 24 62 36 58 48 Z"
            fill="#FFC0DB"
            opacity="0.65"
          />
        </g>

        {/* Right Ear */}
        <g className="origin-bottom-left">
          <path
            d="M 116 56 C 130 32 122 12 104 16 C 92 18 90 36 96 54 Z"
            fill="url(#earRightGrad)"
          />
          {/* Inner Ear Soft Pink Glow */}
          <path
            d="M 114 50 C 122 34 117 20 106 22 C 99 24 98 36 102 48 Z"
            fill="#FFC0DB"
            opacity="0.65"
          />
        </g>

        {/* --- Main Round Plush Body --- */}
        <ellipse
          cx="80"
          cy="92"
          rx="58"
          ry="54"
          fill="url(#novaBodyGrad)"
        />

        {/* Soft Fluffy Silhouette Wisps */}
        <path
          d="M 23 88 C 20 80 26 72 32 78 C 28 68 36 62 44 70 C 46 58 58 54 66 62 C 72 52 88 52 94 62 C 102 54 114 58 116 70 C 124 62 132 68 128 78 C 134 72 140 80 137 88 C 142 96 136 106 130 104 C 134 114 126 124 118 122 C 120 132 108 138 100 134 C 94 142 82 144 76 138 C 68 144 56 140 54 132 C 44 134 38 124 42 116 C 34 116 30 106 34 98 C 28 98 22 92 23 88 Z"
          fill="url(#novaBodyGrad)"
          opacity="0.4"
        />

        {/* Top Fur Highlights / Petal Pink Crown Glow */}
        <ellipse
          cx="80"
          cy="60"
          rx="38"
          ry="20"
          fill="url(#headHighlight)"
        />

        {/* --- Cheeks (Rosy Blush) --- */}
        <ellipse cx="48" cy="98" rx="14" ry="9" fill="url(#blushGrad)" />
        <ellipse cx="112" cy="98" rx="14" ry="9" fill="url(#blushGrad)" />

        {/* --- Eyes (Glossy Dark Button Eyes with Catchlights) --- */}
        {/* Left Eye */}
        <g>
          <ellipse cx="58" cy="88" rx="8" ry="9.5" fill="url(#eyeGrad)" />
          {/* Primary Catchlight */}
          <circle cx="55.5" cy="84.5" r="3.2" fill="#FFFFFF" />
          {/* Secondary Catchlight */}
          <circle cx="61" cy="91" r="1.5" fill="#FFFFFF" opacity="0.85" />
        </g>

        {/* Right Eye */}
        <g>
          <ellipse cx="102" cy="88" rx="8" ry="9.5" fill="url(#eyeGrad)" />
          {/* Primary Catchlight */}
          <circle cx="99.5" cy="84.5" r="3.2" fill="#FFFFFF" />
          {/* Secondary Catchlight */}
          <circle cx="105" cy="91" r="1.5" fill="#FFFFFF" opacity="0.85" />
        </g>

        {/* --- Mouth (Expressive Soft Smile or Listening O-shape) --- */}
        {isListening ? (
          <ellipse
            cx="80"
            cy="103"
            rx="5.5"
            ry="6.5"
            fill="#321054"
            stroke="#FFAED0"
            strokeWidth="1.5"
          />
        ) : (
          <path
            d="M 74 100 Q 80 106 86 100"
            stroke="#34135A"
            strokeWidth="2.8"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}
