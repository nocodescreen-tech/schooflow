import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  School,
  Building2,
  Image as ImageIcon,
  LayoutGrid,
  GraduationCap,
  Users,
  BookOpen,
  CalendarRange,
  ClipboardList,
  Info,
  Layers,
  Receipt,
  FileText,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  PartyPopper,
  ArrowRight,
  ArrowLeft,
  Check,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../components/Toast';
import Modal from '../components/Modal';
import { cn } from '../lib/utils';

const TOTAL = 22;
const LS_KEY = 'schoolflow_onboarding_v2';

type ApiErr = { response?: { status?: number; data?: { error?: string } } };
const apiErrMsg = (err: unknown, fallback: string) =>
  (err as ApiErr)?.response?.data?.error ?? fallback;

// ---------------------------------------------------------------------------
// Référentiels RDC pré-remplis par type d'enseignement
// ---------------------------------------------------------------------------

interface TeachingType {
  id: string;
  label: string;
  desc: string;
  cycles: string[];
  niveaux: string[];
  filieres: string[];
  sections: string[];
  options: string[];
}

const TEACHING_TYPES: TeachingType[] = [
  {
    id: 'maternel', label: 'Maternel', desc: 'Éveil, 3 années',
    cycles: ['Cycle maternel'], niveaux: ['1ère maternelle', '2ème maternelle', '3ème maternelle'],
    filieres: [], sections: [], options: [],
  },
  {
    id: 'primaire', label: 'Primaire', desc: '6 années fondamentales',
    cycles: ['Primaire'], niveaux: ['1ère primaire', '2ème primaire', '3ème primaire', '4ème primaire', '5ème primaire', '6ème primaire'],
    filieres: [], sections: [], options: [],
  },
  {
    id: 'cteb', label: 'CTEB', desc: 'Cycle terminal de l’éducation de base',
    cycles: ['Tronc commun'], niveaux: ['7ème CTEB', '8ème CTEB'],
    filieres: ['Tronc commun'], sections: [], options: [],
  },
  {
    id: 'humanites', label: 'Humanités générales', desc: 'Secondaire général',
    cycles: ['Humanités'], niveaux: ['1ère Humanités', '2ème Humanités', '3ème Humanités', '4ème Humanités'],
    filieres: ['Scientifique', 'Littéraire', 'Pédagogie générale'],
    sections: ['Scientifique A', 'Scientifique B', 'Littéraire', 'Pédagogie'],
    options: ['Math-Physique', 'Biologie-Chimie', 'Latin-Philo', 'Pédagogie générale'],
  },
  {
    id: 'techniques', label: 'Techniques', desc: 'Secondaire technique',
    cycles: ['Technique'], niveaux: ['1ère Technique', '2ème Technique', '3ème Technique', '4ème Technique'],
    filieres: ['Technique industrielle', 'Technique commerciale', 'Technique agricole'],
    sections: ['Électricité', 'Électronique', 'Comptabilité', 'Secrétariat', 'Agronomie'],
    options: ['Électricité', 'Mécanique', 'Comptabilité', 'Informatique de gestion'],
  },
  {
    id: 'professionnelles', label: 'Professionnelles', desc: 'Secondaire professionnel',
    cycles: ['Professionnel'], niveaux: ['1ère Professionnelle', '2ème Professionnelle', '3ème Professionnelle'],
    filieres: ['Coupe et couture', 'Menuiserie', 'Maçonnerie'],
    sections: ['Coupe et couture', 'Menuiserie', 'Électricité bâtiment'],
    options: ['Coupe et couture', 'Menuiserie', 'Électricité bâtiment'],
  },
];

interface ModuleDef {
  code: string;
  name: string;
  description: string;
  core: boolean;
}

const MODULES: ModuleDef[] = [
  { code: 'core', name: 'Base', description: 'Élèves, classes, notes, présences — toujours actif.', core: true },
  { code: 'finance', name: 'Finance', description: 'Frais scolaires, paiements, caisse.', core: false },
  { code: 'parents', name: 'Parents', description: 'Portail et suivi des parents.', core: false },
  { code: 'discipline', name: 'Discipline', description: 'Incidents, convocations et sanctions.', core: false },
  { code: 'communication', name: 'Communication', description: 'Annonces et messagerie interne.', core: false },
  { code: 'calendar', name: 'Calendrier', description: 'Événements et calendrier scolaire.', core: false },
  { code: 'templates', name: 'Modèles de documents', description: 'Éditeur de bulletins et documents officiels.', core: false },
  { code: 'reports', name: 'Rapports & audit', description: 'Rapports, exports et journal d’audit.', core: false },
];

