import { QueryTypes } from 'sequelize';
import sequelize from '../../config/database.js';

/**
 * Document identity & numbering migration.
 *
 * Runs on every boot and is fully idempotent. It never deletes a document.
 *
 * Why it exists instead of `sequelize.sync()`:
 *  - `document_type` and `status` were Postgres ENUMs. The spec requires many
 *    more document types than the five the enum allowed, and the enum carried
 *    French values (`en_attente`, `terminee`, `erronee`) alongside the English
 *    ones. Both become plain varchar so the catalogue can grow.
 *  - `document_number` had a GLOBAL unique index. Two schools may legitimately
 *    both start at `REC-2026-000001`, so uniqueness must be per school.
 *  - `verification_code` is required for the QR check; legacy rows get a stable
 *    value derived from their id instead of a random one, so re-running the
 *    migration never changes one.
 *
 * The table name is a parameter so the migration can be exercised against a
 * throw-away table in tests; production always uses the default.
 */

interface IndexRow { indexname: string }
interface ColumnRow { column_name: string; udt_name: string; is_nullable: string }

async function tableExists(table: string): Promise<boolean> {
  const rows = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = :t) AS exists`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
  return rows[0]?.exists === true;
}

async function columns(table: string): Promise<ColumnRow[]> {
  return sequelize.query<ColumnRow>(
    `SELECT column_name, udt_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = :t`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
}

async function indexNames(table: string): Promise<Set<string>> {
  const rows = await sequelize.query<IndexRow>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = :t`,
    { replacements: { t: table }, type: QueryTypes.SELECT }
  );
  return new Set(rows.map((r: IndexRow) => r.indexname));
}

async function addColumn(table: string, column: string, ddl: string): Promise<void> {
  const existing = await columns(table);
  if (existing.some((c) => c.column_name === column)) return;
  await sequelize.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`);
  console.log(`  + ${table}.${column}`);
}

async function enumHasValue(typeName: string, label: string): Promise<boolean> {
  const rows = await sequelize.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = :t AND e.enumlabel = :l
     ) AS exists`,
    { replacements: { t: typeName, l: label }, type: QueryTypes.SELECT }
  );
  return rows[0]?.exists === true;
}

/**
 * Moves every row carrying an old enum label onto the new one.
 *
 * Idempotent by construction: it only acts while the old label is still present,
 * so a second run is a no-op instead of an error. The temporary label is left
 * behind on purpose — it is dropped together with the whole enum type below.
 */
async function remapValue(
  table: string,
  typeName: string,
  from: string,
  temp: string,
  finalValue: string
): Promise<void> {
  if (!(await enumHasValue(typeName, from))) return;
  await sequelize.query(`ALTER TYPE "${typeName}" RENAME VALUE '${from}' TO '${temp}'`);
  await sequelize.query(
    `UPDATE "${table}" SET "status" = '${finalValue}' WHERE "status" = '${temp}'`
  );
  console.log(`  ~ ${typeName}: ${from} → ${finalValue}`);
}

async function setNotNull(table: string, column: string): Promise<void> {
  const existing = await columns(table);
  const col = existing.find((c) => c.column_name === column);
  if (!col || col.is_nullable === 'NO') return;
  await sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`);
}

/**
 * Drops ANY unique constraint/index built on a single column of `table`.
 *
 * Two naming conventions exist for the very same thing — Sequelize emits
 * `<table>_<column>_unique`, an inline `UNIQUE` in DDL emits `<table>_<column>_key`
 * — so matching by name would miss half the installs. Matching by definition
 * catches both, and only touches the one column we mean to relax.
 */
async function dropSingleColumnUnique(table: string, column: string): Promise<boolean> {
  const rows = await sequelize.query<{ indexname: string; is_constraint: boolean }>(
    `SELECT i.relname AS indexname,
            (con.oid IS NOT NULL) AS is_constraint
       FROM pg_index idx
       JOIN pg_class i ON i.oid = idx.indexrelid
       JOIN pg_attribute a ON a.attrelid = idx.indrelid AND a.attnum = ANY (idx.indkey)
       LEFT JOIN pg_constraint con ON con.conindid = i.oid
      WHERE idx.indrelid = to_regclass('public.' || quote_ident(:t))
        AND idx.indisunique
        AND idx.indnatts = 1
        AND a.attname = :c`,
    { replacements: { t: table, c: column }, type: QueryTypes.SELECT }
  );
  for (const row of rows) {
    if (row.is_constraint) {
      // A UNIQUE constraint owns an index that cannot simply be dropped.
      await sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${row.indexname}"`);
    } else {
      await sequelize.query(`DROP INDEX IF EXISTS "${row.indexname}"`);
    }
    console.log(`  - relaxed the unique constraint on ${table}.${column} (${row.indexname})`);
    return true;
  }
  return false;
}

