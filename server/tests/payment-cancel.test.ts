import request from 'supertest';
import app from '../src/app.js';
import { Fee } from '../src/models/index.js';
import { createSchool, createUser, createClass, createStudent, createFee } from './helpers.js';

describe('Payment cancel restores fee', () => {
  let authToken: string;
  let schoolId: string;
  let studentId: string;
  let feeId: string;

  beforeEach(async () => {
    const school = await createSchool('Cancel School');
    schoolId = school.id;
    await createUser(schoolId, 'admin', 'admin@cancel.test');
    const cls = await createClass(schoolId, 'Class C');
    const student = await createStudent(schoolId, cls.id, 'Jane', 'Doe');
    studentId = student.id;
    const fee = await createFee(schoolId, studentId, 1000);
    feeId = fee.id;

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@cancel.test', password: 'password123' });
    authToken = res.body.data.token;
  });

  it('create → cancel → fee restored', async () => {
    const payRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ studentId, feeId, amount: 400, method: 'cash' });
    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.data.payment.id as string;

    const afterPay = await Fee.findByPk(feeId);
    expect(Number(afterPay!.paidAmount)).toBe(400);

    const cancelRes = await request(app)
      .post(`/api/v1/payments/${paymentId}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ reason: 'test cancel' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.payment.status).toBe('cancelled');

    const afterCancel = await Fee.findByPk(feeId);
    expect(Number(afterCancel!.paidAmount)).toBe(0);
    expect(afterCancel!.status).toBe('pending');
  });
});
