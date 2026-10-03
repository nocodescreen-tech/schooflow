import fs from 'fs';
import path from 'path';

const root = path.resolve('src');
const src = fs.readFileSync(path.join(root, 'utils/moduleRegistry.ts'), 'utf8');

const blocks = src.split(/\n  \{\n/).slice(1);
const routeFiles = fs.readdirSync(path.join(root, 'routes')).map((f) => f.replace('.ts', ''));

const rows: Array<{ code: string; lifecycle: string; routes: string[]; nav: string[] }> = [];
for (const b of blocks) {
  const code = /code: '([a-z-]+)'/.exec(b)?.[1];
  if (!code) continue;
  const lifecycle = /lifecycle: '([a-z_]+)'/.exec(b)?.[1] ?? '?';
  const routesRaw = /routes: \[([^\]]*)\]/.exec(b)?.[1] ?? '';
  const routes = routesRaw.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  const navRaw = /nav: \[([\s\S]*?)\],\n/.exec(b)?.[1] ?? '';
  const nav = [...navRaw.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
  rows.push({ code, lifecycle, routes, nav });
}

console.log('route files :', routeFiles.sort().join(', '));
console.log('');
for (const r of rows) {
  const missing = r.routes.filter((d) => !routeFiles.includes(d));
  const flag = missing.length ? `  !! NON IMPLEMENTE: ${missing.join(', ')}` : '';
  if (missing.length || r.nav.length || r.lifecycle === 'coming_soon') {
    console.log(
      `${r.code.padEnd(18)} ${r.lifecycle.padEnd(12)} routes=[${r.routes.join(',')}] nav=[${r.nav.join(',')}]${flag}`
    );
  }
}