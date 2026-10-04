/**
 * CLI wrapper for the SchoolFlow consistency checker.
 *
 * Kept in a dedicated file so `ConsistencyChecker.ts` stays free of
 * `import.meta` (which ts-jest rejects when it compiles to CommonJS)
 * and free of import side effects. Run with:
 *
 *   npx tsx src/cli/consistency-check.ts [schoolId]
 */
import { main } from '../services/ConsistencyChecker.js';

void main();
