import React from 'react';

interface AnimatedCDProps {
  isPlaying?: boolean;
  className?: string;
}

export const AnimatedCD: React.FC<AnimatedCDProps> = ({
  isPlaying = false,
  className = "w-5 h-5",
}) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}
      title={isPlaying ? "Deck playing" : "Lucid Decks CD"}
    >
      <svg
        viewBox="0 0 24 24"
        className={`w-full h-full transition-all duration-700 ease-out ${
          isPlaying
            ? 'animate-cd-turn-fast drop-shadow-[0_0_8px_rgba(0,242,255,0.7)]'
            : 'animate-cd-turn drop-shadow-[0_0_5px_rgba(0,242,255,0.35)] hover:drop-shadow-[0_0_8px_rgba(255,0,85,0.6)]'
        }`}
        style={{ willChange: 'transform' }}
      >
        <defs>
          {/* Iridescent spectrum sheen gradient representing CD diffraction grating */}
          <linearGradient id="cdSheenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.8" />
            <stop offset="35%" stopColor="#a855f7" stopOpacity="0.65" />
            <stop offset="70%" stopColor="#ff0055" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#00f2ff" stopOpacity="0.8" />
          </linearGradient>

          {/* Polycarbonate metallic disc body */}
          <radialGradient id="cdBodyGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e2230" />
            <stop offset="65%" stopColor="#10121a" />
            <stop offset="92%" stopColor="#1c202d" />
            <stop offset="100%" stopColor="#00f2ff" stopOpacity="0.5" />
          </radialGradient>

          {/* Transparent inner clamping ring gradient */}
          <radialGradient id="cdHubGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0a0a0c" stopOpacity="0.9" />
            <stop offset="65%" stopColor="#181c28" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#2a3044" stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Outer Disc Polycarbonate Base */}
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="url(#cdBodyGrad)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="0.7"
        />

        {/* Holographic light reflection bands across the grooves */}
        <path
          d="M 12 12 L 4.6 4.9 A 10.5 10.5 0 0 1 9.6 1.8 Z"
          fill="url(#cdSheenGrad)"
          opacity="0.45"
        />
        <path
          d="M 12 12 L 19.4 19.1 A 10.5 10.5 0 0 1 14.4 22.2 Z"
          fill="url(#cdSheenGrad)"
          opacity="0.45"
        />
        <path
          d="M 12 12 L 22.2 10.2 A 10.5 10.5 0 0 1 20.4 15.6 Z"
          fill="url(#cdSheenGrad)"
          opacity="0.3"
        />
        <path
          d="M 12 12 L 1.8 13.8 A 10.5 10.5 0 0 1 3.6 8.4 Z"
          fill="url(#cdSheenGrad)"
          opacity="0.3"
        />

        {/* Concentric track groove lines */}
        <circle
          cx="12"
          cy="12"
          r="9.2"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.45"
          strokeDasharray="1.5 1.5"
        />
        <circle
          cx="12"
          cy="12"
          r="7.8"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="0.45"
        />
        <circle
          cx="12"
          cy="12"
          r="6.4"
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="0.45"
          strokeDasharray="2.5 1.5"
        />
        <circle
          cx="12"
          cy="12"
          r="5.1"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.4"
        />

        {/* Clear Plastic Inner Clamping Hub Area */}
        <circle
          cx="12"
          cy="12"
          r="4"
          fill="url(#cdHubGrad)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.55"
        />
        <circle
          cx="12"
          cy="12"
          r="2.8"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.4"
          strokeDasharray="1 1"
        />

        {/* Center Spindle Hole (empty cutout through to background) */}
        <circle
          cx="12"
          cy="12"
          r="1.65"
          fill="#0a0a0c"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="0.55"
        />
      </svg>
    </div>
  );
};
