import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import {
  Student,
  User,
  Attendance,
  Payment,
  Fee,
  Grade,
  Class,
  Subject,
  Document,
  GeneratedDocument,
  ReportCard,
  VacationTicket,
  Notification,
  AuditLog,
  Timetable,
  School,
} from '../models/index.js';
import { Op, fn, col, QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authenticateToken);
// Dashboard exposes school-wide aggregates: staff only (parents/students excluded).
router.use(requireRole('super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'));

// ---------- helpers ----------

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v: unknown): number {
  return Math.round(num(v) * 100) / 100;
}

function dayBounds(d: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday=1..Sunday=7 from a JS date
function dow1to7(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

// Teacher scoping: returns class ids for teachers, null for other roles
async function teacherClassIds(schoolId: string, user: { id: string; role: string }): Promise<string[] | null> {
  if (user.role !== 'teacher') return null;
  const cls = await Class.findAll({ where: { schoolId, teacherId: user.id }, attributes: ['id'], raw: true });
  return cls.map((c) => c.id);
}

function monthLabels(count: number, end: Date = new Date()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const base = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    out.push({ key, label });
  }
  return out;
}

// ---------- existing overview (kept, SQL injection fixed) ----------

router.get('/', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalStudents,
      totalTeachers,
      todayAttendance,
      collected,
      outstanding,
      avgGrade,
      totalGrades,
      totalExpected,
      totalCollectedAll,
    ] = await Promise.all([
      Student.count({ where: { schoolId, status: 'active' } }),
      User.count({ where: { schoolId, role: 'teacher', isActive: true } }),
      Attendance.count({ where: { schoolId, date: { [Op.gte]: today, [Op.lt]: tomorrow } } }),
      Payment.sum('amount', { where: { schoolId, date: { [Op.gte]: startOfMonth } } }),
      Fee.sum('amount', { where: { schoolId, status: { [Op.in]: ['pending', 'partial', 'overdue'] } } }),
      Grade.findOne({ attributes: [[fn('AVG', col('score')), 'avgScore']], where: { schoolId, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] }, raw: true }),
      Grade.count({ where: { schoolId, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] } }),
      Fee.sum('totalAmount', { where: { schoolId } }),
      Payment.sum('amount', { where: { schoolId } }),
    ]);

    const attendanceRate = todayAttendance > 0 ? Math.round((todayAttendance / (totalStudents || 1)) * 100) : 0;

    const expected = num(totalExpected);
    const collectedAll = num(totalCollectedAll);
    const outstandingAll = expected - collectedAll;
    const collectionRate = expected > 0 ? Math.round((collectedAll / expected) * 100) : 0;

    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const revenueByMonth = await Payment.findAll({
      attributes: [
        [fn('DATE_TRUNC', 'month', col('Payment.date')), 'month'],
        [fn('SUM', col('Payment.amount')), 'revenue'],
      ],
      where: { schoolId, date: { [Op.gte]: sixMonthsAgo } },
      group: [fn('DATE_TRUNC', 'month', col('Payment.date'))],
      order: [[fn('DATE_TRUNC', 'month', col('Payment.date')), 'ASC']],
      raw: true,
    });

    const attendanceByClass = await Attendance.findAll({
      attributes: [
        [fn('COUNT', col('Attendance.id')), 'count'],
        'status',
      ],
      where: { schoolId, date: { [Op.gte]: today } },
      group: ['status'],
      raw: true,
    });

    const gradeDistribution = (await sequelize.query(
      `SELECT CASE WHEN score >= 16 THEN 'A' WHEN score >= 14 THEN 'B' WHEN score >= 12 THEN 'C' WHEN score >= 10 THEN 'D' ELSE 'F' END as grade, COUNT(*) as count FROM grades WHERE school_id = :schoolId AND (status = 'PUBLISHED' OR status IS NULL) GROUP BY CASE WHEN score >= 16 THEN 'A' WHEN score >= 14 THEN 'B' WHEN score >= 12 THEN 'C' WHEN score >= 10 THEN 'D' ELSE 'F' END`,
      { replacements: { schoolId }, type: QueryTypes.SELECT }
    ) as unknown as Array<{ grade: string; count: string }>);

    return res.json({
      success: true,
      data: {
        kpis: {
          totalStudents,
          totalTeachers,
          attendanceRate,
          collected: num(collected),
          outstanding: num(outstanding),
          avgGrade: avgGrade ? round2((avgGrade as unknown as { avgScore: unknown }).avgScore) : 0,
          totalExpected: expected,
          totalCollected: collectedAll,
          totalOutstanding: outstandingAll,
          collectionRate,
        },
        charts: {
          revenueByMonth,
          attendanceByClass,
          gradeDistribution,
          totalGrades,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 1. /overview ----------

router.get('/overview', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const now = new Date();
    const { start: todayStart, end: todayEnd } = dayBounds(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalStudents,
      activeStudents,
      newThisMonth,
      totalTeachers,
      activeTeachers,
      classCount,
      todayByStatus,
      collectedMonth,
      totalExpected,
      totalCollected,
      avgRow,
      overdueRows,
    ] = await Promise.all([
      Student.count({ where: { schoolId } }),
      Student.count({ where: { schoolId, status: 'active' } }),
      Student.count({ where: { schoolId, enrollmentDate: { [Op.gte]: startOfMonth } } }),
      User.count({ where: { schoolId, role: 'teacher' } }),
      User.count({ where: { schoolId, role: 'teacher', isActive: true } }),
      Class.count({ where: { schoolId } }),
      Attendance.findAll({
        attributes: ['status', [fn('COUNT', col('Attendance.id')), 'count']],
        where: { schoolId, date: { [Op.gte]: todayStart, [Op.lt]: todayEnd } },
        group: ['status'],
        raw: true,
      }) as unknown as Promise<Array<{ status: string; count: string }>>,
      Payment.sum('amount', { where: { schoolId, date: { [Op.gte]: startOfMonth } } }),
      Fee.sum('totalAmount', { where: { schoolId } }),
      Payment.sum('amount', { where: { schoolId } }),
      Grade.findOne({ attributes: [[fn('AVG', col('score')), 'avgScore']], where: { schoolId, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] }, raw: true }) as Promise<{ avgScore: string } | null>,
      sequelize.query(
        `SELECT COUNT(*)::int AS "count", COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) AS total
         FROM fees WHERE school_id = :schoolId AND status = 'overdue'`,
        { replacements: { schoolId }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ count: number; total: string }>>,
    ]);

    const byStatus: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of todayByStatus) {
      if (r.status in byStatus) byStatus[r.status] = Number(r.count);
    }
    const todayTotal = byStatus.present + byStatus.absent + byStatus.late + byStatus.excused;
    const attendanceRate = todayTotal > 0 ? Math.round(((byStatus.present + byStatus.late) / todayTotal) * 100) : 0;

    const expected = num(totalExpected);
    const collectedAll = num(totalCollected);
    const outstanding = expected - collectedAll;
    const collectionRate = expected > 0 ? Math.round((collectedAll / expected) * 100) : 0;
    const avgGrade = avgRow ? round2(avgRow.avgScore) : 0;
    const overdue = overdueRows[0] || { count: 0, total: '0' };
    const avgClassSize = classCount > 0 ? round2(activeStudents / classCount) : 0;

    return res.json({
      success: true,
      data: {
        kpis: {
          students: { total: totalStudents, active: activeStudents, newThisMonth },
          teachers: { total: totalTeachers, active: activeTeachers },
          classes: { count: classCount, avgClassSize },
          attendanceToday: { ...byStatus, total: todayTotal, rate: attendanceRate },
          finance: { collectedMonth: num(collectedMonth) },
          overdue: { total: num(overdue.total), count: Number(overdue.count) || 0 },
          academic: { avgGrade },
          collection: { expected, collected: collectedAll, outstanding, rate: collectionRate },
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 2. /students ----------

router.get('/students', requirePermission('students', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const rangeStart = from && !isNaN(from.getTime()) ? from : new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
    const rangeEnd = to && !isNaN(to.getTime()) ? to : new Date();

    const [enrollRows, byClassRows, byGender] = await Promise.all([
      sequelize.query(
        `SELECT TO_CHAR(enrollment_date, 'YYYY-MM') AS month, COUNT(*)::int AS count
         FROM students WHERE school_id = :schoolId AND enrollment_date >= :rangeStart AND enrollment_date <= :rangeEnd
         GROUP BY 1 ORDER BY 1`,
        { replacements: { schoolId, rangeStart, rangeEnd }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ month: string; count: number }>>,
      sequelize.query(
        `SELECT c.id AS "classId", c.name AS name, COUNT(s.id)::int AS count
         FROM students s JOIN classes c ON c.id = s.class_id
         WHERE s.school_id = :schoolId GROUP BY c.id, c.name ORDER BY count DESC`,
        { replacements: { schoolId }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ classId: string; name: string; count: number }>>,
      Student.findAll({
        attributes: ['gender', [fn('COUNT', col('Student.id')), 'count']],
        where: { schoolId },
        group: ['gender'],
        raw: true,
      }) as unknown as Promise<Array<{ gender: string; count: string }>>,
    ]);

    const labels = monthLabels(12, rangeEnd);
    const byMonthMap = new Map(enrollRows.map((r) => [r.month, Number(r.count)]));
    const enrollmentByMonth = labels.map((l) => ({ month: l.key, label: l.label, count: byMonthMap.get(l.key) || 0 }));

    return res.json({
      success: true,
      data: {
        enrollmentByMonth,
        byClass: byClassRows.map((r) => ({ classId: r.classId, name: r.name, count: Number(r.count) })),
        byGender: (byGender as Array<{ gender: string; count: string }>).map((r) => ({ gender: r.gender, count: Number(r.count) })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 3. /teachers ----------

router.get('/teachers', requirePermission('teachers', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, inactive, newThisMonth, workload] = await Promise.all([
      User.count({ where: { schoolId, role: 'teacher' } }),
      User.count({ where: { schoolId, role: 'teacher', isActive: true } }),
      User.count({ where: { schoolId, role: 'teacher', isActive: false } }),
      User.count({ where: { schoolId, role: 'teacher', createdAt: { [Op.gte]: startOfMonth } } }),
      sequelize.query(
        `SELECT u.id AS "teacherId", u.name AS name, COUNT(c.id)::int AS "classCount"
         FROM users u LEFT JOIN classes c ON c.teacher_id = u.id AND c.school_id = :schoolId
         WHERE u.school_id = :schoolId AND u.role = 'teacher'
         GROUP BY u.id, u.name ORDER BY "classCount" DESC, u.name ASC LIMIT 8`,
        { replacements: { schoolId }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ teacherId: string; name: string; classCount: number }>>,
    ]);

    return res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
        newThisMonth,
        workload: workload.map((w) => ({ teacherId: w.teacherId, name: w.name, classCount: Number(w.classCount) })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 4. /attendance ----------

router.get('/attendance', requirePermission('attendance', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const user = req.user!;
    const classId = req.query.classId ? String(req.query.classId) : undefined;
    const dateParam = req.query.date ? new Date(String(req.query.date)) : new Date();
    const target = isNaN(dateParam.getTime()) ? new Date() : dateParam;
    const { start: dayStart, end: dayEnd } = dayBounds(target);

    const tIds = await teacherClassIds(schoolId, user);
    // Teachers are scoped to their own classes
    if (tIds !== null) {
      if (classId && !tIds.includes(classId)) {
        return res.json({ success: true, data: { today: { present: 0, absent: 0, late: 0, excused: 0, total: 0, rate: 0 }, last14days: [] } });
      }
    }
    const replacements: Record<string, unknown> = { schoolId, dayStart, dayEnd };
    let classCond = '';
    if (classId) {
      classCond = ' AND class_id = :classId';
      replacements.classId = classId;
    } else if (tIds !== null) {
      classCond = tIds.length > 0 ? ' AND class_id IN (:tIds)' : ' AND 1 = 0';
      replacements.tIds = tIds.length > 0 ? tIds : ['00000000-0000-0000-0000-000000000000'];
    }

    const [todayRows, seriesRows] = await Promise.all([
      sequelize.query(
        `SELECT status, COUNT(*)::int AS count FROM attendance
         WHERE school_id = :schoolId AND date >= :dayStart AND date < :dayEnd${classCond} GROUP BY status`,
        { replacements, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ status: string; count: number }>>,
      sequelize.query(
        `SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, status, COUNT(*)::int AS count FROM attendance
         WHERE school_id = :schoolId AND date >= :fromDate AND date < :dayEnd${classCond}
         GROUP BY 1, 2 ORDER BY 1`,
        {
          replacements: {
            ...replacements,
            fromDate: new Date(dayStart.getTime() - 13 * 24 * 60 * 60 * 1000),
          },
          type: QueryTypes.SELECT,
        }
      ) as unknown as Promise<Array<{ date: string; status: string; count: number }>>,
    ]);

    const today: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of todayRows) {
      if (r.status in today) today[r.status] = Number(r.count);
    }
    const total = today.present + today.absent + today.late + today.excused;
    const rate = total > 0 ? Math.round(((today.present + today.late) / total) * 100) : 0;

    const pivot = new Map<string, { present: number; absent: number; late: number; excused: number }>();
    for (const r of seriesRows) {
      if (!pivot.has(r.date)) pivot.set(r.date, { present: 0, absent: 0, late: 0, excused: 0 });
      const entry = pivot.get(r.date)!;
      if (r.status in entry) (entry as Record<string, number>)[r.status] = Number(r.count);
    }
    const last14days: Array<{ date: string; present: number; absent: number; late: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(dayStart.getTime() - i * 24 * 60 * 60 * 1000);
      const key = toISODate(d);
      const e = pivot.get(key) || { present: 0, absent: 0, late: 0, excused: 0 };
      last14days.push({ date: key, present: e.present, absent: e.absent, late: e.late });
    }

    return res.json({
      success: true,
      data: { today: { ...today, total, rate, date: toISODate(target) }, last14days },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 5. /academic ----------

router.get('/academic', requirePermission('grades', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const user = req.user!;
    const academicYear = req.query.academicYear ? String(req.query.academicYear) : undefined;
    const termRaw = req.query.term ? parseInt(String(req.query.term), 10) : undefined;
    const term = termRaw !== undefined && [1, 2, 3].includes(termRaw) ? termRaw : undefined;
    const classId = req.query.classId ? String(req.query.classId) : undefined;

    const tIds = await teacherClassIds(schoolId, user);
    const schoolRec = await School.findByPk(schoolId);
    const gradingSettings = (schoolRec?.settings as Record<string, unknown> | undefined)?.['grading'] as Record<string, unknown> | undefined;
    const passMarkRaw = Number(gradingSettings?.['passMark']);
    const passMark = Number.isFinite(passMarkRaw) ? passMarkRaw : 10;
    if (tIds !== null && classId && !tIds.includes(classId)) {
      return res.json({
        success: true,
        data: { avgGrade: 0, avgBySubject: [], avgByClass: [], topStudents: [], aboveBelow: { above10: 0, below10: 0 }, weakSubjects: [] },
      });
    }

    const conds: string[] = ['g.school_id = :schoolId', `(g.status = 'PUBLISHED' OR g.status IS NULL)`];
    const replacements: Record<string, unknown> = { schoolId };
    if (academicYear) {
      conds.push('g.academic_year = :academicYear');
      replacements.academicYear = academicYear;
    }
    if (term !== undefined) {
      conds.push('g.term = :term');
      replacements.term = term;
    }
    const effClassIds = classId ? [classId] : tIds;
    let classJoin = '';
    if (effClassIds !== null && effClassIds !== undefined) {
      if (effClassIds.length === 0) {
        return res.json({
          success: true,
          data: { avgGrade: 0, avgBySubject: [], avgByClass: [], topStudents: [], aboveBelow: { above10: 0, below10: 0 }, weakSubjects: [] },
        });
      }
      classJoin = 'JOIN students st ON st.id = g.student_id AND st.class_id IN (:effClassIds)';
      replacements.effClassIds = effClassIds;
    } else if (classId) {
      classJoin = 'JOIN students st ON st.id = g.student_id AND st.class_id = :classId';
      replacements.classId = classId;
    }
    const where = conds.join(' AND ');
    // Extra class condition for queries that already join students as s2
    const s2ClassCond =
      effClassIds !== null && effClassIds !== undefined
        ? ' AND s2.class_id IN (:effClassIds)'
        : classId
          ? ' AND s2.class_id = :classId'
          : '';

    const [
      avgRows,
      bySubjectRows,
      byClassRows,
      topRows,
      aboveBelowRows,
    ] = await Promise.all([
      sequelize.query(`SELECT AVG(score)::float AS avg FROM grades g ${classJoin} WHERE ${where}`, {
        replacements,
        type: QueryTypes.SELECT,
      }) as unknown as Promise<Array<{ avg: number | null }>>,
      sequelize.query(
        `SELECT s.id AS "subjectId", s.name AS name, AVG(g.score)::float AS avg, COUNT(*)::int AS count
         FROM grades g JOIN subjects s ON s.id = g.subject_id ${classJoin}
         WHERE ${where} GROUP BY s.id, s.name ORDER BY avg DESC`,
        { replacements, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ subjectId: string; name: string; avg: number; count: number }>>,
      sequelize.query(
        `SELECT c.id AS "classId", c.name AS name, AVG(g.score)::float AS avg, COUNT(*)::int AS count,
                AVG(CASE WHEN g.score >= :passMark THEN 1.0 ELSE 0.0 END)::float * 100 AS "passRate"
         FROM grades g JOIN students s2 ON s2.id = g.student_id JOIN classes c ON c.id = s2.class_id
         WHERE ${where}${classId ? ' AND s2.class_id = :classId' : ''}${effClassIds ? ' AND s2.class_id IN (:effClassIds)' : ''}
         GROUP BY c.id, c.name ORDER BY avg DESC`,
        { replacements: { ...replacements, passMark }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ classId: string; name: string; avg: number; count: number; passRate: number }>>,
      sequelize.query(
        `SELECT s2.id AS "studentId", s2.first_name AS "firstName", s2.last_name AS "lastName", c.name AS "className", AVG(g.score)::float AS avg
         FROM grades g JOIN students s2 ON s2.id = g.student_id LEFT JOIN classes c ON c.id = s2.class_id
         WHERE ${where}${s2ClassCond} GROUP BY s2.id, s2.first_name, s2.last_name, c.name ORDER BY avg DESC LIMIT 10`,
        { replacements, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ studentId: string; firstName: string; lastName: string; className: string | null; avg: number }>>,
      sequelize.query(
        `SELECT COUNT(*) FILTER (WHERE a.avg >= :passMark)::int AS "above10", COUNT(*) FILTER (WHERE a.avg < :passMark)::int AS "below10"
         FROM (SELECT AVG(g.score) AS avg FROM grades g ${classJoin} WHERE ${where} GROUP BY g.student_id) a`,
        { replacements: { ...replacements, passMark }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ above10: number; below10: number }>>,
    ]);

    const avgGrade = avgRows[0]?.avg !== null && avgRows[0]?.avg !== undefined ? round2(avgRows[0].avg) : 0;
    const avgBySubject = bySubjectRows.map((r) => ({ subjectId: r.subjectId, name: r.name, avg: round2(r.avg), count: Number(r.count) }));
    const weakSubjects = avgBySubject.filter((s) => s.avg < passMark);
    const ab = aboveBelowRows[0] || { above10: 0, below10: 0 };

    return res.json({
      success: true,
      data: {
        avgGrade,
        avgBySubject,
        avgByClass: byClassRows.map((r) => ({
          classId: r.classId,
          name: r.name,
          avg: round2(r.avg),
          count: Number(r.count),
          passRate: round2(r.passRate),
        })),
        topStudents: topRows.map((r) => ({
          studentId: r.studentId,
          name: `${r.lastName} ${r.firstName}`,
          className: r.className,
          avg: round2(r.avg),
        })),
        aboveBelow: { above10: Number(ab.above10) || 0, below10: Number(ab.below10) || 0 },
        weakSubjects,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 6. /finance ----------

router.get('/finance', requirePermission('fees', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const academicYear = req.query.academicYear ? String(req.query.academicYear) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const hasFrom = from !== null && !isNaN(from.getTime());
    const hasTo = to !== null && !isNaN(to.getTime());

    const feeConds: string[] = ['school_id = :schoolId'];
    const feeReps: Record<string, unknown> = { schoolId };
    if (academicYear) {
      feeConds.push('academic_year = :academicYear');
      feeReps.academicYear = academicYear;
    }
    const feeWhere = feeConds.join(' AND ');

    const payConds: string[] = ['school_id = :schoolId'];
    const payReps: Record<string, unknown> = { schoolId };
    if (hasFrom) {
      payConds.push('date >= :from');
      payReps.from = from;
    }
    if (hasTo) {
      payConds.push('date <= :to');
      payReps.to = to;
    }
    const payWhere = payConds.join(' AND ');

    const [feeAgg, payAgg, overdueAgg, byTypeRows, revenueRows] = await Promise.all([
      sequelize.query(`SELECT COALESCE(SUM(total_amount),0) AS expected FROM fees WHERE ${feeWhere}`, {
        replacements: feeReps,
        type: QueryTypes.SELECT,
      }) as unknown as Promise<Array<{ expected: string }>>,
      sequelize.query(`SELECT COALESCE(SUM(amount),0) AS collected FROM payments WHERE ${payWhere}`, {
        replacements: payReps,
        type: QueryTypes.SELECT,
      }) as unknown as Promise<Array<{ collected: string }>>,
      sequelize.query(
        `SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount,0)),0) AS total FROM fees WHERE ${feeWhere} AND status = 'overdue'`,
        { replacements: feeReps, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ total: string }>>,
      sequelize.query(
        `SELECT f.type AS type, COALESCE(SUM(f.total_amount),0) AS expected, COALESCE(SUM(p.amount),0) AS collected
         FROM fees f LEFT JOIN payments p ON p.fee_id = f.id AND p.school_id = :schoolId
         WHERE f.school_id = :schoolId${academicYear ? ' AND f.academic_year = :academicYear' : ''}
         GROUP BY f.type ORDER BY expected DESC`,
        { replacements: feeReps, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ type: string; expected: string; collected: string }>>,
      sequelize.query(
        `SELECT TO_CHAR(date, 'YYYY-MM') AS month, COALESCE(SUM(amount),0) AS revenue FROM payments
         WHERE ${payWhere}${!hasFrom && !hasTo ? ' AND date >= :yearAgo' : ''} GROUP BY 1 ORDER BY 1`,
        {
          replacements: {
            ...payReps,
            yearAgo: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1),
          },
          type: QueryTypes.SELECT,
        }
      ) as unknown as Promise<Array<{ month: string; revenue: string }>>,
    ]);

    const expected = num(feeAgg[0]?.expected);
    const collected = num(payAgg[0]?.collected);
    const outstanding = expected - collected;
    const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

    const labels = monthLabels(12);
    const revMap = new Map(revenueRows.map((r) => [r.month, num(r.revenue)]));
    const revenueByMonth =
      hasFrom || hasTo
        ? revenueRows.map((r) => ({ month: r.month, revenue: num(r.revenue) }))
        : labels.map((l) => ({ month: l.key, label: l.label, revenue: revMap.get(l.key) || 0 }));

    return res.json({
      success: true,
      data: {
        expected,
        collected,
        outstanding,
        overdue: num(overdueAgg[0]?.total),
        rate,
        revenueByMonth,
        byFeeType: byTypeRows.map((r) => ({
          type: r.type,
          expected: num(r.expected),
          collected: num(r.collected),
          outstanding: num(r.expected) - num(r.collected),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 7. /payments ----------

router.get('/payments', requirePermission('payments', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const statusFilter = req.query.status ? String(req.query.status) : undefined;

    const recentPromise = Payment.findAll({
      where: { schoolId },
      include: [
        { model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'], include: [{ model: Class, as: 'class', attributes: ['id', 'name'] }] },
        { model: Fee, as: 'fee', attributes: ['id', 'type'] },
      ],
      order: [['date', 'DESC']],
      limit: 10,
    });

    const unpaidWhere: Record<string, unknown> = { schoolId, status: { [Op.in]: ['pending', 'partial', 'overdue'] } };
    if (statusFilter && statusFilter !== 'unpaid' && ['pending', 'partial', 'overdue', 'paid'].includes(statusFilter)) {
      unpaidWhere.status = statusFilter;
    }
    const unpaidPromise = Fee.findAll({
      where: unpaidWhere,
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'], include: [{ model: Class, as: 'class', attributes: ['id', 'name'] }] }],
      order: [['dueDate', 'ASC']],
      limit: 20,
    });

    const [recent, unpaid] = await Promise.all([recentPromise, unpaidPromise]);

    const recentMapped = recent.map((p) => {
      const s = (p as unknown as Record<string, unknown>).student as { firstName: string; lastName: string; studentId: string; class?: { name: string } } | null;
      const f = (p as unknown as Record<string, unknown>).fee as { type: string } | null;
      return {
        id: p.id,
        amount: num(p.amount),
        method: p.method,
        reference: p.reference,
        date: p.date,
        studentName: s ? `${s.lastName} ${s.firstName}` : null,
        studentRef: s?.studentId || null,
        className: s?.class?.name || null,
        feeType: f?.type || null,
      };
    });

    const unpaidMapped = unpaid.map((f) => {
      const s = (f as unknown as Record<string, unknown>).student as { id: string; firstName: string; lastName: string; studentId: string; class?: { name: string } } | null;
      const total = num(f.totalAmount);
      const paid = num(f.paidAmount);
      return {
        id: f.id,
        studentId: s?.id || f.studentId,
        studentName: s ? `${s.lastName} ${s.firstName}` : null,
        studentRef: s?.studentId || null,
        className: s?.class?.name || null,
        type: f.type,
        total,
        paid,
        balance: total - paid,
        dueDate: f.dueDate,
        status: f.status,
      };
    });

    if (statusFilter === 'unpaid') {
      return res.json({ success: true, data: { unpaid: unpaidMapped } });
    }
    return res.json({ success: true, data: { recent: recentMapped, unpaid: unpaidMapped } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 8. /documents ----------

router.get('/documents', requirePermission('documents', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;

    const [reportCards, vacationTickets, generated, docsByType, recentDocs, recentGen] = await Promise.all([
      ReportCard.count({ where: { schoolId } }),
      VacationTicket.count({ where: { schoolId } }),
      GeneratedDocument.count({ where: { schoolId } }),
      Document.findAll({
        attributes: ['type', [fn('COUNT', col('Document.id')), 'count']],
        where: { schoolId },
        group: ['type'],
        raw: true,
      }) as unknown as Promise<Array<{ type: string; count: string }>>,
      Document.findAll({ where: { schoolId }, order: [['createdAt', 'DESC']], limit: 8, raw: true }),
      GeneratedDocument.findAll({ where: { schoolId }, order: [['createdAt', 'DESC']], limit: 8, raw: true }),
    ]);

    const byType: Record<string, number> = { reportCards, vacationTickets, generatedDocuments: generated };
    for (const r of docsByType) {
      byType[`documents_${r.type}`] = Number(r.count);
    }

    const merged = [
      ...recentDocs.map((d) => ({ id: d.id, title: d.name, type: d.type, date: d.createdAt, source: 'document' })),
      ...recentGen.map((g) => ({ id: g.id, title: g.title || g.documentType, type: g.documentType, date: g.createdAt, source: 'generated' })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    return res.json({ success: true, data: { byType, recent: merged } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 9. /timetable ----------

router.get('/timetable', requirePermission('timetable', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const user = req.user!;
    const now = new Date();
    const todayDow = dow1to7(now);
    const dowRaw = req.query.dayOfWeek ? parseInt(String(req.query.dayOfWeek), 10) : todayDow;
    const dayOfWeek = dowRaw >= 1 && dowRaw <= 7 ? dowRaw : todayDow;
    const classId = req.query.classId ? String(req.query.classId) : undefined;

    const tIds = await teacherClassIds(schoolId, user);
    const where: Record<string, unknown> = { schoolId, dayOfWeek };
    if (classId) where.classId = classId;
    if (tIds !== null) {
      if (tIds.length === 0 && !classId) {
        return res.json({ success: true, data: { dayOfWeek, entries: [], currentClass: null } });
      }
      if (classId && !tIds.includes(classId)) {
        return res.json({ success: true, data: { dayOfWeek, entries: [], currentClass: null } });
      }
      if (!classId) where.teacherId = user.id;
    }

    const rows = await Timetable.findAll({
      where,
      include: [
        { model: Class, as: 'class', attributes: ['id', 'name', 'level'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
        { model: User, as: 'teacher', attributes: ['id', 'name'] },
      ],
      order: [['startTime', 'ASC']],
    });

    const entries = rows.map((t) => {
      const c = (t as unknown as Record<string, unknown>).class as { id: string; name: string; level: string } | null;
      const s = (t as unknown as Record<string, unknown>).subject as { id: string; name: string } | null;
      const u = (t as unknown as Record<string, unknown>).teacher as { id: string; name: string } | null;
      return {
        id: t.id,
        classId: t.classId,
        className: c?.name || null,
        level: c?.level || null,
        subjectId: t.subjectId,
        subjectName: s?.name || null,
        teacherId: t.teacherId,
        teacherName: u?.name || null,
        room: t.room,
        dayOfWeek: t.dayOfWeek,
        startTime: t.startTime,
        endTime: t.endTime,
      };
    });

    let currentClass: (typeof entries)[number] | null = null;
    if (dayOfWeek === todayDow) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const cur = `${hh}:${mm}`;
      currentClass = entries.find((e) => e.startTime <= cur && cur < e.endTime) || null;
    }

    return res.json({ success: true, data: { dayOfWeek, entries, currentClass } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 10. /notifications ----------

router.get('/notifications', requirePermission('notifications', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const userId = req.user!.id;

    const [recent, unreadCount] = await Promise.all([
      Notification.findAll({ where: { schoolId, userId }, order: [['createdAt', 'DESC']], limit: 8 }),
      Notification.count({ where: { schoolId, userId, isRead: false } }),
    ]);

    return res.json({
      success: true,
      data: {
        recent: recent.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, isRead: n.isRead, createdAt: n.createdAt })),
        unreadCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 11. /activity ----------

router.get('/activity', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { createdAt: 'createdAt', action: 'action', entity: 'entity' }, 'createdAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: logs } = await AuditLog.findAndCountAll({
      where: { schoolId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: {
        activity: logs.map((l) => {
          const u = (l as unknown as Record<string, unknown>).user as { name: string; email: string } | null;
          return {
            id: l.id,
            userName: u?.name || null,
            userEmail: u?.email || null,
            action: l.action,
            entity: l.entity,
            entityId: l.entityId,
            ipAddress: l.ipAddress,
            userAgent: l.userAgent,
            createdAt: l.createdAt,
          };
        }),
        total: count,
        page,
        pages: pages(count, limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 12. /alerts ----------

router.get('/alerts', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const academicYear = req.query.academicYear ? String(req.query.academicYear) : '2025-2026';
    const termRaw = req.query.term ? parseInt(String(req.query.term), 10) : undefined;
    const term = termRaw !== undefined && [1, 2, 3].includes(termRaw) ? termRaw : undefined;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [overdueRows, absenceRows, noTeacher, noParent, noPhoto, missingGrades] = await Promise.all([
      sequelize.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount - COALESCE(paid_amount,0)),0) AS amount
         FROM fees WHERE school_id = :schoolId AND status = 'overdue'`,
        { replacements: { schoolId }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ count: number; amount: string }>>,
      sequelize.query(
        `SELECT s.id AS "studentId", s.first_name || ' ' || s.last_name AS name, c.name AS "className", COUNT(*)::int AS count
         FROM attendance a JOIN students s ON s.id = a.student_id LEFT JOIN classes c ON c.id = s.class_id
         WHERE a.school_id = :schoolId AND a.status = 'absent' AND a.date >= :since
         GROUP BY s.id, s.first_name, s.last_name, c.name HAVING COUNT(*) >= 3 ORDER BY count DESC LIMIT 20`,
        { replacements: { schoolId, since }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ studentId: string; name: string; className: string | null; count: number }>>,
      Class.findAll({ where: { schoolId, teacherId: null }, attributes: ['id', 'name'], raw: true }),
      Student.count({ where: { schoolId, parentId: null } }),
      Student.count({ where: { schoolId, [Op.or]: [{ photo: null }, { photo: '' }] } }),
      sequelize.query(
        `SELECT c.id AS "classId", c.name AS name FROM classes c
         WHERE c.school_id = :schoolId
         AND NOT EXISTS (
           SELECT 1 FROM grades g JOIN students s ON s.id = g.student_id
           WHERE s.class_id = c.id AND g.school_id = :schoolId AND g.academic_year = :academicYear${term !== undefined ? ' AND g.term = :term' : ''}
         )`,
        { replacements: { schoolId, academicYear, ...(term !== undefined ? { term } : {}) }, type: QueryTypes.SELECT }
      ) as unknown as Promise<Array<{ classId: string; name: string }>>,
    ]);

    const overdue = overdueRows[0] || { count: 0, amount: '0' };

    return res.json({
      success: true,
      data: {
        overdue: { count: Number(overdue.count) || 0, amount: num(overdue.amount), link: '/finance?status=overdue' },
        absences3plus: {
          count: absenceRows.length,
          items: absenceRows.map((r) => ({ studentId: r.studentId, name: r.name, className: r.className, count: Number(r.count) })),
          link: '/attendance?filter=absent',
        },
        classesWithoutTeacher: { count: noTeacher.length, items: noTeacher, link: '/classes?filter=no-teacher' },
        studentsWithoutParent: { count: noParent, link: '/students?filter=no-parent' },
        studentsWithoutPhoto: { count: noPhoto, link: '/students?filter=no-photo' },
        gradesMissing: { count: missingGrades.length, items: missingGrades, link: '/grades?filter=missing' },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ---------- 13. /system-health ----------

router.get('/system-health', requirePermission('settings', 'view'), async (_req: Request, res: Response) => {
  const components: Record<string, Record<string, unknown>> = {};

  // DB check with real timing
  try {
    const t0 = Date.now();
    await sequelize.query('SELECT 1', { type: QueryTypes.SELECT });
    const latencyMs = Date.now() - t0;
    components.database = { status: latencyMs < 1000 ? 'operational' : 'degraded', latencyMs };
  } catch (error) {
    components.database = { status: 'unavailable', error: (error as Error).message };
  }

  // Storage check: real writability probe on uploads dir
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  try {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    await fs.promises.access(uploadsDir, fs.constants.W_OK);
    components.storage = { status: 'operational', writable: true, path: uploadsDir };
  } catch (error) {
    components.storage = { status: 'unavailable', writable: false, path: uploadsDir, error: (error as Error).message };
  }

  components.server = { status: 'operational', uptimeSeconds: Math.round(process.uptime()) };

  let version = '1.0.0';
  try {
    const pkgRaw = await fs.promises.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    if (pkg.version) version = pkg.version;
  } catch {
    // keep default
  }

  const statuses = Object.values(components).map((c) => String(c.status));
  const overall = statuses.includes('unavailable') ? 'degraded' : statuses.includes('degraded') ? 'degraded' : 'operational';

  return res.json({ success: true, data: { status: overall, version, components, checkedAt: new Date().toISOString() } });
});

// ---------- 14. /report (real PDF via pdfkit) ----------

router.get('/report', requirePermission('settings', 'view'), async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.schoolId!;
    const type = String(req.query.type || 'global');
    if (!['global', 'academic', 'finance', 'attendance'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type. Use global|academic|finance|attendance' });
    }
    const academicYear = req.query.academicYear ? String(req.query.academicYear) : undefined;
    const termRaw = req.query.term ? parseInt(String(req.query.term), 10) : undefined;
    const term = termRaw !== undefined && [1, 2, 3].includes(termRaw) ? termRaw : undefined;
    const classId = req.query.classId ? String(req.query.classId) : undefined;

    const school = await School.findByPk(schoolId);
    const schoolName = school?.name || 'School';

    const gradeWhere: Record<string, unknown> = { schoolId, [Op.or]: [{ status: 'PUBLISHED' }, { status: null }] };
    if (academicYear) gradeWhere.academicYear = academicYear;
    if (term !== undefined) gradeWhere.term = term;

    const now = new Date();
    const { start: todayStart, end: todayEnd } = dayBounds(now);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Gather compact aggregates per report type
    const [totalStudents, totalTeachers, classCount, avgRow, expectedSum, collectedSum, attRows] = await Promise.all([
      Student.count({ where: { schoolId, status: 'active' } }),
      User.count({ where: { schoolId, role: 'teacher', isActive: true } }),
      Class.count({ where: { schoolId } }),
      Grade.findOne({ attributes: [[fn('AVG', col('score')), 'avgScore']], where: gradeWhere, raw: true }) as Promise<{ avgScore: string } | null>,
      Fee.sum('totalAmount', { where: academicYear ? { schoolId, academicYear } : { schoolId } }),
      Payment.sum('amount', { where: { schoolId } }),
      Attendance.findAll({
        attributes: ['status', [fn('COUNT', col('Attendance.id')), 'count']],
        where: { schoolId, date: { [Op.gte]: todayStart, [Op.lt]: todayEnd }, ...(classId ? { classId } : {}) },
        group: ['status'],
        raw: true,
      }) as unknown as Promise<Array<{ status: string; count: string }>>,
    ]);

    const bySubjectRows =
      type === 'global' || type === 'academic'
        ? ((await sequelize.query(
            `SELECT s.name AS name, AVG(g.score)::float AS avg, COUNT(*)::int AS count
             FROM grades g JOIN subjects s ON s.id = g.subject_id
             WHERE g.school_id = :schoolId AND (g.status = 'PUBLISHED' OR g.status IS NULL)${academicYear ? ' AND g.academic_year = :academicYear' : ''}${term !== undefined ? ' AND g.term = :term' : ''}
             GROUP BY s.name ORDER BY avg DESC LIMIT 15`,
            { replacements: { schoolId, ...(academicYear ? { academicYear } : {}), ...(term !== undefined ? { term } : {}) }, type: QueryTypes.SELECT }
          )) as unknown as Array<{ name: string; avg: number; count: number }>)
        : [];

    const byFeeTypeRows =
      type === 'global' || type === 'finance'
        ? ((await sequelize.query(
            `SELECT f.type AS type, COALESCE(SUM(f.total_amount),0) AS expected, COUNT(*)::int AS count
             FROM fees f WHERE f.school_id = :schoolId${academicYear ? ' AND f.academic_year = :academicYear' : ''}
             GROUP BY f.type ORDER BY expected DESC`,
            { replacements: { schoolId, ...(academicYear ? { academicYear } : {}) }, type: QueryTypes.SELECT }
          )) as unknown as Array<{ type: string; expected: string; count: number }>)
        : [];

    const expected = num(expectedSum);
    const collected = num(collectedSum);
    const monthCollected = num(await Payment.sum('amount', { where: { schoolId, date: { [Op.gte]: startOfMonth } } }));

    const finalBuf: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const contentWidth = doc.page.width - 100;
      const section = (title: string) => {
        doc.moveDown(0.8).fontSize(12).font('Helvetica-Bold').text(title, { width: contentWidth });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(50 + contentWidth, doc.y).stroke();
        doc.moveDown(0.5);
      };
      const kv = (label: string, value: string) => {
        doc.fontSize(10).font('Helvetica-Bold').text(label, 50, doc.y, { continued: true });
        doc.font('Helvetica').text(` ${value}`);
      };
      const tableRow = (cells: string[], widths: number[], bold = false) => {
        const y = doc.y;
        let x = 50;
        doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        cells.forEach((c, i) => {
          doc.text(c, x + 2, y, { width: widths[i] - 4 });
          x += widths[i];
        });
        doc.rect(50, y - 2, contentWidth, 14).stroke();
        doc.y = y + 14;
        if (doc.y > doc.page.height - 80) doc.addPage();
      };

      doc.fontSize(18).font('Helvetica-Bold').text(schoolName, 50, 50, { width: contentWidth });
      doc.fontSize(13).font('Helvetica-Bold').text(`Dashboard Report — ${type}`, { width: contentWidth });
      doc.fontSize(10).font('Helvetica').text(`Generated: ${now.toLocaleString()}${academicYear ? ` | Year: ${academicYear}` : ''}${term !== undefined ? ` | Term: ${term}` : ''}`);
      doc.moveDown(0.5);

      section('Key Indicators');
      kv('Active students:', String(totalStudents));
      kv('Active teachers:', String(totalTeachers));
      kv('Classes:', String(classCount));
      kv('Average grade:', avgRow?.avgScore != null ? round2(avgRow.avgScore).toFixed(2) : '-');
      if (type === 'global' || type === 'finance') {
        kv('Expected fees:', expected.toFixed(2));
        kv('Collected (all time):', collected.toFixed(2));
        kv('Collected (this month):', monthCollected.toFixed(2));
        kv('Outstanding:', (expected - collected).toFixed(2));
      }
      if (type === 'global' || type === 'attendance') {
        const parts = attRows.map((r) => `${r.status}: ${r.count}`).join(' | ') || 'no records today';
        kv("Today's attendance:", parts);
      }

      if ((type === 'global' || type === 'academic') && bySubjectRows.length > 0) {
        section('Average by Subject');
        const w = [contentWidth - 160, 80, 80];
        tableRow(['Subject', 'Avg', 'Grades'], w, true);
        for (const r of bySubjectRows) tableRow([r.name, round2(r.avg).toFixed(2), String(r.count)], w);
      }

      if ((type === 'global' || type === 'finance') && byFeeTypeRows.length > 0) {
        section('Fees by Type');
        const w = [contentWidth - 240, 120, 120];
        tableRow(['Fee type', 'Expected', 'Count'], w, true);
        for (const r of byFeeTypeRows) tableRow([r.type, num(r.expected).toFixed(2), String(r.count)], w);
      }

      doc.fontSize(8).font('Helvetica').text('Generated by SchoolFlow dashboard.', 50, doc.page.height - 40, { width: contentWidth, align: 'center' });
      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${type}-${toISODate(now)}.pdf"`);
    return res.send(finalBuf);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
