import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, User, Users, AlertTriangle, MapPin, Trash2, Clock, Printer } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface TimetableEntry {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  room?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  academicYear: string;
  class?: { id: string; name: string } | null;
  subject?: { id: string; name: string; code?: string } | null;
  teacher?: { id: string; name: string } | null;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  subjects?: SubjectOption[];
}

interface TeacherOption {
  id: string;
  name: string;
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const SUBJECT_COLORS = [
  { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20', dot: 'bg-amber-500' },
  { bg: 'bg-violet-500/10', text: 'text-violet-500', border: 'border-violet-500/20', dot: 'bg-violet-500' },
  { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20', dot: 'bg-green-500' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-500', border: 'border-cyan-500/20', dot: 'bg-cyan-500' },
  { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/20', dot: 'bg-orange-500' },
  { bg: 'bg-pink-500/10', text: 'text-pink-500', border: 'border-pink-500/20', dot: 'bg-pink-500' },
  { bg: 'bg-indigo-500/10', text: 'text-indigo-500', border: 'border-indigo-500/20', dot: 'bg-indigo-500' },
  { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20', dot: 'bg-rose-500' },
];

function getSubjectColor(subject: string) {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = subject.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

const fetchEntries = async (params: { classId?: string; teacherId?: string }): Promise<TimetableEntry[]> => {
  const res = await api.get('/timetable', { params });
  return res.data?.data?.items ?? [];
};

const fetchClasses = async (): Promise<ClassOption[]> => {
  const res = await api.get('/classes');
  return res.data?.data?.items ?? [];
};

const fetchTeachers = async (): Promise<TeacherOption[]> => {
  const res = await api.get('/teachers');
  return res.data?.data?.items ?? [];
};

function getApiError(err: unknown, fallback: string): { message: string; conflicts: string[] } {
  const e = err as { response?: { status?: number; data?: { error?: string; data?: { conflicts?: string[] } } } };
  return {
    message: e.response?.data?.error ?? fallback,
    conflicts: e.response?.data?.data?.conflicts ?? [],
  };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export default function Timetable() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimetableEntry | null>(null);
  const [selectedClass, setSelectedClass] = useState('all');
  const [teacherView, setTeacherView] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState('all');
  const [serverConflict, setServerConflict] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState({
    classId: '',
    subjectId: '',
    teacherId: '',
    room: '',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '09:00',
  });

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ['timetable', selectedClass, teacherView, selectedTeacher],
    queryFn: () => fetchEntries({
      classId: !teacherView && selectedClass !== 'all' ? selectedClass : undefined,
      teacherId: teacherView && selectedTeacher !== 'all' ? selectedTeacher : undefined,
    }),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: fetchClasses,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: fetchTeachers,
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newCourse) => {
      const res = await api.post('/timetable', {
        ...data,
        academicYear: '2025-2026',
      });
      return res.data?.data?.entry;
    },
    onSuccess: () => {
      addToast('success', 'Cours ajouté avec succès');
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      setShowAddModal(false);
      setServerConflict(null);
      setNewCourse({ classId: '', subjectId: '', teacherId: '', room: '', dayOfWeek: 1, startTime: '08:00', endTime: '09:00' });
    },
    onError: (err) => {
      const { message, conflicts } = getApiError(err, "Erreur lors de l'ajout du cours");
      const full = conflicts.length > 0 ? `${message} : ${conflicts.join(' ; ')}` : message;
      setServerConflict(full);
      addToast('error', full);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/timetable/${id}`);
      return { id };
    },
    onSuccess: () => {
      addToast('success', 'Cours supprimé');
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      setShowDeleteModal(false);
      setDeleteTarget(null);
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors de la suppression').message);
    },
  });

  // Server already filters by class/teacher.
  const filteredCourses = entries;

  const entrySubjectName = (c: TimetableEntry) => c.subject?.name ?? '—';
  const entryTeacherName = (c: TimetableEntry) => c.teacher?.name ?? '—';

  const usedSubjects = useMemo(() => [...new Set(entries.map((c) => entrySubjectName(c)))], [entries]);

  const existingRooms = useMemo(() => [...new Set(entries.map((c) => c.room).filter((r): r is string => !!r))], [entries]);

  const subjectOptions: SubjectOption[] = useMemo(() => {
    const fromClass = classes.find((c) => c.id === newCourse.classId)?.subjects ?? [];
    if (fromClass.length > 0) return fromClass;
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.subject && !map.has(e.subject.id)) map.set(e.subject.id, e.subject.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [classes, newCourse.classId, entries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerConflict(null);
    addMutation.mutate(newCourse);
  };

  const handleDelete = (course: TimetableEntry) => {
    setDeleteTarget(course);
    setShowDeleteModal(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6 no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Emploi du temps</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{filteredCourses.length} cours planifiés</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Ajouter un cours
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTeacherView(false)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                !teacherView
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-muted hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
              )}
            >
              <Users className="w-4 h-4" />
              Par classe
            </button>
            <button
              onClick={() => setTeacherView(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                teacherView
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-muted hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
              )}
            >
              <User className="w-4 h-4" />
              Par enseignant
            </button>
          </div>

          {!teacherView ? (
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Toutes les classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Tous les enseignants</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Legend */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-muted dark:text-gray-400 uppercase mb-3">Légende des matières</p>
          <div className="flex flex-wrap gap-3">
            {usedSubjects.map((subject) => {
              const color = getSubjectColor(subject);
              return (
                <span key={subject} className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400">
                  <span className={cn('w-2.5 h-2.5 rounded-full', color.dot)} />
                  {subject}
                </span>
              );
            })}
          </div>
        </div>

        {/* Timetable Grid */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Erreur lors du chargement de l'emploi du temps</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                {/* Header */}
                <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
                  <div className="border-b border-r border-border dark:border-white/10" />
                  {DAYS.map((day) => (
                    <div key={day} className="border-b border-border dark:border-white/10 py-3 text-center">
                      <p className="text-sm font-semibold text-text dark:text-gray-200">{day}</p>
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div className="grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
                  {/* Time labels */}
                  <div>
                    {TIME_SLOTS.map((slot) => (
                      <div key={slot} className="h-14 flex items-start justify-end pr-2 pt-1">
                        <span className="text-xs text-muted dark:text-gray-500">{slot}</span>
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {DAYS.map((day, dayIndex) => (
                    <div key={day} className="relative border-l border-border/30 dark:border-white/5">
                      {TIME_SLOTS.map((slot) => (
                        <div key={slot} className="h-14 border-b border-border/30 dark:border-white/5" />
                      ))}
                      {filteredCourses
                        .filter((c) => c.dayOfWeek === dayIndex + 1)
                        .map((course) => {
                          const gridStart = timeToMinutes('08:00');
                          const startMin = timeToMinutes(course.startTime);
                          const endMin = timeToMinutes(course.endTime);
                          if (endMin <= startMin || endMin <= gridStart) return null;
                          const top = Math.max(0, ((startMin - gridStart) / 60) * 56);
                          const height = ((endMin - Math.max(startMin, gridStart)) / 60) * 56;
                          const subjectName = entrySubjectName(course);
                          const color = getSubjectColor(subjectName);
                          return (
                            <motion.div
                              key={course.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={cn(
                                'absolute left-1 right-1 rounded-lg p-2 overflow-hidden border',
                                color.bg,
                                color.border
                              )}
                              style={{ top, height: Math.max(height - 4, 40) }}
                            >
                              <p className={cn('text-xs font-semibold truncate', color.text)}>{subjectName}</p>
                              <p className="text-xs text-muted dark:text-gray-400 truncate mt-0.5">{entryTeacherName(course)} · {course.class?.name ?? ''}</p>
                              <div className="flex items-center gap-1 mt-0.5 text-xs text-muted dark:text-gray-500">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{course.room ?? '—'}</span>
                              </div>
                              <button
                                onClick={() => handleDelete(course)}
                                className="absolute top-1 right-1 p-1 rounded-md opacity-0 hover:opacity-100 hover:bg-white/50 dark:hover:bg-white/10 transition-opacity"
                                title="Supprimer"
                              >
                                <Trash2 className="w-3 h-3 text-danger" />
                              </button>
                            </motion.div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add Course Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Ajouter un cours"
          size="lg"
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Classe</label>
                <select
                  value={newCourse.classId}
                  onChange={(e) => setNewCourse((p) => ({ ...p, classId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Sélectionner une classe</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Matière</label>
                <select
                  value={newCourse.subjectId}
                  onChange={(e) => setNewCourse((p) => ({ ...p, subjectId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Sélectionner une matière</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Enseignant</label>
                <select
                  value={newCourse.teacherId}
                  onChange={(e) => setNewCourse((p) => ({ ...p, teacherId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Sélectionner un enseignant</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Salle</label>
                <input
                  type="text"
                  value={newCourse.room}
                  onChange={(e) => setNewCourse((p) => ({ ...p, room: e.target.value }))}
                  className="input-field"
                  placeholder="Salle 101"
                  list="timetable-rooms"
                />
                <datalist id="timetable-rooms">
                  {existingRooms.map((room) => (
                    <option key={room} value={room} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Jour</label>
                <select
                  value={newCourse.dayOfWeek}
                  onChange={(e) => setNewCourse((p) => ({ ...p, dayOfWeek: parseInt(e.target.value, 10) }))}
                  className="input-field"
                  required
                >
                  {DAYS.map((day, idx) => (
                    <option key={day} value={idx + 1}>{day}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Début</label>
                  <select
                    value={newCourse.startTime}
                    onChange={(e) => setNewCourse((p) => ({ ...p, startTime: e.target.value }))}
                    className="input-field"
                    required
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Fin</label>
                  <select
                    value={newCourse.endTime}
                    onChange={(e) => setNewCourse((p) => ({ ...p, endTime: e.target.value }))}
                    className="input-field"
                    required
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {serverConflict && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl"
              >
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Conflit détecté</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">{serverConflict}</p>
                </div>
              </motion.div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setServerConflict(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Enregistrement...' : 'Ajouter le cours'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Supprimer le cours"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              Êtes-vous sûr de vouloir supprimer le cours de <strong className="text-text dark:text-gray-200">{deleteTarget ? entrySubjectName(deleteTarget) : ''}</strong> ({deleteTarget?.class?.name ?? ''}) ?
            </p>
            <p className="text-xs text-muted dark:text-gray-400">Cette action est irréversible.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                className="px-5 py-2.5 rounded-xl bg-danger text-white font-medium hover:bg-red-600 transition-all"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </Modal>
      </div>

      {/* Print-only view: flat agenda per day */}
      <div className="print-only">
        <h1>Emploi du temps</h1>
        <p>{filteredCourses.length} cours planifié(s) — imprimé le {new Date().toLocaleDateString('fr-FR')}</p>
        {DAYS.map((day, dayIndex) => {
          const dayCourses = filteredCourses
            .filter((c) => c.dayOfWeek === dayIndex + 1)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
          if (dayCourses.length === 0) return null;
          return (
            <div key={day}>
              <h2>{day}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Horaire</th>
                    <th>Matière</th>
                    <th>Enseignant</th>
                    <th>Classe</th>
                    <th>Salle</th>
                  </tr>
                </thead>
                <tbody>
                  {dayCourses.map((c) => (
                    <tr key={c.id}>
                      <td>{c.startTime} – {c.endTime}</td>
                      <td>{entrySubjectName(c)}</td>
                      <td>{entryTeacherName(c)}</td>
                      <td>{c.class?.name ?? '—'}</td>
                      <td>{c.room ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </PageTransition>
  );
}
