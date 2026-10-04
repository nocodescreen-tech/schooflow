import { Router } from 'express';
import authRoutes from './auth.js';
import studentRoutes from './students.js';
import classRoutes from './classes.js';
import teacherRoutes from './teachers.js';
import gradeRoutes from './grades.js';
import attendanceRoutes from './attendance.js';
import feeRoutes from './fees.js';
import paymentRoutes from './payments.js';
import reportCardRoutes from './report-cards.js';
import dashboardRoutes from './dashboard.js';
import notificationRoutes from './notifications.js';
import settingsRoutes from './settings.js';
import uploadRoutes from './upload.js';
import vacationTicketRoutes from './vacation-tickets.js';
import otpRoutes from './otp.js';
import timetableRoutes from './timetable.js';
import cashRoutes from './cash.js';
import documentRoutes from './documents.js';
import announcementRoutes from './announcements.js';
import messageRoutes from './messages.js';
import searchRoutes from './search.js';
import importExportRoutes from './import-export.js';
import documentBuilderRoutes from './document-builder.js';
import rolesRoutes from './roles.js';
import delegationsRoutes from './delegations.js';
import enrollmentRoutes from './enrollment.js';
import verifyRoutes from './verify.js';
import parentsRoutes from './parents.js';
import academicYearsRoutes from './academic-years.js';
import incidentsRoutes from './incidents.js';
import convocationsRoutes from './convocations.js';
import subjectsRoutes from './subjects.js';
import auditLogsRoutes from './audit-logs.js';
import eventsRoutes from './events.js';
import structureRoutes from './structure.js';
import modulesRoutes from './modules.js';
import gradingRoutes from './grading.js';
import promotionRoutes from './promotion.js';
import evaluationPeriodRoutes from './evaluation-periods.js';
import assessmentRoutes from './assessments.js';
import academicRoutes from './academic.js';
import workspaceRoutes from './workspace.js';
import currencyRoutes from './currencies.js';
import usersRoutes from './users.js';
import activationCodeRoutes, { publicActivationRouter } from './activation-codes.js';
import contactRoutes from './contact.js';
import backupRoutes from './backup.js';
import libraryRoutes from './library.js';
import transportRoutes from './transport.js';
import boardingRoutes from './boarding.js';
import healthRoutes from './health.js';
import diagnosticsRoutes from './diagnostics.js';
import { authLimiter, apiLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use('/', healthRoutes);

router.use('/auth', authLimiter, authRoutes);
router.use('/students', apiLimiter, studentRoutes);
router.use('/classes', apiLimiter, classRoutes);
router.use('/teachers', apiLimiter, teacherRoutes);
router.use('/grades', apiLimiter, gradeRoutes);
router.use('/attendance', apiLimiter, attendanceRoutes);
router.use('/fees', apiLimiter, feeRoutes);
router.use('/payments', apiLimiter, paymentRoutes);
router.use('/report-cards', apiLimiter, reportCardRoutes);
router.use('/dashboard', apiLimiter, dashboardRoutes);
router.use('/notifications', apiLimiter, notificationRoutes);
router.use('/settings', apiLimiter, settingsRoutes);
router.use('/upload', apiLimiter, uploadRoutes);
router.use('/vacation-tickets', apiLimiter, vacationTicketRoutes);
router.use('/otp', authLimiter, otpRoutes);
router.use('/timetable', apiLimiter, timetableRoutes);
router.use('/cash', apiLimiter, cashRoutes);
router.use('/documents', apiLimiter, documentRoutes);
router.use('/announcements', apiLimiter, announcementRoutes);
router.use('/messages', apiLimiter, messageRoutes);
router.use('/document-builder', apiLimiter, documentBuilderRoutes);
router.use('/search', apiLimiter, searchRoutes);
router.use('/import-export', apiLimiter, importExportRoutes);
router.use('/roles', apiLimiter, rolesRoutes);
router.use('/delegations', apiLimiter, delegationsRoutes);
router.use('/enrollment', apiLimiter, enrollmentRoutes);
router.use('/verify', apiLimiter, verifyRoutes);
router.use('/parents', apiLimiter, parentsRoutes);
router.use('/academic-years', apiLimiter, academicYearsRoutes);
router.use('/incidents', apiLimiter, incidentsRoutes);
router.use('/convocations', apiLimiter, convocationsRoutes);
router.use('/subjects', apiLimiter, subjectsRoutes);
router.use('/audit-logs', apiLimiter, auditLogsRoutes);
router.use('/events', apiLimiter, eventsRoutes);
router.use('/structure', apiLimiter, structureRoutes);
router.use('/modules', apiLimiter, modulesRoutes);
router.use('/grading', apiLimiter, gradingRoutes);
router.use('/promotion', apiLimiter, promotionRoutes);
router.use('/evaluation-periods', apiLimiter, evaluationPeriodRoutes);
router.use('/assessments', apiLimiter, assessmentRoutes);
router.use('/academic', apiLimiter, academicRoutes);
router.use('/workspace', apiLimiter, workspaceRoutes);
router.use('/currencies', apiLimiter, currencyRoutes);
router.use('/users', apiLimiter, usersRoutes);
router.use('/activation-codes', apiLimiter, activationCodeRoutes);
// Public self-service activation (no authentication required)
router.use('/activation', authLimiter, publicActivationRouter);

// Contact form (public, rate-limited)
router.use('/contact', authLimiter, contactRoutes);

// Backup management (super_admin only, defined with full paths)
router.use(backupRoutes);

// Health check (public)
router.use('/health', healthRoutes);

// Library module
router.use('/library', apiLimiter, libraryRoutes);

// Transport module
router.use('/transport', apiLimiter, transportRoutes);

// Boarding module
router.use('/boarding', apiLimiter, boardingRoutes);

// Diagnostics (admin only)
router.use('/diagnostics', apiLimiter, diagnosticsRoutes);

export default router;
