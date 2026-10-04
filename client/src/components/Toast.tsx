import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, type Toast } from '../store/toastStore';

export { useToastStore };

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const colors = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-primary-500',
};

const bgColors = {
  success: 'bg-success-soft',
  error: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  info: 'bg-primary-50 dark:bg-primary-500/10',
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = icons[toast.type];
  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.9 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-border dark:border-white/10 ${bgColors[toast.type]} min-w-[300px]`}
    >
      <Icon className={`w-5 h-5 ${colors[toast.type]} shrink-0`} />
      <span className="text-sm font-medium text-text flex-1">{toast.message}</span>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
        aria-label="Fermer"
      >
        <X className="w-4 h-4 text-muted" />
      </button>
    </motion.div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <AnimatePresence>
      <div className="fixed bottom-4 right-4 z-toast flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </AnimatePresence>
  );
}
