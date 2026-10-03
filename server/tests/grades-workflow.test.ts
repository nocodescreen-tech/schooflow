import request from 'supertest';
import app from '../src/app.js';
import { Grade } from '../src/models/index.js';
import { calculateTrimesterAverage } from '../src/utils/grades.js';
import { createSchool, createUser, createClass, createStudent, createSubject } from './helpers.js';

describe('Grades workflow', () => {
  let authToken: string;
  let schoolId: string;
  let studentId: string;
  let subjectId: string;

  beforeEach(async () => {
    const school = await createSchool('Workflow School');
    schoolId = school.id;
    await createUser(schoolId, 'admin', 'admin@workflow.test');
    const cls = await createClass(schoolId, 'Class W');
    const student = await createStudent(schoolId, cls.id, 'Willy', 'Tester');
    studentId = student.id;
    const subject = await createSubject(schoolId, cls.id, 'Physics');
    subjectId = subject.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@workflow.test', password: 'password123' });
    authToken = res.body.data.token;
  });

  it('draft hidden from averages, publish visible', async () => {
    const draft = await Grade.create({
      schoolId,
      studentId,
      subjectId,
      examType: 'test',
      score: 16,
      coefficient: 1,
      term: 1,
      academicYear: '2025-2026',
      status: 'DRAFT',
    });

    const hidden = await calculateTrimesterAverage(schoolId, studentId, 1, '2025-2026');
    expect(hidden).toBeNull();

    await draft.update({ status: 'SUBMITTED' });
    const stillHidden = await calculateTrimesterAverage(schoolId, studentId, 1, '2025-2026');
    expect(stillHidden).toBeNull();

    const pubRes = await request(app)
      .post(`/api/v1/grades/${draft.id}/publish`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.grade.status).toBe('PUBLISHED');

    const visible = await calculateTrimesterAverage(schoolId, studentId, 1, '2025-2026');
    expect(visible).toBeCloseTo(16, 2);
  });

  it('submit → validate → publish transitions', async () => {
    const grade = await Grade.create({
      schoolId,
      studentId,
      subjectId,
      examType: 'test',
      score: 12,
      coefficient: 1,
      term: 2,
      academicYear: '2025-2026',
      status: 'DRAFT',
    });

    const submitRes = await request(app)
      .post(`/api/v1/grades/${grade.id}/submit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.grade.status).toBe('SUBMITTED');

    const validateRes = await request(app)
      .post(`/api/v1/grades/${grade.id}/validate`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.data.grade.status).toBe('VALIDATED');

    const publishRes = await request(app)
      .post(`/api/v1/grades/${grade.id}/publish`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.grade.status).toBe('PUBLISHED');
  });
});
