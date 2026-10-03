import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'schoolflow-dev-secret-key-change-in-production';

interface AuthenticatedSocket extends Socket {
  user?: AuthUser;
  schoolId?: string;
}

interface ServerToClientEvents {
  payment: (data: PaymentEvent) => void;
  attendance: (data: AttendanceEvent) => void;
  notification: (data: NotificationEvent) => void;
  announcement: (data: AnnouncementEvent) => void;
  dashboard: (data: DashboardEvent) => void;
  document: (data: DocumentEvent) => void;
  fee: (data: FeeEvent) => void;
  grade: (data: GradeEvent) => void;
  student: (data: StudentEvent) => void;
  teacher: (data: TeacherEvent) => void;
  class: (data: ClassEvent) => void;
}

interface ClientToServerEvents {
  authenticate: (token: string, callback: (response: AuthResponse) => void) => void;
  subscribe: (room: string) => void;
  unsubscribe: (room: string) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  user?: AuthUser;
  schoolId?: string;
}

interface AuthResponse {
  success: boolean;
  error?: string;
}

interface PaymentEvent {
  id: string;
  amount: number;
  method: string;
  reference: string;
  studentId: string;
  studentName: string;
  className?: string;
  feeType?: string;
  date: string;
  action: 'created' | 'updated' | 'deleted';
}

interface AttendanceEvent {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  date: string;
  action: 'created' | 'updated' | 'deleted';
}

interface NotificationEvent {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface AnnouncementEvent {
  id: string;
  title: string;
  content: string;
  audience: string;
  authorId: string;
  authorName: string;
  publishedAt: string;
  action: 'created' | 'updated' | 'deleted';
}

interface DashboardEvent {
  type: 'kpi_update' | 'chart_update' | 'alert';
  data: Record<string, unknown>;
}

interface DocumentEvent {
  id: string;
  title: string;
  documentType: string;
  studentId?: string;
  studentName?: string;
  templateId: string;
  templateName: string;
  status: string;
  action: 'generated' | 'updated' | 'deleted' | 'status_changed';
}

interface FeeEvent {
  id: string;
  studentId: string;
  studentName: string;
  className?: string;
  type: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: string;
  action: 'created' | 'updated' | 'deleted' | 'overdue';
}

interface GradeEvent {
  id: string;
  studentId: string;
  studentName: string;
  className?: string;
  subjectId: string;
  subjectName: string;
  score: number;
  coefficient: number;
  term: number;
  academicYear: string;
  action: 'created' | 'updated' | 'deleted';
}

interface StudentEvent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classId?: string;
  className?: string;
  status: string;
  action: 'created' | 'updated' | 'deleted' | 'enrolled' | 'archived';
}

interface TeacherEvent {
  id: string;
  name: string;
  email: string;
  subjectIds?: string[];
  classIds?: string[];
  action: 'created' | 'updated' | 'deleted' | 'assigned';
}

interface ClassEvent {
  id: string;
  name: string;
  level?: string;
  teacherId?: string;
  teacherName?: string;
  studentCount: number;
  action: 'created' | 'updated' | 'deleted' | 'teacher_assigned';
}

let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

export function initWebSocket(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
        : ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;

      const { User } = await import('../models/index.js');
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'isActive', 'status', 'tokenVersion', 'mustChangePassword', 'lockedUntil'],
      });

      if (!user || !user.isActive) {
        return next(new Error('User not found or inactive'));
      }

      const status = (user as { status?: string }).status || 'active';
      if (['suspended', 'disabled', 'archived'].includes(status)) {
        return next(new Error(`Account ${status}`));
      }

      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        return next(new Error('Account temporarily locked'));
      }

      socket.user = { ...decoded, mustChangePassword: Boolean(user.mustChangePassword) };
      socket.schoolId = decoded.schoolId;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`WebSocket connected: ${socket.user?.email} (school: ${socket.schoolId})`);

    if (socket.schoolId) {
      socket.join(`school:${socket.schoolId}`);
    }

    socket.on('subscribe', (room: string) => {
      if (room.startsWith('school:') && room !== `school:${socket.schoolId}`) {
        return;
      }
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('unsubscribe', (room: string) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${socket.user?.email} - ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`WebSocket error for ${socket.user?.email}:`, error);
    });
  });

  return io;
}

export function getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null {
  return io;
}

export function emitToSchool(
  schoolId: string,
  event: keyof ServerToClientEvents,
  data: PaymentEvent | AttendanceEvent | NotificationEvent | AnnouncementEvent | DashboardEvent | DocumentEvent | FeeEvent | GradeEvent | StudentEvent | TeacherEvent | ClassEvent
): void {
  if (!io) return;
  io.to(`school:${schoolId}`).emit(event, data);
}

export function emitToUser(userId: string, event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToRoom(room: string, event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) return;
  io.to(room).emit(event, data);
}

export function broadcastToAll(event: keyof ServerToClientEvents, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}

