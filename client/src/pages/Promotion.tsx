import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardList, Info, Loader2,
  PlayCircle, RefreshCw, ScrollText, TrendingUp, Users,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { useAuthStore, hasPermission } from '../store/authStore';
import api from '../lib/api';
import { cn } from '../lib/utils';

/**
 * Délibération / promotion / fin d'année (§ promotion module).
 *
 * The workflow is deliberately split in two, as the backend does:
 *   1. DÉLIBÉRER  — record decisions. Nothing moves.
 *   2. APPLIQUER   — move students. Only then is data mutated.
 * Preparing the next year is a third, independent step.
 *
 * Every figure on this page comes from the API; nothing is computed locally
 * and no placeholder is ever shown.
 */

type DecisionType = 'PROMU' | 'REDOUBLE' | 'TRANSFERE' | 'EXCLU' | 'A_DELIBERER';

const DECISIONS: Array<{ value: DecisionType; label: string; tone: string }> = [
  { value: 'PROMU', label: 'Promu', tone: 'text-success' },
  { value: 'REDOUBLE', label: 'Redouble', tone: 'text-warning' },
  { value: 'TRANSFERE', label: 'Transféré', tone: 'text-info' },
  { value: 'EXCLU', label: 'Exclu', tone: 'text-danger' },
  { value: 'A_DELIBERER', label: 'À délibérer', tone: 'text-muted' },
];

interface Candidate {
  studentId: string;
  studentName: string;
  studentNumber: string;
  classId: string | null;
  className: string | null;
  annualAverage: number;
  periodAverages: Array<{ periodId: string; name: string; average: number }>;
  mention: string;
  passed: boolean;
  rank: number | null;
  totalStudents: number;
  ungradedSubjects: number;
  decision: DecisionType | null;
  decisionStatus: string | null;
  proposedDecision: DecisionType;
}

interface Sheet {
  academicYearId: string;
  academicYearName: string;
  classId: string;
  className: string;
  total: number;
  promoted: number;
  repeated: number;
  transferred: number;
  excluded: number;
  undecided: number;
  passingRate: number;
  classAverage: number;
  candidates: Candidate[];
}

interface ClassItem { id: string; name: string; level?: string; section?: string; studentCount: number }
interface AcademicYearRef { id: string; name: string; status?: string }

interface Overview {
  school: { name: string | null };
  academicYear: AcademicYearRef | null;
  needsSetup: boolean;
  total: number; promoted: number; repeated: number; transferred: number;
  excluded: number; pending: number; activeStudents: number; decisionsRatio: number;
}
interface ClassesResponse { items: ClassItem[]; academicYear: AcademicYearRef | null; needsSetup: boolean }
interface RolloverResult {
  targetYearId: string;
  targetYearName: string;
  targetYearCreated: boolean;
  classesCreated: Array<{ sourceId: string; sourceName: string; newId: string; newName: string }>;
  assignmentsRolled: number;
  yearClosed: boolean;
  warnings: string[];
}
interface ApplyResult {
  applied: number; promoted: number; repeated: number; transferred: number;
  excluded: number; skipped: number; errors: Array<{ studentId: string; error: string }>;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border dark:border-white/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted dark:text-gray-500">{label}</p>
      <p className={cn('text-xl font-bold mt-0.5', tone ?? 'text-text dark:text-gray-100')}>{value}</p>
    </div>
  );
}

function NeedsSetup({ what }: { what: string }) {
  return (
    <div className="card p-10 text-center">
      <ClipboardList className="w-9 h-9 text-muted mx-auto mb-3" />
      <h2 className="text-base font-semibold text-text dark:text-gray-100">{what}</h2>
      <p className="text-sm text-muted dark:text-gray-400 mt-1 max-w-md mx-auto">
        Créez d’abord une année scolaire et sa structure de classes : la délibération travaille sur des
        résultats réels, jamais sur des données inventées.
      </p>
      <Link to="/app/settings" className="btn-primary inline-flex items-center gap-2 mt-5">
        <ArrowRightLeft className="w-4 h-4" />
        Ouvrir les paramètres de l’établissement
      </Link>
    </div>
  );
}

