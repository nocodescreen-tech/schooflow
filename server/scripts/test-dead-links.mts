/**
 * Cross-checks the two navigation sources so no link can be dead:
 *   1. every path in the central navigation has a React route,
 *   2. every React route under the /app layout appears in the central
 *      navigation (a detail page is covered by its parent).
 *
 * A mismatch in either direction is a bug: either a menu link that 404s, or a
 * page reachable by typing a URL while its menu entry is hidden.
 *
 * It also asserts that the sensitive pages are wrapped in a guard, because
 * hiding a menu entry is not a security control (§34).
 */
import fs from 'fs';
import path from 'path';

const serverRoot = path.resolve('src');
const clientRoot = path.resolve('../client/src');

const navSrc = fs.readFileSync(path.join(serverRoot, 'utils/navigation.ts'), 'utf8');
const navPaths = [...new Set([...navSrc.matchAll(/path: '([^']+)'/g)].map((m) => m[1]))].sort();

const appSrc = fs.readFileSync(path.join(clientRoot, 'App.tsx'), 'utf8');

// Only the children of the <Route path="/app"> element, i.e. up to the closing
// </Route> that matches it.
const layoutStart = appSrc.indexOf('<Route path="/app"');
const layoutEnd = appSrc.indexOf('\n      </Route>', layoutStart);
const routesSection = appSrc.slice(layoutStart, layoutEnd > 0 ? layoutEnd : undefined);

const appPaths = [...new Set(
  [...routesSection.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== 'index' && p !== '*' && p !== '/app')
    .map((p) => `/app/${p}`)
)].sort();

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

console.log(`central navigation : ${navPaths.length} paths`);
console.log(`react routes       : ${appPaths.length} paths\n`);

const deadLinks = navPaths.filter((p) => !appPaths.includes(p));
check('no navigation entry points to a missing page', deadLinks.length === 0, deadLinks.join(', '));

// A detail route (`students/:id`) is reachable because its parent is in the nav.
const covered = (p: string) => {
  const segments = p.split('/').filter((s) => s && !s.startsWith(':'));
  for (let i = segments.length; i > 0; i--) {
    const base = `/${segments.slice(0, i).join('/')}`;
    if (navPaths.includes(base)) return true;
  }
  return false;
};
const unreachable = appPaths.filter((p) => !covered(p));
check('no page exists outside the central navigation', unreachable.length === 0, unreachable.join(', '));

const routeElements = [...routesSection.matchAll(
  /<Route\s+path="([^"]+)"([\s\S]*?)\/>\s*(?=\n\s*<Route|\n\s*<\/Route>|$)/g
)];

// No route may be bare: every /app page must sit behind the <Guard> chain, so
// no page is reachable without rights (§80).
const bareRoutes = routeElements
  .filter(([, seg, body]) => seg !== '/app' && !/<Guard[\s>]/.test(body))
  .map(([, seg]) => seg);
check(
  'every app route is wrapped in <Guard>',
  bareRoutes.length === 0,
  bareRoutes.length ? bareRoutes.join(', ') : `${appPaths.length} routes, all guarded`
);

// The pages the spec calls out explicitly must also declare module/action, so
// disabling a module or removing a permission really closes the page.
const mustRefine = ['users', 'roles', 'settings', 'sessions', 'audit-logs', 'cash', 'import-export', 'enrollment', 'promotion'];
const notRefined = mustRefine.filter((seg) => {
  const route = routeElements.find(([, s]) => s === seg);
  if (!route) return true;
  const props = /<Guard([^>]*)>/.exec(route[2])?.[1] ?? '';
  return !/action=/.test(props);
});
check('sensitive pages declare their module/action', notRefined.length === 0, notRefined.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);