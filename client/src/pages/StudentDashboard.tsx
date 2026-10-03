import { motion } from 'motion/react';
import {
  GraduationCap,
  CalendarCheck,
  Calendar,
  Bell,
  TrendingUp,
  Clock,
  BookOpen,
  Award,
  ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import { useNavigate } from 'react-router-dom';
import { formatDate, getGradeColor } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  classId?: string | null;
  class?: { id: string; name: string } | null;
}

interface GradeRow {
  id: string;
  studentId: string;
  score: number | string;
  coefficient: number | string;
  date: string;
  subject?: { id: string; name: string } | null;
}

interface AttendanceRow {
  id: string;
  status: string;
  date: string;
}

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  subject?: { id: string; name: string } | null;
}

interface ReportCardRow {
  id: string;
  studentId: string;
  term: number;
  average: number | string;
  rank: number;
  totalStudents: number;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const fetchMyStudentRecord = async (email?: string | null): Promise<StudentRow | null> => {
  const res = await api.get('/students', { params: { limit: 200 } });
  const items: StudentRow[] = res.data?.data?.items ?? [];
  if (!email) return null;
  return items.find((s) => s.email?.toLowerCase() === email.toLowerCase()) ?? null;
};

const fetchGrades = async (studentId: string): Promise<GradeRow[]> => {
  const res = await api.get('/grades', { params: { studentId } });
  return res.data?.data?.items ?? [];
};

const fetchAttendance = async (studentId: string): Promise<AttendanceRow[]> => {
  const res = await api.get('/attendance', { params: { studentId } });
  return res.data?.data?.items ?? [];
};

const fetchWeekSchedule = async (classId: string): Promise<Record<string, TimetableEntry[]>> => {
  const res = await api.get(`/timetable/class/${classId}/week`);
  return res.data?.data?.week ?? {};
};

const fetchMyReportCards = async (studentId: string): Promise<ReportCardRow[]> => {
  const res = await api.get('/report-cards');
  const items: ReportCardRow[] = res.data?.data?.items ?? [];
  return items.filter((r) => r.studentId === studentId);
};

const fetchNotifications = async (): Promise<NotificationRow[]> => {
  const res = await api.get('/notifications');
  return res.data?.data?.items ?? [];
};

export default function StudentDashboard() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const navigate = useNavigate();

  const { data: studentRecord } = useQuery({
    queryKey: ['student-record', user?.email],
    queryFn: () => fetchMyStudentRecord(user?.email),
    enabled: !!user,
  });

  const studentId = studentRecord?.id;

