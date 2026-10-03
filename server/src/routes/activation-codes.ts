import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAudit } from '../middleware/auditLog.js';
import { ActivationCode, Student, Parent, User, Role } from '../models/index.js';
import { hashToken, generateSecureToken, assertEmailAvailable } from '../services/UserProvisioningService.js';
import { userHasPermission } from '../services/AuthorizationService.js';

const router = Router();

// ─── Admin: create activation codes ───────────────────────────────────────────

// Authenticated + permission-gated router for managing activation codes.
router.post('/',
  authenticateToken,
  requirePermission('users', 'create'),
  body('targetType').isIn(['student', 'parent', 'staff']).withMessage('Invalid target type'),
  body('targetId').isUUID().withMessage('targetId must be a valid id'),
  body('email').optional().isEmail().normalizeEmail(),
  body('expiresInHours').optional().isInt({ min: 1, max: 720 }),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { targetType, targetId, email, expiresInHours, note } = req.body as {
        targetType: 'student' | 'parent' | 'staff'; targetId: string; email?: string;
        expiresInHours?: number; note?: string;
      };
      const schoolId = req.user!.schoolId;

      // Granular "who can create what": the code inherits the grant of the
      // account type it will produce.
      const granular = targetType === 'student'
        ? 'users.create_student'
        : targetType === 'parent'
          ? 'users.create_parent'
          : 'users.create_staff';
      if (!(await userHasPermission(req.user!, granular))) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions', required: granular });
      }

      // The target must belong to the same school.
      if (targetType === 'student') {
        const s = await Student.findOne({ where: { id: targetId, schoolId } });
        if (!s) return res.status(404).json({ success: false, error: 'Élève introuvable' });
      } else if (targetType === 'parent') {
        const p = await Parent.findOne({ where: { id: targetId, schoolId } });
        if (!p) return res.status(404).json({ success: false, error: 'Parent introuvable' });
      } else {
        const u = await User.findOne({ where: { id: targetId, schoolId } });
        if (!u) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
      }

      const code = generateSecureToken(4).toUpperCase().slice(0, 8);
      const row = await ActivationCode.create({
        schoolId, codeHash: hashToken(code), targetType, targetId,
        email: email ?? null, maxUses: 1, useCount: 0,
        expiresAt: new Date(Date.now() + (expiresInHours ?? 72) * 3600 * 1000),
        status: 'active', createdBy: req.user!.id, note: note ?? null,
      });
      await logAudit(req, { action: 'activation_code_created', entity: 'activation_code', entityId: row.id, details: { targetType, targetId } });
      // The plaintext code is returned exactly once.
      return res.status(201).json({ success: true, data: { id: row.id, code, expiresAt: row.expiresAt, targetType, targetId } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.get('/',
  authenticateToken,
  requirePermission('users', 'view'),
  async (req: Request, res: Response) => {
    try {
      const items = await ActivationCode.findAll({
        where: { schoolId: req.user!.schoolId },
        attributes: ['id', 'targetType', 'targetId', 'email', 'useCount', 'maxUses', 'expiresAt', 'usedAt', 'status', 'note', 'createdAt'],
        order: [['createdAt', 'DESC']],
      });
      return res.json({ success: true, data: { items } });
    } catch (error) {
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

router.post('/:id/revoke', authenticateToken, requirePermission('users', 'disable'), async (req: Request, res: Response) => {
  try {
    const [count] = await ActivationCode.update({ status: 'revoked' }, {
      where: { id: req.params.id, schoolId: req.user!.schoolId, status: 'active' },
    });
    if (!count) return res.status(404).json({ success: false, error: 'Code introuvable ou déjà utilisé' });
    await logAudit(req, { action: 'activation_code_revoked', entity: 'activation_code', entityId: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Public self-activation (no auth) ─────────────────────────────────────────

// Separate public router mounted WITHOUT authenticateToken.
export const publicActivationRouter = Router();

// POST /activation/activate — student/parent redeems a code to create their account.
publicActivationRouter.post('/activate',
  body('code').trim().notEmpty().withMessage('Activation code is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('matricule').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Date of birth must be a valid date'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
      const { code, email, password, matricule, dateOfBirth } = req.body as {
        code: string; email: string; password: string; matricule?: string; dateOfBirth?: string;
      };

      const record = await ActivationCode.findOne({ where: { codeHash: hashToken(code.toUpperCase()) } });
      if (!record) return res.status(400).json({ success: false, error: 'Code d’activation invalide' });
      if (record.status === 'revoked') return res.status(400).json({ success: false, error: 'Ce code a été révoqué' });
      if (record.status === 'used' || record.useCount >= record.maxUses) return res.status(400).json({ success: false, error: 'Ce code a déjà été utilisé' });
      if (new Date(record.expiresAt) < new Date()) return res.status(400).json({ success: false, error: 'Ce code a expiré' });
      if (record.email && record.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Email non conforme au code d’activation' });
      }

      // Anti-impersonation: a student must prove the dossier is theirs by
      // confirming the matricule and the date of birth recorded at enrollment.
      if (record.targetType === 'student') {
        const student = await Student.findOne({ where: { id: record.targetId } });
        if (!student) return res.status(400).json({ success: false, error: 'Dossier élève introuvable' });
        if (student.userId) return res.status(400).json({ success: false, error: 'Cet élève possède déjà un compte' });
        if (student.studentId && matricule && student.studentId.toLowerCase() !== String(matricule).trim().toLowerCase()) {
          return res.status(400).json({ success: false, error: 'Matricule incorrect' });
        }
        if (student.dateOfBirth && (!dateOfBirth || new Date(dateOfBirth).toDateString() !== new Date(student.dateOfBirth).toDateString())) {
          return res.status(400).json({ success: false, error: 'Date de naissance incorrecte' });
        }
      }

      const { createStudentAccount, createParentAccount } = await import('../services/UserProvisioningService.js');
      let result;
      if (record.targetType === 'student') {
        result = await createStudentAccount(record.targetId, record.createdBy ?? '', { temporaryPassword: password, email });
      } else if (record.targetType === 'parent') {
        result = await createParentAccount(record.targetId, record.createdBy ?? '', { temporaryPassword: password, email });
      } else {
        return res.status(400).json({ success: false, error: 'Type de cible non pris en charge' });
      }

      // Mark the code as consumed — it can never be replayed.
      await record.update({ status: 'used', useCount: record.useCount + 1, usedAt: new Date(), usedByUserId: result.user.id });
      return res.status(201).json({ success: true, data: { userId: result.user.id, email: result.user.email } });
    } catch (error) {
      if (error instanceof AppError) return res.status(error.statusCode).json({ success: false, error: error.message });
      return res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
