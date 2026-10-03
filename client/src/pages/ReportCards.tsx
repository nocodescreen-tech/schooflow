import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Eye,
  Download,
  Printer,
  Archive,
  FileText,
  Users,
  Loader2,
  Trash2,
  Pencil,
  BookMarked,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Send,
  Ban,
} from 'lucide-react';
import api from '../lib/api';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { useSettingsStore } from '../store/settingsStore';
import { useCan } from '../store/authStore';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Types (miroir des contrats backend réels)
// ---------------------------------------------------------------------------

interface ClassOption {
  id: string;
  name: string;
}

interface StudentLite {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
  classId?: string | null;
  dateOfBirth?: string | null;
  gender?: string;
  class?: { id?: string; name?: string } | null;
}

interface BulletinTemplate {
  id: string;
  name: string;
  category: string;
  version: number;
  status: string;
}

interface GradeRow {
  id: string;
  studentId: string;
  subjectId: string;
  score: number | string;
  coefficient: number | string;
  term: number | string;
  academicYear?: string | null;
  status?: string | null;
  subject?: { id?: string; name?: string; department?: string | null } | null;
}

interface AttendanceRow {
  id: string;
  status: string;
}

interface GeneratedDoc {
  id: string;
  title?: string | null;
  documentType: string;
  documentNumber?: string | null;
  status: string;
  createdAt: string;
  studentId?: string | null;
  metadata?: Record<string, unknown> | null;
  student?: { id: string; firstName: string; lastName: string } | null;
  template?: { id: string; name: string; category: string } | null;
}

interface SubjectCell {
  subjectId: string;
  name: string;
  domain: string | null;
  coef: number;
  terms: (number | null)[];
  annual: number | null;
}

interface BulletinDomain {
  name: string;
  subjects: SubjectCell[];
  subtotal: (number | null)[];
  maxima: number[];
  annualSubtotal: number | null;
  annualMaxima: number;
}

interface BulletinData {
  student: StudentLite;
  className: string;
  subjects: SubjectCell[];
  domains: BulletinDomain[];
  totals: (number | null)[];
  maxima: number[];
  annualTotal: number | null;
  annualMaxima: number | null;
  percentage: number | null;
  rank: number | null;
  classSize: number;
  absences: number | null;
  lates: number | null;
  excused: number | null;
  decision: string;
  passMark: number;
  gradeStatus: Record<string, number>;
  appS1: string | null;
  appS2: string | null;
  conduct: string | null;
}

type ApiErr = { response?: { data?: { error?: string } } };
const apiErrMsg = (err: unknown, fallback: string) =>
  (err as ApiErr)?.response?.data?.error ?? fallback;

const DECISIONS = ['PROMU', 'REDOUBLE', 'EXCLU', 'TRANSFERE', 'A_DELIBERER'] as const;
const DECISION_LABELS: Record<string, string> = {
  PROMU: 'Promu(e)',
  REDOUBLE: 'Redouble',
  EXCLU: 'Exclu(e)',
  TRANSFERE: 'Transféré(e)',
  A_DELIBERER: 'À délibérer',
};

const GEN_STATUS_LABEL: Record<string, string> = {
  en_attente: 'En attente',
  terminee: 'Terminé',
  erronee: 'Erreur',
  DRAFT: 'Brouillon',
  GENERATED: 'Généré',
  REVIEWED: 'Relu',
  VALIDATED: 'Validé',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
  REVOKED: 'Révoqué',
};

const GEN_STATUS_CLASS: Record<string, string> = {
  en_attente: 'badge-warning',
  terminee: 'badge-success',
  erronee: 'badge-danger',
  DRAFT: 'badge-warning',
  GENERATED: 'badge-info',
  REVIEWED: 'badge-info',
  VALIDATED: 'badge-success',
  PUBLISHED: 'badge-success',
  ARCHIVED: '',
  REVOKED: 'badge-danger',
};

