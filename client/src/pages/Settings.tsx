import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  School,
  Users,
  Shield,
  Bell,
  Globe,
  Plus,
  Mail,
  Phone,
  CreditCard,
  Palette,
  Save,
  UserPlus,
  KeyRound,
  FileText,
  HardDrive,
  Lock,
  Monitor,
  Loader2,
  Check,
  AlertTriangle,
  Trash2,
  Pencil,
  Sun,
  Moon,
  Laptop,
  Layers,
  Puzzle,
  RefreshCw,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import Tooltip from '../components/Tooltip';
import { useToastStore } from '../components/Toast';
import { useThemeStore, type Theme } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { CURRENCY_LABELS, type CurrencyCode } from '../lib/currency';
import ModulesPanel from '../components/ModulesPanel';
import CurrencyPanel from '../components/CurrencyPanel';

type TabId =
  | 'account'
  | 'security'
  | 'school'
  | 'structure'
  | 'modules'
  | 'academic'
  | 'notifications'
  | 'appearance'
  | 'documents'
  | 'finance'
  | 'permissions'
  | 'storage'
  | 'sessions';

interface SchoolPayload {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  currency?: string;
  province?: string;
  city?: string;
  territory?: string;
  code?: string;
  emblem?: string;
  settings?: Record<string, unknown>;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const TABS: { id: TabId; label: string; icon: typeof School }[] = [
  { id: 'account', label: 'Compte', icon: Users },
  { id: 'security', label: 'Sécurité', icon: Lock },
  { id: 'school', label: 'Établissement', icon: School },
  { id: 'structure', label: 'Structure', icon: Layers },
  { id: 'modules', label: 'Modules', icon: Puzzle },
  { id: 'academic', label: 'Année scolaire', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Apparence', icon: Palette },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'finance', label: 'Finance', icon: CreditCard },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'storage', label: 'Stockage', icon: HardDrive },
  { id: 'sessions', label: 'Sessions', icon: Monitor },
];

const ROLES = [
  { id: 'admin', label: 'Administrateur' },
  { id: 'director', label: 'Directeur' },
  { id: 'receptionist', label: 'Secrétaire' },
  { id: 'accountant', label: 'Comptable' },
  { id: 'teacher', label: 'Enseignant' },
  { id: 'parent', label: 'Parent' },
];

interface AcademicYear {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

interface PromoClass {
  id: string;
  name: string;
}

interface PromoStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
  classId?: string | null;
}

const DECISIONS = ['PROMU', 'REDOUBLE', 'EXCLU', 'TRANSFERE', 'A_DELIBERER'] as const;
const decisionLabels: Record<string, string> = {
  PROMU: 'Promu', REDOUBLE: 'Redouble', EXCLU: 'Exclu',
  TRANSFERE: 'Transféré', A_DELIBERER: 'À délibérer',
};

type ApiErr = { response?: { data?: { error?: string } } };
const apiErrMsg = (err: unknown, fallback: string) =>
  (err as ApiErr)?.response?.data?.error ?? fallback;

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text dark:text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-muted dark:text-gray-400 mt-0.5">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5',
          checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-white/20'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const { theme, setTheme } = useThemeStore();
  const { user, school } = useAuthStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [tab, setTab] = useState<TabId>('school');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    academicYear: '',
    currency: 'USD' as CurrencyCode,
    province: '',
    city: '',
    territory: '',
    schoolCode: '',
    periodMax: '20',
    examMax: '20',
    emblem: '',
  });
  const [touched, setTouched] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'receptionist' });
  const [userError, setUserError] = useState('');
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [passMark, setPassMark] = useState('10');

  const { data: schoolData, isLoading } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data?.data?.school as SchoolPayload;
    },
  });

  const { data: users } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const res = await api.get('/settings/users');
      return (res.data?.data?.items ?? []) as UserRow[];
    },
  });

  // Hydrate the form from the database
  useEffect(() => {
    if (!schoolData) return;
    const s = (schoolData.settings ?? {}) as Record<string, string>;
    const grading = (schoolData.settings as unknown as { grading?: { passMark?: number; periodMax?: number; examMax?: number; maxima?: { period?: number; exam?: number } } })?.grading;
    const maxima = grading?.maxima ?? {};
    const now = new Date();
    const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const numOr = (v: unknown, fallback: string) => {
      const n = Number(v);
      return Number.isFinite(n) ? String(n) : fallback;
    };
    const strOr = (...vals: unknown[]) => {
      for (const v of vals) if (typeof v === 'string' && v) return v;
      return '';
    };
    setForm({
      name: schoolData.name ?? '',
      address: schoolData.address ?? '',
      phone: schoolData.phone ?? '',
      email: schoolData.email ?? '',
      academicYear: s.academicYear || `${start}-${start + 1}`,
      currency: (schoolData.currency as CurrencyCode) || 'USD',
      province: strOr(schoolData.province, s.province),
      city: strOr(schoolData.city, s.city),
      territory: strOr(schoolData.territory, s.territory),
      schoolCode: strOr(schoolData.code, s.schoolCode),
      periodMax: numOr(maxima.period ?? grading?.periodMax, '20'),
      examMax: numOr(maxima.exam ?? grading?.examMax, '20'),
      emblem: strOr(schoolData.emblem, s.emblem),
    });
    const pm = Number(grading?.passMark);
    setPassMark(Number.isFinite(pm) ? String(pm) : '10');
    updateSettings({ logo: schoolData.logo ?? undefined });
  }, [schoolData, updateSettings]);

  const nameError = touched && !form.name.trim() ? "Le nom de l'établissement est obligatoire" : '';
  const emailError =
    touched && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
      ? 'Adresse email invalide'
      : '';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const current = ((schoolData?.settings ?? {}) as Record<string, unknown>) || {};
      const pm = Number(passMark);
      const pMax = Number(form.periodMax);
      const eMax = Number(form.examMax);
      const res = await api.patch('/settings', {
        name: form.name.trim(),
        address: form.address,
        phone: form.phone,
        email: form.email,
        currency: form.currency,
        // Localisation RDC : colonnes dédiées (repli JSON historique).
        province: form.province,
        city: form.city,
        territory: form.territory,
        code: form.schoolCode,
        emblem: form.emblem || undefined,
        settings: {
          ...current,
          academicYear: form.academicYear,
          grading: {
            ...((current.grading as Record<string, unknown> | undefined) ?? {}),
            ...(Number.isFinite(pm) ? { passMark: pm } : {}),
            maxima: {
              ...(((current.grading as Record<string, unknown> | undefined)?.maxima as Record<string, unknown> | undefined) ?? {}),
              ...(Number.isFinite(pMax) ? { period: pMax } : {}),
              ...(Number.isFinite(eMax) ? { exam: eMax } : {}),
            },
          },
        },
      });
      return res.data?.data?.school as SchoolPayload;
    },
    onSuccess: (updated) => {
      addToast('success', 'Paramètres enregistrés');
      queryClient.invalidateQueries({ queryKey: ['school-settings'] });
      queryClient.invalidateQueries({ queryKey: ['setup-checklist'] });
      if (updated?.logo) updateSettings({ logo: updated.logo });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Enregistrement impossible'
      ),
  });

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await api.patch('/settings/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.school as SchoolPayload;
    },
    onSuccess: (updated) => {
      addToast('success', 'Logo mis à jour');
      updateSettings({ logo: updated?.logo });
      queryClient.invalidateQueries({ queryKey: ['school-settings'] });
    },
    onError: () => addToast('error', 'Upload impossible'),
  });

  // Emblème officiel (armoiries) : pas de colonne dédiée côté backend, on
  // réutilise le dépôt d'images du générateur de documents puis on stocke
  // l'URL dans school.settings.emblem.
  const emblemFileRef = useRef<HTMLInputElement | null>(null);
  const emblemMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/document-builder/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.url as string;
    },
    onSuccess: (url) => {
      setForm((p) => ({ ...p, emblem: url }));
      addToast('success', 'Emblème téléversé — pensez à Enregistrer');
    },
    onError: () => addToast('error', 'Upload impossible (type ou taille non autorisé)'),
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/settings/users', newUser);
      return res.data?.data?.user;
    },
    onSuccess: () => {
      addToast('success', 'Utilisateur créé');
      setShowAddUser(false);
      setNewUser({ name: '', email: '', password: '', role: 'receptionist' });
      setUserError('');
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
    onError: (err: unknown) =>
      setUserError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Création impossible'
      ),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await api.patch(`/settings/users/${id}`, patch);
      return res.data?.data?.user;
    },
    onSuccess: () => {
      addToast('success', 'Utilisateur mis à jour');
      setEditUser(null);
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
    onError: () => addToast('error', 'Mise à jour impossible'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/settings/users/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Utilisateur désactivé');
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Suppression impossible'
      ),
  });

  const prefMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const current = ((schoolData?.settings ?? {}) as Record<string, unknown>) || {};
      const res = await api.patch('/settings', { settings: { ...current, [key]: value } });
      return res.data?.data?.school as SchoolPayload;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['school-settings'] });
      if (updated) updateSettings({});
    },
    onError: () => addToast('error', 'Enregistrement impossible'),
  });

  const submitNewUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    if (!newUser.name.trim()) return setUserError('Le nom est obligatoire');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email))
      return setUserError('Adresse email invalide');
    if (newUser.password.length < 6)
      return setUserError('Le mot de passe doit contenir au moins 6 caractères');
    addUserMutation.mutate();
  };

  const storageInfo = [
    { label: 'Fichiers sur le serveur', value: 'Stockage local (uploads/)' },
    { label: 'Taille maximale par fichier', value: '10 Mo' },
    { label: 'Types acceptés', value: 'JPG, PNG, WEBP, PDF' },
    { label: 'ImageKit / R2', value: 'Non configuré' },
  ];

  // ---------------- Gouvernance : années académiques + promotion ----------------
  const [showYearModal, setShowYearModal] = useState(false);
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '' });
  const [yearAction, setYearAction] = useState<{ year: AcademicYear; action: 'close' | 'open' } | null>(null);
  const [fromClassId, setFromClassId] = useState('');
  const [promoRows, setPromoRows] = useState<Record<string, { toClassId: string; decision: string }>>({});

  const { data: academicYears = [], isLoading: yearsLoading } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async (): Promise<AcademicYear[]> => {
      const res = await api.get('/academic-years');
      return (res.data?.data?.items ?? []) as AcademicYear[];
    },
    enabled: tab === 'academic',
  });

  const { data: promoClasses = [] } = useQuery({
    queryKey: ['promo-classes'],
    queryFn: async (): Promise<PromoClass[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as PromoClass[];
    },
    enabled: tab === 'academic',
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ['promo-students'],
    queryFn: async (): Promise<PromoStudent[]> => {
      const res = await api.get('/students', { params: { limit: 500 } });
      return (res.data?.data?.items ?? []) as PromoStudent[];
    },
    enabled: tab === 'academic',
  });

  const promoList = fromClassId ? allStudents.filter((s) => s.classId === fromClassId) : [];

  const createYearMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/academic-years', {
        name: yearForm.name.trim(),
        startDate: yearForm.startDate || undefined,
        endDate: yearForm.endDate || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Année scolaire créée');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setShowYearModal(false);
      setYearForm({ name: '', startDate: '', endDate: '' });
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Création impossible')),
  });

  const toggleYearMutation = useMutation({
    mutationFn: async ({ year, action }: { year: AcademicYear; action: 'close' | 'open' }) => {
      const res = await api.post(`/academic-years/${year.id}/${action}`);
      return res.data;
    },
    onSuccess: (_d, vars) => {
      addToast('success', vars.action === 'close' ? 'Année clôturée' : 'Année ouverte');
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setYearAction(null);
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Opération impossible')),
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const items = promoList.map((s) => {
        const row = promoRows[s.id] ?? { toClassId: '', decision: 'A_DELIBERER' };
        return { studentId: s.id, toClassId: row.toClassId || undefined, decision: row.decision };
      });
      const res = await api.post('/academic-years/promote', { items });
      return res.data?.data?.results as Array<{ studentId: string; ok: boolean; error?: string }>;
    },
    onSuccess: (results) => {
      const failed = (results ?? []).filter((r) => !r.ok);
      if (failed.length === 0) {
        addToast('success', 'Délibération enregistrée');
      } else {
        addToast('error', `${failed.length} élève(s) en échec — ${failed[0]?.error ?? ''}`);
      }
      queryClient.invalidateQueries({ queryKey: ['promo-students'] });
      setPromoRows({});
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Délibération impossible')),
  });

  // ---------------- Structure académique + Modules ----------------
  // Backend contract (verify-before-use): GET /structure/{cycles,filieres,
  // sections,options,niveaux}, POST each, PATCH/DELETE /structure/{type}/:id,
  // PATCH /classes/:id/structure, POST /structure/seed-rdc, GET /modules,
  // POST /modules/:code/enable|disable, GET /modules/enabled.
  // Missing endpoints (404) → graceful local fallback, never faked.
  interface StructureItem { id: string; name: string; code?: string; parentId?: string | null }
  type StructureKind = 'cycles' | 'filieres' | 'sections' | 'options' | 'niveaux';

  const fetchStructure = async (kind: StructureKind): Promise<StructureItem[] | null> => {
    try {
      const res = await api.get(`/structure/${kind}`);
      return (res.data?.data?.items ?? []) as StructureItem[];
    } catch {
      return null;
    }
  };

  const { data: structCycles } = useQuery({
    queryKey: ['structure-cycles'], queryFn: () => fetchStructure('cycles'), enabled: tab === 'structure',
  });
  const { data: structFilieres } = useQuery({
    queryKey: ['structure-filieres'], queryFn: () => fetchStructure('filieres'), enabled: tab === 'structure',
  });
  const { data: structSections } = useQuery({
    queryKey: ['structure-sections'], queryFn: () => fetchStructure('sections'), enabled: tab === 'structure',
  });
  const { data: structOptions } = useQuery({
    queryKey: ['structure-options'], queryFn: () => fetchStructure('options'), enabled: tab === 'structure',
  });
  const { data: structNiveaux } = useQuery({
    queryKey: ['structure-niveaux'], queryFn: () => fetchStructure('niveaux'), enabled: tab === 'structure',
  });
  const structureBackendUp = structCycles !== null || structFilieres !== null || structSections !== null || structOptions !== null || structNiveaux !== null;

  const { data: structClasses = [], refetch: refetchStructClasses } = useQuery({
    queryKey: ['structure-classes'],
    queryFn: async (): Promise<{ id: string; name: string; level?: string | null; section?: string | null }[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as { id: string; name: string; level?: string | null; section?: string | null }[];
    },
    enabled: tab === 'structure',
  });

  const [structAssign, setStructAssign] = useState<Record<string, { level: string; section: string }>>({});

  const assignStructureMutation = useMutation({
    mutationFn: async ({ id, level, section }: { id: string; level: string; section: string }) => {
      // Preferred contract first, real Class fields as fallback.
      try {
        await api.patch(`/classes/${id}/structure`, { cycleId: level || undefined, sectionId: section || undefined, level, section });
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) {
          await api.patch(`/classes/${id}`, {
            ...(level ? { level } : {}),
            ...(section ? { section } : {}),
          });
        } else {
          throw err;
        }
      }
    },
    onSuccess: () => {
      addToast('success', 'Structure de la classe mise à jour');
      refetchStructClasses();
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Assignation impossible')),
  });

  const seedRdcMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/structure/seed-rdc');
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Structure RDC pré-remplie');
      queryClient.invalidateQueries({ queryKey: ['structure-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['structure-filieres'] });
      queryClient.invalidateQueries({ queryKey: ['structure-sections'] });
      queryClient.invalidateQueries({ queryKey: ['structure-options'] });
      queryClient.invalidateQueries({ queryKey: ['structure-niveaux'] });
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Endpoint POST /structure/seed-rdc indisponible côté backend')),
  });

  const deleteStructureMutation = useMutation({
    mutationFn: async ({ kind, id }: { kind: StructureKind; id: string }) => {
      await api.delete(`/structure/${kind}/${id}`);
    },
    onSuccess: (_d, vars) => {
      addToast('success', 'Élément supprimé');
      queryClient.invalidateQueries({ queryKey: [`structure-${vars.kind}`] });
    },
    onError: (err: unknown) => addToast('error', apiErrMsg(err, 'Suppression impossible')),
  });

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Paramètres</h1>
          <p className="text-muted dark:text-gray-400 mt-1">
            Configuration de votre établissement
          </p>
        </div>

        <div className="flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                tab === t.id
                  ? 'bg-white dark:bg-white/10 text-primary-500 shadow-sm'
                  : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-gray-200'
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* ---------------- Compte ---------------- */}
          {tab === 'account' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Mon compte</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Gérez vos informations personnelles et votre photo.
              </p>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => navigate('/app/profile')} className="btn-primary flex items-center gap-2">
                  <Users className="w-4 h-4" /> Ouvrir mon profil
                </button>
                <button onClick={() => navigate('/app/sessions')} className="btn-secondary flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> Voir mes sessions
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                  <p className="text-muted dark:text-gray-400 text-xs">Email</p>
                  <p className="text-text dark:text-gray-200 mt-0.5">{user?.email ?? '—'}</p>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5">
                  <p className="text-muted dark:text-gray-400 text-xs">Rôle</p>
                  <p className="text-text dark:text-gray-200 mt-0.5">{user?.role ?? '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- Sécurité ---------------- */}
          {tab === 'security' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Sécurité</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Mot de passe, sessions actives et journal d’audit.
              </p>
              <div className="space-y-3">
                <button onClick={() => navigate('/app/profile')} className="btn-secondary w-full sm:w-auto flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Changer mon mot de passe
                </button>
                <button onClick={() => navigate('/app/sessions')} className="btn-secondary w-full sm:w-auto flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> Gérer les sessions
                </button>
                <button onClick={() => navigate('/app/reports')} className="btn-secondary w-full sm:w-auto flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Consulter le journal d’audit
                </button>
              </div>
            </div>
          )}

          {/* ---------------- Établissement ---------------- */}
          {tab === 'school' && (
            <form
              className="card p-6"
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (!form.name.trim()) return;
                if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return;
                saveMutation.mutate();
              }}
            >
              <h3 className="font-semibold text-text dark:text-gray-100 mb-6">
                Informations de l’établissement
              </h3>

              {isLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-20 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-shrink-0">
                    <div className="w-32 h-32 rounded-2xl border border-border dark:border-white/10 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-white/5">
                      {schoolData?.logo ? (
                        <img src={schoolData.logo} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <School className="w-10 h-10 text-muted" />
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) logoMutation.mutate(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={logoMutation.isPending}
                      className="btn-secondary w-full mt-3 text-sm"
                    >
                      {logoMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Changer
                    </button>
                    <input
                      ref={emblemFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) emblemMutation.mutate(f);
                        e.target.value = '';
                      }}
                    />
                    <div className="w-32 h-32 mt-4 rounded-2xl border border-border dark:border-white/10 flex items-center justify-center overflow-hidden bg-gray-50 dark:bg-white/5">
                      {form.emblem ? (
                        <img src={form.emblem} alt="Emblème" className="w-full h-full object-contain" />
                      ) : (
                        <Shield className="w-10 h-10 text-muted" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => emblemFileRef.current?.click()}
                      disabled={emblemMutation.isPending}
                      className="btn-secondary w-full mt-3 text-sm disabled:opacity-50"
                    >
                      {emblemMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Emblème
                    </button>
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-1.5 text-center">
                      Armoiries officielles (bulletins)
                    </p>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Nom de l’établissement *
                      </label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        onBlur={() => setTouched(true)}
                        className={cn('input-field', nameError && '!border-danger')}
                      />
                      {nameError && <p className="text-xs text-danger mt-1">{nameError}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Adresse
                      </label>
                      <input
                        value={form.address}
                        onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                        className="input-field"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                          onBlur={() => setTouched(true)}
                          className={cn('input-field pl-10', emailError && '!border-danger')}
                        />
                      </div>
                      {emailError && <p className="text-xs text-danger mt-1">{emailError}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Téléphone
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <input
                          value={form.phone}
                          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                          className="input-field pl-10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Devise
                      </label>
                      <select
                        value={form.currency}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, currency: e.target.value as CurrencyCode }))
                        }
                        className="input-field"
                      >
                        {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Province
                      </label>
                      <input
                        value={form.province}
                        onChange={(e) => setForm((p) => ({ ...p, province: e.target.value }))}
                        className="input-field"
                        placeholder="Ex : Kinshasa"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Ville
                      </label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                        className="input-field"
                        placeholder="Ex : Kinshasa"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Territoire / Commune
                      </label>
                      <input
                        value={form.territory}
                        onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))}
                        className="input-field"
                        placeholder="Ex : Mont Ngafula"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Code école
                      </label>
                      <input
                        value={form.schoolCode}
                        onChange={(e) => setForm((p) => ({ ...p, schoolCode: e.target.value }))}
                        className="input-field"
                        placeholder="Ex : 1102-…"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Maxima — période (/…)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={form.periodMax}
                        onChange={(e) => setForm((p) => ({ ...p, periodMax: e.target.value }))}
                        className="input-field"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                        Maxima — examen (/…)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={form.examMax}
                        onChange={(e) => setForm((p) => ({ ...p, examMax: e.target.value }))}
                        className="input-field"
                      />
                      <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
                        Fusionnés dans Paramètres → notation (settings.grading).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          )}

          {/* ---------------- Structure académique ---------------- */}
          {tab === 'structure' && (
            <div className="space-y-6">
              <div className="card p-6">
                <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                  <div>
                    <h3 className="font-semibold text-text dark:text-gray-100">Structure académique</h3>
                    <p className="text-sm text-muted dark:text-gray-400 mt-1">
                      Cycles → niveaux et filières → sections → options. Assignation par classe via listes déroulantes.
                    </p>
                  </div>
                  <button
                    onClick={() => seedRdcMutation.mutate()}
                    disabled={seedRdcMutation.isPending}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {seedRdcMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Pré-remplir RDC
                  </button>
                </div>

                {!structureBackendUp && (
                  <div className="p-3 mb-5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-sm text-amber-700 dark:text-amber-400">
                    Endpoints <code>/structure/*</code> indisponibles côté backend — affichage reconstitué depuis les classes réelles. L’assignation utilise <code>PATCH /classes/:id</code> (champs <code>level</code>, <code>section</code>).
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  {(
                    [
                      { kind: 'cycles' as StructureKind, label: 'Cycles', items: structCycles },
                      { kind: 'niveaux' as StructureKind, label: 'Niveaux', items: structNiveaux },
                      { kind: 'filieres' as StructureKind, label: 'Filières', items: structFilieres },
                      { kind: 'sections' as StructureKind, label: 'Sections', items: structSections },
                      { kind: 'options' as StructureKind, label: 'Options', items: structOptions },
                    ]
                  ).map((g) => (
                    <div key={g.kind} className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                      <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">{g.label}</p>
                      {!g.items ? (
                        <p className="text-xs text-muted dark:text-gray-400">
                          {g.kind === 'niveaux'
                            ? [...new Set(structClasses.map((c) => c.level).filter(Boolean))].join(', ') || 'Aucun niveau (via classes)'
                            : g.kind === 'sections'
                              ? [...new Set(structClasses.map((c) => c.section).filter(Boolean))].join(', ') || 'Aucune section (via classes)'
                              : 'Non fourni par le backend'}
                        </p>
                      ) : g.items.length === 0 ? (
                        <p className="text-xs text-muted dark:text-gray-400">Aucun élément</p>
                      ) : (
                        <ul className="space-y-1">
                          {g.items.map((it) => (
                            <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-text dark:text-gray-200 truncate">
                                {it.name}{it.code ? ` (${it.code})` : ''}
                              </span>
                              <button
                                onClick={() => deleteStructureMutation.mutate({ kind: g.kind, id: it.id })}
                                className="btn-icon hover:!text-danger shrink-0"
                                title="Supprimer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5">
                    <p className="text-sm font-semibold text-text dark:text-gray-200 mb-2">Classes ({structClasses.length})</p>
                    <p className="text-xs text-muted dark:text-gray-400">
                      {structClasses.map((c) => c.name).join(', ') || 'Aucune classe'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Assigner la structure aux classes</h3>
                <p className="text-sm text-muted dark:text-gray-400 mb-5">
                  Niveau et section par classe (enregistré via l’API Classes).
                </p>
                {structClasses.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune classe enregistrée</p>
                ) : (
                  <div className="space-y-2">
                    {structClasses.map((c) => {
                      const row = structAssign[c.id] ?? { level: c.level ?? '', section: c.section ?? '' };
                      const niveauOpts = structNiveaux?.map((n) => n.name) ?? [...new Set(structClasses.map((x) => x.level).filter(Boolean) as string[])];
                      const sectionOpts = structSections?.map((s) => s.name) ?? [...new Set(structClasses.map((x) => x.section).filter(Boolean) as string[])];
                      return (
                        <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5 flex-wrap">
                          <span className="text-sm font-medium text-text dark:text-gray-200 min-w-32">{c.name}</span>
                          <select
                            value={row.level}
                            onChange={(e) => setStructAssign((p) => ({ ...p, [c.id]: { ...row, level: e.target.value } }))}
                            className="input-field !w-auto !py-1.5 text-sm"
                            aria-label={`Niveau pour ${c.name}`}
                          >
                            <option value="">Niveau —</option>
                            {niveauOpts.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                          <select
                            value={row.section}
                            onChange={(e) => setStructAssign((p) => ({ ...p, [c.id]: { ...row, section: e.target.value } }))}
                            className="input-field !w-auto !py-1.5 text-sm"
                            aria-label={`Section pour ${c.name}`}
                          >
                            <option value="">Section —</option>
                            {sectionOpts.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => assignStructureMutation.mutate({ id: c.id, level: row.level, section: row.section })}
                            disabled={assignStructureMutation.isPending}
                            className="btn-secondary !px-3 !py-1.5 text-sm disabled:opacity-50"
                          >
                            Enregistrer
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------- Modules ---------------- */}
          {tab === 'modules' && <ModulesPanel />}

          {/* ---------------- Année scolaire ---------------- */}
          {tab === 'academic' && (
            <div className="space-y-6">
              <form
                className="card p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Année scolaire</h3>
                <p className="text-sm text-muted dark:text-gray-400 mb-5">
                  L’année active conditionne les bulletins, les frais et les absences.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                  <div>
                    <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                      Année scolaire
                    </label>
                    <input
                      value={form.academicYear}
                      onChange={(e) => setForm((p) => ({ ...p, academicYear: e.target.value }))}
                      placeholder="2025-2026"
                      className="input-field"
                    />
                    <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
                      Format attendu : 2025-2026
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                      Moyenne de passage (/20)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      value={passMark}
                      onChange={(e) => setPassMark(e.target.value)}
                      className="input-field"
                    />
                    <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
                      Seuil utilisé pour les moyennes et les délibérations (défaut : 10)
                    </p>
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Enregistrer
                  </button>
                </div>
              </form>

              <div className="card p-6">
                <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
                  <div>
                    <h3 className="font-semibold text-text dark:text-gray-100">Années académiques</h3>
                    <p className="text-sm text-muted dark:text-gray-400 mt-1">
                      Une seule année peut être active à la fois.
                    </p>
                  </div>
                  <button onClick={() => setShowYearModal(true)} className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nouvelle année
                  </button>
                </div>
                {yearsLoading ? (
                  <div className="space-y-3">
                    {[0, 1].map((i) => (
                      <div key={i} className="skeleton h-14 rounded-xl" />
                    ))}
                  </div>
                ) : academicYears.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-6">
                    Aucune année académique enregistrée
                  </p>
                ) : (
                  <div className="space-y-2">
                    {academicYears.map((y) => (
                      <div
                        key={y.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text dark:text-gray-200 flex items-center gap-2 flex-wrap">
                            {y.name}
                            {y.status === 'active' ? (
                              <span className="badge badge-success">Active</span>
                            ) : (
                              <span className="badge">Clôturée</span>
                            )}
                          </p>
                          <p className="text-xs text-muted dark:text-gray-400 mt-0.5">
                            {y.startDate ? new Date(y.startDate).toLocaleDateString('fr-FR') : '—'}
                            {' → '}
                            {y.endDate ? new Date(y.endDate).toLocaleDateString('fr-FR') : '—'}
                          </p>
                        </div>
                        {y.status === 'active' ? (
                          <button onClick={() => setYearAction({ year: y, action: 'close' })} className="btn-secondary !px-3 !py-1.5 text-sm shrink-0">
                            Clôturer
                          </button>
                        ) : (
                          <button onClick={() => setYearAction({ year: y, action: 'open' })} className="btn-secondary !px-3 !py-1.5 text-sm shrink-0">
                            Ouvrir
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Promotion / Délibération</h3>
                <p className="text-sm text-muted dark:text-gray-400 mb-5">
                  Sélectionnez la classe d’origine, puis décidez de l’orientation de chaque élève.
                </p>
                <div className="max-w-sm mb-4">
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Classe d’origine
                  </label>
                  <select
                    value={fromClassId}
                    onChange={(e) => { setFromClassId(e.target.value); setPromoRows({}); }}
                    className="input-field"
                  >
                    <option value="">Sélectionner une classe</option>
                    {promoClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {fromClassId && (
                  promoList.length === 0 ? (
                    <p className="text-sm text-muted dark:text-gray-400 text-center py-6">
                      Aucun élève dans cette classe
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto border border-border dark:border-white/10 rounded-xl">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Classe cible</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Décision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border dark:divide-white/5">
                            {promoList.map((s) => {
                              const row = promoRows[s.id] ?? { toClassId: '', decision: 'A_DELIBERER' };
                              return (
                                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                  <td className="px-3 py-2.5 text-sm font-medium text-text dark:text-gray-200">
                                    {s.firstName} {s.lastName}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <select
                                      value={row.toClassId}
                                      onChange={(e) => setPromoRows((p) => ({ ...p, [s.id]: { ...row, toClassId: e.target.value } }))}
                                      className="input-field !w-auto !py-1.5 text-sm"
                                      aria-label={`Classe cible pour ${s.firstName} ${s.lastName}`}
                                    >
                                      <option value="">—</option>
                                      {promoClasses.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <select
                                      value={row.decision}
                                      onChange={(e) => setPromoRows((p) => ({ ...p, [s.id]: { ...row, decision: e.target.value } }))}
                                      className="input-field !w-auto !py-1.5 text-sm"
                                      aria-label={`Décision pour ${s.firstName} ${s.lastName}`}
                                    >
                                      {DECISIONS.map((d) => (
                                        <option key={d} value={d}>{decisionLabels[d]}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={() => promoteMutation.mutate()}
                          disabled={promoteMutation.isPending}
                          className="btn-primary flex items-center gap-2 disabled:opacity-50"
                        >
                          {promoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Enregistrer la délibération
                        </button>
                      </div>
                    </>
                  )
                )}
              </div>
            </div>
          )}

          {/* ---------------- Notifications ---------------- */}
          {tab === 'notifications' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Notifications</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-4">
                Choisissez les événements qui génèrent une alerte dans l’application.
              </p>
              <div className="divide-y divide-border dark:divide-white/10">
                <Toggle
                  checked={(schoolData?.settings as Record<string, unknown>)?.notifications !== false}
                  onChange={(v) => prefMutation.mutate({ key: 'notifications', value: v })}
                  label="Notifications générales"
                  hint="Alertes dans la cloche de notification"
                />
                <Toggle
                  checked={(schoolData?.settings as Record<string, unknown>)?.absenceAlerts !== false}
                  onChange={(v) => prefMutation.mutate({ key: 'absenceAlerts', value: v })}
                  label="Alertes d’absence"
                  hint="Élèves accumulant des absences"
                />
                <Toggle
                  checked={(schoolData?.settings as Record<string, unknown>)?.paymentAlerts !== false}
                  onChange={(v) => prefMutation.mutate({ key: 'paymentAlerts', value: v })}
                  label="Alertes de paiement"
                  hint="Échéances dépassées et impayés"
                />
                <Toggle
                  checked={(schoolData?.settings as Record<string, unknown>)?.documentAlerts !== false}
                  onChange={(v) => prefMutation.mutate({ key: 'documentAlerts', value: v })}
                  label="Alertes documentaires"
                  hint="Bulletins et documents générés"
                />
              </div>
            </div>
          )}

          {/* ---------------- Apparence ---------------- */}
          {tab === 'appearance' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Apparence</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Thème de l’interface. Le mode Système suit le réglage de votre ordinateur.
              </p>

              <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
                {(
                  [
                    { id: 'light', label: 'Clair', icon: Sun },
                    { id: 'dark', label: 'Sombre', icon: Moon },
                    { id: 'system', label: 'Système', icon: Laptop },
                  ] as { id: Theme; label: string; icon: typeof Sun }[]
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = theme === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className={cn(
                        'p-5 rounded-2xl border-2 text-center transition-all',
                        active
                          ? 'border-primary-500 bg-primary-500/5'
                          : 'border-border dark:border-white/10 hover:border-primary-500/40'
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-6 h-6 mx-auto mb-2',
                          active ? 'text-primary-500' : 'text-muted'
                        )}
                      />
                      <span className="text-sm font-medium text-text dark:text-gray-200">
                        {opt.label}
                      </span>
                      {active && <Check className="w-4 h-4 mx-auto mt-2 text-primary-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------------- Documents ---------------- */}
          {tab === 'documents' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Documents</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Composez et gérez les modèles de documents officiels de votre établissement.
              </p>
              <div className="space-y-3">
                <button onClick={() => navigate('/app/document-builder')} className="btn-primary flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Ouvrir l’éditeur de documents
                </button>
                <button onClick={() => navigate('/app/documents')} className="btn-secondary flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Voir les documents générés
                </button>
                <button onClick={() => navigate('/app/vacation-tickets')} className="btn-secondary flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Billets de vacances
                </button>
              </div>
            </div>
          )}

          {/* ---------------- Finance ---------------- */}
          {tab === 'finance' && <CurrencyPanel />}

          {/* ---------------- Permissions / Utilisateurs ---------------- */}
          {tab === 'permissions' && (
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div>
                  <h3 className="font-semibold text-text dark:text-gray-100">Utilisateurs et rôles</h3>
                  <p className="text-sm text-muted dark:text-gray-400 mt-1">
                    Chaque utilisateur ne voit que les données de son établissement.
                  </p>
                </div>
                <button onClick={() => setShowAddUser(true)} className="btn-primary flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Ajouter
                </button>
              </div>

              {users && users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border dark:border-white/10">
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Utilisateur</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Rôle</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-white/5">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                          <td className="px-3 py-3">
                            <p className="text-sm font-medium text-text dark:text-gray-200">{u.name}</p>
                            <p className="text-xs text-muted dark:text-gray-400">{u.email}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className="badge badge-info">
                              {ROLES.find((r) => r.id === u.role)?.label ?? u.role}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={u.isActive ? 'badge badge-success' : 'badge'}>
                              {u.isActive ? 'Actif' : 'Désactivé'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip label="Modifier">
                                <button onClick={() => setEditUser(u)} className="btn-icon">
                                  <Pencil className="w-4 h-4" />
                                </button>
                              </Tooltip>
                              <Tooltip label={u.isActive ? 'Désactiver' : 'Réactiver'}>
                                <button
                                  onClick={() => updateUserMutation.mutate({ id: u.id, patch: { isActive: !u.isActive } })}
                                  className="btn-icon"
                                >
                                  {u.isActive ? <Lock className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                </button>
                              </Tooltip>
                              <Tooltip label="Supprimer">
                                <button
                                  onClick={() => deleteUserMutation.mutate(u.id)}
                                  className="btn-icon hover:!text-danger"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10">
                  <Users className="w-10 h-10 text-muted mx-auto mb-3" />
                  <p className="text-sm text-muted dark:text-gray-400 mb-4">
                    Aucun utilisateur enregistré
                  </p>
                  <button onClick={() => setShowAddUser(true)} className="btn-secondary">
                    Ajouter le premier utilisateur
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---------------- Stockage ---------------- */}
          {tab === 'storage' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Stockage des médias</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Emplacement et limites des fichiers téléversés.
              </p>
              <dl className="space-y-3 max-w-xl">
                {storageInfo.map((s) => (
                  <div key={s.label} className="flex items-center justify-between gap-4 py-2 border-b border-border dark:border-white/10 last:border-0">
                    <dt className="text-sm text-muted dark:text-gray-400">{s.label}</dt>
                    <dd className="text-sm font-medium text-text dark:text-gray-200 text-right">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* ---------------- Sessions ---------------- */}
          {tab === 'sessions' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Sessions actives</h3>
              <p className="text-sm text-muted dark:text-gray-400 mb-5">
                Consultez les connexions récentes à votre compte.
              </p>
              <button onClick={() => navigate('/app/sessions')} className="btn-primary flex items-center gap-2">
                <Monitor className="w-4 h-4" /> Gérer les sessions
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Add user modal */}
      <Modal isOpen={showAddUser} onClose={() => setShowAddUser(false)} title="Ajouter un utilisateur">
        <form className="space-y-4" onSubmit={submitNewUser}>
          {userError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-danger dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {userError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom</label>
            <input
              value={newUser.name}
              onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              className="input-field"
              minLength={6}
              required
            />
            <p className="text-xs text-muted dark:text-gray-400 mt-1">Au moins 6 caractères</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Rôle</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
              className="input-field"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddUser(false)} className="btn-ghost">
              Annuler
            </button>
            <button type="submit" disabled={addUserMutation.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {addUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Créer
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit user drawer */}
      <Drawer
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        title="Modifier l’utilisateur"
        description={editUser?.email}
        footer={
          <>
            <button onClick={() => setEditUser(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() =>
                editUser &&
                updateUserMutation.mutate({
                  id: editUser.id,
                  patch: { name: editUser.name, role: editUser.role },
                })
              }
              disabled={updateUserMutation.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {updateUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </>
        }
      >
        {editUser && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom</label>
              <input
                value={editUser.name}
                onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Rôle</label>
              <select
                value={editUser.role}
                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                className="input-field"
              >
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Drawer>

      {/* New academic year modal */}
      <Modal isOpen={showYearModal} onClose={() => setShowYearModal(false)} title="Nouvelle année scolaire">
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); createYearMutation.mutate(); }}
        >
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom *</label>
            <input
              value={yearForm.name}
              onChange={(e) => setYearForm((p) => ({ ...p, name: e.target.value }))}
              className="input-field"
              placeholder="2026-2027"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Début</label>
              <input
                type="date"
                value={yearForm.startDate}
                onChange={(e) => setYearForm((p) => ({ ...p, startDate: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Fin</label>
              <input
                type="date"
                value={yearForm.endDate}
                onChange={(e) => setYearForm((p) => ({ ...p, endDate: e.target.value }))}
                className="input-field"
              />
            </div>
          </div>
          <p className="text-xs text-muted dark:text-gray-400">
            La nouvelle année devient active et l’année en cours est clôturée.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowYearModal(false)} className="btn-ghost">
              Annuler
            </button>
            <button type="submit" disabled={createYearMutation.isPending} className="btn-primary flex items-center gap-2 disabled:opacity-50">
              {createYearMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Créer
            </button>
          </div>
        </form>
      </Modal>

      {/* Close / open year confirm */}
      <Modal isOpen={!!yearAction} onClose={() => setYearAction(null)} title={yearAction?.action === 'close' ? 'Clôturer l’année' : 'Ouvrir l’année'}>
        <p className="text-sm text-muted dark:text-gray-400">
          {yearAction?.action === 'close' ? (
            <>Voulez-vous vraiment clôturer l’année <strong className="text-text dark:text-gray-200">{yearAction?.year.name}</strong> ?</>
          ) : (
            <>Voulez-vous vraiment ouvrir l’année <strong className="text-text dark:text-gray-200">{yearAction?.year.name}</strong> ? L’année actuellement active sera clôturée.</>
          )}
        </p>
        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={() => setYearAction(null)} className="btn-ghost">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => yearAction && toggleYearMutation.mutate(yearAction)}
            disabled={toggleYearMutation.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {toggleYearMutation.isPending ? 'En cours...' : 'Confirmer'}
          </button>
        </div>
      </Modal>
    </PageTransition>
  );
}

