import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  CornerDownLeft,
  LayoutDashboard,
  Users,
  GraduationCap,
  School,
  ClipboardList,
  CalendarCheck,
  Receipt,
  CreditCard,
  FileText,
  Wallet,
  CalendarDays,
  Settings,
  UserPlus,
  Banknote,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import { backdropVariants, popoverVariants } from '../lib/motion';

interface Command {
  id: string;
  label: string;
  group: string;
  icon: typeof Search;
  keywords?: string;
  run: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };

    return [
      { id: 'dashboard', label: 'Tableau de bord', group: 'Navigation', icon: LayoutDashboard, run: go('/app/dashboard') },
      { id: 'students', label: 'Élèves', group: 'Navigation', icon: Users, run: go('/app/students') },
      { id: 'teachers', label: 'Enseignants', group: 'Navigation', icon: GraduationCap, run: go('/app/teachers') },
      { id: 'classes', label: 'Classes', group: 'Navigation', icon: School, run: go('/app/classes') },
      { id: 'timetable', label: 'Emploi du temps', group: 'Navigation', icon: CalendarDays, run: go('/app/timetable') },
      { id: 'grades', label: 'Notes', group: 'Navigation', icon: ClipboardList, run: go('/app/grades') },
      { id: 'attendance', label: 'Présences', group: 'Navigation', icon: CalendarCheck, run: go('/app/attendance') },
      { id: 'fees', label: 'Frais scolaires', group: 'Navigation', icon: Receipt, run: go('/app/fees') },
      { id: 'payments', label: 'Paiements', group: 'Navigation', icon: CreditCard, run: go('/app/payments') },
      { id: 'cash', label: 'Caisse', group: 'Navigation', icon: Wallet, run: go('/app/cash') },
      { id: 'documents', label: 'Documents', group: 'Navigation', icon: FileText, run: go('/app/documents') },
      { id: 'builder', label: 'Éditeur de documents', group: 'Navigation', icon: FileText, keywords: 'template bulletin billet', run: go('/app/document-builder') },
      { id: 'settings', label: 'Paramètres', group: 'Navigation', icon: Settings, run: go('/app/settings') },

      { id: 'new-student', label: 'Nouvel élève', group: 'Actions', icon: UserPlus, run: go('/app/students') },
      { id: 'new-payment', label: 'Enregistrer un paiement', group: 'Actions', icon: Banknote, run: go('/app/payments') },
      { id: 'new-grade', label: 'Saisir des notes', group: 'Actions', icon: ClipboardList, run: go('/app/grades') },
      { id: 'new-doc', label: 'Créer un document', group: 'Actions', icon: FileText, run: go('/app/document-builder') },

      {
        id: 'logout',
        label: 'Se déconnecter',
        group: 'Compte',
        icon: LogOut,
        run: () => {
          logout();
          navigate('/login');
          onClose();
        },
      },
    ];
  }, [navigate, onClose, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        (c.keywords ?? '').toLowerCase().includes(q)
    );
  }, [query, commands]);

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of filtered) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filtered[activeIndex]?.run();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, filtered, activeIndex, onClose]);

  let flatIndex = -1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/40"
          />

          <motion.div
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Palette de commandes"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher une page ou une action…"
                className="flex-1 bg-transparent py-4 text-sm text-ink outline-none placeholder:text-ink-placeholder"
                aria-label="Rechercher une commande"
              />
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:block">
                ESC
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted dark:text-gray-400">Aucune commande trouvée</p>
                </div>
              ) : (
                grouped.map(([group, items]) => (
                  <div key={group} className="mb-2 last:mb-0">
                    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {group}
                    </div>
                    {items.map((cmd) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const Icon = cmd.icon;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={cmd.id}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={cmd.run}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                            isActive
                              ? 'bg-accent-subtle text-accent-text'
                              : 'text-ink hover:bg-surface-hover'
                          )}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-sm font-medium flex-1">{cmd.label}</span>
                          {isActive && <CornerDownLeft className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-line flex items-center gap-4 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line px-1">↑↓</kbd> naviguer
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-line px-1">↵</kbd> ouvrir
              </span>
              <span className="ml-auto">{filtered.length} commande(s)</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
