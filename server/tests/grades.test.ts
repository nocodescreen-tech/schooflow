import request from 'supertest';
import app from '../src/app.js';
import { createSchool, createUser, createClass, createStudent, createSubject } from './helpers.js';
import { calculateWeightedAverage } from '../src/utils/grades.js';

describe('Grades', () => {
  let authToken: string;
  let schoolId: string;
  let studentId: string;
  let subjectId: string;

  beforeEach(async () => {
    const school = await createSchool('Test School');
    schoolId = school.id;
    await createUser(schoolId, 'admin', 'admin@test.com');
    const cls = await createClass(schoolId, 'Class A');
    const student = await createStudent(schoolId, cls.id, 'John', 'Doe');
    studentId = student.id;
    const subject = await createSubject(schoolId, cls.id, 'Mathematics');
    subjectId = subject.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    authToken = res.body.data.token;
  });

  describe('POST /api/v1/grades', () => {
    it('should create a grade with valid score (0-20)', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          subjectId,
          score: 15,
          term: 1,
          examType: 'test',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.grade.score).toBe(15);
      expect(res.body.data.grade.studentId).toBe(studentId);
    });

    it('should return 400 for score above 20', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          subjectId,
          score: 25,
          term: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for negative score', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          subjectId,
          score: -5,
          term: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid term', async () => {
      const res = await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          subjectId,
          score: 15,
          term: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Weighted Average Calculation', () => {
    it('should calculate weighted average correctly', () => {
      const grades = [
        { score: 15, coefficient: 2 },
        { score: 10, coefficient: 1 },
      ];
      const avg = calculateWeightedAverage(grades);
      expect(avg).toBeCloseTo(13.33, 2);
    });

    it('should return null for empty grades', () => {
      const avg = calculateWeightedAverage([]);
      expect(avg).toBeNull();
    });

    it('should handle single grade', () => {
      const grades = [{ score: 18, coefficient: 1 }];
      const avg = calculateWeightedAverage(grades);
      expect(avg).toBe(18);
    });
  });

  describe('GET /api/v1/grades', () => {
    it('should return grades filtered by student', async () => {
      // Create grades
      await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ studentId, subjectId, score: 15, term: 1 });

      await request(app)
        .post('/api/v1/grades')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ studentId, subjectId, score: 12, term: 2 });

      const res = await request(app)
        .get(`/api/v1/grades?studentId=${studentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });
  });
});