function downloadBlob(data: BlobPart, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** Année scolaire ±1 autour de l'année active (format « 2025-2026 »). */
function yearOptions(active: string): string[] {
  const m = /^(\d{4})-(\d{4})$/.exec((active || '').trim());
  if (!m) {
    const now = new Date();
    const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return [`${start - 1}-${start}`, `${start}-${start + 1}`, `${start + 1}-${start + 2}`];
  }
  const s = Number(m[1]);
  return [`${s - 1}-${s}`, `${s}-${s + 1}`, `${s + 1}-${s + 2}`];
}

const fmtNum = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Moyenne pondérée d'une liste de notes (poids = coefficients), comme le backend. */
function weightedAvg(scores: { score: number; coefficient: number }[]): number | null {
  if (scores.length === 0) return null;
  const totalCoef = scores.reduce((s, g) => s + g.coefficient, 0);
  if (totalCoef === 0) return null;
  const total = scores.reduce((s, g) => s + g.score * g.coefficient, 0);
  return Math.round((total / totalCoef) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportCards() {
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const academicYearActive = useSettingsStore((s) => s.settings.academicYear);
  const years = useMemo(() => yearOptions(academicYearActive), [academicYearActive]);

  const canDownload = useCan('documents', 'download');
  const canDelete = useCan('documents', 'delete');
  const canValidateGrades = useCan('grades', 'update');
  const canValidate = useCan('reports', 'validate');
  const canPublish = useCan('reports', 'publish');

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/document-builder/generated/${id}/status`, { status });
      return res.data?.data;
    },
    onSuccess: (_data, vars) => {
      addToast('success', `Document → ${GEN_STATUS_LABEL[vars.status] ?? vars.status}`);
      queryClient.invalidateQueries({ queryKey: ['rc-history'] });
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Changement de statut impossible')),
  });

  const [academicYear, setAcademicYear] = useState(years[1] ?? '');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [previewRequested, setPreviewRequested] = useState(false);
  const [decision, setDecision] = useState<string>('A_DELIBERER');
  const [observation, setObservation] = useState('');
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<'loop' | 'grouped'>('grouped');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkErrors, setBulkErrors] = useState<{ student: string; error: string }[]>([]);

  // --- Listes de référence ---------------------------------------------------

  const classesQuery = useQuery({
    queryKey: ['rc-classes'],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as ClassOption[];
    },
  });

  const studentsQuery = useQuery({
    queryKey: ['rc-students', classId],
    queryFn: async (): Promise<StudentLite[]> => {
      const res = await api.get('/students', {
        params: { ...(classId ? { classId } : {}), limit: 500 },
      });
      return (res.data?.data?.items ?? []) as StudentLite[];
    },
  });

  const templatesQuery = useQuery({
    queryKey: ['rc-bulletin-templates'],
    queryFn: async (): Promise<BulletinTemplate[]> => {
      const res = await api.get('/document-builder', { params: { category: 'bulletin' } });
      return (res.data?.data?.items ?? []) as BulletinTemplate[];
    },
  });

  // --- Recommended template for the selected class -------------------------------
  // Backend contract: GET /document-builder/recommend?classId= →
  // { recommended: { id, name } | null, candidates }. Missing endpoint (404)
  // → fallback to manual select (backward compat).

  const recommendQuery = useQuery({
    queryKey: ['rc-recommended-template', classId],
    enabled: !!classId,
    retry: false,
    queryFn: async (): Promise<{ id: string; name: string } | null> => {
      try {
        const res = await api.get('/document-builder/recommend', { params: { classId } });
        return (res.data?.data?.recommended ?? null) as { id: string; name: string } | null;
      } catch {
        return null;
      }
    },
  });

  const recommendedId = recommendQuery.data?.id ?? null;

  useEffect(() => {
    if (recommendedId && !templateId) setTemplateId(recommendedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedId]);

  const schoolQuery = useQuery({
    queryKey: ['rc-school'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const res = await api.get('/settings');
        return (res.data?.data?.school ?? null) as {
          name?: string;
          address?: string;
          phone?: string;
          logo?: string;
          settings?: Record<string, unknown>;
        } | null;
      } catch {
        return null;
      }
    },
  });

  const selectedStudent = useMemo(
    () => (studentsQuery.data ?? []).find((s) => s.id === studentId) ?? null,
    [studentsQuery.data, studentId]
  );
  const selectedTemplate = useMemo(
    () => (templatesQuery.data ?? []).find((t) => t.id === templateId) ?? null,
    [templatesQuery.data, templateId]
  );
  const selectedClassName = useMemo(() => {
    if (selectedStudent?.class?.name) return selectedStudent.class.name;
    return (classesQuery.data ?? []).find((c) => c.id === classId)?.name ?? '—';
  }, [selectedStudent, classesQuery.data, classId]);

  const passMark = useMemo(() => {
    const g = schoolQuery.data?.settings?.grading as { passMark?: unknown } | undefined;
    const pm = Number(g?.passMark);
    return Number.isFinite(pm) ? pm : 10;
  }, [schoolQuery.data]);

  // --- Données du bulletin (calcul local — aucun endpoint preview-bulletin
  // --- côté backend : voir rapport de déviations) ----------------------------

  const gradesQuery = useQuery({
    queryKey: ['rc-grades', studentId, academicYear],
    enabled: previewRequested && !!studentId,
    queryFn: async (): Promise<GradeRow[]> => {
      const res = await api.get('/grades', { params: { studentId, limit: 500 } });
      const items = (res.data?.data?.items ?? []) as GradeRow[];
      return academicYear ? items.filter((g) => !g.academicYear || g.academicYear === academicYear) : items;
    },
  });

  const rankQuery = useQuery({
    queryKey: ['rc-rank', classId, academicYear, studentId],
    enabled: previewRequested && !!studentId && !!classId,
    queryFn: async (): Promise<{ rank: number | null; classSize: number; averages: Record<string, number | null> }> => {
      const classmates = (studentsQuery.data ?? []).filter((s) => s.id !== studentId);
      const allIds = [studentId, ...classmates.map((s) => s.id)];
      const results = await Promise.all(
        allIds.map(async (id) => {
          try {
            const res = await api.get('/grades', { params: { studentId: id, limit: 500 } });
            const items = ((res.data?.data?.items ?? []) as GradeRow[]).filter(
              (g) => g.status === 'PUBLISHED' || g.status === null || g.status === undefined || g.status === ''
            );
            const scoped = academicYear ? items.filter((g) => !g.academicYear || g.academicYear === academicYear) : items;
            const bySubject = new Map<string, { score: number; coefficient: number }[]>();
            for (const g of scoped) {
              const score = Number(g.score);
              if (!Number.isFinite(score)) continue;
              const list = bySubject.get(String(g.subjectId)) ?? [];
              list.push({ score, coefficient: num(g.coefficient, 1) || 1 });
              bySubject.set(String(g.subjectId), list);
            }
            let w = 0;
            let c = 0;
            for (const list of bySubject.values()) {
              const avg = weightedAvg(list);
              if (avg === null) continue;
              w += avg;
              c += 1;
            }
            return { id, avg: c > 0 ? Math.round((w / c) * 100) / 100 : null };
          } catch {
            return { id, avg: null as number | null };
          }
        })
      );
      const withAvg = results.filter((r) => r.avg !== null) as { id: string; avg: number }[];
      withAvg.sort((a, b) => b.avg - a.avg);
      const idx = withAvg.findIndex((r) => r.id === studentId);
      return {
        rank: idx >= 0 ? idx + 1 : null,
        classSize: (studentsQuery.data ?? []).length,
        averages: Object.fromEntries(results.map((r) => [r.id, r.avg])),
      };
    },
  });

  const attendanceQuery = useQuery({
    queryKey: ['rc-attendance', studentId],
    enabled: previewRequested && !!studentId,
    queryFn: async (): Promise<AttendanceRow[]> => {
      try {
        const res = await api.get('/attendance', { params: { studentId, limit: 500 } });
        return (res.data?.data?.items ?? []) as AttendanceRow[];
      } catch {
        return [];
      }
    },
  });

  // Référentiel matières (colonne `department` — absente = dégradation gracieuse
  // vers un groupe unique « Sans domaine »). Le backend ne fournit pas de
  // `domains` dans preview-bulletin : regroupement systématique côté client.
  const subjectsDirQuery = useQuery({
    queryKey: ['rc-subjects-dir'],
    enabled: previewRequested,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id?: string; name?: string; department?: string | null }[]> => {
      try {
        const res = await api.get('/subjects', { params: { limit: 500 } });
        return (res.data?.data?.items ?? []) as { id?: string; name?: string; department?: string | null }[];
      } catch {
        return [];
      }
    },
  });

  // Aperçu serveur (mêmes calculs que le PDF : domaines, appreciations
  // semestrielles, conduite). Repli gracieux sur le calcul local.
  const previewServerQuery = useQuery({
    queryKey: ['rc-preview-server', studentId, academicYear],
    enabled: previewRequested && !!studentId,
    retry: false,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<{
      appS1?: string | null;
      appS2?: string | null;
      conduct?: string | null;
      percentage?: number | null;
      rank?: number | null;
      classSize?: number | null;
    } | null> => {
      try {
        const res = await api.post('/document-builder/preview-bulletin', {
          studentId,
          academicYear: academicYear || undefined,
        });
        return (res.data?.data ?? null) as {
          appS1?: string | null;
          appS2?: string | null;
          conduct?: string | null;
          percentage?: number | null;
          rank?: number | null;
          classSize?: number | null;
        } | null;
      } catch {
        return null;
      }
    },
  });

  const bulletin: BulletinData | null = useMemo(() => {
    if (!previewRequested || !selectedStudent) return null;
    const items = (gradesQuery.data ?? []).filter(
      (g) => g.status === 'PUBLISHED' || g.status === null || g.status === undefined || g.status === ''
    );
    // Matière → domaine : priorité au department embarqué dans la note,
    // repli sur le référentiel /subjects, sinon groupe « Sans domaine ».
    const deptById = new Map<string, string>();
    const deptByName = new Map<string, string>();
    for (const s of subjectsDirQuery.data ?? []) {
      const d = (s.department ?? '').trim();
      if (!d) continue;
      if (s.id) deptById.set(String(s.id), d);
      if (s.name) deptByName.set(String(s.name).toLowerCase(), d);
    }
    const resolveDomain = (subjectId: string, name: string, embedded?: string | null): string | null => {
      const e = (embedded ?? '').trim();
      if (e) return e;
      return deptById.get(subjectId) ?? deptByName.get(name.toLowerCase()) ?? null;
    };
    const bySubject = new Map<string, { name: string; domain: string | null; coef: number; perTerm: { score: number; coefficient: number }[][] }>();
    const statusCount: Record<string, number> = {};
    for (const g of items) {
      const key = String(g.subject?.id ?? g.subjectId ?? g.id);
      statusCount[String(g.status ?? 'PUBLISHED')] = (statusCount[String(g.status ?? 'PUBLISHED')] ?? 0) + 1;
      const entry = bySubject.get(key) ?? {
        name: g.subject?.name ?? '—',
        domain: null as string | null,
        coef: num(g.coefficient, 1) || 1,
        perTerm: [[], [], []] as { score: number; coefficient: number }[][],
      };
      if (!entry.domain) entry.domain = resolveDomain(key, entry.name, g.subject?.department);
      const score = Number(g.score);
      if (Number.isFinite(score)) {
        const t = Math.min(3, Math.max(1, num(g.term, 1))) - 1;
        entry.perTerm[t].push({ score, coefficient: num(g.coefficient, 1) || 1 });
      }
      if (entry.coef === 1 && num(g.coefficient, 1) !== 1) entry.coef = num(g.coefficient, 1);
      bySubject.set(key, entry);
    }
    const subjects: SubjectCell[] = [...bySubject.entries()].map(([subjectId, e]) => {
      const terms = e.perTerm.map((list) => weightedAvg(list));
      const valid = terms.filter((t): t is number => t !== null);
      return {
        subjectId,
        name: e.name,
        domain: e.domain,
        coef: e.coef,
        terms: terms as (number | null)[],
        annual: valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100 : null,
      };
    });
    subjects.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const sumPresent = (vals: (number | null)[]): number | null => {
      const present = vals.filter((v): v is number => v !== null);
      return present.length > 0 ? Math.round(present.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    };
    // Regroupement par domaine (Domaine/Département de la matière).
    const grouped = new Map<string, SubjectCell[]>();
    for (const s of subjects) {
      const label = (s.domain ?? '').trim() || 'Sans domaine';
      const list = grouped.get(label) ?? [];
      list.push(s);
      grouped.set(label, list);
    }
    const domains: BulletinDomain[] = [...grouped.entries()].map(([name, list]) => {
      const subtotal = [0, 1, 2].map((t) => sumPresent(list.map((s) => s.terms[t])));
      const maxima = [0, 1, 2].map((t) => list.filter((s) => s.terms[t] !== null).length * 20);
      const annualSubtotal = sumPresent(list.map((s) => s.annual));
      const annualMaxima = list.filter((s) => s.annual !== null).length * 20;
      return { name, subjects: list, subtotal, maxima, annualSubtotal, annualMaxima };
    });
    domains.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const totals: (number | null)[] = [0, 1, 2].map((t) => {
      const vals = subjects.map((s) => s.terms[t]).filter((v): v is number => v !== null);
      if (vals.length === 0) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
    });
    const maxima = [0, 1, 2].map((t) => subjects.filter((s) => s.terms[t] !== null).length * 20);
    const annuals = subjects.map((s) => s.annual).filter((v): v is number => v !== null);
    const annualTotal = annuals.length > 0 ? Math.round(annuals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    const annualMaxima = subjects.filter((s) => s.annual !== null).length * 20;
    const percentage = annualTotal !== null && annualMaxima > 0 ? Math.round((annualTotal / annualMaxima) * 10000) / 100 : null;

    const att = attendanceQuery.data ?? [];
    const count = (st: string) => att.filter((a) => a.status === st).length;

    const autoDecision = percentage === null ? 'A_DELIBERER' : percentage >= 50 ? 'PROMU' : percentage >= 40 ? 'A_DELIBERER' : 'REDOUBLE';

    const srv = previewServerQuery.data ?? null;

    return {
      student: selectedStudent,
      className: selectedClassName,
      subjects,
      domains,
      totals,
      maxima,
      annualTotal,
      annualMaxima,
      percentage: percentage ?? srv?.percentage ?? null,
      rank: rankQuery.data?.rank ?? srv?.rank ?? null,
      classSize: rankQuery.data?.classSize ?? srv?.classSize ?? (studentsQuery.data ?? []).length,
      absences: att.length > 0 ? count('absent') : null,
      lates: att.length > 0 ? count('late') : null,
      excused: att.length > 0 ? count('excused') : null,
      decision,
      passMark,
      gradeStatus: statusCount,
      appS1: srv?.appS1 || null,
      appS2: srv?.appS2 || null,
      conduct: srv?.conduct || null,
      // La décision affichée privilégie le choix manuel de l'utilisateur.
      ...(decision === 'A_DELIBERER' ? { decision: autoDecision } : {}),
    };
  }, [
    previewRequested,
    selectedStudent,
    selectedClassName,
    gradesQuery.data,
    attendanceQuery.data,
    subjectsDirQuery.data,
    rankQuery.data,
    studentsQuery.data,
    previewServerQuery.data,
    decision,
    passMark,
  ]);

  const previewLoading = gradesQuery.isFetching || rankQuery.isFetching || attendanceQuery.isFetching;

  // --- Historique des bulletins générés --------------------------------------

  const historyQuery = useQuery({
    queryKey: ['rc-history'],
    queryFn: async (): Promise<GeneratedDoc[]> => {
      const res = await api.get('/document-builder/generated/list', {
        params: { type: 'bulletin', limit: 50 },
      });
      return (res.data?.data?.items ?? []) as GeneratedDoc[];
    },
  });

  const studentClassMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of studentsQuery.data ?? []) {
      map.set(s.id, s.class?.name ?? selectedClassName);
    }
    return map;
  }, [studentsQuery.data, selectedClassName]);

  // --- Mutations --------------------------------------------------------------

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/document-builder/seed-reference-templates');
      return res.data;
    },
    onSuccess: (d) => {
      addToast('success', `${d?.created ?? 0} modèle(s) créé(s), ${d?.skipped ?? 0} déjà présent(s)`);
      queryClient.invalidateQueries({ queryKey: ['rc-bulletin-templates'] });
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Création des modèles impossible')),
  });

  const generateOne = async (sid: string, tplId: string): Promise<GeneratedDoc> => {
    const res = await api.post('/document-builder/generate', {
      templateId: tplId,
      studentId: sid,
      overrides: { academicYear, decision, observation },
    });
    return res.data?.data?.document as GeneratedDoc;
  };

  const downloadGenerated = async (doc: GeneratedDoc) => {
    try {
      const res = await api.get(`/document-builder/generated/${doc.id}/download`, { responseType: 'blob' });
      downloadBlob(res.data, `${doc.title || 'bulletin'}.pdf`);
      addToast('success', 'Bulletin PDF téléchargé');
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Téléchargement du PDF impossible'));
    }
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!templateId || !studentId) throw new Error('Sélection incomplète');
      const doc = await generateOne(studentId, templateId);
      await downloadGenerated(doc);
      return doc;
    },
    onSuccess: () => {
      addToast('success', 'Bulletin PDF généré et téléchargé');
      queryClient.invalidateQueries({ queryKey: ['rc-history'] });
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Génération du PDF impossible')),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!templateId || !studentId) throw new Error('Sélection incomplète');
      const doc = await generateOne(studentId, templateId);
      await api.patch(`/document-builder/generated/${doc.id}/status`, { status: 'ARCHIVED' });
      return doc;
    },
    onSuccess: () => {
      addToast('success', 'Bulletin généré et archivé');
      queryClient.invalidateQueries({ queryKey: ['rc-history'] });
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Archivage impossible')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/document-builder/generated/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Document supprimé de l’historique');
      queryClient.invalidateQueries({ queryKey: ['rc-history'] });
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Suppression impossible')),
  });

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!studentId) throw new Error('Aucun élève sélectionné');
      const res = await api.post('/academic-years/promote', {
        items: [{ studentId, decision }],
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', `Décision « ${DECISION_LABELS[decision] ?? decision} » enregistrée (observation reprise à la génération et à l’impression)`);
      setShowDecisionModal(false);
    },
    onError: (err) => addToast('error', apiErrMsg(err, 'Enregistrement de la décision impossible')),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!templateId || !classId) throw new Error('Sélection incomplète');
      const pupils = studentsQuery.data ?? [];
      if (bulkMode === 'grouped') {
        const res = await api.post('/document-builder/generate-bulk', { templateId, classId });
        const failed = (res.data?.data?.failed ?? []) as { studentId: string; error: string }[];
        setBulkErrors(
          failed.map((f) => ({
            student: pupils.find((p) => p.id === f.studentId)?.lastName ?? f.studentId,
            error: f.error,
          }))
        );
        return { created: Number(res.data?.data?.created ?? 0), mode: 'grouped' as const };
      }
      // Boucle individuelle : un PDF par élève, progression + erreurs par item.
      setBulkErrors([]);
      setBulkProgress({ done: 0, total: pupils.length });
      const errors: { student: string; error: string }[] = [];
      let created = 0;
      for (const p of pupils) {
        try {
          await generateOne(p.id, templateId);
          created += 1;
        } catch (err) {
          errors.push({ student: `${p.firstName} ${p.lastName}`, error: apiErrMsg(err, 'Échec') });
        }
        setBulkProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setBulkErrors(errors);
      return { created, mode: 'loop' as const };
    },
    onSuccess: (r) => {
      addToast('success', `${r.created} bulletin(s) généré(s) (${r.mode === 'grouped' ? 'groupé' : 'individuel'})`);
      queryClient.invalidateQueries({ queryKey: ['rc-history'] });
      setBulkProgress(null);
    },
    onError: (err) => {
      addToast('error', apiErrMsg(err, 'Génération en masse impossible'));
      setBulkProgress(null);
    },
  });

  // --- Handlers -----------------------------------------------------------------

  const handlePreview = () => {
    if (!studentId) {
      addToast('error', 'Veuillez sélectionner un élève');
      return;
    }
    setPreviewRequested(true);
    gradesQuery.refetch();
    rankQuery.refetch();
    attendanceQuery.refetch();
  };

  const canPreview = !!studentId;

  // --- Rendu ----------------------------------------------------------------------

  const schoolName = schoolQuery.data?.name ?? '—';
  const schoolAddress = schoolQuery.data?.address ?? '';
  const schoolPhone = schoolQuery.data?.phone ?? '';
  const schoolSettings = (schoolQuery.data?.settings ?? {}) as Record<string, unknown>;

  return (
    <PageTransition>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .sf-bulletin-preview, .sf-bulletin-preview * { visibility: visible !important; }
          .sf-bulletin-preview { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; box-shadow: none !important; }
          .sf-no-print { display: none !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* En-tête */}
        <div className="sf-no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Bulletins scolaires</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              Prévisualisation RDC, génération PDF et historique
            </p>
          </div>
          {(templatesQuery.data ?? []).length === 0 && !templatesQuery.isLoading && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookMarked className="w-4 h-4" />}
              Modèles de référence
            </button>
          )}
        </div>

        {/* Sélecteurs */}
        <div className="sf-no-print card p-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Année scolaire</label>
              <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="input-field">
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Classe</label>
              <select
                value={classId}
                onChange={(e) => { setClassId(e.target.value); setStudentId(''); setTemplateId(''); setPreviewRequested(false); }}
                className="input-field"
              >
                <option value="">Sélectionner une classe</option>
                {(classesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={studentId}
                onChange={(e) => { setStudentId(e.target.value); setPreviewRequested(false); }}
                className="input-field"
                disabled={!classId}
              >
                <option value="">Sélectionner un élève</option>
                {(studentsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.lastName} {s.firstName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Modèle de bulletin{' '}
                {recommendedId && (
                  <span className="badge badge-success ml-1">Recommandé</span>
                )}
              </label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="input-field">
                <option value="">Sélectionner un modèle</option>
                {(templatesQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.version}){t.id === recommendedId ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {recommendedId && !templateId && (
                <p className="text-xs text-success mt-1">Modèle recommandé présélectionné pour cette classe</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button onClick={handlePreview} disabled={!canPreview || previewLoading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              {previewLoading ? 'Chargement…' : 'Prévisualiser'}
            </button>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={!templateId || !studentId || generateMutation.isPending}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Générer PDF
            </button>
            <button
              onClick={() => window.print()}
              disabled={!bulletin}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
            <button
              onClick={() => archiveMutation.mutate()}
              disabled={!templateId || !studentId || archiveMutation.isPending}
              className="btn-ghost flex items-center gap-2 disabled:opacity-50"
              title="Conserve le bulletin dans l’historique des documents générés"
            >
              {archiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              Archiver
            </button>
            <button
              onClick={() => setShowDecisionModal(true)}
              disabled={!studentId}
              className="btn-ghost flex items-center gap-2 disabled:opacity-50"
            >
              <Pencil className="w-4 h-4" /> Décision & observation
            </button>
          </div>
        </div>

        {/* Aperçu A4 */}
        {bulletin && (
          <div className="flex justify-center overflow-x-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="sf-bulletin-preview bg-white text-gray-900 shadow-xl w-full max-w-[820px] p-8 text-sm"
              style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
            >
              {/* En-tête ministériel */}
              <div className="text-center border-b-2 border-gray-900 pb-3">
                <p className="font-bold text-base">RÉPUBLIQUE DÉMOCRATIQUE DU CONGO</p>
                <p className="text-xs mt-0.5">MINISTÈRE DE L’ÉDUCATION NATIONALE</p>
                <p className="font-semibold mt-1">{schoolName}</p>
                <p className="text-xs text-gray-600">
                  {[schoolAddress, schoolPhone].filter(Boolean).join(' · ') || '—'}
                </p>
                {(typeof schoolSettings.province === 'string' || typeof schoolSettings.city === 'string') && (
                  <p className="text-xs text-gray-600">
                    {[schoolSettings.province, schoolSettings.city, schoolSettings.territory].filter(Boolean).map(String).join(' · ') || '—'}
                  </p>
                )}
                <p className="font-bold mt-2 text-base underline underline-offset-4">
                  BULLETIN SCOLAIRE — Année {academicYear || '—'}
                </p>
              </div>

              {/* Boîtes ID (matricule) */}
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold mr-1">N° ID :</span>
                  {(bulletin.student.studentId || '——————').split('').slice(0, 12).map((ch, i) => (
                    <span key={i} className="inline-flex items-center justify-center w-6 h-7 border border-gray-800 text-xs font-mono">
                      {ch === '—' ? '' : ch}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-20 border-2 border-dashed border-gray-400 flex items-center justify-center text-[10px] text-gray-500 text-center leading-tight">
                    QR<br />vérification<br />(dans le PDF)
                  </div>
                </div>
              </div>

              {/* Infos élève */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 border border-gray-800 p-3 text-[13px]">
                <p><span className="font-semibold">Nom :</span> {bulletin.student.lastName || '—'} {bulletin.student.firstName || ''}</p>
                <p><span className="font-semibold">Classe :</span> {bulletin.className || '—'}</p>
                <p><span className="font-semibold">Matricule :</span> {bulletin.student.studentId || '—'}</p>
                <p><span className="font-semibold">Année :</span> {academicYear || '—'}</p>
                <p><span className="font-semibold">Naissance :</span> {bulletin.student.dateOfBirth ? new Date(bulletin.student.dateOfBirth).toLocaleDateString('fr-FR') : '—'}</p>
                <p><span className="font-semibold">Sexe :</span> {bulletin.student.gender || '—'}</p>
              </div>

              {/* Tableau RDC multi-périodes */}
              <table className="w-full mt-4 border-collapse text-[12px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-800 px-2 py-1.5 text-left">BRANCHES</th>
                    <th className="border border-gray-800 px-2 py-1.5">1ère PÉR.</th>
                    <th className="border border-gray-800 px-2 py-1.5">2ème PÉR.</th>
                    <th className="border border-gray-800 px-2 py-1.5">3ème PÉR.</th>
                    <th className="border border-gray-800 px-2 py-1.5">MOY. ANNUELLE</th>
                    <th className="border border-gray-800 px-2 py-1.5">COEF</th>
                  </tr>
                </thead>
                <tbody>
                  {bulletin.subjects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border border-gray-800 px-2 py-4 text-center text-gray-500">
                        Aucune note publiée pour cette année scolaire
                      </td>
                    </tr>
                  ) : (
                    bulletin.domains.map((d) => (
                      <Fragment key={d.name}>
                        <tr key={`dom-${d.name}`} className="bg-gray-200">
                          <td colSpan={6} className="border border-gray-800 px-2 py-1 font-bold uppercase">
                            Domaine : {d.name}
                          </td>
                        </tr>
                        {d.subjects.map((s) => (
                          <tr key={s.subjectId}>
                            <td className="border border-gray-800 px-2 py-1 font-medium">{s.name || '—'}</td>
                            <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(s.terms[0])}</td>
                            <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(s.terms[1])}</td>
                            <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(s.terms[2])}</td>
                            <td className="border border-gray-800 px-2 py-1 text-center font-semibold">{fmtNum(s.annual)}</td>
                            <td className="border border-gray-800 px-2 py-1 text-center">{s.coef}</td>
                          </tr>
                        ))}
                        <tr key={`sub-${d.name}`} className="font-semibold bg-gray-50">
                          <td className="border border-gray-800 px-2 py-1">Sous-total — {d.name}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(d.subtotal[0])}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(d.subtotal[1])}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(d.subtotal[2])}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(d.annualSubtotal)}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">—</td>
                        </tr>
                        <tr key={`max-${d.name}`} className="font-semibold bg-gray-50">
                          <td className="border border-gray-800 px-2 py-1">Maxima — {d.name}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{d.maxima[0] || '—'}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{d.maxima[1] || '—'}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{d.maxima[2] || '—'}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">{d.annualMaxima || '—'}</td>
                          <td className="border border-gray-800 px-2 py-1 text-center">—</td>
                        </tr>
                      </Fragment>
                    ))
                  )}
                  <tr className="font-bold bg-gray-50">
                    <td className="border border-gray-800 px-2 py-1">MAXIMA GÉNÉRAUX</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{bulletin.maxima[0] || '—'}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{bulletin.maxima[1] || '—'}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{bulletin.maxima[2] || '—'}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{bulletin.annualMaxima || '—'}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">—</td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border border-gray-800 px-2 py-1">TOTAUX</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(bulletin.totals[0])}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(bulletin.totals[1])}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(bulletin.totals[2])}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">{fmtNum(bulletin.annualTotal)}</td>
                    <td className="border border-gray-800 px-2 py-1 text-center">—</td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border border-gray-800 px-2 py-1">POURCENTAGE</td>
                    <td colSpan={5} className="border border-gray-800 px-2 py-1 text-center">
                      {bulletin.percentage === null ? '—' : `${bulletin.percentage.toLocaleString('fr-FR')} %`}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border border-gray-800 px-2 py-1">PLACE</td>
                    <td colSpan={5} className="border border-gray-800 px-2 py-1 text-center">
                      {bulletin.rank === null ? '—' : `${bulletin.rank}e / ${bulletin.classSize}`}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1 font-bold">APPLICATION</td>
                    <td colSpan={5} className="border border-gray-800 px-2 py-1 text-center">
                      {bulletin.appS1 ?? bulletin.appS2 ? `${bulletin.appS1 ?? '—'} · ${bulletin.appS2 ?? '—'}` : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1 font-bold">CONDUITE</td>
                    <td colSpan={5} className="border border-gray-800 px-2 py-1 text-center">
                      {bulletin.conduct ??
                        (bulletin.absences === null && bulletin.lates === null
                          ? '—'
                          : `Absences : ${bulletin.absences ?? '—'} · Retards : ${bulletin.lates ?? '—'}`)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1 font-bold">SIGNATURE</td>
                    <td colSpan={5} className="border border-gray-800 px-2 py-1 text-center text-gray-500">—</td>
                  </tr>
                </tbody>
              </table>

              {/* Conduite + décision */}
              <div className="grid grid-cols-2 gap-3 mt-3 text-[13px]">
                <div className="border border-gray-800 p-2.5">
                  <p className="font-bold mb-1">CONDUITE</p>
                  <p>Absences : {bulletin.absences === null ? '—' : bulletin.absences} (dont justifiées : {bulletin.excused === null ? '—' : bulletin.excused})</p>
                  <p>Retards : {bulletin.lates === null ? '—' : bulletin.lates}</p>
                </div>
                <div className="border border-gray-800 p-2.5">
                  <p className="font-bold mb-1">DÉCISION DU JURY</p>
                  <p className="text-base font-bold">{DECISION_LABELS[bulletin.decision] ?? bulletin.decision}</p>
                  {observation && <p className="mt-1 italic">« {observation} »</p>}
                </div>
              </div>

              {canValidateGrades && Object.keys(bulletin.gradeStatus).length > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  Statut des notes prises en compte :{' '}
                  {Object.entries(bulletin.gradeStatus).map(([st, n]) => `${st} (${n})`).join(' · ')}
                  {' '}— seules les notes publiées (ou sans statut) comptent.
                </p>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-6 mt-8 text-center text-[12px]">
                <div>
                  <p className="font-semibold">Le Titulaire</p>
                  <div className="h-14" />
                  <p className="border-t border-gray-800 pt-1 text-gray-500">Nom & signature</p>
                </div>
                <div>
                  <p className="font-semibold">Le Préfet / Directeur</p>
                  <div className="h-14" />
                  <p className="border-t border-gray-800 pt-1 text-gray-500">Nom, signature & cachet</p>
                </div>
                <div>
                  <p className="font-semibold">Le Parent</p>
                  <div className="h-14" />
                  <p className="border-t border-gray-800 pt-1 text-gray-500">Signature</p>
                </div>
              </div>

              <p className="text-center text-[11px] text-gray-500 mt-6">
                Fait le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {selectedTemplate ? ` — Modèle « ${selectedTemplate.name} » v${selectedTemplate.version}` : ''}
              </p>
            </motion.div>
          </div>
        )}

        {/* Génération en masse */}
        <div className="sf-no-print card p-5">
          <h2 className="text-base font-semibold text-text dark:text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4" /> Génération en masse
          </h2>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Classe + modèle : PDFs individuels en boucle (avec progression et erreurs par élève) ou génération groupée.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="flex rounded-xl border border-border dark:border-white/10 overflow-hidden">
              <button
                onClick={() => setBulkMode('grouped')}
                className={cn('px-3 py-2 text-sm transition-colors', bulkMode === 'grouped' ? 'bg-primary-500 text-white' : 'text-muted dark:text-gray-400')}
              >
                Groupé (generate-bulk)
              </button>
              <button
                onClick={() => setBulkMode('loop')}
                className={cn('px-3 py-2 text-sm transition-colors', bulkMode === 'loop' ? 'bg-primary-500 text-white' : 'text-muted dark:text-gray-400')}
              >
                Individuels (boucle)
              </button>
            </div>
            <button
              onClick={() => bulkMutation.mutate()}
              disabled={!classId || !templateId || bulkMutation.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {bulkMutation.isPending ? 'Génération…' : `Générer pour ${(studentsQuery.data ?? []).length} élève(s)`}
            </button>
          </div>
          {bulkProgress && (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: bulkProgress.total > 0 ? `${(bulkProgress.done / bulkProgress.total) * 100}%` : '0%' }}
                />
              </div>
              <p className="text-xs text-muted dark:text-gray-400 mt-1">
                {bulkProgress.done} / {bulkProgress.total}
              </p>
            </div>
          )}
          {bulkErrors.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-sm">
              <p className="font-semibold text-danger flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> {bulkErrors.length} erreur(s)
              </p>
              <ul className="mt-1 space-y-0.5 text-danger/90">
                {bulkErrors.map((e, i) => (
                  <li key={i}>• {e.student} : {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Historique */}
        <div className="sf-no-print card overflow-hidden">
          <div className="px-5 py-4 border-b border-border dark:border-white/10">
            <h2 className="text-base font-semibold text-text dark:text-gray-100">Historique des bulletins générés</h2>
            <p className="text-sm text-muted dark:text-gray-400">{historyQuery.data?.length ?? 0} document(s)</p>
          </div>
          {historyQuery.isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="p-8 text-center text-sm text-muted dark:text-gray-400">Aucun bulletin généré pour le moment</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    {['Élève', 'Classe', 'Année', 'Modèle', 'Version', 'Date', 'Statut', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {(historyQuery.data ?? []).map((doc) => {
                    const meta = doc.metadata ?? {};
                    return (
                      <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">
                          {doc.student ? `${doc.student.lastName} ${doc.student.firstName}` : doc.title || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {(doc.studentId && studentClassMap.get(doc.studentId)) || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {typeof meta.academicYear === 'string' ? meta.academicYear : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{doc.template?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {typeof meta.templateVersion === 'number' ? `v${meta.templateVersion}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                          {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('badge', GEN_STATUS_CLASS[doc.status] ?? 'badge-warning')}>
                            {GEN_STATUS_LABEL[doc.status] ?? doc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canDownload && (
                              <button
                                onClick={() => downloadGenerated(doc)}
                                className="p-1.5 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg text-success transition-colors"
                                title="Télécharger le PDF"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                            {(doc.status === 'GENERATED' || doc.status === 'terminee') && (
                              <button
                                onClick={() => statusMutation.mutate({ id: doc.id, status: 'REVIEWED' })}
                                className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg text-primary-500 transition-colors"
                                title="Marquer comme relu"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {doc.status === 'REVIEWED' && canValidate && (
                              <button
                                onClick={() => statusMutation.mutate({ id: doc.id, status: 'VALIDATED' })}
                                className="p-1.5 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg text-success transition-colors"
                                title="Valider"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {doc.status === 'VALIDATED' && canPublish && (
                              <button
                                onClick={() => statusMutation.mutate({ id: doc.id, status: 'PUBLISHED' })}
                                className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg text-purple-500 transition-colors"
                                title="Publier"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            {doc.status === 'PUBLISHED' && canPublish && (
                              <button
                                onClick={() => statusMutation.mutate({ id: doc.id, status: 'ARCHIVED' })}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-muted transition-colors"
                                title="Archiver"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            {!['REVOKED', 'ARCHIVED'].includes(doc.status) && canDelete && (
                              <button
                                onClick={() => statusMutation.mutate({ id: doc.id, status: 'REVOKED' })}
                                className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg text-warning transition-colors"
                                title="Révoquer"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deleteMutation.mutate(doc.id)}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-danger transition-colors"
                                title="Révoquer / supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Décision + observation */}
      <Modal
        isOpen={showDecisionModal}
        onClose={() => setShowDecisionModal(false)}
        title={`Décision du jury — ${selectedStudent ? `${selectedStudent.lastName} ${selectedStudent.firstName}` : ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Décision</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)} className="input-field">
              {DECISIONS.map((d) => (
                <option key={d} value={d}>{DECISION_LABELS[d]}</option>
              ))}
            </select>
            <p className="text-xs text-muted dark:text-gray-400 mt-1.5 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Enregistrée via la délibération officielle (année scolaire).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Observation</label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              rows={3}
              className="input-field resize-y"
              placeholder="Ex : Travail sérieux, peut mieux faire en mathématiques…"
            />
            <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
              Reprise sur l’aperçu, à l’impression et comme paramètre de la prochaine génération PDF.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDecisionModal(false)} className="btn-ghost">Fermer</button>
            <button
              onClick={() => decisionMutation.mutate()}
              disabled={decisionMutation.isPending || !studentId}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {decisionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}
