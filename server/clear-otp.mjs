import { OtpChallenge } from './src/models/index.js';
await OtpChallenge.destroy({ where: { userId: '35064dd6-5057-4b72-ba91-8d923e3d7ada', purpose: 'PASSWORD_RESET' } });
console.log('Cleared');
