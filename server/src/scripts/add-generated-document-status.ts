import { QueryTypes } from 'sequelize';
import sequelize from '../config/database.js';

const VALUES = ['DRAFT', 'GENERATED', 'REVIEWED', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'REVOKED'];

async function main(): Promise<void> {
  await sequelize.authenticate();

  for (const value of VALUES) {
    await sequelize.query(
      `ALTER TYPE "enum_generated_documents_status" ADD VALUE IF NOT EXISTS '${value}'`
    );
    console.log(`+ enum_generated_documents_status.${value}`);
  }

  const rows = (await sequelize.query(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'enum_generated_documents_status' ORDER BY enumlabel`,
    { type: QueryTypes.SELECT }
  )) as Array<{ enumlabel: string }>;
  console.log('enum values: ' + JSON.stringify(rows.map((r) => r.enumlabel)));

  await sequelize.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
