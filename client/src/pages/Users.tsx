import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon, Plus, Search, ShieldCheck, KeyRound, Ban, CheckCircle2, Power,
  RefreshCw, Eye, UserCog, AlertTriangle, Info, Ticket, XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useCan } from '../store/authStore';
import Modal from '../components/Modal';
import RowActions, { type RowActionItem } from '../components/RowActions';
import StatCard from '../components/StatCard';
import { useToastStore } from '../components/Toast';
import { useLanguageStore } from '../store/languageStore';

interface RoleRef { id: string; name: string }

interface UserRow {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  role: string;
  phone?: string | null;
  photo?: string | null;
  avatar?: string | null;
  isActive: boolean;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  roles: RoleRef[];
}

interface ActivationCodeRow {
  id: string;
  targetType: 'student' | 'parent' | 'staff';
  targetId: string;
  email: string | null;
  useCount: number;
  maxUses: number;
  expiresAt: string;
  usedAt: string | null;
  status: 'active' | 'used' | 'revoked' | 'expired';
  note: string | null;
  createdAt: string;
}

interface TargetOption { id: string; label: string }

interface MatrixRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  permissions: string[];
  isSuperuser: boolean;
  scope: {
    kind: string;
    isGlobal: boolean;
    classIds: string[];
    subjectIds: string[];
    studentIds: string[];
  };
}

interface AuthorizationSnapshot {
  user: { id: string; name: string; role: string };
  roles: string[];
  permissions: string[];
  isSuperuser: boolean;
  scope: { kind: string; isGlobal: boolean; classIds: string[]; subjectIds: string[]; studentIds: string[] };
  assignments: Array<{ id: string; assignmentType: string; status: string; classId?: string; subjectId?: string }>;
  breakdown: Array<{ permission: string; sources: string[]; effect: 'granted' | 'revoked' }>;
  explanation: string[];
}

interface UsersPage {
  items: UserRow[];
  total: number;
  page: number;
  pages: number;
}

