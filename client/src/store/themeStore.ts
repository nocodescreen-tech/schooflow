import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  /** What the user picked. */
  theme: Theme;
  /** What is actually applied right now (system resolved). */
  resolved: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'schoolflow-theme';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function applyToDocument(mode: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

/** Read the persisted preference without depending on the store instance. */
function readPersistedTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'light';
    const parsed = JSON.parse(raw) as { state?: { theme?: Theme } };
    const value = parsed?.state?.theme;
    return value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

const initial = resolve(readPersistedTheme());
applyToDocument(initial);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initial,
      resolved: initial,

      toggleTheme: () => {
        const current = get().resolved;
        const next = current === 'light' ? 'dark' : 'light';
        applyToDocument(next);
        set({ theme: next, resolved: next });
      },

      setTheme: (theme) => {
        const next = resolve(theme);
        applyToDocument(next);
        set({ theme, resolved: next });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Follow the OS while the user is on "system".
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (useThemeStore.getState().theme === 'system') {
      const next = systemPrefersDark() ? 'dark' : 'light';
      applyToDocument(next);
      useThemeStore.setState({ resolved: next });
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
}
