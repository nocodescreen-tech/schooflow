import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  Archive,
  RotateCcw,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  X,
  RefreshCw,
  Loader2,
  CalendarCheck,
  ClipboardList,
} from 'lucide-react';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Active',
  closed: 'Clôturée',
  archived: 'Archivée',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'badge-warning',
  active: 'badge-success',
  closed: 'badge-info',
  archived: 'badge',
};

const formatDate = (date: string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
};

const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) => (
  <div className="card p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-text dark:text-gray-100">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${color} text-white`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
  </div>
);

export default function AcademicYearsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: years, isLoading, refetch } = useQuery({
    queryKey: ['academic-years', search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/academic-years', { params: { search: search || undefined, status: statusFilter || undefined } });
      return res.data?.data?.items ?? [];
    },
  });

  const { data: activeYear } = useQuery({
    queryKey: ['academic-year-active'],
    queryFn: async () => {
      const res = await api.get('/academic-years/active');
      return res.data?.data?.academicYear;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/academic-years', data);
      return res.data?.data?.academicYear;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire créée');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Création impossible'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ name: string; startDate: string; endDate: string; description: string; status: string }> }) => {
      const res = await api.patch(`/academic-years/${id}`, data);
      return res.data?.data?.academicYear;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire mise à jour');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Mise à jour impossible'),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/academic-years/${id}/activate`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire activée');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Activation impossible'),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/academic-years/${id}/close`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire close');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Impossible de clore'),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/academic-years/${id}/archive`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire archivée');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Archivage impossible'),
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/academic-years/${id}/unarchive`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire désarchivée');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Désarchivage impossible'),
  });

  const initialFormData = {
    name: '',
    startDate: new Date(new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0), 8, 1).toISOString().split('T')[0],
    endDate: new Date(new Date().getFullYear() + (new Date().getMonth() >= 8 ? 2 : 1), 7, 31).toISOString().split('T')[0],
    description: '',
  };

  const openCreateModal = () => {
    setFormData(initialFormData);
    setErrors({});
    setEditingYear(null);
    setShowCreateModal(true);
  };

  const openEditModal = (year: AcademicYear) => {
    setFormData({
      name: year.name,
      startDate: year.startDate?.split('T')[0] || '',
      endDate: year.endDate?.split('T')[0] || '',
      description: year.description || '',
    });
    setEditingYear(year);
    setShowCreateModal(true);
  };

  const handleInputChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Le nom est requis';
    if (!formData.startDate) newErrors.startDate = 'Date de début requise';
    if (!formData.endDate) newErrors.endDate = 'Date de fin requise';
    if (formData.startDate && formData.endDate && new Date(formData.endDate) <= new Date(formData.startDate)) {
      newErrors.endDate = 'La date de fin doit être après la date de début';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (editingYear) {
        await updateMutation.mutateAsync({ id: editingYear.id, data: formData });
        setEditingYear(null);
      } else {
        await createMutation.mutateAsync({ ...formData });
      }
      setShowCreateModal(false);
      setFormData(initialFormData);
    } catch (err) {
      // handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (year: AcademicYear) => setDeleteConfirm({ id: year.id, name: year.name });
  const cancelDelete = () => setDeleteConfirm(null);
  const executeDelete = () => {
    if (deleteConfirm) {
      archiveMutation.mutate(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Années scolaires</h1>
            <p className="text-muted dark:text-gray-400 mt-1">Gérez les années scolaires de votre établissement</p>
          </div>
          <div className="flex gap-2">
            <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle année
            </button>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['academic-years'] })}
              disabled={false}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
          </div>
        </div>

        {/* Config preview */}
        {activeYear && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800"
          >
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-primary-500" />
              <span className="font-semibold text-text dark:text-gray-100">Année active</span>
              <span className="badge badge-success ml-2">Active</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted dark:text-gray-400">Année active</span>
                <span className="block font-medium">{activeYear.name}</span>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Période</span>
                <span className="block font-medium capitalize">
                  {new Date(activeYear.startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} →{' '}
                  {new Date(activeYear.endDate).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Statut</span>
                <span className="block font-medium capitalize">{activeYear.status}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard title="Total années" value={years?.length ?? 0} icon={Calendar} color="bg-primary-500" />
            <StatCard title="Actives" value={years?.filter((y: AcademicYear) => y.status === 'active').length ?? 0} icon={CalendarCheck} color="bg-success" />
            <StatCard title="Brouillons" value={years?.filter((y: AcademicYear) => y.status === 'draft').length ?? 0} icon={ClipboardList} color="bg-warning" />
            <StatCard title="Archivées" value={years?.filter((y: AcademicYear) => y.status === 'archived').length ?? 0} icon={Archive} color="bg-gray-500" />
          </div>
        </motion.div>

        {/* Filters & Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text dark:text-gray-100">
              Années scolaires ({years?.length ?? 0})
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter || ''}
                onChange={(e) => setStatusFilter(e.target.value || null)}
                className="input-field !w-auto"
              >
                <option value="">Tous les statuts</option>
                <option value="draft">Brouillon</option>
                <option value="active">Active</option>
                <option value="closed">Clôturée</option>
                <option value="archived">Archivée</option>
              </select>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['academic-years'] })}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Actualiser
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field !w-auto sm:w-64"
            />
            <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle année
            </button>
          </div>

          {/* Years list */}
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24 rounded-xl" />
              ))}
            </div>
          ) : years?.length === 0 ? (
            <div className="card p-12 text-center">
              <Calendar className="w-12 h-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text dark:text-gray-200 mb-2">Aucune année scolaire</h3>
              <p className="text-muted dark:text-gray-400 mb-4">Créez votre première année scolaire</p>
              <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Créer la première
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {years
                .filter((y: AcademicYear) => !statusFilter || y.status === statusFilter)
                .filter((y: AcademicYear) => y.name.toLowerCase().includes(search.toLowerCase()))
                .map((year: AcademicYear) => (
                  <motion.div
                    key={year.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="card overflow-hidden group"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-text dark:text-gray-200 truncate">{year.name}</span>
                            <span className={`badge ${STATUS_COLOR[year.status]}`}>{STATUS_LABEL[year.status]}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-400 mt-1">
                            <span>
                              {new Date(year.startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} →{' '}
                              {new Date(year.endDate).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-end gap-2 ml-auto">
                          <button
                            onClick={() => navigate(`/academic-years/${year.id}/periods`)}
                            className="btn-ghost text-xs px-3 py-1.5"
                          >
                            Périodes
                          </button>
                          <button
                            onClick={() => openEditModal(year)}
                            className="btn-icon hover:!text-primary-500"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {year.status === 'active' ? (
                            <button
                              onClick={() => closeMutation.mutate(year.id)}
                              disabled={closeMutation.isPending}
                              className="btn-secondary !px-3 !py-1.5 text-sm"
                            >
                              <Clock className="w-4 h-4" /> Clore
                            </button>
                          ) : year.status === 'draft' ? (
                            <button
                              onClick={() => activateMutation.mutate(year.id)}
                              disabled={activateMutation.isPending}
                              className="btn-primary !px-3 !py-1.5 text-sm"
                            >
                              Activer
                            </button>
                          ) : year.status === 'archived' ? (
                            <button
                              onClick={() => unarchiveMutation.mutate(year.id)}
                              disabled={unarchiveMutation.isPending}
                              className="btn-secondary !px-3 !py-1.5 text-sm"
                            >
                              Désarchiver
                            </button>
                          ) : (
                            <button
                              onClick={() => closeMutation.mutate(year.id)}
                              disabled={closeMutation.isPending}
                              className="btn-secondary !px-3 !py-1.5 text-sm"
                            >
                              <Clock className="w-3 h-3" /> Clore
                            </button>
                          )}
                          <button
                            onClick={() => confirmDelete(year)}
                            className="btn-icon hover:!text-danger"
                            title="Archiver"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text dark:text-gray-100">
                  {editingYear ? "Modifier l'année scolaire" : 'Nouvelle année scolaire'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData(initialFormData);
                    setEditingYear(null);
                    setErrors({});
                  }}
                  className="btn-icon hover:!text-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Nom de l'année *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`input-field ${errors.name ? '!border-danger' : ''}`}
                    placeholder="Ex: 2025-2026"
                  />
                  {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                      Date de début *
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      className={`input-field ${errors.startDate ? '!border-danger' : ''}`}
                      required
                    />
                    {errors.startDate && <p className="text-xs text-danger mt-1">{errors.startDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                      Date de fin *
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleInputChange('endDate', e.target.value)}
                      className={`input-field ${errors.endDate ? '!border-danger' : ''}`}
                      required
                    />
                    {errors.endDate && <p className="text-xs text-danger mt-1">{errors.endDate}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="input-field"
                      rows={3}
                      placeholder="Description optionnelle..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setFormData(initialFormData);
                      setEditingYear(null);
                      setErrors({});
                    }}
                    className="btn-secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingYear ? 'Mettre à jour' : 'Créer'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-danger" />
              <h3 className="text-lg font-bold text-text dark:text-gray-100">Archiver l'année scolaire ?</h3>
            </div>
            <p className="text-sm text-muted dark:text-gray-400 mb-6">
              Cette action est irréversible. L'année <strong>{deleteConfirm.name}</strong> sera archivée.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelDelete} className="btn-secondary">
                Annuler
              </button>
              <button onClick={executeDelete} className="btn-danger flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Archiver
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}