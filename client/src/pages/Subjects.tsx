import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Search, Edit, Trash2, BookOpen } from 'lucide-react';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import api from '../lib/api';

interface Subject {
  id: string;
  name: string;
  code?: string | null;
  coefficient?: number | null;
  department?: string | null;
  teacher?: { id: string; name: string } | null;
  class?: { id: string; name: string } | null;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const emptyForm = { name: '', code: '', coefficient: '1', department: '' };

export default function Subjects() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', search],
    queryFn: async (): Promise<Subject[]> => {
      const res = await api.get('/subjects', {
        params: search.trim() ? { search: search.trim() } : {},
      });
      return (res.data?.data?.items ?? []) as Subject[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['subjects'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        ...(form.code.trim() ? { code: form.code.trim() } : {}),
        coefficient: Number(form.coefficient) || 1,
        ...(form.department.trim() ? { department: form.department.trim() } : {}),
      };
      if (editing) {
        const res = await api.patch(`/subjects/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/subjects', payload);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', editing ? 'Matière modifiée avec succès' : 'Matière ajoutée avec succès');
      invalidate();
      setShowModal(false);
      setEditing(null);
      setForm({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de l’enregistrement de la matière'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/subjects/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Matière supprimée');
      invalidate();
      setDeleting(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de la suppression de la matière'));
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({
      name: s.name ?? '',
      code: s.code ?? '',
      coefficient: String(s.coefficient ?? 1),
      department: s.department ?? '',
    });
    setShowModal(true);
  };

  // Suggestions pour le champ Domaine/Département (saisie libre + existants).
  const departmentSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const s of subjects) {
      const d = (s.department ?? '').trim();
      if (d) seen.add(d);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [subjects]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Matières</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {subjects.length} matière(s) enregistrée(s)
            </p>
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Ajouter une matière
          </button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-11"
            placeholder="Rechercher une matière..."
          />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <div className="p-10 text-center">
              <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Aucune matière trouvée</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Coefficient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Département</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {subjects.map((s, index) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-text dark:text-gray-200">{s.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-info badge">{s.code ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text dark:text-gray-200">
                      {s.coefficient ?? 1}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                      {s.department ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        items={[
                          { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(s) },
                          { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setDeleting(s) },
                        ]}
                      />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Modal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditing(null); }}
          title={editing ? 'Modifier la matière' : 'Ajouter une matière'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          >
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-field"
                placeholder="Mathématiques"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Code</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="input-field"
                  placeholder="MATH"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Coefficient</label>
                <input
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={form.coefficient}
                  onChange={(e) => setForm((f) => ({ ...f, coefficient: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Département / Domaine</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="input-field"
                placeholder="Sciences"
                list="subject-department-suggestions"
              />
              <datalist id="subject-department-suggestions">
                {departmentSuggestions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Supprimer la matière">
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer{' '}
            <strong className="text-text dark:text-gray-200">{deleting?.name}</strong> ?
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
      </div>
    </PageTransition>
  );
}
