import sequelize from '../src/config/database.js';

/**
 * Jest bootstrap.
 *
 * The tests DESTROY the schema they run against, so the only thing standing
 * between `npx jest` and a wiped development database is this guard. It is
 * deliberately paranoid:
 *
 *  - refuse to run at all unless the database name ends in `_test`;
 *  - refuse if `NODE_ENV` is not `test`;
 *  - create the test database when it is missing, so a fresh checkout works;
 *  - never guess: a wrong guess means someone loses their data.
 */
function assertSafeToDestroy(): string {
  const dbName = process.env.DB_NAME ?? '';
  const nodeEnv = process.env.NODE_ENV ?? '';

  if (nodeEnv !== 'test') {
    throw new Error(
      `[tests] Refus de s’exécuter : NODE_ENV=${nodeEnv || '(vide)'}. ` +
        `Ce fichier détruit le schéma de la base courante.`
    );
  }
  if (!/_test$/.test(dbName)) {
    throw new Error(
      `[tests] Refus de s’exécuter sur la base « ${dbName || '(vide)'} ». ` +
        `Ce fichier fait « DROP SCHEMA public CASCADE » : il ne peut tourner que sur une base ` +
        `dont le nom finit par « _test » (convention attendue : schoolflow_test).`
    );
  }
  return dbName;
}

const dbName = assertSafeToDestroy();

// The test database may simply not exist yet on a fresh machine. Creating it is
// safe precisely because the name is already proven to be a test database.
async function ensureDatabaseExists(): Promise<void> {
  const admin = new (sequelize.constructor as typeof import('sequelize').Sequelize)({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    database: 'postgres',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
    logging: false,
  });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`[tests] Base de test « ${dbName} » créée.`);
  } catch (error) {
    // 42P04 = duplicate_database: it already exists, which is the normal case.
    // Match on the CODE, not the message: PostgreSQL localises errors, so a
    // French server answers « existe déjà » and an English-only string match
    // would wrongly rethrow.
    const code = (error as { original?: { code?: string } }).original?.code
      ?? (error as { code?: string }).code;
    if (code !== '42P04') throw error;
  } finally {
    await admin.close();
  }
}

beforeAll(async () => {
  await ensureDatabaseExists();
  console.log(`[tests] Base cible : ${dbName} (destructive — vérifié sûr)`);
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  const models = Object.values(sequelize.models);
  for (const model of models) {
    await model.destroy({ where: {}, truncate: true, cascade: true });
  }
});

afterAll(async () => {
  await sequelize.close();
});