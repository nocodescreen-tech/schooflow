import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Info, Loader2,
  Plus, RotateCcw, Save, Search, Send, UserCheck, XCircle,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { useAuthStore, hasPermission } from '../store/authStore';
import api from '../lib/api';
import { cn } from '../lib/utils';

/**
 * Admissions & inscriptions (§11, §12).
 *
 * The screen mirrors the backend state machine exactly, so nothing shown here
 * is a promise the API will not keep:
 *
 *   draft → submitted → under_review → accepted → enrolled
 *                          ├─────────→ waitlisted → (admitted) → accepted
 *                          └─────────→ rejected
 *
 * Deciding creates nothing. Only "Inscrire" turns a dossier into a student, and
 * only then may a temporary password or an activation code be handed out.
 */

interface DocumentDef { key: string; label: string }
interface ClassItem { id: string; name: string; level?: string | null }
interface YearRef { id: string; name: string; status: string }

interface Meta {
  statuses: Record<string, string>;
  documents: DocumentDef[];
  classes: ClassItem[];
  years: YearRef[];
  academicYear: YearRef | null;
  needsSetup: boolean;
}

interface Dossier {
  id: string;
  reference: string;
  status: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: 'M' | 'F' | null;
  birthPlace: string | null;
  nationality: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  guardianRelation: string | null;
  previousSchool: string | null;
  previousClass: string | null;
  previousAverage: string | null;
  documents: Record<string, boolean> | null;
  requestedClassId: string | null;
  requestedClass?: { id: string; name: string } | null;
  matricule: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  waitlistPosition: number | null;
  appliedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: Dossier[];
  total: number;
  page: number;
  pages: number;
  academicYear: YearRef | null;
  needsSetup: boolean;
  activeStudents: number;
}

interface StatsResponse {
  academicYear: YearRef | null;
  needsSetup: boolean;
  total: number;
  byStatus: Record<string, number>;
  completeFiles: number;
  activeStudents: number;
}

interface EnrollResult {
  enrollment: Dossier;
  student: { id: string; studentId: string; firstName: string; lastName: string; classId: string };
  account: { userId: string; username: string | null; temporaryPassword: string } | null;
  activationCode: { code: string; expiresAt: string } | null;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const STATUS_TONE: Record<string, string> = {
  draft: 'badge',
  submitted: 'badge-info',
  under_review: 'badge-warning',
  accepted: 'badge-success',
  waitlisted: 'badge-warning',
  rejected: 'badge-danger',
  enrolled: 'badge-success',
  withdrawn: 'badge',
};

const STATUS_FILTERS = ['draft', 'submitted', 'under_review', 'waitlisted', 'accepted', 'enrolled', 'rejected', 'withdrawn'];

const fmtDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('fr-FR') : '—';

function NeedsSetup({ activeStudents }: { activeStudents: number }) {
  return (
    <div className="card p-10 text-center">
      <ClipboardCheck className="w-9 h-9 text-muted mx-auto mb-3" />
      <h2 className="text-base font-semibold text-text dark:text-gray-100">Aucune année scolaire ouverte</h2>
      <p className="text-sm text-muted dark:text-gray-400 mt-1 max-w-lg mx-auto">
        Un dossier d’inscription se rattache à une année scolaire et à une classe de cette année. Créez
        l’année scolaire de l’établissement pour ouvrir les admissions.
      </p>
      <Link to="/app/settings" className="btn-primary inline-flex items-center gap-2 mt-5">
        <Plus className="w-4 h-4" />
        Configurer l’année scolaire
      </Link>
      {activeStudents > 0 && (
        <p className="text-xs text-muted dark:text-gray-500 mt-4">
          {activeStudents} élève(s) sont déjà enregistrés et apparîtront dans le registre dès que leur
          année sera active.
        </p>
      )}
    </div>
  );
}

const emptyForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '' as '' | 'M' | 'F',
  birthPlace: '',
  nationality: '',
  address: '',
  phone: '',
  email: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  guardianRelation: '',
  previousSchool: '',
  previousClass: '',
  previousAverage: '',
  requestedClassId: '',
  documents: {} as Record<string, boolean>,
};

