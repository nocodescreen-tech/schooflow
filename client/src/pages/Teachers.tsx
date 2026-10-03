import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Mail, Phone, BookOpen, Users, Edit, Eye, Trash2 } from 'lucide-react';
import axios from 'axios';
import api from '../lib/api';
import { useLanguageStore } from '../store/languageStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import PhotoUpload from '../components/PhotoUpload';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { getInitials } from '../lib/utils';

interface TeacherSubject {
  id: string;
  name: string;
}

interface TeacherClass {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  photo?: string | null;
  avatar?: string | null;
  isActive: boolean;
  subjects?: TeacherSubject[];
  classes?: TeacherClass[];
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const fetchTeachers = async (): Promise<Teacher[]> => {
  const res = await api.get('/teachers');
  return res.data.data.items as Teacher[];
};

const emptyForm = { name: '', email: '', phone: '' };

export default function Teachers() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [newTeacher, setNewTeacher] = useState(emptyForm);
  const [teacherPhotos, setTeacherPhotos] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ name: string; temporaryPassword: string } | null>(null);

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['teachers'],
    queryFn: fetchTeachers,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await api.post('/teachers', {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
      });
      return res.data.data as { teacher: Teacher; temporaryPassword?: string };
    },
    onSuccess: (data) => {
      addToast('success', 'Enseignant ajouté avec succès');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setShowAddModal(false);
      setNewTeacher(emptyForm);
      // The temporary password is shown exactly once, never stored.
      if (data?.temporaryPassword) {
        setCredentials({ name: data.teacher?.name ?? '', temporaryPassword: data.temporaryPassword });
      }
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de l'ajout de l'enseignant"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; email: string; phone: string } }) => {
      const res = await api.patch(`/teachers/${id}`, {
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
      });
      return res.data.data.teacher;
    },
    onSuccess: () => {
      addToast('success', 'Enseignant modifié avec succès');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setShowAddModal(false);
      setEditingTeacher(null);
      setNewTeacher(emptyForm);
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de la modification de l'enseignant"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/teachers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Enseignant désactivé');
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      setTeacherToDelete(null);
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de la suppression de l'enseignant"));
    },
  });

  const photoMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await api.patch(`/teachers/${id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.teacher;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, 'Échec de la sauvegarde de la photo'));
    },
  });

  const handlePhotoUpload = (teacherId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setTeacherPhotos((prev) => ({ ...prev, [teacherId]: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
    photoMutation.mutate({ id: teacherId, file });
  };

  const handlePhotoRemove = (teacherId: string) => {
    setTeacherPhotos((prev) => {
      const next = { ...prev };
      delete next[teacherId];
      return next;
    });
  };

  const openAdd = () => {
    setEditingTeacher(null);
    setNewTeacher(emptyForm);
    setShowAddModal(true);
  };

  const openEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setNewTeacher({ name: teacher.name, email: teacher.email, phone: teacher.phone ?? '' });
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTeacher) {
      updateMutation.mutate({
        id: editingTeacher.id,
        data: { name: newTeacher.name, email: newTeacher.email, phone: newTeacher.phone },
      });
    } else {
      createMutation.mutate(newTeacher);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  const displayPhoto = (teacher: Teacher) =>
    teacherPhotos[teacher.id] ?? teacher.photo ?? teacher.avatar ?? undefined;

  const teacherInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return getInitials(parts[0] ?? '', parts[parts.length - 1] ?? '');
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('teachers.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{teachers.length} enseignants</p>
          </div>
          <button
            onClick={openAdd}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('teachers.addTeacher')}
          </button>
        </div>

        {/* Teacher Cards */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="skeleton h-56 rounded-2xl" />
            ))}
          </div>
        ) : teachers.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-muted dark:text-gray-400">Aucun enseignant trouvé</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teachers.map((teacher, index) => (
              <motion.div
                key={teacher.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card card-hover p-6"
              >
                <div className="flex items-start gap-4 mb-4">
                  <PhotoUpload
                    currentPhoto={displayPhoto(teacher)}
                    onUpload={(file) => handlePhotoUpload(teacher.id, file)}
                    onRemove={() => handlePhotoRemove(teacher.id)}
                    size="sm"
                    label="Photo de l'enseignant"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-text dark:text-gray-200 truncate">
                      {teacher.name}
                    </h3>
                    <span className={`badge text-xs mt-1 ${teacher.isActive ? 'badge-success' : 'badge-danger'}`}>
                      {teacher.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{teacher.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <span>{teacher.phone || '—'}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted dark:text-gray-400 mb-1.5 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Matières
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(teacher.subjects ?? []).length === 0 ? (
                        <span className="text-xs text-muted dark:text-gray-500">—</span>
                      ) : (
                        (teacher.subjects ?? []).map((subject) => (
                          <span key={subject.id} className="badge-info badge text-xs">{subject.name}</span>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted dark:text-gray-400 mb-1.5 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Classes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(teacher.classes ?? []).length === 0 ? (
                        <span className="text-xs text-muted dark:text-gray-500">—</span>
                      ) : (
                        (teacher.classes ?? []).map((cls) => (
                          <span key={cls.id} className="badge text-xs bg-gray-100 dark:bg-white/10 text-muted dark:text-gray-400">{cls.name}</span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <RowActions
                    items={[
                      { label: 'Voir', icon: <Eye className="w-4 h-4" />, onClick: () => setSelectedTeacher(teacher) },
                      { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(teacher) },
                      { label: 'Désactiver', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setTeacherToDelete(teacher) },
                    ]}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Teacher Detail Modal */}
        <Modal
          isOpen={!!selectedTeacher}
          onClose={() => setSelectedTeacher(null)}
          title={selectedTeacher ? selectedTeacher.name : ''}
          size="lg"
        >
          {selectedTeacher && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Email</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedTeacher.email}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Téléphone</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedTeacher.phone || '—'}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Statut</p>
                  <span className={`badge text-xs ${selectedTeacher.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {selectedTeacher.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Classes</p>
                  <p className="font-medium text-text dark:text-gray-200">
                    {(selectedTeacher.classes ?? []).length === 0
                      ? '—'
                      : (selectedTeacher.classes ?? []).map((c) => c.name).join(', ')}
                  </p>
                </div>
              </div>
              <div>
                <h4 className="font-medium text-text dark:text-gray-200 mb-3">Matières enseignées</h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedTeacher.subjects ?? []).length === 0 ? (
                    <span className="text-sm text-muted dark:text-gray-500">Aucune matière assignée</span>
                  ) : (
                    (selectedTeacher.subjects ?? []).map((subject) => (
                      <span key={subject.id} className="badge-info badge">{subject.name}</span>
                    ))
                  )}
                </div>
              </div>
              <div>
                <h4 className="font-medium text-text dark:text-gray-200 mb-3">Initiales</h4>
                <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                  <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-primary-500">
                      {teacherInitials(selectedTeacher.name)}
                    </span>
                  </div>
                  <span className="text-sm text-text dark:text-gray-200">{selectedTeacher.name}</span>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Add/Edit Teacher Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => { setShowAddModal(false); setEditingTeacher(null); }}
          title={editingTeacher ? 'Modifier l\'enseignant' : t('teachers.addTeacher')}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom complet</label>
              <input
                type="text"
                value={newTeacher.name}
                onChange={(e) => setNewTeacher((p) => ({ ...p, name: e.target.value }))}
                className="input-field"
                placeholder="Marie Martin"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={newTeacher.email}
                onChange={(e) => setNewTeacher((p) => ({ ...p, email: e.target.value }))}
                className="input-field"
                placeholder="marie@ecole.fr"
                required
              />
            </div>
            {!editingTeacher && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-sm text-blue-800 dark:text-blue-300">
                Un mot de passe temporaire sera généré automatiquement. L’enseignant devra le
                changer à sa première connexion.
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Téléphone</label>
              <input
                type="tel"
                value={newTeacher.phone}
                onChange={(e) => setNewTeacher((p) => ({ ...p, phone: e.target.value }))}
                className="input-field"
                placeholder="+33 6 12 34 56 78"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingTeacher(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : editingTeacher ? 'Enregistrer' : 'Ajouter l\'enseignant'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Temporary credentials reveal (creation only, shown once) */}
        <Modal
          isOpen={!!credentials}
          onClose={() => setCredentials(null)}
          title="Mot de passe temporaire"
        >
          {credentials && (
            <div className="space-y-4">
              <p className="text-sm text-muted dark:text-gray-400">
                Communiquez ces informations à <span className="font-medium text-text dark:text-gray-200">{credentials.name}</span>.
                Le mot de passe ne sera plus affiché après fermeture.
              </p>
              <code className="block p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-sm text-text break-all">
                {credentials.temporaryPassword}
              </code>
              <button className="btn-primary w-full" onClick={() => setCredentials(null)}>
                J’ai noté le mot de passe
              </button>
            </div>
          )}
        </Modal>

        {/* Delete Confirm Modal */}
        <Modal
          isOpen={!!teacherToDelete}
          onClose={() => setTeacherToDelete(null)}
          title="Désactiver l'enseignant"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment désactiver <span className="font-medium text-text dark:text-gray-200">{teacherToDelete?.name}</span> ?
            Son compte sera désactivé.
          </p>
          <div className="flex justify-end gap-3 pt-6">
            <button type="button" onClick={() => setTeacherToDelete(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => teacherToDelete && deleteMutation.mutate(teacherToDelete.id)}
              className="btn-primary bg-danger hover:bg-red-600"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Désactiver'}
            </button>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
