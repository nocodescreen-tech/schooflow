import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Users, School, GraduationCap, ClipboardList, CalendarCheck,
  Receipt, CreditCard, FileText, Settings, LogOut, X, Plane, MessageSquare,
  Calendar, Bell, BarChart3, User, CalendarDays, Wallet, Upload, Layers,
  Megaphone, Siren, ShieldCheck, BookOpen, ShieldAlert, ScrollText, UserCog,
  FolderOpen, Coins, Network, UserCircle, Monitor, ArrowRightLeft, ClipboardCheck,
  Compass, Archive, ChevronDown, Check, type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import ThemeToggle from './ThemeToggle';
import { cn } from '../lib/utils';

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, School, GraduationCap, ClipboardList, CalendarCheck,
  Receipt, CreditCard, FileText, Settings, LogOut, Plane, MessageSquare,
  Calendar, Bell, BarChart3, User, CalendarDays, Wallet, Upload, Layers,
  Megaphone, Siren, ShieldCheck, BookOpen, ShieldAlert, ScrollText, UserCog,
  FolderOpen, Coins, Network, UserCircle, Monitor, ArrowRightLeft, ClipboardCheck,
  Compass, Archive, X,
};

interface NavItem { id: string; label: string; path: string; icon: string; isHome?: boolean }
interface NavGroup { section: string; label: string; items: NavItem[] }
interface AvailableWorkspace {
  code: string; name: string; description: string; icon: string;
  available: boolean; reason?: string;
}
interface WorkspaceContext {
  active: { code: string; name: string; description: string; icon: string; home: string };
  available: AvailableWorkspace[];
  navigation: NavGroup[];
  isSuperuser: boolean;
  scope: { kind: string; isGlobal: boolean };
}

function useWorkspace() {
  return useQuery({
    queryKey: ['workspace'],
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<WorkspaceContext> => {
      const res = await api.get('/workspace');
      return res.data?.data;
    },
  });
}

function WorkspaceSwitcher({ ctx }: { ctx: WorkspaceContext }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const usable = ctx.available.filter((w) => w.available);
  const blocked = ctx.available.filter((w) => !w.available);

  const switchTo = useMutation({
    mutationFn: async (code: string) => {
      const res = await api.post('/workspace/switch', { workspace: code });
      return res.data?.data as WorkspaceContext;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['workspace'], data);
      setOpen(false);
      if (data?.active?.home) navigate(data.active.home);
    },
  });

  if (usable.length <= 1 && blocked.length === 0) return null;

  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-inset hover:bg-surface-hover transition-colors text-left"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="w-8 h-8 rounded-lg bg-accent-subtle flex items-center justify-center shrink-0">
          {(() => {
            const Icon = ICONS[ctx.active.icon] ?? LayoutDashboard;
            return <Icon className="w-4 h-4 text-accent" />;
          })()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-caption uppercase tracking-wide text-text-subtle">Espace de travail</p>
          <p className="text-xs font-medium text-text truncate">{ctx.active.name}</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
            role="listbox"
            className="absolute left-0 right-0 top-full mt-1.5 z-dropdown card p-1.5 shadow-lg max-h-72 overflow-y-auto"
          >
            {usable.map((w) => (
              <li key={w.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={w.code === ctx.active.code}
                  disabled={switchTo.isPending}
                  onClick={() => switchTo.mutate(w.code)}
                  className={cn(
                    'w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    w.code === ctx.active.code
                      ? 'bg-accent-subtle text-accent'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  )}
                >
                  {(() => {
                    const Icon = ICONS[w.icon] ?? LayoutDashboard;
                    return <Icon className="w-4 h-4 mt-0.5 shrink-0" />;
                  })()}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{w.name}</span>
                    <span className="block text-caption text-text-subtle line-clamp-2">{w.description}</span>
                  </span>
                  {w.code === ctx.active.code && <Check className="w-4 h-4 mt-0.5 shrink-0" />}
                </button>
              </li>
            ))}
            {blocked.map((w) => (
              <li key={w.code} className="px-2.5 py-2 opacity-50">
                <div className="flex items-start gap-2.5">
                  {(() => {
                    const Icon = ICONS[w.icon] ?? LayoutDashboard;
                    return <Icon className="w-4 h-4 mt-0.5 shrink-0 text-text-subtle" />;
                  })()}
                  <span>
                    <span className="block text-sm font-medium text-text-subtle">{w.name}</span>
                    <span className="block text-caption text-text-subtle">{w.reason}</span>
                  </span>
                </div>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SidebarProps { isOpen: boolean; onClose: () => void }

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const { data, isLoading, isError, refetch } = useWorkspace();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/40 z-drawer lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-drawer w-[280px] bg-surface-raised flex flex-col border-r border-border transition-transform duration-300 ease-standard',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between h-16 px-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-text tracking-tight">
              SCHOOL<span className="text-accent">FLOW</span>
            </span>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-surface-sunken animate-pulse" />
              ))}
            </div>
          ) : isError || !data ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-text-muted">Navigation indisponible</p>
              <button onClick={() => void refetch()} className="mt-3 text-xs text-accent hover:underline">
                Réessayer
              </button>
            </div>
          ) : data.navigation.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm text-text-muted">Aucun module accessible</p>
              <p className="text-xs text-text-subtle mt-1">
                Contactez l'administration pour activer les modules nécessaires.
              </p>
            </div>
          ) : (
            <>
              <WorkspaceSwitcher ctx={data} />
              {data.navigation.map((group) => (
                <div key={group.section} className="mb-4 last:mb-0">
                  <p className="px-3 pb-1.5 text-caption font-semibold uppercase tracking-wider text-text-subtle">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = ICONS[item.icon] ?? LayoutDashboard;
                      return (
                        <li key={item.id}>
                          <NavLink
                            to={item.path}
                            onClick={onClose}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ease-standard',
                                isActive
                                  ? 'bg-accent-subtle text-accent'
                                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                {isActive && (
                                  <motion.span
                                    layoutId="sidebar-active"
                                    className="absolute left-0 w-1 h-6 bg-accent rounded-r-full"
                                  />
                                )}
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                <span>{item.label}</span>
                              </>
                            )}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-accent-subtle rounded-full flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-accent">
                  {(user?.name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{user?.name}</p>
                <p className="text-xs text-text-muted truncate">{user?.email}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <button onClick={logout} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-muted hover:text-text hover:bg-surface-hover rounded-xl transition-colors">
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
}