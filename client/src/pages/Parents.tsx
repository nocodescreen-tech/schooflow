import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Plus,
  Search,
  Phone,
  Mail,
  Eye,
  Edit,
  Trash2,
  Link2,
  Unlink,
  Users,
  MapPin,
  Briefcase,
} from 'lucide-react';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { getInitials } from '../lib/utils';
import api from '../lib/api';

interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  profession?: string | null;
  childrenCount?: number;
}

interface ParentChild {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
  class?: string | { id: string; name: string } | null;
  relation?: string | null;
  isPrimaryContact?: boolean;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

type ApiError = { response?: { data?: { error?: string }; status?: number } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;
const isNotFound = (err: unknown) => (err as ApiError)?.response?.status === 404;

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  address: '',
  profession: '',
};

const emptyLink = {
  studentId: '',
  relation: 'père',
  isPrimaryContact: false,
  emergencyContact: false,
};

const RELATIONS = ['père', 'mère', 'tuteur'];

const fetchParents = async (search: string): Promise<Parent[]> => {
  try {
    const res = await api.get('/parents', {
      params: search.trim() ? { search: search.trim() } : {},
    });
    return (res.data?.data?.items ?? []) as Parent[];
  } catch (err) {
    // Backend route may not be deployed yet — degrade to an empty list.
    if (isNotFound(err)) return [];
    throw err;
  }
};

const fetchParentDetail = async (
  id: string
): Promise<{ parent: Parent; children: ParentChild[] }> => {
  const res = await api.get(`/parents/${id}`);
  const d = res.data?.data ?? {};
  return {
    parent: d.parent as Parent,
    children: (d.children ?? []) as ParentChild[],
  };
};

const fetchStudentOptions = async (): Promise<StudentOption[]> => {
  const res = await api.get('/students', { params: { limit: 500 } });
  return (res.data?.data?.items ?? []) as StudentOption[];
};

const childClassName = (c: ParentChild['class']): string => {
  if (!c) return '—';
  if (typeof c === 'string') return c || '—';
  return c.name ?? '—';
};

export default function Parents() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingParent, setEditingParent] = useState<Parent | null>(null);
  const [deletingParent, setDeletingParent] = useState<Parent | null>(null);
  const [detailParent, setDetailParent] = useState<Parent | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [linkForm, setLinkForm] = useState({ ...emptyLink });

  const { data: parents = [], isLoading } = useQuery({
    queryKey: ['parents', search],
    queryFn: () => fetchParents(search),
  });

  const detailId = detailParent?.id;
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['parent-detail', detailId],
    queryFn: () => fetchParentDetail(detailId!),
    enabled: !!detailId,
  });

  const { data: studentOptions = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: fetchStudentOptions,
    enabled: !!detailId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['parents'] });
    queryClient.invalidateQueries({ queryKey: ['parent-detail'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(form.profession.trim() ? { profession: form.profession.trim() } : {}),
      };
      if (editingParent) {
        const res = await api.patch(`/parents/${editingParent.id}`, payload);
        return res.data;
      }
      const res = await api.post('/parents', payload);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', editingParent ? 'Parent modifié avec succès' : 'Parent ajouté avec succès');
      invalidate();
      setShowFormModal(false);
      setEditingParent(null);
      setForm({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de l’enregistrement du parent'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/parents/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Parent supprimé');
      invalidate();
      setDeletingParent(null);
      if (detailParent && deletingParent && detailParent.id === deletingParent.id) {
        setDetailParent(null);
      }
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de la suppression du parent'));
    },
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/parents/${detailId}/children`, {
        studentId: linkForm.studentId,
        relation: linkForm.relation,
        isPrimaryContact: linkForm.isPrimaryContact,
        emergencyContact: linkForm.emergencyContact,
      });
      return r.data;
    },
    onSuccess: () => {
      addToast('success', 'Élève rattaché avec succès');
      invalidate();
      setLinkForm({ ...emptyLink });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors du rattachement de l’élève'));
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (studentId: string) => {
      await api.delete(`/parents/${detailId}/children/${studentId}`);
    },
    onSuccess: () => {
      addToast('success', 'Élève détaché');
      invalidate();
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors du détachement de l’élève'));
    },
  });

  const openAdd = () => {
    setEditingParent(null);
    setForm({ ...emptyForm });
    setShowFormModal(true);
  };

  const openEdit = (p: Parent) => {
    setEditingParent(p);
    setForm({
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      profession: p.profession ?? '',
    });
    setShowFormModal(true);
  };

  const openDetail = (p: Parent) => {
    setLinkForm({ ...emptyLink });
    setDetailParent(p);
  };

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkForm.studentId) {
      addToast('error', 'Sélectionnez un élève');
      return;
    }
    linkMutation.mutate();
  };

  const isSaving = saveMutation.isPending;
  const linkedIds = new Set((detail?.children ?? []).map((c) => c.id));
  const availableStudents = studentOptions.filter((s) => !linkedIds.has(s.id));

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Parents</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {parents.length} parent(s) enregistré(s)
            </p>
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Ajouter un parent
          </button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-11"
            placeholder="Rechercher un parent..."
          />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="skeleton h-14 rounded-xl" />
                ))}
            </div>
          ) : parents.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Aucun parent trouvé</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                    Téléphone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                    Enfants
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {parents.map((p, index) => (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => openDetail(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary-500">
                            {getInitials(p.firstName, p.lastName)}
                          </span>
                        </div>
                        <p className="font-medium text-text dark:text-gray-200">
                          {p.firstName} {p.lastName}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-muted dark:text-gray-400">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="text-sm">{p.phone ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-muted dark:text-gray-400">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="text-sm">{p.email ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-info badge">{p.childrenCount ?? 0}</span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        items={[
                          { label: 'Voir', icon: <Eye className="w-4 h-4" />, onClick: () => openDetail(p) },
                          { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(p) },
                          {
                            label: 'Supprimer',
                            icon: <Trash2 className="w-4 h-4" />,
                            danger: true,
                            onClick: () => setDeletingParent(p),
                          },
                        ]}
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create / Edit modal */}
        <Modal
          isOpen={showFormModal}
          onClose={() => {
            setShowFormModal(false);
            setEditingParent(null);
          }}
          title={editingParent ? 'Modifier le parent' : 'Ajouter un parent'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Prénom
                </label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="input-field"
                  placeholder="Aminata"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Nom
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="input-field"
                  placeholder="Diallo"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input-field"
                  placeholder="+224 6 XX XX XX XX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="input-field"
                  placeholder="parent@email.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Adresse
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="input-field"
                placeholder="Quartier, ville"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Profession
              </label>
              <input
                type="text"
                value={form.profession}
                onChange={(e) => setForm((f) => ({ ...f, profession: e.target.value }))}
                className="input-field"
                placeholder="Commerçante"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowFormModal(false);
                  setEditingParent(null);
                }}
                className="btn-ghost"
              >
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Enregistrement...' : editingParent ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Delete confirm modal */}
        <Modal isOpen={!!deletingParent} onClose={() => setDeletingParent(null)} title="Supprimer le parent">
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer{' '}
            <strong className="text-text dark:text-gray-200">
              {deletingParent?.firstName} {deletingParent?.lastName}
            </strong>{' '}
            ? Les liens vers ses enfants seront également retirés.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setDeletingParent(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => deletingParent && deleteMutation.mutate(deletingParent.id)}
              className="btn-danger"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </button>
          </div>
        </Modal>

        {/* Detail drawer */}
        <Drawer
          isOpen={!!detailParent}
          onClose={() => setDetailParent(null)}
          title={detailParent ? `${detailParent.firstName} ${detailParent.lastName}` : undefined}
          description="Détail du parent et enfants rattachés"
          width="w-full max-w-lg"
        >
          {detailLoading ? (
            <div className="space-y-3">
              {Array(3)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-xl" />
                ))}
            </div>
          ) : !detail ? (
            <p className="text-sm text-muted dark:text-gray-400 text-center py-6">
              Impossible de charger le détail
            </p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2 text-sm">
                {detail.parent.phone && (
                  <p className="flex items-center gap-2 text-text dark:text-gray-200">
                    <Phone className="w-4 h-4 text-muted" /> {detail.parent.phone}
                  </p>
                )}
                {detail.parent.email && (
                  <p className="flex items-center gap-2 text-text dark:text-gray-200">
                    <Mail className="w-4 h-4 text-muted" /> {detail.parent.email}
                  </p>
                )}
                {detail.parent.address && (
                  <p className="flex items-center gap-2 text-text dark:text-gray-200">
                    <MapPin className="w-4 h-4 text-muted" /> {detail.parent.address}
                  </p>
                )}
                {detail.parent.profession && (
                  <p className="flex items-center gap-2 text-text dark:text-gray-200">
                    <Briefcase className="w-4 h-4 text-muted" /> {detail.parent.profession}
                  </p>
                )}
              </div>

              <div className="divider" />

              <div>
                <h3 className="font-semibold text-text dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary-500" />
                  Enfants rattachés ({detail.children.length})
                </h3>
                {detail.children.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-4">
                    Aucun enfant rattaché
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detail.children.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary-500">
                              {getInitials(c.firstName, c.lastName)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-text dark:text-gray-200">
                              {c.firstName} {c.lastName}
                            </p>
                            <p className="text-xs text-muted dark:text-gray-400">
                              {c.studentId ?? ''} · {childClassName(c.class)}
                              {c.relation ? ` · ${c.relation}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.isPrimaryContact && <span className="badge-success badge">Principal</span>}
                          <button
                            onClick={() => unlinkMutation.mutate(c.studentId ?? c.id)}
                            disabled={unlinkMutation.isPending}
                            className="btn-icon tooltip"
                            data-tip="Détacher"
                            aria-label="Détacher l’élève"
                          >
                            <Unlink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="divider" />

              <form onSubmit={handleLink} className="space-y-4">
                <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary-500" />
                  Rattacher un élève
                </h3>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Élève
                  </label>
                  <select
                    value={linkForm.studentId}
                    onChange={(e) => setLinkForm((f) => ({ ...f, studentId: e.target.value }))}
                    className="input-field"
                    required
                  >
                    <option value="">Sélectionner un élève</option>
                    {availableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.studentId})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Lien de parenté
                  </label>
                  <select
                    value={linkForm.relation}
                    onChange={(e) => setLinkForm((f) => ({ ...f, relation: e.target.value }))}
                    className="input-field"
                  >
                    {RELATIONS.map((r) => (
                      <option key={r} value={r}>
                        {r === 'père' ? 'Père' : r === 'mère' ? 'Mère' : 'Tuteur'}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={linkForm.isPrimaryContact}
                    onChange={(e) => setLinkForm((f) => ({ ...f, isPrimaryContact: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                  />
                  Contact principal
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={linkForm.emergencyContact}
                    onChange={(e) => setLinkForm((f) => ({ ...f, emergencyContact: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary-500 focus:ring-primary-500"
                  />
                  Contact d’urgence
                </label>
                <button type="submit" className="btn-primary w-full" disabled={linkMutation.isPending}>
                  {linkMutation.isPending ? 'Rattachement...' : 'Rattacher l’élève'}
                </button>
              </form>
            </div>
          )}
        </Drawer>
      </div>
    </PageTransition>
  );
}