export default function Enrollment() {
  const permissions = useAuthStore((s) => s.permissions);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const canCreate = hasPermission(permissions, 'enrollment', 'create');
  const canUpdate = hasPermission(permissions, 'enrollment', 'update');
  const canDecide = hasPermission(permissions, 'enrollment', 'decide');
  const canProvision = hasPermission(permissions, 'users', 'create_student');

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const [form, setForm] = useState({ ...emptyForm });
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Dossier | null>(null);
  const [detail, setDetail] = useState<Dossier | null>(null);
  const [decision, setDecision] = useState<{ dossier: Dossier; kind: 'accepted' | 'waitlisted' | 'rejected' } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionClass, setDecisionClass] = useState('');
  const [enrolling, setEnrolling] = useState<Dossier | null>(null);
  const [accountMode, setAccountMode] = useState<'none' | 'now' | 'activation_code'>('none');
  const [result, setResult] = useState<EnrollResult | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const meta = useQuery({
    queryKey: ['enrollment', 'meta'],
    queryFn: async (): Promise<Meta> => {
      const res = await api.get('/enrollment/meta');
      return res.data?.data;
    },
  });

  const list = useQuery({
    queryKey: ['enrollment', status, debounced],
    queryFn: async (): Promise<ListResponse> => {
      const res = await api.get('/enrollment', {
        params: { status: status || undefined, search: debounced || undefined, limit: 100 },
      });
      return res.data?.data;
    },
  });

  const stats = useQuery({
    queryKey: ['enrollment', 'stats'],
    queryFn: async (): Promise<StatsResponse> => {
      const res = await api.get('/enrollment/stats');
      return res.data?.data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['enrollment'] });
    queryClient.invalidateQueries({ queryKey: ['students'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/enrollment', {
        academicYearId: meta.data?.academicYear?.id,
        ...form,
        gender: form.gender || null,
        dateOfBirth: form.dateOfBirth || null,
        requestedClassId: form.requestedClassId || null,
        previousAverage: form.previousAverage || null,
      });
      return res.data?.data as { enrollment: Dossier };
    },
    onSuccess: (data) => {
      addToast('success', `Dossier ${data.enrollment.reference} créé`);
      setShowCreate(false);
      setForm({ ...emptyForm });
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Création impossible')),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await api.put(`/enrollment/${editing.id}`, {
        ...form,
        gender: form.gender || null,
        dateOfBirth: form.dateOfBirth || null,
        requestedClassId: form.requestedClassId || null,
        previousAverage: form.previousAverage || null,
      });
    },
    onSuccess: () => {
      addToast('success', 'Dossier mis à jour');
      setEditing(null);
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Enregistrement impossible')),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/enrollment/${id}/submit`); },
    onSuccess: () => {
      addToast('success', 'Dossier déposé');
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Dépôt impossible')),
  });

  const decideMutation = useMutation({
    mutationFn: async () => {
      if (!decision) return;
      await api.post(`/enrollment/${decision.dossier.id}/decide`, {
        decision: decision.kind,
        note: decisionNote.trim() || null,
        requestedClassId: decision.kind === 'rejected' ? null : decisionClass || null,
      });
    },
    onSuccess: () => {
      addToast('success', 'Décision enregistrée');
      setDecision(null);
      setDecisionNote('');
      setDecisionClass('');
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Décision impossible')),
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/enrollment/${id}/reopen`); },
    onSuccess: () => {
      addToast('success', 'Dossier remis en instruction');
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Réexamen impossible')),
  });

  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/enrollment/${id}/withdraw`); },
    onSuccess: () => {
      addToast('success', 'Dossier retiré');
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Retrait impossible')),
  });

  const enrollMutation = useMutation({
    mutationFn: async (): Promise<EnrollResult> => {
      if (!enrolling) throw new Error('Aucun dossier sélectionné');
      const res = await api.post(`/enrollment/${enrolling.id}/enroll`, { createAccount: accountMode });
      return res.data?.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setEnrolling(null);
      addToast('success', `${data.student.firstName} ${data.student.lastName} est inscrit(e)`);
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Inscription impossible')),
  });

  const docsOf = (d: Dossier) => d.documents ?? {};
  const documents = meta.data?.documents ?? [];
  const missingDocs = useMemo(() => {
    if (!detail) return [];
    const have = docsOf(detail);
    return documents.filter((doc) => !have[doc.key]).map((doc) => doc.label);
  }, [detail, documents]);

  const openEdit = (d: Dossier) => {
    setEditing(d);
    setForm({
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : '',
      gender: d.gender ?? '',
      birthPlace: d.birthPlace ?? '',
      nationality: d.nationality ?? '',
      address: d.address ?? '',
      phone: d.phone ?? '',
      email: d.email ?? '',
      guardianName: d.guardianName ?? '',
      guardianPhone: d.guardianPhone ?? '',
      guardianEmail: d.guardianEmail ?? '',
      guardianRelation: d.guardianRelation ?? '',
      previousSchool: d.previousSchool ?? '',
      previousClass: d.previousClass ?? '',
      previousAverage: d.previousAverage ?? '',
      requestedClassId: d.requestedClassId ?? '',
      documents: docsOf(d),
    });
  };

  const openDecision = (d: Dossier, kind: 'accepted' | 'waitlisted' | 'rejected') => {
    setDecision({ dossier: d, kind });
    setDecisionNote('');
    setDecisionClass(d.requestedClassId ?? '');
  };

  const needsSetup = meta.data?.needsSetup ?? false;
  const formInvalid = !form.firstName.trim() || !form.lastName.trim();

  if (needsSetup) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Admissions et inscriptions</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              Dossiers de candidature, admission, réinscription et transferts.
            </p>
          </div>
          <NeedsSetup activeStudents={list.data?.activeStudents ?? 0} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Admissions et inscriptions</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              Année {meta.data?.academicYear?.name} — {list.data?.total ?? 0} dossier(s) au registre
            </p>
          </div>
          {canCreate && (
            <button onClick={() => { setForm({ ...emptyForm }); setShowCreate(true); }} className="btn-primary flex items-center gap-2 self-start">
              <Plus className="w-4 h-4" />
              Nouveau dossier
            </button>
          )}
        </div>

        {stats.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {STATUS_FILTERS.filter((s) => s !== 'draft').slice(0, 7).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? '' : s)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition-colors',
                  status === s
                    ? 'border-primary-500/50 bg-primary-500/5'
                    : 'border-border dark:border-white/10 hover:border-primary-500/30'
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted dark:text-gray-500">
                  {meta.data?.statuses[s]}
                </p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{stats.data.byStatus[s] ?? 0}</p>
              </button>
            ))}
          </div>
        )}

        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un nom, une référence ou un tuteur"
              className="input-field pl-9"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-field sm:w-56">
            <option value="">Tous les statuts</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{meta.data?.statuses[s] ?? s}</option>
            ))}
          </select>
          {status && (
            <button onClick={() => setStatus('')} className="btn-secondary">
              <XCircle className="w-4 h-4" />
              Effacer
            </button>
          )}
        </div>

        <div className="card overflow-hidden">
          {list.isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
            </div>
          ) : list.isError ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
              <p className="text-sm text-danger mb-3">{getErrorMessage(list.error, 'Chargement impossible')}</p>
              <button onClick={() => list.refetch()} className="btn-secondary">Réessayer</button>
            </div>
          ) : (list.data?.items.length ?? 0) === 0 ? (
            <div className="p-10 text-center">
              <ClipboardCheck className="w-8 h-8 text-muted mx-auto mb-3" />
              <p className="text-sm font-medium text-text dark:text-gray-200">Aucun dossier</p>
              <p className="text-sm text-muted dark:text-gray-400 mt-1">
                {status || search
                  ? 'Aucun dossier ne correspond à ce filtre.'
                  : 'Ouvrez un premier dossier pour lancer les admissions de l’année.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Référence</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Candidat</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Tuteur</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Classe demandée</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Pièces</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {(list.data?.items ?? []).map((d) => {
                    const have = Object.values(docsOf(d)).filter(Boolean).length;
                    return (
                      <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-3 py-3">
                          <code className="text-xs px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted dark:text-gray-300">
                            {d.reference}
                          </code>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm text-text dark:text-gray-200">{d.lastName} {d.firstName}</p>
                          {d.matricule && (
                            <p className="text-xs text-muted dark:text-gray-400">{d.matricule}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">
                          {d.guardianName || '—'}
                          {d.guardianPhone && <p className="text-xs">{d.guardianPhone}</p>}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">
                          {d.requestedClass?.name ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">
                          {have}/{documents.length}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('badge', STATUS_TONE[d.status])}>{meta.data?.statuses[d.status]}</span>
                          {d.status === 'waitlisted' && d.waitlistPosition ? (
                            <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">
                              position {d.waitlistPosition}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => setDetail(d)}
                              className="btn-secondary !px-2.5 !py-1.5 text-xs"
                              title="Consulter le dossier"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            {canUpdate && ['draft', 'submitted', 'under_review'].includes(d.status) && (
                              <button onClick={() => openEdit(d)} className="btn-secondary !px-2.5 !py-1.5 text-xs" title="Modifier">
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canUpdate && d.status === 'draft' && (
                              <button
                                onClick={() => submitMutation.mutate(d.id)}
                                disabled={submitMutation.isPending}
                                className="btn-secondary !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                                title="Déposer le dossier"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Déposer
                              </button>
                            )}
                            {canDecide && ['submitted', 'under_review', 'waitlisted'].includes(d.status) && (
                              <>
                                <button
                                  onClick={() => openDecision(d, 'accepted')}
                                  className="btn-primary !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                                  title="Admettre"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Admettre
                                </button>
                                <button
                                  onClick={() => openDecision(d, 'waitlisted')}
                                  className="btn-secondary !px-2.5 !py-1.5 text-xs"
                                  title="Liste d’attente"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openDecision(d, 'rejected')}
                                  className="btn-danger !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                                  title="Refuser"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {canDecide && d.status === 'waitlisted' && (
                              <button
                                onClick={() => reopenMutation.mutate(d.id)}
                                disabled={reopenMutation.isPending}
                                className="btn-ghost !px-2.5 !py-1.5 text-xs"
                                title="Remettre en instruction"
                              >
                                Réexaminer
                              </button>
                            )}
                            {canDecide && d.status === 'accepted' && (
                              <button
                                onClick={() => { setAccountMode('none'); setEnrolling(d); }}
                                className="btn-primary !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
                                title="Créer la fiche élève"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Inscrire
                              </button>
                            )}
                            {canUpdate && !['enrolled', 'rejected', 'withdrawn'].includes(d.status) && (
                              <button
                                onClick={() => withdrawMutation.mutate(d.id)}
                                disabled={withdrawMutation.isPending}
                                className="btn-ghost !px-2.5 !py-1.5 text-xs"
                                title="Retirer le dossier"
                              >
                                Retirer
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

        <div className="flex items-start gap-2 text-xs text-muted dark:text-gray-400 px-1">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Admettre ou refuser ne crée aucun élève : seule l’étape « Inscrire » ouvre la fiche scolaire,
            attribue le matricule et, si vous le demandez, remet le mot de passe temporaire ou un code
            d’activation. Un dossier refusé n’est jamais supprimé.
          </p>
        </div>
      </div>

      {/* ─── Create / edit dossier ─── */}
      <Modal
        isOpen={showCreate || !!editing}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        title={editing ? `Dossier ${editing.reference}` : 'Nouveau dossier de candidature'}
        size="lg"
      >
        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-text dark:text-gray-200">Candidat</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom" required value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
              <Field label="Prénom" required value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="Date de naissance" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Sexe</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'M' | 'F' | '' })} className="input-field">
                  <option value="">Non renseigné</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <Field label="Lieu de naissance" value={form.birthPlace} onChange={(v) => setForm({ ...form, birthPlace: v })} />
              <Field label="Nationalité" value={form.nationality} onChange={(v) => setForm({ ...form, nationality: v })} />
            </div>
            <Field label="Adresse" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Téléphone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-text dark:text-gray-200">Tuteur / responsable</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom du tuteur" value={form.guardianName} onChange={(v) => setForm({ ...form, guardianName: v })} />
              <Field label="Lien" value={form.guardianRelation} onChange={(v) => setForm({ ...form, guardianRelation: v })} placeholder="Père, mère, tuteur…" />
              <Field label="Téléphone du tuteur" value={form.guardianPhone} onChange={(v) => setForm({ ...form, guardianPhone: v })} />
              <Field label="Email du tuteur" type="email" value={form.guardianEmail} onChange={(v) => setForm({ ...form, guardianEmail: v })} />
            </div>
            <p className="text-xs text-muted dark:text-gray-400">
              Un nom de tuteur et un téléphone ou un email sont exigés pour déposer le dossier.
            </p>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-text dark:text-gray-200">Parcours antérieur</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Établissement précédent" value={form.previousSchool} onChange={(v) => setForm({ ...form, previousSchool: v })} />
              <Field label="Classe précédente" value={form.previousClass} onChange={(v) => setForm({ ...form, previousClass: v })} />
              <Field label="Moyenne" type="number" value={form.previousAverage} onChange={(v) => setForm({ ...form, previousAverage: v })} placeholder="Ex : 12,5" />
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Classe demandée
            </label>
            <select
              value={form.requestedClassId}
              onChange={(e) => setForm({ ...form, requestedClassId: e.target.value })}
              className="input-field"
            >
              <option value="">À définir lors de l’admission</option>
              {(meta.data?.classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-text dark:text-gray-200 mb-2">Pièces du dossier</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {documents.map((doc) => (
                <label
                  key={doc.key}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors',
                    form.documents[doc.key]
                      ? 'bg-primary-500/10 text-primary-500 border-primary-500/30'
                      : 'text-muted dark:text-gray-400 border-border dark:border-white/10'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!!form.documents[doc.key]}
                    onChange={() =>
                      setForm({ ...form, documents: { ...form.documents, [doc.key]: !form.documents[doc.key] } })
                    }
                    className="w-4 h-4 accent-blue-600"
                  />
                  {doc.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted dark:text-gray-400 mt-2">
              Cases cochées : pièces reçues. SchoolFlow ne stocke pas de fichier binaire ici ; le
              dépot de documents se fait dans le module Documents.
            </p>
          </fieldset>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowCreate(false); setEditing(null); }} className="btn-ghost">Annuler</button>
            {editing ? (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="btn-primary disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || formInvalid}
                className="btn-primary disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer le dossier
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ─── Read-only dossier view ─── */}
      <Modal
        isOpen={!!detail && !editing}
        onClose={() => setDetail(null)}
        title={detail ? `Dossier ${detail.reference}` : 'Dossier'}
        size="lg"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('badge', STATUS_TONE[detail.status])}>{meta.data?.statuses[detail.status]}</span>
              {detail.matricule && <span className="badge badge-success">Matricule {detail.matricule}</span>}
              {detail.status === 'waitlisted' && detail.waitlistPosition ? (
                <span className="badge badge-warning">Position {detail.waitlistPosition}</span>
              ) : null}
            </div>

            <Section title="Candidat">
              <Line label="Nom complet" value={`${detail.lastName} ${detail.firstName}`} />
              <Line label="Date de naissance" value={fmtDate(detail.dateOfBirth)} />
              <Line label="Sexe" value={detail.gender === 'M' ? 'Masculin' : detail.gender === 'F' ? 'Féminin' : '—'} />
              <Line label="Lieu de naissance" value={detail.birthPlace} />
              <Line label="Nationalité" value={detail.nationality} />
              <Line label="Adresse" value={detail.address} />
              <Line label="Téléphone" value={detail.phone} />
              <Line label="Email" value={detail.email} />
            </Section>

            <Section title="Tuteur">
              <Line label="Nom" value={detail.guardianName} />
              <Line label="Lien" value={detail.guardianRelation} />
              <Line label="Téléphone" value={detail.guardianPhone} />
              <Line label="Email" value={detail.guardianEmail} />
            </Section>

            <Section title="Parcours antérieur">
              <Line label="Établissement" value={detail.previousSchool} />
              <Line label="Classe" value={detail.previousClass} />
              <Line label="Moyenne" value={detail.previousAverage} />
            </Section>

            <div>
              <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">Pièces du dossier</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documents.map((doc) => {
                  const ok = !!docsOf(detail)[doc.key];
                  return (
                    <div key={doc.key} className="flex items-center gap-2 text-sm">
                      {ok ? (
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted shrink-0" />
                      )}
                      <span className={ok ? 'text-text dark:text-gray-200' : 'text-muted dark:text-gray-500'}>{doc.label}</span>
                    </div>
                  );
                })}
              </div>
              {missingDocs.length > 0 && (
                <p className="text-xs text-warning mt-2">
                  {missingDocs.length} pièce(s) manquante(s) : {missingDocs.join(', ')}.
                </p>
              )}
            </div>

            <Section title="Admission">
              <Line label="Classe demandée" value={detail.requestedClass?.name} />
              <Line label="Déposé le" value={fmtDate(detail.appliedAt)} />
              <Line label="Décidé le" value={fmtDate(detail.decidedAt)} />
              <Line label="Motif de la décision" value={detail.decisionNote} />
              <Line label="Créé le" value={fmtDate(detail.createdAt)} />
            </Section>
          </div>
        )}
      </Modal>

      {/* ─── Decision ─── */}
      <Modal
        isOpen={!!decision}
        onClose={() => setDecision(null)}
        title={
          decision?.kind === 'accepted' ? 'Admettre le candidat'
            : decision?.kind === 'waitlisted' ? 'Placer sur liste d’attente'
              : 'Refuser le dossier'
        }
      >
        {decision && (
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              {decision.dossier.lastName} {decision.dossier.firstName} — dossier{' '}
              <code className="text-xs">{decision.dossier.reference}</code>
            </p>

            {decision.kind !== 'rejected' && (
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Classe d’affectation <span className="text-danger">*</span>
                </label>
                <select value={decisionClass} onChange={(e) => setDecisionClass(e.target.value)} className="input-field">
                  <option value="">Sélectionner une classe de l’année</option>
                  {(meta.data?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {(meta.data?.classes ?? []).length === 0 && (
                  <p className="text-xs text-danger mt-1">
                    Aucune classe n’existe pour {meta.data?.academicYear?.name}. Créez-la avant d’admettre.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Note {decision.kind === 'rejected' && <span className="text-danger">*</span>}
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={3}
                className="input-field"
                placeholder={
                  decision.kind === 'rejected'
                    ? 'Motif obligatoire du refus'
                    : 'Observation interne (facultatif)'
                }
              />
            </div>

            <p className="text-xs text-muted dark:text-gray-400">
              Cette décision ne crée aucun élève. L’inscription reste une étape séparée.
            </p>

            <div className="flex justify-end gap-3">
              <button onClick={() => setDecision(null)} className="btn-ghost">Annuler</button>
              <button
                onClick={() => decideMutation.mutate()}
                disabled={
                  decideMutation.isPending ||
                  (decision.kind === 'rejected' ? !decisionNote.trim() : !decisionClass)
                }
                className={decision.kind === 'rejected' ? 'btn-danger disabled:opacity-50' : 'btn-primary disabled:opacity-50'}
              >
                {decideMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer la décision
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Enroll: the only step that creates a student ─── */}
      <Modal isOpen={!!enrolling} onClose={() => setEnrolling(null)} title="Inscrire l’élève">
        {enrolling && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/30 p-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-text dark:text-gray-200">
                Cette étape crée la fiche élève, lui attribue son matricule et l’inscrit en{' '}
                <strong>{enrolling.requestedClass?.name ?? 'sa classe'}</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Compte élève
              </label>
              <select
                value={accountMode}
                onChange={(e) => setAccountMode(e.target.value as 'none' | 'now' | 'activation_code')}
                className="input-field"
                disabled={!canProvision}
              >
                <option value="none">Plus tard — pas de compte maintenant</option>
                <option value="now">Créer maintenant avec un mot de passe temporaire</option>
                <option value="activation_code">Remettre un code d’activation</option>
              </select>
              {!canProvision && (
                <p className="text-xs text-muted dark:text-gray-400 mt-1">
                  Vous ne disposez pas de la permission <code>users.create_student</code> : le dossier sera
                  inscrit sans compte élève.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEnrolling(null)} className="btn-ghost">Annuler</button>
              <button
                onClick={() => enrollMutation.mutate()}
                disabled={enrollMutation.isPending}
                className="btn-primary disabled:opacity-50 inline-flex items-center gap-2"
              >
                {enrollMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" />
                Inscrire
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Result: shown once, then gone ─── */}
      <Modal isOpen={!!result} onClose={() => setResult(null)} title="Élève inscrit">
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <p className="text-sm text-text dark:text-gray-200">
                {result.student.lastName} {result.student.firstName} est inscrit(e) sous le matricule{' '}
                <strong>{result.student.studentId}</strong>.
              </p>
            </div>

            {result.account && (
              <div className="rounded-xl border border-success/40 bg-success/5 p-4">
                <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">
                  Première connexion — communiquez ces informations une seule fois
                </p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">Identifiant</dt>
                    <dd className="font-mono text-text dark:text-gray-200">{result.account.username ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted dark:text-gray-400">Mot de passe temporaire</dt>
                    <dd className="font-mono text-text dark:text-gray-200">{result.account.temporaryPassword}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted dark:text-gray-400 mt-2">
                  Le mot de passe n’est stocké que sous forme de hash : il ne sera plus jamais consultable.
                  Un changement sera exigé à la première connexion.
                </p>
              </div>
            )}

            {result.activationCode && (
              <div className="rounded-xl border border-info/40 bg-info/5 p-4">
                <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">
                  Code d’activation à usage unique
                </p>
                <p className="font-mono text-lg tracking-wider text-text dark:text-gray-100">
                  {result.activationCode.code}
                </p>
                <p className="text-xs text-muted dark:text-gray-400 mt-2">
                  Expire le {new Date(result.activationCode.expiresAt).toLocaleString('fr-FR')}.
                </p>
              </div>
            )}

            {!result.account && !result.activationCode && (
              <p className="text-sm text-muted dark:text-gray-400">
                Aucun compte n’a été créé. Vous pourrez en générer un depuis la fiche de l’élève.
              </p>
            )}

            <div className="flex justify-end">
              <button onClick={() => setResult(null)} className="btn-primary">Fermer</button>
            </div>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field"
        placeholder={placeholder}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">{title}</p>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Line({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted dark:text-gray-400 shrink-0">{label}</dt>
      <dd className="text-text dark:text-gray-200 text-right">{value && String(value).trim() ? value : '—'}</dd>
    </div>
  );
}