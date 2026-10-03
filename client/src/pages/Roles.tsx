import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ShieldCheck, KeyRound, Users, BarChart3, Loader2 } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { useCan } from '../store/authStore';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface PermissionItem {
  id: string;
  module: string;
  action: string;
  description?: string;
}

interface RoleItem {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  schoolId: string | null;
  rolePermissions?: Array<{ permission?: PermissionItem }>;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const rolePermissionIds = (role: RoleItem): string[] =>
  (role.rolePermissions ?? [])
    .map((rp) => rp.permission?.id)
    .filter((id): id is string => !!id);

export default function Roles() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleToDelete, setRoleToDelete] = useState<RoleItem | null>(null);

  const [permRole, setPermRole] = useState<RoleItem | null>(null);
  const [permSelection, setPermSelection] = useState<Set<string>>(new Set());

  const [selectedUserId, setSelectedUserId] = useState('');
  const [userRoleIds, setUserRoleIds] = useState<Set<string>>(new Set());

  const canManageRoles = useCan('roles', 'view');

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get('/roles');
      return (res.data?.data?.roles ?? []) as RoleItem[];
    },
    enabled: canManageRoles,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['roles-permissions-catalog'],
    queryFn: async () => {
      const res = await api.get('/roles/permissions');
      return (res.data?.data?.permissions ?? []) as PermissionItem[];
    },
    enabled: canManageRoles,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const res = await api.get('/settings/users');
      return (res.data?.data?.items ?? []) as UserRow[];
    },
    enabled: canManageRoles,
  });

  const { data: assignedRoles = [] } = useQuery({
    queryKey: ['user-roles', selectedUserId],
    queryFn: async () => {
      const res = await api.get(`/roles/users/${selectedUserId}/roles`);
      return (res.data?.data?.roles ?? []) as RoleItem[];
    },
    enabled: canManageRoles && !!selectedUserId,
  });

  const catalogByModule = useMemo(() => {
    const groups = new Map<string, PermissionItem[]>();
    for (const p of catalog) {
      const list = groups.get(p.module) ?? [];
      list.push(p);
      groups.set(p.module, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const invalidateRoles = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      if (editingRole) {
        const res = await api.patch(`/roles/${editingRole.id}`, {
          name: roleName.trim(),
          description: roleDescription.trim(),
        });
        return res.data;
      }
      const res = await api.post('/roles', {
        name: roleName.trim(),
        description: roleDescription.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', editingRole ? 'Rôle mis à jour' : 'Rôle créé');
      setShowRoleModal(false);
      setEditingRole(null);
      invalidateRoles();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Enregistrement impossible')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/roles/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Rôle supprimé');
      setRoleToDelete(null);
      invalidateRoles();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Suppression impossible')),
  });

  const savePermsMutation = useMutation({
    mutationFn: async () => {
      if (!permRole) return;
      await api.post(`/roles/${permRole.id}/permissions`, {
        permissionIds: [...permSelection],
      });
    },
    onSuccess: () => {
      addToast('success', 'Permissions mises à jour');
      setPermRole(null);
      invalidateRoles();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Enregistrement impossible')),
  });

  const saveUserRolesMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/roles/users/${selectedUserId}/roles`, {
        roleIds: [...userRoleIds],
      });
    },
    onSuccess: () => {
      addToast('success', 'Rôles de l’utilisateur mis à jour');
      queryClient.invalidateQueries({ queryKey: ['user-roles', selectedUserId] });
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Enregistrement impossible')),
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/roles/seed-system');
      return res.data?.data;
    },
    onSuccess: () => {
      addToast('success', 'Rôles système initialisés');
      invalidateRoles();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Initialisation impossible')),
  });

  const openCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDescription('');
    setShowRoleModal(true);
  };

  const openEdit = (role: RoleItem) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setShowRoleModal(true);
  };

  const openPerms = (role: RoleItem) => {
    setPermRole(role);
    setPermSelection(new Set(rolePermissionIds(role)));
  };

  const togglePerm = (id: string) => {
    setPermSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectUser = (userId: string) => {
    setSelectedUserId(userId);
    setUserRoleIds(new Set());
  };

  const toggleUserRole = (id: string) => {
    setUserRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Pre-fill the assignment checkboxes once the current roles load.
  useEffect(() => {
    setUserRoleIds(new Set(assignedRoles.map((r) => r.id)));
  }, [assignedRoles]);

  if (!canManageRoles) {
    return (
      <PageTransition>
        <div className="card p-8 text-center">
          <ShieldCheck className="w-10 h-10 text-muted mx-auto mb-3" />
          <h1 className="text-xl font-bold text-text dark:text-gray-100">Accès non autorisé</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-2">
            Cette page est réservée aux rôles disposant de la permission « roles.view ».
          </p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Rôles et permissions</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {roles.length} rôle(s) — les rôles système sont verrouillés.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/app/reports" className="btn-secondary flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Journaux d’audit
            </Link>
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              {seedMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Initialiser le système
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nouveau rôle
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          {rolesLoading ? (
            <div className="p-4 space-y-3">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Permissions</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {roles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text dark:text-gray-200">{role.name}</p>
                      {role.description && (
                        <p className="text-xs text-muted dark:text-gray-400">{role.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', role.isSystem ? 'badge-info' : 'badge-success')}>
                        {role.isSystem ? 'Système' : 'Personnalisé'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                      {rolePermissionIds(role).length} permission(s)
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!role.isSystem && (
                          <>
                            <button
                              onClick={() => openEdit(role)}
                              className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Modifier
                            </button>
                            <button
                              onClick={() => openPerms(role)}
                              className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-1.5"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              Permissions
                            </button>
                            <button
                              onClick={() => setRoleToDelete(role)}
                              className="btn-danger !px-3 !py-1.5 text-sm flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Supprimer
                            </button>
                          </>
                        )}
                        {role.isSystem && (
                          <span className="text-xs text-muted dark:text-gray-500">Verrouillé</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted dark:text-gray-400">
                      Aucun rôle. Cliquez sur « Initialiser le système » pour créer les rôles par défaut.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-text dark:text-gray-100">
              Attribuer des rôles à un utilisateur
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Utilisateur
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => selectUser(e.target.value)}
                className="input-field"
              >
                <option value="">Sélectionner un utilisateur</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Rôles
              </span>
              {!selectedUserId ? (
                <p className="text-sm text-muted dark:text-gray-400">Sélectionnez d’abord un utilisateur.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roles.filter((r) => !r.isSystem).map((role) => (
                    <label
                      key={role.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors',
                        userRoleIds.has(role.id)
                          ? 'bg-primary-500/10 text-primary-500 border-primary-500/30'
                          : 'text-muted dark:text-gray-400 border-border dark:border-white/10'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={userRoleIds.has(role.id)}
                        onChange={() => toggleUserRole(role.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      {role.name}
                    </label>
                  ))}
                  {roles.filter((r) => !r.isSystem).length === 0 && (
                    <p className="text-sm text-muted dark:text-gray-400">Aucun rôle personnalisé.</p>
                  )}
                </div>
              )}
            </div>
          </div>
          {selectedUserId && (
            <div className="flex justify-end mt-4">
              <button
                onClick={() => saveUserRolesMutation.mutate()}
                disabled={saveUserRolesMutation.isPending}
                className="btn-primary disabled:opacity-50"
              >
                {saveUserRolesMutation.isPending ? 'Enregistrement…' : 'Enregistrer les rôles'}
              </button>
            </div>
          )}
        </div>

        <Modal
          isOpen={showRoleModal}
          onClose={() => { setShowRoleModal(false); setEditingRole(null); }}
          title={editingRole ? 'Modifier le rôle' : 'Nouveau rôle'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom</label>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                className="input-field"
                placeholder="Ex : Surveillant"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Description</label>
              <input
                type="text"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                className="input-field"
                placeholder="Description (optionnel)"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowRoleModal(false); setEditingRole(null); }} className="btn-ghost">
                Annuler
              </button>
              <button
                onClick={() => saveRoleMutation.mutate()}
                disabled={saveRoleMutation.isPending || !roleName.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {saveRoleMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={!!permRole}
          onClose={() => setPermRole(null)}
          title={permRole ? `Permissions — ${permRole.name}` : 'Permissions'}
          size="lg"
        >
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {catalogByModule.map(([module, perms]) => (
              <div key={module}>
                <p className="text-sm font-semibold text-text dark:text-gray-200 capitalize mb-2">{module}</p>
                <div className="flex flex-wrap gap-2">
                  {perms.map((p) => (
                    <label
                      key={p.id}
                      title={p.description}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors',
                        permSelection.has(p.id)
                          ? 'bg-primary-500/10 text-primary-500 border-primary-500/30'
                          : 'text-muted dark:text-gray-400 border-border dark:border-white/10'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={permSelection.has(p.id)}
                        onChange={() => togglePerm(p.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      {p.action}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {catalogByModule.length === 0 && (
              <p className="text-sm text-muted dark:text-gray-400">Catalogue vide.</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setPermRole(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => savePermsMutation.mutate()}
              disabled={savePermsMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {savePermsMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>

        <Modal
          isOpen={!!roleToDelete}
          onClose={() => setRoleToDelete(null)}
          title="Supprimer le rôle"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer le rôle{' '}
            <strong className="text-text dark:text-gray-200">{roleToDelete?.name}</strong> ?
            Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setRoleToDelete(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => roleToDelete && deleteMutation.mutate(roleToDelete.id)}
              disabled={deleteMutation.isPending}
              className="btn-danger disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
