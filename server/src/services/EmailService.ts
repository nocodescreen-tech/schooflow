import nodemailer, { Transporter } from 'nodemailer';

/**
 * EmailService — provider abstraction (§10, §32).
 *
 * The rest of SchoolFlow talks to `sendEmail` and never learns which provider
 * carries the message. Adding Resend, SendGrid, Mailgun or SES means adding a
 * provider here and flipping one env var — no caller changes.
 *
 * Provider selection, in order:
 *   1. `EMAIL_PROVIDER` when it names a known provider;
 *   2. SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS are set;
 *   3. the dev provider, which logs instead of sending. It is only reachable
 *      when no real provider is configured, so a production deployment with
 *      credentials can never silently fall back to "log and pretend".
 */

export interface SchoolBranding {
  name: string;
  logo?: string;
  address?: string;
  phone?: string;
  primaryColor?: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Optional reply-to, used for transactional mail. */
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  /** Provider-specific message id, when it exposes one. */
  providerId?: string;
  /**
   * The OTP, only ever populated by the dev provider when
   * `EMAIL_DEV_EXPOSE_CODE=true`. Never set by a real provider.
   */
  devCode?: string;
}

interface EmailProvider {
  readonly name: string;
  send(options: EmailOptions): Promise<EmailResult>;
}

// ─── SMTP ──────────────────────────────────────────────────────────────────

class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    return this.transporter;
  }

  async send(options: EmailOptions): Promise<EmailResult> {
    const info = await this.getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'noreply@schoolflow.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });
    return { success: true, providerId: info.messageId ?? undefined };
  }
}

// ─── Development / test ─────────────────────────────────────────────────────

/**
 * Logs the message instead of sending it. Used when no provider is configured
 * so local development and the test suite still work.
 *
 * It is deliberately NOT a "fake success": the caller is told the message was
 * not delivered, which is what lets the OTP flow offer a resend instead of
 * pretending the email went out (§31).
 */
class DevProvider implements EmailProvider {
  readonly name = 'dev';

  /**
   * Logs the message instead of sending it.
   *
   * When `EMAIL_DEV_EXPOSE_CODE` is set, the OTP is returned to the caller so
   * the API can display it during development (§33). This is gated on an
   * explicit opt-in AND on no real provider being configured, so a production
   * deployment can never leak a code: without the env var the code is not
   * returned, and with SMTP configured the SMTP provider is used instead.
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    console.log(`[EMAIL:DEV] provider=dev to=${options.to} subject="${options.subject}"`);
    const expose = process.env.EMAIL_DEV_EXPOSE_CODE === 'true';
    return { success: false, ...(expose ? { devCode: extractOtp(options.html) } : {}) };
  }
}

/** Pulls the 6-digit code out of the rendered OTP email, for dev display only. */
function extractOtp(html: string): string | undefined {
  const match = html.match(/letter-spacing:8px;[^>]*>(\d{6})</);
  return match?.[1];
}

// ─── Selection ──────────────────────────────────────────────────────────────

let cachedProvider: EmailProvider | undefined;

function smtpIsConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Resolves the active provider.
 *
 * `EMAIL_PROVIDER` wins when it names a configured provider, so an operator can
 * force SMTP even if another provider's env vars are present. Unknown values
 * fall through to auto-detection rather than failing loudly: a typo in a
 * variable should not take email down.
 */
function getProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;

  const requested = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (requested === 'smtp' && smtpIsConfigured()) {
    cachedProvider = new SmtpProvider();
    return cachedProvider;
  }

  if (smtpIsConfigured()) {
    cachedProvider = new SmtpProvider();
    return cachedProvider;
  }

  cachedProvider = new DevProvider();
  return cachedProvider;
}

/** Which provider is active — surfaced in the admin email settings. */
export function activeEmailProvider(): string {
  return getProvider().name;
}

/**
 * Sends an email through the configured provider.
 *
 * Returns `{ success: false }` when delivery fails. Callers must treat that as
 * "not delivered" and offer a resend — never as a silent success (§31).
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    return await getProvider().send(options);
  } catch (error) {
    console.error('[EMAIL:ERROR] delivery failed:', (error as Error).message);
    return { success: false };
  }
}

/**
 * Whether real delivery is possible right now. The admin settings screen uses
 * this to warn before someone configures a workflow that depends on email.
 */
export function isEmailConfigured(): boolean {
  return getProvider().name !== 'dev';
}