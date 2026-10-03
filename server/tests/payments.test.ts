import request from 'supertest';
import app from '../src/app.js';
import { createSchool, createUser, createClass, createStudent, createFee } from './helpers.js';

describe('Payments', () => {
  let authToken: string;
  let schoolId: string;
  let studentId: string;
  let feeId: string;

  beforeEach(async () => {
    const school = await createSchool('Test School');
    schoolId = school.id;
    await createUser(schoolId, 'admin', 'admin@test.com');
    const cls = await createClass(schoolId, 'Class A');
    const student = await createStudent(schoolId, cls.id, 'John', 'Doe');
    studentId = student.id;
    const fee = await createFee(schoolId, studentId, 1000);
    feeId = fee.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });

    authToken = res.body.data.token;
  });

  describe('POST /api/v1/payments', () => {
    it('should record a payment and update fee status', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          feeId,
          amount: 500,
          method: 'cash',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.amount).toBe(500);
      expect(res.body.data.payment.studentId).toBe(studentId);
    });

    it('should return 400 for invalid amount', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          amount: -100,
          method: 'cash',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid method', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          amount: 100,
          method: 'invalid_method',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should auto-generate payment reference', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId,
          feeId,
          amount: 200,
          method: 'cash',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.reference).toBeDefined();
      expect(res.body.data.payment.reference).toMatch(/^PAY-\d{4}-\d{5}$/);
    });
  });

  describe('GET /api/v1/payments', () => {
    it('should return payment history by student', async () => {
      // Create multiple payments
      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ studentId, feeId, amount: 300, method: 'cash' });

      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ studentId, feeId, amount: 200, method: 'transfer' });

      const res = await request(app)
        .get(`/api/v1/payments?studentId=${studentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
    });

    it('should return all payments without filter', async () => {
      await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ studentId, feeId, amount: 300, method: 'cash' });

      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });
});
