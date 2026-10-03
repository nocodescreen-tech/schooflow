import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertTriangle, Clock, Check, X, Eye, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate, getInitials } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface FeeRow {
  id: string;
  type: string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueDate: string;
  status: string;
  studentId?: string;
  student?: { id: string; firstName: string; lastName: string; studentId?: string } | null;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  studentId?: string;
  student?: { id: string; firstName: string; lastName: string } | null;
}

interface DashboardKpis {
  totalStudents: number;
  totalTeachers: number;
  attendanceRate: number;
  outstanding: number | string;
  collectionRate: number;
}

type Severity = 'high' | 'medium' | 'low';

interface AlertItem {
  id: string;
  student: string;
  detail: string;
  title: string;
  description: string;
  date: string;
  severity: Severity;
  link: string;
}

const ABSENCE_THRESHOLD = 3;
const LATE_THRESHOLD = 3;

const fetchOverdueFees = async (): Promise<FeeRow[]> => {
  const res = await api.get('/fees/overdue');
  return res.data?.data?.items ?? [];
};

const fetchAttendance = async (): Promise<AttendanceRow[]> => {
  const res = await api.get('/attendance');
  return res.data?.data?.items ?? [];
};

const fetchKpis = async (): Promise<DashboardKpis | null> => {
  const res = await api.get('/dashboard');
  return res.data?.data?.kpis ?? null;
};

const severityConfig: Record<Severity, { color: string; badge: string; label: string }> = {
  high: { color: 'bg-danger', badge: 'badge-danger', label: 'Élevé' },
  medium: { color: 'bg-warning', badge: 'badge-warning', label: 'Moyen' },
  low: { color: 'bg-primary-500', badge: 'badge-info', label: 'Faible' },
};

