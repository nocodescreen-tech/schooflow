import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Filter, Download, Edit, Trash2 } from 'lucide-react';
import axios from 'axios';
import api from '../lib/api';
import { useLanguageStore } from '../store/languageStore';
import { useCan } from '../store/authStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { formatDate, getGradeColor, getInitials } from '../lib/utils';
import { cn } from '../lib/utils';

interface GradeStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface GradeSubject {
  id: string;
  name: string;
  code?: string;
}

interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  examType: string;
  examName?: string | null;
  score: number;
  coefficient: number;
  term: number;
  academicYear?: string;
  date: string;
  status?: string;
  student?: GradeStudent | null;
  subject?: GradeSubject | null;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classId?: string | null;
  class?: { id: string; name: string } | null;
}

interface ClassOption {
  id: string;
  name: string;
  subjects?: GradeSubject[];
}

interface GradeForm {
  studentId: string;
  subjectId: string;
  score: string;
  coefficient: string;
  term: string;
  examType: string;
  examName: string;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const emptyForm: GradeForm = {
  studentId: '',
  subjectId: '',
  score: '',
  coefficient: '1',
  term: '1',
  examType: 'test',
  examName: '',
};

const GRADE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumise',
  VALIDATED: 'Validée',
  PUBLISHED: 'Publiée',
};

function gradeStatusBadge(status?: string): string {
  switch (status ?? 'DRAFT') {
    case 'PUBLISHED':
      return 'badge badge-success';
    case 'VALIDATED':
      return 'badge badge-info';
    case 'SUBMITTED':
      return 'badge badge-warning';
    default:
      return 'badge';
  }
}

