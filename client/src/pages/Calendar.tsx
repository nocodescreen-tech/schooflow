import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Edit, Trash2, CalendarDays, LayoutList, Calendar as CalendarIcon } from 'lucide-react';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface CalEvent {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  startDate: string;
  endDate?: string | null;
  audience?: string | null;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const TYPES = ['rentree', 'vacances', 'examen', 'reunion', 'conseil', 'evaluation', 'pedagogique', 'autre'];
const typeLabels: Record<string, string> = {
  rentree: 'Rentrée', vacances: 'Vacances', examen: 'Examen', reunion: 'Réunion',
  conseil: 'Conseil', evaluation: 'Évaluation', pedagogique: 'Pédagogique', autre: 'Autre',
};
const typeBadge: Record<string, string> = {
  rentree: 'badge-success', vacances: 'badge-info', examen: 'badge-danger',
  reunion: 'badge-warning', conseil: 'badge-warning', evaluation: 'badge-info',
  pedagogique: 'badge-info', autre: '',
};

const emptyForm = { title: '', description: '', type: 'autre', startDate: '', endDate: '', audience: 'all' };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function Calendar() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'month'>('list');
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return monthKey(d);
  });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [deleting, setDeleting] = useState<CalEvent | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async (): Promise<CalEvent[]> => {
      const res = await api.get('/events', { params: { limit: 500 } });
      return (res.data?.data?.items ?? []) as CalEvent[];
    },
  });

  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [events]
  );

  const monthCells = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startDay = (first.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m - 1, d));
    return cells;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const d = new Date(e.startDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString().split('T')[0];
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKey(d));
  };

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }, [month]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['events'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        audience: form.audience.trim() || 'all',
      };
      if (editing) {
        const res = await api.patch(`/events/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/events', payload);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', editing ? 'Événement modifié avec succès' : 'Événement créé avec succès');
      invalidate();
      setShowModal(false);
      setEditing(null);
      setForm({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de l’enregistrement de l’événement'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/events/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Événement supprimé');
      invalidate();
      setDeleting(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Erreur lors de la suppression'));
    },
  });

  const toInputDate = (v?: string | null) => {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const openAdd = (day?: Date) => {
    setEditing(null);
    setForm({
      ...emptyForm,
      startDate: day ? day.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
  };

  const openEdit = (e: CalEvent) => {
    setEditing(e);
    setForm({
      title: e.title ?? '',
      description: e.description ?? '',
      type: e.type ?? 'autre',
      startDate: toInputDate(e.startDate),
      endDate: toInputDate(e.endDate),
      audience: e.audience ?? 'all',
    });
    setShowModal(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Calendrier scolaire</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {events.length} événement(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl">
              <button
                onClick={() => setView('list')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  view === 'list' ? 'bg-white dark:bg-white/10 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400'
                )}
              >
                <LayoutList className="w-4 h-4" /> Liste
              </button>
              <button
                onClick={() => setView('month')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  view === 'month' ? 'bg-white dark:bg-white/10 text-primary-500 shadow-sm' : 'text-muted dark:text-gray-400'
                )}
              >
                <CalendarIcon className="w-4 h-4" /> Mois
              </button>
            </div>
            <button onClick={() => openAdd()} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Nouvel événement
            </button>
          </div>
        </div>

        {view === 'month' && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => shiftMonth(-1)} className="btn-secondary !px-3 !py-1.5 text-sm">‹ Précédent</button>
              <h3 className="font-semibold text-text dark:text-gray-100 capitalize">{monthLabel}</h3>
              <button onClick={() => shiftMonth(1)} className="btn-secondary !px-3 !py-1.5 text-sm">Suivant ›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted dark:text-gray-400 mb-1">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((day, idx) => {
                if (!day) return <div key={`e${idx}`} className="min-h-[64px] rounded-lg" />;
                const key = day.toISOString().split('T')[0];
                const dayEvents = eventsByDay.get(key) ?? [];
                const isToday = new Date().toISOString().split('T')[0] === key;
                return (
                  <button
                    key={key}
                    onClick={() => openAdd(day)}
                    className={cn(
                      'min-h-[64px] rounded-lg border p-1 text-left align-top transition-colors',
                      isToday
                        ? 'border-primary-500 bg-primary-500/5'
                        : 'border-border dark:border-white/10 hover:border-primary-500/40'
                    )}
                  >
                    <span className={cn('text-xs font-semibold', isToday ? 'text-primary-500' : 'text-text dark:text-gray-300')}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-0.5 mt-0.5">
                      {dayEvents.slice(0, 2).map((e) => (
                        <p key={e.id} className="text-[10px] truncate px-1 rounded bg-primary-500/10 text-primary-500">
                          {e.title}
                        </p>
                      ))}
                      {dayEvents.length > 2 && (
                        <p className="text-[10px] text-muted dark:text-gray-400 px-1">+{dayEvents.length - 2}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'list' && (
          <div className="card overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="skeleton h-14 rounded-xl" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarDays className="w-10 h-10 text-muted mx-auto mb-3" />
                <p className="text-muted dark:text-gray-400">Aucun événement planifié</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Titre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Début</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Fin</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {sorted.map((e, index) => (
                    <motion.tr
                      key={e.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-text dark:text-gray-200">{e.title}</span>
                        {e.description && (
                          <p className="text-xs text-muted dark:text-gray-400 truncate max-w-[260px]">{e.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('badge', typeBadge[e.type] ?? '')}>{typeLabels[e.type] ?? e.type}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                        {e.startDate ? formatDate(e.startDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                        {e.endDate ? formatDate(e.endDate) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          items={[
                            { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(e) },
                            { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setDeleting(e) },
                          ]}
                        />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Modal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditing(null); }}
          title={editing ? 'Modifier l’événement' : 'Nouvel événement'}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Titre *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="input-field"
                placeholder="Conseil de classe T1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                {TYPES.map((t) => (
                  <option key={t} value={t}>{typeLabels[t]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Début *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Fin</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input-field min-h-[80px]"
                placeholder="Détails de l’événement..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Supprimer l’événement">
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer{' '}
            <strong className="text-text dark:text-gray-200">{deleting?.title}</strong> ?
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
