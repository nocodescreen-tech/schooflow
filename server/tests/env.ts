import dotenv from 'dotenv';
import path from 'path';

/**
 * Test bootstrap.
 *
 * This file runs BEFORE any application module is imported, so it is the only
 * place that can guarantee the test run cannot reach the development database.
 *
 * `tests/setup.ts` executes `DROP SCHEMA public CASCADE`. If `DB_NAME` were
 * ever resolved to `schoolflow` instead of `schoolflow_test`, running the test
 * suite would silently destroy a developer's working data. Dotenv does not
 * override variables that are already set, but relying on load order is a
 * fragile guarantee for something this destructive — so the name is asserted
 * here and re-asserted in setup.ts.
 */

function assertTestDatabase(): string {
  const name = process.env.DB_NAME ?? '';
  if (!/_test$/.test(name)) {
    throw new Error(
      `[tests] DB_NAME doit finir par « _test » (reçu : « ${name || '(vide)'} »). ` +
        `Les tests détruisent leur base ; ils ne doivent jamais cibler celle de développement.`
    );
  }
  return name;
}

process.env.NODE_ENV = 'test';
assertTestDatabase();

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Dotenv never overrides an existing variable, so re-asserting is a no-op in the
// normal case and a hard failure if a future config change ever tries to.
process.env.DB_NAME = assertTestDatabase();
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5433';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASS = process.env.DB_PASS ?? '';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.OTP_ENABLED = 'false';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '10000';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.API_RATE_LIMIT_MAX = '10000';