  const { data: grades = [] } = useQuery({
    queryKey: ['student-grades', studentId],
    queryFn: () => fetchGrades(studentId!),
    enabled: !!studentId,
  });

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: () => fetchAttendance(studentId!),
    enabled: !!studentId,
  });

  const { data: weekSchedule = {} } = useQuery({
    queryKey: ['student-schedule', studentRecord?.classId],
    queryFn: () => fetchWeekSchedule(studentRecord!.classId!),
    enabled: !!studentRecord?.classId,
  });

  const { data: myReportCards = [] } = useQuery({
    queryKey: ['student-report-cards', studentId],
    queryFn: () => fetchMyReportCards(studentId!),
    enabled: !!studentId,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['student-notifications'],
    queryFn: fetchNotifications,
  });

  // Latest grade per subject
  const gradesBySubject = (() => {
    const map = new Map<string, GradeRow>();
    for (const g of grades) {
      const key = g.subject?.id ?? g.id;
      const prev = map.get(key);
      if (!prev || new Date(g.date) > new Date(prev.date)) map.set(key, g);
    }
    return [...map.values()];
  })();

  const totalCoef = gradesBySubject.reduce((sum, g) => sum + Number(g.coefficient || 1), 0);
  const avgGrade = totalCoef > 0
    ? (gradesBySubject.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient || 1), 0) / totalCoef).toFixed(1)
    : '—';

  const present = attendanceRecords.filter((a) => a.status === 'present').length;
  const absent = attendanceRecords.filter((a) => a.status === 'absent').length;
  const late = attendanceRecords.filter((a) => a.status === 'late').length;
  const total = attendanceRecords.length;
  const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0;
  const attendanceSummary = { present, absent, late, total, rate: attendanceRate };

  const schedule = DAY_NAMES.map((day, idx) => ({
    id: String(idx + 1),
    day,
    slots: (weekSchedule[String(idx + 1)] ?? []).map((e) => ({
      time: `${e.startTime} – ${e.endTime}`,
      subject: e.subject?.name ?? '—',
      room: e.room ?? '—',
    })),
  })).filter((d) => d.slots.length > 0);

  const latestReport = myReportCards[0];
  const rankLabel = latestReport ? `${latestReport.rank}/${latestReport.totalStudents}` : '—';

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">
              {t('dashboard.welcome')}, {user?.name}
            </h1>
            <p className="text-muted dark:text-gray-400 mt-1">Voici votre espace étudiant</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(new Date().toISOString())}</span>
          </div>
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
                <TrendingUp className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Moyenne</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{avgGrade === '—' ? '—' : `${avgGrade}/20`}</p>
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
                <p className="text-xs text-muted dark:text-gray-400">Présence</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceSummary.rate}%</p>
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
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Retards</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{attendanceSummary.late}</p>
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
              <div className="w-10 h-10 bg-purple/10 rounded-xl flex items-center justify-center">
                <Award className="w-5 h-5 text-purple" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Rang</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{rankLabel}</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grades by Subject */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-500" />
                Notes par matière
              </h3>
              <button
                onClick={() => navigate('/app/grades')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Voir tout
              </button>
            </div>
            <div className="space-y-3">
              {!studentId && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun dossier élève lié à votre compte</p>
              )}
              {studentId && gradesBySubject.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune note enregistrée</p>
              )}
              {gradesBySubject.map((grade, index) => (
                <motion.div
                  key={grade.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-500/10 rounded-lg flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-500">{Number(grade.coefficient || 1)}</span>
                    </div>
                    <span className="text-sm font-medium text-text dark:text-gray-200">{grade.subject?.name ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-bold', getGradeColor(Number(grade.score)))}>
                      {Number(grade.score)}/20
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Attendance Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-success" />
                Résumé de présence
              </h3>
              <button
                onClick={() => navigate('/app/attendance')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Détails
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-success">{attendanceSummary.present}</p>
                <p className="text-xs text-muted dark:text-gray-400">Présent</p>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-danger">{attendanceSummary.absent}</p>
                <p className="text-xs text-muted dark:text-gray-400">Absent</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-warning">{attendanceSummary.late}</p>
                <p className="text-xs text-muted dark:text-gray-400">Retard</p>
              </div>
            </div>
            <div className="h-2.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${attendanceSummary.rate}%` }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="h-full bg-success rounded-full"
              />
            </div>
            <p className="text-xs text-muted dark:text-gray-400 mt-2 text-center">
              Taux de présence: {attendanceSummary.rate}%
            </p>
          </motion.div>
        </div>

        {/* Schedule */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-500" />
              Emploi du temps
            </h3>
          </div>
          <div className="overflow-x-auto">
            {schedule.length === 0 ? (
              <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun emploi du temps disponible</p>
            ) : (
            <div className="flex gap-4 min-w-max">
              {schedule.map((day, dayIndex) => (
                <motion.div
                  key={day.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + dayIndex * 0.05 }}
                  className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 min-w-[200px]"
                >
                  <p className="font-semibold text-text dark:text-gray-200 mb-3 text-center">{day.day}</p>
                  <div className="space-y-2">
                    {day.slots.map((slot) => (
                      <div key={slot.time} className="bg-white dark:bg-white/5 rounded-lg p-2.5 border border-border dark:border-white/10">
                        <p className="text-xs font-medium text-text dark:text-gray-300">{slot.time}</p>
                        <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{slot.subject}</p>
                        <p className="text-xs text-muted dark:text-gray-500">{slot.room}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Report Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="card p-6"
          >
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2 mb-6">
              <GraduationCap className="w-5 h-5 text-warning" />
              Mes bulletins
            </h3>
            <div className="space-y-3">
              {!studentId && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun dossier élève lié à votre compte</p>
              )}
              {studentId && myReportCards.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun bulletin disponible</p>
              )}
              {myReportCards.map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">Trimestre {report.term}</p>
                    <p className="text-xs text-muted dark:text-gray-400 mt-0.5">
                      Moyenne {Number(report.average)}/20 · Rang {report.rank}/{report.totalStudents}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/app/report-cards')}
                    className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
                  >
                    Voir
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Announcements */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary-500" />
                Annonces
              </h3>
              <button
                onClick={() => navigate('/app/announcements')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Voir tout
              </button>
            </div>
            <div className="space-y-3">
              {announcements.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune annonce</p>
              )}
              {announcements.map((ann, index) => (
                <motion.div
                  key={ann.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.05 }}
                  className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{ann.title}</p>
                      <p className="text-xs text-muted dark:text-gray-400 mt-1">{ann.message}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted dark:text-gray-500 flex-shrink-0 mt-1" />
                  </div>
                  <p className="text-xs text-muted dark:text-gray-500 mt-2">{formatDate(ann.createdAt)}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