export default function Grades() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [gradeToDelete, setGradeToDelete] = useState<Grade | null>(null);
  const canDeleteGrades = useCan('grades', 'delete');
  const canUpdateGrades = useCan('grades', 'update');
  const canPublishGrades = useCan('grades', 'publish');
  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [termFilter, setTermFilter] = useState('all');
  const [newGrade, setNewGrade] = useState<GradeForm>(emptyForm);
  const [bulkGrades, setBulkGrades] = useState<Record<string, string>>({});
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkSubjectId, setBulkSubjectId] = useState('');
  const [bulkTerm, setBulkTerm] = useState('1');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['grades', subjectFilter, termFilter],
    queryFn: async (): Promise<Grade[]> => {
      const params: Record<string, string> = {};
      if (subjectFilter !== 'all') params.subjectId = subjectFilter;
      if (termFilter !== 'all') params.term = termFilter;
      const res = await api.get('/grades', { params });
      return res.data.data.items as Grade[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-list'],
    queryFn: async (): Promise<StudentOption[]> => {
      const res = await api.get('/students', { params: { limit: 200 } });
      return res.data.data.items as StudentOption[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await api.get('/classes');
      return res.data.data.items as ClassOption[];
    },
  });

  const subjects: GradeSubject[] = useMemo(() => {
    const map = new Map<string, GradeSubject>();
    for (const cls of classes) {
      for (const s of cls.subjects ?? []) {
        if (!map.has(s.id)) map.set(s.id, s);
      }
    }
    for (const g of grades) {
      if (g.subject && !map.has(g.subject.id)) map.set(g.subject.id, g.subject);
    }
    return [...map.values()];
  }, [classes, grades]);

  const studentClassName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (s.class) map.set(s.id, s.class.name);
    }
    return map;
  }, [students]);

  const filteredGrades = grades.filter((g) => {
    if (classFilter !== 'all' && (studentClassName.get(g.studentId) ?? '') !== classFilter) return false;
    return true;
  });

  const invalidateGrades = () => queryClient.invalidateQueries({ queryKey: ['grades'] });

  const createMutation = useMutation({
    mutationFn: async (data: GradeForm) => {
      const res = await api.post('/grades', {
        studentId: data.studentId,
        subjectId: data.subjectId,
        score: Number(data.score),
        coefficient: Number(data.coefficient) || 1,
        term: Number(data.term),
        examType: data.examType,
        examName: data.examName || undefined,
      });
      return res.data.data.grade;
    },
    onSuccess: () => {
      addToast('success', 'Note ajoutée avec succès');
      invalidateGrades();
      setShowAddModal(false);
      setNewGrade(emptyForm);
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de l'ajout de la note"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: GradeForm }) => {
      const res = await api.patch(`/grades/${id}`, {
        score: Number(data.score),
        coefficient: Number(data.coefficient) || 1,
        term: Number(data.term),
        examType: data.examType,
        examName: data.examName || undefined,
      });
      return res.data.data.grade;
    },
    onSuccess: () => {
      addToast('success', 'Note modifiée avec succès');
      invalidateGrades();
      setShowAddModal(false);
      setEditingGrade(null);
      setNewGrade(emptyForm);
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, 'Erreur lors de la modification de la note'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/grades/${id}`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Note supprimée');
      invalidateGrades();
      setGradeToDelete(null);
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, 'Erreur lors de la suppression de la note'));
    },
  });

  // No bulk endpoint on the backend — save each grade with its own POST.
  const bulkMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(bulkGrades).filter(([, v]) => v !== '');
      const results = await Promise.all(
        entries.map(([studentId, score]) =>
          api.post('/grades', {
            studentId,
            subjectId: bulkSubjectId,
            score: Number(score),
            coefficient: 1,
            term: Number(bulkTerm),
            examType: 'test',
          })
        )
      );
      return { count: results.length };
    },
    onSuccess: (result) => {
      addToast('success', `${result.count} note(s) enregistrée(s) avec succès`);
      invalidateGrades();
      setShowBulkModal(false);
      setBulkGrades({});
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de l'enregistrement"));
    },
  });

  // Grade workflow: DRAFT → SUBMITTED → VALIDATED → PUBLISHED.
  const workflowMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'submit' | 'validate' | 'publish' }) => {
      const res = await api.post(`/grades/${id}/${action}`);
      return res.data.data.grade;
    },
    onSuccess: (_grade, vars) => {
      const labels: Record<string, string> = {
        submit: 'Note soumise',
        validate: 'Note validée',
        publish: 'Note publiée',
      };
      addToast('success', labels[vars.action] ?? 'Statut mis à jour');
      invalidateGrades();
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, 'Changement de statut impossible'));
    },
  });

  const studentName = (g: Grade) =>
    g.student ? `${g.student.firstName} ${g.student.lastName}` : '—';

  const openAdd = () => {
    setEditingGrade(null);
    setNewGrade(emptyForm);
    setShowAddModal(true);
  };

  const openEdit = (grade: Grade) => {
    setEditingGrade(grade);
    setNewGrade({
      studentId: grade.studentId,
      subjectId: grade.subjectId,
      score: String(grade.score),
      coefficient: String(grade.coefficient ?? 1),
      term: String(grade.term),
      examType: grade.examType ?? 'test',
      examName: grade.examName ?? '',
    });
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGrade) {
      updateMutation.mutate({ id: editingGrade.id, data: newGrade });
    } else {
      createMutation.mutate(newGrade);
    }
  };

  const handleBulkSubmit = () => {
    if (!bulkSubjectId) {
      addToast('error', 'Sélectionnez une matière');
      return;
    }
    bulkMutation.mutate();
  };

  const handleExport = () => {
    exportGradeRows(filteredGrades, 'notes.csv');
  };

  const exportGradeRows = (rows: Grade[], filename: string) => {
    const header = 'Eleve;Classe;Matiere;Note;Coefficient;Trimestre;Type;Date';
    const lines = rows.map((g) =>
      [
        studentName(g),
        studentClassName.get(g.studentId) ?? '',
        g.subject?.name ?? '',
        String(g.score),
        String(g.coefficient ?? 1),
        `T${g.term}`,
        g.examType ?? '',
        g.date ? new Date(g.date).toISOString().split('T')[0] : '',
      ].join(';')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Export CSV téléchargé');
  };

  // --- Selection + export CSV only (no bulk delete by design) ----------------
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filteredGrades.length > 0 && filteredGrades.every((g) => selectedIds.has(g.id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredGrades.forEach((g) => {
        if (checked) next.add(g.id);
        else next.delete(g.id);
      });
      return next;
    });
  };

  const handleExportSelected = () => {
    exportGradeRows(
      filteredGrades.filter((g) => selectedIds.has(g.id)),
      'notes-selection.csv'
    );
  };

  const bulkStudents = bulkClassId ? students.filter((s) => s.classId === bulkClassId) : [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('grades.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{grades.length} notes enregistrées</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('grades.bulkEntry')}
            </button>
            <button
              onClick={openAdd}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('grades.addGrade')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Toutes les classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.name}>{cls.name}</option>
              ))}
            </select>
          </div>
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Toutes les matières</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
          <select
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Tous les trimestres</option>
            <option value="1">Trimestre 1</option>
            <option value="2">Trimestre 2</option>
            <option value="3">Trimestre 3</option>
          </select>
        </div>

        {/* Grades Table */}
        <div className="card overflow-hidden">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border dark:border-white/10 bg-primary-500/5">
              <span className="text-sm font-medium text-text dark:text-gray-200">
                {selectedIds.size} sélectionnée(s)
              </span>
              <button onClick={handleExportSelected} className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exporter CSV
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost !px-3 !py-1.5 text-sm">
                Effacer
              </button>
            </div>
          )}
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : filteredGrades.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted dark:text-gray-400">Aucune note trouvée</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      aria-label="Tout sélectionner"
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Classe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Matière</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Note</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Trimestre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {filteredGrades.map((grade, index) => {
                  const name = studentName(grade);
                  const nameParts = name.split(' ');
                  return (
                    <motion.tr
                      key={grade.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(grade.id)}
                          onChange={() => toggleRow(grade.id)}
                          aria-label="Sélectionner cette note"
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-primary-500">
                              {getInitials(nameParts[0] ?? '', nameParts[1] ?? '')}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-text dark:text-gray-200">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-info badge">{studentClassName.get(grade.studentId) ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{grade.subject?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-sm font-bold', getGradeColor(Number(grade.score)))}>
                          {grade.score}/20
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{grade.date ? formatDate(grade.date) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className="badge text-xs bg-gray-100 dark:bg-white/10 text-muted dark:text-gray-400">T{grade.term}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={gradeStatusBadge(grade.status)}>
                          {GRADE_STATUS_LABELS[grade.status ?? 'DRAFT'] ?? grade.status ?? 'Brouillon'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          items={[
                            { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(grade) },
                            ...((grade.status ?? 'DRAFT') === 'DRAFT' && canUpdateGrades
                              ? [{ label: 'Soumettre', icon: <Plus className="w-4 h-4" />, onClick: () => workflowMutation.mutate({ id: grade.id, action: 'submit' }) }]
                              : []),
                            ...(grade.status === 'SUBMITTED' && canUpdateGrades
                              ? [{ label: 'Valider', icon: <Plus className="w-4 h-4" />, onClick: () => workflowMutation.mutate({ id: grade.id, action: 'validate' }) }]
                              : []),
                            ...(grade.status === 'VALIDATED' && canPublishGrades
                              ? [{ label: 'Publier', icon: <Plus className="w-4 h-4" />, onClick: () => workflowMutation.mutate({ id: grade.id, action: 'publish' }) }]
                              : []),
                            ...(canDeleteGrades
                              ? [{ label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => setGradeToDelete(grade) }]
                              : []),
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

        {/* Add/Edit Grade Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => { setShowAddModal(false); setEditingGrade(null); }}
          title={editingGrade ? 'Modifier la note' : t('grades.addGrade')}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={newGrade.studentId}
                onChange={(e) => setNewGrade((p) => ({ ...p, studentId: e.target.value }))}
                className="input-field"
                required
                disabled={!!editingGrade}
              >
                <option value="">Sélectionner un élève</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Matière</label>
              <select
                value={newGrade.subjectId}
                onChange={(e) => setNewGrade((p) => ({ ...p, subjectId: e.target.value }))}
                className="input-field"
                required
                disabled={!!editingGrade}
              >
                <option value="">Sélectionner une matière</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Note (/20)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={newGrade.score}
                  onChange={(e) => setNewGrade((p) => ({ ...p, score: e.target.value }))}
                  className="input-field"
                  placeholder="15"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Coefficient</label>
                <input
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={newGrade.coefficient}
                  onChange={(e) => setNewGrade((p) => ({ ...p, coefficient: e.target.value }))}
                  className="input-field"
                  placeholder="1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Trimestre</label>
                <select
                  value={newGrade.term}
                  onChange={(e) => setNewGrade((p) => ({ ...p, term: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="1">Trimestre 1</option>
                  <option value="2">Trimestre 2</option>
                  <option value="3">Trimestre 3</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type d&apos;évaluation</label>
                <select
                  value={newGrade.examType}
                  onChange={(e) => setNewGrade((p) => ({ ...p, examType: e.target.value }))}
                  className="input-field"
                >
                  <option value="test">Interrogation</option>
                  <option value="exam">Examen</option>
                  <option value="assignment">Devoir</option>
                  <option value="project">Projet</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom de l&apos;évaluation (optionnel)</label>
              <input
                type="text"
                value={newGrade.examName}
                onChange={(e) => setNewGrade((p) => ({ ...p, examName: e.target.value }))}
                className="input-field"
                placeholder="Ex : Contrôle chapitre 3"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingGrade(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : editingGrade ? 'Enregistrer' : 'Ajouter la note'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Bulk Entry Modal */}
        <Modal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          title={t('grades.bulkEntry')}
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Classe</label>
                <select
                  value={bulkClassId}
                  onChange={(e) => setBulkClassId(e.target.value)}
                  className="input-field"
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
                  value={bulkSubjectId}
                  onChange={(e) => setBulkSubjectId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Sélectionner une matière</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Trimestre</label>
                <select
                  value={bulkTerm}
                  onChange={(e) => setBulkTerm(e.target.value)}
                  className="input-field"
                >
                  <option value="1">T1</option>
                  <option value="2">T2</option>
                  <option value="3">T3</option>
                </select>
              </div>
            </div>
            <div className="border border-border dark:border-white/10 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted dark:text-gray-400">Élève</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted dark:text-gray-400">Note (/20)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {bulkStudents.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-sm text-muted dark:text-gray-400">
                        Sélectionnez une classe pour voir ses élèves
                      </td>
                    </tr>
                  ) : (
                    bulkStudents.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-2 text-sm text-text dark:text-gray-200">{s.firstName} {s.lastName}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={bulkGrades[s.id] || ''}
                            onChange={(e) => setBulkGrades((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            className="w-20 px-2 py-1 border border-border dark:border-white/10 rounded-lg text-sm dark:bg-white/5 dark:text-gray-200"
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowBulkModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button onClick={handleBulkSubmit} className="btn-primary" disabled={bulkMutation.isPending}>
                {bulkMutation.isPending ? 'Enregistrement...' : 'Enregistrer les notes'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Delete Confirm Modal */}
        <Modal
          isOpen={!!gradeToDelete}
          onClose={() => setGradeToDelete(null)}
          title="Supprimer la note"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment supprimer cette note
            {gradeToDelete?.student && (
              <> de <span className="font-medium text-text dark:text-gray-200">{gradeToDelete.student.firstName} {gradeToDelete.student.lastName}</span></>
            )} ({gradeToDelete?.score}/20) ?
          </p>
          <div className="flex justify-end gap-3 pt-6">
            <button type="button" onClick={() => setGradeToDelete(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => gradeToDelete && deleteMutation.mutate(gradeToDelete.id)}
              className="btn-primary bg-danger hover:bg-red-600"
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
