import { Op, QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Student,
  Class,
  User,
  Payment,
  ReportCard,
  Document,
  GeneratedDocument,
  Assignment,
  AcademicYear,
  UserRole,
  Role,
  Fee,
  School,
} from '../models/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'OK' | 'WARNING' | 'ERROR';

export interface CheckResult {
  /** Machine-readable check identifier. */
  name: string;
  status: CheckStatus;
  /** Number of offending rows (0 when OK). */
  count: number;
  /** Human-readable summary. */
  message: string;
  /** Up to 10 offending record IDs (UUIDs only — never PII). */
  details?: string[];
}

export interface ConsistencyReport {
  timestamp: string;
  /** School scope — null means all schools (super_admin). */
  schoolId: string | null;
  overall: CheckStatus;
  checks: CheckResult[];
  summary: {
    total: number;
    ok: number;
    warnings: number;
    errors: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ROLES = [
  'super_admin',
  'admin',
  'director',
  'teacher',
  'accountant',
  'parent',
  'student',
  'receptionist',
];

/** Maximum number of detail IDs to include per check (prevents huge payloads). */
const MAX_DETAILS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSchoolFilter(schoolId: string | null): { where: string; params: Record<string, string> } {
  if (!schoolId) return { where: '', params: {} };
  return { where: 'AND school_id = :schoolId', params: { schoolId } };
}

function toCount(row: unknown): number {
  if (!row || typeof row !== 'object') return 0;
  const val = (row as Record<string, unknown>).count;
  return typeof val === 'number' ? val : parseInt(String(val), 10) || 0;
}

function toIds(rows: unknown[]): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const obj = r as Record<string, unknown>;
      return (obj.id as string) || (obj.studentId as string) || (obj.userId as string) || null;
    })
    .filter((v): v is string => typeof v === 'string')
    .slice(0, MAX_DETAILS);
}

// ---------------------------------------------------------------------------
// Consistency Checker
// ---------------------------------------------------------------------------

export class ConsistencyChecker {
  private schoolId: string | null;

  constructor(schoolId?: string | null) {
    this.schoolId = schoolId ?? null;
  }

  /**
   * Run all consistency checks and return a compiled report.
   */
  async run(): Promise<ConsistencyReport> {
    const checks = await Promise.all([
      this.checkStudentsWithoutClass(),
      this.checkClassesWithoutAcademicYear(),
      this.checkTeachersWithoutAssignments(),
      this.checkOrphanUsers(),
      this.checkInvalidRoles(),
      this.checkDocumentsWithoutTemplateVersion(),
      this.checkPaymentsWithoutReceipt(),
      this.checkReportCardsWithoutStudent(),
      this.checkInvalidReferences(),
    ]);

    const ok = checks.filter((c) => c.status === 'OK').length;
    const warnings = checks.filter((c) => c.status === 'WARNING').length;
    const errors = checks.filter((c) => c.status === 'ERROR').length;

    const overall: CheckStatus = errors > 0 ? 'ERROR' : warnings > 0 ? 'WARNING' : 'OK';

    return {
      timestamp: new Date().toISOString(),
      schoolId: this.schoolId,
      overall,
      checks,
      summary: { total: checks.length, ok, warnings, errors },
    };
  }