const STEP_META: { title: string; desc: string; icon: typeof School }[] = [
  { title: 'Votre compte', desc: 'Récapitulatif du compte de direction créé à l’inscription.', icon: Users },
  { title: 'Votre établissement', desc: 'Nom, adresse et contacts — repris sur tous les documents officiels.', icon: School },
  { title: 'Identité visuelle', desc: 'Logo de l’école et emblème officiel pour les bulletins.', icon: ImageIcon },
  { title: 'Type d’enseignement', desc: 'Sélectionnez les niveaux organisés (choix multiples).', icon: LayoutGrid },
  { title: 'Cycles', desc: 'Grands regroupements (ex : Primaire, Humanités). Noms modifiables.', icon: Layers },
  { title: 'Filières', desc: 'Orientations au sein des cycles (ex : Scientifique, Technique).', icon: Layers },
  { title: 'Sections', desc: 'Subdivisions des filières.', icon: Layers },
  { title: 'Options', desc: 'Options précises proposées aux élèves.', icon: Layers },
  { title: 'Niveaux', desc: 'Années d’études (ex : 1ère primaire, 3ème Humanités).', icon: Layers },
  { title: 'Classes', desc: 'Créez les classes : nom + niveau + section.', icon: Building2 },
  { title: 'Matières', desc: 'Nom, code et coefficient de chaque matière.', icon: BookOpen },
  { title: 'Année scolaire', desc: 'Nom et dates de l’année en cours.', icon: CalendarRange },
  { title: 'Périodes & notation', desc: 'Maxima par période et seuil de passage (settings.grading).', icon: ClipboardList },
  { title: 'Évaluation', desc: 'Comment fonctionne l’évaluation dans SchoolFlow.', icon: Info },
  { title: 'Modules', desc: 'Activez uniquement ce dont votre école a besoin.', icon: Layers },
  { title: 'Finance', desc: 'Types de frais pratiqués (inscription, minerval, transport…).', icon: Receipt },
  { title: 'Bulletins', desc: 'Modèles de bulletins RDC prêts à l’emploi.', icon: FileText },
  { title: 'Utilisateurs', desc: 'Créez les comptes de votre équipe.', icon: UserPlus },
  { title: 'Rôles', desc: 'Qui peut faire quoi dans SchoolFlow.', icon: ShieldCheck },
  { title: 'Vérification', desc: 'Contrôlez que tout est en place avant de démarrer.', icon: CheckCircle2 },
  { title: 'Création', desc: 'Finalisation des éléments restants.', icon: Loader2 },
  { title: 'Prêt !', desc: 'Votre établissement est configuré.', icon: PartyPopper },
];

interface Persisted {
  step: number;
  schoolId: string;
  types: string[];
  cycles: string[];
  filieres: string[];
  sections: string[];
  options: string[];
  niveaux: string[];
  modules: Record<string, boolean>;
}

function loadPersisted(schoolId: string): Persisted {
  const fallback: Persisted = {
    step: 0, schoolId, types: [], cycles: [], filieres: [],
    sections: [], options: [], niveaux: [],
    modules: { finance: true, parents: true, discipline: true, communication: true, calendar: true, templates: true, reports: true },
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Persisted>;
    if (p.schoolId && p.schoolId !== schoolId) return { ...fallback, schoolId };
    return { ...fallback, ...p, schoolId };
  } catch {
    return fallback;
  }
}

interface ClassRow { name: string; level: string; section: string }
interface SubjectRow { name: string; code: string; coefficient: string }
interface FeeTypeRow { name: string; amount: string }
interface UserRow { name: string; email: string; password: string; role: string }

const USER_ROLES = ['admin', 'director', 'teacher', 'accountant', 'receptionist'];

