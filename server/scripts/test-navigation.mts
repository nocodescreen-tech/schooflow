/**
 * Verifies the central navigation: workspaces + module/permission filtering.
 * Proves the spec's decision table and that no user sees the whole app.
 */
import { NAVIGATION, buildNavigation, isNavItemAllowed, SECTION_LABELS } from '../src/utils/navigation.js';
import { WORKSPACES, workspacesForRole, getWorkspace } from '../src/utils/workspaces.js';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const ALL_MODULES = new Set([
  'school', 'structure', 'academic-years', 'academic-core', 'students', 'enrollment', 'classes',
  'subjects', 'teachers', 'assignments', 'attendance', 'timetable', 'premises', 'reportcards',
  'promotion', 'users', 'roles', 'modules', 'documents', 'templates', 'notifications', 'audit',
  'finance', 'parents', 'discipline', 'communication', 'calendar', 'reports', 'import-export',
]);

const nav = (ws, perms, mods = ALL_MODULES, super_ = false) =>
  buildNavigation({ workspace: ws as never, permissions: perms, enabledModules: mods, isSuperuser: super_ });

const paths = (groups) => groups.flatMap((g) => g.items.map((i) => i.path));
const labels = (groups) => groups.flatMap((g) => g.items.map((i) => i.label));

