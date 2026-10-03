import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const setLanguage = (lng: string) => i18n.changeLanguage(lng);

  if (compact) {
    return (
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
        <button
          onClick={() => setLanguage('fr')}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded-md transition-all',
            language === 'fr' ? 'bg-white dark:bg-white/20 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-white'
          )}
        >
          FR
        </button>
        <button
          onClick={() => setLanguage('en')}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded-md transition-all',
            language === 'en' ? 'bg-white dark:bg-white/20 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-white'
          )}
        >
          EN
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted dark:text-gray-400">{'Language'}: </span>
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
        <button
          onClick={() => setLanguage('fr')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            language === 'fr' ? 'bg-white dark:bg-white/20 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-white'
          )}
        >
          Français
        </button>
        <button
          onClick={() => setLanguage('en')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            language === 'en' ? 'bg-white dark:bg-white/20 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-white'
          )}
        >
          English
        </button>
      </div>
    </div>
  );
}
