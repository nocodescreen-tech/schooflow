import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft, Loader2, Plus, ShieldCheck, Ban, Clock, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { useAuthStore, hasPermission } from '../store/authStore';
import api from '../lib/api';
import { cn } from '../lib/utils';

/**
 * Delegations (§19).
 *
 * One page, two audiences, driven by real data only:
 *  - `delegations.view` holders manage the establishment's delegations;
 *  - everyone else sees only who acts on their behalf and what they delegated,
 *    which is why `/delegations/me` needs no permission at all.
 */

interface DelegationRow {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUserName: string;
  toUserName: string;
  permissions: string[];
  scopeType: string | null;
  scopeId: string | null;
  startAt: string;
  endAt: string;
  reason: string | null;
  status: 'pending' | 'active' | 'revoked' | 'expired';
  effective: boolean;
  revokedAt: string | null;
  createdAt: string;
}

interface DelegationTrace {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  permissions: string[];
  scopeType: string | null;
  startAt: string;
  endAt: string;
  effective: boolean;
}

interface DelegationsResponse { items: DelegationRow[]; total: number }
interface MeResponse { received: DelegationTrace[]; given: DelegationTrace[]; activeReceivedCount: number }
interface DelegatableResponse { permissions: string[]; isSuperuser: boolean }
interface UserRow { id: string; name: string; email: string; role: string; status: string }

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const STATUS_LABEL: Record<DelegationRow['status'], string> = {
  pending: 'En attente',
  active: 'Active',
  revoked: 'Révoquée',
  expired: 'Expirée',
};

