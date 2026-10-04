import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { requireModule } from '../utils/modules.js';
import { logAudit } from '../middleware/auditLog.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('transport'));

const ROLES = ['super_admin', 'admin', 'director'] as const;

interface TransportVehicle {
  id: string;
  schoolId: string;
  plateNumber: string;
  driverName: string;
  driverPhone: string;
  capacity: number;
  route: string;
  stops: string[];
  active: boolean;
  createdAt: Date;
}

interface TransportAssignment {
  id: string;
  schoolId: string;
  studentId: string;
  vehicleId: string;
  stopId: string;
  active: boolean;
  createdAt: Date;
}

const vehicles: Map<string, TransportVehicle> = new Map();
const assignments: Map<string, TransportAssignment> = new Map();

// GET /transport/vehicles
router.get('/vehicles',
  requireRole(...ROLES),
  requirePermission('transport', 'view'),
  async (req: Request, res: Response) => {
    try {
      const list = [...vehicles.values()].filter((v) => v.schoolId === req.user!.schoolId);
      res.json({ success: true, data: { vehicles: list } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /transport/vehicles
router.post('/vehicles',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('transport', 'manage'),
  body('plateNumber').isString().withMessage('Plate number is required'),
  body('driverName').isString().withMessage('Driver name is required'),
  body('driverPhone').isString().withMessage('Driver phone is required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
  body('route').isString().withMessage('Route is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { plateNumber, driverName, driverPhone, capacity, route, stops = [] } = req.body;
      const vehicle: TransportVehicle = {
        id: uuidv4(),
        schoolId: req.user!.schoolId!,
        plateNumber,
        driverName,
        driverPhone,
        capacity,
        route,
        stops,
        active: true,
        createdAt: new Date(),
      };
      vehicles.set(vehicle.id, vehicle);

      await logAudit(req, { action: 'create', entity: 'transport_vehicle', entityId: vehicle.id, details: { plateNumber, route } });
      res.status(201).json({ success: true, data: { vehicle } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /transport/assignments — assign student to vehicle
router.post('/assignments',
  requireRole(...ROLES),
  requirePermission('transport', 'manage'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('vehicleId').isUUID().withMessage('Valid vehicle ID is required'),
  body('stopId').isString().withMessage('Stop ID is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, vehicleId, stopId } = req.body;
      const vehicle = vehicles.get(vehicleId);
      if (!vehicle || vehicle.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Vehicle not found' });
      }

      const assignment: TransportAssignment = {
        id: uuidv4(),
        schoolId: req.user!.schoolId!,
        studentId,
        vehicleId,
        stopId,
        active: true,
        createdAt: new Date(),
      };
      assignments.set(assignment.id, assignment);

      await logAudit(req, { action: 'create', entity: 'transport_assignment', entityId: assignment.id, details: { studentId, vehicleId } });
      res.status(201).json({ success: true, data: { assignment } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /transport/assignments
router.get('/assignments',
  requireRole(...ROLES),
  requirePermission('transport', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { vehicleId, studentId } = req.query;
      let list = [...assignments.values()].filter((a) => a.schoolId === req.user!.schoolId);
      if (vehicleId) list = list.filter((a) => a.vehicleId === vehicleId);
      if (studentId) list = list.filter((a) => a.studentId === studentId);
      res.json({ success: true, data: { assignments: list } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// DELETE /transport/assignments/:id
router.delete('/assignments/:id',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('transport', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const assignment = assignments.get(req.params.id);
      if (!assignment || assignment.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Assignment not found' });
      }
      assignment.active = false;

      await logAudit(req, { action: 'delete', entity: 'transport_assignment', entityId: assignment.id, details: {} });
      res.json({ success: true, data: { assignment } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
