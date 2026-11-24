import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { RotateCw, RotateCcw } from 'lucide-react';
import { soundService } from '../../../lib/sound-service';

export interface PlayDirectionIndicatorProps {
  direction: 'clockwise' | 'counter_clockwise';
  className?: string;
  showBadge?: boolean;
}

export const PlayDirectionIndicator: React.FC<PlayDirectionIndicatorProps> = ({
  direction,
  className = '',
  showBadge = true,
}) => {
  const isClockwise = direction === 'clockwise';
  const shouldReduceMotion = useReducedMotion();

  const prevDirection = React.useRef(direction);
  React.useEffect(() => {
    if (prevDirection.current !== direction) {
      soundService.play('reverse');
      prevDirection.current = direction;
    }
  }, [direction]);

  // Colors
  const strokeColor = isClockwise ? '#10b981' : '#f43f5e'; // emerald vs rose
  const glowColor = isClockwise ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';

  return (
    <div
      data-testid="play-direction-indicator"
      data-direction={direction}
      className={`absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible select-none ${className}`}
      aria-label={`Play direction: ${isClockwise ? 'Clockwise' : 'Counter-Clockwise'}`}
    >
      {/* SVG Oval Orbit Track with Direction Chevrons */}
      <svg
        className="w-full h-full max-w-[760px] max-h-[460px] overflow-visible"
        viewBox="0 0 600 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`grad-${direction}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.7" />
            <stop offset="50%" stopColor={isClockwise ? '#34d399' : '#fbbf24'} stopOpacity="0.9" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.7" />
          </linearGradient>

          {/* Marker arrows */}
          <marker
            id={`arrow-head-${direction}`}
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="4"
            orient="auto"
          >
            <path
              d="M1,1 L7,4 L1,7 Z"
              fill={strokeColor}
            />
          </marker>
        </defs>

        {/* Ambient Guide Ellipse */}
        <ellipse
          cx="300"
          cy="180"
          rx="250"
          ry="140"
          stroke={glowColor}
          strokeWidth="1.5"
          strokeDasharray="4 8"
          className="opacity-25"
        />

        {/* Animated Dashed Flow Path */}
        <motion.ellipse
          data-testid="direction-track"
          cx="300"
          cy="180"
          rx="250"
          ry="140"
          stroke={`url(#grad-${direction})`}
          strokeWidth="2"
          strokeDasharray="14 14"
          strokeLinecap="round"
          animate={
            shouldReduceMotion
              ? { strokeDashoffset: 0 }
              : { strokeDashoffset: isClockwise ? [0, -56] : [0, 56] }
          }
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
          }}
        />

        {/* Tangential Direction Arrow Markers */}
        {/* Top: 12 o'clock (300, 40) - points Right if CW, Left if CCW */}
        <g
          transform={`translate(300, 40) rotate(${isClockwise ? 0 : 180})`}
          className="transition-transform duration-500"
        >
          <path
            d="M-8,-5 L4,0 L-8,5"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Right: 3 o'clock (550, 180) - points Down if CW, Up if CCW */}
        <g
          transform={`translate(550, 180) rotate(${isClockwise ? 90 : 270})`}
          className="transition-transform duration-500"
        >
          <path
            d="M-8,-5 L4,0 L-8,5"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Bottom: 6 o'clock (300, 320) - points Left if CW, Right if CCW */}
        <g
          transform={`translate(300, 320) rotate(${isClockwise ? 180 : 0})`}
          className="transition-transform duration-500"
        >
          <path
            d="M-8,-5 L4,0 L-8,5"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Left: 9 o'clock (50, 180) - points Up if CW, Down if CCW */}
        <g
          transform={`translate(50, 180) rotate(${isClockwise ? 270 : 90})`}
          className="transition-transform duration-500"
        >
          <path
            d="M-8,-5 L4,0 L-8,5"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      </svg>

      {/* Center Direction Badge Pill */}
      {showBadge && (
        <div
          data-testid="direction-badge"
          className={`absolute top-2 sm:top-4 px-3 py-1 rounded-full text-[10px] sm:text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-card backdrop-blur-md transition-all duration-300 ${
            isClockwise
              ? 'bg-surface-card/95 text-emerald-300 border-emerald-500/40'
              : 'bg-surface-card/95 text-rose-300 border-rose-500/40'
          }`}
        >
          {isClockwise ? (
            <>
              <RotateCw className="w-3.5 h-3.5 text-emerald-400 animate-spin-slow" />
              <span>Clockwise</span>
            </>
          ) : (
            <>
              <RotateCcw className="w-3.5 h-3.5 text-rose-400 animate-spin-reverse-slow" />
              <span>Counter-Clockwise</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
