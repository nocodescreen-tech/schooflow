import { motion } from 'motion/react';
import {
  CalendarCheck,
  AlertTriangle,
  FileText,
  Users,
  TrendingDown,
  Eye,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import PageTransition from '../components/PageTransition';
import { useNavigate } from 'react-router-dom';
import { getInitials } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface AttendanceRow {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: string;
  student?: { id: string; firstName: string; lastName: string } | null;
}

interface ClassRow {
  id: string;
  name: string;
}

interface DashboardKpis {
  totalStudents: number;
  attendanceRate: number;
}

const fetchAttendance = async (date?: string): Promise<AttendanceRow[]> => {
  const res = await api.get('/attendance', { params: date ? { date } : {} });
  return res.data?.data?.items ?? [];
};

const fetchClasses = async (): Promise<ClassRow[]> => {
  const res = await api.get('/classes');
  return res.data?.data?.items ?? [];
};

const fetchKpis = async (): Promise<DashboardKpis> => {
  const res = await api.get('/dashboard');
  return res.data?.data?.kpis;
};

const STATUS_LABELS: Record<string, string> = {
  present: 'Présents',
  absent: 'Absents',
  late: 'En retard',
  excused: 'Excusés',
};

export default function PrefectDashboard() {
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().split('T')[0];

  const { data: kpis } = useQuery({
    queryKey: ['prefect-kpis'],
    queryFn: fetchKpis,
  });

  const { data: todayAttendance = [] } = useQuery({
    queryKey: ['prefect-attendance-today', todayStr],
    queryFn: () => fetchAttendance(todayStr),
  });

  const { data: allAttendance = [] } = useQuery({
    queryKey: ['prefect-attendance-all'],
    queryFn: () => fetchAttendance(),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['prefect-classes'],
    queryFn: fetchClasses,
  });

  const classNameOf = (classId: string) => classes.find((c) => c.id === classId)?.name ?? '—';

  const presentToday = todayAttendance.filter((a) => a.status === 'present').length;
  const absentToday = todayAttendance.filter((a) => a.status === 'absent').length;
  const lateToday = todayAttendance.filter((a) => a.status === 'late').length;

  const attendanceOverview = {
    totalStudents: kpis?.totalStudents ?? 0,
    presentToday,
    absentToday,
    lateToday,
    rate: kpis?.attendanceRate ?? 0,
  };

  const excessiveAbsences = (() => {
    const byStudent = new Map<string, { name: string; class: string; absences: number; total: number }>();
    for (const a of allAttendance) {
      const key = a.studentId;
      const entry = byStudent.get(key) ?? {
        name: a.student ? `${a.student.firstName} ${a.student.lastName}` : a.studentId,
        class: classNameOf(a.classId),
        absences: 0,
        total: 0,
      };
      entry.total += 1;
      if (a.status === 'absent') entry.absences += 1;
      byStudent.set(key, entry);
    }
    return [...byStudent.entries()]
      .map(([id, v]) => ({
        id,
        ...v,
        rate: v.total > 0 ? Math.round(((v.total - v.absences) / v.total) * 100) : 100,
      }))
      .filter((s) => s.absences > 0)
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 5);
  })();

  const statusBreakdown = ['present', 'absent', 'late', 'excused'].map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: todayAttendance.filter((a) => a.status === status).length,
  }));

  const classAttendance = (() => {
    const byClass = new Map<string, { present: number; total: number }>();
    for (const a of todayAttendance) {
      const entry = byClass.get(a.classId) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (a.status === 'present' || a.status === 'late') entry.present += 1;
      byClass.set(a.classId, entry);
    }
    return [...byClass.entries()].map(([classId, v]) => ({
      class: classNameOf(classId),
      rate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
    }));
  })();

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Dashboard Préfet</h1>
          <p className="text-muted dark:text-gray-400 mt-1">Vue d'ensemble de la discipline et des présences</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Élèves</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceOverview.totalStudents}</p>
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
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Présents</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceOverview.presentToday}</p>
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
              <div className="w-10 h-10 bg-danger/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Absents</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceOverview.absentToday}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Retards</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceOverview.lateToday}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Students with Excessive Absences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" />
                Absences excessives
              </h3>
              <button
                onClick={() => navigate('/app/alerts')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Voir tout
              </button>
            </div>
            <div className="space-y-3">
              {excessiveAbsences.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune absence enregistrée</p>
              )}
              {excessiveAbsences.map((student, index) => (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-danger/10 rounded-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-danger">
                        {getInitials(student.name.split(' ')[0], student.name.split(' ')[1] || '')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.name}</p>
                      <p className="text-xs text-muted dark:text-gray-400">{student.class}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-danger">{student.absences} absences</span>
                    <span className={cn('badge', student.rate >= 90 ? 'badge-warning' : 'badge-danger')}>
                      {student.rate}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Today's Status Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-primary-500" />
                Présences du jour par statut
              </h3>
              <button
                onClick={() => navigate('/app/attendance')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Voir tout
              </button>
            </div>
            <div className="space-y-3">
              {todayAttendance.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune présence enregistrée aujourd'hui</p>
              )}
              {statusBreakdown.map((item, index) => (
                <motion.div
                  key={item.status}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <span className="text-sm font-medium text-text dark:text-gray-200">{item.label}</span>
                  <span className={cn(
                    'badge',
                    item.status === 'present' ? 'badge-success' :
                    item.status === 'absent' ? 'badge-danger' :
                    item.status === 'late' ? 'badge-warning' : 'badge-info'
                  )}>
                    {item.count}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Class Attendance Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-success" />
              Comparaison par classe
            </h3>
            <button
              onClick={() => navigate('/app/attendance')}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Détails
            </button>
          </div>
          <div className="space-y-4">
            {classAttendance.length === 0 && (
              <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune présence enregistrée aujourd'hui</p>
            )}
            {classAttendance.map((item, index) => (
              <motion.div
                key={item.class}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.05 }}
                className="flex items-center gap-4"
              >
                <span className="text-sm font-medium text-text dark:text-gray-300 w-20">{item.class}</span>
                <div className="flex-1 h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.rate}%` }}
                    transition={{ delay: 0.6 + index * 0.05, duration: 0.5 }}
                    className={cn(
                      'h-full rounded-full',
                      item.rate >= 90 ? 'bg-success' : item.rate >= 85 ? 'bg-warning' : 'bg-danger'
                    )}
                  />
                </div>
                <div className="flex items-center gap-2 w-20">
                  <span className="text-sm font-medium text-text dark:text-gray-200">{item.rate}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Actions rapides</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Voir présences', icon: CalendarCheck, path: '/app/attendance', color: 'bg-success' },
              { label: 'Alertes', icon: AlertTriangle, path: '/app/alerts', color: 'bg-danger' },
              { label: 'Rapports', icon: FileText, path: '/app/reports', color: 'bg-primary-500' },
              { label: 'Élèves', icon: Users, path: '/app/students', color: 'bg-purple' },
            ].map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(action.path)}
                className="card card-hover p-4 flex flex-col items-center gap-3 text-center"
              >
                <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text dark:text-gray-200">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
