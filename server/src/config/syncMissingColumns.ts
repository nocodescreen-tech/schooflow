import { QueryTypes } from 'sequelize';
import sequelize from './database.js';
import {
  School,
  User,
  Student,
  Class as SchoolClass,
  Subject,
  Grade,
  Attendance,
  Fee,
  Payment,
  ReportCard,
  Notification,
  AuditLog,
  VacationTicket,
  OTPCode,
  Timetable,
  CashTransaction,
  Document,
  DocumentTemplate,
  GeneratedDocument,
  RefreshToken,
  Parent,
  StudentParent,
  AcademicYear,
  Incident,
  Sanction,
  Convocation,
  CalendarEvent,
  Cycle,
  Filiere,
  Section,
  Option,
  Niveau,
  SchoolModule,
  UserPermissionOverride,
  Delegation,
  Assignment,
  PasswordResetToken,
  ActivationCode,
  UserRole,
  UserScope,
  RolePermission,
  Permission,
  EvaluationPeriod,
  Assessment,
  GradingConfig,
  PromotionDecision,
  ExchangeRate,
  Enrollment,
  SchoolIdentity,
  DocumentSequence,
} from '../models/index.js';

interface ColumnRow {
  column_name: string;
}

/**
 * `sequelize.sync()` only creates missing tables — it never adds columns that
 * were introduced to a model after the table was first created. This walks
 * every model, compares the declared attributes with the real table structure
 * and issues `ALTER TABLE ... ADD COLUMN` for anything missing.
 *
 * It is additive only: no column is ever dropped or retyped, so existing data
 * is never destroyed.
 */
export async function syncMissingColumns(): Promise<void> {
  const models = [
    School,
    User,
    Student,
    SchoolClass,
    Subject,
    Grade,
    Attendance,
    Fee,
    Payment,
    ReportCard,
    Notification,
    AuditLog,
    VacationTicket,
    OTPCode,
    Timetable,
    CashTransaction,
    Document,
    DocumentTemplate,
    GeneratedDocument,
    RefreshToken,
    Parent,
    StudentParent,
    AcademicYear,
    Incident,
    Sanction,
    Convocation,
    CalendarEvent,
    Cycle,
    Filiere,
    Section,
    Option,
    Niveau,
    SchoolModule,
    UserPermissionOverride,
    Delegation,
    Assignment,
    PasswordResetToken,
    ActivationCode,
    UserRole,
    UserScope,
    RolePermission,
    Permission,
    EvaluationPeriod,
    Assessment,
    GradingConfig,
    PromotionDecision,
    ExchangeRate,
    Enrollment,
    SchoolIdentity,
    DocumentSequence,
  ];

  for (const model of models) {
    const table = model.getTableName() as string;
    if (typeof table !== 'string') continue;

    let existingNames: Set<string>;
    try {
      const existing = await sequelize.query<ColumnRow>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = :table`,
        { replacements: { table }, type: QueryTypes.SELECT }
      );
      existingNames = new Set(existing.map((r) => r.column_name));
    } catch (error) {
      console.warn(`  ! could not inspect ${table}:`, (error as Error).message);
      continue;
    }

    for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
      // Models use `underscored: true`, so DB columns are snake_case.
      const columnName = attributeName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      if (existingNames.has(columnName)) continue;

      const rawAttribute = attribute as {
        defaultValue?: unknown;
        toSql?: () => string;
        type?: { toSql?: () => string; options?: { values?: string[] } };
      };
      let sqlType: string | undefined;
      let enumValues: string[] | undefined;
      try {
        sqlType = rawAttribute.toSql?.() ?? rawAttribute.type?.toSql?.();
        enumValues = rawAttribute.type?.options?.values;
      } catch {
        sqlType = undefined;
      }
      if (!sqlType) continue;

      let columnSql: string;
      if (/enum/i.test(sqlType) && enumValues?.length) {
        // Postgres ENUMs are named `<table>_<column>_enum`. Create the type
        // first (idempotent), then use it as the column type.
        const enumName = `${table}_${columnName}_enum`;
        try {
          await sequelize.query(`DO $$ BEGIN CREATE TYPE "${enumName}" AS ENUM (${enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
          columnSql = `"${enumName}"`;
        } catch {
          continue; // cannot resolve this column; keep going with the others
        }
      } else {
        columnSql = sqlType;
      }

      const rawDefault = rawAttribute.defaultValue;
      // SQL string literals need single quotes. `JSON.stringify` would emit
      // double quotes, which PostgreSQL reads as an identifier reference
      // ("cannot use a column reference in a default expression").
      let defaultValue = '';
      if (
        rawDefault !== undefined &&
        rawDefault !== null &&
        typeof rawDefault !== 'function' &&
        typeof rawDefault !== 'object'
      ) {
        if (typeof rawDefault === 'number' || typeof rawDefault === 'boolean') {
          defaultValue = ` DEFAULT ${String(rawDefault)}`;
        } else {
          const literal = String(rawDefault).replace(/'/g, "''");
          defaultValue = ` DEFAULT '${literal}'`;
        }
      }

      // One failing column must never prevent the rest from being added.
      try {
        await sequelize.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${columnName}" ${columnSql}${defaultValue}`
        );
        console.log(`  + ${table}.${columnName} (${columnSql})`);
      } catch (error) {
        console.warn(`  ! ${table}.${columnName}:`, (error as Error).message);
      }
    }

    // Extend existing ENUM types with any newly declared values.
    // `ALTER TYPE ... ADD VALUE` is additive and never rewrites existing rows,
    // which is what keeps this migration non-destructive.
    await extendEnumValues(model, table);
  }
}

interface EnumColumnRow {
  udt_name: string;
  typtype: string;
}

type AnyModel = { rawAttributes: Record<string, unknown> };

async function extendEnumValues(model: AnyModel, table: string): Promise<void> {
  for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
    const columnName = attributeName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const type = (attribute as { type?: { key?: string; options?: { values?: string[] } } }).type;
    const values = type?.options?.values;
    if (!type?.key || !values?.length || !/ENUM/i.test(type.key)) continue;

    // Find the real enum type backing this column.
    let udtName: string;
    try {
      const rows = await sequelize.query<EnumColumnRow>(
        `SELECT c.udt_name, t.typtype
           FROM information_schema.columns c
           JOIN pg_type t ON t.typname = c.udt_name
          WHERE c.table_name = :table AND c.column_name = :column`,
        { replacements: { table, column: columnName }, type: QueryTypes.SELECT }
      );
      udtName = rows[0]?.udt_name;
      // A column converted from ENUM to varchar (see the document-identity
      // migration) still declares ENUM in the model. Without this guard the
      // sync would try `ALTER TYPE "varchar" ADD VALUE` and warn on every boot.
      if (rows[0]?.typtype !== 'e') continue;
    } catch {
      continue;
    }
    if (!udtName) continue;

    // Which labels does the type already accept?
    let existingLabels: string[] = [];
    try {
      const rows = await sequelize.query<{ enumlabel: string }>(
        `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :name`,
        { replacements: { name: udtName }, type: QueryTypes.SELECT }
      );
      existingLabels = rows.map((r) => r.enumlabel);
    } catch {
      continue;
    }

    const missing = values.filter((v) => !existingLabels.includes(v));
    for (const value of missing) {
      try {
        // Cannot run inside a transaction block on older PostgreSQL.
        await sequelize.query(`ALTER TYPE "${udtName}" ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`);
        console.log(`  + enum ${udtName}.${value}`);
      } catch (error) {
        console.warn(`  ! enum ${udtName}.${value}:`, (error as Error).message);
      }
    }
  }
}
