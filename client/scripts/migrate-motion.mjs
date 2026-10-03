import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migrates `framer-motion` imports to `motion/react`.
 *
 * The project carries both `framer-motion@11` and `motion@13`. Motion is the
 * current name of the same library, and having both installed means shipping
 * two copies of the same runtime. `motion/react` is the supported entry point,
 * so this is a mechanical import swap with no behavioural change.
 *
 * Run: node scripts/migrate-motion.mjs [--dry]
 */
import process from 'node:process';

const dry = process.argv.includes('--dry');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk('src');
let changed = 0;
let total = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes("from 'framer-motion'") && !src.includes('from "framer-motion"')) continue;

  // Only the module specifier changes; named imports are identical because
  // motion/react re-exports the whole React API.
  const next = src.replace(/from (['"])framer-motion\1/g, "from 'motion/react'");
  total += 1;
  changed += 1;
  console.log(`${dry ? 'would change' : 'changed'}: ${file}`);
  if (!dry) writeFileSync(file, next, 'utf8');
}

console.log(`\n${changed}/${total} files updated${dry ? ' (dry run)' : ''}`);