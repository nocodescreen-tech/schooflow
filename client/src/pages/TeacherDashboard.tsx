import { motion } from 'motion/react';
import {
  CalendarCheck,
  ClipboardList,
  MessageSquare,
  Users,
  Clock,
  BookOpen,
  ChevronRight,
  Plus,
  Send,
  Check,
  GraduationCap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { useSettingsStore } from '../store/settingsStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { formatDate, getInitials } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface TimetableEntry {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  room?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  class?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  teacher?: { id: string; name: string } | null;
}

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  classId?: string | null;
  class?: { id: string; name: string } | null;
}

interface GradeRow {
  id: string;
  studentId: string;
  score: number | string;
  coefficient: number | string;
  examName?: string;
  examType?: string;
  date: string;
  student?: { id: string; firstName: string; lastName: string } | null;
  subject?: { id: string; name: string } | null;
}

interface AttendanceRow {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: string;
}

const fetchMyTimetable = async (teacherId: string): Promise<TimetableEntry[]> => {
  const res = await api.get('/timetable', { params: { teacherId } });
  return res.data?.data?.items ?? [];
};

const fetchStudents = async (): Promise<StudentRow[]> => {
  const res = await api.get('/students', { params: { limit: 100 } });
  return res.data?.data?.items ?? [];
};

const fetchGrades = async (): Promise<GradeRow[]> => {
  const res = await api.get('/grades');
  return res.data?.data?.items ?? [];
};