const STATUS_BADGE: Record<DelegationRow['status'], string> = {
  pending: 'badge-warning',
  active: 'badge-success',
  revoked: 'badge-danger',
  expired: 'badge',
};

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`, not an ISO string with a Z. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TraceList({ rows, empty }: { rows: DelegationTrace[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted dark:text-gray-400 px-1">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((t) => (
        <li key={t.id} className="rounded-xl border border-border dark:border-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-text dark:text-gray-200">{t.counterpartyName || '—'}</p>
            <span className={cn('badge', t.effective ? 'badge-success' : 'badge')}>
              {t.effective ? 'En cours' : 'Sans effet'}
            </span>
          </div>
          <p className="text-xs text-muted dark:text-gray-400 mt-1">
            Du {fmtDateTime(t.startAt)} au {fmtDateTime(t.endAt)}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {t.permissions.map((p) => (
              <code key={p} className="text-[11px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted dark:text-gray-300">
                {p}
              </code>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Delegations() {
  const user = useAuthStore((s) => s.user);
  const permissions = useAuthStore((s) => s.permissions);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const canView = hasPermission(permissions, 'delegations', 'view');
  const canManage = hasPermission(permissions, 'delegations', 'manage');
  const canDelegateOthers =
    hasPermission(permissions, 'delegations', 'delegate_others') || permissions.includes('*');

  const [showCreate, setShowCreate] = useState(false);
  const [showRejected, setShowRejected] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<DelegationRow | null>(null);

  const [form, setForm] = useState(() => ({
    fromUserId: '',
    toUserId: '',
    permissions: [] as string[],
    scopeType: '',
    reason: '',
    startAt: toLocalInput(new Date()),
    endAt: toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  }));

  const list = useQuery({
    queryKey: ['delegations'],
    enabled: canView,
    queryFn: async (): Promise<DelegationsResponse> => {
      const res = await api.get('/delegations');
      return res.data?.data ?? { items: [], total: 0 };
    },
  });

  const me = useQuery({
    queryKey: ['delegations', 'me'],
    queryFn: async (): Promise<MeResponse> => {
      const res = await api.get('/delegations/me');
      return res.data?.data;
    },
  });

  const delegatable = useQuery({
    queryKey: ['delegations', 'delegatable'],
    enabled: canManage,
    queryFn: async (): Promise<DelegatableResponse> => {
      const res = await api.get('/delegations/delegatable');
      return res.data?.data;
    },
  });

  const users = useQuery({
    queryKey: ['delegations', 'recipients'],
    enabled: canManage,
    queryFn: async (): Promise<UserRow[]> => {
      const res = await api.get('/delegations/recipients');
      return res.data?.data?.items ?? [];
    },
  });

  const candidates = useMemo(
    () => (users.data ?? []).filter((u) => u.status === 'active' && u.id !== form.fromUserId),
    [users.data, form.fromUserId]
  );

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const p of delegatable.data?.permissions ?? []) {
      const [module] = p.split('.');
      const list = groups.get(module) ?? [];
      list.push(p);
      groups.set(module, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [delegatable.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['delegations'] });
    // The recipient's rights just changed: refresh this shell's workspace too.
    queryClient.invalidateQueries({ queryKey: ['workspace'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/delegations', {
        ...(form.fromUserId ? { fromUserId: form.fromUserId } : {}),
        toUserId: form.toUserId,
        permissions: form.permissions,
        scopeType: form.scopeType || null,
        reason: form.reason.trim() || null,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      return res.data?.data as { granted: string[]; rejected: string[] };
    },
    onSuccess: (data) => {
      addToast('success', 'Délégation enregistrée');
      setShowCreate(false);
      setForm((f) => ({ ...f, toUserId: '', permissions: [], reason: '' }));
      if (data?.rejected?.length) setShowRejected(data.rejected);
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Délégation impossible')),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/delegations/${id}/revoke`);
    },
    onSuccess: () => {
      addToast('success', 'Délégation révoquée');
      setToRevoke(null);
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Révocation impossible')),
  });

  const togglePermission = (p: string) =>
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p)
        ? f.permissions.filter((x) => x !== p)
        : [...f.permissions, p],
    }));

  const rows = list.data?.items ?? [];
  const active = rows.filter((d) => d.status === 'active');
  const closed = rows.filter((d) => d.status !== 'active');

  const submitDisabled =
    createMutation.isPending ||
    !form.toUserId ||
    form.permissions.length === 0 ||
    !form.startAt ||
    !form.endAt ||
    new Date(form.endAt) <= new Date(form.startAt);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">
              {canView ? 'Délégations' : 'Mes délégations'}
            </h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {canView
                ? `${active.length} délégation(s) active(s) sur ${rows.length} enregistrée(s).`
                : 'Personnes autorisées à agir en votre nom, et responsabilités que vous avez transmises.'}
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 self-start">
              <Plus className="w-4 h-4" />
              Nouvelle délégation
            </button>
          )}
        </div>

        {/* Non-privileged users always see their own exposure first. */}
        {!canView && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ArrowRightLeft className="w-5 h-5 text-primary-500" />
                <h2 className="text-base font-semibold text-text dark:text-gray-100">Délégué vers moi</h2>
              </div>
              <TraceList rows={me.data?.received ?? []} empty="Aucune personne n’agit en votre nom." />
            </section>
            <section className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ArrowRightLeft className="w-5 h-5 text-muted" />
                <h2 className="text-base font-semibold text-text dark:text-gray-100">Délégué par moi</h2>
              </div>
              <TraceList rows={me.data?.given ?? []} empty="Vous n’avez délégué aucune responsabilité." />
            </section>
          </div>
        )}

        {canView && (
          <>
            {/* Everyone who can see the register also sees their own exposure. */}
            {(me.data?.received.length || me.data?.given.length) ? (
              <div className="card p-5 border-l-4 border-l-primary-500">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-5 h-5 text-primary-500" />
                  <h2 className="text-base font-semibold text-text dark:text-gray-100">
                    Concernant votre compte ({user?.name})
                  </h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-500 mb-2">
                      Reçu
                    </p>
                    <TraceList rows={me.data?.received ?? []} empty="Aucune délégation reçue." />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-500 mb-2">
                      Accordé
                    </p>
                    <TraceList rows={me.data?.given ?? []} empty="Aucune délégation accordée." />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="card overflow-hidden">
              {list.isLoading ? (
                <div className="p-4 space-y-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : list.isError ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-danger mb-3">
                    {getErrorMessage(list.error, 'Impossible de charger les délégations')}
                  </p>
                  <button onClick={() => list.refetch()} className="btn-secondary">Réessayer</button>
                </div>
              ) : rows.length === 0 ? (
                <div className="p-10 text-center">
                  <ArrowRightLeft className="w-8 h-8 text-muted mx-auto mb-3" />
                  <p className="text-sm font-medium text-text dark:text-gray-200">Aucune délégation</p>
                  <p className="text-sm text-muted dark:text-gray-400 mt-1">
                    Utilisez « Nouvelle délégation » pour transférer une responsabilité temporairement,
                    par exemple en cas d’absence d’un membre de la direction.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">De</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Vers</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Permissions</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Période</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-white/5">
                      {active.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{d.fromUserName}</td>
                          <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{d.toUserName}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                              className="text-sm text-primary-500 hover:underline inline-flex items-center gap-1"
                            >
                              {d.permissions.length} permission(s)
                              {expanded === d.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            {expanded === d.id && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {d.permissions.map((p) => (
                                  <code key={p} className="text-[11px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted dark:text-gray-300">
                                    {p}
                                  </code>
                                ))}
                                {d.scopeType && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-500">
                                    portée : {d.scopeType}
                                  </span>
                                )}
                              </div>
                            )}
                            {d.reason && (
                              <p className="text-xs text-muted dark:text-gray-400 mt-1">{d.reason}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted dark:text-gray-400">
                            {fmtDate(d.startAt)} → {fmtDate(d.endAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('badge', STATUS_BADGE[d.status])}>
                              {d.effective ? 'Effective' : STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canManage && (
                              <button
                                onClick={() => setToRevoke(d)}
                                className="btn-danger !px-3 !py-1.5 text-sm inline-flex items-center gap-1.5"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                Révoquer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {closed.map((d) => (
                        <tr key={d.id} className="opacity-60">
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{d.fromUserName}</td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{d.toUserName}</td>
                          <td className="px-4 py-3 text-xs text-muted dark:text-gray-400">
                            {d.permissions.length} permission(s)
                          </td>
                          <td className="px-4 py-3 text-xs text-muted dark:text-gray-400">
                            {fmtDate(d.startAt)} → {fmtDate(d.endAt)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('badge', STATUS_BADGE[d.status])}>{STATUS_LABEL[d.status]}</span>
                            {d.revokedAt && (
                              <p className="text-[11px] text-muted dark:text-gray-500 mt-1">
                                le {fmtDate(d.revokedAt)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted dark:text-gray-500">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs text-muted dark:text-gray-400 px-1">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Une délégation ne peut jamais accorder plus que ce que le délégataire détient réellement, et
                elle cesse de produire effet à l’expiration de sa période, sans intervention.
              </p>
            </div>
          </>
        )}

        {/* ─── Create ─── */}
        <Modal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          title="Nouvelle délégation"
          size="lg"
        >
          <div className="space-y-4">
            {canDelegateOthers && (
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Délégataire d’origine
                </label>
                <select
                  value={form.fromUserId}
                  onChange={(e) => setForm((f) => ({ ...f, fromUserId: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Moi-même</option>
                  {(users.data ?? [])
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted dark:text-gray-400 mt-1">
                  Par défaut vous déléquez vos propres permissions. Choisissez une autre personne pour
                  ASSUMER une absence (une délégation ne peut pas créer un pouvoir que le délégataire
                  d’origine ne détient pas).
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Bénéficiaire <span className="text-danger">*</span>
              </label>
              <select
                value={form.toUserId}
                onChange={(e) => setForm((f) => ({ ...f, toUserId: e.target.value }))}
                className="input-field"
              >
                <option value="">Sélectionner un compte actif</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-text dark:text-gray-300">
                  Permissions déléguées <span className="text-danger">*</span>
                </label>
                <span className="text-xs text-muted dark:text-gray-400">
                  {form.permissions.length} sélectionnée(s)
                </span>
              </div>
              {delegatable.isLoading ? (
                <div className="skeleton h-24 rounded-xl" />
              ) : permissionGroups.length === 0 ? (
                <p className="text-sm text-muted dark:text-gray-400">
                  Vous ne détenez aucune permission déléguable.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
                  {permissionGroups.map(([module, perms]) => (
                    <div key={module}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-500 mb-1.5">
                        {module}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((p) => (
                          <label
                            key={p}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors',
                              form.permissions.includes(p)
                                ? 'bg-primary-500/10 text-primary-500 border-primary-500/30'
                                : 'text-muted dark:text-gray-400 border-border dark:border-white/10'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(p)}
                              onChange={() => togglePermission(p)}
                              className="w-3.5 h-3.5 accent-blue-600"
                            />
                            {p.split('.')[1] ?? p}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {delegatable.data?.isSuperuser && (
                <p className="text-xs text-muted dark:text-gray-400 mt-2">
                  Vous détenez l’accès global : le catalogue complet vous est proposé.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Début <span className="text-danger">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Fin <span className="text-danger">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            {form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt) && (
              <p className="text-xs text-danger">La fin doit être postérieure au début.</p>
            )}

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Portée (optionnel)
              </label>
              <select
                value={form.scopeType}
                onChange={(e) => setForm((f) => ({ ...f, scopeType: e.target.value }))}
                className="input-field"
              >
                <option value="">Établissement entier</option>
                <option value="CLASS">Une classe</option>
                <option value="SECTION">Une section</option>
                <option value="DEPARTMENT">Un département</option>
                <option value="LEVEL">Un niveau</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Motif
              </label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="input-field"
                placeholder="Ex : direction absente du 12 au 20"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-ghost">Annuler</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={submitDisabled}
                className="btn-primary disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Déléguer
              </button>
            </div>
          </div>
        </Modal>

        {/* ─── Permissions refused because the delegator does not hold them ─── */}
        <Modal
          isOpen={!!showRejected}
          onClose={() => setShowRejected(null)}
          title="Certaines permissions n’ont pas été déléguées"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              Ces permissions ont été retirées de la délégation car le délégataire d’origine ne les
              détient pas. Une délégation ne peut pas créer un pouvoir.
            </p>
            <ul className="space-y-1.5">
              {(showRejected ?? []).map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <Ban className="w-4 h-4 text-danger shrink-0" />
                  <code className="text-xs px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">{p}</code>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button onClick={() => setShowRejected(null)} className="btn-primary">Compris</button>
            </div>
          </div>
        </Modal>

        {/* ─── Revoke confirmation ─── */}
        <Modal isOpen={!!toRevoke} onClose={() => setToRevoke(null)} title="Révoquer la délégation">
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              <strong className="text-text dark:text-gray-200">{toRevoke?.toUserName}</strong> perdra
              immédiatement {toRevoke?.permissions.length} permission(s) déléguées par{' '}
              <strong className="text-text dark:text-gray-200">{toRevoke?.fromUserName}</strong>. La
              délégation reste tracée dans l’historique et le journal d’audit.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setToRevoke(null)} className="btn-ghost">Annuler</button>
              <button
                onClick={() => toRevoke && revokeMutation.mutate(toRevoke.id)}
                disabled={revokeMutation.isPending}
                className="btn-danger disabled:opacity-50 inline-flex items-center gap-2"
              >
                {revokeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Clock className="w-4 h-4" />
                Révoquer maintenant
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}