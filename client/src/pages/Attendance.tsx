import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check, X, Clock, Users, Save } from 'lucide-react';
import axios from 'axios';
import api from '../lib/api';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate, getInitials } from '../lib/utils';
import { cn } from '../lib/utils';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
  student?: AttendanceStudent | null;
}

interface ClassOption {
  id: string;
  name: string;
}

interface RosterStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classId?: string | null;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function Attendance() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedDate, setSelectedDate] = useState(today);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});

  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await api.get('/classes');
      return res.data.data.items as ClassOption[];
    },
  });

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['students-roster', selectedClassId],
    queryFn: async (): Promise<RosterStudent[]> => {
      const res = await api.get('/students', { params: { classId: selectedClassId, limit: 200 } });
      return res.data.data.items as RosterStudent[];
    },
    enabled: !!selectedClassId,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['attendance', selectedClassId, selectedDate],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const res = await api.get('/attendance', { params: { classId: selectedClassId, date: selectedDate } });
      return res.data.data.items as AttendanceRecord[];
    },
    enabled: !!selectedClassId && !!selectedDate,
  });

  const { data: historyRecords = [] } = useQuery({
    queryKey: ['attendance-history', selectedClassId],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const res = await api.get('/attendance', { params: { classId: selectedClassId } });
      return res.data.data.items as AttendanceRecord[];
    },
    enabled: !!selectedClassId,
  });

  // Reset local marks when switching class/date so stale marks don't leak.
  useEffect(() => {
    setAttendance({});
  }, [selectedClassId, selectedDate]);

  const recordByStudent = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    for (const r of records) map.set(r.studentId, r);
    return map;
  }, [records]);

  const currentStatus = (studentId: string): AttendanceStatus | 'unmarked' =>
    attendance[studentId] ?? recordByStudent.get(studentId)?.status ?? 'unmarked';

  // Backend supports bulk upsert: POST /attendance { classId, date, records[] }.
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = roster
        .map((s) => ({ studentId: s.id, status: currentStatus(s.id) }))
        .filter((r) => r.status !== 'unmarked')
        .map((r) => ({ studentId: r.studentId, status: r.status as AttendanceStatus }));
      const res = await api.post('/attendance', {
        classId: selectedClassId,
        date: selectedDate,
        records: payload,
      });
      return res.data.data.items as AttendanceRecord[];
    },
    onSuccess: (items) => {
      addToast('success', `${items.length} présence(s) enregistrée(s) avec succès`);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
    },
    onError: (err) => {
      addToast('error', apiErrorMessage(err, "Erreur lors de l'enregistrement"));
    },
  });

  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    const all: Record<string, AttendanceStatus> = {};
    roster.forEach((s) => { all[s.id] = status; });
    setAttendance(all);
  };

  const getStatusCount = (status: string) => {
    return roster.filter((s) => currentStatus(s.id) === status).length;
  };

  const handleSaveAll = () => {
    if (!selectedClassId) {
      addToast('error', 'Sélectionnez une classe');
      return;
    }
    saveMutation.mutate();
  };

  const history = useMemo(() => {
    const byDate = new Map<string, { date: string; present: number; absent: number; late: number; total: number }>();
    for (const r of historyRecords) {
      const key = new Date(r.date).toISOString().split('T')[0];
      let entry = byDate.get(key);
      if (!entry) {
        entry = { date: key, present: 0, absent: 0, late: 0, total: 0 };
        byDate.set(key, entry);
      }
      entry.total += 1;
      if (r.status === 'present') entry.present += 1;
      else if (r.status === 'absent') entry.absent += 1;
      else if (r.status === 'late' || r.status === 'excused') entry.late += 1;
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
  }, [historyRecords]);

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name ?? '';
  const isLoading = rosterLoading || recordsLoading;
  const hasMarks = Object.keys(attendance).length > 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('attendance.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{t('attendance.today')} — {formatDate(selectedDate)}</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input-field w-auto"
            />
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="input-field w-auto"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Présents', count: getStatusCount('present'), color: 'bg-success', icon: Check },
            { label: 'Absents', count: getStatusCount('absent'), color: 'bg-danger', icon: X },
            { label: 'Retards', count: getStatusCount('late'), color: 'bg-warning', icon: Clock },
            { label: 'Total', count: roster.length, color: 'bg-primary-500', icon: Users },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-text dark:text-gray-100">{stat.count}</p>
                  <p className="text-xs text-muted dark:text-gray-400">{stat.label}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => markAll('present')} className="btn-secondary text-sm flex items-center gap-1">
            <Check className="w-4 h-4" />
            Tous présents
          </button>
          <button onClick={() => markAll('absent')} className="btn-secondary text-sm flex items-center gap-1">
            <X className="w-4 h-4" />
            Tous absents
          </button>
          <button onClick={() => markAll('late')} className="btn-secondary text-sm flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Tous en retard
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSaveAll}
            disabled={saveMutation.isPending || !hasMarks}
            className="btn-primary text-sm flex items-center gap-1"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer tout'}
          </button>
        </div>

        {/* Attendance Marking */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border dark:border-white/10 bg-gray-50 dark:bg-white/5 flex items-center justify-between">
            <h3 className="font-semibold text-text dark:text-gray-100">Marquage des présences</h3>
            <span className="text-sm text-muted dark:text-gray-400">{roster.length} élèves</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : roster.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted dark:text-gray-400">
              Aucun élève dans cette classe
            </p>
          ) : (
            <div className="divide-y divide-border dark:divide-white/5">
              {roster.map((student, index) => {
                const status = currentStatus(student.id);
                return (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-primary-500">
                          {getInitials(student.firstName, student.lastName)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text dark:text-gray-200">{student.firstName} {student.lastName}</p>
                        <p className="text-xs text-muted dark:text-gray-400">{selectedClassName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markAttendance(student.id, 'present')}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          status === 'present'
                            ? 'bg-success text-white'
                            : 'hover:bg-green-50 dark:hover:bg-green-500/10 text-muted dark:text-gray-400'
                        )}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => markAttendance(student.id, 'absent')}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          status === 'absent'
                            ? 'bg-danger text-white'
                            : 'hover:bg-red-50 dark:hover:bg-red-500/10 text-muted dark:text-gray-400'
                        )}
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => markAttendance(student.id, 'late')}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          status === 'late'
                            ? 'bg-warning text-white'
                            : 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-muted dark:text-gray-400'
                        )}
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance History */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border dark:border-white/10 bg-gray-50 dark:bg-white/5">
            <h3 className="font-semibold text-text dark:text-gray-100">{t('attendance.history')}</h3>
          </div>
          {history.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted dark:text-gray-400">Aucun historique pour cette classe</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Classe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Présents</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Absents</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Retards</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Taux</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {history.map((record) => (
                  <tr key={record.date} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{formatDate(record.date)}</td>
                    <td className="px-4 py-3">
                      <span className="badge-info badge">{selectedClassName}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-success">{record.present}</td>
                    <td className="px-4 py-3 text-sm font-medium text-danger">{record.absent}</td>
                    <td className="px-4 py-3 text-sm font-medium text-warning">{record.late}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-text dark:text-gray-200">
                        {record.total === 0 ? '—' : `${((record.present / record.total) * 100).toFixed(0)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
