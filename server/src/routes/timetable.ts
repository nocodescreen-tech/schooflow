import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { Timetable, Class, Subject, User, Student, StudentParent, Parent } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';
import { resolveScopeForUser } from '../services/ScopeService.js';

const router = Router();
router.use(authenticateToken);

const ALL_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist', 'parent', 'student'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director'] as const;

/** Empty 7-day week skeleton shared by the scope-resolved route. */
function emptyWeek(): Record<number, unknown[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

/** Group timetable entries by day of week (1=Mon … 7=Sun). */
function groupByDay(entries: Timetable[]): Record<number, Timetable[]> {
  const week = emptyWeek() as Record<number, Timetable[]>;
  for (const entry of entries) {
    week[entry.dayOfWeek].push(entry);
  }
  return week;
}

/** Class ids of every student explicitly linked to this parent user. */
async function classesOfChildren(userId: string, schoolId: string): Promise<string[]> {
  const classIds: string[] = [];
  const legacyChildren = await Student.findAll({ where: { parentId: userId, schoolId }, attributes: ['classId'] });
  for (const s of legacyChildren) if (s.classId) classIds.push(s.classId);
  const parentRecords = await Parent.findAll({ where: { userId, schoolId }, attributes: ['id'] });
  if (parentRecords.length > 0) {
    const links = await StudentParent.findAll({
      where: { parentId: { [Op.in]: parentRecords.map((p) => p.id) } },
      include: [{ model: Student, as: 'student', attributes: ['classId'] }],
    });
    for (const l of links) {
      const cls = (l as unknown as { student?: { classId?: string | null } }).student?.classId;
      if (cls) classIds.push(cls);
    }
  }
  return [...new Set(classIds)];
}

/**
 * Check for scheduling conflicts.
 * Returns an array of conflict descriptions.
 */
async function checkConflicts(
  schoolId: string,
  classId: string,
  teacherId: string,
  room: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  academicYear: string,
  excludeId?: string
): Promise<string[]> {
  const conflicts: string[] = [];

  const where: any = {
    schoolId,
    dayOfWeek,
    academicYear,
    [Op.or]: [
      { startTime: { [Op.lt]: endTime }, endTime: { [Op.gt]: startTime } },
    ],
  };

  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }

  const overlapping = await Timetable.findAll({ where });

  for (const entry of overlapping) {
    if (entry.teacherId === teacherId) {
      conflicts.push(`Teacher is already booked ${entry.startTime}-${entry.endTime}`);
    }
    if (entry.classId === classId) {
      conflicts.push(`Class is already booked ${entry.startTime}-${entry.endTime}`);
    }
    if (room && entry.room === room) {
      conflicts.push(`Room "${room}" is already booked ${entry.startTime}-${entry.endTime}`);
    }
  }

  return conflicts;
}

