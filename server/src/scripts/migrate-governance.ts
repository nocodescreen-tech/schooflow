import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';

async function main(): Promise<void> {
  await sequelize.authenticate();

  // New tables (additive only)
  await sequelize.sync();

  // Missing scalar columns
  await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0');
  await sequelize.query('ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS responsible VARCHAR(255)');
  await sequelize.query('ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS attachment VARCHAR(500)');
  await sequelize.query('ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS document_number VARCHAR(50)');
  await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS generated_documents_document_number_unique ON generated_documents (document_number)');
  await sequelize.query('ALTER TABLE subjects ADD COLUMN IF NOT EXISTS department VARCHAR(100)');

  // grades.status as proper PG enum
  await sequelize.query(
    `DO $$ BEGIN CREATE TYPE "enum_grades_status" AS ENUM('DRAFT','SUBMITTED','VALIDATED','PUBLISHED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`
  );
  await sequelize.query(
    `ALTER TABLE grades ADD COLUMN IF NOT EXISTS status "enum_grades_status" DEFAULT 'PUBLISHED'`
  );

  // payments method enum: allow new values at DB level (old values cannot be dropped in PG)
  await sequelize.query(`ALTER TYPE "enum_payments_method" ADD VALUE IF NOT EXISTS 'bank'`);
  await sequelize.query(`ALTER TYPE "enum_payments_method" ADD VALUE IF NOT EXISTS 'transfer'`);

  // Payment method usage before migration
  const before = (await sequelize.query(
    `SELECT method, COUNT(*)::int AS count FROM payments GROUP BY method ORDER BY method`,
    { type: QueryTypes.SELECT }
  )) as Array<{ method: string; count: number }>;
  console.log('payments before: ' + JSON.stringify(before));

  const migrated = await sequelize.query(
    `UPDATE payments SET method = 'other' WHERE method::text IN ('mobile_money','card','bank_transfer','airtel','mpesa','orange')`
  ).then((r) => (r[1] as unknown as number) ?? null).catch(() => null);
  console.log('payments migrated count: ' + JSON.stringify(migrated));

  const updated = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM payments WHERE method = 'other'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ count: number }>;
  const after = (await sequelize.query(
    `SELECT method, COUNT(*)::int AS count FROM payments GROUP BY method ORDER BY method`,
    { type: QueryTypes.SELECT }
  )) as Array<{ method: string; count: number }>;
  console.log('payments after: ' + JSON.stringify(after));
  console.log('payments other count: ' + JSON.stringify(updated));

  // Grades NULL migration
  const nullBefore = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM grades WHERE status IS NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ count: number }>;
  await sequelize.query(`UPDATE grades SET status = 'PUBLISHED' WHERE status IS NULL`);
  const nullAfter = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM grades WHERE status IS NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ count: number }>;
  const byStatus = (await sequelize.query(
    `SELECT status, COUNT(*)::int AS count FROM grades GROUP BY status ORDER BY status`,
    { type: QueryTypes.SELECT }
  )) as Array<{ status: string; count: number }>;
  console.log('grades null before: ' + JSON.stringify(nullBefore));
  console.log('grades null after: ' + JSON.stringify(nullAfter));
  console.log('grades by status: ' + JSON.stringify(byStatus));

  await sequelize.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
