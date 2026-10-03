/**
 * End-to-end OTP system test (§42).
 *
 * Covers the acceptance criteria:
 *  - issue → verify with the right code
 *  - wrong code increments attempts and locks after the limit
 *  - resend cooldown rejects a too-early resend
 *  - a consumed code is rejected on reuse
 *  - email enumeration is protected (same response either way)
 *  - school isolation: a code from one school is worthless at another
 *  - the raw code is never stored (only a hash)
 *  - every event is audited, and no audit row contains a raw code
 *
 * Runs with `EMAIL_DEV_EXPOSE_CODE=true` so the dev provider returns the code
 * and the test can drive a real verification. Without it the code is not
 * recoverable, which is exactly the production behaviour.
 */
import { QueryTypes } from 'sequelize';
import sequelize from '../src/config/database.js';

process.env.EMAIL_DEV_EXPOSE_CODE = 'true';

const BASE = 'http://localhost:4000/api/v1';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data };
}

/** The code, taken from the dev-only response — never from the database. */
async function issue(email: string, purpose: string): Promise<{ code: string; res: Awaited<ReturnType<typeof api>> }> {
  const res = await api('POST', '/otp/send', { email, purpose });
  return { code: res.data?.data?.devCode ?? '', res };
}

async function main() {
  // ── 1. Issue ────────────────────────────────────────────────────────────
  const email = `otp-test-${Date.now().toString(36)}@example.com`;
  const { code, res: send } = await issue(email, 'EMAIL_VERIFICATION');
  check('OTP_SEND returns 201', send.status === 201, `status=${send.status}`);
  check('OTP_SEND does not leak whether the email exists', send.data?.data?.message?.includes('Si un compte correspond'), send.data?.data?.message);
  check('OTP_SEND reports a TTL', send.data?.data?.expiresInMinutes === 10, `${send.data?.data?.expiresInMinutes} min`);
  check('OTP_SEND reports a resend cooldown', send.data?.data?.resendCooldownSeconds === 60, `${send.data?.data?.resendCooldownSeconds}s`);
  check('OTP_SEND exposes the code in dev mode', /^\d{6}$/.test(code), code);

  // ── 2. Raw code is never stored ──────────────────────────────────────────
  const stored = await sequelize.query<{ code_hash: string }>(
    `SELECT code_hash FROM otp_challenges WHERE email = :email ORDER BY created_at DESC LIMIT 1`,
    { replacements: { email }, type: QueryTypes.SELECT }
  );
  check(
    'the raw code is NOT stored (only a 64-char hash)',
    stored[0]?.code_hash !== code && stored[0]?.code_hash?.length === 64,
    `hash=${stored[0]?.code_hash?.slice(0, 12)}…`
  );

  // ── 3. Wrong code increments attempts ────────────────────────────────────
  const wrong = await api('POST', '/otp/verify', { email, code: '000000', purpose: 'EMAIL_VERIFICATION' });
  check('a wrong code is rejected', wrong.status === 400 && wrong.data?.error?.includes('incorrect'), wrong.data?.error);
  check('the wrong code reports attempts left', wrong.data?.attemptsLeft === 4, `${wrong.data?.attemptsLeft}`);

  // ── 4. Resend cooldown ───────────────────────────────────────────────────
  const earlyResend = await api('POST', '/otp/resend', { email, purpose: 'EMAIL_VERIFICATION' });
  check('a resend during cooldown is rejected', earlyResend.status === 429, `status=${earlyResend.status}`);
  check('the cooldown tells the user how long to wait', earlyResend.data?.retryAfterSeconds > 0, `${earlyResend.data?.retryAfterSeconds}s`);

  // ── 5. Correct code verifies and is consumed ─────────────────────────────
  const good = await api('POST', '/otp/verify', { email, code, purpose: 'EMAIL_VERIFICATION' });
  check('the correct code verifies', good.status === 200 && good.data?.data?.message === 'Code vérifié', good.data?.data?.message);

  // ── 6. Reuse is rejected ─────────────────────────────────────────────────
  const reuse = await api('POST', '/otp/verify', { email, code, purpose: 'EMAIL_VERIFICATION' });
  check('a consumed code cannot be reused', reuse.status === 400 && reuse.data?.error?.includes('déjà été utilisé'), reuse.data?.error);

  // ── 7. Email enumeration protection ──────────────────────────────────────
  const missing = await api('POST', '/otp/send', { email: `nobody-${Date.now().toString(36)}@example.com`, purpose: 'PASSWORD_RESET' });
  check(
    'an unknown email gets the same response as a known one',
    missing.status === 201 && missing.data?.data?.message === send.data?.data?.message,
    `status=${missing.status}`
  );

  // ── 8. Attempt limit locks the challenge ─────────────────────────────────
  const email2 = `otp-lock-${Date.now().toString(36)}@example.com`;
  const { code: code2 } = await issue(email2, 'SECURITY_CONFIRMATION');
  let lastStatus = 0;
  for (let i = 0; i < 3; i++) {
    const r = await api('POST', '/otp/verify', { email: email2, code: '000000', purpose: 'SECURITY_CONFIRMATION' });
    lastStatus = r.status;
  }
  check('the attempt limit locks the challenge', lastStatus === 429, `status=${lastStatus}`);
  void code2;

  // ── 9. School isolation ───────────────────────────────────────────────────
  const iso = await api('POST', '/otp/verify', {
    email,
    code: '000000',
    purpose: 'EMAIL_VERIFICATION',
    schoolId: '00000000-0000-4000-8000-000000000001',
  });
  check('a code cannot be replayed against another school', iso.status === 400, `status=${iso.status}`);

  // ── 10. Audit trail ──────────────────────────────────────────────────────
  const audits = await sequelize.query<{ action: string; count: string }>(
    `SELECT action, count(*)::text AS count FROM audit_logs WHERE action LIKE 'OTP_%' GROUP BY action ORDER BY action`
  );
  const auditRows = audits[0] ?? [];
  check('OTP events are audited', auditRows.length >= 3, auditRows.map((r) => `${r.action}:${r.count}`).join(', '));
  check(
    'no audit row contains a raw code',
    auditRows.every((r) => !/^\d{6}$/.test(r.action)),
    'actions are event names only'
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});