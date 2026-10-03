import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Users, BookOpen, User, MapPin, Clock, ChevronRight, Edit, Eye, Trash2 } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { getInitials } from '../lib/utils';
import api from '../lib/api';

interface ClassRoom {
  id: string;
  name: string;
  level?: string | null;
  section?: string | null;
  capacity: number;
  teacherId?: string | null;
  academicYear?: string | null;
  teacher?: { id: string; name: string } | null;
  students?: Array<{ id: string; firstName: string; lastName: string }>;
  subjects?: Array<{ id: string; name: string; code?: string | null }>;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const emptyForm = { name: '', level: '', section: '', capacity: '40', academicYear: '2025-2026' };

export default function Classes() {
  const { t } = useLanguageStore();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [deletingClass, setDeletingClass] = useState<ClassRoom | null>(null);
  const [newClass, setNewClass] = useState({ ...emptyForm });

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ['classes'],
    queryFn: async (): Promise<ClassRoom[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as ClassRoom[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (form: typeof emptyForm) => {
      const res = await api.post('/classes', {
        name: form.name,
        ...(form.level ? { level: form.level } : {}),
        ...(form.section ? { section: form.section } : {}),
        capacity: Number(form.capacity) || 40,
        ...(form.academicYear ? { academicYear: form.academicYear } : {}),
      });
      return res.data?.data?.class;
    },
    onSuccess: () => {
      addToast('success', 'Classe ajoutée avec succès');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setShowAddModal(false);
      setNewClass({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de l'ajout de la classe"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (form: typeof emptyForm) => {
      const res = await api.patch(`/classes/${editingClass!.id}`, {
        name: form.name,
        level: form.level || null,
        section: form.section || null,
        capacity: Number(form.capacity) || 40,
        academicYear: form.academicYear || null,
      });
      return res.data?.data?.class;
    },
    onSuccess: () => {
      addToast('success', 'Classe modifiée avec succès');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setShowAddModal(false);
      setEditingClass(null);
      setNewClass({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de la modification de la classe"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/classes/${id}`);
      return { id };
    },
    onSuccess: () => {
      addToast('success', 'Classe supprimée');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setDeletingClass(null);
      setSelectedClass(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de la suppression de la classe"));
    },
  });

  const openAdd = () => {
    setEditingClass(null);
    setNewClass({ ...emptyForm });
    setShowAddModal(true);
  };

  const openEdit = (cls: ClassRoom) => {
    setEditingClass(cls);
    setNewClass({
      name: cls.name ?? '',
      level: cls.level ?? '',
      section: cls.section ?? '',
      capacity: String(cls.capacity ?? 40),
      academicYear: cls.academicYear ?? '',
    });
    setSelectedClass(null);
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClass) {
      updateMutation.mutate(newClass);
    } else {
      addMutation.mutate(newClass);
    }
  };

  const isSaving = addMutation.isPending || updateMutation.isPending;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('classes.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{classes.length} classes actives</p>
          </div>
          <button
            onClick={openAdd}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('classes.addClass')}
          </button>
        </div>

        {/* Class Cards Grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <div className="card p-10 text-center">
            <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted dark:text-gray-400">Aucune classe pour le moment.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((cls, index) => {
              const studentCount = cls.students?.length ?? 0;
              const subjects = cls.subjects ?? [];
              return (
                <motion.div
                  key={cls.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedClass(cls)}
                  className="card card-hover p-6 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-primary-500/10 rounded-xl flex items-center justify-center">
                      <span className="text-lg font-bold text-primary-500">{cls.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <RowActions
                        items={[
                          { label: 'Voir', icon: <Eye className="w-4 h-4" />, onClick: () => setSelectedClass(cls) },
                          { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(cls) },
                          { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setDeletingClass(cls) },
                        ]}
                      />
                      <ChevronRight className="w-5 h-5 text-muted dark:text-gray-400" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-text dark:text-gray-100 mb-3">{cls.name}</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                      <User className="w-4 h-4" />
                      <span>{cls.teacher?.name ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                      <MapPin className="w-4 h-4" />
                      <span>{[cls.level, cls.section].filter(Boolean).join(' • ') || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                      <Users className="w-4 h-4" />
                      <span>{studentCount} élèves</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>{cls.academicYear ?? '—'}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {subjects.slice(0, 3).map((subject) => (
                      <span key={subject.id} className="badge-info badge text-xs">{subject.name}</span>
                    ))}
                    {subjects.length > 3 && (
                      <span className="badge text-xs bg-gray-100 dark:bg-white/10 text-muted dark:text-gray-400">+{subjects.length - 3}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Class Detail Modal */}
        <Modal
          isOpen={!!selectedClass}
          onClose={() => setSelectedClass(null)}
          title={selectedClass?.name || ''}
          size="lg"
        >
          {selectedClass && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Enseignant</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedClass.teacher?.name ?? '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Niveau / Section</p>
                  <p className="font-medium text-text dark:text-gray-200">{[selectedClass.level, selectedClass.section].filter(Boolean).join(' • ') || '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Élèves</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedClass.students?.length ?? 0}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Capacité</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedClass.capacity ?? '—'}</p>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-text dark:text-gray-200 mb-3">Matières</h4>
                {(selectedClass.subjects?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400">Aucune matière assignée.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedClass.subjects!.map((subject) => (
                      <span key={subject.id} className="badge-info badge">{subject.name}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-medium text-text dark:text-gray-200 mb-3">Élèves</h4>
                {(selectedClass.students?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400">Aucun élève dans cette classe.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedClass.students!.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors">
                        <div className="w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-primary-500">
                            {getInitials(s.firstName, s.lastName)}
                          </span>
                        </div>
                        <span className="text-sm text-text dark:text-gray-200">{s.firstName} {s.lastName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingClass(selectedClass)}
                  className="btn-ghost flex items-center gap-2 text-danger"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
                <button
                  onClick={() => openEdit(selectedClass)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Modifier
                </button>
                <button onClick={() => { setSelectedClass(null); navigate('/app/students'); }} className="btn-primary flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Voir les élèves
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Add/Edit Class Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => { setShowAddModal(false); setEditingClass(null); }}
          title={editingClass ? 'Modifier la classe' : t('classes.addClass')}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom de la classe</label>
              <input
                type="text"
                value={newClass.name}
                onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                className="input-field"
                placeholder="6ème C"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Niveau</label>
                <input
                  type="text"
                  value={newClass.level}
                  onChange={(e) => setNewClass((p) => ({ ...p, level: e.target.value }))}
                  className="input-field"
                  placeholder="6ème"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Section</label>
                <input
                  type="text"
                  value={newClass.section}
                  onChange={(e) => setNewClass((p) => ({ ...p, section: e.target.value }))}
                  className="input-field"
                  placeholder="A"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Capacité</label>
                <input
                  type="number"
                  min={1}
                  value={newClass.capacity}
                  onChange={(e) => setNewClass((p) => ({ ...p, capacity: e.target.value }))}
                  className="input-field"
                  placeholder="40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Année académique</label>
                <input
                  type="text"
                  value={newClass.academicYear}
                  onChange={(e) => setNewClass((p) => ({ ...p, academicYear: e.target.value }))}
                  className="input-field"
                  placeholder="2025-2026"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingClass(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Enregistrement...' : editingClass ? 'Enregistrer' : 'Ajouter la classe'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Delete confirmation Modal */}
        <Modal
          isOpen={!!deletingClass}
          onClose={() => setDeletingClass(null)}
          title="Supprimer la classe"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer la classe {deletingClass?.name} ? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setDeletingClass(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => deletingClass && deleteMutation.mutate(deletingClass.id)}
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
