/**
 * Admissions & inscriptions state machine (§11, §12) against the real database.
 *
 * Proves the two invariants that matter:
 *   - deciding a dossier creates NOTHING;
 *   - enrolling is the single step that writes a students row, and it is
 *     refused unless the dossier was admitted and the class belongs to the
 *     dossier's academic year.
 *
 * Everything runs inside a throw-away school, dropped by cascade at the end.
 */
import sequelize from '../src/config/database.js';
import { School, User, AcademicYear, Class, Student, Enrollment } from '../src/models/index.js';
import {
  createDossier, updateDossier, submitDossier, decideDossier, reopenDossier,
  withdrawDossier, enrollDossier, enrollmentStats, nextMatricule, REQUIRED_DOCUMENTS,
} from '../src/services/EnrollmentService.js';
import { AppError } from '../src/middleware/errorHandler.js';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const year = 2026;
const yearName = `${year}-${year + 1}`;

async function expectError(name: string, fn: () => Promise<unknown>, status?: number) {
  try {
    await fn();
    check(name, false, 'aucune erreur levée');
  } catch (error) {
    const code = error instanceof AppError ? error.statusCode : 0;
    check(name, status ? code === status : true, `${code} ${(error as Error).message}`);
  }
}

async function main() {
  const suffix = Date.now().toString(36);
  const school = await School.create({
    name: `Enrollment Test ${suffix}`,
    slug: `enrollment-test-${suffix}`,
    code: `ENR-${suffix}`,
    currency: 'USD',
    phone: '+243000000000',
    address: 'test',
    city: 'Kinshasa',
    province: 'Kinshasa',
  } as never);

  const admin = await User.create({
    schoolId: school.id,
    name: 'regisseur',
    email: `regisseur.${suffix}@test.local`,
    passwordHash: 'x',
    role: 'director',
    status: 'active',
    isActive: true,
  } as never);

  const academicYear = await AcademicYear.create({
    schoolId: school.id,
    name: yearName,
    startDate: new Date(`${year}-09-01`),
    endDate: new Date(`${year + 1}-07-31`),
    status: 'active',
  });

  const otherYear = await AcademicYear.create({
    schoolId: school.id,
    name: `${year + 1}-${year + 2}`,
    startDate: new Date(`${year + 1}-09-01`),
    endDate: new Date(`${year + 2}-07-31`),
    status: 'closed',
  });

  const klass = await Class.create({
    schoolId: school.id,
    name: '5e A',
    academicYear: yearName,
    capacity: 40,
  });
  const wrongYearClass = await Class.create({
    schoolId: school.id,
    name: '6e A',
    academicYear: `${year + 1}-${year + 2}`,
    capacity: 40,
  });

  // ─── matricule is derived from real rows ───
  const first = await nextMatricule(school.id, academicYear.id);
  check('matricule uses the year of the academic year', first.matricule === `SCF-${year}-00001`, first.matricule);
  await Student.create({
    schoolId: school.id,
    studentId: first.matricule,
    firstName: 'already',
    lastName: 'there',
    classId: klass.id,
  } as never);
  const second = await nextMatricule(school.id, academicYear.id);
  check('matricule advances past an allocated number', second.matricule === `SCF-${year}-00002`, second.matricule);

  // ─── a dossier is a dossier, not a student ───
  const draft = await createDossier({
    schoolId: school.id,
    academicYearId: academicYear.id,
    requestedClassId: klass.id,
    firstName: 'Grace',
    lastName: 'Kalala',
    guardianName: 'M. Kalala',
    guardianPhone: '+243810000000',
    createdBy: admin.id,
  });
  check('a draft dossier is created', draft.status === 'draft', draft.status);
  check('a draft has a quotable reference', /^DOS-[A-Z0-9]{6}$/.test(draft.reference), draft.reference);
  check('a draft has no matricule yet', draft.matricule === null);
  check(
    'creating a dossier creates NO student',
    (await Student.count({ where: { schoolId: school.id, firstName: 'Grace' } })) === 0
  );

  // ─── filing a complete dossier ───
  const submitted = await submitDossier(school.id, draft.id);
  check('a complete dossier is filed', submitted.status === 'submitted', submitted.status);
  check('filing records the date', submitted.appliedAt !== null);
  check('re-filing is a no-op', (await submitDossier(school.id, draft.id)).status === 'submitted');

  // ─── submitting requires a contactable guardian ───
  const orphan = await createDossier({
    schoolId: school.id,
    academicYearId: academicYear.id,
    firstName: 'Sans',
    lastName: 'Tuteur',
    createdBy: admin.id,
  });
  await expectError('a dossier without a guardian cannot be filed', () => submitDossier(school.id, orphan.id), 400);

  // ─── a class from another year is refused ───
  await orphan.update({ guardianName: 'M. Tuteur', guardianEmail: `orph.${suffix}@test.local` });
  await submitDossier(school.id, orphan.id);
  await expectError(
    'cannot enrol into a class of another year',
    () => decideDossier(school.id, orphan.id, { decision: 'accepted', actorId: admin.id, requestedClassId: wrongYearClass.id }),
    400
  );
  check('a dossier survives a refused class', (await Enrollment.findByPk(orphan.id))!.status === 'submitted');

  // ─── deciding moves nothing ───
  const accepted = await decideDossier(school.id, draft.id, {
    decision: 'accepted',
    actorId: admin.id,
    requestedClassId: klass.id,
  });
  check('a dossier can be accepted', accepted.status === 'accepted', accepted.status);
  check('accepting stores the decision maker', accepted.decidedBy === admin.id);
  check('accepting creates NO student', (await Student.count({ where: { schoolId: school.id, firstName: 'Grace' } })) === 0);
  check('accepting assigns NO matricule yet', accepted.matricule === null);

  await expectError('a closed decision cannot be taken twice', () => decideDossier(school.id, draft.id, { decision: 'rejected', actorId: admin.id }), 409);

  // ─── rejection must be motivated ───
  const second_dossier = await createDossier({
    schoolId: school.id,
    academicYearId: academicYear.id,
    firstName: 'Refus',
    lastName: 'Test',
    guardianName: 'Tuteur',
    guardianEmail: `t.${suffix}@test.local`,
    createdBy: admin.id,
    submit: true,
  });
  await expectError(
    'a refusal must carry a reason',
    () => decideDossier(school.id, second_dossier.id, { decision: 'rejected', actorId: admin.id }),
    400
  );
  const rejected = await decideDossier(school.id, second_dossier.id, {
    decision: 'rejected',
    actorId: admin.id,
    note: 'Dossier incomplet',
  });
  check('a motivated refusal is recorded', rejected.status === 'rejected', rejected.status);
  check('the refusal keeps its reason', rejected.decisionNote === 'Dossier incomplet');
  await expectError('a refused dossier cannot be edited', () => updateDossier(school.id, second_dossier.id, { firstName: 'X' }), 409);

  // ─── waiting list positions come from the school's own list ───
  const w1 = await createDossier({
    schoolId: school.id, academicYearId: academicYear.id, firstName: 'Wait', lastName: 'One',
    guardianName: 'T', guardianEmail: 't@x.local', createdBy: admin.id, submit: true,
  });
  const wl1 = await decideDossier(school.id, w1.id, { decision: 'waitlisted', actorId: admin.id, requestedClassId: klass.id });
  check('the first waitlisted dossier is number 1', wl1.waitlistPosition === 1, String(wl1.waitlistPosition));

  const w2 = await createDossier({
    schoolId: school.id, academicYearId: academicYear.id, firstName: 'Wait', lastName: 'Two',
    guardianName: 'T', guardianEmail: 't2@x.local', createdBy: admin.id, submit: true,
  });
  const wl2 = await decideDossier(school.id, w2.id, { decision: 'waitlisted', actorId: admin.id, requestedClassId: klass.id });
  check('the second waitlisted dossier is number 2', wl2.waitlistPosition === 2, String(wl2.waitlistPosition));

  const reopened = await reopenDossier(school.id, w1.id);
  check('a waitlisted dossier can be reexamined', reopened.status === 'under_review', reopened.status);
  check('reopening clears the position', reopened.waitlistPosition === null);

  // ─── enrolling is the only thing that creates a student ───
  // Two numbers are already allocated in this school: SCF-2026-00001 (created
  // above) and whatever the waitlisted flow consumed — so the next free one is
  // read from the table, not guessed.
  const beforeEnroll = await nextMatricule(school.id, academicYear.id);
  const enrolled = await enrollDossier(school.id, draft.id, admin);
  check('enrolling allocates the next free matricule', enrolled.student.studentId === beforeEnroll.matricule, enrolled.student.studentId);
  check('the dossier keeps the matricule', enrolled.enrollment.matricule === enrolled.student.studentId);
  check('the dossier links to the student', enrolled.enrollment.studentId === enrolled.student.id);
  check('the dossier is now enrolled', enrolled.enrollment.status === 'enrolled');
  check('the student lands in the chosen class', enrolled.student.classId === klass.id);
  check('no account is created by default', enrolled.account === null && enrolled.activationCode === null);

  await expectError('a dossier cannot be enrolled twice', () => enrollDossier(school.id, draft.id, admin), 409);

  // ─── a waitlisted dossier must be admitted before it can be enrolled ───
  await expectError('a waitlisted dossier is not directly enrollable', () => enrollDossier(school.id, w2.id, admin), 409);
  const acceptedFromWaitlist = await decideDossier(school.id, w2.id, { decision: 'accepted', actorId: admin.id });
  check('a waitlisted dossier can be admitted later', acceptedFromWaitlist.status === 'accepted');
  check('admitting clears the waiting rank', acceptedFromWaitlist.waitlistPosition === 0, String(acceptedFromWaitlist.waitlistPosition));
  await expectError('a draft is not enrollable either', () => enrollDossier(school.id, orphan.id, admin), 409);

  // ─── account creation needs its own permission ───
  const noRight = { id: admin.id, role: 'teacher', schoolId: school.id };
  await expectError(
    'creating an account needs users.create_student',
    () => enrollDossier(school.id, w2.id, noRight, { createAccount: 'now' }),
    403
  );
  check('the dossier is still admitted after the refusal', (await Enrollment.findByPk(w2.id))!.status === 'accepted');

  // ─── withdrawal ───
  const withdrawn = await withdrawDossier(school.id, orphan.id);
  check('a dossier can be withdrawn', withdrawn.status === 'withdrawn', withdrawn.status);
  await expectError('a withdrawn dossier is final', () => withdrawDossier(school.id, orphan.id), 409);

  // ─── statistics come from the rows ───
  // Five dossiers exist at this point: enrolled, withdrawn, refused, reopened
  // (under_review) and admitted-from-waitlist.
  const stats = await enrollmentStats(school.id, academicYear.id);
  check('stats count every dossier', stats.total === 5, String(stats.total));
  check('stats count the refused', stats.byStatus.rejected === 1, String(stats.byStatus.rejected));
  check('stats count the in-instruction', stats.byStatus.under_review === 1, String(stats.byStatus.under_review));
  check('no dossier is still waiting', stats.byStatus.waitlisted === 0, String(stats.byStatus.waitlisted));
  check('stats count the admitted', stats.byStatus.accepted === 1, String(stats.byStatus.accepted));
  check('stats count the enrolled', stats.byStatus.enrolled === 1, String(stats.byStatus.enrolled));
  check('stats count the withdrawn', stats.byStatus.withdrawn === 1, String(stats.byStatus.withdrawn));
  check('no dossier is still a draft', stats.byStatus.draft === 0, String(stats.byStatus.draft));
  check('the sum of statuses equals the total', Object.values(stats.byStatus).reduce((a, b) => a + b, 0) === stats.total);
  check('no dossier has a complete file yet', stats.completeFiles === 0, String(stats.completeFiles));

  const completeDocs = Object.fromEntries(REQUIRED_DOCUMENTS.map((d) => [d.key, true]));
  await updateDossier(school.id, orphan.id, { documents: completeDocs }).catch(() => undefined);
  const withDocs = await createDossier({
    schoolId: school.id, academicYearId: academicYear.id, firstName: 'Dossier', lastName: 'Complet',
    guardianName: 'T', guardianEmail: 'd@x.local', documents: completeDocs, createdBy: admin.id,
  });
  const stats2 = await enrollmentStats(school.id, academicYear.id);
  check('a dossier with every document counts as complete', stats2.completeFiles === 1, String(stats2.completeFiles));
  check('the complete dossier is a draft', withDocs.status === 'draft');

  // ─── tenant isolation ───
  const otherSchool = await School.create({
    name: `Other ${suffix}`, slug: `other-enr-${suffix}`, code: `OEN-${suffix}`,
    currency: 'USD', phone: '+243000000000', address: 'x', city: 'x', province: 'x',
  } as never);
  const otherSchoolYear = await AcademicYear.create({
    schoolId: otherSchool.id,
    name: yearName,
    startDate: new Date(`${year}-09-01`),
    endDate: new Date(`${year + 1}-07-31`),
    status: 'active',
  });
  const foreign = await createDossier({
    schoolId: otherSchool.id, academicYearId: otherSchoolYear.id, firstName: 'Etranger', lastName: 'Test',
    createdBy: admin.id,
  });
  await expectError(
    'a dossier of another school is unreachable',
    () => updateDossier(otherSchool.id, draft.id, { firstName: 'X' }),
    404
  );
  await expectError(
    'a foreign decision cannot be taken',
    () => decideDossier(otherSchool.id, draft.id, { decision: 'accepted', actorId: admin.id }),
    404
  );
  check('the foreign dossier is untouched', (await Enrollment.findByPk(foreign.id))!.status === 'draft');

  // ─── cleanup ───
  const studentCount = await Student.count({ where: { schoolId: school.id } });
  await School.destroy({ where: { id: school.id } });
  await School.destroy({ where: { id: otherSchool.id } });
  check('the throw-away school is gone', (await School.count({ where: { id: school.id } })) === 0);
  check('its students are gone too', (await Student.count({ where: { schoolId: school.id } })) === 0);
  check('its dossiers are gone too', (await Enrollment.count({ where: { schoolId: school.id } })) === 0);
  console.log(`   (${studentCount} student row(s) were created by the test before cleanup)`);

  console.log(`\n${pass} passed, ${fail} failed`);
  await sequelize.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});