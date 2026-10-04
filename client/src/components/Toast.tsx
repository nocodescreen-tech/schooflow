import { create } from 'zustand';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

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
    const id = Math.random().toString(36).slice(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

const icons = {
  success: 'check-circle-2',
  error: 'x-circle',
  warning: 'alert-triangle',
  info: 'info',
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

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message) => {
    const id = Math.random().toString(36).slice(2, 9);
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

const icons = {
  success: 'check-circle-2',
  error: 'x-circle',
  warning: 'alert-triangle',
  info: 'info',
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

function ToastContainer() {
  return <div />;
}

export default ToastContainer;