/**
 * Backwards-compatible re-export.
 *
 * The provider abstraction lives in `./EmailService.js`. This module keeps the
 * old import path working so existing callers (`routes/otp.ts`,
 * `services/imagekit.ts`) continue to resolve without a mass edit.
 */
export {
  sendEmail,
  isEmailConfigured,
  activeEmailProvider,
} from './EmailService.js';
export type { EmailOptions, EmailResult, SchoolBranding } from './EmailService.js';