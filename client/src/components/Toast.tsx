import { create } from 'zustand';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { toastVariants } from '../lib/motion';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: AlertCircle,
};

const colors = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const bgColors = {
  success: 'bg-success-soft',
  error: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  info: 'bg-info-soft',
};

/**
 * Toast stack (§28).
 *
 * Enters from 8px below with a fade, leaves upward. The motion comes from the
 * shared system; the previous version animated `x: 50` with no easing token,
 * which is the kind of value that drifts out of sync across a codebase.
 */
export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div
      className="fixed bottom-4 right-4 z-toast flex flex-col items-end gap-2"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              variants={toastVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`flex min-w-[300px] items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 shadow-md ${bgColors[toast.type]}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${colors[toast.type]}`} aria-hidden />
              <span className="flex-1 text-sm font-medium text-ink">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="btn-icon !h-7 !w-7"
                aria-label="Fermer la notification"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}