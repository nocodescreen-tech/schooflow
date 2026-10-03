import { QueryTypes } from 'sequelize';
import sequelize from './config/database.js';
import { School, User, Student, Class, Subject, Grade, Attendance, Fee, Payment, ReportCard, Notification } from './models/index.js';
import bcrypt from 'bcryptjs';

/**
 * Guard against destroying real data.
 *
 * `seed()` calls `sequelize.sync({ force: true })`, which DROPS every table. It
 * also runs at import time, so merely importing this module from a script is
 * enough to wipe the target database. That is unacceptable for a tool that
 * looks harmless, so the destruction only happens when the operator has
 * explicitly asked for it.
 */
async function assertDestructionIsAllowed(): Promise<void> {
  const dbName = sequelize.config.database as string;

  if (process.argv.includes('--force')) {
    console.warn(`⚠  --force : destruction de la base « ${dbName} » autorisée.`);
    return;
  }

  // How much is actually at stake?
  let rows = 0;
  try {
    const [result] = await sequelize.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM schools`,
      { type: QueryTypes.SELECT }
    );
    rows = result?.n ?? 0;
  } catch {
    // No schools table yet: nothing to lose.
    return;
  }

  if (rows === 0) return;

  console.error(
    [
      '',
      '  REFUS : le seed détruirait des données existantes.',
      '',
      `  Base ciblée : ${dbName}`,
      `  Établissements présents : ${rows}`,
      '',
      '  Cette commande fait « DROP TABLE » sur toutes les tables.',
      '  Pour repartir d’une base vide, relancez explicitement :',
      '',
      '      npm run seed -- --force',
      '',
    ].join('\n')
  );
  process.exit(1);
}

async function seed() {
  await assertDestructionIsAllowed();

  console.log('Syncing database...');
  await sequelize.sync({ force: true });
  console.log('Database synced.');

  // Create school
  // No `plan` field: SchoolFlow is not a SaaS and has no subscription tiers.
  const school = await School.create({
    name: 'École Internationale de Matadi',
    slug: 'ecole-internationale-matadi',
    currency: 'USD',
    phone: '+243 812 345 678',
    address: '123 Avenue de la Paix, Matadi, RDC',
  });
  console.log('School created:', school.name);

  // Create users
  const passwordHash = await bcrypt.hash('password123', 12);

  const admin = await User.create({
    schoolId: school.id,
    email: 'admin@schoolflow.com',
    passwordHash,
    name: 'Admin Principal',
    role: 'admin',
    phone: '+243 812 345 678',
  });

  const director = await User.create({
    schoolId: school.id,
    email: 'director@schoolflow.com',
    passwordHash,
    name: 'Dr. Marie Lukusa',
    role: 'director',
    phone: '+243 812 345 679',
  });

  const teacher1 = await User.create({
    schoolId: school.id,
    email: 'teacher1@schoolflow.com',
    passwordHash,
    name: 'Prof. Jean Bismarck',
    role: 'teacher',
    phone: '+243 812 345 680',
  });

  const teacher2 = await User.create({
    schoolId: school.id,
    email: 'teacher2@schoolflow.com',
    passwordHash,
    name: 'Prof. Sarah Mbuyi',
    role: 'teacher',
    phone: '+243 812 345 681',
  });

  const teacher3 = await User.create({
    schoolId: school.id,
    email: 'teacher3@schoolflow.com',
    passwordHash,
    name: 'Prof. Patrick Nzinga',
    role: 'teacher',
    phone: '+243 812 345 682',
  });

  const accountant = await User.create({
    schoolId: school.id,
    email: 'accountant@schoolflow.com',
    passwordHash,
    name: 'Comptable Anna',
    role: 'accountant',
    phone: '+243 812 345 683',
  });

  console.log('Users created.');

  // Create classes
  const class1 = await Class.create({ schoolId: school.id, name: '6e A', level: '6e', section: 'A', capacity: 40, teacherId: teacher1.id, academicYear: '2025-2026' });
  const class2 = await Class.create({ schoolId: school.id, name: '6e B', level: '6e', section: 'B', capacity: 40, teacherId: teacher2.id, academicYear: '2025-2026' });
  const class3 = await Class.create({ schoolId: school.id, name: '5e A', level: '5e', section: 'A', capacity: 35, teacherId: teacher3.id, academicYear: '2025-2026' });
  const class4 = await Class.create({ schoolId: school.id, name: '5e B', level: '5e', section: 'B', capacity: 35, teacherId: teacher1.id, academicYear: '2025-2026' });
  console.log('Classes created.');

  // Create subjects
  const subjects = await Subject.bulkCreate([
    { schoolId: school.id, name: 'Mathématiques', code: 'MATH', coefficient: 4, teacherId: teacher1.id, classId: class1.id },
    { schoolId: school.id, name: 'Français', code: 'FR', coefficient: 3, teacherId: teacher2.id, classId: class1.id },
    { schoolId: school.id, name: 'Anglais', code: 'ANG', coefficient: 2, teacherId: teacher3.id, classId: class1.id },
    { schoolId: school.id, name: 'Sciences', code: 'SCI', coefficient: 3, teacherId: teacher1.id, classId: class2.id },
    { schoolId: school.id, name: 'Histoire', code: 'HIST', coefficient: 2, teacherId: teacher2.id, classId: class2.id },
    { schoolId: school.id, name: 'Géographie', code: 'GEO', coefficient: 2, teacherId: teacher3.id, classId: class3.id },
  ]);
  console.log('Subjects created.');

  // Create students with African names
  const studentNames = [
    { firstName: 'Amina', lastName: 'Mbuyi', gender: 'F' },
    { firstName: 'Blaise', lastName: 'Lukusa', gender: 'M' },
    { firstName: 'Chantal', lastName: 'Nzinga', gender: 'F' },
    { firstName: 'David', lastName: 'Kabongo', gender: 'M' },
    { firstName: 'Esther', lastName: 'Mwamba', gender: 'F' },
    { firstName: 'Franck', lastName: 'Bopeto', gender: 'M' },
    { firstName: 'Grace', lastName: 'Luzolo', gender: 'F' },
    { firstName: 'Hervé', lastName: 'Makiese', gender: 'M' },
    { firstName: 'Irène', lastName: 'Bokamba', gender: 'F' },
    { firstName: 'Joseph', lastName: 'Luntadila', gender: 'M' },
    { firstName: 'Karine', lastName: 'Mabiala', gender: 'F' },
    { firstName: 'Léon', lastName: 'Bakandza', gender: 'M' },
    { firstName: 'Monique', lastName: 'Samba', gender: 'F' },
    { firstName: 'Nathalie', lastName: 'Kabeya', gender: 'F' },
    { firstName: 'Olivier', lastName: 'Mukendi', gender: 'M' },
    { firstName: 'Patricia', lastName: 'Lumengo', gender: 'F' },
    { firstName: 'Quentin', lastName: 'Bokanga', gender: 'M' },
    { firstName: 'Rachel', lastName: 'Mukuna', gender: 'F' },
    { firstName: 'Samuel', lastName: 'Lukoki', gender: 'M' },
    { firstName: 'Thérèse', lastName: 'Bokamba', gender: 'F' },
  ];

  const classes = [class1, class2, class3, class4];
  const students = [];

  for (let i = 0; i < studentNames.length; i++) {
    const name = studentNames[i];
    const classObj = classes[i % classes.length];
    const student = await Student.create({
      schoolId: school.id,
      studentId: `SCH-${String(i + 1).padStart(5, '0')}`,
      firstName: name.firstName,
      lastName: name.lastName,
      gender: name.gender,
      dateOfBirth: new Date(2010 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      classId: classObj.id,
      parentName: `Parent ${name.firstName}`,
      parentPhone: `+243 8${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      parentEmail: `parent${i + 1}@example.com`,
      status: 'active',
      enrollmentDate: new Date('2025-09-01'),
    });
    students.push(student);
  }
  console.log('Students created:', students.length);

  // Create grades for each student
  const examTypes = ['assignment', 'test', 'exam'];
  const examNames = ['Devoir 1', 'Devoir 2', 'Examen 1', 'Examen 2'];
  let gradeCount = 0;

  for (const student of students) {
    const classObj = classes.find((c) => c.id === student.classId)!;
    const classSubjects = subjects.filter((s) => s.classId === classObj.id);

    for (const subject of classSubjects) {
      for (let term = 1; term <= 2; term++) {
        for (let e = 0; e < 3; e++) {
          const score = Math.round((Math.random() * 10 + 8) * 100) / 100;
          await Grade.create({
            schoolId: school.id,
            studentId: student.id,
            subjectId: subject.id,
            examType: examTypes[e % examTypes.length],
            examName: examNames[e % examNames.length],
            score: Math.min(score, 20),
            coefficient: 1,
            term,
            academicYear: '2025-2026',
            date: new Date(2025, 9 + term, e * 10 + 1),
          });
          gradeCount++;
        }
      }
    }
  }
  console.log('Grades created:', gradeCount);

  // Create attendance for last 30 days
  let attendanceCount = 0;
  const statuses = ['present', 'present', 'present', 'present', 'present', 'present', 'present', 'present', 'absent', 'late'];

  for (let day = 0; day < 30; day++) {
    const date = new Date();
    date.setDate(date.getDate() - day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    for (const student of students) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      await Attendance.create({
        schoolId: school.id,
        studentId: student.id,
        classId: student.classId,
        date,
        status,
      });
      attendanceCount++;
    }
  }
  console.log('Attendance records created:', attendanceCount);

  // Create fees for each student
  let feeCount = 0;
  for (const student of students) {
    const fees = await Fee.bulkCreate([
      { schoolId: school.id, studentId: student.id, type: 'tuition', amount: 300, dueDate: new Date('2025-09-15'), status: 'paid', academicYear: '2025-2026', term: 1 },
      { schoolId: school.id, studentId: student.id, type: 'tuition', amount: 300, dueDate: new Date('2025-12-15'), status: 'partial', academicYear: '2025-2026', term: 2 },
      { schoolId: school.id, studentId: student.id, type: 'transport', amount: 100, dueDate: new Date('2025-09-15'), status: 'paid', academicYear: '2025-2026', term: 1 },
      { schoolId: school.id, studentId: student.id, type: 'canteen', amount: 150, dueDate: new Date('2025-10-01'), status: 'pending', academicYear: '2025-2026', term: 1 },
    ]);
    feeCount += fees.length;
  }
  console.log('Fees created:', feeCount);

  // Create payments
  let paymentCount = 0;
  for (const student of students.slice(0, 15)) {
    const payments = await Payment.bulkCreate([
      { schoolId: school.id, studentId: student.id, amount: 300, method: 'transfer', reference: `PAY-${String(paymentCount + 1).padStart(5, '0')}`, receivedById: accountant.id, date: new Date('2025-09-10') },
      { schoolId: school.id, studentId: student.id, amount: 100, method: 'cash', reference: `PAY-${String(paymentCount + 2).padStart(5, '0')}`, receivedById: accountant.id, date: new Date('2025-09-12') },
    ]);
    paymentCount += payments.length;
  }
  console.log('Payments created:', paymentCount);

  // Create report cards
  for (const student of students.slice(0, 10)) {
    const grades = await Grade.findAll({ where: { schoolId: school.id, studentId: student.id, term: 1 } });
    const totalScore = grades.reduce((sum, g) => sum + Number(g.score) * Number(g.coefficient), 0);
    const totalCoef = grades.reduce((sum, g) => sum + Number(g.coefficient), 0);
    const average = totalCoef > 0 ? Math.round((totalScore / totalCoef) * 100) / 100 : 0;

    await ReportCard.create({
      schoolId: school.id,
      studentId: student.id,
      term: 1,
      academicYear: '2025-2026',
      average,
      rank: Math.floor(Math.random() * 20) + 1,
      totalStudents: students.length,
      status: 'published',
      generatedAt: new Date(),
    });
  }
  console.log('Report cards created.');

  // Create notifications
  await Notification.create({
    schoolId: school.id,
    userId: admin.id,
    type: 'payment',
    title: 'Paiement reçu',
    message: 'Un paiement de $300 a été enregistré.',
    data: {},
    isRead: false,
  });
  await Notification.create({
    schoolId: school.id,
    userId: admin.id,
    type: 'attendance',
    title: 'Alerte absence',
    message: '3 élèves ont plus de 5 absences ce mois-ci.',
    data: {},
    isRead: false,
  });
  console.log('Notifications created.');

  console.log('');
  console.log('Seed completed successfully!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Admin:      admin@schoolflow.com / password123');
  console.log('  Director:   director@schoolflow.com / password123');
  console.log('  Teacher 1:  teacher1@schoolflow.com / password123');
  console.log('  Teacher 2:  teacher2@schoolflow.com / password123');
  console.log('  Teacher 3:  teacher3@schoolflow.com / password123');
  console.log('  Accountant: accountant@schoolflow.com / password123');
  console.log('');

  await sequelize.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
