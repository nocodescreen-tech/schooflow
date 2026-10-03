import bcrypt from 'bcryptjs';
import { School, User, Student, Class, Subject, Fee } from '../src/models/index.js';

export async function createSchool(name: string = 'Test School') {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return School.create({ name, slug, plan: 'starter', currency: 'USD' });
}

export async function createUser(
  schoolId: string,
  role: string,
  email: string,
  name?: string
) {
  const passwordHash = await bcrypt.hash('password123', 12);
  return User.create({
    schoolId,
    email,
    passwordHash,
    name: name || `Test ${role}`,
    role,
  });
}

export async function createClass(schoolId: string, name: string = 'Test Class') {
  return Class.create({ schoolId, name, academicYear: '2025-2026' });
}

export async function createSubject(
  schoolId: string,
  classId: string,
  name: string = 'Test Subject'
) {
  return Subject.create({ schoolId, name, code: 'TS01', classId });
}

export async function createStudent(
  schoolId: string,
  classId: string,
  firstName: string = 'John',
  lastName: string = 'Doe'
) {
  const studentCount = await Student.count({ where: { schoolId } });
  const studentId = `SCH-${String(studentCount + 1).padStart(5, '0')}`;
  return Student.create({
    schoolId,
    classId,
    studentId,
    firstName,
    lastName,
  });
}

export async function createFee(
  schoolId: string,
  studentId: string,
  amount: number = 1000
) {
  return Fee.create({
    schoolId,
    studentId,
    type: 'tuition',
    amount,
    totalAmount: amount,
    paidAmount: 0,
    dueDate: new Date(),
  });
}
