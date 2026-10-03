import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, GraduationCap, School, CreditCard, FileText, Users } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { cn } from '../lib/utils';

interface SearchResult {
  id: string;
  category: 'students' | 'teachers' | 'classes' | 'payments' | 'documents';
  title: string;
  subtitle: string;
  path: string;
}

const MOCK_RESULTS: SearchResult[] = [
  { id: 's1', category: 'students', title: 'Emma Martin', subtitle: '6ème A', path: '/app/students/1' },
  { id: 's2', category: 'students', title: 'Lucas Bernard', subtitle: '6ème A', path: '/app/students/2' },
  { id: 's3', category: 'students', title: 'Léa Dubois', subtitle: '5ème B', path: '/app/students/3' },
  { id: 's4', category: 'students', title: 'Hugo Moreau', subtitle: '5ème A', path: '/app/students/4' },
  { id: 's5', category: 'students', title: 'Chloé Laurent', subtitle: '4ème A', path: '/app/students/5' },
  { id: 's6', category: 'students', title: 'Nathan Simon', subtitle: '4ème B', path: '/app/students/6' },
  { id: 's7', category: 'students', title: 'Manon Michel', subtitle: '3ème A', path: '/app/students/7' },
  { id: 's8', category: 'students', title: 'Théo Leroy', subtitle: '3ème A', path: '/app/students/8' },
  { id: 't1', category: 'teachers', title: 'M. Dupont', subtitle: 'Mathématiques', path: '/app/teachers' },
  { id: 't2', category: 'teachers', title: 'Mme Martin', subtitle: 'Français', path: '/app/teachers' },
  { id: 't3', category: 'teachers', title: 'M. Bernard', subtitle: 'Histoire-Géo', path: '/app/teachers' },
  { id: 't4', category: 'teachers', title: 'Mme Petit', subtitle: 'Anglais', path: '/app/teachers' },
  { id: 't5', category: 'teachers', title: 'M. Moreau', subtitle: 'SVT', path: '/app/teachers' },
  { id: 'c1', category: 'classes', title: '6ème A', subtitle: '28 élèves', path: '/app/classes' },
  { id: 'c2', category: 'classes', title: '5ème B', subtitle: '26 élèves', path: '/app/classes' },
  { id: 'c3', category: 'classes', title: '4ème A', subtitle: '27 élèves', path: '/app/classes' },
  { id: 'c4', category: 'classes', title: '3ème A', subtitle: '25 élèves', path: '/app/classes' },
  { id: 'p1', category: 'payments', title: 'PAY-2024-001', subtitle: 'Emma Martin — 250€', path: '/app/payments' },
  { id: 'p2', category: 'payments', title: 'PAY-2024-002', subtitle: 'Lucas Bernard — 250€', path: '/app/payments' },
  { id: 'p3', category: 'payments', title: 'PAY-2024-003', subtitle: 'Léa Dubois — 120€', path: '/app/payments' },
  { id: 'p4', category: 'payments', title: 'PAY-2024-004', subtitle: 'Hugo Moreau — 250€', path: '/app/payments' },
  { id: 'd1', category: 'documents', title: 'Bulletin T1 — Emma Martin', subtitle: 'Bulletin · 15 nov. 2024', path: '/app/documents' },
  { id: 'd2', category: 'documents', title: 'Certificat de scolarité — Lucas Bernard', subtitle: 'Certificat · 10 nov. 2024', path: '/app/documents' },
  { id: 'd3', category: 'documents', title: 'Contrat cantine — Léa Dubois', subtitle: 'Contrat · 28 oct. 2024', path: '/app/documents' },
  { id: 'd4', category: 'documents', title: 'Règlement intérieur 2024-2025', subtitle: 'Autre · 1 sept. 2024', path: '/app/documents' },
];

const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  students: { fr: 'Élèves', en: 'Students' },
  teachers: { fr: 'Enseignants', en: 'Teachers' },
  classes: { fr: 'Classes', en: 'Classes' },
  payments: { fr: 'Paiements', en: 'Payments' },
  documents: { fr: 'Documents', en: 'Documents' },
};

const CATEGORY_ICONS: Record<string, typeof User> = {
  students: User,
  teachers: GraduationCap,
  classes: School,
  payments: CreditCard,
  documents: FileText,
};

export default function GlobalSearch() {
  const { t, language } = useLanguageStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase();
    return MOCK_RESULTS.filter(
      (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );
  }, [debouncedQuery]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    results.forEach((r) => {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });
    return groups;
  }, [results]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const flatResults = Object.values(groupedResults).flat();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
      navigate(flatResults[selectedIndex].path);
      setIsOpen(false);
      setQuery('');
    }
  };

  const flatResults = Object.values(groupedResults).flat();

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('common.search')}
        className="input-field pl-10 pr-12 w-64 lg:w-80"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 px-2 py-0.5 text-xs text-muted bg-gray-100 dark:bg-white/10 rounded-md border border-border dark:border-white/10">
        Ctrl K
      </kbd>

      <AnimatePresence>
        {isOpen && debouncedQuery.trim() && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-surface rounded-2xl border border-border shadow-xl overflow-hidden dark:bg-[#1E293B] dark:border-white/10 z-[150]"
          >
            {results.length === 0 ? (
              <div className="p-8 text-center">
                <Search className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted dark:text-gray-400">Aucun résultat trouvé</p>
                <p className="text-xs text-muted dark:text-gray-500 mt-1">Essayez avec d'autres termes</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {Object.entries(groupedResults).map(([category, items]) => {
                  const CatIcon = CATEGORY_ICONS[category] ?? FileText;
                  return (
                    <div key={category}>
                      <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                        <span className="text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                          {CATEGORY_LABELS[category]?.[language] ?? category}
                        </span>
                      </div>
                      {items.map((item) => {
                        const globalIndex = flatResults.indexOf(item);
                        return (
                          <button
                            key={item.id}
                            onClick={() => { navigate(item.path); setIsOpen(false); setQuery(''); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/50 dark:border-white/5 last:border-0',
                              globalIndex === selectedIndex
                                ? 'bg-primary-50 dark:bg-primary-500/10'
                                : 'hover:bg-gray-50 dark:hover:bg-white/5'
                            )}
                          >
                            <div className="w-8 h-8 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <CatIcon className="w-4 h-4 text-primary-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text dark:text-gray-200 truncate">{item.title}</p>
                              <p className="text-xs text-muted dark:text-gray-400 truncate">{item.subtitle}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
