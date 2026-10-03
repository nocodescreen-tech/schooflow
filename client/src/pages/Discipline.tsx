import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Search, Edit, Trash2, ShieldAlert, Eye, Lock } from 'lucide-react';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface IncidentStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
}

interface Incident {
  id: string;
  studentId: string;
  type: string;
  description?: string | null;
  date: string;
  severity: string;
  status: string;
  student?: IncidentStudent | null;
}

interface Sanction {
  id: string;
  sanction: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface Convocation {
  id: string;
  studentId: string;
  parentId?: string | null;
  date: string;
  reason?: string | null;
  status: string;
  student?: IncidentStudent | null;
  parent?: { id: string; firstName: string; lastName: string } | null;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const TYPES = ['absence', 'retard', 'perturbation', 'violence', 'tricherie', 'autre'];
const SEVERITIES = ['faible', 'moyenne', 'grave'];
const STATUSES = ['ouvert', 'examen', 'decide', 'clos'];
const NEXT_STATUS: Record<string, string | null> = {
  ouvert: 'examen',
  examen: 'decide',
  decide: 'clos',
  clos: null,
};
const CONV_STATUSES = ['envoyee', 'confirmee', 'terminee'];

const typeLabels: Record<string, string> = {
  absence: 'Absence', retard: 'Retard', perturbation: 'Perturbation',
  violence: 'Violence', tricherie: 'Tricherie', autre: 'Autre',
};
const severityLabels: Record<string, string> = {
  faible: 'Faible', moyenne: 'Moyenne', grave: 'Grave',
};
const statusLabels: Record<string, string> = {
  ouvert: 'Ouvert', examen: 'En examen', decide: 'Décidé', clos: 'Clos',
};
const convStatusLabels: Record<string, string> = {
  envoyee: 'Envoyée', confirmee: 'Confirmée', terminee: 'Terminée',
};

const severityBadge = (s: string) =>
  s === 'grave' ? 'badge-danger' : s === 'moyenne' ? 'badge-warning' : 'badge-info';
const statusBadge = (s: string) =>
  s === 'clos' ? 'badge-success' : s === 'ouvert' ? 'badge-danger' : 'badge-warning';

const emptyForm = { studentId: '', type: 'absence', severity: 'faible', description: '', date: '' };
const emptySanction = { sanction: '', startDate: '', endDate: '' };
const emptyConv = { studentId: '', date: '', reason: '' };

export default function Discipline() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'incidents' | 'convocations'>('incidents');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [deleting, setDeleting] = useState<Incident | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [sanctionFor, setSanctionFor] = useState<Incident | null>(null);
  const [sanctionForm, setSanctionForm] = useState({ ...emptySanction });
  const [showConvModal, setShowConvModal] = useState(false);
  const [convForm, setConvForm] = useState({ ...emptyConv });

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', statusFilter],
    queryFn: async (): Promise<Incident[]> => {
      const res = await api.get('/incidents', {
        params: statusFilter !== 'all' ? { status: statusFilter } : {},
      });
      return (res.data?.data?.items ?? []) as Incident[];
    },
    enabled: activeTab === 'incidents',
  });

  const { data: convocations = [], isLoading: convLoading } = useQuery({
    queryKey: ['convocations'],
    queryFn: async (): Promise<Convocation[]> => {
      const res = await api.get('/convocations');
      return (res.data?.data?.items ?? []) as Convocation[];
    },
    enabled: activeTab === 'convocations',
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: async (): Promise<StudentOption[]> => {
      const res = await api.get('/students', { params: { limit: 500 } });
      return (res.data?.data?.items ?? []) as StudentOption[];
    },
  });

  const sanctionIncidentId = sanctionFor?.id;
  const { data: sanctions = [] } = useQuery({
    queryKey: ['sanctions', sanctionIncidentId],
    queryFn: async (): Promise<Sanction[]> => {
      const res = await api.get(`/incidents/${sanctionIncidentId}/sanctions`);
      return (res.data?.data?.items ?? []) as Sanction[];
    },
    enabled: !!sanctionIncidentId,
  });

  const studentName = (s?: IncidentStudent | null) =>
    s ? `${s.firstName} ${s.lastName}` : '—';

  const filteredIncidents = incidents.filter((i) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return studentName(i.student).toLowerCase().includes(q) ||
      (i.description ?? '').toLowerCase().includes(q);
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        studentId: form.studentId,
        type: form.type,
        severity: form.severity,
        description: form.description.trim() || undefined,
        date: form.date || undefined,
      };
      if (editing) {
        const res = await api.patch(`/incidents/${editing.id}`, {
          type: form.type, severity: form.severity,
          description: form.description.trim(), date: form.date || undefined,
        });
        return res.data;
      }
      const res = await api.post('/incidents', payload);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', editing ? 'Incident modifié avec succès' : 'Incident signalé avec succès');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowModal(false);
      setEditing(null);
      setForm({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de l’enregistrement de l’incident'));
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/incidents/${id}`, { status });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Statut mis à jour');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Mise à jour impossible'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/incidents/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Incident supprimé');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setDeleting(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de la suppression'));
    },
  });

  const sanctionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/incidents/${sanctionIncidentId}/sanctions`, {
        sanction: sanctionForm.sanction.trim(),
        startDate: sanctionForm.startDate || undefined,
        endDate: sanctionForm.endDate || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Sanction enregistrée');
      queryClient.invalidateQueries({ queryKey: ['sanctions'] });
      setSanctionForm({ ...emptySanction });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de l’enregistrement de la sanction'));
    },
  });

  const convMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/convocations', {
        studentId: convForm.studentId,
        date: convForm.date,
        reason: convForm.reason.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Convocation créée');
      queryClient.invalidateQueries({ queryKey: ['convocations'] });
      setShowConvModal(false);
      setConvForm({ ...emptyConv });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de la création de la convocation'));
    },
  });

  const convStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/convocations/${id}`, { status });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Convocation mise à jour');
      queryClient.invalidateQueries({ queryKey: ['convocations'] });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Mise à jour impossible'));
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = (i: Incident) => {
    setEditing(i);
    setForm({
      studentId: i.studentId,
      type: i.type,
      severity: i.severity,
      description: i.description ?? '',
      date: i.date ? new Date(i.date).toISOString().split('T')[0] : '',
    });
    setShowModal(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Discipline</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              Incidents, sanctions et convocations
            </p>
          </div>
          <button
            onClick={() => (activeTab === 'incidents' ? openAdd() : setShowConvModal(true))}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {activeTab === 'incidents' ? 'Signaler un incident' : 'Nouvelle convocation'}
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300 flex items-start gap-2.5">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Confidentiel</strong> — ces dossiers ne sont visibles que par la direction,
            l’administration et le préfet de discipline.
          </span>
        </div>

        <div className="flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl w-fit">
          {(
            [
              { id: 'incidents', label: 'Incidents' },
              { id: 'convocations', label: 'Convocations' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 text-primary-500 shadow-sm'
                  : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-gray-200'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'incidents' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-md flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-11"
                  placeholder="Rechercher un élève..."
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field w-auto"
              >
                <option value="all">Tous les statuts</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
            </div>

            <div className="card overflow-hidden">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array(5).fill(0).map((_, i) => (
                    <div key={i} className="skeleton h-14 rounded-xl" />
                  ))}
                </div>
              ) : filteredIncidents.length === 0 ? (
                <div className="p-10 text-center">
                  <ShieldAlert className="w-10 h-10 text-muted mx-auto mb-3" />
                  <p className="text-muted dark:text-gray-400">Aucun incident trouvé</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Gravité</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {filteredIncidents.map((i, index) => {
                      const next = NEXT_STATUS[i.status];
                      return (
                        <motion.tr
                          key={i.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.03 }}
                          className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-text dark:text-gray-200">{studentName(i.student)}</span>
                            {i.description && (
                              <p className="text-xs text-muted dark:text-gray-400 truncate max-w-[240px]">{i.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="badge-info badge">{typeLabels[i.type] ?? i.type}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('badge', severityBadge(i.severity))}>{severityLabels[i.severity] ?? i.severity}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                            {i.date ? formatDate(i.date) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('badge', statusBadge(i.status))}>{statusLabels[i.status] ?? i.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <RowActions
                              items={[
                                { label: 'Sanctions', icon: <Eye className="w-4 h-4" />, onClick: () => setSanctionFor(i) },
                                { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(i) },
                                ...(next
                                  ? [{ label: `Avancer → ${statusLabels[next]}`, icon: <ShieldAlert className="w-4 h-4" />, onClick: () => statusMutation.mutate({ id: i.id, status: next }) }]
                                  : []),
                                { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setDeleting(i) },
                              ]}
                            />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'convocations' && (
          <div className="card overflow-hidden">
            {convLoading ? (
              <div className="p-4 space-y-3">
                {Array(4).fill(0).map((_, i) => (
                  <div key={i} className="skeleton h-14 rounded-xl" />
                ))}
              </div>
            ) : convocations.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted dark:text-gray-400">Aucune convocation</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Motif</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {convocations.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{studentName(c.student)}</td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{c.reason ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{c.date ? formatDate(c.date) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className="badge badge-info">{convStatusLabels[c.status] ?? c.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.status}
                          onChange={(e) => convStatusMutation.mutate({ id: c.id, status: e.target.value })}
                          className="input-field !w-auto !py-1.5 text-sm"
                          aria-label="Statut de la convocation"
                        >
                          {CONV_STATUSES.map((s) => (
                            <option key={s} value={s}>{convStatusLabels[s]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Modal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditing(null); }}
          title={editing ? 'Modifier l’incident' : 'Signaler un incident'}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève *</label>
              <select
                value={form.studentId}
                onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                className="input-field"
                required
                disabled={!!editing}
              >
                <option value="">Sélectionner un élève</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentId})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{typeLabels[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Gravité</label>
                <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className="input-field">
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{severityLabels[s]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input-field min-h-[90px]"
                placeholder="Décrire les faits..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Signaler'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Supprimer l’incident">
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer cet incident de{' '}
            <strong className="text-text dark:text-gray-200">{studentName(deleting?.student)}</strong> ?
            Les sanctions associées seront également supprimées.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setDeleting(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="btn-danger"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </button>
          </div>
        </Modal>

        <Drawer
          isOpen={!!sanctionFor}
          onClose={() => setSanctionFor(null)}
          title="Sanctions"
          description={sanctionFor ? studentName(sanctionFor.student) : undefined}
        >
          <div className="space-y-5">
            {sanctions.length === 0 ? (
              <p className="text-sm text-muted dark:text-gray-400 text-center py-4">Aucune sanction prononcée</p>
            ) : (
              <div className="space-y-2">
                {sanctions.map((s) => (
                  <div key={s.id} className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                    <p className="text-sm font-medium text-text dark:text-gray-200">{s.sanction}</p>
                    <p className="text-xs text-muted dark:text-gray-400 mt-1">
                      {s.startDate ? formatDate(s.startDate) : '—'}
                      {s.endDate ? ` → ${formatDate(s.endDate)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="divider" />
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); sanctionMutation.mutate(); }}
            >
              <h3 className="font-semibold text-text dark:text-gray-100">Prononcer une sanction</h3>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Sanction *</label>
                <input
                  type="text"
                  value={sanctionForm.sanction}
                  onChange={(e) => setSanctionForm((f) => ({ ...f, sanction: e.target.value }))}
                  className="input-field"
                  placeholder="Ex : Retenue de 2h"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Début</label>
                  <input
                    type="date"
                    value={sanctionForm.startDate}
                    onChange={(e) => setSanctionForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Fin</label>
                  <input
                    type="date"
                    value={sanctionForm.endDate}
                    onChange={(e) => setSanctionForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="input-field"
                  />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full" disabled={sanctionMutation.isPending}>
                {sanctionMutation.isPending ? 'Enregistrement...' : 'Enregistrer la sanction'}
              </button>
            </form>
          </div>
        </Drawer>

        <Modal isOpen={showConvModal} onClose={() => setShowConvModal(false)} title="Nouvelle convocation">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); convMutation.mutate(); }}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève *</label>
              <select
                value={convForm.studentId}
                onChange={(e) => setConvForm((f) => ({ ...f, studentId: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Sélectionner un élève</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date *</label>
              <input
                type="datetime-local"
                value={convForm.date}
                onChange={(e) => setConvForm((f) => ({ ...f, date: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Motif</label>
              <textarea
                value={convForm.reason}
                onChange={(e) => setConvForm((f) => ({ ...f, reason: e.target.value }))}
                className="input-field min-h-[80px]"
                placeholder="Motif de la convocation..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowConvModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={convMutation.isPending}>
                {convMutation.isPending ? 'Enregistrement...' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </PageTransition>
  );
}