interface RoleOption { id: string; name: string }

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  invited: { label: 'Invité', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  pending_activation: { label: 'En attente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  suspended: { label: 'Suspendu', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  disabled: { label: 'Désactivé', className: 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300' },
  archived: { label: 'Archivé', className: 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300' },
};

const SCOPE_LABELS: Record<string, string> = {
  SCHOOL: 'Toute l\'école',
  ASSIGNED_CLASSES: 'Classes affectées',
  LINKED_CHILDREN: 'Enfants liés',
  SELF: 'Lui-même',
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? STATUS_LABELS.active;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const canCreate = useCan('users', 'create_staff');
  const canUpdate = useCan('users', 'update');
  const canDisable = useCan('users', 'disable');
  const canManageRoles = useCan('roles', 'manage');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [authzUser, setAuthzUser] = useState<string | null>(null);
  const [rolesUser, setRolesUser] = useState<UserRow | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string; username?: string | null } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ user: UserRow; action: string } | null>(null);

  const [form, setForm] = useState({ name: '', email: '', role: 'receptionist', phone: '', temporaryPassword: '', mustChangePassword: true });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const [tab, setTab] = useState<'accounts' | 'codes'>('accounts');
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeResult, setCodeResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codeForm, setCodeForm] = useState({ targetType: 'student' as 'student' | 'parent', targetId: '', targetLabel: '', email: '', expiresInHours: 72, targetSearch: '' });

  const usersQuery = useQuery({
    queryKey: ['users', { page, search, status: statusFilter, role: roleFilter }],
    queryFn: async (): Promise<UsersPage> => {
      const res = await api.get('/users', {
        params: { page, limit: 25, search: search || undefined, status: statusFilter || undefined, role: roleFilter || undefined },
      });
      return res.data?.data ?? { items: [], total: 0, page: 1, pages: 1 };
    },
  });

  const matrixQuery = useQuery({
    queryKey: ['users-permissions-matrix'],
    queryFn: async (): Promise<MatrixRow[]> => {
      const res = await api.get('/users/permissions-matrix');
      return res.data?.data?.items ?? [];
    },
  });

  const rolesQuery = useQuery({
    queryKey: ['roles-options'],
    queryFn: async (): Promise<RoleOption[]> => {
      const res = await api.get('/roles');
      return (res.data?.data?.roles ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }));
    },
    enabled: canManageRoles,
  });

  const authzQuery = useQuery({
    queryKey: ['user-authorization', authzUser],
    queryFn: async (): Promise<AuthorizationSnapshot> => {
      const res = await api.get(`/users/${authzUser}/authorization`);
      return res.data?.data;
    },
    enabled: !!authzUser,
  });

  const canCreateStudentAccount = useCan('users', 'create_student');
  const canCreateParentAccount = useCan('users', 'create_parent');

  const codesQuery = useQuery({
    queryKey: ['activation-codes'],
    queryFn: async (): Promise<ActivationCodeRow[]> => {
      const res = await api.get('/activation-codes');
      return res.data?.data?.items ?? [];
    },
    enabled: tab === 'codes',
  });

  // Search students or parents to attach the code to their dossier.
  const targetSearchQuery = useQuery({
    queryKey: ['code-targets', codeForm.targetType, codeForm.targetSearch],
    queryFn: async (): Promise<TargetOption[]> => {
      if (codeForm.targetType === 'student') {
        const res = await api.get('/students', { params: { search: codeForm.targetSearch || undefined, limit: 10 } });
        return (res.data?.data?.items ?? []).map((s: { id: string; firstName: string; lastName: string; studentId: string }) => ({
          id: s.id,
          label: `${s.firstName} ${s.lastName} — ${s.studentId}`,
        }));
      }
      const res = await api.get('/parents', { params: { search: codeForm.targetSearch || undefined, limit: 10 } });
      return (res.data?.data?.items ?? []).map((p: { id: string; firstName: string; lastName: string; email: string | null }) => ({
        id: p.id,
        label: `${p.firstName} ${p.lastName}${p.email ? ` — ${p.email}` : ''}`,
      }));
    },
    enabled: codeOpen && (codeForm.targetType === 'student' ? canCreateStudentAccount : canCreateParentAccount),
  });

  const createCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/activation-codes', {
        targetType: codeForm.targetType,
        targetId: codeForm.targetId,
        email: codeForm.email || undefined,
        expiresInHours: codeForm.expiresInHours,
        note: codeForm.targetLabel || undefined,
      });
      return res.data?.data as { code: string; expiresAt: string };
    },
    onSuccess: (data) => {
      setCodeOpen(false);
      setCodeForm({ targetType: 'student', targetId: '', targetLabel: '', email: '', expiresInHours: 72, targetSearch: '' });
      void queryClient.invalidateQueries({ queryKey: ['activation-codes'] });
      if (data?.code) setCodeResult({ code: data.code, expiresAt: data.expiresAt });
      else addToast('success', 'Code généré');
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur lors de la génération du code');
    },
  });

  const revokeCodeMutation = useMutation({
    mutationFn: async (codeId: string) => {
      await api.post(`/activation-codes/${codeId}/revoke`);
    },
    onSuccess: () => {
      addToast('success', 'Code révoqué');
      void queryClient.invalidateQueries({ queryKey: ['activation-codes'] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur');
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['users-permissions-matrix'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/users', {
        name: form.name, email: form.email, role: form.role,
        phone: form.phone || undefined,
        temporaryPassword: form.temporaryPassword || undefined,
        mustChangePassword: form.mustChangePassword,
        roleIds: selectedRoleIds,
      });
      return res.data?.data;
    },
    onSuccess: (data) => {
      setCreateOpen(false);
      setForm({ name: '', email: '', role: 'receptionist', phone: '', temporaryPassword: '', mustChangePassword: true });
      setSelectedRoleIds([]);
      invalidate();
      if (data?.temporaryPassword) {
        setResetResult({ name: form.name, password: data.temporaryPassword, username: data.user?.username ?? null });
      } else {
        addToast('success', 'Compte créé');
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur lors de la création');
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/users/${userId}/reset-password`);
      return res.data?.data?.temporaryPassword;
    },
    onSuccess: (password) => {
      invalidate();
      if (password) {
        setResetResult({ name: confirmAction?.user.name ?? '', password });
      }
      setConfirmAction(null);
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur lors de la réinitialisation');
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: string; action: string }) => {
      await api.post(`/users/${userId}/status`, { action });
    },
    onSuccess: () => {
      addToast('success', 'Statut mis à jour');
      invalidate();
      setConfirmAction(null);
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur');
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/users/${userId}/revoke-sessions`);
      return res.data?.data?.revoked ?? 0;
    },
    onSuccess: (n) => {
      addToast('success', `${n} session(s) révoquée(s)`);
      invalidate();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur');
    },
  });

  const rolesMutation = useMutation({
    mutationFn: async ({ userId, roleIds }: { userId: string; roleIds: string[] }) => {
      await api.put(`/users/${userId}/roles`, { roleIds });
    },
    onSuccess: () => {
      addToast('success', 'Rôles mis à jour');
      invalidate();
      setRolesUser(null);
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      addToast('error', e.response?.data?.error ?? 'Erreur');
    },
  });

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const pages = usersQuery.data?.pages ?? 1;
  const matrix = matrixQuery.data ?? [];

  const counts = {
    total: matrix.length,
    active: matrix.filter((m) => m.status === 'active').length,
    scoped: matrix.filter((m) => !m.scope.isGlobal).length,
    mustChange: matrix.filter((m) => m.status === 'active').length,
  };

  function rowActions(user: UserRow): RowActionItem[] {
    const actions: RowActionItem[] = [];
    actions.push({ label: 'Matrice des droits', icon: <Eye className="w-4 h-4" />, onClick: () => setAuthzUser(user.id) });
    if (canUpdate) {
      actions.push({
        label: 'Réinitialiser le mot de passe',
        icon: <KeyRound className="w-4 h-4" />,
        onClick: () => setConfirmAction({ user, action: 'reset' }),
      });
    }
    if (canManageRoles) {
      actions.push({ label: 'Gérer les rôles', icon: <UserCog className="w-4 h-4" />, onClick: () => { setRolesUser(user); setSelectedRoleIds(user.roles.map((r) => r.id)); } });
    }
    if (canUpdate) {
      actions.push({
        label: 'Révoquer les sessions',
        icon: <Power className="w-4 h-4" />,
        onClick: () => revokeSessionsMutation.mutate(user.id),
      });
    }
    if (canDisable) {
      if (user.status === 'active') {
        actions.push({ label: 'Suspendre', icon: <Ban className="w-4 h-4" />, onClick: () => setConfirmAction({ user, action: 'suspend' }) });
        actions.push({ label: 'Désactiver', icon: <AlertTriangle className="w-4 h-4 text-danger" />, danger: true, onClick: () => setConfirmAction({ user, action: 'disable' }) });
      } else {
        actions.push({ label: 'Réactiver', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => setConfirmAction({ user, action: 'reactivate' }) });
      }
    }
    return actions;
  }

  const CONFIRM_COPY: Record<string, { title: string; body: string; confirm: string; danger: boolean }> = {
    reset: { title: 'Réinitialiser le mot de passe', body: 'Un mot de passe temporaire sera généré. Les sessions actives de cet utilisateur seront révoquées et il devra changer son mot de passe à la prochaine connexion.', confirm: 'Réinitialiser', danger: false },
    suspend: { title: 'Suspendre le compte', body: 'La connexion sera bloquée et les sessions révoquées. L\'historique (notes, présences, affectations) est conservé.', confirm: 'Suspendre', danger: false },
    disable: { title: 'Désactiver le compte', body: 'Le compte ne pourra plus se connecter. L\'historique scolaire est conservé intégralement.', confirm: 'Désactiver', danger: true },
    reactivate: { title: 'Réactiver le compte', body: 'Le compte pourra de nouveau se connecter.', confirm: 'Réactiver', danger: false },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('nav.users') || 'Utilisateurs'}</h1>
          <p className="text-sm text-muted mt-1">
            Gestion centralisée des comptes, rôles et habilitations de l\'établissement
          </p>
        </div>
        {tab === 'accounts' && canCreate && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nouveau compte
          </button>
        )}
        {tab === 'codes' && (canCreateStudentAccount || canCreateParentAccount) && (
          <button onClick={() => setCodeOpen(true)} className="btn-primary">
            <Ticket className="w-4 h-4" />
            Générer un code
          </button>
        )}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-white/5 w-fit">
        <button
          onClick={() => setTab('accounts')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'accounts' ? 'bg-white dark:bg-slate-700 text-text shadow' : 'text-muted hover:text-text'}`}
        >
          Comptes
        </button>
        <button
          onClick={() => setTab('codes')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'codes' ? 'bg-white dark:bg-slate-700 text-text shadow' : 'text-muted hover:text-text'}`}
        >
          Codes d\'activation
        </button>
      </div>

      {tab === 'codes' ? (
        <ActivationCodesSection
          codes={codesQuery.data ?? []}
          isLoading={codesQuery.isLoading}
          onRefetch={() => void codesQuery.refetch()}
          onRevoke={(id) => revokeCodeMutation.mutate(id)}
        />
      ) : (
      <>


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Comptes" value={counts.total} icon={UsersIcon} color="bg-primary-500" />
        <StatCard title="Actifs" value={counts.active} icon={CheckCircle2} color="bg-green-500" />
        <StatCard title="Accès restreints" value={counts.scoped} icon={ShieldCheck} color="bg-amber-500" />
        <StatCard title="Comptes habilités" value={counts.mustChange} icon={UserCog} color="bg-blue-500" />
      </div>

      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher un nom, un email, un téléphone…"
              className="input pl-10 w-full"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input md:w-48">
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="input md:w-48">
            <option value="">Tous les rôles</option>
            <option value="admin">Administrateur</option>
            <option value="director">Direction</option>
            <option value="teacher">Enseignant</option>
            <option value="receptionist">Secrétariat</option>
            <option value="accountant">Comptabilité</option>
            <option value="prefect">Préfet</option>
            <option value="student">Élève</option>
            <option value="parent">Parent</option>
          </select>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="card p-8 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
          <p className="text-text font-medium">Impossible de charger les utilisateurs</p>
          <button onClick={() => void usersQuery.refetch()} className="btn-outline mt-4">
            <RefreshCw className="w-4 h-4" /> Réessayer
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <UsersIcon className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-text font-medium">Aucun utilisateur trouvé</p>
          <p className="text-sm text-muted mt-1">Ajustez vos filtres ou créez un premier compte.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Portée</th>
                  <th>Dernière connexion</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => {
                  const m = matrix.find((x) => x.id === u.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary-500/15 flex items-center justify-center shrink-0">
                            <span className="text-sm font-semibold text-primary-500">
                              {u.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-text truncate">{u.name}</p>
                            <p className="text-xs text-muted truncate">{u.email}</p>
                            {u.username && (
                              <p className="text-[11px] text-muted dark:text-gray-500 truncate">
                                Identifiant : <span className="font-mono">{u.username}</span>
                              </p>
                            )}
                            {u.mustChangePassword && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                <AlertTriangle className="w-3 h-3" /> mot de passe temporaire
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-text">{u.role}</p>
                        {u.roles.length > 0 && (
                          <p className="text-xs text-muted">{u.roles.map((r) => r.name).join(', ')}</p>
                        )}
                      </td>
                      <td><StatusBadge status={u.status} /></td>
                      <td>
                        <span className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-white/5 text-muted">
                          {m ? (SCOPE_LABELS[m.scope.kind] ?? m.scope.kind) : '—'}
                        </span>
                      </td>
                      <td className="text-sm text-muted">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fr-FR') : 'Jamais'}
                      </td>
                      <td className="text-right">
                        <RowActions items={rowActions(u)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border dark:border-white/10">
              <p className="text-sm text-muted">{total} compte(s)</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-outline">Précédent</button>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="btn-outline">Suivant</button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Create account */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Créer un compte" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nom complet *</label>
              <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input w-full" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Rôle *</label>
              <select className="input w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="director">Direction</option>
                <option value="receptionist">Secrétariat</option>
                <option value="teacher">Enseignant</option>
                <option value="accountant">Comptabilité</option>
                <option value="prefect">Préfet</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input className="input w-full" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Mot de passe temporaire</label>
            <input
              type="text"
              className="input w-full"
              placeholder="Laissez vide pour générer un mot de passe sécurisé"
              value={form.temporaryPassword}
              onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
            />
            <p className="text-xs text-muted mt-1">Le mot de passe n\'est stocké que sous forme de hash. Il ne sera plus jamais consultable.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={form.mustChangePassword} onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })} />
            Forcer le changement du mot de passe à la première connexion
          </label>

          {canManageRoles && (rolesQuery.data?.length ?? 0) > 0 && (
            <div>
              <label className="label">Rôles personnalisés (optionnel)</label>
              <div className="max-h-40 overflow-y-auto card p-3 space-y-2">
                {(rolesQuery.data ?? []).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(r.id)}
                      onChange={(e) =>
                        setSelectedRoleIds((prev) =>
                          e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)
                        )
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-outline" onClick={() => setCreateOpen(false)}>Annuler</button>
            <button
              className="btn-primary"
              disabled={createMutation.isPending || !form.name || !form.email}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Création…' : 'Créer le compte'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Temporary password reveal */}
      <Modal isOpen={!!resetResult} onClose={() => setResetResult(null)} title="Mot de passe temporaire" size="sm">
        {resetResult && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Ce mot de passe ne sera plus affiché après fermeture. Communiquez-le à l\'utilisateur.
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">{resetResult.name}</p>
              {resetResult.username && (
                <p className="text-sm text-muted mt-1">
                  Identifiant de connexion : <span className="font-mono text-text">{resetResult.username}</span>
                  <span className="text-xs"> (ou son email)</span>
                </p>
              )}
              <code className="block mt-1 p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-sm text-text break-all">
                {resetResult.password}
              </code>
            </div>
            <button className="btn-primary w-full" onClick={() => setResetResult(null)}>J\'ai noté le mot de passe</button>
          </div>
        )}
      </Modal>

      {/* Confirm lifecycle action */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction ? CONFIRM_COPY[confirmAction.action]?.title : ''} size="sm">
        {confirmAction && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{CONFIRM_COPY[confirmAction.action]?.body}</p>
            <p className="text-sm font-medium text-text">{confirmAction.user.name} — {confirmAction.user.email}</p>
            <div className="flex justify-end gap-3">
              <button className="btn-outline" onClick={() => setConfirmAction(null)}>Annuler</button>
              <button
                className={CONFIRM_COPY[confirmAction.action]?.danger ? 'btn-danger' : 'btn-primary'}
                disabled={statusMutation.isPending || resetMutation.isPending}
                onClick={() => {
                  if (confirmAction.action === 'reset') resetMutation.mutate(confirmAction.user.id);
                  else statusMutation.mutate({ userId: confirmAction.user.id, action: confirmAction.action });
                }}
              >
                {CONFIRM_COPY[confirmAction.action]?.confirm}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Authorization matrix */}
      <Modal isOpen={!!authzUser} onClose={() => setAuthzUser(null)} title="Matrice des droits effectifs" size="xl">
        {authzQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />)}
          </div>
        ) : authzQuery.data ? (
          <div className="space-y-5">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {authzQuery.data.explanation.join(' · ')}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text mb-2">Rôles</h3>
              <p className="text-sm text-muted">{authzQuery.data.roles.length ? authzQuery.data.roles.join(', ') : 'Aucun rôle personnalisé'}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text mb-2">Portée des données</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="card p-3"><p className="text-xs text-muted">Type</p><p className="text-sm font-medium text-text">{SCOPE_LABELS[authzQuery.data.scope.kind] ?? authzQuery.data.scope.kind}</p></div>
                <div className="card p-3"><p className="text-xs text-muted">Classes</p><p className="text-sm font-medium text-text">{authzQuery.data.scope.isGlobal ? 'Toutes' : authzQuery.data.scope.classIds.length}</p></div>
                <div className="card p-3"><p className="text-xs text-muted">Matières</p><p className="text-sm font-medium text-text">{authzQuery.data.scope.isGlobal ? 'Toutes' : authzQuery.data.scope.subjectIds.length}</p></div>
                <div className="card p-3"><p className="text-xs text-muted">Élèves</p><p className="text-sm font-medium text-text">{authzQuery.data.scope.isGlobal ? 'Tous' : authzQuery.data.scope.studentIds.length}</p></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text mb-2">
                Permissions effectives ({authzQuery.data.permissions.length})
              </h3>
              <div className="max-h-56 overflow-y-auto card p-3 flex flex-wrap gap-1.5">
                {authzQuery.data.permissions.slice(0, 200).map((p) => (
                  <span key={p} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-xs text-muted font-mono">{p}</span>
                ))}
              </div>
            </div>

            {authzQuery.data.assignments.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text mb-2">Affectations</h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {authzQuery.data.assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm p-2 rounded bg-gray-50 dark:bg-white/5">
                      <span className="text-text">{a.assignmentType}</span>
                      <span className="text-xs text-muted">{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune donnée disponible.</p>
        )}
      </Modal>

      {/* Roles editor */}
      <Modal isOpen={!!rolesUser} onClose={() => setRolesUser(null)} title={`Rôles — ${rolesUser?.name ?? ''}`} size="md">
        <div className="space-y-3">
          <div className="max-h-72 overflow-y-auto space-y-2">
            {(rolesQuery.data ?? []).map((r) => (
              <label key={r.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-text">
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(r.id)}
                  onChange={(e) =>
                    setSelectedRoleIds((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id)))
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            Retirer un rôle recalcule immédiatement les permissions, la navigation et la portée de cet utilisateur.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-outline" onClick={() => setRolesUser(null)}>Annuler</button>
            <button
              className="btn-primary"
              disabled={rolesMutation.isPending}
              onClick={() => rolesUser && rolesMutation.mutate({ userId: rolesUser.id, roleIds: selectedRoleIds })}
            >
              {rolesMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Generate activation code */}
      <Modal isOpen={codeOpen} onClose={() => setCodeOpen(false)} title="Générer un code d\'activation" size="md">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Le code permet à l\'élève ou au parent de créer lui-même son compte. Il est à usage unique, expirable et
            affiché une seule fois.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type de compte</label>
              <select
                className="input w-full"
                value={codeForm.targetType}
                onChange={(e) => setCodeForm({ ...codeForm, targetType: e.target.value as 'student' | 'parent', targetId: '', targetLabel: '' })}
              >
                {canCreateStudentAccount && <option value="student">Élève</option>}
                {canCreateParentAccount && <option value="parent">Parent</option>}
              </select>
            </div>
            <div>
              <label className="label">Validité</label>
              <select
                className="input w-full"
                value={codeForm.expiresInHours}
                onChange={(e) => setCodeForm({ ...codeForm, expiresInHours: Number(e.target.value) })}
              >
                <option value={24}>24 heures</option>
                <option value={72}>3 jours</option>
                <option value={168}>7 jours</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Rechercher {codeForm.targetType === 'student' ? 'l\'élève' : 'le parent'}</label>
            <input
              className="input w-full"
              placeholder="Nom, matricule…"
              value={codeForm.targetSearch}
              onChange={(e) => setCodeForm({ ...codeForm, targetSearch: e.target.value })}
            />
          </div>
          <div className="max-h-48 overflow-y-auto card p-2 space-y-1">
            {targetSearchQuery.isLoading ? (
              <p className="text-xs text-muted p-2">Recherche…</p>
            ) : (targetSearchQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted p-2">Aucun résultat.</p>
            ) : (
              (targetSearchQuery.data ?? []).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setCodeForm({ ...codeForm, targetId: opt.id, targetLabel: opt.label })}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${codeForm.targetId === opt.id ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 font-medium' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-text'}`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
          <div>
            <label className="label">Email attendu (optionnel)</label>
            <input
              type="email"
              className="input w-full"
              placeholder="L'activation sera refusée si l'email ne correspond pas"
              value={codeForm.email}
              onChange={(e) => setCodeForm({ ...codeForm, email: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-outline" onClick={() => setCodeOpen(false)}>Annuler</button>
            <button
              className="btn-primary"
              disabled={createCodeMutation.isPending || !codeForm.targetId}
              onClick={() => createCodeMutation.mutate()}
            >
              {createCodeMutation.isPending ? 'Génération…' : 'Générer le code'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Code reveal */}
      <Modal isOpen={!!codeResult} onClose={() => setCodeResult(null)} title="Code d\'activation" size="sm">
        {codeResult && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Ce code ne sera plus affiché après fermeture. Transmettez-le à l\'intéressé : il pourra activer son
                compte sur la page « Activer mon compte ».
              </p>
            </div>
            <code className="block p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-lg tracking-widest text-text text-center break-all">
              {codeResult.code}
            </code>
            <p className="text-xs text-muted text-center">
              Expire le {new Date(codeResult.expiresAt).toLocaleString('fr-FR')}
            </p>
            <button className="btn-primary w-full" onClick={() => setCodeResult(null)}>J\'ai noté le code</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

const CODE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  used: { label: 'Utilisé', className: 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300' },
  revoked: { label: 'Révoqué', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  expired: { label: 'Expiré', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

function ActivationCodesSection({
  codes,
  isLoading,
  onRefetch,
  onRevoke,
}: {
  codes: ActivationCodeRow[];
  isLoading: boolean;
  onRefetch: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Cible</th>
              <th>Type</th>
              <th>Email attendu</th>
              <th>Statut</th>
              <th>Expire le</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted">Chargement…</td></tr>
            ) : codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <Ticket className="w-8 h-8 text-muted mx-auto mb-2" />
                  <p className="text-sm text-text font-medium">Aucun code d\'activation</p>
                  <p className="text-xs text-muted mt-1">
                    Générez un code pour permettre à un élève ou un parent de créer son compte.
                  </p>
                </td>
              </tr>
            ) : (
              codes.map((c) => {
                const s = CODE_STATUS_LABELS[c.status] ?? CODE_STATUS_LABELS.active;
                return (
                  <tr key={c.id}>
                    <td className="text-sm text-text">{c.note ?? c.targetId}</td>
                    <td className="text-sm text-muted">
                      {c.targetType === 'student' ? 'Élève' : c.targetType === 'parent' ? 'Parent' : 'Personnel'}
                    </td>
                    <td className="text-sm text-muted">{c.email ?? '—'}</td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${s.className}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{new Date(c.expiresAt).toLocaleString('fr-FR')}</td>
                    <td className="text-right">
                      {c.status === 'active' ? (
                        <button className="btn-outline text-danger !border-red-200 dark:!border-red-500/30" onClick={() => onRevoke(c.id)}>
                          <XCircle className="w-4 h-4" /> Révoquer
                        </button>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-border dark:border-white/10">
        <p className="text-xs text-muted">
          Codes à usage unique. L\'élève active son compte depuis la page publique avec le code, son matricule et sa
          date de naissance.
        </p>
        <button onClick={onRefetch} className="btn-outline">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>
    </div>
  );
}
