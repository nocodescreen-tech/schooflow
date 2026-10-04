import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { runConsistencyCheck, type ConsistencyReport } from '../services/ConsistencyChecker.js';
import { Student, Class, User, Payment, ReportCard, GeneratedDocument } from '../models/index.js';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { QueryTypes } from 'sequelize';

const router = Router();

// All diagnostics routes require authentication and super_admin or admin role
router.use(authenticateToken);
router.use(requireRole('super_admin', 'admin'));

/**
 * GET /api/v1/diagnostics/consistency
 *
 * Runs the full data consistency checker and returns a detailed report.
 * Optionally scoped to a specific school via ?schoolId= (super_admin only).
 */
router.get('/consistency', async (req: Request, res: Response) => {
  try {
    let schoolId: string | null = null;

    if (req.user!.role === 'super_admin') {
      if (req.query.schoolId) {
        schoolId = String(req.query.schoolId);
      }
    } else {
      schoolId = req.user!.schoolId!;
    }

    const report: ConsistencyReport = await runConsistencyCheck(schoolId);

    return res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Consistency check failed',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/v1/diagnostics/status
 *
 * Quick status overview — returns counts of issues without full details.
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const schoolId = req.user!.role === 'super_admin' ? null : req.user!.schoolId!;
    const schoolFilter = schoolId ? { schoolId } : {};

    const [
      studentsWithoutClass,
      classesWithoutYear,
      invalidRoles,
      docsWithoutVersion,
      paymentsWithoutReceipt,
      reportCardsWithoutStudent,
    ] = await Promise.all([
      Student.count({
        where: {
          ...schoolFilter,
          [Op.or]: [{ classId: null }, { classId: '' }],
        },
      }),
      Class.count({
        where: {
          ...schoolFilter,
          [Op.or]: [{ academicYear: null }, { academicYear: '' }],
        },
      }),
      User.count({
        where: {
          ...schoolFilter,
          role: { [Op.notIn]: ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'parent', 'student', 'receptionist'] },
        },
      }),
      GeneratedDocument.count({
        where: {
          ...schoolFilter,
          templateId: { [Op.not]: null },
          templateVersion: null,
        },
      }),
      Payment.count({
        where: {
          ...schoolFilter,
          status: 'completed',
          [Op.or]: [{ reference: null }, { reference: '' }],
        },
      }),
      ReportCard.count({
        where: {
          ...schoolFilter,
          studentId: null,
        },
      }),
    ]);

    // Teachers without assignments requires a raw query
    const teacherRows = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM users u
       WHERE u.role = 'teacher'${schoolId ? ' AND u.school_id = :schoolId' : ''}
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.user_id = u.id)`,
      {
        replacements: schoolId ? { schoolId } : {},
        type: QueryTypes.SELECT,
      },
    );
    const teacherCount = Array.isArray(teacherRows) && teacherRows.length > 0
      ? Number((teacherRows[0] as { count: unknown }).count) || 0
      : 0;

    // Orphan users requires a raw query
    const orphanRows = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM users u
       WHERE 1=1${schoolId ? ' AND u.school_id = :schoolId' : ''}
       AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id)`,
      {
        replacements: schoolId ? { schoolId } : {},
        type: QueryTypes.SELECT,
      },
    );
    const orphanCount = Array.isArray(orphanRows) && orphanRows.length > 0
      ? Number((orphanRows[0] as { count: unknown }).count) || 0
      : 0;

    const issues = {
      studentsWithoutClass,
      classesWithoutAcademicYear: classesWithoutYear,
      teachersWithoutAssignments: teacherCount,
      orphanUsers: orphanCount,
      invalidRoles,
      documentsWithoutTemplateVersion: docsWithoutVersion,
      paymentsWithoutReceipt,
      reportCardsWithoutStudent,
    };

    const totalIssues = Object.values(issues).reduce((sum: number, v: number) => sum + v, 0);
    const hasErrors =
      invalidRoles > 0 ||
      reportCardsWithoutStudent > 0 ||
      studentsWithoutClass > 5 ||
      paymentsWithoutReceipt > 5;

    const status: 'OK' | 'WARNING' | 'ERROR' = hasErrors ? 'ERROR' : totalIssues > 0 ? 'WARNING' : 'OK';

    return res.json({
      success: true,
      data: {
        status,
        totalIssues,
        issues,
        schoolId,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Status check failed',
      message: (error as Error).message,
    });
  }
});

export default router;