export async function migrateDocumentIdentity(table = 'generated_documents'): Promise<void> {
  if (!(await tableExists(table))) return;

  console.log(`Migrating document identity & numbering (${table})…`);
  // `__TABLE__` is substituted for the bare identifier, so it can appear inside
  // quotes ("__TABLE__", "__TABLE___status", …).
  const q = (sql: string) => sequelize.query(sql.replace(/__TABLE__/g, table));

  // The enum type names are whatever Sequelize created, so read them from the
  // columns rather than guessing: legacy installs differ.
  const cols = await columns(table);
  const documentTypeEnum = cols.find((c) => c.column_name === 'document_type')?.udt_name ?? null;
  const statusEnum = cols.find((c) => c.column_name === 'status')?.udt_name ?? null;

  // ── 1. Park the legacy French status values under names we can map below ──
  if (statusEnum && statusEnum !== 'varchar') {
    await remapValue(table, statusEnum, 'en_attente', 'DRAFT_LEGACY', 'DRAFT');
    await remapValue(table, statusEnum, 'terminee', 'GENERATED_LEGACY', 'GENERATED');
    await remapValue(table, statusEnum, 'erronee', 'REVOKED_LEGACY', 'REVOKED');
  }

  // ── 2. `document_type`: enum → varchar, so the catalogue can grow ──
  if (documentTypeEnum && documentTypeEnum !== 'varchar') {
    await q(
      `ALTER TABLE "__TABLE__"
         ALTER COLUMN "document_type" TYPE varchar(50)
         USING "document_type"::text`
    );
    await setNotNull(table, 'document_type');
    await q(`DROP TYPE IF EXISTS "${documentTypeEnum}"`);
    console.log(`  ~ ${table}.document_type: ${documentTypeEnum} → varchar(50)`);
  }

  // ── 3. `status`: enum → varchar too, after normalising the French labels ──
  if (statusEnum && statusEnum !== 'varchar') {
    await q(`ALTER TABLE "__TABLE__" ALTER COLUMN "status" TYPE varchar(20)
         USING "status"::text`);
    await q(`ALTER TABLE "__TABLE__" ALTER COLUMN "status" SET DEFAULT 'GENERATED'`);
    await q(`DROP TYPE IF EXISTS "${statusEnum}"`);
    console.log(`  ~ ${table}.status: ${statusEnum} → varchar(20)`);
  }

  // ── 4. A number may repeat across schools, never inside one ──
  const names = await indexNames(table);
  await dropSingleColumnUnique(table, 'document_number');
  if (!names.has(`${table}_school_id_document_number`)) {
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_school_id_document_number"
         ON "__TABLE__" ("school_id", "document_number")`
    );
    console.log('  + unique index (school_id, document_number)');
  }
  if (!names.has(`${table}_school_id_document_type`)) {
    await q(`CREATE INDEX IF NOT EXISTS "${table}_school_id_document_type" ON "__TABLE__" ("school_id", "document_type")`);
  }

  // ── 5. New columns for identity snapshot and issuance trace ──
  // Referenced tables are schema-qualified: the migration must not depend on
  // whatever `search_path` the pooled connection happens to carry.
  await addColumn(table, 'academic_year_id', 'uuid REFERENCES public.academic_years(id) ON DELETE SET NULL');
  await addColumn(table, 'identity_snapshot', `jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await addColumn(table, 'template_version', 'integer');
  await addColumn(table, 'data_snapshot', 'jsonb');
  await addColumn(table, 'verification_code', 'varchar(24)');
  await addColumn(table, 'issued_at', 'timestamp with time zone');
  await addColumn(table, 'issued_by', 'uuid REFERENCES public.users(id) ON DELETE SET NULL');
  await addColumn(table, 'revoked_at', 'timestamp with time zone');
  await addColumn(table, 'revoked_by', 'uuid REFERENCES public.users(id) ON DELETE SET NULL');
  await addColumn(table, 'revoke_reason', 'text');
  await q(`ALTER TABLE "__TABLE__" ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb`);
  await q(`ALTER TABLE "__TABLE__" ALTER COLUMN "metadata" SET NOT NULL`);

  // ── 6. Backfill legacy rows before enforcing NOT NULL ──
  // Derived from the id, so it is deterministic: re-running changes nothing.
  await q(
    `UPDATE "__TABLE__"
        SET "verification_code" = upper(substring(replace("id"::text, '-', '') from 1 for 8))
      WHERE "verification_code" IS NULL`
  );
  await q(
    `UPDATE "__TABLE__"
        SET "document_number" = 'LEGACY-' || upper(substring(replace("id"::text, '-', '') from 1 for 10))
      WHERE "document_number" IS NULL OR "document_number" = ''`
  );
  await q(
    `UPDATE "__TABLE__"
        SET "identity_snapshot" = jsonb_build_object('migrated', true, 'migratedAt', now())
      WHERE "identity_snapshot" = '{}'::jsonb`
  );

  await setNotNull(table, 'verification_code');
  await setNotNull(table, 'document_number');
  await q(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_verification_code_uniq" ON "__TABLE__" ("verification_code")`
  );

  const finalCols = await columns(table);
  console.log(
    `Document identity migration done (${table}, ${finalCols.length} colonnes).`
  );
}