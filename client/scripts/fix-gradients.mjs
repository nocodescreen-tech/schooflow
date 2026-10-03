import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Replaces the removed decorative-gradient classes with the functional accent.
 *
 * `gradient-primary` / `gradient-text` were deleted from the component layer
 * because decorative gradients are forbidden (§2, §81). Every usage becomes the
 * flat accent, which is what the rule asks for: one functional accent, no
 * decorative colour transitions.
 *
 * Run: node scripts/fix-gradients.mjs [--dry]
 */
import process from 'node:process';

const dry = process.argv.includes('--dry');
const files = [
  'src/pages/Landing.tsx',
  'src/pages/Profile.tsx',
  'src/pages/Verify.tsx',
  'src/components/MarketingLayout.tsx',
];

const MAP = {
  'gradient-primary': 'bg-accent',
  'gradient-text': 'text-accent-text',
};

let changed = 0;
for (const file of files) {
  let src = readFileSync(file, 'utf8');
  const before = src;
  for (const [from, to] of Object.entries(MAP)) {
    src = src.split(from).join(to);
  }
  if (src !== before) {
    changed++;
    console.log(`${dry ? 'would change' : 'changed'}: ${file}`);
    if (!dry) writeFileSync(file, src, 'utf8');
  }
}
console.log(`\n${changed} file(s) updated${dry ? ' (dry run)' : ''}`);