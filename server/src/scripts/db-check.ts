import sequelize from '../config/database.js';

async function main(): Promise<void> {
  await sequelize.authenticate();
  console.log('DB OK');
  await sequelize.close();
}

main().catch((err) => {
  console.error('DB FAIL:', err.message);
  process.exit(1);
});
