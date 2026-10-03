import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../components/Toast';

export interface PaymentEvent {
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

export interface AttendanceEvent {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  date: string;
  action: 'created' | 'updated' | 'deleted';
}

export interface NotificationEvent {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AnnouncementEvent {
  id: string;
  title: string;
  content: string;
  audience: string;
  authorId: string;
  authorName: string;
  publishedAt: string;
  action: 'created' | 'updated' | 'deleted';
}

export interface DashboardEvent {
  type: 'kpi_update' | 'chart_update' | 'alert';
  data: Record<string, unknown>;
}

export interface DocumentEvent {
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

export interface FeeEvent {
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

export interface GradeEvent {
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

export interface StudentEvent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classId?: string;
  className?: string;
  status: string;
  action: 'created' | 'updated' | 'deleted' | 'enrolled' | 'archived';
}

export interface TeacherEvent {
  id: string;
  name: string;
  email: string;
  subjectIds?: string[];
  classIds?: string[];
  action: 'created' | 'updated' | 'deleted' | 'assigned';
}

export interface ClassEvent {
  id: string;
  name: string;
  level?: string;
  teacherId?: string;
  teacherName?: string;
  studentCount: number;
  action: 'created' | 'updated' | 'deleted' | 'teacher_assigned';
}

type EventMap = {
  payment: PaymentEvent;
  attendance: AttendanceEvent;
  notification: NotificationEvent;
  announcement: AnnouncementEvent;
  dashboard: DashboardEvent;
  document: DocumentEvent;
  fee: FeeEvent;
  grade: GradeEvent;
  student: StudentEvent;
  teacher: TeacherEvent;
  class: ClassEvent;
};

type EventHandler<K extends keyof EventMap> = (data: EventMap[K]) => void;

interface ConnectionEvents {
  connected: void;
  disconnected: string;
}

type ConnectionEventKey = keyof ConnectionEvents;

class WebSocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private handlers: Map<string, Set<Function>> = new Map();
  private connectionHandlers: Map<ConnectionEventKey, Set<Function>> = new Map();
  private connectionPromise: Promise<void> | null = null;

  connect(token: string): Promise<void> {
    this.token = token;

    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      // Use relative WebSocket URL - socket.io handles it automatically
      const wsUrl = typeof window !== 'undefined' ? window.location.origin : '';

      this.socket = io(wsUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.emitConnection('connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error.message);
        this.reconnectAttempts++;
        this.isConnecting = false;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Max reconnection attempts reached'));
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        this.emitConnection('disconnected', reason);
      });

      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Register all event handlers
      const events: (keyof EventMap)[] = [
        'payment', 'attendance', 'notification', 'announcement',
        'dashboard', 'document', 'fee', 'grade', 'student', 'teacher', 'class'
      ];

      for (const event of events) {
        this.socket?.on(event, (data: EventMap[keyof EventMap]) => {
          this.emit(event, data);
        });
      }
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.token = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
  }

  subscribe(room: string): void {
    this.socket?.emit('subscribe', room);
  }

  unsubscribe(room: string): void {
    this.socket?.emit('unsubscribe', room);
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.off(event, handler);
    };
  }

  onConnection(event: ConnectionEventKey, handler: (data: ConnectionEvents[ConnectionEventKey]) => void): () => void {
    if (!this.connectionHandlers.has(event)) {
      this.connectionHandlers.set(event, new Set());
    }
    this.connectionHandlers.get(event)!.add(handler);

    return () => {
      this.connectionHandlers.get(event)?.delete(handler);
    };
  }

  off<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in WebSocket handler for ${event}:`, error);
      }
    });
  }

  private emitConnection<K extends ConnectionEventKey>(event: K, data?: ConnectionEvents[K]): void {
    this.connectionHandlers.get(event)?.forEach(handler => {
      try {
        handler(data as ConnectionEvents[K]);
      } catch (error) {
        console.error(`Error in WebSocket connection handler for ${event}:`, error);
      }
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

const wsService = new WebSocketService();

export function useWebSocket() {
  const token = useAuthStore(state => state.token);
  const addToast = useToastStore(state => state.addToast);
  const [isConnected, setIsConnected] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!token || initializedRef.current) return;

    initializedRef.current = true;

    const cleanupConnected = wsService.onConnection('connected', () => {
      setIsConnected(true);
    });

    const cleanupDisconnected = wsService.onConnection('disconnected', () => {
      setIsConnected(false);
    });

    wsService.connect(token).catch(error => {
      console.error('Failed to connect WebSocket:', error);
      initializedRef.current = false;
    });

    return () => {
      cleanupConnected();
      cleanupDisconnected();
    };
  }, [token]);

  const onPayment = useCallback((handler: (data: PaymentEvent) => void) => wsService.on('payment', handler), []);
  const onAttendance = useCallback((handler: (data: AttendanceEvent) => void) => wsService.on('attendance', handler), []);
  const onNotification = useCallback((handler: (data: NotificationEvent) => void) => wsService.on('notification', handler), []);
  const onAnnouncement = useCallback((handler: (data: AnnouncementEvent) => void) => wsService.on('announcement', handler), []);
  const onDashboard = useCallback((handler: (data: DashboardEvent) => void) => wsService.on('dashboard', handler), []);
  const onDocument = useCallback((handler: (data: DocumentEvent) => void) => wsService.on('document', handler), []);
  const onFee = useCallback((handler: (data: FeeEvent) => void) => wsService.on('fee', handler), []);
  const onGrade = useCallback((handler: (data: GradeEvent) => void) => wsService.on('grade', handler), []);
  const onStudent = useCallback((handler: (data: StudentEvent) => void) => wsService.on('student', handler), []);
  const onTeacher = useCallback((handler: (data: TeacherEvent) => void) => wsService.on('teacher', handler), []);
  const onClass = useCallback((handler: (data: ClassEvent) => void) => wsService.on('class', handler), []);

  // Auto-show toasts for important events
  useEffect(() => {
    const cleanup = onNotification((data) => {
      if (!data.isRead) {
        addToast('info', data.title);
      }
    });
    return cleanup;
  }, [onNotification, addToast]);

  useEffect(() => {
    const cleanup = onPayment((data) => {
      if (data.action === 'created') {
        addToast('success', `Nouveau paiement : ${data.studentName} - ${data.amount.toLocaleString()} FC`);
      }
    });
    return cleanup;
  }, [onPayment, addToast]);

  useEffect(() => {
    const cleanup = onAnnouncement((data) => {
      if (data.action === 'created') {
        addToast('info', `Nouvelle annonce : ${data.title}`);
      }
    });
    return cleanup;
  }, [onAnnouncement, addToast]);

  useEffect(() => {
    const cleanup = onAttendance((data) => {
      if (data.action === 'created' && data.status === 'absent') {
        addToast('warning', `Absence signalée : ${data.studentName} (${data.className})`);
      }
    });
    return cleanup;
  }, [onAttendance, addToast]);

  const subscribe = useCallback((room: string) => wsService.subscribe(room), []);
  const unsubscribe = useCallback((room: string) => wsService.unsubscribe(room), []);

  return {
    isConnected,
    onPayment,
    onAttendance,
    onNotification,
    onAnnouncement,
    onDashboard,
    onDocument,
    onFee,
    onGrade,
    onStudent,
    onTeacher,
    onClass,
    subscribe,
    unsubscribe,
    connect: () => wsService.connect(token!),
    disconnect: () => wsService.disconnect(),
  };
}

export { wsService };
export default wsService;