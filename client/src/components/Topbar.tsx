import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ChevronDown, Menu, LogOut, User, Settings, Monitor, Terminal as CommandIcon, Mail, LifeBuoy } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';
import CommandPalette from './CommandPalette';
import ContactForm from './ContactForm';
import api from '../lib/api';
import { getRoleHomePath } from '../lib/roles';
import { cn } from '../lib/utils';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const { user, logout, roles, activeRoleId, setActiveRole } = useAuthStore();
  const { t } = useLanguageStore();
  const navigate = useNavigate();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Real notifications from the API
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications-topbar'],
    queryFn: async () => {
      const res = await api.get('/notifications', { params: { limit: 6 } });
      const d = res.data?.data;
      const items = Array.isArray(d) ? d : (d?.items ?? []);
      return items as { id: string; title: string; message?: string; isRead: boolean; createdAt: string }[];
    },
  });

  const notificationsMutation = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-topbar'] }),
  });

  // Command palette shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const notifications = notificationsData ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAllRead = () => {
    notificationsMutation.mutate();
  };

  return (
    <header className="sticky top-0 z-topbar border-b border-line bg-surface">
      <div className="flex items-center justify-between px-4 lg:px-6 h-16">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <GlobalSearch />
          <button
            onClick={() => setShowPalette(true)}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border dark:border-white/10 text-sm text-muted dark:text-gray-400 hover:border-primary-500/50 hover:text-primary-500 transition-colors"
            title="Ouvrir la palette de commandes"
          >
            <CommandIcon className="w-4 h-4" />
            <span>Commandes</span>
            <kbd className="text-[10px] font-medium border border-border dark:border-white/10 rounded px-1.5 py-0.5">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeToggle />

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              <Bell className="w-5 h-5 text-muted dark:text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-80 z-[150] bg-surface rounded-2xl border border-border shadow-xl overflow-hidden dark:bg-[#1E293B] dark:border-white/10"
                >
                  <div className="px-4 py-3 border-b border-border dark:border-white/10 flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm">
                      Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        disabled={notificationsMutation.isPending}
                        className="text-xs text-primary-500 hover:text-primary-600 font-medium disabled:opacity-50"
                      >
                        Tout marquer comme lu
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="w-8 h-8 text-muted mx-auto mb-2" />
                        <p className="text-sm text-muted dark:text-gray-400">
                          Aucune notification pour le moment
                        </p>
                      </div>
                    ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={cn(
                          'px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-0',
                          !notif.isRead && 'bg-primary-50/50 dark:bg-primary-500/10'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {!notif.isRead && (
                            <span className="w-2 h-2 bg-primary-500 rounded-full mt-1.5 flex-shrink-0" />
                          )}
                          <div className={cn(notif.isRead && 'ml-5')}>
                            <p className="text-sm font-medium text-text">{notif.title}</p>
                            <p className="text-xs text-muted mt-0.5">
                              {new Date(notif.createdAt).toLocaleString('fr-FR')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors"
            >
              <div className="w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-500">
                  {(user?.name ?? '?')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join('')}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted hidden sm:block" />
            </button>
            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-56 z-[150] bg-surface rounded-2xl border border-border shadow-xl overflow-hidden dark:bg-[#1E293B] dark:border-white/10"
                >
                  <div className="px-4 py-3 border-b border-border dark:border-white/10">
                    <p className="text-sm font-semibold text-text">
                      {user?.name}
                    </p>
                    <p className="text-xs text-muted">{user?.email}</p>
                  </div>
                  {roles.length > 1 && (
                    <div className="px-3 py-2 border-b border-border dark:border-white/10">
                      <p className="px-1 text-xs font-medium text-muted dark:text-gray-400">
                        Espace :
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {roles.map((role) => {
                          const isActive = role.id === activeRoleId;
                          return (
                            <button
                              key={role.id}
                              onClick={() => {
                                setActiveRole(role.id);
                                setShowUserMenu(false);
                                navigate(getRoleHomePath(role.name));
                              }}
                              className={cn(
                                'px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors capitalize',
                                isActive
                                  ? 'bg-primary-500/10 text-primary-500 border-primary-500/30'
                                  : 'text-muted dark:text-gray-400 border-border dark:border-white/10 hover:text-text hover:border-primary-500/50 dark:hover:text-gray-100'
                              )}
                            >
                              {role.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="p-1">
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/app/settings'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-text hover:bg-gray-50 dark:hover:bg-white/5 dark:hover:text-gray-100 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Paramètres
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/app/profile'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-text hover:bg-gray-50 dark:hover:bg-white/5 dark:hover:text-gray-100 rounded-lg transition-colors"
                    >
                      <User className="w-4 h-4" />
                      Mon profil
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/app/sessions'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-text hover:bg-gray-50 dark:hover:bg-white/5 dark:hover:text-gray-100 rounded-lg transition-colors"
                    >
                      <Monitor className="w-4 h-4" />
                      Sessions actives
                    </button>
                    <hr className="my-1 border-border dark:border-white/10" />
                    <button
                      onClick={() => { setShowUserMenu(false); setShowContactForm(true); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
                    >
                      <LifeBuoy className="w-4 h-4" />
                      Contacter le support
                    </button>
                    <hr className="my-1 border-border dark:border-white/10" />
                    <button
                      onClick={() => { logout(); navigate('/login'); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Déconnexion
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      <CommandPalette isOpen={showPalette} onClose={() => setShowPalette(false)} />
        <ContactForm
          isOpen={showContactForm}
          onClose={() => setShowContactForm(false)}
          pageContext={window.location.pathname}
        />
      </div>
    </header>
  );
}
