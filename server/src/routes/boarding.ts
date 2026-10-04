import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole, requirePermission } from '../middleware/rbac.js';
import { requireModule } from '../utils/modules.js';
import { logAudit } from '../middleware/auditLog.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticateToken);
router.use(requireModule('boarding'));

const ROLES = ['super_admin', 'admin', 'director'] as const;

interface BoardingRoom {
  id: string;
  schoolId: string;
  name: string;
  capacity: number;
  occupied: number;
  floor: string;
  active: boolean;
  createdAt: Date;
}

interface BoardingResident {
  id: string;
  schoolId: string;
  studentId: string;
  roomId: string;
  bedNumber: string;
  checkInDate: Date;
  checkOutDate: Date | null;
  active: boolean;
  createdAt: Date;
}

const rooms: Map<string, BoardingRoom> = new Map();
const residents: Map<string, BoardingResident> = new Map();

// GET /boarding/rooms
router.get('/rooms',
  requireRole(...ROLES),
  requirePermission('boarding', 'view'),
  async (req: Request, res: Response) => {
    try {
      const list = [...rooms.values()].filter((r) => r.schoolId === req.user!.schoolId);
      res.json({ success: true, data: { rooms: list } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /boarding/rooms
router.post('/rooms',
  requireRole('super_admin', 'admin', 'director'),
  requirePermission('boarding', 'manage'),
  body('name').isString().withMessage('Room name is required'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
  body('floor').optional().isString(),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { name, capacity, floor = '' } = req.body;
      const room: BoardingRoom = {
        id: uuidv4(),
        schoolId: req.user!.schoolId!,
        name,
        capacity,
        occupied: 0,
        floor,
        active: true,
        createdAt: new Date(),
      };
      rooms.set(room.id, room);

      await logAudit(req, { action: 'create', entity: 'boarding_room', entityId: room.id, details: { name, capacity } });
      res.status(201).json({ success: true, data: { room } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /boarding/residents — assign student to room
router.post('/residents',
  requireRole(...ROLES),
  requirePermission('boarding', 'manage'),
  body('studentId').isUUID().withMessage('Valid student ID is required'),
  body('roomId').isUUID().withMessage('Valid room ID is required'),
  body('bedNumber').isString().withMessage('Bed number is required'),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

      const { studentId, roomId, bedNumber } = req.body;
      const room = rooms.get(roomId);
      if (!room || room.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Room not found' });
      }
      if (room.occupied >= room.capacity) {
        return res.status(400).json({ success: false, error: 'Room is at full capacity' });
      }

      const resident: BoardingResident = {
        id: uuidv4(),
        schoolId: req.user!.schoolId!,
        studentId,
        roomId,
        bedNumber,
        checkInDate: new Date(),
        checkOutDate: null,
        active: true,
        createdAt: new Date(),
      };
      residents.set(resident.id, resident);
      room.occupied++;

      await logAudit(req, { action: 'create', entity: 'boarding_resident', entityId: resident.id, details: { studentId, roomId } });
      res.status(201).json({ success: true, data: { resident } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// POST /boarding/residents/:id/checkout
router.post('/residents/:id/checkout',
  requireRole(...ROLES),
  requirePermission('boarding', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const resident = residents.get(req.params.id);
      if (!resident || resident.schoolId !== req.user!.schoolId) {
        return res.status(404).json({ success: false, error: 'Resident not found' });
      }
      if (!resident.active) {
        return res.status(400).json({ success: false, error: 'Resident already checked out' });
      }

      resident.active = false;
      resident.checkOutDate = new Date();
      const room = rooms.get(resident.roomId);
      if (room && room.occupied > 0) room.occupied--;

      await logAudit(req, { action: 'checkout', entity: 'boarding_resident', entityId: resident.id, details: {} });
      res.json({ success: true, data: { resident } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

// GET /boarding/residents
router.get('/residents',
  requireRole(...ROLES),
  requirePermission('boarding', 'view'),
  async (req: Request, res: Response) => {
    try {
      const { roomId, active } = req.query;
      let list = [...residents.values()].filter((r) => r.schoolId === req.user!.schoolId);
      if (roomId) list = list.filter((r) => r.roomId === roomId);
      if (active !== undefined) list = list.filter((r) => r.active === (active === 'true'));
      res.json({ success: true, data: { residents: list } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
);

export default router;