  // -----------------------------------------------------------------------
  // 1. Students without class assignment
  // -----------------------------------------------------------------------
  private async checkStudentsWithoutClass(): Promise<CheckResult> {
    const count = await Student.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        [Op.or]: [{ classId: null }, { classId: '' }],
      },
    });

    if (count === 0) {
      return { name: 'students_without_class', status: 'OK', count: 0, message: 'All students have a class assignment' };
    }

    const rows = await Student.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        [Op.or]: [{ classId: null }, { classId: '' }],
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'students_without_class',
      status: count > 5 ? 'ERROR' : 'WARNING',
      count,
      message: `${count} student(s) without class assignment`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 2. Classes without academic year
  // -----------------------------------------------------------------------
  private async checkClassesWithoutAcademicYear(): Promise<CheckResult> {
    const count = await Class.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        [Op.or]: [{ academicYear: null }, { academicYear: '' }],
      },
    });

    if (count === 0) {
      return { name: 'classes_without_academic_year', status: 'OK', count: 0, message: 'All classes have an academic year' };
    }

    const rows = await Class.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        [Op.or]: [{ academicYear: null }, { academicYear: '' }],
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'classes_without_academic_year',
      status: count > 3 ? 'ERROR' : 'WARNING',
      count,
      message: `${count} class(es) without academic year`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 3. Teachers without assignments
  // -----------------------------------------------------------------------
  private async checkTeachersWithoutAssignments(): Promise<CheckResult> {
    const { where, params } = buildSchoolFilter(this.schoolId);

    const rows = await sequelize.query(
      `SELECT u.id FROM users u
       WHERE u.role = 'teacher'${where ? where.replace('AND school_id', 'AND u.school_id') : ''}
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.user_id = u.id)
       LIMIT ${MAX_DETAILS + 1}`,
      { replacements: params, type: QueryTypes.SELECT },
    );

    const countRow = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM users u
       WHERE u.role = 'teacher'${where ? where.replace('AND school_id', 'AND u.school_id') : ''}
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.user_id = u.id)`,
      { replacements: params, type: QueryTypes.SELECT },
    );

    const count = toCount(countRow[0]);

    if (count === 0) {
      return { name: 'teachers_without_assignments', status: 'OK', count: 0, message: 'All teachers have assignments' };
    }

    return {
      name: 'teachers_without_assignments',
      status: count > 5 ? 'WARNING' : 'OK',
      count,
      message: `${count} teacher(s) without assignments`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 4. Orphan users (no role, no profile)
  // -----------------------------------------------------------------------
  private async checkOrphanUsers(): Promise<CheckResult> {
    const { where, params } = buildSchoolFilter(this.schoolId);

    const countRow = await sequelize.query(
      `SELECT COUNT(*)::int as count FROM users u
       WHERE 1=1${where ? where.replace('AND school_id', 'AND u.school_id') : ''}
       AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id)`,
      { replacements: params, type: QueryTypes.SELECT },
    );

    const count = toCount(countRow[0]);

    if (count === 0) {
      return { name: 'orphan_users', status: 'OK', count: 0, message: 'No orphan users found' };
    }

    const rows = await sequelize.query(
      `SELECT u.id FROM users u
       WHERE 1=1${where ? where.replace('AND school_id', 'AND u.school_id') : ''}
       AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM parents p WHERE p.user_id = u.id)
       LIMIT ${MAX_DETAILS}`,
      { replacements: params, type: QueryTypes.SELECT },
    );

    return {
      name: 'orphan_users',
      status: count > 10 ? 'ERROR' : 'WARNING',
      count,
      message: `${count} orphan user(s) without role or profile`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 5. Invalid roles
  // -----------------------------------------------------------------------
  private async checkInvalidRoles(): Promise<CheckResult> {
    const count = await User.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        role: { [Op.notIn]: VALID_ROLES },
      },
    });

    if (count === 0) {
      return { name: 'invalid_roles', status: 'OK', count: 0, message: 'All user roles are valid' };
    }

    const rows = await User.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        role: { [Op.notIn]: VALID_ROLES },
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'invalid_roles',
      status: 'ERROR',
      count,
      message: `${count} user(s) with invalid role`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 6. Documents without template version
  // -----------------------------------------------------------------------
  private async checkDocumentsWithoutTemplateVersion(): Promise<CheckResult> {
    const count = await GeneratedDocument.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        templateId: { [Op.not]: null },
        templateVersion: null,
      },
    });

    if (count === 0) {
      return { name: 'documents_without_template_version', status: 'OK', count: 0, message: 'All generated documents have a template version' };
    }

    const rows = await GeneratedDocument.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        templateId: { [Op.not]: null },
        templateVersion: null,
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'documents_without_template_version',
      status: 'WARNING',
      count,
      message: `${count} generated document(s) without template version`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 7. Payments without receipt where required
  // -----------------------------------------------------------------------
  private async checkPaymentsWithoutReceipt(): Promise<CheckResult> {
    const count = await Payment.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        status: 'completed',
        [Op.or]: [{ reference: null }, { reference: '' }],
      },
    });

    if (count === 0) {
      return { name: 'payments_without_receipt', status: 'OK', count: 0, message: 'All completed payments have a receipt reference' };
    }

    const rows = await Payment.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        status: 'completed',
        [Op.or]: [{ reference: null }, { reference: '' }],
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'payments_without_receipt',
      status: count > 5 ? 'ERROR' : 'WARNING',
      count,
      message: `${count} completed payment(s) without receipt reference`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 8. Report cards without student
  // -----------------------------------------------------------------------
  private async checkReportCardsWithoutStudent(): Promise<CheckResult> {
    const count = await ReportCard.count({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        studentId: null,
      },
    });

    if (count === 0) {
      return { name: 'report_cards_without_student', status: 'OK', count: 0, message: 'All report cards have a student' };
    }

    const rows = await ReportCard.findAll({
      where: {
        ...(this.schoolId ? { schoolId: this.schoolId } : {}),
        studentId: null,
      },
      attributes: ['id'],
      limit: MAX_DETAILS,
      raw: true,
    });

    return {
      name: 'report_cards_without_student',
      status: 'ERROR',
      count,
      message: `${count} report card(s) without student`,
      details: toIds(rows),
    };
  }

  // -----------------------------------------------------------------------
  // 9. Invalid references (foreign key violations)
  // -----------------------------------------------------------------------
  private async checkInvalidReferences(): Promise<CheckResult> {
    const { where, params } = buildSchoolFilter(this.schoolId);
    const schoolClause = where;

    // Check multiple FK relationships in a single query for efficiency
    const rows = await sequelize.query(
      `SELECT 'student_class' AS ref, s.id::text AS id FROM students s
         WHERE s.class_id IS NOT NULL AND s.class_id != ''
         AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = s.class_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND s.school_id') : ''}
       UNION ALL
       SELECT 'payment_student', p.id::text FROM payments p
         WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = p.student_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND p.school_id') : ''}
       UNION ALL
       SELECT 'payment_fee', p.id::text FROM payments p
         WHERE p.fee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fees f WHERE f.id = p.fee_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND p.school_id') : ''}
       UNION ALL
       SELECT 'payment_receiver', p.id::text FROM payments p
         WHERE p.received_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.received_by_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND p.school_id') : ''}
       UNION ALL
       SELECT 'report_card_student', rc.id::text FROM report_cards rc
         WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = rc.student_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND rc.school_id') : ''}
       UNION ALL
       SELECT 'document_student', d.id::text FROM documents d
         WHERE d.student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = d.student_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND d.school_id') : ''}
       UNION ALL
       SELECT 'document_template', d.id::text FROM documents d
         WHERE d.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM document_templates dt WHERE dt.id = d.template_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND d.school_id') : ''}
       UNION ALL
       SELECT 'generated_doc_student', gd.id::text FROM generated_documents gd
         WHERE gd.student_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = gd.student_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND gd.school_id') : ''}
       UNION ALL
       SELECT 'generated_doc_template', gd.id::text FROM generated_documents gd
         WHERE gd.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM document_templates dt WHERE dt.id = gd.template_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND gd.school_id') : ''}
       UNION ALL
       SELECT 'generated_doc_year', gd.id::text FROM generated_documents gd
         WHERE gd.academic_year_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM academic_years ay WHERE ay.id = gd.academic_year_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND gd.school_id') : ''}
       UNION ALL
       SELECT 'assignment_user', a.id::text FROM assignments a
         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND a.school_id') : ''}
       UNION ALL
       SELECT 'assignment_class', a.id::text FROM assignments a
         WHERE a.class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.id = a.class_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND a.school_id') : ''}
       UNION ALL
       SELECT 'assignment_subject', a.id::text FROM assignments a
         WHERE a.subject_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subjects sub WHERE sub.id = a.subject_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND a.school_id') : ''}
       UNION ALL
       SELECT 'user_role_user', ur.id::text FROM user_roles ur
         WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND ur.school_id') : ''}
       UNION ALL
       SELECT 'user_role_role', ur.id::text FROM user_roles ur
         WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = ur.role_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND ur.school_id') : ''}
       UNION ALL
       SELECT 'fee_student', f.id::text FROM fees f
         WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = f.student_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND f.school_id') : ''}
       UNION ALL
       SELECT 'class_teacher', c.id::text FROM classes c
         WHERE c.teacher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.teacher_id)${schoolClause ? schoolClause.replace('AND school_id', 'AND c.school_id') : ''}
       LIMIT ${MAX_DETAILS + 100}`,
      { replacements: params, type: QueryTypes.SELECT },
    );

    const count = rows.length;

    if (count === 0) {
      return { name: 'invalid_references', status: 'OK', count: 0, message: 'No invalid foreign key references found' };
    }

    return {
      name: 'invalid_references',
      status: 'ERROR',
      count,
      message: `${count} invalid foreign key reference(s) detected`,
      details: toIds(rows),
    };
  }
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

/**
 * Run the consistency checker and return the report.
 * @param schoolId - Optional school scope. If null, checks all schools.
 */
export async function runConsistencyCheck(schoolId?: string | null): Promise<ConsistencyReport> {
  const checker = new ConsistencyChecker(schoolId);
  return checker.run();
}

// ---------------------------------------------------------------------------
// Standalone script entry point
// ---------------------------------------------------------------------------

/**
 * CLI entry point. Exported so the thin wrapper in `src/cli/consistency-check.ts`
 * can invoke it. Kept out of the module's import side effects so importing
 * `ConsistencyChecker` (e.g. from the diagnostics route or the test suite)
 * never runs the CLI.
 */
export async function main(): Promise<void> {
  const schoolIdArg = process.argv[2] || undefined;

  console.log('SchoolFlow Consistency Checker');
  console.log('===============================');
  console.log(`Scope: ${schoolIdArg ? `school ${schoolIdArg}` : 'all schools'}`);
  console.log('');

  try {
    const report = await runConsistencyCheck(schoolIdArg);

    console.log(`Overall status: ${report.overall}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log('');

    for (const check of report.checks) {
      const icon = check.status === 'OK' ? '✓' : check.status === 'WARNING' ? '⚠' : '✗';
      console.log(`${icon} [${check.status}] ${check.name}: ${check.message}`);
      if (check.details && check.details.length > 0) {
        console.log(`  IDs: ${check.details.join(', ')}`);
      }
    }

    console.log('');
    console.log(
      `Summary: ${report.summary.ok} OK, ${report.summary.warnings} warning(s), ${report.summary.errors} error(s) out of ${report.summary.total} checks`,
    );

    // Exit with non-zero code if there are errors
    if (report.overall === 'ERROR') {
      process.exit(1);
    }
    if (report.overall === 'WARNING') {
      process.exit(2);
    }
    process.exit(0);
  } catch (error) {
    console.error('Consistency check failed:', error);
    process.exit(1);
  }
}
