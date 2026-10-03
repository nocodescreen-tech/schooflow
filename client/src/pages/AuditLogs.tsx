import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { formatDate } from '../lib/utils';
import api from '../lib/api';

interface AuditLog {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

const ACTIONS = [
  'create', 'update', 'delete', 'submit', 'validate', 'publish',
  'close', 'open', 'promote', 'login', 'logout',
];

export default function AuditLogs() {
  const [action, setAction] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const onSearchChange = (v: string) => {
    setSearch(v);
    window.clearTimeout((onSearchChange as unknown as { t?: number }).t);
    (onSearchChange as unknown as { t?: number }).t = window.setTimeout(() => {
      setDebounced(v.trim());
      setPage(1);
    }, 400);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', action, debounced, page],
    queryFn: async (): Promise<{ items: AuditLog[]; total: number; pages: number }> => {
      const res = await api.get('/audit-logs', {
        params: {
          ...(action !== 'all' ? { action } : {}),
          ...(debounced ? { search: debounced } : {}),
          page,
        },
      });
      const d = res.data?.data ?? {};
      return {
        items: (d.items ?? []) as AuditLog[],
        total: Number(d.total ?? 0),
        pages: Number(d.pages ?? 1),
      };
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, data?.pages ?? 1);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Journal d’audit</h1>
          <p className="text-muted dark:text-gray-400 mt-1">
            {total} événement(s) enregistré(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input-field pl-11"
              placeholder="Rechercher (entité, action...)"
            />
          </div>
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="all">Toutes les actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <ScrollText className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Aucun événement trouvé</p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Utilisateur</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Entité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {items.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400 whitespace-nowrap">
                        {log.createdAt ? formatDate(log.createdAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">
                        {log.user?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-info badge">{log.action}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                        {log.entity ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border dark:border-white/10">
                <span className="text-sm text-muted dark:text-gray-400">
                  Page {page} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" /> Précédent
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    Suivant <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
