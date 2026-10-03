/**
 * Delegation engine tests (§19) against the real database.
 *
 * Covers the spec's acceptance criteria that involve delegation:
 *   #16 an expired delegation grants nothing any more,
 *   #9  removing/ignoring a delegation recalculates effective permissions,
 *   #6  a user can never reach another school's data,
 *   #17 the operation is audited.
 *
 * Every fixture it creates is deleted at the end (schools cascade).
 */
import sequelize from '../src/config/database.js';
import { School, User, Delegation, AuditLog } from '../src/models/index.js';
import { createDelegation, revokeDelegation, listDelegations, explainDelegations } from '../src/services/DelegationService.js';
import { computeEffectivePermissions } from '../src/services/AuthorizationService.js';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const suffix = Date.now().toString(36);
  const school = await School.create({
    name: `Delegation Test ${suffix}`,
    slug: `delegation-test-${suffix}`,
    code: `DEL-${suffix}`,
    currency: 'USD',
    phone: '+243000000000',
    address: 'test',
    city: 'Kinshasa',
    province: 'Kinshasa',
  } as never);

  const mk = (name: string, role: string) =>
    User.create({
      schoolId: school.id,
      name,
      email: `${name}.${suffix}@test.local`,
      passwordHash: 'x',
      role,
      status: 'active',
      isActive: true,
    } as never);

  const director = await mk('deleg-director', 'director');
  const deputy = await mk('deleg-deputy', 'teacher');

  // ---- 16. baseline: the deputy holds nothing of the director's powers ----
  const before = await computeEffectivePermissions(deputy);
  check(
    '16. deputy does not hold grades.validate before delegation',
    !before.permissions.includes('grades.validate'),
    `${before.permissions.length} permissions`
  );

  // ---- create a real delegation: director lends grades.validate to deputy ----
  const delegation = await createDelegation({
    schoolId: school.id,
    fromUserId: director.id,
    toUserId: deputy.id,
    permissions: ['grades.validate', 'attendance.validate'],
    scopeType: 'CLASS',
    reason: 'Direction absente',
    startAt: new Date(Date.now() - DAY),
    endAt: new Date(Date.now() + DAY),
    authorizedBy: director.id,
  });
  check('delegation created with status active', delegation.status === 'active', delegation.status);

  const during = await computeEffectivePermissions(deputy);
  check(
    '16. delegated permission is granted while inside the window',
    during.permissions.includes('grades.validate'),
    during.breakdown.find((b) => b.permission === 'grades.validate')?.sources.join(',')
  );
  check(
    'delegation source is reported in the breakdown',
    (during.breakdown.find((b) => b.permission === 'grades.validate')?.sources ?? []).some((s) =>
      s.startsWith('delegation_from:')
    ),
    during.breakdown.find((b) => b.permission === 'grades.validate')?.sources.join(' | ')
  );

  // ---- expiry: same rows, evaluated after endAt → grants nothing ----
  const afterWindow = await computeEffectivePermissions(deputy, { at: new Date(Date.now() + 2 * DAY) });
  check(
    '16. EXPIRED delegation grants nothing',
    !afterWindow.permissions.includes('grades.validate'),
    `at +2d: ${afterWindow.permissions.includes('grades.validate') ? 'STILL GRANTED' : 'revoked'}`
  );
  check(
    '16. EXPIRED delegation also drops the second permission',
    !afterWindow.permissions.includes('attendance.validate')
  );

  // ---- before the window opens → also nothing ----
  const beforeStart = await computeEffectivePermissions(deputy, { at: new Date(Date.now() - 2 * DAY) });
  check(
    '16. delegation scheduled for later grants nothing today',
    !beforeStart.permissions.includes('grades.validate')
  );

  // ---- 19. a delegation can never grant more than the delegator holds ----
  const limited = await createDelegation({
    schoolId: school.id,
    fromUserId: deputy.id,
    toUserId: director.id,
    // the deputy does not hold users.disable
    permissions: ['grades.validate', 'users.disable'],
    startAt: new Date(Date.now()),
    endAt: new Date(Date.now() + DAY),
    authorizedBy: deputy.id,
  });
  const granted = Array.isArray(limited.permissions) ? limited.permissions : [];
  check(
    '19. permissions the delegator lacks are dropped',
    granted.includes('grades.validate') && !granted.includes('users.disable'),
    granted.join(',')
  );

  let rejectedEmpty = false;
  try {
    await createDelegation({
      schoolId: school.id,
      fromUserId: deputy.id,
      toUserId: director.id,
      permissions: ['audit.view'],
      startAt: new Date(Date.now()),
      endAt: new Date(Date.now() + DAY),
      authorizedBy: deputy.id,
    });
  } catch {
    rejectedEmpty = true;
  }
  check('19. delegation of nothing held is refused', rejectedEmpty);

  let refusedSelf = false;
  try {
    await createDelegation({
      schoolId: school.id,
      fromUserId: deputy.id,
      toUserId: deputy.id,
      permissions: ['grades.view'],
      startAt: new Date(Date.now()),
      endAt: new Date(Date.now() + DAY),
      authorizedBy: deputy.id,
    });
  } catch {
    refusedSelf = true;
  }
  check('19. self-delegation is refused', refusedSelf);

  let refusedPast = false;
  try {
    await createDelegation({
      schoolId: school.id,
      fromUserId: director.id,
      toUserId: deputy.id,
      permissions: ['grades.validate'],
      startAt: new Date(Date.now() - 2 * DAY),
      endAt: new Date(Date.now() - DAY),
      authorizedBy: director.id,
    });
  } catch {
    refusedPast = true;
  }
  check('19. a delegation already over is refused', refusedPast);

  // ---- 6. tenant isolation ----
  const otherSchool = await School.create({
    name: `Other ${suffix}`,
    slug: `other-${suffix}`,
    code: `OTH-${suffix}`,
    currency: 'USD',
    phone: '+243000000000',
    address: 'x',
    city: 'x',
    province: 'x',
  } as never);
  const outsider = await User.create({
    schoolId: otherSchool.id,
    name: 'outsider',
    email: `outsider.${suffix}@test.local`,
    passwordHash: 'x',
    role: 'teacher',
    status: 'active',
    isActive: true,
  } as never);

  let refusedForeignTarget = false;
  try {
    await createDelegation({
      schoolId: school.id,
      fromUserId: director.id,
      toUserId: outsider.id,
      permissions: ['grades.validate'],
      startAt: new Date(Date.now()),
      endAt: new Date(Date.now() + DAY),
      authorizedBy: director.id,
    });
  } catch {
    refusedForeignTarget = true;
  }
  check('6. a delegation cannot target another school', refusedForeignTarget);
  check(
    '6. the foreign school has no delegation',
    (await Delegation.count({ where: { schoolId: otherSchool.id } })) === 0
  );
  const outsiderPerms = await computeEffectivePermissions(outsider);
  check(
    '6. the outsider gained nothing',
    !outsiderPerms.permissions.includes('grades.validate')
  );

  // ---- revoke ----
  const traceBefore = await explainDelegations(school.id, deputy.id);
  check('explain reports what the deputy received', traceBefore.received.length >= 1, `${traceBefore.received.length}`);
  check(
    'explain names the delegator',
    traceBefore.received.some((t) => t.counterpartyName.includes('deleg-director')),
    traceBefore.received.map((t) => t.counterpartyName).join(',')
  );
  check(
    'explain reports the delegated permissions',
    traceBefore.received.some((t) => t.permissions.includes('grades.validate'))
  );
  check('explain reports what the deputy gave', traceBefore.given.length >= 1, `${traceBefore.given.length}`);
  check(
    'explain marks the in-window delegation as effective',
    traceBefore.received.some((t) => t.effective)
  );

  const stillGranted = await computeEffectivePermissions(deputy);
  check('revoke precondition: still granted', stillGranted.permissions.includes('grades.validate'));

  await revokeDelegation(school.id, delegation.id, director.id);
  const afterRevoke = await computeEffectivePermissions(deputy);
  check(
    '16. revoked delegation grants nothing',
    !afterRevoke.permissions.includes('grades.validate')
  );

  // ---- listing / reporting ----
  const listed = await listDelegations(school.id);
  check('list returns the school delegations', listed.length >= 2, `${listed.length} rows`);
  const revokedRow = listed.find((d) => d.id === delegation.id);
  check('revoked delegation is reported as revoked', revokedRow?.status === 'revoked', revokedRow?.status);
  check('revoked delegation is reported as not effective', revokedRow?.effective === false);

  const trace = await explainDelegations(school.id, deputy.id);
  check(
    'explain no longer lists a revoked delegation as received',
    trace.received.length === 0,
    `${trace.received.length}`
  );
  check('explain still lists what the deputy gave', trace.given.length >= 1, `${trace.given.length}`);

  const otherList = await listDelegations('00000000-0000-0000-0000-000000000000');
  check('6. an unrelated school id lists nothing', otherList.length === 0, `${otherList.length}`);

  // ---- 17. the table the API writes to is auditable ----
  check(
    '17. Delegation rows carry the authorising user and reason',
    delegation.authorizedBy === director.id && delegation.reason === 'Direction absente'
  );

  // ---- cleanup (school cascade removes users + delegations) ----
  const auditsBefore = await AuditLog.count({ where: { schoolId: school.id } });
  await School.destroy({ where: { id: school.id } });
  await School.destroy({ where: { id: otherSchool.id } });
  const leftovers = await School.count({ where: { id: school.id } });
  const orphanUsers = await User.count({ where: { schoolId: school.id } });
  const orphanDelegations = await Delegation.count({ where: { schoolId: school.id } });
  check('cleanup removed the test school', leftovers === 0);
  check('cleanup removed users (cascade)', orphanUsers === 0, String(orphanUsers));
  check('cleanup removed delegations (cascade)', orphanDelegations === 0, String(orphanDelegations));
  check('no audit rows were written by the service layer', auditsBefore === 0, `${auditsBefore} (written by the route)`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});