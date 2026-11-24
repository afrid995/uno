import { Transition } from 'framer-motion';

/**
 * Unified Game Motion System for UNO Ultimate
 * Provides consistent timing, spring physics, and accessible reduced-motion curves.
 * 
 * Rules:
 * - Immediate feedback: 80-150ms
 * - Card movement: 160-300ms
 * - State transitions: 180-350ms
 * - Significant events: 300-700ms
 * - Server remains authoritative at all times.
 */

export const MOTION_DURATIONS = {
  immediate: 0.12, // 120ms
  cardMove: 0.24, // 240ms
  stateTransition: 0.28, // 280ms
  significantEvent: 0.45, // 450ms
  reduced: 0.05, // 50ms for prefers-reduced-motion
} as const;

export const MOTION_TRANSITIONS: Record<string, Transition> = {
  // Snappy spring for button taps and toggle controls
  snappy: {
    type: 'spring',
    stiffness: 500,
    damping: 32,
  },
  // Tactile card lift and press
  cardTactile: {
    type: 'spring',
    stiffness: 400,
    damping: 25,
  },
  // Smooth cubic-bezier flight for cards travelling from hand/pile
  cardFlight: {
    duration: MOTION_DURATIONS.cardMove,
    ease: [0.25, 1, 0.5, 1],
  },
  // Smooth modal entry and backdrop fade
  modalEntry: {
    duration: MOTION_DURATIONS.stateTransition,
    ease: [0.16, 1, 0.3, 1],
  },
  // Accessible immediate transition for prefers-reduced-motion
  reducedMotion: {
    duration: MOTION_DURATIONS.reduced,
    ease: 'linear',
  },
};

export const CARD_INTERACTION_VARIANTS = {
  hover: {
    scale: 1.06,
    y: -8,
    transition: MOTION_TRANSITIONS.cardTactile,
  },
  tap: {
    scale: 0.96,
    transition: MOTION_TRANSITIONS.snappy,
  },
  idle: {
    scale: 1,
    y: 0,
    transition: MOTION_TRANSITIONS.cardTactile,
  },
};

export const BUTTON_INTERACTION_VARIANTS = {
  hover: {
    scale: 1.02,
    transition: MOTION_TRANSITIONS.snappy,
  },
  tap: {
    scale: 0.98,
    transition: MOTION_TRANSITIONS.snappy,
  },
};