export const WebSocketEvents = {
  payment: {
    created: (schoolId: string, data: PaymentEvent) => emitToSchool(schoolId, 'payment', { ...data, action: 'created' }),
    updated: (schoolId: string, data: PaymentEvent) => emitToSchool(schoolId, 'payment', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: PaymentEvent) => emitToSchool(schoolId, 'payment', { ...data, action: 'deleted' }),
  },
  attendance: {
    created: (schoolId: string, data: AttendanceEvent) => emitToSchool(schoolId, 'attendance', { ...data, action: 'created' }),
    updated: (schoolId: string, data: AttendanceEvent) => emitToSchool(schoolId, 'attendance', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: AttendanceEvent) => emitToSchool(schoolId, 'attendance', { ...data, action: 'deleted' }),
  },
  notification: {
    created: (schoolId: string, data: NotificationEvent) => emitToSchool(schoolId, 'notification', data),
    read: (schoolId: string, data: NotificationEvent) => emitToSchool(schoolId, 'notification', data),
  },
  announcement: {
    created: (schoolId: string, data: AnnouncementEvent) => emitToSchool(schoolId, 'announcement', { ...data, action: 'created' }),
    updated: (schoolId: string, data: AnnouncementEvent) => emitToSchool(schoolId, 'announcement', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: AnnouncementEvent) => emitToSchool(schoolId, 'announcement', { ...data, action: 'deleted' }),
  },
  dashboard: {
    kpiUpdate: (schoolId: string, data: Record<string, unknown>) =>
      emitToSchool(schoolId, 'dashboard', { type: 'kpi_update', data }),
    chartUpdate: (schoolId: string, data: Record<string, unknown>) =>
      emitToSchool(schoolId, 'dashboard', { type: 'chart_update', data }),
    alert: (schoolId: string, data: Record<string, unknown>) =>
      emitToSchool(schoolId, 'dashboard', { type: 'alert', data }),
  },
  document: {
    generated: (schoolId: string, data: DocumentEvent) => emitToSchool(schoolId, 'document', { ...data, action: 'generated' }),
    updated: (schoolId: string, data: DocumentEvent) => emitToSchool(schoolId, 'document', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: DocumentEvent) => emitToSchool(schoolId, 'document', { ...data, action: 'deleted' }),
    statusChanged: (schoolId: string, data: DocumentEvent) => emitToSchool(schoolId, 'document', { ...data, action: 'status_changed' }),
  },
  fee: {
    created: (schoolId: string, data: FeeEvent) => emitToSchool(schoolId, 'fee', { ...data, action: 'created' }),
    updated: (schoolId: string, data: FeeEvent) => emitToSchool(schoolId, 'fee', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: FeeEvent) => emitToSchool(schoolId, 'fee', { ...data, action: 'deleted' }),
    overdue: (schoolId: string, data: FeeEvent) => emitToSchool(schoolId, 'fee', { ...data, action: 'overdue' }),
  },
  grade: {
    created: (schoolId: string, data: GradeEvent) => emitToSchool(schoolId, 'grade', { ...data, action: 'created' }),
    updated: (schoolId: string, data: GradeEvent) => emitToSchool(schoolId, 'grade', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: GradeEvent) => emitToSchool(schoolId, 'grade', { ...data, action: 'deleted' }),
  },
  student: {
    created: (schoolId: string, data: StudentEvent) => emitToSchool(schoolId, 'student', { ...data, action: 'created' }),
    updated: (schoolId: string, data: StudentEvent) => emitToSchool(schoolId, 'student', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: StudentEvent) => emitToSchool(schoolId, 'student', { ...data, action: 'deleted' }),
    enrolled: (schoolId: string, data: StudentEvent) => emitToSchool(schoolId, 'student', { ...data, action: 'enrolled' }),
    archived: (schoolId: string, data: StudentEvent) => emitToSchool(schoolId, 'student', { ...data, action: 'archived' }),
  },
  teacher: {
    created: (schoolId: string, data: TeacherEvent) => emitToSchool(schoolId, 'teacher', { ...data, action: 'created' }),
    updated: (schoolId: string, data: TeacherEvent) => emitToSchool(schoolId, 'teacher', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: TeacherEvent) => emitToSchool(schoolId, 'teacher', { ...data, action: 'deleted' }),
    assigned: (schoolId: string, data: TeacherEvent) => emitToSchool(schoolId, 'teacher', { ...data, action: 'assigned' }),
  },
  class: {
    created: (schoolId: string, data: ClassEvent) => emitToSchool(schoolId, 'class', { ...data, action: 'created' }),
    updated: (schoolId: string, data: ClassEvent) => emitToSchool(schoolId, 'class', { ...data, action: 'updated' }),
    deleted: (schoolId: string, data: ClassEvent) => emitToSchool(schoolId, 'class', { ...data, action: 'deleted' }),
    teacherAssigned: (schoolId: string, data: ClassEvent) => emitToSchool(schoolId, 'class', { ...data, action: 'teacher_assigned' }),
  },
};