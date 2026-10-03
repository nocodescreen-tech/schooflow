/* Manual sync check used to surface the real SQL error hidden by jest. */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'schoolflow_test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_USER = 'postgres';
process.env.DB_PASS = '';

import sequelize from '../src/config/database.js';
import '../src/models/index.js';

async function main() {
  try {
    await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await sequelize.sync({ force: true });
    console.log('SYNC OK');
  } catch (e) {
    console.error('SYNC ERROR:', (e as Error).message);
    console.error('SQL:', (e as { sql?: string }).sql);
  }
  await sequelize.close();
}

void main();
