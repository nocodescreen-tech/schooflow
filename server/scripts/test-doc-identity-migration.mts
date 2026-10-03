/**
 * Proves the document-identity migration is correct AND non-destructive.
 *
 * It builds a throw-away table reproducing the LEGACY shape (enum document_type,
 * enum status carrying the French values, global unique index on
 * document_number, three rows including one with a NULL number), runs the
 * migration against it twice, and asserts:
 *   - no row is lost, and values change only through the documented mapping;
 *   - the global unique index is gone and the per-school one exists;
 *   - every legacy row ends up with a number and a verification code;
 *   - two schools may share a number while one school may not;
 *   - a second run changes nothing.
 */
import { QueryTypes } from 'sequelize';
import sequelize from '../src/config/database.js';
import { migrateDocumentIdentity } from '../src/config/migrations/documentIdentity.js';

const T = 'generated_documents_migtest';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

const SCHOOL_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SCHOOL_B = 'aaaaaaaa-0000-4000-8000-000000000002';

async function buildLegacy() {
  await sequelize.query(`DROP TABLE IF EXISTS ${T} CASCADE`);
  await sequelize.query(`DROP TYPE IF EXISTS ${T}_document_type`);
  await sequelize.query(`DROP TYPE IF EXISTS ${T}_status`);
  await sequelize.query(
    `CREATE TYPE ${T}_document_type AS ENUM ('bulletin','certificat','billet_vacances','avis_parents','autre')`
  );
  await sequelize.query(
    `CREATE TYPE ${T}_status AS ENUM ('en_attente','terminee','erronee','DRAFT','GENERATED','REVIEWED','VALIDATED','PUBLISHED','ARCHIVED','REVOKED')`
  );
  await sequelize.query(`
    CREATE TABLE ${T} (
      id uuid PRIMARY KEY,
      school_id uuid NOT NULL,
      template_id uuid,
      document_type ${T}_document_type NOT NULL,
      student_id uuid,
      file_path varchar(500) NOT NULL,
      title varchar(255),
      status ${T}_status DEFAULT 'en_attente',
      metadata jsonb DEFAULT '{}'::jsonb,
      document_number varchar(50) UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

  await sequelize.query(`
    INSERT INTO ${T} (id, school_id, document_type, file_path, title, status, document_number, metadata)
    VALUES
      ('11111111-1111-4111-8111-111111111111', '${SCHOOL_A}', 'bulletin',   '/u/a.pdf', 'Bulletin A',  'terminee',   'DOC-2026-00001', '{"academicYear":"2025-2026"}'),
      ('22222222-2222-4222-8222-222222222222', '${SCHOOL_A}', 'certificat', '/u/b.pdf', 'Certificat',  'en_attente', NULL,              '{}'),
      ('33333333-3333-4333-8333-333333333333', '${SCHOOL_B}', 'autre',      '/u/c.pdf', 'Autre',       'erronee',    NULL,              '{"kind":"x"}')
  `);
}

/** Only the columns that exist before AND after the migration. */
async function readStableRows() {
  const rows = await sequelize.query(
    `SELECT id, school_id, document_type, status, document_number, metadata, title, file_path
       FROM ${T} ORDER BY id`,
    { type: QueryTypes.SELECT }
  );
  return rows as unknown as Array<Record<string, unknown>>;
}

/** Full read, valid only once the migration has run. */
async function readRows() {
  const rows = await sequelize.query(
    `SELECT id, school_id, document_type, status, document_number, verification_code,
            identity_snapshot, template_version, metadata, title
       FROM ${T} ORDER BY id`,
    { type: QueryTypes.SELECT }
  );
  return rows as unknown as Array<Record<string, unknown>>;
}

async function main() {
  await buildLegacy();
  const before = await readStableRows();

  await migrateDocumentIdentity(T);
  await migrateDocumentIdentity(T); // must be idempotent
  const after = await readRows();

  check('no row was lost', after.length === before.length, `${after.length} rows`);
  check('titles survived', after.map((r) => r.title).join('|') === before.map((r) => r.title).join('|'));
  check('metadata survived', after[0].metadata && JSON.stringify(after[0].metadata) === JSON.stringify(before[0].metadata),
    JSON.stringify(after[0].metadata));

  check('"terminee" became GENERATED', after[0].status === 'GENERATED', String(after[0].status));
  check('"en_attente" became DRAFT', after[1].status === 'DRAFT', String(after[1].status));
  check('"erronee" became REVOKED', after[2].status === 'REVOKED', String(after[2].status));

  check(
    'document_type survived enum → varchar',
    after.map((r) => r.document_type).join(',') === 'bulletin,certificat,autre',
    after.map((r) => r.document_type).join(',')
  );

  check('the existing number was kept', after[0].document_number === 'DOC-2026-00001', String(after[0].document_number));
  check(
    'a NULL number was backfilled deterministically',
    String(after[1].document_number).startsWith('LEGACY-'),
    String(after[1].document_number)
  );
  check(
    'every row has an 8-char verification code',
    after.every((r) => typeof r.verification_code === 'string' && String(r.verification_code).length === 8),
    after.map((r) => r.verification_code).join(',')
  );
  check('legacy rows are flagged as migrated in their snapshot',
    (after[0].identity_snapshot as { migrated?: boolean }).migrated === true,
    JSON.stringify(after[0].identity_snapshot)
  );
  check('template_version starts NULL for legacy rows', after[0].template_version === null);

  const idx = await sequelize.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = '${T}'`,
    { type: QueryTypes.SELECT }
  );
  const names = new Set(idx.map((i: { indexname: string }) => i.indexname));
  check('the global unique index on document_number is gone', !names.has(`${T}_document_number_unique`), [...names].join(', '));
  check('the per-school unique index exists', names.has(`${T}_school_id_document_number`));

  // The whole point: two schools may both start at REC-2026-000001.
  await sequelize.query(
    `UPDATE ${T} SET document_number = 'REC-2026-000001'
      WHERE id IN ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')`
  );
  const dup = await sequelize.query(
    `SELECT count(*)::int n FROM ${T} WHERE document_number = 'REC-2026-000001'`,
    { type: QueryTypes.SELECT }
  );
  check('the SAME number is now accepted at two different schools', dup[0].n === 2, `${dup[0].n} rows`);

  let refusedInSameSchool = false;
  try {
    await sequelize.query(
      `UPDATE ${T} SET document_number = 'REC-2026-000001' WHERE id = '22222222-2222-4222-8222-222222222222'`
    );
  } catch {
    refusedInSameSchool = true;
  }
  check('the same number is still refused inside one school', refusedInSameSchool);

  // Idempotency: a third run must not touch the numbers we just set.
  const snapshot = await readRows();
  await migrateDocumentIdentity(T);
  const again = await readRows();
  check(
    're-running the migration changes nothing',
    JSON.stringify(snapshot) === JSON.stringify(again),
    `${snapshot.length} → ${again.length} rows`
  );

  await sequelize.query(`DROP TABLE IF EXISTS ${T} CASCADE`);
  await sequelize.query(`DROP TYPE IF EXISTS ${T}_document_type`);
  await sequelize.query(`DROP TYPE IF EXISTS ${T}_status`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});