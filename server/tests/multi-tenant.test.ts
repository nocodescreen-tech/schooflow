import request from 'supertest';
import app from '../src/app.js';
import { createSchool, createUser, createClass, createStudent, createFee } from './helpers.js';

describe('Multi-Tenancy', () => {
  let schoolAId: string;
  let schoolBId: string;
  let classAId: string;
  let classBId: string;
  let studentAId: string;
  let studentBId: string;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    // Create School A
    const schoolA = await createSchool('School A');
    schoolAId = schoolA.id;
    await createUser(schoolAId, 'admin', 'admin@schoola.com');
    const classA = await createClass(schoolAId, 'Class A');
    classAId = classA.id;
    const studentA = await createStudent(schoolAId, classAId, 'Alice', 'A');
    studentAId = studentA.id;
    await createFee(schoolAId, studentAId, 1000);

    // Create School B
    const schoolB = await createSchool('School B');
    schoolBId = schoolB.id;
    await createUser(schoolBId, 'admin', 'admin@schoolb.com');
    const classB = await createClass(schoolBId, 'Class B');
    classBId = classB.id;
    const studentB = await createStudent(schoolBId, classBId, 'Bob', 'B');
    studentBId = studentB.id;
    await createFee(schoolBId, studentBId, 2000);

    // Login as School A admin
    const resA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@schoola.com', password: 'password123' });
    tokenA = resA.body.data.token;

    // Login as School B admin
    const resB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@schoolb.com', password: 'password123' });
    tokenB = resB.body.data.token;
  });

  describe('Student isolation', () => {
    it('School A should NOT see School B students', async () => {
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].firstName).toBe('Alice');
    });

    it('School B should NOT see School A students', async () => {
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].firstName).toBe('Bob');
    });

    it('School A should NOT access School B student by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/students/${studentBId}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Payment isolation', () => {
    it('School A should NOT see School B payments', async () => {
      // Create a payment in School B
      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          studentId: studentBId,
          amount: 500,
          method: 'cash',
        });

      // School A should not see it
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });

    it('School B should NOT see School A payments', async () => {
      // Create a payment in School A
      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          studentId: studentAId,
          amount: 300,
          method: 'cash',
        });

      // School B should not see it
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('Grade isolation', () => {
    it('School A should NOT see School B grades', async () => {
      // Create a grade in School B
      const subjectB = await (await import('../src/models/index.js')).Subject.create({
        schoolId: schoolBId,
        name: 'Math',
        code: 'MATH',
        classId: classBId,
      });

      await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          studentId: studentBId,
          subjectId: subjectB.id,
          score: 15,
          term: 1,
        });

      // School A should not see it
      const res = await request(app)
        .get('/api/v1/grades')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('All queries scoped by schoolId', () => {
    it('should isolate all resources by schoolId', async () => {
      // Create resources in both schools
      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ studentId: studentAId, amount: 100, method: 'cash' });

      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ studentId: studentBId, amount: 200, method: 'cash' });

      // Verify School A only sees its own data
      const studentsA = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(studentsA.body.data.items).toHaveLength(1);
      expect(studentsA.body.data.items[0].schoolId).toBe(schoolAId);

      const paymentsA = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(paymentsA.body.data.items).toHaveLength(1);
      expect(paymentsA.body.data.items[0].schoolId).toBe(schoolAId);

      // Verify School B only sees its own data
      const studentsB = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(studentsB.body.data.items).toHaveLength(1);
      expect(studentsB.body.data.items[0].schoolId).toBe(schoolBId);

      const paymentsB = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(paymentsB.body.data.items).toHaveLength(1);
      expect(paymentsB.body.data.items[0].schoolId).toBe(schoolBId);
    });
  });
});