export default function Onboarding() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const { user, school } = useAuthStore();
  const schoolId = school?.id ?? '';

  const [persisted, setPersisted] = useState<Persisted>(() => loadPersisted(schoolId));
  const index = Math.max(0, Math.min(TOTAL - 1, persisted.step));
  const [direction, setDirection] = useState(1);

  // Formulaires
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', phone: '', email: '', province: '', city: '' });
  const [classRows, setClassRows] = useState<ClassRow[]>([{ name: '', level: '', section: '' }]);
  const [subjectRows, setSubjectRows] = useState<SubjectRow[]>([{ name: '', code: '', coefficient: '1' }]);
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '' });
  const [grading, setGrading] = useState({ periodMax: '20', examMax: '20', passMark: '10' });
  const [feeTypes, setFeeTypes] = useState<FeeTypeRow[]>([{ name: 'Minerval', amount: '' }]);
  const [userRows, setUserRows] = useState<UserRow[]>([{ name: '', email: '', password: '', role: 'teacher' }]);
  const [saving, setSaving] = useState(false);
  const [structureNotice, setStructureNotice] = useState(false);
  const [didSave, setDidSave] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [createLog, setCreateLog] = useState<{ label: string; ok: boolean }[]>([]);
  const [showSkipAll, setShowSkipAll] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...persisted, schoolId }));
    } catch { /* stockage indisponible */ }
  }, [persisted, schoolId]);

  const patch = (p: Partial<Persisted>) => setPersisted((prev) => ({ ...prev, ...p }));
  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    patch({ step: Math.max(0, Math.min(TOTAL - 1, next)) });
  };

  const markDone = (key: string) => setDidSave((p) => ({ ...p, [key]: true }));

  // Pré-remplissage RDC quand les types changent
  const toggleType = (id: string) => {
    const has = persisted.types.includes(id);
    const types = has ? persisted.types.filter((t) => t !== id) : [...persisted.types, id];
    const merge = (cur: string[], add: string[]) =>
      [...cur, ...add.filter((a) => !cur.includes(a))];
    if (!has) {
      const t = TEACHING_TYPES.find((x) => x.id === id);
      if (t) {
        patch({
          types,
          cycles: merge(persisted.cycles, t.cycles),
          niveaux: merge(persisted.niveaux, t.niveaux),
          filieres: merge(persisted.filieres, t.filieres),
          sections: merge(persisted.sections, t.sections),
          options: merge(persisted.options, t.options),
        });
        return;
      }
    }
    patch({ types });
  };

  // --- Écritures API réelles -------------------------------------------------

  const saveSchool = async (): Promise<boolean> => {
    if (!schoolForm.name.trim()) return false;
    try {
      await api.patch('/settings', {
        name: schoolForm.name.trim(),
        address: schoolForm.address,
        phone: schoolForm.phone,
        email: schoolForm.email,
        province: schoolForm.province,
        city: schoolForm.city,
      });
      markDone('school');
      return true;
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Enregistrement de l’établissement impossible'));
      return false;
    }
  };

  const saveGrading = async (): Promise<boolean> => {
    try {
      const cur = (await api.get('/settings')).data?.data?.school?.settings ?? {};
      const pm = Number(grading.passMark);
      const pMax = Number(grading.periodMax);
      const eMax = Number(grading.examMax);
      await api.patch('/settings', {
        settings: {
          ...(cur as Record<string, unknown>),
          grading: {
            ...(((cur as Record<string, unknown>).grading as Record<string, unknown> | undefined) ?? {}),
            ...(Number.isFinite(pm) ? { passMark: pm } : {}),
            maxima: {
              ...(Number.isFinite(pMax) ? { period: pMax } : {}),
              ...(Number.isFinite(eMax) ? { exam: eMax } : {}),
            },
          },
        },
      });
      markDone('grading');
      return true;
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Enregistrement de la notation impossible'));
      return false;
    }
  };

  /** Contrats /structure/* (parallèles) : tentative réelle, repli local honnête. */
  const pushStructure = async (kind: string, names: string[]): Promise<void> => {
    let missing = false;
    for (const name of names) {
      if (!name.trim()) continue;
      try {
        await api.post(`/structure/${kind}`, { name: name.trim() });
      } catch (err) {
        if ((err as ApiErr)?.response?.status === 404) missing = true;
        else addToast('error', apiErrMsg(err, `Création ${kind} impossible`));
      }
    }
    if (missing) setStructureNotice(true);
  };

  const saveClasses = async (): Promise<boolean> => {
    const rows = classRows.filter((r) => r.name.trim());
    if (rows.length === 0) return false;
    let ok = 0;
    for (const r of rows) {
      try {
        await api.post('/classes', {
          name: r.name.trim(),
          ...(r.level.trim() ? { level: r.level.trim() } : {}),
          ...(r.section.trim() ? { section: r.section.trim() } : {}),
        });
        ok += 1;
      } catch (err) {
        addToast('error', apiErrMsg(err, `Classe « ${r.name} » impossible`));
      }
    }
    if (ok > 0) {
      addToast('success', `${ok} classe(s) créée(s)`);
      markDone('classes');
      return true;
    }
    return false;
  };

  const saveSubjects = async (): Promise<boolean> => {
    const rows = subjectRows.filter((r) => r.name.trim());
    if (rows.length === 0) return false;
    let ok = 0;
    for (const r of rows) {
      try {
        await api.post('/subjects', {
          name: r.name.trim(),
          ...(r.code.trim() ? { code: r.code.trim() } : {}),
          coefficient: Number(r.coefficient) || 1,
        });
        ok += 1;
      } catch (err) {
        addToast('error', apiErrMsg(err, `Matière « ${r.name} » impossible`));
      }
    }
    if (ok > 0) {
      addToast('success', `${ok} matière(s) créée(s)`);
      markDone('subjects');
      return true;
    }
    return false;
  };

  const saveYear = async (): Promise<boolean> => {
    if (!yearForm.name.trim()) return false;
    try {
      await api.post('/academic-years', {
        name: yearForm.name.trim(),
        startDate: yearForm.startDate || undefined,
        endDate: yearForm.endDate || undefined,
      });
      addToast('success', 'Année scolaire créée');
      markDone('year');
      return true;
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Création de l’année impossible'));
      return false;
    }
  };

  const saveFeeTypes = async (): Promise<boolean> => {
    const rows = feeTypes.filter((r) => r.name.trim());
    if (rows.length === 0) return false;
    // POST /fees exige un studentId (frais par élève) : on stocke donc les
    // types de frais dans settings.finance via PATCH /settings (appel réel).
    try {
      const cur = (await api.get('/settings')).data?.data?.school?.settings ?? {};
      await api.patch('/settings', {
        settings: {
          ...(cur as Record<string, unknown>),
          finance: { feeTypes: rows.map((r) => ({ name: r.name.trim(), amount: Number(r.amount) || 0 })) },
        },
      });
      addToast('success', 'Types de frais enregistrés (applicables par élève dans le module Frais)');
      markDone('finance');
      return true;
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Enregistrement des frais impossible'));
      return false;
    }
  };

  const saveUsers = async (): Promise<boolean> => {
    const rows = userRows.filter((r) => r.name.trim() && r.email.trim() && r.password);
    if (rows.length === 0) return false;
    let ok = 0;
    for (const r of rows) {
      try {
        await api.post('/settings/users', {
          name: r.name.trim(), email: r.email.trim(), password: r.password, role: r.role,
        });
        ok += 1;
      } catch (err) {
        addToast('error', apiErrMsg(err, `Utilisateur « ${r.name} » impossible`));
      }
    }
    if (ok > 0) {
      addToast('success', `${ok} utilisateur(s) créé(s)`);
      markDone('users');
      return true;
    }
    return false;
  };

  const toggleModule = async (code: string, enable: boolean) => {
    patch({ modules: { ...persisted.modules, [code]: enable } });
    try {
      await api.post(`/modules/${code}/${enable ? 'enable' : 'disable'}`);
      addToast('success', `Module ${code} ${enable ? 'activé' : 'désactivé'}`);
    } catch (err) {
      if ((err as ApiErr)?.response?.status === 404) {
        addToast('error', 'Endpoint /modules indisponible — choix conservé localement');
      } else {
        addToast('error', apiErrMsg(err, 'Module impossible à changer'));
      }
    }
    markDone('modules');
  };

  const uploadLogo = async (file: File, field: 'logo' | 'emblem') => {
    try {
      if (field === 'logo') {
        const fd = new FormData();
        fd.append('logo', file); // contrat vérifié : settings.ts → upload.single('logo')
        await api.patch('/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        const fd = new FormData();
        fd.append('file', file); // contrat vérifié : document-builder.ts → upload.single('file')
        const res = await api.post('/document-builder/upload-image', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = res.data?.data?.url as string;
        const cur = (await api.get('/settings')).data?.data?.school?.settings ?? {};
        await api.patch('/settings', {
          settings: { ...(cur as Record<string, unknown>), emblem: url },
        });
      }
      addToast('success', field === 'logo' ? 'Logo mis à jour' : 'Emblème enregistré');
      markDone('identity');
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Téléversement impossible'));
    }
  };

  // Bulletins : modèles ensemencés côté backend
  const bulletinsQuery = useQuery({
    queryKey: ['ob-bulletin-templates'],
    enabled: index === 16,
    queryFn: async () => {
      const res = await api.get('/document-builder', { params: { category: 'bulletin' } });
      return (res.data?.data?.items ?? []) as { id: string; name: string }[];
    },
  });

  const seedBulletins = async () => {
    try {
      await api.post('/document-builder/seed-rdc-bulletins');
      addToast('success', 'Modèles de bulletins RDC créés');
      bulletinsQuery.refetch();
      markDone('bulletins');
    } catch (err) {
      addToast('error', apiErrMsg(err, 'Création des modèles impossible'));
    }
  };

  // Vérification : compteurs réels
  const countQuery = async (url: string, params?: Record<string, unknown>): Promise<number> => {
    try {
      const res = await api.get(url, { params });
      const d = res.data?.data;
      if (typeof d?.total === 'number') return d.total;
      if (Array.isArray(d?.items)) return d.items.length;
      return 0;
    } catch {
      return 0;
    }
  };

  const verifyQuery = useQuery({
    queryKey: ['ob-verify'],
    enabled: index === 19,
    queryFn: async () => {
      const [classes, students, subjects, years, templates, users] = await Promise.all([
        countQuery('/classes'),
        countQuery('/students', { limit: 1 }),
        countQuery('/subjects'),
        countQuery('/academic-years'),
        countQuery('/document-builder', { category: 'bulletin' }),
        countQuery('/settings/users'),
      ]);
      return { classes, students, subjects, years, templates, users };
    },
  });

  const percent = useMemo(() => {
    const flags = ['school', 'year', 'grading', 'classes', 'subjects', 'users', 'finance', 'modules', 'bulletins'];
    const done = flags.filter((f) => didSave[f]).length;
    return Math.round((done / flags.length) * 100);
  }, [didSave]);

  // Continuer : sauvegarde de l’étape courante puis avance
  const onContinue = async () => {
    setSaving(true);
    try {
      switch (index) {
        case 1: await saveSchool(); break;
        case 4: await pushStructure('cycles', persisted.cycles); markDone('structure'); break;
        case 5: await pushStructure('filieres', persisted.filieres); break;
        case 6: await pushStructure('sections', persisted.sections); break;
        case 7: await pushStructure('options', persisted.options); break;
        case 8: await pushStructure('niveaux', persisted.niveaux); break;
        case 9: await saveClasses(); break;
        case 10: await saveSubjects(); break;
        case 11: await saveYear(); break;
        case 12: await saveGrading(); break;
        case 15: if (persisted.modules.finance !== false) await saveFeeTypes(); else markDone('finance'); break;
        case 17: await saveUsers(); break;
        default: break;
      }
    } finally {
      setSaving(false);
      if (index < TOTAL - 1) go(index + 1);
    }
  };

  // Création : rejoue tout ce qui n’a pas encore été enregistré
  const runCreation = async () => {
    setCreating(true);
    const log: { label: string; ok: boolean }[] = [];
    const step = async (label: string, fn: () => Promise<boolean>, skipIfDone: string) => {
      if (didSave[skipIfDone]) {
        log.push({ label: `${label} (déjà fait)`, ok: true });
        setCreateLog([...log]);
        return;
      }
      const ok = await fn();
      log.push({ label, ok });
      setCreateLog([...log]);
    };
    await step('Établissement', saveSchool, 'school');
    await step('Année scolaire', saveYear, 'year');
    await step('Notation', saveGrading, 'grading');
    await pushStructure('cycles', persisted.cycles);
    await pushStructure('niveaux', persisted.niveaux);
    log.push({ label: 'Structure (cycles, niveaux)', ok: !structureNotice });
    setCreateLog([...log]);
    await step('Classes', saveClasses, 'classes');
    await step('Matières', saveSubjects, 'subjects');
    await step('Frais', saveFeeTypes, 'finance');
    await step('Utilisateurs', saveUsers, 'users');
    setCreating(false);
    addToast('success', 'Création terminée — vérifiez l’étape précédente au besoin');
    markDone('creation');
  };

  const finish = () => {
    localStorage.setItem('schoolflow_onboarding_done', 'true');
    navigate('/app/dashboard');
  };

  const skipAll = () => {
    localStorage.setItem('schoolflow_onboarding_skipped', 'true');
    setShowSkipAll(false);
    navigate('/app/dashboard');
  };

  const meta = STEP_META[index];
  const Icon = meta.icon;
  const progress = Math.round(((index + 1) / TOTAL) * 100);
  const financeEnabled = persisted.modules.finance !== false;

  const editList = (
    values: string[],
    set: (v: string[]) => void,
    placeholder: string
  ) => (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={v}
            onChange={(e) => set(values.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className="input-field"
          />
          <button
            onClick={() => set(values.filter((_, j) => j !== i))}
            className="btn-icon hover:!text-danger shrink-0"
            aria-label="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={() => set([...values, ''])} className="btn-secondary flex items-center gap-1.5 text-sm">
        <Plus className="w-4 h-4" /> Ajouter
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-dark flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/10 text-primary-500 text-xs font-medium mb-3">
            <Check className="w-3.5 h-3.5" /> Bienvenue dans SCHOOLFLOW
          </div>
          <p className="text-sm text-muted dark:text-gray-400 tabular-nums">
            {index + 1} / 22 — {meta.title}
          </p>
        </div>

        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden mb-6">
          <motion.div
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
            className="h-full rounded-full bg-primary-500"
          />
        </div>

        <div className="relative">
          <div className="card relative overflow-hidden p-8 sm:p-10">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={index}
                custom={direction}
                initial={{ opacity: 0, x: direction * 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -20 }}
                transition={{ duration: 0.2, ease: [0, 0, 0, 1] }}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mb-6">
                  <Icon className="w-7 h-7 text-primary-500" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text dark:text-gray-100 mb-2">{meta.title}</h1>
                <p className="text-muted dark:text-gray-400 leading-relaxed mb-6">{meta.desc}</p>

                {structureNotice && (
                  <div className="p-3 mb-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-sm text-amber-700 dark:text-amber-400">
                    Endpoints <code>/structure/*</code> indisponibles côté backend : vos listes sont conservées localement et réutilisées pour les classes.
                  </div>
                )}

                {/* 0 — Compte */}
                {index === 0 && (
                  <dl className="card p-5 space-y-2 text-sm !shadow-none border border-border dark:border-white/10">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted dark:text-gray-400">Nom</dt>
                      <dd className="font-medium text-text dark:text-gray-200 text-right">{user?.name ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted dark:text-gray-400">Email</dt>
                      <dd className="font-medium text-text dark:text-gray-200 text-right break-all">{user?.email ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted dark:text-gray-400">Rôle</dt>
                      <dd className="font-medium text-text dark:text-gray-200 text-right">{user?.role ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted dark:text-gray-400">Établissement</dt>
                      <dd className="font-medium text-text dark:text-gray-200 text-right">{school?.name ?? '—'}</dd>
                    </div>
                  </dl>
                )}

                {/* 1 — Établissement */}
                {index === 1 && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(
                      [
                        { k: 'name', label: 'Nom de l’école *', ph: 'Collège Sainte-Marie' },
                        { k: 'address', label: 'Adresse', ph: 'Av. de la Nation 12' },
                        { k: 'phone', label: 'Téléphone', ph: '+243 …' },
                        { k: 'email', label: 'Email', ph: 'contact@ecole.cd' },
                        { k: 'province', label: 'Province', ph: 'Kinshasa' },
                        { k: 'city', label: 'Ville', ph: 'Kinshasa' },
                      ] as const
                    ).map((f) => (
                      <div key={f.k} className={f.k === 'name' ? 'sm:col-span-2' : ''}>
                        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">{f.label}</label>
                        <input
                          value={schoolForm[f.k]}
                          onChange={(e) => setSchoolForm((p) => ({ ...p, [f.k]: e.target.value }))}
                          placeholder={f.ph}
                          className="input-field"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 2 — Identité */}
                {index === 2 && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {(
                      [
                        { k: 'logo' as const, label: 'Logo de l’école', hint: 'PNG/JPG carré — bulletins, reçus' },
                        { k: 'emblem' as const, label: 'Emblème officiel', hint: 'Armoiries pour les bulletins' },
                      ]
                    ).map((b) => (
                      <label key={b.k} className="block p-5 rounded-2xl border-2 border-dashed border-border dark:border-white/10 hover:border-primary-500/40 cursor-pointer text-center transition-all">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted" />
                        <span className="block text-sm font-medium text-text dark:text-gray-200">{b.label}</span>
                        <span className="block text-xs text-muted dark:text-gray-400 mt-1">{b.hint}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadLogo(f, b.k);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {/* 3 — Types */}
                {index === 3 && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {TEACHING_TYPES.map((t) => {
                      const active = persisted.types.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleType(t.id)}
                          className={cn(
                            'p-4 rounded-2xl border-2 text-left transition-all',
                            active ? 'border-primary-500 bg-primary-500/5' : 'border-border dark:border-white/10 hover:border-primary-500/40'
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span className="font-semibold text-text dark:text-gray-100">{t.label}</span>
                            {active && <Check className="w-4 h-4 text-primary-500" />}
                          </span>
                          <span className="block text-xs text-muted dark:text-gray-400 mt-1">{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 4-8 — Listes dynamiques */}
                {index === 4 && editList(persisted.cycles, (v) => patch({ cycles: v }), 'Ex : Primaire, Humanités')}
                {index === 5 && editList(persisted.filieres, (v) => patch({ filieres: v }), 'Ex : Scientifique, Technique industrielle')}
                {index === 6 && editList(persisted.sections, (v) => patch({ sections: v }), 'Ex : Scientifique A, Comptabilité')}
                {index === 7 && editList(persisted.options, (v) => patch({ options: v }), 'Ex : Math-Physique, Coupe et couture')}
                {index === 8 && editList(persisted.niveaux, (v) => patch({ niveaux: v }), 'Ex : 1ère primaire, 3ème Humanités')}

                {/* 9 — Classes */}
                {index === 9 && (
                  <div className="space-y-2">
                    {classRows.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <input value={r.name} onChange={(e) => setClassRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nom (ex : 6e A)" className="input-field col-span-2 sm:col-span-1" />
                        <select value={r.level} onChange={(e) => setClassRows((p) => p.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))} className="input-field" aria-label="Niveau">
                          <option value="">Niveau —</option>
                          {persisted.niveaux.filter(Boolean).map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select>
                        <select value={r.section} onChange={(e) => setClassRows((p) => p.map((x, j) => (j === i ? { ...x, section: e.target.value } : x)))} className="input-field" aria-label="Section">
                          <option value="">Section —</option>
                          {persisted.sections.filter(Boolean).map((s) => (<option key={s} value={s}>{s}</option>))}
                        </select>
                        <button onClick={() => setClassRows((p) => p.filter((_, j) => j !== i))} className="btn-icon hover:!text-danger" aria-label="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setClassRows((p) => [...p, { name: '', level: '', section: '' }])} className="btn-secondary flex items-center gap-1.5 text-sm">
                      <Plus className="w-4 h-4" /> Ajouter une classe
                    </button>
                  </div>
                )}

                {/* 10 — Matières */}
                {index === 10 && (
                  <div className="space-y-2">
                    {subjectRows.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_auto] gap-2 items-center">
                        <input value={r.name} onChange={(e) => setSubjectRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nom (ex : Mathématiques)" className="input-field col-span-2 sm:col-span-1" />
                        <input value={r.code} onChange={(e) => setSubjectRows((p) => p.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="Code" className="input-field" />
                        <input type="number" min="1" value={r.coefficient} onChange={(e) => setSubjectRows((p) => p.map((x, j) => (j === i ? { ...x, coefficient: e.target.value } : x)))} placeholder="Coef" className="input-field" aria-label="Coefficient" />
                        <button onClick={() => setSubjectRows((p) => p.filter((_, j) => j !== i))} className="btn-icon hover:!text-danger" aria-label="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setSubjectRows((p) => [...p, { name: '', code: '', coefficient: '1' }])} className="btn-secondary flex items-center gap-1.5 text-sm">
                      <Plus className="w-4 h-4" /> Ajouter une matière
                    </button>
                  </div>
                )}

                {/* 11 — Année scolaire */}
                {index === 11 && (
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom *</label>
                      <input value={yearForm.name} onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))} placeholder="2026-2027" className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Début</label>
                      <input type="date" value={yearForm.startDate} onChange={(e) => setYearForm((p) => ({ ...p, startDate: e.target.value }))} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Fin</label>
                      <input type="date" value={yearForm.endDate} onChange={(e) => setYearForm((p) => ({ ...p, endDate: e.target.value }))} className="input-field" />
                    </div>
                  </div>
                )}

                {/* 12 — Périodes / notation */}
                {index === 12 && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted dark:text-gray-400">
                      SchoolFlow utilise 3 périodes (trimestres). Réglez les maxima et le seuil de passage, stockés dans <code>settings.grading</code>.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Maxima — période (/…)</label>
                        <input type="number" min="1" max="100" value={grading.periodMax} onChange={(e) => setGrading((p) => ({ ...p, periodMax: e.target.value }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Maxima — examen (/…)</label>
                        <input type="number" min="1" max="100" value={grading.examMax} onChange={(e) => setGrading((p) => ({ ...p, examMax: e.target.value }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Seuil de passage</label>
                        <input type="number" min="0" max="20" step="0.5" value={grading.passMark} onChange={(e) => setGrading((p) => ({ ...p, passMark: e.target.value }))} className="input-field" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 13 — Évaluation info */}
                {index === 13 && (
                  <div className="space-y-3 text-sm text-text dark:text-gray-200">
                    {[
                      'Les notes sont saisies par matière, par période (1ère, 2ème, 3ème) puis à l’examen.',
                      'Chaque note porte un coefficient ; la moyenne pondérée est calculée automatiquement.',
                      'Les bulletins combinent les 3 périodes + la moyenne annuelle, le rang et la décision du jury (Promu, Redouble, Exclu, Transféré).',
                      'Seules les notes publiées comptent dans les bulletins officiels.',
                    ].map((t, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                        <CheckCircle2 className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 14 — Modules */}
                {index === 14 && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {MODULES.map((m) => {
                      const on = m.core ? true : (persisted.modules[m.code] !== false);
                      return (
                        <div key={m.code} className={cn('p-4 rounded-2xl border-2 transition-all', on ? 'border-primary-500/60 bg-primary-500/5' : 'border-border dark:border-white/10')}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-text dark:text-gray-100 flex items-center gap-1.5">
                              {m.name}
                              {m.core && <Lock className="w-3.5 h-3.5 text-muted" aria-label="Verrouillé" />}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={m.name}
                              disabled={m.core}
                              onClick={() => toggleModule(m.code, !on)}
                              className={cn('relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60', on ? 'bg-primary-500' : 'bg-gray-300 dark:bg-white/20')}
                            >
                              <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                            </button>
                          </div>
                          <p className="text-xs text-muted dark:text-gray-400 mt-1">{m.description}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 15 — Finance */}
                {index === 15 && (
                  <div className="space-y-2">
                    {!financeEnabled && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10">
                        Module Finance désactivé — vous pouvez passer cette étape.
                      </p>
                    )}
                    {feeTypes.map((r, i) => (
                      <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
                        <input value={r.name} onChange={(e) => setFeeTypes((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Type (ex : Minerval)" className="input-field" />
                        <input type="number" min="0" value={r.amount} onChange={(e) => setFeeTypes((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="Montant" className="input-field" aria-label="Montant" />
                        <button onClick={() => setFeeTypes((p) => p.filter((_, j) => j !== i))} className="btn-icon hover:!text-danger" aria-label="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setFeeTypes((p) => [...p, { name: '', amount: '' }])} className="btn-secondary flex items-center gap-1.5 text-sm">
                      <Plus className="w-4 h-4" /> Ajouter un type de frais
                    </button>
                  </div>
                )}

                {/* 16 — Bulletins */}
                {index === 16 && (
                  <div className="space-y-3">
                    {bulletinsQuery.isLoading ? (
                      <div className="skeleton h-14 rounded-xl" />
                    ) : (bulletinsQuery.data ?? []).length === 0 ? (
                      <div className="text-center py-4">
                        <FileText className="w-10 h-10 text-muted mx-auto mb-3" />
                        <p className="text-sm text-muted dark:text-gray-400 mb-4">Aucun modèle de bulletin pour le moment</p>
                        <button onClick={seedBulletins} className="btn-primary">Créer les modèles RDC</button>
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {(bulletinsQuery.data ?? []).map((t) => (
                          <li key={t.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-white/5 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                            <span className="font-medium text-text dark:text-gray-200">{t.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 17 — Utilisateurs */}
                {index === 17 && (
                  <div className="space-y-3">
                    {userRows.map((r, i) => (
                      <div key={i} className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 grid sm:grid-cols-2 gap-2">
                        <input value={r.name} onChange={(e) => setUserRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nom complet" className="input-field" />
                        <input type="email" value={r.email} onChange={(e) => setUserRows((p) => p.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email" className="input-field" />
                        <input type="password" value={r.password} onChange={(e) => setUserRows((p) => p.map((x, j) => (j === i ? { ...x, password: e.target.value } : x)))} placeholder="Mot de passe (min. 6)" className="input-field" />
                        <div className="flex items-center gap-2">
                          <select value={r.role} onChange={(e) => setUserRows((p) => p.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} className="input-field flex-1" aria-label="Rôle">
                            {USER_ROLES.map((role) => (<option key={role} value={role}>{role}</option>))}
                          </select>
                          <button onClick={() => setUserRows((p) => p.filter((_, j) => j !== i))} className="btn-icon hover:!text-danger shrink-0" aria-label="Supprimer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setUserRows((p) => [...p, { name: '', email: '', password: '', role: 'teacher' }])} className="btn-secondary flex items-center gap-1.5 text-sm">
                      <Plus className="w-4 h-4" /> Ajouter un utilisateur
                    </button>
                  </div>
                )}

                {/* 18 — Rôles info */}
                {index === 18 && (
                  <div className="space-y-2 text-sm">
                    {[
                      ['Administrateur / Directeur', 'Tout gérer : structure, utilisateurs, finances, bulletins.'],
                      ['Secrétaire (receptionist)', 'Inscriptions, présences et documents courants.'],
                      ['Comptable (accountant)', 'Frais, paiements et caisse.'],
                      ['Enseignant (teacher)', 'Ses classes, notes et présences uniquement.'],
                      ['Parent', 'Portail de suivi de son enfant.'],
                    ].map(([role, desc]) => (
                      <div key={role} className="p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                        <p className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-primary-500" /> {role}
                        </p>
                        <p className="text-muted dark:text-gray-400 mt-0.5">{desc}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* 19 — Vérification */}
                {index === 19 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                        <div className="h-full bg-primary-500 transition-all" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-text dark:text-gray-200 tabular-nums">{percent} %</span>
                    </div>
                    {verifyQuery.isLoading ? (
                      <div className="space-y-2">
                        {[0, 1, 2].map((i) => (<div key={i} className="skeleton h-10 rounded-xl" />))}
                      </div>
                    ) : (
                      <ul className="space-y-1.5 text-sm">
                        {(
                          [
                            ['Classes', verifyQuery.data?.classes ?? 0],
                            ['Élèves (échantillon)', verifyQuery.data?.students ?? 0],
                            ['Matières', verifyQuery.data?.subjects ?? 0],
                            ['Années scolaires', verifyQuery.data?.years ?? 0],
                            ['Modèles de bulletins', verifyQuery.data?.templates ?? 0],
                            ['Utilisateurs', verifyQuery.data?.users ?? 0],
                          ] as [string, number][]
                        ).map(([label, n]) => (
                          <li key={label} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-white/5">
                            <span className="text-text dark:text-gray-200">{label}</span>
                            <span className={cn('font-semibold tabular-nums', n > 0 ? 'text-success' : 'text-muted')}>{n}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 20 — Création */}
                {index === 20 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted dark:text-gray-400">
                      Relance tout ce qui n’a pas encore été enregistré (utile si vous avez passé des étapes).
                    </p>
                    <button onClick={runCreation} disabled={creating} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {creating ? 'Création en cours…' : 'Lancer la création'}
                    </button>
                    {createLog.length > 0 && (
                      <ul className="space-y-1.5 text-sm">
                        {createLog.map((l, i) => (
                          <li key={i} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 dark:bg-white/5">
                            {l.ok ? <Check className="w-4 h-4 text-success shrink-0" /> : <Info className="w-4 h-4 text-warning shrink-0" />}
                            <span className="text-text dark:text-gray-200">{l.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 21 — Dashboard */}
                {index === 21 && (
                  <div className="text-center py-2">
                    <PartyPopper className="w-12 h-12 text-primary-500 mx-auto mb-4" />
                    <p className="text-muted dark:text-gray-400 mb-6">
                      {school?.name ? `${school.name} est prêt.` : 'Votre établissement est prêt.'} Retrouvez la progression à tout moment dans les Paramètres.
                    </p>
                    <button onClick={finish} className="btn-primary inline-flex items-center gap-2 text-base !px-8 !py-3">
                      Entrer dans SchoolFlow <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button onClick={() => go(index - 1)} disabled={index === 0} className="btn-ghost flex items-center gap-1.5 disabled:opacity-30">
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <div className="flex items-center gap-2">
            {index < TOTAL - 1 && (
              <>
                <button onClick={() => setShowSkipAll(true)} className="btn-ghost text-xs">
                  Tout passer
                </button>
                <button onClick={() => go(index + 1)} className="btn-ghost flex items-center gap-1.5">
                  Passer
                </button>
              </>
            )}
            {index < TOTAL - 1 ? (
              <button onClick={onContinue} disabled={saving} className="btn-secondary flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Continuer {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <Modal isOpen={showSkipAll} onClose={() => setShowSkipAll(false)} title="Passer la configuration ?" size="sm">
        <p className="text-sm text-muted dark:text-gray-400">
          Vous pourrez configurer votre établissement plus tard depuis les Paramètres (onglets Structure et Modules).
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={() => setShowSkipAll(false)} className="btn-ghost">Annuler</button>
          <button onClick={skipAll} className="btn-primary">Passer toute la configuration</button>
        </div>
      </Modal>
    </div>
  );
}
