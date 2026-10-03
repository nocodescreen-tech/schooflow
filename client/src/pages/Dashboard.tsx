/**
 * Dashboard — Centre de contrôle de l'école.
 *
 * SOURCES DE DONNÉES PAR WIDGET (toutes réelles, via `api`) :
 * - KPIs élèves/enseignants : GET /students?limit=1 (total), GET /teachers (count), fallback GET /dashboard (kpis)
 * - KPIs classes/documents : GET /classes (count), GET /document-builder/generated/list?limit=1 (total)
 * - KPIs présence/encaissé/impayés/moyenne : GET /dashboard (kpis) + GET /fees/overdue (somme restants)
 * - Revenus 12 mois : GET /payments (agrégation locale par mois), repli GET /dashboard (charts.revenueByMonth)
 * - Effectifs par classe/sexe : GET /students?limit=2000 (champs gender + class)
 * - Présences du jour (donut) : GET /attendance?date=YYYY-MM-DD + GET /dashboard (charts.attendanceByClass)
 * - Académique (moy./matière, classement classes, top 10) : GET /grades?term= + GET /students?limit=2000 (jointure classe)
 * - Paiements récents : GET /payments (poll 60s)
 * - Impayés : GET /fees/overdue (poll 60s)
 * - Caisse : GET /cash/summary (poll 60s)
 * - Documents récents : GET /document-builder/generated/list?limit=6
 * - Emploi du temps du jour : GET /timetable?dayOfWeek=1..7
 * - Annonces : GET /announcements
 * - Notifications : GET /notifications (poll 60s)
 * - Activité : GET /dashboard/activity (si 404 → GET /settings/sessions, sinon vide)
 * - Alertes : GET /dashboard/alerts (si 404 → dérivées localement des impayés/absences/notifications/recouvrement)
 * - Santé système (admin) : GET /dashboard/system-health (masqué si 404)
 * - Rapport global : GET /dashboard/report?type=global (bouton masqué si 404)
 * - Préférences widgets : GET /settings puis PATCH /settings { settings: {...fusionné, dashboardWidgets} }
 */
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'motion/react';
import {
  Users, GraduationCap, School, CalendarCheck, Wallet, AlertTriangle, Award, FileText,
  Plus, UserPlus, BookOpen, CreditCard, ClipboardList, Calendar, Megaphone,
  Bell, Activity, HeartPulse, Download, RefreshCw, SlidersHorizontal, ChevronRight,
  Banknote, Eye,
} from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useCan } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import StatCard from '../components/StatCard';
import PageTransition from '../components/PageTransition';
import { formatCurrency } from '../lib/currency';
import type { CurrencyCode } from '../lib/currency';
import api from '../lib/api';

// ─── Types lâches mais typés (strict OK) ─────────────────────────────────────

type Loose = Record<string, any>;

interface DashboardMain {
  kpis: Loose;
  charts: { revenueByMonth: Loose[]; attendanceByClass: Loose[]; gradeDistribution: Loose[] };
}

const asNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const asStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : v == null ? fb : String(v);
const fullName = (s: Loose | null | undefined): string => {
  if (!s) return 'Élève inconnu';
  const n = `${asStr(s.firstName)} ${asStr(s.lastName)}`.trim();
  return n || 'Élève inconnu';
};
const itemsOf = (res: any): Loose[] => res?.data?.data?.items ?? [];

