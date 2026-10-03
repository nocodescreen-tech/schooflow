import { QueryTypes } from 'sequelize';
import sequelize from './database.js';
import {
  School, User, Student, Class as SchoolClass, Subject, Grade, Attendance, Fee,
  Payment, ReportCard, Notification, AuditLog, VacationTicket, OTPCode,
  Timetable, CashTransaction, Document, DocumentTemplate, GeneratedDocument,
} from '../models/index.js';

interface ColumnRow {
  column_name: string;
}

/**
 * One-off cleanup: drops columns whose name contains an uppercase letter.
 * These were created by an earlier buggy run that did not convert model
 * attribute names to snake_case. Real columns are all snake_case.
 */
async function dropCamelCaseColumns(): Promise<void> {
  const models = [
    School, User, Student, SchoolClass, Subject, Grade, Attendance, Fee,
    Payment, ReportCard, Notification, AuditLog, VacationTicket, OTPCode,
    Timetable, CashTransaction, Document, DocumentTemplate, GeneratedDocument,
  ];

  for (const model of models) {
    const table = model.getTableName() as string;
    if (typeof table !== 'string') continue;

    const columns = await sequelize.query<ColumnRow>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = :table`,
      { replacements: { table }, type: QueryTypes.SELECT }
    );

    for (const { column_name } of columns) {
      if (!/[A-Z]/.test(column_name)) continue;
      await sequelize.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column_name}"`);
      console.log(`  - ${table}.${column_name}`);
    }
  }
}

dropCamelCaseColumns()
  .then(() => {
    console.log('CamelCase cleanup done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup failed:', error);
    process.exit(1);
  });
