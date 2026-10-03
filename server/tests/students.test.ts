import request from 'supertest';
import app from '../src/app.js';
import { createSchool, createUser, createClass, createStudent } from './helpers.js';

describe('Students', () => {
  let authToken: string;
  let schoolId: string;
  let classId: string;

  beforeEach(async () => {
    const school = await createSchool('Test School');
    schoolId = school.id;
    const user = await createUser(schoolId, 'admin', 'admin@test.com');
    const cls = await createClass(schoolId, 'Class A');
    classId = cls.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    authToken = res.body.data.token;
  });

  describe('POST /api/v1/students', () => {
    it('should create a student with valid data', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          classId,
          gender: 'M',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.firstName).toBe('John');
      expect(res.body.data.student.lastName).toBe('Doe');
      expect(res.body.data.student.schoolId).toBe(schoolId);
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          firstName: '',
          lastName: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/students')
        .send({
          firstName: 'John',
          lastName: 'Doe',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/students', () => {
    it('should return paginated student list', async () => {
      // Create some students
      await createStudent(schoolId, classId, 'John', 'Doe');
      await createStudent(schoolId, classId, 'Jane', 'Smith');

      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.page).toBe(1);
    });

    it('should respect pagination parameters', async () => {
      // Create 5 students
      for (let i = 0; i < 5; i++) {
        await createStudent(schoolId, classId, `Student${i}`, 'Test');
      }

      const res = await request(app)
        .get('/api/v1/students?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(5);
      expect(res.body.data.totalPages).toBe(3);
    });
  });

  describe('PATCH /api/v1/students/:id', () => {
    it('should update a student', async () => {
      const student = await createStudent(schoolId, classId, 'John', 'Doe');

      const res = await request(app)
        .patch(`/api/v1/students/${student.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.student.firstName).toBe('Updated');
    });

    it('should return 404 for non-existent student', async () => {
      const res = await request(app)
        .patch('/api/v1/students/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/students/:id', () => {
    it('should archive a student (soft delete)', async () => {
      const student = await createStudent(schoolId, classId, 'John', 'Doe');

      const res = await request(app)
        .delete(`/api/v1/students/${student.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify student is archived
      const res2 = await request(app)
        .get(`/api/v1/students/${student.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res2.body.data.student.status).toBe('inactive');
    });
  });

  describe('Student isolation by schoolId', () => {
    it('should not return students from other schools', async () => {
      // Create student in current school
      await createStudent(schoolId, classId, 'John', 'Doe');

      // Create another school with a student
      const school2 = await createSchool('Other School');
      const class2 = await createClass(school2.id, 'Class B');
      await createStudent(school2.id, class2.id, 'Jane', 'Smith');

      // Get students from first school
      const res = await request(app)
        .get('/api/v1/students')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].firstName).toBe('John');
    });
  });
});