const fetchAttendance = async (): Promise<AttendanceRow[]> => {
  const res = await api.get('/attendance');
  return res.data?.data?.items ?? [];
};

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();

  const quickActions = [
    { label: 'Faire l\'appel', icon: CalendarCheck, path: '/app/attendance', color: 'bg-success' },
    { label: 'Saisir des notes', icon: ClipboardList, path: '/app/grades', color: 'bg-warning' },
    { label: 'Message aux parents', icon: MessageSquare, path: '/app/messages', color: 'bg-primary-500' },
  ];

  const { data: myEntries = [] } = useQuery({
    queryKey: ['teacher-timetable', user?.id],
    queryFn: () => fetchMyTimetable(user!.id),
    enabled: !!user?.id,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['teacher-students'],
    queryFn: fetchStudents,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['teacher-grades'],
    queryFn: fetchGrades,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['teacher-attendance'],
    queryFn: fetchAttendance,
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;

  const studentsInClass = (classId?: string | null) =>
    classId ? students.filter((s) => s.classId === classId).length : 0;

  const todaysClasses = myEntries
    .filter((e) => e.dayOfWeek === todayDow)
    .map((e) => ({
      id: e.id,
      name: e.subject?.name ?? '—',
      class: e.class?.name ?? '—',
      classId: e.classId,
      time: `${e.startTime} – ${e.endTime}`,
      room: e.room ?? '—',
      students: studentsInClass(e.classId),
    }));

  const studentAvg = (studentId: string) => {
    const sg = grades.filter((g) => g.studentId === studentId);
    if (sg.length === 0) return null;
    const total = sg.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient || 1), 0);
    const coef = sg.reduce((sum, g) => sum + Number(g.coefficient || 1), 0);
    return coef > 0 ? total / coef : null;
  };

  const studentAttendanceRate = (studentId: string) => {
    const sa = attendance.filter((a) => a.studentId === studentId);
    if (sa.length === 0) return null;
    const present = sa.filter((a) => a.status === 'present' || a.status === 'late').length;
    return Math.round((present / sa.length) * 100);
  };

  const classStudents = students.slice(0, 5).map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    class: s.class?.name ?? '—',
    avg: studentAvg(s.id),
    attendance: studentAttendanceRate(s.id),
  }));

  const recentGrades = grades.slice(0, 3).map((g) => ({
    id: g.id,
    exam: g.examName || g.examType || 'Évaluation',
    class: g.subject?.name ?? '—',
    subject: g.student ? `${g.student.firstName} ${g.student.lastName}` : '',
    score: Number(g.score),
    dueDate: g.date,
  }));

  const attendanceToMark = (() => {
    const todayRecords = attendance.filter((a) => String(a.date).startsWith(todayStr));
    const byClass = new Map<string, { class: string; time: string; total: number; marked: number }>();
    for (const entry of myEntries.filter((e) => e.dayOfWeek === todayDow)) {
      if (!byClass.has(entry.classId)) {
        byClass.set(entry.classId, {
          class: entry.class?.name ?? '—',
          time: entry.startTime,
          total: studentsInClass(entry.classId),
          marked: 0,
        });
      }
    }
    for (const record of todayRecords) {
      const slot = byClass.get(record.classId);
      if (slot) slot.marked += 1;
    }
    return [...byClass.entries()].map(([id, v]) => ({ id, ...v }));
  })();

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">
              {t('dashboard.welcome')}, {user?.name}
            </h1>
            <p className="text-muted dark:text-gray-400 mt-1">Voici votre journée d'enseignement</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{formatDate(new Date().toISOString())}</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action, index) => (
            <motion.button
              key={action.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(action.path)}
              className="card card-hover p-5 flex items-center gap-4 text-left"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-text dark:text-gray-100">{action.label}</p>
                <p className="text-xs text-muted dark:text-gray-400 mt-0.5">Accéder</p>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Today's Classes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary-500" />
              Cours du jour
            </h3>
            <span className="badge-info badge">{todaysClasses.length} cours</span>
          </div>
          <div className="space-y-3">
            {todaysClasses.length === 0 && (
              <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun cours prévu aujourd'hui</p>
            )}
            {todaysClasses.map((cls, index) => (
              <motion.div
                key={cls.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-primary-500" />
                  </div>
                  <div>
                    <p className="font-medium text-text dark:text-gray-200">{cls.name} — {cls.class}</p>
                    <p className="text-xs text-muted dark:text-gray-400">{cls.room} · {cls.students} élèves</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-text dark:text-gray-300">{cls.time}</span>
                  <button
                    onClick={() => navigate('/app/attendance')}
                    className="p-2 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors text-primary-500"
                    title="Faire l'appel"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Students in Their Classes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-500" />
                Mes élèves
              </h3>
              <button
                onClick={() => navigate('/app/students')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Voir tout
              </button>
            </div>
            <div className="space-y-3">
              {classStudents.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun élève enregistré</p>
              )}
              {classStudents.map((student, index) => (
                <motion.div
                  key={student.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary-500">
                        {getInitials(student.name.split(' ')[0], student.name.split(' ')[1] || '')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.name}</p>
                      <p className="text-xs text-muted dark:text-gray-400">{student.class}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-text dark:text-gray-300">{student.avg !== null ? `${student.avg.toFixed(1)}/20` : '—'}</span>
                    {student.attendance !== null && (
                    <span className={cn('badge', student.attendance >= 95 ? 'badge-success' : student.attendance >= 90 ? 'badge-warning' : 'badge-danger')}>
                      {student.attendance}%
                    </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Pending Grade Entries */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-warning" />
                Notes récentes
              </h3>
              <button
                onClick={() => navigate('/app/grades')}
                className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
              >
                Saisir
              </button>
            </div>
            <div className="space-y-3">
              {recentGrades.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucune note enregistrée</p>
              )}
              {recentGrades.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">{item.exam} — {item.class}</p>
                    <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{item.subject} · {item.score}/20</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted dark:text-gray-400">{formatDate(item.dueDate)}</span>
                    <button
                      onClick={() => navigate('/app/grades')}
                      className="p-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors text-warning"
                      title="Voir les notes"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Attendance to Mark */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-success" />
              Appels à faire
            </h3>
            <button
              onClick={() => navigate('/app/attendance')}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Marquer les présences
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {attendanceToMark.map((item, index) => {
              const isComplete = item.marked === item.total;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className={cn(
                    'p-4 rounded-xl border',
                    isComplete
                      ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20'
                      : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-text dark:text-gray-200">{item.class}</p>
                    <span className="text-xs text-muted dark:text-gray-400">{item.time}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted dark:text-gray-400">
                      {item.marked}/{item.total} marqués
                    </span>
                    {isComplete ? (
                      <span className="badge-success badge">Terminé</span>
                    ) : (
                      <button
                        onClick={() => navigate('/app/attendance')}
                        className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
                      >
                        Marquer
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Message Parents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-primary-500" />
              Message aux parents
            </h3>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <p className="text-sm text-muted dark:text-gray-400 flex-1">
              Échangez avec les parents depuis la messagerie.
            </p>
            <button
              onClick={() => navigate('/app/messages')}
              className="btn-primary flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Ouvrir la messagerie
            </button>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
