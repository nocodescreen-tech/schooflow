import { QueryTypes } from 'sequelize';
import sequelize from '../src/config/database.js';

const n = await sequelize.query('DELETE FROM otp_challenges', { type: QueryTypes.DELETE });
console.log('challenges supprimés:', n);

const remaining = await sequelize.query('SELECT count(*)::int n FROM otp_challenges', { type: QueryTypes.SELECT });
console.log('restants:', remaining[0].n);
await sequelize.close();