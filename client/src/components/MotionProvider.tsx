import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useReducedMotion } from 'motion/react';

/**
 * MotionProvider — the single accessibility switch for animation (§20, §51).
 *
 * `reducedMotion="user"` makes every `motion` component in the app drop its
 * transform and layout animations when the OS asks for reduced motion, while
 * keeping opacity changes (which carry no vestibular load). Components that
 * need bespoke handling read `useReducedMotion()` and swap the axis they
 * animate: a drawer fades instead of sliding, a KPI counts up instantly.
 *
 * Mounting this once at the root means no component can forget the rule.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      // Springs are not used by default: durations from the motion token set are
      // easier to keep consistent across a large team than ad-hoc spring configs.
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </MotionConfig>
  );
}

export { useReducedMotion };