const DISMISSED_KEY = 'schoolflow-dismissed-alerts';

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export default function Alerts() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);

  const { data: overdueFees = [], isLoading: feesLoading } = useQuery({
    queryKey: ['alerts-overdue'],
    queryFn: fetchOverdueFees,
  });
  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['alerts-attendance'],
    queryFn: fetchAttendance,
  });
  const { data: kpis } = useQuery({
    queryKey: ['alerts-kpis'],
    queryFn: fetchKpis,
  });

  const isLoading = feesLoading || attendanceLoading;

  const allAlerts: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = [];

    for (const fee of overdueFees) {
      const name = fee.student
        ? `${fee.student.firstName} ${fee.student.lastName}`
        : 'Élève inconnu';
      items.push({
        id: `fee-${fee.id}`,
        student: name,
        detail: fee.type,
        title: 'Paiement en retard',
        description: `Échéance dépassée depuis le ${formatDate(fee.dueDate)}`,
        date: fee.dueDate,
        severity: 'high',
        link: `/app/fees${fee.studentId ? `?studentId=${fee.studentId}` : ''}`,
      });
    }

    const byStudent = new Map<string, { name: string; absences: number; lates: number; lastDate: string }>();
    for (const record of attendance) {
      const key = record.studentId ?? record.student?.id ?? record.id;
      const name = record.student
        ? `${record.student.firstName} ${record.student.lastName}`
        : 'Élève inconnu';
      const entry = byStudent.get(key) ?? { name, absences: 0, lates: 0, lastDate: record.date };
      if (record.status === 'absent') entry.absences += 1;
      if (record.status === 'late') entry.lates += 1;
      if (record.date > entry.lastDate) entry.lastDate = record.date;
      byStudent.set(key, entry);
    }
    for (const [key, entry] of byStudent) {
      if (entry.absences >= ABSENCE_THRESHOLD) {
        items.push({
          id: `absence-${key}`,
          student: entry.name,
          detail: 'Présence',
          title: 'Absence excessive',
          description: `${entry.absences} absences enregistrées`,
          date: entry.lastDate,
          severity: 'high',
          link: '/app/attendance',
        });
      } else if (entry.lates >= LATE_THRESHOLD) {
        items.push({
          id: `late-${key}`,
          student: entry.name,
          detail: 'Présence',
          title: 'Retards répétés',
          description: `${entry.lates} retards enregistrés`,
          date: entry.lastDate,
          severity: 'medium',
          link: '/app/attendance',
        });
      }
    }

    if (kpis) {
      if (kpis.totalStudents === 0) {
        items.push({
          id: 'missing-students',
          student: 'Données manquantes',
          detail: 'École',
          title: 'Aucun élève enregistré',
          description: 'Ajoutez des élèves pour activer le suivi',
          date: new Date().toISOString(),
          severity: 'medium',
          link: '/app/students',
        });
      }
      if (kpis.totalTeachers === 0) {
        items.push({
          id: 'missing-teachers',
          student: 'Données manquantes',
          detail: 'École',
          title: 'Aucun enseignant enregistré',
          description: 'Ajoutez des enseignants pour compléter les classes',
          date: new Date().toISOString(),
          severity: 'low',
          link: '/app/teachers',
        });
      }
      if (kpis.totalStudents > 0 && kpis.attendanceRate < 85) {
        items.push({
          id: 'low-attendance',
          student: 'Indicateur école',
          detail: 'Présence',
          title: 'Taux de présence faible',
          description: `Taux du jour : ${kpis.attendanceRate}%`,
          date: new Date().toISOString(),
          severity: 'medium',
          link: '/app/attendance',
        });
      }
    }

    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [overdueFees, attendance, kpis]);

  const openAlerts = allAlerts.filter((a) => !dismissed.includes(a.id));
  const resolvedAlerts = allAlerts.filter((a) => dismissed.includes(a.id));

  const handleDismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    addToast('success', 'Alerte marquée comme traitée');
  };

  const handleRestore = (id: string) => {
    const next = dismissed.filter((d) => d !== id);
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Alertes</h1>
          <p className="text-muted dark:text-gray-400 mt-1">{openAlerts.length} alertes actives</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-danger/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Alertes actives</p>
                <p className="text-xl font-bold text-danger">{openAlerts.length}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">En attente</p>
                <p className="text-xl font-bold text-warning">{openAlerts.filter((a) => a.severity === 'medium').length}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <Check className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Résolues</p>
                <p className="text-xl font-bold text-success">{resolvedAlerts.length}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {isLoading && (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted dark:text-gray-400">Chargement des alertes…</p>
          </div>
        )}

        {!isLoading && openAlerts.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted dark:text-gray-400">Aucune alerte active. Tout est en ordre.</p>
          </div>
        )}

        {/* Open Alerts */}
        {openAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2 mb-6">
            <Bell className="w-5 h-5 text-danger" />
            Alertes actives
          </h3>
          <div className="space-y-3">
            {openAlerts.map((alert, index) => {
              const config = severityConfig[alert.severity];
              const parts = alert.student.split(' ');
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  onClick={() => navigate(alert.link)}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', config.color)}>
                      <span className="text-xs font-semibold text-white">
                        {getInitials(parts[0] ?? '', parts[1] ?? '')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{alert.student} — {alert.detail}</p>
                      <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{alert.title}: {alert.description}</p>
                      <p className="text-xs text-muted dark:text-gray-500 mt-0.5">{formatDate(alert.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('badge', config.badge)}>{config.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(alert.id); }}
                      className="p-2 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors text-success"
                      title="Résoudre"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(alert.link); }}
                      className="p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors text-primary-500"
                      title="Voir"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
        )}

        {/* Resolved Alerts */}
        {resolvedAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-6"
        >
          <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2 mb-6">
            <Check className="w-5 h-5 text-success" />
            Alertes résolues
          </h3>
          <div className="space-y-3">
            {resolvedAlerts.map((alert, index) => {
              const parts = alert.student.split(' ');
              return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.05 }}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl opacity-70"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-white/10 rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted">
                      {getInitials(parts[0] ?? '', parts[1] ?? '')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">{alert.student} — {alert.detail}</p>
                    <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{alert.title}: {alert.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(alert.id)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors text-muted"
                  title="Restaurer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
              );
            })}
          </div>
        </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