export default function Promotion() {
  const permissions = useAuthStore((s) => s.permissions);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const canView = hasPermission(permissions, 'promotion', 'view');
  const canManage = hasPermission(permissions, 'promotion', 'manage');

  const [classId, setClassId] = useState('');
  const [local, setLocal] = useState<Record<string, DecisionType>>({});
  const [confirmApply, setConfirmApply] = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  const [targetYearName, setTargetYearName] = useState('');
  const [result, setResult] = useState<ApplyResult | null>(null);

  const overview = useQuery({
    queryKey: ['promotion', 'overview'],
    enabled: canView,
    queryFn: async (): Promise<Overview> => {
      const res = await api.get('/promotion/overview');
      return res.data?.data;
    },
  });

  const classes = useQuery({
    queryKey: ['promotion', 'classes'],
    enabled: canView,
    queryFn: async (): Promise<ClassesResponse> => {
      const res = await api.get('/promotion/classes');
      return res.data?.data;
    },
  });

  const activeClassId = classId || classes.data?.items?.[0]?.id || '';

  const sheet = useQuery({
    queryKey: ['promotion', 'sheet', activeClassId],
    enabled: canView && !!activeClassId && classes.data?.needsSetup === false,
    queryFn: async (): Promise<Sheet> => {
      const res = await api.get('/promotion/sheet', { params: { classId: activeClassId } });
      return res.data?.data;
    },
  });

  const chosen = useMemo(
    () => (sheet.data?.candidates ?? []).map((c) => ({ ...c, picked: local[c.studentId] ?? c.decision ?? c.proposedDecision })),
    [sheet.data, local]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['promotion'] });
  };

  const saveOne = useMutation({
    mutationFn: async (candidate: Candidate) => {
      await api.post('/promotion/decisions', {
        studentId: candidate.studentId,
        decision: local[candidate.studentId] ?? candidate.decision ?? candidate.proposedDecision,
      });
    },
    onSuccess: invalidate,
    onError: (err: unknown, candidate: Candidate) =>
      addToast('error', `${candidate.studentName} : ${getErrorMessage(err, 'Enregistrement impossible')}`),
  });

  const applyMutation = useMutation({
    mutationFn: async (): Promise<ApplyResult> => {
      const res = await api.post('/promotion/apply');
      return res.data?.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setConfirmApply(false);
      addToast('success', `${data.applied} décision(s) appliquée(s)`);
      invalidate();
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, 'Application impossible'));
      setConfirmApply(false);
    },
  });

  const rolloverMutation = useMutation({
    mutationFn: async (): Promise<RolloverResult> => {
      const res = await api.post('/promotion/rollover/prepare', { targetYearName: targetYearName.trim() });
      return res.data?.data;
    },
    onSuccess: (data) => {
      addToast('success', `Année ${data.targetYearName} préparée`);
      setShowRollover(false);
      setTargetYearName('');
      invalidate();
    },
    onError: (err: unknown) => addToast('error', getErrorMessage(err, 'Préparation impossible')),
  });

  // A year has not been set up yet: say so plainly instead of showing zeroes.
  if (canView && overview.data?.needsSetup) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Délibération et promotion</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{overview.data.school.name}</p>
          </div>
          <NeedsSetup what="Aucune année scolaire active" />
          {overview.data.activeStudents > 0 && (
            <p className="text-xs text-muted dark:text-gray-400 px-1">
              {overview.data.activeStudents} élève(s) actifs sont déjà enregistrés. Ils rejoindront la première
              année scolaire dès qu’elle sera créée et rattachée à leurs classes.
            </p>
          )}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Délibération et promotion</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {overview.data?.academicYear?.name
                ? `Année ${overview.data.academicYear.name} — ${overview.data.activeStudents} élève(s) actifs`
                : 'Chargement…'}
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowRollover(true)}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Préparer l’année suivante
              </button>
              <button
                onClick={() => setConfirmApply(true)}
                disabled={(overview.data?.total ?? 0) === 0}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                <PlayCircle className="w-4 h-4" />
                Appliquer les décisions
              </button>
            </div>
          )}
        </div>

        {overview.data && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Stat label="Élèves actifs" value={overview.data.activeStudents} />
            <Stat label="Décisions" value={overview.data.total} />
            <Stat label="Promus" value={overview.data.promoted} tone="text-success" />
            <Stat label="Redoublants" value={overview.data.repeated} tone="text-warning" />
            <Stat label="Transférés" value={overview.data.transferred} tone="text-info" />
            <Stat label="Exclus" value={overview.data.excluded} tone="text-danger" />
          </div>
        )}

        {result && (
          <div className="card p-5 border-l-4 border-l-primary-500">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-primary-500" />
              <h2 className="text-base font-semibold text-text dark:text-gray-100">Dernier passage</h2>
              <button onClick={() => setResult(null)} className="ml-auto text-xs text-muted hover:underline">
                Masquer
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Stat label="Appliquées" value={result.applied} />
              <Stat label="Promus" value={result.promoted} tone="text-success" />
              <Stat label="Redoublants" value={result.repeated} tone="text-warning" />
              <Stat label="Transférés" value={result.transferred} tone="text-info" />
              <Stat label="Exclus" value={result.excluded} tone="text-danger" />
              <Stat label="Ignorées" value={result.skipped} />
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {result.errors.map((e) => (
                  <li key={e.studentId} className="flex items-start gap-2 text-xs text-danger">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{e.error}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted dark:text-gray-400 mt-4">
              L’historique de l’année close (notes, présences, évaluations) est conservé intégralement.
            </p>
          </div>
        )}

        <div className="card p-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Classe à délibérer
              </label>
              <select
                value={activeClassId}
                onChange={(e) => { setClassId(e.target.value); setLocal({}); }}
                className="input-field"
              >
                {(classes.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.studentCount} élève(s)
                  </option>
                ))}
              </select>
            </div>
            {sheet.data && (
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-muted dark:text-gray-400">
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  Moyenne : <strong className="text-text dark:text-gray-200">{sheet.data.classAverage}</strong>
                </span>
                <span className="text-muted dark:text-gray-400">
                  Réussite : <strong className="text-text dark:text-gray-200">{sheet.data.passingRate}%</strong>
                </span>
                <span className="text-muted dark:text-gray-400">
                  <Users className="w-4 h-4 inline mr-1" />
                  {sheet.data.total} élève(s)
                </span>
              </div>
            )}
          </div>
        </div>

        {classes.data && classes.data.items.length === 0 && (
          <div className="card p-10 text-center">
            <Users className="w-8 h-8 text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-text dark:text-gray-200">Aucune classe à délibérer</p>
            <p className="text-sm text-muted dark:text-gray-400 mt-1">
              Créez des classes rattachées à l’année scolaire {overview.data?.academicYear?.name} pour lancer
              la délibération.
            </p>
          </div>
        )}

        {sheet.isLoading && (
          <div className="card p-4 space-y-3">
            {Array(5).fill(0).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        )}

        {sheet.isError && (
          <div className="card p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
            <p className="text-sm text-danger mb-3">{getErrorMessage(sheet.error, 'Feuille de délibération indisponible')}</p>
            <button onClick={() => sheet.refetch()} className="btn-secondary">Réessayer</button>
          </div>
        )}

        {sheet.data && chosen.length === 0 && (
          <div className="card p-10 text-center">
            <ClipboardList className="w-8 h-8 text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-text dark:text-gray-200">Aucun élève dans cette classe</p>
          </div>
        )}

        {sheet.data && chosen.length > 0 && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Rang</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Moyenne</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Mention</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Périodes</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Décision</th>
                    {canManage && (
                      <th className="px-3 py-3 text-right text-xs font-semibold text-muted dark:text-gray-400 uppercase">Enregistrer</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {chosen.map((c) => {
                    const tone = DECISIONS.find((d) => d.value === c.picked)?.tone ?? 'text-muted';
                    return (
                      <tr key={c.studentId} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-3 py-3 text-sm font-semibold text-text dark:text-gray-200">
                          {c.rank ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm text-text dark:text-gray-200">{c.studentName}</p>
                          <p className="text-xs text-muted dark:text-gray-400">{c.studentNumber}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('text-sm font-semibold', c.passed ? 'text-success' : 'text-danger')}>
                            {c.annualAverage}
                          </span>
                          {c.ungradedSubjects > 0 && (
                            <span
                              title={`${c.ungradedSubjects} matière(s) sans note`}
                              className="ml-2 text-[11px] text-warning"
                            >
                              {c.ungradedSubjects} sans note
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">{c.mention}</td>
                        <td className="px-3 py-3 text-xs text-muted dark:text-gray-400">
                          {c.periodAverages.length === 0
                            ? '—'
                            : c.periodAverages.map((p) => `${p.name}: ${p.average}`).join(' · ')}
                        </td>
                        <td className="px-3 py-3">
                          {canManage ? (
                            <select
                              value={c.picked}
                              onChange={(e) =>
                                setLocal((s) => ({ ...s, [c.studentId]: e.target.value as DecisionType }))
                              }
                              className="input-field !py-1.5 !text-sm"
                            >
                              {DECISIONS.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn('text-sm font-medium', tone)}>
                              {DECISIONS.find((d) => d.value === c.picked)?.label ?? '—'}
                            </span>
                          )}
                          {c.decisionStatus && (
                            <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">{c.decisionStatus}</p>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() => saveOne.mutate(c)}
                              disabled={saveOne.isPending || !local[c.studentId]}
                              title={local[c.studentId] ? 'Enregistrer la décision' : 'Choisissez une décision'}
                              className="btn-secondary !px-3 !py-1.5 text-sm inline-flex items-center gap-1.5 disabled:opacity-40"
                            >
                              {saveOne.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScrollText className="w-3.5 h-3.5" />}
                              Enregistrer
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sheet.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Promus" value={sheet.data.promoted} tone="text-success" />
            <Stat label="Redoublants" value={sheet.data.repeated} tone="text-warning" />
            <Stat label="Transférés" value={sheet.data.transferred} tone="text-info" />
            <Stat label="Non décidés" value={sheet.data.undecided} tone="text-danger" />
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-muted dark:text-gray-400 px-1">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Enregistrer une décision ne déplace aucun élève. Seul « Appliquer les décisions » modifie les
            affectations, et l’année close conserve l’intégralité de ses notes et de ses présences.
          </p>
        </div>
      </div>

      {/* ─── Apply confirmation: this is the step that mutates students ─── */}
      <Modal isOpen={confirmApply} onClose={() => setConfirmApply(false)} title="Appliquer les décisions">
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/30 p-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-text dark:text-gray-200">
              Cette action déplace réellement les élèves vers leur classe de destination. Elle est
              irréversible depuis cette page.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Décisions enregistrées" value={overview.data?.total ?? 0} />
            <Stat label="À délibérer" value={overview.data?.pending ?? 0} tone="text-danger" />
          </div>
          {overview.data && overview.data.total < overview.data.activeStudents && (
            <p className="text-xs text-muted dark:text-gray-400">
              {overview.data.activeStudents - overview.data.total} élève(s) n’ont pas encore de décision
              enregistrée : ils resteront dans leur classe actuelle.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirmApply(false)} className="btn-ghost">Annuler</button>
            <button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="btn-primary disabled:opacity-50 inline-flex items-center gap-2"
            >
              {applyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <PlayCircle className="w-4 h-4" />
              Appliquer
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Rollover ─── */}
      <Modal isOpen={showRollover} onClose={() => setShowRollover(false)} title="Préparer l’année suivante">
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            Crée l’année cible et recopie la structure des classes. <strong className="text-text dark:text-gray-200">
              Aucun élève n’est déplacé à cette étape</strong> : vous pouvez continuer à délibérer l’année en
            cours pendant que la suivante se prépare.
          </p>
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Nom de l’année cible <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={targetYearName}
              onChange={(e) => setTargetYearName(e.target.value)}
              className="input-field"
              placeholder="Ex : 2027-2028"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowRollover(false)} className="btn-ghost">Annuler</button>
            <button
              onClick={() => rolloverMutation.mutate()}
              disabled={rolloverMutation.isPending || !targetYearName.trim()}
              className="btn-primary disabled:opacity-50 inline-flex items-center gap-2"
            >
              {rolloverMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <RefreshCw className="w-4 h-4" />
              Préparer
            </button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}