import { type ReactNode, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { backdropVariants, drawerVariants } from '../lib/motion';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  side?: 'right' | 'left';
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Lateral panel used for record details (student, payment, teacher),
 * notification lists and advanced filters.
 * Traps focus, closes on Escape and on backdrop click.
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  description,
  side = 'right',
  width = 'w-full max-w-md',
  children,
  footer,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      // Focus trap
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[data-autofocus], input, button')
        ?.focus();
    }, 60);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  const offset = side === 'right' ? { x: '100%' } : { x: '-100%' };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-drawer flex" role="dialog" aria-modal="true">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40"
          />

          <motion.div
            ref={panelRef}
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`relative ${width} h-full bg-surface-raised border-l border-line shadow-lg flex flex-col`}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border dark:border-white/10 shrink-0">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-lg font-semibold text-text dark:text-gray-100">{title}</h2>
                  )}
                  {description && (
                    <p className="text-sm text-muted dark:text-gray-400 mt-0.5">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="btn-icon shrink-0"
                  aria-label="Fermer le panneau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

            {footer && (
              <div className="px-6 py-4 border-t border-border dark:border-white/10 flex items-center justify-end gap-3 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