/** GET optionnel : 404 → null (endpoint de /dashboard/* pas encore déployé), autre erreur → throw. */
async function fetchOptional<T>(url: string, params?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await api.get(url, { params });
    return (res.data?.data ?? res.data ?? null) as T | null;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

const todayLocal = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

function yearOptions(base: string): string[] {
  const m = base.match(/(\d{4})\s*-\s*(\d{4})/);
  const now = new Date();
  const start = m ? parseInt(m[1], 10) : now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return [`${start - 1}-${start}`, `${start}-${start + 1}`, `${start + 1}-${start + 2}`];
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces', bank: 'Banque',
  transfer: 'Virement', other: 'Autre',
};
const STATUS_LABELS: Record<string, string> = {
  present: 'Présents', absent: 'Absents', late: 'Retards', excused: 'Excusés',
};
const STATUS_COLORS: Record<string, string> = {
  present: '#16a34a', absent: '#dc2626', late: '#f59e0b', excused: '#6366f1',
};

// ─── Widgets : visibilité persistée ──────────────────────────────────────────

const WIDGET_KEYS = [
  'kpis', 'actions', 'revenue', 'enrollment', 'attendance', 'academic',
  'finance', 'cash', 'documents', 'timetable', 'announcements',
  'activity', 'alerts', 'health',
] as const;
type WidgetKey = (typeof WIDGET_KEYS)[number];
const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = {
  kpis: true, actions: true, revenue: true, enrollment: true, attendance: true,
  academic: true, finance: true, cash: true, documents: true, timetable: true,
  announcements: true, activity: true, alerts: true, health: true,
};
const WIDGET_LABELS: Record<WidgetKey, string> = {
  kpis: 'Indicateurs', actions: 'Actions rapides', revenue: 'Revenus mensuels',
  enrollment: 'Effectifs', attendance: 'Présences du jour', academic: 'Résultats scolaires',
  finance: 'Paiements & impayés', cash: 'Caisse', documents: 'Documents récents',
  timetable: 'Emploi du temps', announcements: 'Annonces', activity: 'Activité récente',
  alerts: 'Alertes', health: 'Santé système',
};

// ─── Petits composants partagés ──────────────────────────────────────────────

function Skeleton({ className = 'h-24' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

function WidgetState(props: {
  isLoading: boolean; isError: boolean; isEmpty: boolean; onRetry: () => void;
  skeletonClass?: string; children: React.ReactNode;
}) {
  if (props.isLoading) return <Skeleton className={props.skeletonClass ?? 'h-40'} />;
  if (props.isError) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-danger">Échec du chargement.</p>
        <button className="btn-secondary text-sm" onClick={props.onRetry}>Réessayer</button>
      </div>
    );
  }
  if (props.isEmpty) return <p className="text-sm text-muted dark:text-gray-400 text-center py-8">Pas encore de données.</p>;
  return <>{props.children}</>;
}

function Section(props: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: props.delay ?? 0.1 }}
      className={`card p-6 ${props.className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold text-text dark:text-gray-100">{props.title}</h3>
        {props.action}
      </div>
      {props.children}
    </motion.section>
  );
}

const fmtDate = (v: unknown): string => {
  const d = new Date(asStr(v));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};
const fmtDateTime = (v: unknown): string => {
  const d = new Date(asStr(v));
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currency = (settings.currency || 'USD') as CurrencyCode;

  const yearOpts = useMemo(() => yearOptions(settings.academicYear || ''), [settings.academicYear]);
  const [selectedYear, setSelectedYear] = useState<string>(() => settings.academicYear || yearOpts[1]);
  const [period, setPeriod] = useState<'all' | '1' | '2' | '3'>('all');
  const [enrollMode, setEnrollMode] = useState<'classe' | 'sexe'>('classe');
  const [showPrefs, setShowPrefs] = useState(false);
  const [reportAvailable, setReportAvailable] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.academicYear && yearOptions(settings.academicYear).includes(settings.academicYear)) {
      setSelectedYear((prev) => (yearOptions(settings.academicYear).includes(prev) ? prev : settings.academicYear));
    }
  }, [settings.academicYear]);

  const today = useMemo(todayLocal, []);
  const jsDay = new Date().getDay();
  const dow = jsDay === 0 ? 7 : jsDay; // serveur : 1 (lun) … 7 (dim)
  const termParam = period === 'all' ? undefined : Number(period);
  const canViewSystemHealth = useCan('dashboard', 'view');

  // ── Requêtes ──
  const dashMain = useQuery({
    queryKey: ['dashboard', 'main'],
    queryFn: async (): Promise<DashboardMain> => {
      const res = await api.get('/dashboard');
      return res.data?.data;
    },
  });
  const studentsTotalQ = useQuery({
    queryKey: ['dashboard', 'students-total'],
    queryFn: async () => (await api.get('/students', { params: { limit: 1 } })).data?.data?.total as number,
  });
  const studentsListQ = useQuery({
    queryKey: ['dashboard', 'students-list'],
    queryFn: async (): Promise<{ items: Loose[]; total: number }> => {
      const res = await api.get('/students', { params: { limit: 2000 } });
      return { items: itemsOf(res), total: asNum(res?.data?.data?.total) };
    },
  });
  const teachersQ = useQuery({
    queryKey: ['dashboard', 'teachers'],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/teachers')),
  });
  const classesQ = useQuery({
    queryKey: ['dashboard', 'classes'],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/classes')),
  });
  const paymentsQ = useQuery({
    queryKey: ['dashboard', 'payments'],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/payments')),
    refetchInterval: 60000,
  });
  const overdueQ = useQuery({
    queryKey: ['dashboard', 'overdue'],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/fees/overdue')),
    refetchInterval: 60000,
  });
  const attendanceQ = useQuery({
    queryKey: ['dashboard', 'attendance-today', today],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/attendance', { params: { date: today } })),
  });
  const gradesQ = useQuery({
    queryKey: ['dashboard', 'grades', selectedYear, period],
    queryFn: async (): Promise<Loose[]> =>
      itemsOf(await api.get('/grades', { params: termParam ? { term: termParam } : undefined })),
  });
  const timetableQ = useQuery({
    queryKey: ['dashboard', 'timetable', dow],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/timetable', { params: { dayOfWeek: dow } })),
  });
  const announcementsQ = useQuery({
    queryKey: ['dashboard', 'announcements'],
    queryFn: async (): Promise<Loose[]> => itemsOf(await api.get('/announcements')),
  });
  const notificationsQ = useQuery({
    queryKey: ['dashboard', 'notifications'],
    queryFn: async (): Promise<{ items: Loose[]; unreadCount: number }> => {
      const res = await api.get('/notifications');
      return { items: itemsOf(res), unreadCount: asNum(res?.data?.data?.unreadCount) };
    },
    refetchInterval: 60000,
  });
  const documentsQ = useQuery({
    queryKey: ['dashboard', 'documents'],
    queryFn: async (): Promise<{ items: Loose[]; total: number }> => {
      const res = await api.get('/document-builder/generated/list', { params: { limit: 6 } });
      return { items: itemsOf(res), total: asNum(res?.data?.data?.total) };
    },
  });
  const documentsTotalQ = useQuery({
    queryKey: ['dashboard', 'documents-total'],
    queryFn: async (): Promise<number> =>
      asNum((await api.get('/document-builder/generated/list', { params: { limit: 1 } })).data?.data?.total),
  });
  const cashQ = useQuery({
    queryKey: ['dashboard', 'cash'],
    queryFn: async (): Promise<Loose> => {
      const res = await api.get('/cash/summary');
      return (res.data?.data ?? {}) as Loose;
    },
    refetchInterval: 60000,
  });
  const schoolSettingsQ = useQuery({
    queryKey: ['dashboard', 'school-settings'],
    queryFn: async (): Promise<Loose> => {
      const res = await api.get('/settings');
      return (res.data?.data ?? {}) as Loose;
    },
  });
  // Optionnels (peuvent ne pas exister côté serveur → 404 → null → repli/vide)
  const activityQ = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: async (): Promise<Loose[]> => {
      const opt = await fetchOptional<{ items: Loose[] } | Loose[]>('/dashboard/activity');
      if (opt) return Array.isArray(opt) ? opt : (opt.items ?? []);
      const sess = await fetchOptional<{ items: Loose[] }>('/settings/sessions');
      return (sess?.items ?? []).map((s) => ({
        user: 'Moi', action: 'Connexion', module: 'Sessions', date: s.createdAt,
      }));
    },
    retry: 1,
  });
  const alertsApiQ = useQuery({
    queryKey: ['dashboard', 'alerts-api'],
    queryFn: async (): Promise<Loose[] | null> => {
      const opt = await fetchOptional<{ items: Loose[] } | Loose[]>('/dashboard/alerts');
      if (!opt) return null;
      return Array.isArray(opt) ? opt : (opt.items ?? []);
    },
    retry: 1,
  });
  const healthQ = useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: async (): Promise<Loose | null> => fetchOptional<Loose>('/dashboard/system-health'),
    enabled: canViewSystemHealth,
    retry: 1,
  });

  // ── Préférences widgets ──
  const serverWidgets = (schoolSettingsQ.data?.school as Loose | undefined)?.settings as Loose | undefined;
  const [prefs, setPrefs] = useState<Record<WidgetKey, boolean>>(DEFAULT_WIDGETS);
  const [prefsInit, setPrefsInit] = useState(false);
  useEffect(() => {
    const w = serverWidgets?.dashboardWidgets;
    if (!prefsInit && w && typeof w === 'object') {
      setPrefs({ ...DEFAULT_WIDGETS, ...(w as Partial<Record<WidgetKey, boolean>>) });
      setPrefsInit(true);
    }
  }, [prefsInit, serverWidgets]);
  const prefsMutation = useMutation({
    mutationFn: async (next: Record<WidgetKey, boolean>) => {
      const current = ((schoolSettingsQ.data?.school as Loose | undefined)?.settings ?? {}) as Loose;
      const res = await api.patch('/settings', { settings: { ...current, dashboardWidgets: next } });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', 'school-settings'] }),
  });
  const toggleWidget = (key: WidgetKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    prefsMutation.mutate(next);
  };

  const refreshAll = () => qc.invalidateQueries({ queryKey: ['dashboard'] });

  // ── Dérivés ──
  const kpis = dashMain.data?.kpis ?? {};
  const totalStudents = studentsTotalQ.data ?? asNum(kpis.totalStudents);
  const totalTeachers = (teachersQ.data?.length ?? asNum(kpis.totalTeachers)) || asNum(kpis.totalTeachers);
  const totalClasses = classesQ.data?.length ?? 0;
  const totalDocs = documentsTotalQ.data ?? 0;
  const overdueRemaining = useMemo(
    () => (overdueQ.data ?? []).reduce((s, f) => s + (asNum(f.totalAmount ?? f.amount) - asNum(f.paidAmount)), 0),
    [overdueQ.data],
  );
  const overdueAmount = overdueQ.data ? overdueRemaining : asNum(kpis.outstanding);
  const avgGrade = asNum(kpis.avgGrade);
  const attendanceRate = asNum(kpis.attendanceRate);
  const collected = asNum(kpis.collected);
  const collectionRate = asNum(kpis.collectionRate);

  // Revenus : 12 mois de l'année scolaire (sept → août) depuis GET /payments
  const revenue12 = useMemo(() => {
    const [y0, y1] = selectedYear.split('-').map(Number);
    const labels = ['Sept', 'Oct', 'Nov', 'Déc', 'Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
    const months: { key: string; label: string; amount: number }[] = labels.map((label, i) => {
      const month = (8 + i) % 12; // 8 = septembre
      const year = i < 4 ? y0 : y1;
      return { key: `${year}-${month}`, label, amount: 0 };
    });
    for (const p of paymentsQ.data ?? []) {
      const d = new Date(asStr(p.date ?? p.createdAt));
      if (Number.isNaN(d.getTime())) continue;
      const idx = months.findIndex((m) => {
        const [yy, mm] = m.key.split('-').map(Number);
        return yy === d.getFullYear() && mm === d.getMonth();
      });
      if (idx >= 0) months[idx].amount += asNum(p.amount);
    }
    return months;
  }, [paymentsQ.data, selectedYear]);
  const maxRevenue = Math.max(1, ...revenue12.map((m) => m.amount));
  const revenueFallback = useMemo(
    () => (dashMain.data?.charts.revenueByMonth ?? []).map((d) => ({
      label: new Date(asStr(d.month)).toLocaleDateString('fr-FR', { month: 'short' }),
      amount: asNum(d.revenue),
    })),
    [dashMain.data],
  );

  // Effectifs
  const studentsList = studentsListQ.data?.items ?? [];
  const enrollByClass = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of studentsList) {
      const name = asStr((s.class as Loose | undefined)?.name) || 'Sans classe';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [studentsList]);
  const enrollBySex = useMemo(() => {
    let m = 0, f = 0, na = 0;
    for (const s of studentsList) {
      if (s.gender === 'M') m++; else if (s.gender === 'F') f++; else na++;
    }
    return [
      { name: 'Garçons', count: m, color: '#3b82f6' },
      { name: 'Filles', count: f, color: '#ec4899' },
      ...(na > 0 ? [{ name: 'Non renseigné', count: na, color: '#9ca3af' }] : []),
    ];
  }, [studentsList]);
  const maxEnroll = Math.max(1, ...enrollByClass.map((e) => e.count), ...enrollBySex.map((e) => e.count));

  // Présences du jour
  const attCounts = useMemo(() => {
    const c: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const a of attendanceQ.data ?? []) {
      const st = asStr(a.status);
      if (st in c) c[st]++; else c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [attendanceQ.data]);
  const attTotal = Object.values(attCounts).reduce((a, b) => a + b, 0);
  const donutBg = useMemo(() => {
    if (attTotal === 0) return '#e5e7eb';
    let acc = 0;
    const segs = Object.entries(attCounts).filter(([, n]) => n > 0).map(([st, n]) => {
      const from = (acc / attTotal) * 360;
      acc += n;
      const to = (acc / attTotal) * 360;
      return `${STATUS_COLORS[st] ?? '#9ca3af'} ${from}deg ${to}deg`;
    });
    return `conic-gradient(${segs.join(', ')})`;
  }, [attCounts, attTotal]);

  // Académique : jointure notes ↔ élèves ↔ classes, filtre année locale
  const academic = useMemo(() => {
    const grades = (gradesQ.data ?? []).filter((g) =>
      g.academicYear == null || asStr(g.academicYear) === '' || asStr(g.academicYear) === selectedYear,
    );
    const bySubject = new Map<string, { total: number; n: number }>();
    for (const g of grades) {
      const name = asStr((g.subject as Loose | undefined)?.name) || 'Matière inconnue';
      const e = bySubject.get(name) ?? { total: 0, n: 0 };
      e.total += asNum(g.score); e.n++;
      bySubject.set(name, e);
    }
    const subjectAvgs = [...bySubject.entries()]
      .map(([name, e]) => ({ name, avg: e.n ? e.total / e.n : 0, n: e.n }))
      .sort((a, b) => b.avg - a.avg).slice(0, 8);

    const classOf = new Map<string, string>();
    const classNameOf = new Map<string, string>();
    for (const s of studentsList) {
      if (s.classId) {
        classOf.set(asStr(s.id), asStr(s.classId));
        classNameOf.set(asStr(s.classId), asStr((s.class as Loose | undefined)?.name) || 'Classe');
      }
    }
    const perStudent = new Map<string, { total: number; n: number; name: string; classId: string }>();
    for (const g of grades) {
      const sid = asStr((g.student as Loose | undefined)?.id ?? g.studentId);
      if (!sid) continue;
      const e = perStudent.get(sid) ?? {
        total: 0, n: 0,
        name: fullName((g.student as Loose | undefined) ?? null),
        classId: classOf.get(sid) ?? '',
      };
      e.total += asNum(g.score); e.n++;
      perStudent.set(sid, e);
    }
    const byClass = new Map<string, { name: string; avgs: number[] }>();
    for (const [, ps] of perStudent) {
      if (!ps.classId) continue;
      const e = byClass.get(ps.classId) ?? { name: classNameOf.get(ps.classId) ?? 'Classe', avgs: [] };
      e.avgs.push(ps.total / ps.n);
      byClass.set(ps.classId, e);
    }
    // Effectifs par classe (toutes, même sans notes) depuis GET /students
    const effectifs = new Map<string, number>();
    for (const s of studentsList) {
      const cid = asStr(s.classId);
      if (cid) effectifs.set(cid, (effectifs.get(cid) ?? 0) + 1);
    }
    const classRank = [...byClass.entries()].map(([id, e]) => {
      const avg = e.avgs.reduce((a, b) => a + b, 0) / e.avgs.length;
      const pass = e.avgs.filter((a) => a >= 10).length;
      return {
        id, name: e.name,
        effectif: effectifs.get(id) ?? e.avgs.length,
        avg, passRate: Math.round((pass / e.avgs.length) * 100),
      };
    }).sort((a, b) => b.avg - a.avg);
    const topStudents = [...perStudent.entries()]
      .map(([id, ps]) => ({
        id, name: ps.name,
        className: classNameOf.get(ps.classId) ?? '—',
        avg: ps.total / ps.n,
      }))
      .sort((a, b) => b.avg - a.avg).slice(0, 10);
    return { subjectAvgs, classRank, topStudents, gradesCount: grades.length };
  }, [gradesQ.data, studentsList, selectedYear]);

  // Emploi du temps du jour
  const todaySlots = useMemo(() => {
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const list = [...(timetableQ.data ?? [])].sort((a, b) => asStr(a.startTime).localeCompare(asStr(b.startTime)));
    const current = list.find((e) => {
      const s = asStr(e.startTime).slice(0, 5);
      const en = asStr(e.endTime).slice(0, 5);
      return s <= hm && hm < en;
    });
    return { list, current };
  }, [timetableQ.data]);

  // Alertes : API si dispo, sinon dérivées de données réelles
  const alerts = useMemo((): Loose[] => {
    if (alertsApiQ.data && alertsApiQ.data.length > 0) return alertsApiQ.data;
    const out: Loose[] = [];
    const odCount = overdueQ.data?.length ?? 0;
    if (odCount > 0) out.push({ id: 'overdue', severity: 'warning', message: `${odCount} frais en retard de paiement`, path: '/app/fees' });
    const absents = attCounts.absent ?? 0;
    if (absents > 0) out.push({ id: 'absent', severity: 'danger', message: `${absents} élève(s) absent(s) aujourd'hui`, path: '/app/attendance' });
    const unread = notificationsQ.data?.unreadCount ?? 0;
    if (unread > 0) out.push({ id: 'notif', severity: 'info', message: `${unread} notification(s) non lue(s)`, path: '/app/alerts' });
    if (collectionRate > 0 && collectionRate < 50) out.push({ id: 'collect', severity: 'warning', message: `Taux de recouvrement faible (${collectionRate} %)`, path: '/app/payments' });
    return out;
  }, [alertsApiQ.data, overdueQ.data, attCounts.absent, notificationsQ.data, collectionRate]);
  const alertBadge = (sev: string) =>
    sev === 'danger' ? 'badge-danger' : sev === 'warning' ? 'badge-warning' : 'badge-info';

  const recentPayments = (paymentsQ.data ?? []).slice(0, 8);
  const unpaidPreview = (overdueQ.data ?? []).slice(0, 6);
  const cash = cashQ.data ?? {};
  const notifs = notificationsQ.data?.items ?? [];

  const downloadReport = async () => {
    setReportBusy(true);
    setReportError(null);
    try {
      const res = await api.get('/dashboard/report', {
        params: { type: 'global', academicYear: selectedYear },
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-global-${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) setReportAvailable(false);
      else setReportError('Échec du téléchargement du rapport.');
    } finally {
      setReportBusy(false);
    }
  };

  const quickActions = [
    { label: 'Nouvel élève', icon: UserPlus, path: '/app/students', color: 'bg-primary-500' },
    { label: 'Enseignant', icon: GraduationCap, path: '/app/teachers', color: 'bg-purple' },
    { label: 'Classe', icon: School, path: '/app/classes', color: 'bg-warning' },
    { label: 'Paiement', icon: CreditCard, path: '/app/payments', color: 'bg-success' },
    { label: 'Notes', icon: ClipboardList, path: '/app/grades', color: 'bg-warning' },
    { label: 'Présences', icon: Calendar, path: '/app/attendance', color: 'bg-purple' },
    { label: 'Document', icon: FileText, path: '/app/document-builder', color: 'bg-primary-500' },
    { label: 'Annonce', icon: Megaphone, path: '/app/announcements', color: 'bg-success' },
  ];

  const kpiLoading = dashMain.isLoading || studentsTotalQ.isLoading || teachersQ.isLoading || classesQ.isLoading || documentsTotalQ.isLoading;
  const kpiError = dashMain.isError && studentsTotalQ.isError && teachersQ.isError && classesQ.isError;
  const kpiRetry = () => {
    dashMain.refetch(); studentsTotalQ.refetch(); teachersQ.refetch(); classesQ.refetch(); documentsTotalQ.refetch();
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* ── En-tête ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            {settings.logo ? (
              <img
                src={settings.logo} alt="Logo"
                className="w-12 h-12 rounded-xl object-cover bg-white"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary-500 flex items-center justify-center">
                <School className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-text dark:text-gray-100">
                {settings.schoolName || 'Tableau de bord'}
              </h1>
              <p className="text-muted dark:text-gray-400 text-sm">Bonjour {user?.name} — centre de contrôle</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="input-field !w-auto text-sm" title="Année scolaire">
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="input-field !w-auto text-sm" title="Période">
              <option value="all">Toute l'année</option>
              <option value="1">Trimestre 1</option>
              <option value="2">Trimestre 2</option>
              <option value="3">Trimestre 3</option>
            </select>
            <button className="btn-secondary text-sm flex items-center gap-2" onClick={refreshAll} title="Actualiser toutes les données">
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
            <button className="btn-secondary text-sm flex items-center gap-2" onClick={() => setShowPrefs((v) => !v)} title="Choisir les widgets affichés">
              <SlidersHorizontal className="w-4 h-4" /> Personnaliser
            </button>
            {reportAvailable && (
              <button className="btn-primary text-sm flex items-center gap-2" onClick={downloadReport} disabled={reportBusy} title="Télécharger le rapport global (PDF)">
                <Download className="w-4 h-4" /> {reportBusy ? 'Export…' : 'Exporter rapport'}
              </button>
            )}
          </div>
        </div>
        {reportError && <p className="text-sm text-danger">{reportError}</p>}

        {/* ── Personnalisation ── */}
        {showPrefs && (
          <div className="card p-6">
            <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Widgets affichés</h3>
            <p className="text-xs text-muted dark:text-gray-400 mb-4">Enregistré automatiquement dans les paramètres de l'école.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {WIDGET_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-text dark:text-gray-200 cursor-pointer">
                  <input type="checkbox" checked={prefs[k]} onChange={() => toggleWidget(k)} className="accent-current" />
                  {WIDGET_LABELS[k]}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── 8 KPI ── */}
        {prefs.kpis && (
          <div>
            {kpiLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : kpiError ? (
              <div className="card p-6 text-center space-y-3">
                <p className="text-sm text-danger">Échec du chargement des indicateurs.</p>
                <button className="btn-secondary text-sm" onClick={kpiRetry}>Réessayer</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { title: 'Élèves', value: totalStudents, icon: Users, color: 'bg-primary-500', path: '/app/students' },
                  { title: 'Enseignants', value: totalTeachers, icon: GraduationCap, color: 'bg-purple', path: '/app/teachers' },
                  { title: 'Classes', value: totalClasses, icon: School, color: 'bg-warning', path: '/app/classes' },
                  { title: 'Présence aujourd\u2019hui', value: attendanceRate, icon: CalendarCheck, color: 'bg-success', suffix: '%', path: '/app/attendance' },
                  { title: 'Encaissé (mois)', value: Math.round(collected), icon: Wallet, color: 'bg-success', prefix: currency === 'USD' ? '$' : currency === 'CDF' ? 'FC ' : '€', path: '/app/payments' },
                  { title: 'Impayés', value: Math.round(overdueAmount), icon: AlertTriangle, color: 'bg-danger', prefix: currency === 'USD' ? '$' : currency === 'CDF' ? 'FC ' : '€', path: '/app/fees' },
                  { title: 'Moyenne générale', value: Math.round(avgGrade * 10) / 10, icon: Award, color: 'bg-primary-500', suffix: '/20', path: '/app/grades' },
                  { title: 'Documents générés', value: totalDocs, icon: FileText, color: 'bg-purple', path: '/app/documents' },
                ].map((k) => (
                  <div key={k.title} onClick={() => navigate(k.path)} className="cursor-pointer" title={`Voir — ${k.path}`} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(k.path); }}>
                    <StatCard title={k.title} value={k.value} icon={k.icon} color={k.color} prefix={k.prefix ?? ''} suffix={k.suffix ?? ''} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Actions rapides ── */}
        {prefs.actions && (
          <div>
            <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Actions rapides</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
              {quickActions.map((a, i) => (
                <motion.button
                  key={a.label}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(a.path)}
                  className="card card-hover p-4 flex flex-col items-center gap-2 text-center"
                >
                  <div className={`w-10 h-10 ${a.color} rounded-xl flex items-center justify-center`}>
                    <a.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-text dark:text-gray-200">{a.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* ── Revenus + Effectifs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {prefs.revenue && (
            <Section title={`Revenus mensuels — ${selectedYear}`} className="lg:col-span-2" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/payments')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={paymentsQ.isLoading} isError={paymentsQ.isError && revenueFallback.length === 0}
                isEmpty={!paymentsQ.isLoading && revenue12.every((m) => m.amount === 0) && revenueFallback.length === 0}
                onRetry={() => paymentsQ.refetch()} skeletonClass="h-48"
              >
                {(paymentsQ.data && paymentsQ.data.length > 0) || revenueFallback.length === 0 ? (
                  <div className="flex items-end gap-2 h-48">
                    {revenue12.map((m) => (
                      <div key={m.key} className="flex-1 flex flex-col items-center gap-1 min-w-0"
                        title={`${m.label} : ${formatCurrency(m.amount, currency)}`}>
                        <span className="text-[10px] font-medium text-text dark:text-gray-300 truncate w-full text-center">
                          {m.amount > 0 ? formatCurrency(m.amount, currency) : ''}
                        </span>
                        <motion.div
                          initial={{ height: 0 }} animate={{ height: `${Math.max(m.amount > 0 ? 4 : 1, (m.amount / maxRevenue) * 100)}%` }}
                          className="w-full bg-primary-500/25 rounded-t-lg min-h-[4px]"
                        >
                          <div className="w-full h-full bg-primary-500/70 rounded-t-lg" />
                        </motion.div>
                        <span className="text-[10px] text-muted dark:text-gray-400">{m.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-end gap-2 h-48">
                    {revenueFallback.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1"
                        title={`${m.label} : ${formatCurrency(m.amount, currency)}`}>
                        <motion.div initial={{ height: 0 }}
                          animate={{ height: `${(m.amount / Math.max(1, ...revenueFallback.map((x) => x.amount))) * 100}%` }}
                          className="w-full bg-primary-500/70 rounded-t-lg min-h-[4px]" />
                        <span className="text-[10px] text-muted dark:text-gray-400">{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted dark:text-gray-500 mt-3">Source : paiements enregistrés{paymentsQ.data ? '' : ' (6 derniers mois)'}. Survolez une barre pour la valeur exacte.</p>
              </WidgetState>
            </Section>
          )}

          {prefs.enrollment && (
            <Section title="Effectifs" action={
              <div className="flex gap-1 text-xs">
                <button onClick={() => setEnrollMode('classe')} className={enrollMode === 'classe' ? 'badge badge-info' : 'badge'}>Classes</button>
                <button onClick={() => setEnrollMode('sexe')} className={enrollMode === 'sexe' ? 'badge badge-info' : 'badge'}>Sexe</button>
              </div>
            }>
              <WidgetState
                isLoading={studentsListQ.isLoading} isError={studentsListQ.isError}
                isEmpty={!studentsListQ.isLoading && studentsList.length === 0}
                onRetry={() => studentsListQ.refetch()} skeletonClass="h-48"
              >
                <div className="space-y-3">
                  {(enrollMode === 'classe' ? enrollByClass.map((e) => ({ ...e, color: undefined as string | undefined })) : enrollBySex).map((e) => (
                    <div key={e.name} title={`${e.name} : ${e.count} élève(s)`}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted dark:text-gray-400 truncate">{e.name}</span>
                        <span className="font-medium text-text dark:text-gray-200 ml-2">{e.count}</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(e.count / maxEnroll) * 100}%` }}
                          className="h-full rounded-full" style={{ background: (e as { color?: string }).color ?? '#3b82f6' }} />
                      </div>
                    </div>
                  ))}
                </div>
                {(studentsListQ.data?.total ?? 0) > studentsList.length && (
                  <p className="text-[11px] text-muted mt-2">Calculé sur {studentsList.length} élèves chargés.</p>
                )}
              </WidgetState>
            </Section>
          )}
        </div>

        {/* ── Présences + Moyennes par matière ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {prefs.attendance && (
            <Section title="Présences du jour" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/attendance')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={attendanceQ.isLoading} isError={attendanceQ.isError}
                isEmpty={!attendanceQ.isLoading && attTotal === 0}
                onRetry={() => attendanceQ.refetch()} skeletonClass="h-48"
              >
                <div className="flex items-center gap-6">
                  <div className="relative w-36 h-36 shrink-0 rounded-full" style={{ background: donutBg }} title={`Présence : ${attendanceRate || (attTotal ? Math.round(((attCounts.present ?? 0) / attTotal) * 100) : 0)} %`}>
                    <div className="absolute inset-4 rounded-full bg-white dark:bg-[#151a24] flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-text dark:text-gray-100">{attTotal}</span>
                      <span className="text-[11px] text-muted dark:text-gray-400">pointages</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {Object.entries(attCounts).map(([st, n]) => (
                      <div key={st} className="flex items-center gap-2 text-sm" title={`${STATUS_LABELS[st] ?? st} : ${n}`}>
                        <span className="w-3 h-3 rounded-full" style={{ background: STATUS_COLORS[st] ?? '#9ca3af' }} />
                        <span className="text-muted dark:text-gray-400 flex-1">{STATUS_LABELS[st] ?? st}</span>
                        <span className="font-semibold text-text dark:text-gray-200">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </WidgetState>
            </Section>
          )}

          {prefs.academic && (
            <Section title="Moyennes par matière" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/grades')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={gradesQ.isLoading} isError={gradesQ.isError}
                isEmpty={!gradesQ.isLoading && academic.subjectAvgs.length === 0}
                onRetry={() => gradesQ.refetch()} skeletonClass="h-48"
              >
                <div className="space-y-3">
                  {academic.subjectAvgs.map((s) => (
                    <div key={s.name} title={`${s.name} : ${s.avg.toFixed(2)}/20 (${s.n} notes)`}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted dark:text-gray-400 truncate">{s.name}</span>
                        <span className="font-medium text-text dark:text-gray-200 ml-2">{s.avg.toFixed(2)}/20</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(s.avg / 20) * 100}%` }}
                          className={`h-full rounded-full ${s.avg >= 10 ? 'bg-success' : 'bg-danger'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetState>
            </Section>
          )}
        </div>

        {/* ── Classement classes + Top élèves ── */}
        {prefs.academic && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Classement des classes" delay={0.05} action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/classes')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={gradesQ.isLoading || studentsListQ.isLoading} isError={gradesQ.isError}
                isEmpty={!gradesQ.isLoading && academic.classRank.length === 0}
                onRetry={() => { gradesQ.refetch(); studentsListQ.refetch(); }} skeletonClass="h-40"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted dark:text-gray-400 text-xs">
                        <th className="pb-2 font-medium">Classe</th>
                        <th className="pb-2 font-medium text-right">Effectif</th>
                        <th className="pb-2 font-medium text-right">Moyenne</th>
                        <th className="pb-2 font-medium text-right">Réussite</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {academic.classRank.slice(0, 6).map((c) => (
                        <tr key={c.id} className="border-t border-gray-100 dark:border-white/5">
                          <td className="py-2 font-medium text-text dark:text-gray-200">{c.name}</td>
                          <td className="py-2 text-right text-muted dark:text-gray-400">{c.effectif}</td>
                          <td className="py-2 text-right font-semibold text-text dark:text-gray-100">{c.avg.toFixed(2)}</td>
                          <td className="py-2 text-right"><span className={c.passRate >= 50 ? 'badge badge-success' : 'badge badge-danger'}>{c.passRate} %</span></td>
                          <td className="py-2 text-right">
                            <button className="btn-ghost text-xs" onClick={() => navigate('/app/classes')}>Voir</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WidgetState>
            </Section>

            <Section title="Top 10 élèves" delay={0.05} action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/report-cards')}>Bulletins <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={gradesQ.isLoading} isError={gradesQ.isError}
                isEmpty={!gradesQ.isLoading && academic.topStudents.length === 0}
                onRetry={() => gradesQ.refetch()} skeletonClass="h-40"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted dark:text-gray-400 text-xs">
                        <th className="pb-2 font-medium">Rang</th>
                        <th className="pb-2 font-medium">Élève</th>
                        <th className="pb-2 font-medium">Classe</th>
                        <th className="pb-2 font-medium text-right">Moyenne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {academic.topStudents.map((s, i) => (
                        <tr key={s.id} className="border-t border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer"
                          onClick={() => navigate('/app/report-cards')} title="Voir le bulletin">
                          <td className="py-2 text-muted dark:text-gray-400">#{i + 1}</td>
                          <td className="py-2 font-medium text-text dark:text-gray-200">{s.name}</td>
                          <td className="py-2 text-muted dark:text-gray-400">{s.className}</td>
                          <td className="py-2 text-right font-semibold text-text dark:text-gray-100">{s.avg.toFixed(2)}/20</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WidgetState>
            </Section>
          </div>
        )}

        {/* ── Finance : paiements + impayés ── */}
        {prefs.finance && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Section title="Paiements récents" className="lg:col-span-2" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/payments')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={paymentsQ.isLoading} isError={paymentsQ.isError}
                isEmpty={!paymentsQ.isLoading && recentPayments.length === 0}
                onRetry={() => paymentsQ.refetch()} skeletonClass="h-40"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted dark:text-gray-400 text-xs">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Reçu</th>
                        <th className="pb-2 font-medium">Élève</th>
                        <th className="pb-2 font-medium text-right">Montant</th>
                        <th className="pb-2 font-medium text-right">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map((p) => (
                        <tr key={asStr(p.id)} className="border-t border-gray-100 dark:border-white/5">
                          <td className="py-2 text-muted dark:text-gray-400 whitespace-nowrap">{fmtDate(p.date ?? p.createdAt)}</td>
                          <td className="py-2 font-medium text-text dark:text-gray-200">{asStr(p.reference, '—')}</td>
                          <td className="py-2 text-muted dark:text-gray-400">{fullName((p.student as Loose | undefined) ?? null)}</td>
                          <td className="py-2 text-right font-semibold text-success">{formatCurrency(asNum(p.amount), currency)}</td>
                          <td className="py-2 text-right text-muted dark:text-gray-400">{METHOD_LABELS[asStr(p.method)] ?? asStr(p.method, '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WidgetState>
            </Section>

            <Section title="Impayés" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/fees')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={overdueQ.isLoading} isError={overdueQ.isError}
                isEmpty={!overdueQ.isLoading && unpaidPreview.length === 0}
                onRetry={() => overdueQ.refetch()} skeletonClass="h-40"
              >
                <div className="space-y-3">
                  {unpaidPreview.map((f) => {
                    const rest = asNum(f.totalAmount ?? f.amount) - asNum(f.paidAmount);
                    return (
                      <div key={asStr(f.id)} className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text dark:text-gray-200 truncate">{fullName((f.student as Loose | undefined) ?? null)}</p>
                          <p className="text-xs text-muted dark:text-gray-400">Échéance : {fmtDate(f.dueDate)} · {asStr(f.type, '')}</p>
                        </div>
                        <span className="text-sm font-bold text-danger whitespace-nowrap">{formatCurrency(rest, currency)}</span>
                      </div>
                    );
                  })}
                  <button className="btn-primary w-full text-sm" onClick={() => navigate('/app/payments')}>
                    Enregistrer paiement
                  </button>
                </div>
              </WidgetState>
            </Section>
          </div>
        )}

        {/* ── Caisse + Documents ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {prefs.cash && (
            <Section title="Caisse" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/cash')}>Voir caisse <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={cashQ.isLoading} isError={cashQ.isError}
                isEmpty={!cashQ.isLoading && cashQ.data != null && asNum(cash.totalIncome) === 0 && asNum(cash.totalExpense) === 0 && (cash.todayTransactions as Loose[] | undefined)?.length === 0}
                onRetry={() => cashQ.refetch()} skeletonClass="h-32"
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl text-center" title={`Solde : ${formatCurrency(asNum(cash.balance), currency)}`}>
                    <Banknote className="w-5 h-5 mx-auto mb-1 text-primary-500" />
                    <p className="text-[11px] text-muted dark:text-gray-400">Solde</p>
                    <p className="text-sm font-bold text-text dark:text-gray-100">{formatCurrency(asNum(cash.balance), currency)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl text-center" title={`Entrées : ${formatCurrency(asNum(cash.totalIncome), currency)}`}>
                    <p className="text-[11px] text-muted dark:text-gray-400">Entrées</p>
                    <p className="text-sm font-bold text-success mt-5">{formatCurrency(asNum(cash.totalIncome), currency)}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl text-center" title={`Sorties : ${formatCurrency(asNum(cash.totalExpense), currency)}`}>
                    <p className="text-[11px] text-muted dark:text-gray-400">Sorties</p>
                    <p className="text-sm font-bold text-danger mt-5">{formatCurrency(asNum(cash.totalExpense), currency)}</p>
                  </div>
                </div>
              </WidgetState>
            </Section>
          )}

          {prefs.documents && (
            <Section title="Documents récents" action={
              <div className="flex gap-2">
                <button className="btn-primary text-xs flex items-center gap-1" onClick={() => navigate('/app/document-builder')}>
                  <Plus className="w-3 h-3" /> Créer
                </button>
                <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/documents')}>Voir <ChevronRight className="w-3 h-3" /></button>
              </div>
            }>
              <WidgetState
                isLoading={documentsQ.isLoading} isError={documentsQ.isError}
                isEmpty={!documentsQ.isLoading && (documentsQ.data?.items ?? []).length === 0}
                onRetry={() => documentsQ.refetch()} skeletonClass="h-32"
              >
                <div className="space-y-2">
                  {(documentsQ.data?.items ?? []).slice(0, 6).map((d) => (
                    <div key={asStr(d.id)} onClick={() => navigate('/app/documents')}
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer" title="Ouvrir les documents">
                      <div className="w-9 h-9 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text dark:text-gray-200 truncate">{asStr(d.title, 'Document')}</p>
                        <p className="text-xs text-muted dark:text-gray-400">{asStr(d.documentType ?? d.type, 'Document')} · {fmtDate(d.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetState>
            </Section>
          )}
        </div>

        {/* ── Emploi du temps + Annonces ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {prefs.timetable && (
            <Section title={`Cours du jour — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}>
              <WidgetState
                isLoading={timetableQ.isLoading} isError={timetableQ.isError}
                isEmpty={!timetableQ.isLoading && todaySlots.list.length === 0}
                onRetry={() => timetableQ.refetch()} skeletonClass="h-32"
              >
                <div className="space-y-3">
                  {todaySlots.current && (
                    <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-sm" title="Cours en ce moment">
                      <span className="badge badge-success mb-1">En cours</span>
                      <p className="font-semibold text-text dark:text-gray-100">
                        {asStr((todaySlots.current.subject as Loose | undefined)?.name)} — {asStr((todaySlots.current.class as Loose | undefined)?.name)}
                      </p>
                      <p className="text-xs text-muted dark:text-gray-400">
                        {asStr(todaySlots.current.startTime).slice(0, 5)} → {asStr(todaySlots.current.endTime).slice(0, 5)}
                        {asStr(todaySlots.current.room) ? ` · Salle ${asStr(todaySlots.current.room)}` : ''}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {todaySlots.list.slice(0, 8).map((e) => (
                      <div key={asStr(e.id)} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                        <span className="font-mono text-xs font-semibold text-primary-500 whitespace-nowrap w-24">
                          {asStr(e.startTime).slice(0, 5)}-{asStr(e.endTime).slice(0, 5)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-text dark:text-gray-200 truncate">{asStr((e.subject as Loose | undefined)?.name)}</p>
                          <p className="text-xs text-muted dark:text-gray-400">{asStr((e.class as Loose | undefined)?.name)}{asStr(e.room) ? ` · ${asStr(e.room)}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm flex-1" onClick={() => navigate('/app/attendance')}>Marquer présence</button>
                    <button className="btn-secondary text-sm" onClick={() => navigate('/app/timetable')}>Emploi du temps</button>
                  </div>
                </div>
              </WidgetState>
            </Section>
          )}

          {prefs.announcements && (
            <Section title="Annonces" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/announcements')}>Voir <ChevronRight className="w-3 h-3" /></button>
            }>
              <WidgetState
                isLoading={announcementsQ.isLoading} isError={announcementsQ.isError}
                isEmpty={!announcementsQ.isLoading && (announcementsQ.data ?? []).length === 0}
                onRetry={() => announcementsQ.refetch()} skeletonClass="h-32"
              >
                <div className="space-y-2">
                  {(announcementsQ.data ?? []).slice(0, 5).map((a) => (
                    <div key={asStr(a.id)} onClick={() => navigate('/app/announcements')}
                      className="p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer" title="Lire l'annonce">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text dark:text-gray-100 truncate flex-1">{asStr(a.title)}</p>
                        {asStr(a.audience) && <span className="badge badge-info">{asStr(a.audience)}</span>}
                      </div>
                      <p className="text-xs text-muted dark:text-gray-400 line-clamp-2 mt-1">{asStr(a.content)}</p>
                      <p className="text-[11px] text-muted dark:text-gray-500 mt-1">{fmtDate(a.publishedAt ?? a.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </WidgetState>
            </Section>
          )}
        </div>

        {/* ── Activité + Alertes (+ notifications) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {prefs.activity && (
            <Section title="Activité récente" action={<Activity className="w-4 h-4 text-muted" />}>
              <WidgetState
                isLoading={activityQ.isLoading} isError={activityQ.isError}
                isEmpty={!activityQ.isLoading && (activityQ.data ?? []).length === 0}
                onRetry={() => activityQ.refetch()} skeletonClass="h-32"
              >
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(activityQ.data ?? []).slice(0, 10).map((ev, i) => (
                    <div key={asStr(ev.id, String(i))} className="flex items-start gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-text dark:text-gray-200 truncate">
                          <span className="font-medium">{asStr(ev.user ?? ev.userName, '—')}</span>
                          {' · '}{asStr(ev.action)}
                        </p>
                        <p className="text-[11px] text-muted dark:text-gray-500">{asStr(ev.module, '')} · {fmtDateTime(ev.date ?? ev.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </WidgetState>
            </Section>
          )}

          {prefs.alerts && (
            <Section title="Alertes" action={
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => navigate('/app/alerts')}>
                <Bell className="w-3 h-3" /> Voir
              </button>
            }>
              <WidgetState
                isLoading={overdueQ.isLoading || attendanceQ.isLoading || notificationsQ.isLoading}
                isError={false} isEmpty={!overdueQ.isLoading && alerts.length === 0}
                onRetry={refreshAll} skeletonClass="h-32"
              >
                <div className="space-y-2">
                  {alerts.slice(0, 8).map((al, i) => (
                    <button key={asStr(al.id, String(i))} onClick={() => navigate(asStr(al.path, '/app/alerts'))}
                      className="w-full text-left flex items-center gap-2 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5" title="Ouvrir le module concerné">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                      <span className="text-sm text-text dark:text-gray-200 flex-1">{asStr(al.message ?? al.title)}</span>
                      <span className={`badge ${alertBadge(asStr(al.severity, 'info'))}`}>{asStr(al.severity, 'info')}</span>
                    </button>
                  ))}
                  {notifs.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 dark:border-white/5">
                      <p className="text-xs font-semibold text-muted dark:text-gray-400 mb-2 flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Notifications ({notificationsQ.data?.unreadCount ?? 0} non lues)
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {notifs.slice(0, 4).map((n) => (
                          <p key={asStr(n.id)} className="text-xs text-muted dark:text-gray-400 truncate" title={asStr(n.message ?? n.title)}>
                            {asStr(n.title)} — {asStr(n.message)}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </WidgetState>
            </Section>
          )}

          {prefs.health && canViewSystemHealth && healthQ.data && (
            <Section title="Santé système" action={<HeartPulse className="w-4 h-4 text-success" />}>
              <WidgetState
                isLoading={healthQ.isLoading} isError={healthQ.isError}
                isEmpty={!healthQ.isLoading && !healthQ.data}
                onRetry={() => healthQ.refetch()} skeletonClass="h-32"
              >
                <div className="space-y-2">
                  {Object.entries(healthQ.data ?? {}).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                      <span className="text-muted dark:text-gray-400 capitalize">{k}</span>
                      <span className="font-medium text-text dark:text-gray-200 text-right truncate ml-2">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </WidgetState>
            </Section>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
