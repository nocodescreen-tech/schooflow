import type { Transition, Variants } from 'motion/react';

/**
 * Motion system (§20, §60, §61).
 *
 * ONE place defines every duration, easing and transition in SchoolFlow. A
 * component never writes its own `duration: 0.3` or `cubic-bezier(...)`; it
 * picks a variant from here. That is what keeps the product feeling like one
 * application instead of fifty pages.
 *
 * Durations and easings come from the Material Design 3 token sets (the
 * current public standard) and mirror `src/styles/tokens.css`, so CSS
 * transitions and JS animations share the same rhythm.
 *
 * Rules encoded here:
 *  - animate `transform` and `opacity`, never `width`/`height`/`top`/`left`
 *    unless a real layout animation is required (§61);
 *  - enter is slightly longer than exit, because an exit deserves less
 *    attention than the user's next task;
 *  - no bounce, no rotation, no permanent loops (§19, §81).
 */

export const duration = {
  instant: 0.1,   // 100ms — colour and opacity nudges
  fast: 0.15,      // 150ms — hover, focus, small state flips
  standard: 0.2,   // 200ms — dropdowns, tooltips, popovers
  medium: 0.28,    // 280ms — modals, drawers, page transitions
  slow: 0.38,      // 380ms — full-surface transitions
} as const;

export const ease = {
  /** Default for state changes inside a surface. */
  standard: [0.2, 0, 0, 1],
  /** Content arriving: comes to rest gently. */
  enter: [0, 0, 0, 1],
  /** Content leaving: leaves promptly. */
  exit: [0.3, 0, 1, 1],
  /** The single expressive curve, reserved for one moment per view. */
  emphasized: [0.05, 0.7, 0.1, 1],
} as const;

export const transition = {
  fast: { duration: duration.fast, ease: ease.standard },
  standard: { duration: duration.standard, ease: ease.standard },
  enter: { duration: duration.medium, ease: ease.enter },
  exit: { duration: duration.fast, ease: ease.exit },
  emphasized: { duration: duration.medium, ease: ease.emphasized },
} satisfies Record<string, Transition>;

/** ── Page transitions (§21, §63) ──────────────────────────────────────────
   6px of travel and an opacity fade. Never a one-second slide. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: transition.enter },
  exit: { opacity: 0, y: -4, transition: transition.exit },
};

/** ── Modal / dialog (§25) ─────────────────────────────────────────────────── */
export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transition.enter },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transition.exit },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.fast, ease: ease.standard } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.exit } },
};

/** ── Dropdown / popover (§27) ────────────────────────────────────────────── */
export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: -2 },
  animate: { opacity: 1, scale: 1, y: 0, transition: transition.standard },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: transition.fast },
};

/** ── Drawer (§26) ────────────────────────────────────────────────────────── */
export const drawerVariants: Variants = {
  initial: { x: '100%' },
  animate: { x: 0, transition: transition.enter },
  exit: { x: '100%', transition: transition.exit },
};

/** ── Toast (§28) ─────────────────────────────────────────────────────────── */
export const toastVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: transition.enter },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: transition.exit },
};

/** ── List / grid stagger (§33) ───────────────────────────────────────────── */
export const staggerContainer = (stagger = 0.04, delay = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.enter },
};

/** ── Card micro-interaction (§22) ─────────────────────────────────────────
   Lifts 2px, nothing more. Enlarging the card reads as a toy. */
export const cardHoverTransition: Transition = {
  duration: duration.medium,
  ease: ease.standard,
};

/** ── Shared layout for accordions / expanding rows ───────────────────────── */
export const collapseVariants: Variants = {
  collapsed: { height: 0, opacity: 0, transition: { duration: duration.standard, ease: ease.standard } },
  expanded: { height: 'auto', opacity: 1, transition: { duration: duration.medium, ease: ease.enter } },
};

/**
 * Vertical distance a form error should travel when it appears. Used instead
 * of animating `height`, which forces layout on every frame.
 */
export const errorSlide: Variants = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: transition.fast },
  exit: { opacity: 0, y: -4, transition: transition.fast },
};

/**
 * The horizontal shake used on a failed login (§13). Deliberately small:
 * 3 cycles of ±4px over 140ms. Anything stronger is theatre.
 */
export const shake: Transition = {
  duration: 0.14,
  times: [0, 0.25, 0.5, 0.75, 1],
  ease: 'easeInOut',
};

export const shakeKeyframes: { x: number[] } = {
  x: [0, -4, 4, -2, 0],
};