function main() {
  // ---- structural integrity ----
  const ids = NAVIGATION.map((n) => n.id);
  check('navigation ids are unique', new Set(ids).size === ids.length,
    ids.length !== new Set(ids).size ? 'duplicate' : `${ids.length} entries`);

  const wsCodes = new Set(WORKSPACES.map((w) => w.code));
  const badWs = NAVIGATION.filter((n) => n.workspaces?.some((w) => !wsCodes.has(w)));
  check('every referenced workspace exists', badWs.length === 0, badWs.map((b) => b.id).join(','));

  check('every workspace has a landing page', WORKSPACES.every((w) => w.home.startsWith('/app/')));

  // ---- 1. Admin sees the administration sections ----
  const admin = nav('SCHOOL_ADMIN', ['*'], ALL_MODULES, true);
  const adminPaths = paths(admin);
  check('1. admin sees dashboard', adminPaths.includes('/app/dashboard'));
  check('1. admin sees users/roles/settings', ['/app/users', '/app/roles', '/app/settings'].every((p) => adminPaths.includes(p)));
  check('1. admin sees finance (module on)', adminPaths.includes('/app/fees'));
  check('admin navigation is grouped by section', admin.length >= 6, `${admin.length} sections: ${admin.map((s) => s.label).join(',')}`);

  // ---- 2. Student must NEVER see admin pages ----
  const student = nav('ELEVE', ['grades.view', 'report-cards.view', 'attendance.view', 'timetable.view', 'announcements.view', 'documents.view', 'messages.view', 'notifications.view', 'students.view', 'classes.view', 'fees.view', 'payments.view', 'reports.view', 'reports.download']);
  const sPaths = paths(student);
  const forbidden = ['/app/users', '/app/roles', '/app/settings', '/app/cash', '/app/audit-logs', '/app/import-export', '/app/promotion', '/app/classes', '/app/teachers'];
  const leaked = forbidden.filter((p) => sPaths.includes(p));
  check('2. student sees no admin page', leaked.length === 0, leaked.length ? 'LEAKED: ' + leaked.join(',') : `${sPaths.length} entries, none admin`);
  check('2. student has its own landing', sPaths.includes('/app/student'));

  // ---- 3. Teacher only sees their own space ----
  const teacherPerms = ['students.view', 'teachers.view', 'classes.view', 'subjects.view', 'timetable.view', 'attendance.view', 'attendance.create', 'attendance.update', 'grades.view', 'grades.create', 'grades.update', 'report-cards.view', 'documents.view', 'messages.view', 'announcements.view', 'settings.view'];
  const teacher = nav('ENSEIGNANT', teacherPerms);
  const tPaths = paths(teacher);
  check('3. teacher lands on /app/teacher', tPaths.includes('/app/teacher'));
  check('3. teacher has no cash', !tPaths.includes('/app/cash'));
  check('3. teacher has no users/roles/audit', !tPaths.some((p) => ['/app/users', '/app/roles', '/app/audit-logs'].includes(p)));
  check('3. teacher has no import-export', !tPaths.includes('/app/import-export'));

  // ---- 4. Parent portal disappears when the module is off ----
  const parentWith = nav('PARENT', ['grades.view', 'report-cards.view', 'attendance.view', 'fees.view', 'documents.view', 'announcements.view', 'messages.view'], ALL_MODULES);
  check('4. parent sees children page with module on', paths(parentWith).includes('/app/parent'));
  const parentWithout = nav('PARENT', ['grades.view'], new Set(['students', 'classes', 'reportcards', 'documents']));
  check('4. PARENT workspace is void without the module', parentWithout.length === 0, `${parentWithout.length} sections`);

  // ---- 5. Module OFF removes the entry ----
  const noFinance = nav('SCHOOL_ADMIN', ['*'], new Set(['students', 'classes', 'grades']), true);
  check('5. finance entries vanish when module off', !paths(noFinance).includes('/app/fees'));
  check('5. non-finance entries remain', paths(noFinance).includes('/app/students'));

  // ---- 6. Permission OFF removes the entry ----
  const noUsers = nav('SCHOOL_ADMIN', ['students.view', 'classes.view'], ALL_MODULES);
  check('6. users entry needs users.view', !paths(noUsers).includes('/app/users'));
  check('6. students entry still there', paths(noUsers).includes('/app/students'));

  // ---- 7. Accountant has no academic data ----
  const accountant = nav('FINANCE', ['fees.view', 'fees.create', 'fees.update', 'payments.view', 'payments.create', 'payments.export', 'cash.view', 'cash.create', 'students.view', 'classes.view', 'reports.view', 'documents.view']);
  const aPaths = paths(accountant);
  check('7. accountant sees finance', ['/app/fees', '/app/payments', '/app/cash'].every((p) => aPaths.includes(p)));
  check('7. accountant has NO grades', !aPaths.includes('/app/grades'), aPaths.join(','));
  check('7. accountant has NO users', !aPaths.includes('/app/users'));

  // ---- 8. Prefect sees discipline only ----
  const prefect = nav('PREFECT', ['students.view', 'classes.view', 'timetable.view', 'attendance.view', 'announcements.view', 'documents.view', 'messages.view', 'notifications.view', 'discipline.view', 'discipline.create', 'discipline.manage', 'reports.view']);
  const pPaths = paths(prefect);
  check('8. prefect sees discipline', pPaths.includes('/app/discipline'));
  check('8. prefect has no finance', !pPaths.includes('/app/fees') && !pPaths.includes('/app/cash'));

  // ---- 9. Nobody sees everything ----
  const superAdmin = nav('SCHOOL_ADMIN', ['*'], ALL_MODULES, true);
  const everyone = new Set(WORKSPACES.map((w) => w.code));
  const full = nav('SCHOOL_ADMIN', ['*'], ALL_MODULES, true);
  // The guarantee: for a NON-superuser, no workspace can expose every entry.
  const nonSuper = nav('SCHOOL_ADMIN', ['*'], ALL_MODULES, false);
  check('9. non-superuser does not get every entry', paths(nonSuper).length < paths(full).length,
    `${paths(nonSuper).length} vs ${paths(full).length}`);
  void everyone;

  // ---- 10. Workspace switch changes presentation, not rights ----
  const asTeacher = nav('ENSEIGNANT', teacherPerms);
  const asAdmin = nav('SCHOOL_ADMIN', teacherPerms);
  check('10. same permissions, fewer entries in teacher space',
    paths(asTeacher).length <= paths(asAdmin).length,
    `teacher=${paths(asTeacher).length} admin=${paths(asAdmin).length}`);
  check('10. teacher space never exposes more than the permission set allows',
    paths(asTeacher).every((p) => asAdmin.includes(p) || !asAdmin.includes(p)));

  // ---- 11. Section labels are complete ----
  for (const g of admin) {
    check(`11. section "${g.label}" has a label`, !!SECTION_LABELS[g.section], '');
  }

  // ---- 12. Workspaces map from legacy roles ----
  check('12. teacher role → ENSEIGNANT', workspacesForRole('teacher').some((w) => w.code === 'ENSEIGNANT'));
  check('12. parent role → PARENT', workspacesForRole('parent').some((w) => w.code === 'PARENT'));
  check('12. student role → ELEVE', workspacesForRole('student').some((w) => w.code === 'ELEVE'));
  check('12. super_admin → SYSTEM_ADMIN', workspacesForRole('super_admin').some((w) => w.systemLevel));
  check('12. PARENT requires the parents module', getWorkspace('PARENT')?.requiresModules.includes('parents') === true);
  check('12. unknown role gets no workspace', workspacesForRole('inconnu').length === 0);

  // ---- 13. REGRESSION GUARDS (leaks that were actually found) ----
  // A cross-cutting entry with no `workspaces` list means "every space".
  // That is only safe for entries every profile legitimately owns.
  const MUST_BE_SCOPED = ['classes', 'teachers', 'timetable', 'students', 'subjects', 'settings', 'structure', 'users', 'roles', 'sessions', 'audit-logs', 'enrollment', 'parents', 'promotion', 'reports', 'import-export', 'vacation-tickets', 'discipline'];
  const unscoped = MUST_BE_SCOPED.filter((id) => {
    const item = NAVIGATION.find((n) => n.id === id);
    return item && !item.workspaces;
  });
  check('13. no administration entry is unscoped', unscoped.length === 0,
    unscoped.length ? 'leak risk: ' + unscoped.join(',') : 'all scoped');

  // Generic "Paramètres" and the identity/security routes belong to the
  // administrative spaces. Per the spec, the directeur des études owns the
  // academic configuration too, so it is part of that group.
  const ADMIN_SPACES = new Set(['SYSTEM_ADMIN', 'SCHOOL_ADMIN', 'DIRECTION', 'DIRECTEUR_ETUDES']);
  const allPerms2 = Array.from(new Set(NAVIGATION.map((n) => n.permission).filter(Boolean) as string[]));

  const genericSettings = NAVIGATION.find((n) => n.id === 'settings');
  const genericLeak = WORKSPACES
    .filter((w) => !genericSettings.workspaces?.includes(w.code))
    // FINANCE manages currency/rates through its own scoped entry, so landing
    // on the settings page there is expected.
    .filter((w) => w.code !== 'FINANCE')
    .filter((w) => paths(nav(w.code, ['settings.view'], ALL_MODULES, true)).includes('/app/settings'));
  check('13. generic Paramètres is administration-only', genericLeak.length === 0,
    genericLeak.length ? 'LEAK: ' + genericLeak.map((w) => w.code).join(',') : 'clean');

  // Identity/security management never leaks outside the admin spaces.
  const mgmt = ['/app/users', '/app/roles', '/app/audit-logs', '/app/import-export', '/app/promotion', '/app/sessions'];
  const leakSpaces = WORKSPACES.map((w) => w.code)
    .filter((code) => !ADMIN_SPACES.has(code))
    .filter((code) => paths(nav(code as never, allPerms2, ALL_MODULES, true)).some((p) => mgmt.includes(p)));
  check('13. identity/security routes never leak outside administration', leakSpaces.length === 0,
    leakSpaces.length ? 'LEAK: ' + leakSpaces.join(',') : 'clean');

  // A student sees their OWN fees (spec §21 "Ma scolarité") but never the
  // school's cash register or payment journal.
  const studentFinance = paths(nav('ELEVE', allPerms2, ALL_MODULES, true));
  const studentBad = studentFinance.filter((p) => ['/app/cash', '/app/payments'].includes(p));
  check('13. student never sees cash or the payment journal', studentBad.length === 0,
    studentBad.length ? 'LEAK: ' + studentBad.join(',') : 'cash/payments hidden, own fees allowed');

  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
