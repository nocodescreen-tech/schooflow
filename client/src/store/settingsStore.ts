import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrencyCode } from '../lib/currency';
import api from '../lib/api';

export interface SchoolSettings {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  academicYear: string;
  currency: CurrencyCode;
  logo?: string;
  /** Optional persisted flags, stored in the school `settings` JSONB column. */
  notifications: boolean;
  absenceAlerts: boolean;
  paymentAlerts: boolean;
  documentAlerts: boolean;
}

interface SettingsState {
  settings: SchoolSettings;
  updateSettings: (settings: Partial<SchoolSettings>) => void;
  hydrate: () => Promise<void>;
  hydrated: boolean;
}

/**
 * Values start empty on purpose: a school name must never be a hardcoded
 * placeholder. `hydrate()` fills them from the database on app start.
 */
const emptySettings: SchoolSettings = {
  schoolName: '',
  address: '',
  phone: '',
  email: '',
  academicYear: '',
  currency: 'USD',
  logo: undefined,
  notifications: true,
  absenceAlerts: true,
  paymentAlerts: true,
  documentAlerts: true,
};

function currentYear(): string {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: emptySettings,
      hydrated: false,

      updateSettings: (partial) => {
        set((state) => ({ settings: { ...state.settings, ...partial } }));
      },

      hydrate: async () => {
        try {
          const res = await api.get('/settings');
          const school = res.data?.data?.school;
          if (!school) return;

          const s = (school.settings ?? {}) as Partial<SchoolSettings>;

          set({
            settings: {
              schoolName: school.name ?? '',
              address: school.address ?? '',
              phone: school.phone ?? '',
              email: school.email ?? '',
              academicYear: s.academicYear || currentYear(),
              currency: (school.currency as CurrencyCode) || 'USD',
              logo: school.logo ?? undefined,
              notifications: s.notifications ?? true,
              absenceAlerts: s.absenceAlerts ?? true,
              paymentAlerts: s.paymentAlerts ?? true,
              documentAlerts: s.documentAlerts ?? true,
            },
            hydrated: true,
          });
        } catch {
          // keep whatever we have; the axios interceptor handles auth failures
          if (!get().hydrated) set({ hydrated: true });
        }
      },
    }),
    {
      name: 'schoolflow-settings',
      partialize: (state) => ({ settings: state.settings, hydrated: state.hydrated }),
    }
  )
);
