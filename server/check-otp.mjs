import { OtpChallenge } from './src/models/index.js';
const challenges = await OtpChallenge.findAll({ order: [['createdAt', 'DESC']], limit: 5 });
console.log(JSON.stringify(challenges, null, 2));