// GET / — list with filters
router.get('/',
  requireRole(...ALL_READ),
  requirePermission('timetable', 'view'),
  query('dayOfWeek').optional().isInt({ min: 1, max: 7 }),
  async (req: Request, res: Response) => {
    try {
      const { classId, teacherId, dayOfWeek, academicYear } = req.query;
      const where: any = { schoolId: req.user!.schoolId! };

      if (classId) where.classId = classId;
      if (teacherId) where.teacherId = teacherId;
      if (dayOfWeek) where.dayOfWeek = parseInt(dayOfWeek as string, 10);
      if (academicYear) where.academicYear = academicYear;

      const { page, limit, offset } = getPagination(req.query);
      const sort = getSort(req.query, { dayOfWeek: 'dayOfWeek', startTime: 'startTime', createdAt: 'createdAt' }, 'dayOfWeek', 'ASC');
      if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

      const { count, rows: timetables } = await Timetable.findAndCountAll({
        where,
        include: [
          { model: Class, as: 'class', attributes: ['id', 'name'] },
          { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'] },
          { model: User, as: 'teacher', attributes: ['id', 'name', 'email'] },
        ],
        order: [[sort.column, sort.order]],
        limit,
        offset,
      });

      return res.json({ success: true, data: { items: timetables, total: count, page, pages: pages(count, limit) } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST / — create with conflict detection
router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('timetable', 'create'),
  body('classId').isUUID().withMessage('Valid class ID is required'),
  body('subjectId').isUUID().withMessage('Valid subject ID is required'),
  body('teacherId').isUUID().withMessage('Valid teacher ID is required'),
  body('dayOfWeek').isInt({ min: 1, max: 7 }).withMessage('Day of week must be 1-7'),
  body('startTime').custom((value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)).withMessage('Start time must be HH:MM format'),
  body('endTime').custom((value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)).withMessage('End time must be HH:MM format'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { classId, subjectId, teacherId, room, dayOfWeek, startTime, endTime, academicYear } = req.body;

      if (startTime >= endTime) {
        return res.status(400).json({ success: false, error: 'Start time must be before end time' });
      }

      const year = academicYear || '2025-2026';
      const schoolId = req.user!.schoolId!;

      const conflicts = await checkConflicts(schoolId, classId, teacherId, room, dayOfWeek, startTime, endTime, year);
      if (conflicts.length > 0) {
        return res.status(409).json({ success: false, error: 'Scheduling conflict detected', data: { conflicts } });
      }

      const entry = await Timetable.create({
        schoolId,
        classId,
        subjectId,
        teacherId,
        room,
        dayOfWeek,
        startTime,
        endTime,
        academicYear: year,
      });

      await logAudit(req, { action: 'create', entity: 'timetable', entityId: entry.id, details: { classId, dayOfWeek, startTime, endTime } });

      return res.status(201).json({ success: true, data: { entry } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// PATCH /:id — update with conflict detection
router.patch('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('timetable', 'update'),
  async (req: Request, res: Response) => {
  try {
    const entry = await Timetable.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!entry) return res.status(404).json({ success: false, error: 'Timetable entry not found' });

    const allowed = ['classId', 'subjectId', 'teacherId', 'room', 'dayOfWeek', 'startTime', 'endTime', 'academicYear'];
    const updates: any = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Check conflicts if time-related fields changed
    const dayOfWeek = updates.dayOfWeek ?? entry.dayOfWeek;
    const startTime = updates.startTime ?? entry.startTime;
    const endTime = updates.endTime ?? entry.endTime;
    const classId = updates.classId ?? entry.classId;
    const teacherId = updates.teacherId ?? entry.teacherId;
    const room = updates.room ?? entry.room;
    const academicYear = updates.academicYear ?? entry.academicYear;

    if (startTime >= endTime) {
      return res.status(400).json({ success: false, error: 'Start time must be before end time' });
    }

    const conflicts = await checkConflicts(req.user!.schoolId!, classId, teacherId, room, dayOfWeek, startTime, endTime, academicYear, entry.id);
    if (conflicts.length > 0) {
      return res.status(409).json({ success: false, error: 'Scheduling conflict detected', data: { conflicts } });
    }

    await entry.update(updates);

    await logAudit(req, { action: 'update', entity: 'timetable', entityId: entry.id, details: updates });

    return res.json({ success: true, data: { entry } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// DELETE /:id — delete
router.delete('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('timetable', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const entry = await Timetable.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!entry) return res.status(404).json({ success: false, error: 'Timetable entry not found' });

    await entry.destroy();

    await logAudit(req, { action: 'delete', entity: 'timetable', entityId: entry.id });

    return res.json({ success: true, data: { message: 'Timetable entry deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /class/:classId/week — get weekly timetable for a class
router.get('/class/:classId/week',
  requireRole(...ALL_READ),
  requirePermission('timetable', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { academicYear } = req.query;

    const where: any = { schoolId: req.user!.schoolId!, classId };
    if (academicYear) where.academicYear = academicYear;

    const entries = await Timetable.findAll({
      where,
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'] },
        { model: User, as: 'teacher', attributes: ['id', 'name'] },
      ],
      order: [
        ['dayOfWeek', 'ASC'],
        ['startTime', 'ASC'],
      ],
    });

    // Group by day of week
    const week: Record<number, typeof entries> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    for (const entry of entries) {
      week[entry.dayOfWeek].push(entry);
    }

    return res.json({ success: true, data: { week } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /me/week — the caller's own weekly timetable, resolved server-side from
// the effective scope (§30): a scoped staff member gets their teaching week,
// a student gets their class week, a global role gets the school-wide week.
// The client never branches on `role` to pick a data source.
router.get('/me/week',
  requirePermission('timetable', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { academicYear } = req.query;
    const schoolId = req.user!.schoolId!;
    const scope = await resolveScopeForUser(req.user!);

    const where: any = { schoolId };
    if (academicYear) where.academicYear = academicYear;
    if (scope.isGlobal) {
      // Global roles: no restriction — the full school week.
    } else if (scope.kind === 'SELF' && scope.classIds.length === 1) {
      where.classId = scope.classIds[0];
    } else if (scope.classIds.length > 0) {
      where.teacherId = req.user!.id;
    } else if (scope.kind === 'LINKED_CHILDREN') {
      // Parents see their children's class weeks (first linked child's class set).
      where.classId = { [Op.in]: await classesOfChildren(req.user!.id, schoolId) };
      if (Array.isArray(where.classId[Op.in]) && where.classId[Op.in].length === 0) {
        return res.json({ success: true, data: { week: emptyWeek() } });
      }
    } else {
      return res.json({ success: true, data: { week: emptyWeek() } });
    }

    const entries = await Timetable.findAll({
      where,
      include: [
        { model: Class, as: 'class', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'] },
      ],
      order: [
        ['dayOfWeek', 'ASC'],
        ['startTime', 'ASC'],
      ],
    });

    return res.json({ success: true, data: { week: groupByDay(entries) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /teacher/:teacherId/week — get weekly timetable for a teacher
router.get('/teacher/:teacherId/week',
  requireRole(...ALL_READ),
  requirePermission('timetable', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const { academicYear } = req.query;

    const where: any = { schoolId: req.user!.schoolId!, teacherId };
    if (academicYear) where.academicYear = academicYear;

    const entries = await Timetable.findAll({
      where,
      include: [
        { model: Class, as: 'class', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'] },
      ],
      order: [
        ['dayOfWeek', 'ASC'],
        ['startTime', 'ASC'],
      ],
    });

    // Group by day of week
    const week: Record<number, typeof entries> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    for (const entry of entries) {
      week[entry.dayOfWeek].push(entry);
    }

    return res.json({ success: true, data: { week } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
