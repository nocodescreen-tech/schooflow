import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { VacationTicket, Student, School, Fee, Payment, Class } from '../models/index.js';
import { logAudit } from '../middleware/auditLog.js';
import { getPagination, getSort, pages } from '../utils/listQuery.js';

const router = Router();
router.use(authenticateToken);

const STAFF_READ = ['super_admin', 'admin', 'director', 'teacher', 'accountant', 'receptionist'] as const;
const SINGLE_READ = [...STAFF_READ, 'parent', 'student'] as const;
const WRITE_ROLES = ['super_admin', 'admin', 'director', 'receptionist'] as const;

// ─── List ────────────────────────────────────────────────────────────────────

router.get('/',
  requireRole(...STAFF_READ),
  requirePermission('documents', 'view'),
  async (req: Request, res: Response) => {
  try {
    const { studentId, status, academicYear } = req.query;
    const where: any = { schoolId: req.user!.schoolId! };
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (academicYear) where.academicYear = academicYear;

    const { page, limit, offset } = getPagination(req.query);
    const sort = getSort(req.query, { createdAt: 'createdAt', startDate: 'startDate', status: 'status', ticketNumber: 'ticketNumber' }, 'createdAt', 'DESC');
    if (!sort) return res.status(400).json({ success: false, error: 'Invalid sortBy or sortOrder' });

    const { count, rows: tickets } = await VacationTicket.findAndCountAll({
      where,
      include: [{ model: Student, as: 'student', attributes: ['id', 'firstName', 'lastName', 'studentId'] }],
      order: [[sort.column, sort.order]],
      limit,
      offset,
    });
    return res.json({ success: true, data: { items: tickets, total: count, page, pages: pages(count, limit) } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Create ──────────────────────────────────────────────────────────────────

router.post('/',
  requireRole(...WRITE_ROLES),
  requirePermission('documents', 'create'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
  body('destination').trim().notEmpty().withMessage('Destination is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, startDate, endDate, reason, destination, academicYear, notes } = req.body;

      // Auto-generate ticket number
      const count = await VacationTicket.count({ where: { schoolId: req.user!.schoolId! } });
      const ticketNumber = `VT-${String(count + 1).padStart(6, '0')}`;

      const ticket = await VacationTicket.create({
        schoolId: req.user!.schoolId!,
        studentId,
        startDate,
        endDate,
        reason,
        destination,
        academicYear: academicYear || '2025-2026',
        notes,
        ticketNumber,
      });

      await logAudit(req, { action: 'create', entity: 'vacation_ticket', entityId: ticket.id, details: { ticketNumber } });

      return res.status(201).json({ success: true, data: { ticket } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// ─── Get one ─────────────────────────────────────────────────────────────────

router.get('/:id',
  requireRole(...SINGLE_READ),
  requirePermission('documents', 'view'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [{ model: Student, as: 'student' }],
    });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    return res.json({ success: true, data: { ticket } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Update ──────────────────────────────────────────────────────────────────

router.patch('/:id',
  requireRole(...WRITE_ROLES),
  requirePermission('documents', 'create'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const allowed = ['startDate', 'endDate', 'reason', 'destination', 'academicYear', 'notes'];
    const updates: any = {};
    for (const field of allowed) { if (req.body[field] !== undefined) updates[field] = req.body[field]; }
    await ticket.update(updates);

    await logAudit(req, { action: 'update', entity: 'vacation_ticket', entityId: ticket.id, details: updates });

    return res.json({ success: true, data: { ticket } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Delete ──────────────────────────────────────────────────────────────────

router.delete('/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('documents', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    await ticket.destroy();

    await logAudit(req, { action: 'delete', entity: 'vacation_ticket', entityId: req.params.id });

    return res.json({ success: true, data: { message: 'Ticket deleted' } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Approve ─────────────────────────────────────────────────────────────────

router.post('/:id/approve',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('documents', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    await ticket.update({ status: 'approved' });

    await logAudit(req, { action: 'approve', entity: 'vacation_ticket', entityId: ticket.id });

    return res.json({ success: true, data: { ticket } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Reject ──────────────────────────────────────────────────────────────────

router.post('/:id/reject',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('documents', 'delete'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({ where: { id: req.params.id, schoolId: req.user!.schoolId! } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
    await ticket.update({ status: 'rejected' });

    await logAudit(req, { action: 'reject', entity: 'vacation_ticket', entityId: ticket.id });

    return res.json({ success: true, data: { ticket } });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── PDF Generation ──────────────────────────────────────────────────────────

router.get('/:id/pdf',
  requireRole(...SINGLE_READ),
  requirePermission('documents', 'download'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
      include: [
        { model: Student, as: 'student' },
        { model: School, as: 'school' },
      ],
    });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const student = (ticket as any).student;
    const school = (ticket as any).school;

    // Fetch fee breakdown for the student
    const fees = await Fee.findAll({
      where: { schoolId: req.user!.schoolId!, studentId: student.id },
      order: [['dueDate', 'ASC']],
    });
    const payments = await Payment.findAll({
      where: { schoolId: req.user!.schoolId!, studentId: student.id },
      order: [['date', 'ASC']],
    });

    const totalFees = fees.reduce((sum: number, f: any) => sum + Number(f.totalAmount || f.amount), 0);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const balance = totalFees - totalPaid;

    const pdfBuffer = await generateVacationTicketPdf(ticket, student, school, fees, payments, totalFees, totalPaid, balance);

    // Save PDF to disk
    const ticketsDir = path.resolve(process.cwd(), 'uploads', 'vacation-tickets');
    if (!fs.existsSync(ticketsDir)) {
      fs.mkdirSync(ticketsDir, { recursive: true });
    }

    const filename = `billet-vacances-${ticket.ticketNumber}.pdf`;
    const relativePath = path.join('vacation-tickets', filename);
    const absolutePath = path.resolve(process.cwd(), 'uploads', relativePath);

    fs.writeFileSync(absolutePath, pdfBuffer);

    // Update ticket with PDF path
    await ticket.update({ pdfPath: relativePath });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="billet-vacances-${ticket.ticketNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── PDF Helper ──────────────────────────────────────────────────────────────

async function generateVacationTicketPdf(
  ticket: VacationTicket,
  student: any,
  school: any,
  fees: any[],
  payments: any[],
  totalFees: number,
  totalPaid: number,
  balance: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    // ── School Header ──
    doc.fontSize(16).font('Helvetica-Bold').text(school.name || 'École', margin, y, { width: contentWidth });
    y += 22;
    doc.fontSize(10).font('Helvetica');
    if (school.address) { doc.text(school.address, margin, y, { width: contentWidth }); y += 14; }
    if (school.phone) { doc.text(`Tél: ${school.phone}`, margin, y, { width: contentWidth }); y += 14; }

    // ── Title ──
    y += 20;
    doc.fontSize(18).font('Helvetica-Bold').text('BILLET DE VACANCES', margin, y, { width: contentWidth, align: 'center' });
    y += 25;
    doc.fontSize(11).font('Helvetica').text(`N° ${ticket.ticketNumber}`, margin, y, { width: contentWidth, align: 'center' });
    y += 15;
    doc.text(`Année Académique: ${ticket.academicYear}`, margin, y, { width: contentWidth, align: 'center' });
    y += 20;

    // Horizontal line
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 20;

    // ── Student Info ──
    doc.fontSize(12).font('Helvetica-Bold').text('Informations de l\'élève', margin, y);
    y += 22;

    const studentInfo = [
      ['Nom complet:', `${student.lastName} ${student.firstName}`],
      ['Matricule:', student.studentId],
      ['Classe:', student.class?.name || 'N/A'],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of studentInfo) {
      doc.font('Helvetica-Bold').text(label, margin, y, { width: 120 });
      doc.font('Helvetica').text(value, margin + 130, y, { width: contentWidth - 130 });
      y += 16;
    }

    // ── Vacation Details ──
    y += 15;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 15;

    doc.fontSize(12).font('Helvetica-Bold').text('Détails du Voyage', margin, y);
    y += 22;

    const fmtDate = (d: Date) => new Date(d).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

    const vacationInfo = [
      ['Date de départ:', fmtDate(ticket.startDate)],
      ['Date de retour:', fmtDate(ticket.endDate)],
      ['Destination:', ticket.destination],
      ['Motif:', ticket.reason],
      ['Statut:', ticket.status.toUpperCase()],
    ];

    doc.fontSize(10).font('Helvetica');
    for (const [label, value] of vacationInfo) {
      doc.font('Helvetica-Bold').text(label, margin, y, { width: 120 });
      doc.font('Helvetica').text(value, margin + 130, y, { width: contentWidth - 130 });
      y += 16;
    }

    // ── Fee Breakdown ──
    y += 15;
    if (y > doc.page.height - 250) { doc.addPage(); y = margin; }
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 15;

    doc.fontSize(12).font('Helvetica-Bold').text('Détail des Frais', margin, y);
    y += 22;

    // Table header
    const colWidths = [30, 150, 70, 70, 70];
    const colX: number[] = [margin];
    for (let i = 0; i < colWidths.length - 1; i++) colX.push(colX[i] + colWidths[i]);

    doc.font('Helvetica-Bold').fontSize(9);
    const headers = ['#', 'Type', 'Montant', 'Payé', 'Reste'];
    for (let i = 0; i < headers.length; i++) doc.text(headers[i], colX[i] + 2, y, { width: colWidths[i] - 4 });
    doc.rect(margin, y - 2, contentWidth, 16).stroke();
    y += 18;

    doc.font('Helvetica').fontSize(9);
    fees.forEach((fee: any, idx: number) => {
      if (y > doc.page.height - 150) { doc.addPage(); y = margin; }
      const amt = Number(fee.totalAmount || fee.amount);
      const paid = Number(fee.paidAmount || 0);
      const row = [
        String(idx + 1),
        fee.type,
        amt.toFixed(2),
        paid.toFixed(2),
        (amt - paid).toFixed(2),
      ];
      for (let i = 0; i < row.length; i++) doc.text(row[i], colX[i] + 2, y, { width: colWidths[i] - 4 });
      doc.rect(margin, y - 2, contentWidth, 14).stroke();
      y += 14;
    });

    // Totals
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Total Frais:', margin, y, { width: 120 });
    doc.text(`${totalFees.toFixed(2)}`, margin + 130, y, { width: contentWidth - 130 });
    y += 16;
    doc.text('Total Payé:', margin, y, { width: 120 });
    doc.text(`${totalPaid.toFixed(2)}`, margin + 130, y, { width: contentWidth - 130 });
    y += 16;
    doc.text('Solde Restant:', margin, y, { width: 120 });
    doc.text(`${balance.toFixed(2)}`, margin + 130, y, { width: contentWidth - 130 });
    y += 20;

    // ── Signature Areas ──
    if (y > doc.page.height - 180) { doc.addPage(); y = margin; }
    y += 20;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).stroke();
    y += 15;

    doc.fontSize(12).font('Helvetica-Bold').text('Approbation', margin, y);
    y += 30;

    doc.fontSize(10).font('Helvetica');
    const sigY = y + 40;

    // Director signature
    doc.text('Le Directeur/Directrice', margin, sigY, { width: 180 });
    doc.moveTo(margin, sigY + 50).lineTo(margin + 180, sigY + 50).stroke();

    // Accountant signature
    const accX = pageWidth / 2;
    doc.text('Le Comptable', accX, sigY, { width: 180 });
    doc.moveTo(accX, sigY + 50).lineTo(accX + 180, sigY + 50).stroke();

    // Stamp area
    const stampX = pageWidth - margin - 150;
    doc.rect(stampX, sigY - 5, 150, 80).stroke();
    doc.fontSize(8).text('Cachet de l\'école', stampX, sigY + 30, { width: 150, align: 'center' });

    // Date and location
    const dateStr = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`Fait à ${school.address || ''}, le ${dateStr}`, margin, sigY + 80, { width: contentWidth, align: 'center' });

    // ── Footer ──
    doc.fontSize(8).font('Helvetica').text(
      'Ce billet de vacances est un document officiel. Toute falsification ou modification entraîne des poursuites disciplinaires.',
      margin,
      doc.page.height - 40,
      { width: contentWidth, align: 'center' }
    );

    doc.end();
  });
}

// ─── Download PDF ────────────────────────────────────────────────────────────

router.get('/:id/download',
  requireRole(...SINGLE_READ),
  requirePermission('documents', 'download'),
  async (req: Request, res: Response) => {
  try {
    const ticket = await VacationTicket.findOne({
      where: { id: req.params.id, schoolId: req.user!.schoolId! },
    });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    if (!ticket.pdfPath) {
      return res.status(404).json({ success: false, error: 'PDF not generated yet. Use /pdf endpoint first.' });
    }

    const absolutePath = path.resolve(process.cwd(), 'uploads', ticket.pdfPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'PDF file not found on disk.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="billet-vacances-${ticket.ticketNumber}.pdf"`);
    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
