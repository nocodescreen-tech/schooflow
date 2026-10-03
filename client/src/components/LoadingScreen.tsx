import { motion, useReducedMotion } from 'motion/react';
import { duration } from '../lib/motion';

/**
 * Full-screen boot loader.
 *
 * The previous version rotated a ring forever. A permanent rotation is exactly
 * what the motion rules forbid (§19, §81) — it also sits at the frequency range
 * that triggers vestibular discomfort. What is left is a single opacity
 * breathing cycle on the mark, which reads as "alive" without moving.
 */
export default function LoadingScreen() {
  const reduce = useReducedMotion();

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center bg-slate-950">
      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: duration.fast }}
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent"
        >
          {/* The mark is a wordmark, not a spinner: it never moves. */}
          <span className="text-h2 font-bold tracking-tight text-white">SF</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.standard, ease: [0, 0, 0, 1] }}
          className="text-display font-bold tracking-tight text-white"
        >
          SCHOOL<span className="text-accent">FLOW</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: reduce ? 1 : [0.55, 1, 0.55] }}
          transition={
            reduce
              ? { duration: duration.fast }
              : { duration: 2.4, repeat: Infinity, ease: 'linear' }
          }
          className="mt-2 text-sm text-slate-400"
        >
          Chargement…
        </motion.p>
      </div>
    </div>
  );
}