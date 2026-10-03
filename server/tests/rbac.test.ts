import request from 'supertest';
import app from '../src/app.js';
import { createSchool, createUser, createClass, createStudent } from './helpers.js';

describe('RBAC (Role-Based Access Control)', () => {
  let schoolId: string;
  let classId: string;
  let studentId: string;

  beforeEach(async () => {
    const school = await createSchool('Test School');
    schoolId = school.id;
    const cls = await createClass(schoolId, 'Class A');
    classId = cls.id;
    const student = await createStudent(schoolId, classId, 'John', 'Doe');
    studentId = student.id;
  });

  async function loginAs(role: string): Promise<string> {
    const email = `${role}@test.com`;
    await createUser(schoolId, role, email);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });
    return res.body.data.token;
  }

  describe('Teacher permissions', () => {
    it('should NOT be able to delete students', async () => {
      const token = await loginAs('teacher');
      const res = await request(app)
        .delete(`/api/v1/students/${studentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should be able to create grades', async () => {
      const token = await loginAs('teacher');
      const subjectRes = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${token}`)
        .send({
          studentId,
          subjectId: '00000000-0000-0000-0000-000000000000',
          score: 15,
          term: 1,
        });

      // Should not be 403 (may be 400/500 due to invalid subjectId, but not 403)
      expect(subjectRes.status).not.toBe(403);
    });
  });

  describe('Accountant permissions', () => {
    it('should NOT be able to create students', async () => {
      const token = await loginAs('accountant');
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          classId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should be able to view payments', async () => {
      const token = await loginAs('accountant');
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Parent permissions', () => {
    it('should NOT be able to create students', async () => {
      const token = await loginAs('parent');
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          classId,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should NOT be able to view all students', async () => {
      const token = await loginAs('parent');
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Admin permissions', () => {
    it('should be able to do everything', async () => {
      const token = await loginAs('admin');

      // Create student
      const createRes = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Jane', lastName: 'Smith', classId });
      expect(createRes.status).toBe(201);

      // View students
      const listRes = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);

      // Update student
      const updateRes = await request(app)
        .patch(`/api/v1/students/${createRes.body.data.student.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated' });
      expect(updateRes.status).toBe(200);

      // Delete student
      const deleteRes = await request(app)
        .delete(`/api/v1/students/${createRes.body.data.student.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(200);
    });
  });
});
