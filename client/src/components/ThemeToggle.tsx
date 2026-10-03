import { motion } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { cn } from '../lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  const handleToggle = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    toggleTheme();
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className={cn(
        'relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
        'hover:bg-gray-100 dark:hover:bg-white/10 text-muted dark:text-gray-400',
        className
      )}
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 180 : 0, scale: isDark ? 0.8 : 1 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="relative w-5 h-5"
      >
        <Sun
          className={cn(
            'absolute inset-0 w-5 h-5 transition-opacity duration-300',
            isDark ? 'opacity-0' : 'opacity-100'
          )}
        />
        <Moon
          className={cn(
            'absolute inset-0 w-5 h-5 transition-opacity duration-300',
            isDark ? 'opacity-100' : 'opacity-0'
          )}
        />
      </motion.div>
    </button>
  );
}
