import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import PageTransition from '../components/PageTransition';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  subject?: { id: string; name: string; code?: string } | null;
  teacher?: { id: string; name: string } | null;
  class?: { id: string; name: string } | null;
}

interface StudentRow {
  id: string;
  email?: string | null;
  classId?: string | null;
  class?: { id: string; name: string } | null;
}

interface ClassRow {
  id: string;
  name: string;
}

const DAY_NAMES: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

function normalizeWeek(payload: unknown): Record<number, TimetableEntry[]> {
  const week: Record<number, TimetableEntry[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  if (!payload || typeof payload !== 'object') return week;
  const data = payload as { week?: Record<string, TimetableEntry[]>; items?: TimetableEntry[] };
  if (data.week) {
    for (const [day, entries] of Object.entries(data.week)) {
      const n = Number(day);
      if (n >= 1 && n <= 7 && Array.isArray(entries)) week[n] = entries;
    }
    return week;
  }
  if (Array.isArray(data.items)) {
    for (const entry of data.items) {
      if (entry.dayOfWeek >= 1 && entry.dayOfWeek <= 7) week[entry.dayOfWeek].push(entry);
    }
  }
  return week;
}

const fetchTeacherWeek = async (teacherId: string): Promise<Record<number, TimetableEntry[]>> => {
  const res = await api.get(`/timetable/teacher/${teacherId}/week`);
  return normalizeWeek(res.data?.data);
};

const fetchClassWeek = async (classId: string): Promise<Record<number, TimetableEntry[]>> => {
  const res = await api.get(`/timetable/class/${classId}/week`);
  return normalizeWeek(res.data?.data);
};

const fetchMyStudentRecord = async (email?: string | null): Promise<StudentRow | null> => {
  const res = await api.get('/students', { params: { limit: 200 } });
  const items: StudentRow[] = res.data?.data?.items ?? [];
  if (!email) return null;
  return items.find((s) => s.email?.toLowerCase() === email.toLowerCase()) ?? null;
};

const fetchClasses = async (): Promise<ClassRow[]> => {
  const res = await api.get('/classes');
  return res.data?.data?.items ?? [];
};

export default function Schedule() {
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const role = user?.role;
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const { data: studentRecord } = useQuery({
    queryKey: ['schedule-student-record', user?.email],
    queryFn: () => fetchMyStudentRecord(user?.email),
    enabled: isStudent && !!user,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['schedule-classes'],
    queryFn: fetchClasses,
    enabled: !isTeacher && !isStudent,
  });

  const effectiveClassId = isStudent
    ? (studentRecord?.classId ?? '')
    : selectedClassId || classes[0]?.id || '';

  const teacherWeekQuery = useQuery({
    queryKey: ['schedule-teacher-week', user?.id],
    queryFn: () => fetchTeacherWeek(user!.id),
    enabled: isTeacher && !!user?.id,
  });

  const classWeekQuery = useQuery({
    queryKey: ['schedule-class-week', effectiveClassId],
    queryFn: () => fetchClassWeek(effectiveClassId),
    enabled: !isTeacher && !!effectiveClassId,
  });

  const week = isTeacher ? (teacherWeekQuery.data ?? {}) : (classWeekQuery.data ?? {});
  const isLoading = isTeacher ? teacherWeekQuery.isLoading : classWeekQuery.isLoading;
  const isError = isTeacher ? teacherWeekQuery.isError : classWeekQuery.isError;

  const dayNumbers = useMemo(() => {
    const base = [1, 2, 3, 4, 5];
    if ((week[6]?.length ?? 0) > 0) base.push(6);
    if ((week[7]?.length ?? 0) > 0) base.push(7);
    return base;
  }, [week]);

  const totalSlots = dayNumbers.reduce((sum, d) => sum + (week[d]?.length ?? 0), 0);
  const contextLabel = isTeacher
    ? `Emploi du temps de ${user?.name ?? ''}`
    : (studentRecord?.class?.name ?? classes.find((c) => c.id === effectiveClassId)?.name ?? '');

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Emploi du temps</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {contextLabel ? `${contextLabel} · Semaine type` : 'Semaine type'}
            </p>
          </div>
          {!isTeacher && !isStudent && classes.length > 0 && (
            <select
              value={effectiveClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="input max-w-xs"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {isLoading && (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted dark:text-gray-400">Chargement de l'emploi du temps…</p>
          </div>
        )}

        {isError && (
          <div className="card p-8 text-center">
            <p className="text-sm text-danger">Impossible de charger l'emploi du temps.</p>
          </div>
        )}

        {!isLoading && !isError && totalSlots === 0 && (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted dark:text-gray-400">Aucun créneau planifié pour cette semaine.</p>
          </div>
        )}

        {/* Week View */}
        {!isLoading && !isError && totalSlots > 0 && (
        <div className={cn('grid grid-cols-1 gap-4', dayNumbers.length <= 5 ? 'md:grid-cols-5' : 'md:grid-cols-4 lg:grid-cols-7')}>
          {dayNumbers.map((day, dayIndex) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIndex * 0.1 }}
              className="space-y-3"
            >
              <div className="card p-4 text-center">
                <p className="font-semibold text-text dark:text-gray-100">{DAY_NAMES[day]}</p>
                <p className="text-xs text-muted dark:text-gray-400 mt-1">
                  {week[day]?.length ?? 0} créneau{(week[day]?.length ?? 0) > 1 ? 'x' : ''}
                </p>
              </div>
              {(week[day] ?? []).map((slot, slotIndex) => (
                <motion.div
                  key={slot.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + dayIndex * 0.1 + slotIndex * 0.05 }}
                  className="card p-3"
                >
                  <p className="text-xs font-medium text-primary-500">{slot.startTime} – {slot.endTime}</p>
                  <p className="text-sm font-semibold text-text dark:text-gray-200 mt-1">{slot.subject?.name ?? '—'}</p>
                  {slot.room && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-muted dark:text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{slot.room}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
                    {isTeacher ? (slot.class?.name ?? '') : (slot.teacher?.name ?? '')}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          ))}
        </div>
        )}

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-4"
        >
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {totalSlots} créneaux cette semaine
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {dayNumbers.length} jours / semaine
            </span>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
