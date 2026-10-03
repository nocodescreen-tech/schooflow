/**
 * WCAG 2.2 contrast verifier for the SchoolFlow design tokens.
 *
 * The design system is only credible if its claims are checked. This script
 * parses `src/styles/tokens.css`, resolves every semantic colour for both
 * themes, and asserts the real WCAG ratios:
 *
 *   1.4.3  Contrast (Minimum), AA   — text ≥ 4.5:1, large text ≥ 3:1
 *   1.4.11 Non-text Contrast, AA   — UI boundaries & icons ≥ 3:1
 *   2.4.13 Focus Appearance        — focus ring ≥ 3:1 against its background
 *
 * It also re-verifies the OLD badge colours that were shipped before this
 * system existed, so the regression that motivated the change stays documented
 * rather than forgotten.
 *
 * Run: node scripts/check-contrast.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, '../src/styles/tokens.css');
const css = fs.readFileSync(cssPath, 'utf8');

// ─────────────────────────── colour maths ───────────────────────────

function parseHex(value) {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (full.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, unrounded: 2.999 must read as a failure. */
function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// ─────────────────────────── token parsing ───────────────────────────

/** Extract `--name: value;` declarations inside the given blocks. */
function readBlocks() {
  const light = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
  const dark = css.slice(css.indexOf('.dark {'));
  const primitives = light.slice(0, light.indexOf('3. SEMANTIC'));

  const grab = (src) => {
    const out = {};
    for (const m of src.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      out[m[1]] = m[2].trim();
    }
    return out;
  };
  return { primitives: grab(primitives), light: grab(light), dark: grab(dark) };
}

function resolve(map, name, seen = new Set()) {
  const raw = map[name];
  if (raw === undefined) return undefined;
  if (raw.startsWith('#')) return raw;
  const ref = raw.match(/^var\(--([a-z0-9-]+)\)$/i);
  if (!ref) return undefined;
  if (seen.has(ref[1])) return undefined;   // circular guard
  seen.add(ref[1]);
  return resolve({ ...map, ...primitivesRef(map) }, ref[1], seen);
}

// `resolve` needs access to the primitive layer for both themes.
let primitivesCache = {};
function primitivesRef(map) {
  return primitivesCache;
}

const blocks = readBlocks();
primitivesCache = blocks.primitives;

function colour(map, name) {
  const hex = resolve(map, name);
  if (!hex) return null;
  return parseHex(hex);
}

// ─────────────────────────── checks ───────────────────────────

let pass = 0;
let fail = 0;
const results = [];

function assert(label, fgName, bgName, map, min) {
  const fg = colour(map, fgName);
  const bg = colour(map, bgName);
  if (!fg || !bg) {
    fail++;
    console.log(`SKIP  ${label} :: token introuvable (${!fg ? fgName : bgName})`);
    return;
  }
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  ok ? pass++ : fail++;
  results.push({ label, ratio, min, theme: map === blocks.dark ? 'dark' : 'light' });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(
    `${mark}  ${(map === blocks.dark ? 'dark ' : 'light')}  ${label.padEnd(46)} ` +
      `${ratio.toFixed(2).padStart(6)}:1  (min ${min}:1)`
  );
}

// 1.4.3 — every text role against the surface it sits on (AA 4.5:1)
const TEXT_ON = [
  ['text', 'surface'],
  ['text-secondary', 'surface'],
  ['text-muted', 'surface'],
  ['text-subtle', 'surface'],
  ['text', 'surface-sunken'],
  ['text-muted', 'surface-hover'],
  ['text-placeholder', 'surface'],
  ['text-on-accent', 'accent'],
  ['text-on-inverse', 'surface-inverse'],
];

// 1.4.3 — status text on its own soft surface
const STATUS_ON_SOFT = [
  ['success-text', 'success-soft'],
  ['warning-text', 'warning-soft'],
  ['danger-text', 'danger-soft'],
  ['info-text', 'info-soft'],
];

// 1.4.3 — accent text used for links
const ACCENT_TEXT = [['accent-text', 'surface'], ['accent-text', 'surface-sunken']];

// 1.4.11 — UI boundaries must be distinguishable from their background (3:1)
// Note: borders are *supporting* contrast, not text, so the bar is 3:1.
const NON_TEXT = [
  ['accent', 'surface'],
  ['focus-ring', 'surface'],
  ['focus-ring', 'surface-hover'],
  ['danger', 'surface'],
  ['success', 'surface'],
];

for (const [theme, map] of [['light', blocks.light], ['dark', blocks.dark]]) {
  console.log(`\n───────── ${theme.toUpperCase()} ${'─'.repeat(58)}`);
  for (const [fg, bg] of TEXT_ON) assert(`${fg} on ${bg}`, fg, bg, map, 4.5);
  for (const [fg, bg] of STATUS_ON_SOFT) assert(`${fg} on ${bg}`, fg, bg, map, 4.5);
  for (const [fg, bg] of ACCENT_TEXT) assert(`${fg} on ${bg}`, fg, bg, map, 4.5);
  for (const [fg, bg] of NON_TEXT) assert(`${fg} on ${bg} (non-text)`, fg, bg, map, 3);
}

// ─────────────────────────── regression record ───────────────────────────
// Informational only: these are the values that were shipped before the token
// system existed. They are NOT counted in the pass/fail totals — the point is
// to keep the regression on record, not to fail the build on history.

console.log(`\n───────── AVANT SYSTÈME (badges historiques) ${'─'.repeat(28)}`);
const legacy = [
  ['badge-warning  #F59E0B / #FFFBEB', '#F59E0B', '#FFFBEB'],
  ['badge-success  #16A34A / #F0FDF4', '#16A34A', '#F0FDF4'],
  ['badge-danger   #DC2626 / #FEF2F2', '#DC2626', '#FEF2F2'],
  ['badge-info     #2563EB / #EFF6FF', '#2563EB', '#EFF6FF'],
];
for (const [label, fg, bg] of legacy) {
  const ratio = contrast(parseHex(fg), parseHex(bg));
  const ok = ratio >= 4.5;
  console.log(
    `${ok ? 'ok  ' : 'ÉCHEC'} legacy  ${label.padEnd(46)} ` +
      `${ratio.toFixed(2).padStart(6)}:1  ${ok ? '' : '← non conforme WCAG 1.4.3'}`
  );
}

// ─────────────────────────── summary ───────────────────────────

const worst = [...results].sort((a, b) => a.ratio - b.ratio).slice(0, 5);
console.log('\n─── 5 paires les plus serrées ───');
for (const r of worst) {
  console.log(`   ${r.theme.padEnd(5)} ${r.label.padEnd(46)} ${r.ratio.toFixed(2)}:1 (min ${r.min})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);