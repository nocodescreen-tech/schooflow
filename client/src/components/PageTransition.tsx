import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { pageVariants } from '../lib/motion';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Route-level transition (§21, §63).
 *
 * The travel distance and the easing come from the shared motion system, so a
 * page change feels identical everywhere. 6px of travel and an opacity fade:
 * enough to read as intentional, never slow enough to feel like waiting.
 */
export default function PageTransition({ children }: PageTransitionProps) {
  return <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">{children}</motion.div>;
}