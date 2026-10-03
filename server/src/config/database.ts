import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      pool: { max: 20, min: 5, acquire: 60000, idle: 15000 },
    })
  : new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433'),
      database: process.env.DB_NAME || 'schoolflow',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      logging: false,
      pool: { max: 20, min: 5, acquire: 60000, idle: 15000 },
    });

export default sequelize;
