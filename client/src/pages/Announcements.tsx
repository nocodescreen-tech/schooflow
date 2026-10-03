import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Calendar, Megaphone, Info, AlertTriangle, Check, Plus, Edit, Trash2, Search } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

type Audience = 'all' | 'teachers' | 'parents' | 'students' | 'staff';

interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: Audience;
  classId: string | null;
  publishedAt: string;
  expiresAt: string | null;
  author?: { id: string; name: string } | null;
  class?: { id: string; name: string } | null;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const audienceLabels: Record<Audience, string> = {
  all: 'Tous',
  teachers: 'Enseignants',
  parents: 'Parents',
  students: 'Élèves',
  staff: 'Personnel',
};

const audienceConfig: Record<Audience, { icon: typeof Info; color: string; badge: string }> = {
  all: { icon: Megaphone, color: 'bg-primary-500', badge: 'badge-info' },
  teachers: { icon: Info, color: 'bg-primary-500', badge: 'badge-info' },
  parents: { icon: Check, color: 'bg-success', badge: 'badge-success' },
  students: { icon: Info, color: 'bg-primary-500', badge: 'badge-info' },
  staff: { icon: AlertTriangle, color: 'bg-warning', badge: 'badge-warning' },
};

const emptyForm = { title: '', content: '', audience: 'all' as Audience, expiresAt: '' };

const isExpired = (a: Announcement) => !!a.expiresAt && new Date(a.expiresAt) < new Date();

export default function Announcements() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const [audienceFilter, setAudienceFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    window.clearTimeout((handleSearchChange as unknown as { timer?: number }).timer);
    (handleSearchChange as unknown as { timer?: number }).timer = window.setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
  };

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements', audienceFilter, debouncedSearch, includeExpired],
    queryFn: async (): Promise<Announcement[]> => {
      const res = await api.get('/announcements', {
        params: {
          ...(audienceFilter ? { audience: audienceFilter } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(includeExpired ? { includeExpired: 'true' } : {}),
        },
      });
      return (res.data?.data?.items ?? []) as Announcement[];
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['announcements'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        content: form.content,
        audience: form.audience,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        const res = await api.patch(`/announcements/${editing.id}`, payload);
        return res.data?.data?.announcement;
      }
      const res = await api.post('/announcements', payload);
      return res.data?.data?.announcement;
    },
    onSuccess: () => {
      addToast('success', editing ? 'Annonce modifiée avec succès' : 'Annonce publiée avec succès');
      invalidate();
      setShowModal(false);
      setEditing(null);
      setForm({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de l'enregistrement de l'annonce"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/announcements/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Annonce supprimée');
      invalidate();
      setDeleting(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de la suppression de l'annonce"));
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (ann: Announcement) => {
    setEditing(ann);
    setForm({
      title: ann.title,
      content: ann.content,
      audience: ann.audience,
      expiresAt: ann.expiresAt ? ann.expiresAt.slice(0, 16) : '',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const renderCard = (ann: Announcement, index: number) => {
    const config = audienceConfig[ann.audience] ?? audienceConfig.all;
    const Icon = config.icon;
    const expired = isExpired(ann);
    return (
      <motion.div
        key={ann.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.05, 0.5) }}
        className="card card-hover p-6"
      >
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 ${config.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold text-text dark:text-gray-100">{ann.title}</h3>
              <span className={cn('badge', config.badge)}>{audienceLabels[ann.audience]}</span>
              {expired && <span className="badge badge-danger">Expirée</span>}
            </div>
            <p className="text-sm text-muted dark:text-gray-400 whitespace-pre-line">{ann.content}</p>
            <p className="text-xs text-muted dark:text-gray-500 mt-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(ann.publishedAt)}
              {ann.author?.name && <span className="ml-1">• {ann.author.name}</span>}
              {ann.class?.name && <span className="ml-1">• {ann.class.name}</span>}
              {ann.expiresAt && <span className="ml-1">• Expire le {formatDate(ann.expiresAt)}</span>}
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => openEdit(ann)} className="btn-ghost text-xs flex items-center gap-1 px-2 py-1">
                <Edit className="w-3.5 h-3.5" />
                Modifier
              </button>
              <button onClick={() => setDeleting(ann)} className="btn-ghost text-xs flex items-center gap-1 px-2 py-1 text-danger">
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Annonces</h1>
            <p className="text-muted dark:text-gray-400 mt-1">Toutes les annonces de l'école</p>
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle annonce
          </button>
        </div>

        <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Rechercher une annonce..."
              className="input-field pl-9"
            />
          </div>
          <select
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            className="input-field md:w-52"
          >
            <option value="">Toutes les audiences</option>
            {(Object.keys(audienceLabels) as Audience[]).map((a) => (
              <option key={a} value={a}>{audienceLabels[a]}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted dark:text-gray-400 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={(e) => setIncludeExpired(e.target.checked)}
              className="rounded"
            />
            Inclure les expirées
          </label>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted dark:text-gray-400 uppercase tracking-wider">
            Toutes les annonces ({announcements.length})
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-40 rounded-2xl" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="card p-10 text-center">
              <Megaphone className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted dark:text-gray-400">Aucune annonce pour le moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {announcements.map((ann, index) => renderCard(ann, index))}
            </div>
          )}
        </div>

        <Modal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditing(null); }}
          title={editing ? "Modifier l'annonce" : 'Nouvelle annonce'}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Titre</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="input-field"
                placeholder="Titre de l'annonce"
                required
                maxLength={255}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Contenu</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                className="input-field min-h-28"
                placeholder="Contenu de l'annonce..."
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Audience</label>
                <select
                  value={form.audience}
                  onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value as Audience }))}
                  className="input-field"
                >
                  {(Object.keys(audienceLabels) as Audience[]).map((a) => (
                    <option key={a} value={a}>{audienceLabels[a]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Expire le (optionnel)</label>
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Publier'}
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={!!deleting}
          onClose={() => setDeleting(null)}
          title="Supprimer l'annonce"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer l'annonce « {deleting?.title} » ? Cette action est irréversible.
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
