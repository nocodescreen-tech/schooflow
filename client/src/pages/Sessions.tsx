import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  LogOut,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { useToastStore } from '../components/Toast';
import PageTransition from '../components/PageTransition';

interface SessionRow {
  id: string;
  userAgent: string;
  ipAddress: string | null;
  createdAt: string;
}

function detectDevice(ua: string): { icon: typeof Monitor; label: string } {
  const s = ua.toLowerCase();
  if (/mobile|android|iphone/.test(s)) return { icon: Smartphone, label: 'Mobile' };
  if (/ipad|tablet/.test(s)) return { icon: Tablet, label: 'Tablette' };
  return { icon: Monitor, label: 'Ordinateur' };
}

function describeBrowser(ua: string): string {
  const s = ua.toLowerCase();
  const name = /edg\//.test(s)
    ? 'Edge'
    : /chrome|crios/.test(s)
      ? 'Chrome'
      : /firefox|fxios/.test(s)
        ? 'Firefox'
        : /safari/.test(s)
          ? 'Safari'
          : 'Navigateur';
  const os = /windows/.test(s)
    ? 'Windows'
    : /mac os/.test(s)
      ? 'macOS'
      : /android/.test(s)
        ? 'Android'
        : /iphone|ipad/.test(s)
          ? 'iOS'
          : /linux/.test(s)
            ? 'Linux'
            : 'Système inconnu';
  return `${name} sur ${os}`;
}

export default function Sessions() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await api.get('/settings/sessions');
      return (res.data?.data?.items ?? []) as SessionRow[];
    },
  });

  const logoutAll = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout-all');
    },
    onSuccess: () => {
      addToast('success', 'Toutes les sessions ont été déconnectées');
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      localStorage.removeItem('schoolflow_token');
      setTimeout(() => {
        window.location.href = '/login';
      }, 600);
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de fermer les sessions'
      ),
  });

  const currentUa = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  return (
    <PageTransition>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Sessions actives</h1>
            <p className="text-sm text-muted dark:text-gray-400 mt-1">
              Les connexions récentes à votre compte, d’après le journal d’audit
            </p>
          </div>
          <button
            onClick={() => logoutAll.mutate()}
            disabled={logoutAll.isPending}
            className="btn-danger flex items-center gap-2 disabled:opacity-50"
          >
            {logoutAll.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            Déconnecter toutes les sessions
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="card p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-3" />
            <p className="text-sm text-muted dark:text-gray-400 mb-4">
              Impossible de charger les sessions
            </p>
            <button onClick={() => refetch()} className="btn-secondary">
              Réessayer
            </button>
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="card p-10 text-center">
            <ShieldCheck className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted dark:text-gray-400">
              Aucune connexion enregistrée pour le moment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data!.map((s, i) => {
              const device = detectDevice(s.userAgent ?? '');
              const Icon = device.icon;
              const isCurrent = (s.userAgent ?? '') === currentUa && i === 0;

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card p-5 flex items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary-500" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-text dark:text-gray-100">
                        {device.label}
                      </span>
                      {isCurrent && <span className="badge badge-success">Session actuelle</span>}
                    </div>
                    <p className="text-sm text-muted dark:text-gray-400 truncate mt-0.5">
                      {describeBrowser(s.userAgent ?? 'inconnu')}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted dark:text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {s.ipAddress ?? 'IP inconnue'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(s.createdAt).toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="card p-5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted dark:text-gray-400 leading-relaxed">
            Si vous reconnaissez une connexion inconnue, changez immédiatement votre mot de
            passe depuis la page Profil puis fermez toutes les sessions.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
