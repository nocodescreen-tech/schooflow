import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { backdropVariants, dialogVariants } from '../lib/motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Modal (§25).
 *
 * Backdrop fades, dialog scales 0.98 → 1 and travels 6px. Both come from the
 * shared motion system; the previous version used an ad-hoc spring, which is
 * exactly the kind of per-component value the motion tokens exist to remove.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-slate-950/40"
            onClick={onClose}
          />
          <motion.div
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative flex max-h-[90vh] w-full flex-col ${sizes[size]} rounded-2xl border border-line bg-surface-raised shadow-lg`}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <h2 className="text-h3 text-ink">{title}</h2>
                <button
                  onClick={onClose}
                  className="btn-icon"
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default Modal;