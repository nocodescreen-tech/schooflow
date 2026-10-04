import fs from 'fs';
import path from 'path';
import { Sequelize } from 'sequelize';
import {
  School,
  User,
  Student,
  Class,
  Subject,
  Grade,
  Attendance,
  Fee,
  Payment,
  ReportCard,
  Notification,
  AuditLog,
  VacationTicket,
  OTPCode,
  Timetable,
  CashTransaction,
  Document,
  DocumentTemplate,
  GeneratedDocument,
  Announcement,
  Message,
  Permission,
  Role,
  RolePermission,
  UserRole,
  UserScope,
  RefreshToken,
  Parent,
  StudentParent,
  AcademicYear,
  Incident,
  Sanction,
  Convocation,
  CalendarEvent,
  Cycle,
  Filiere,
  Section,
  Option,
  Niveau,
  SchoolModule,
  UserPermissionOverride,
  Delegation,
  Assignment,
  PasswordResetToken,
  ActivationCode,
  EvaluationPeriod,
  Assessment,
  GradingConfig,
  PromotionDecision,
  ExchangeRate,
  Enrollment,
  SchoolIdentity,
  DocumentSequence,
  OtpChallenge,
} from '../models/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BackupType = 'full' | 'incremental';
export type BackupStatus = 'pending' | 'completed' | 'failed' | 'restored';

export interface BackupRecord {
  id: string;
  filename: string;
  type: BackupType;
  status: BackupStatus;
  size: number;
  createdAt: string;
  completedAt: string | null;
  tables: string[];
  rowCounts: Record<string, number>;
  error?: string;
  createdBy?: string;
}

export interface BackupManifest {
  version: string;
  createdAt: string;
  type: BackupType;
  tables: string[];
  rowCounts: Record<string, number>;
  sequelizeVersion: string;
}

export interface RestoreOptions {
  confirm: boolean;
  tables?: string[];
}

export interface CleanupOptions {
  maxAgeDays?: number;
  maxBackups?: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
const BACKUP_VERSION = '1.0.0';
const MANIFEST_FILE = 'manifest.json';

// ─── Model registry ─────────────────────────────────────────────────────────

interface ModelEntry {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
}

const MODELS: ModelEntry[] = [
  { name: 'School', model: School },
  { name: 'User', model: User },
  { name: 'Student', model: Student },
  { name: 'Class', model: Class },
  { name: 'Subject', model: Subject },
  { name: 'Grade', model: Grade },
  { name: 'Attendance', model: Attendance },
  { name: 'Fee', model: Fee },
  { name: 'Payment', model: Payment },
  { name: 'ReportCard', model: ReportCard },
  { name: 'Notification', model: Notification },
  { name: 'AuditLog', model: AuditLog },
  { name: 'VacationTicket', model: VacationTicket },
  { name: 'OTPCode', model: OTPCode },
  { name: 'Timetable', model: Timetable },
  { name: 'CashTransaction', model: CashTransaction },
  { name: 'Document', model: Document },
  { name: 'DocumentTemplate', model: DocumentTemplate },
  { name: 'GeneratedDocument', model: GeneratedDocument },
  { name: 'Announcement', model: Announcement },
  { name: 'Message', model: Message },
  { name: 'Permission', model: Permission },
  { name: 'Role', model: Role },
  { name: 'RolePermission', model: RolePermission },
  { name: 'UserRole', model: UserRole },
  { name: 'UserScope', model: UserScope },
  { name: 'RefreshToken', model: RefreshToken },
  { name: 'Parent', model: Parent },
  { name: 'StudentParent', model: StudentParent },
  { name: 'AcademicYear', model: AcademicYear },
  { name: 'Incident', model: Incident },
  { name: 'Sanction', model: Sanction },
  { name: 'Convocation', model: Convocation },
  { name: 'CalendarEvent', model: CalendarEvent },
  { name: 'Cycle', model: Cycle },
  { name: 'Filiere', model: Filiere },
  { name: 'Section', model: Section },
  { name: 'Option', model: Option },
  { name: 'Niveau', model: Niveau },
  { name: 'SchoolModule', model: SchoolModule },
  { name: 'UserPermissionOverride', model: UserPermissionOverride },
  { name: 'Delegation', model: Delegation },
  { name: 'Assignment', model: Assignment },
  { name: 'PasswordResetToken', model: PasswordResetToken },
  { name: 'ActivationCode', model: ActivationCode },
  { name: 'EvaluationPeriod', model: EvaluationPeriod },
  { name: 'Assessment', model: Assessment },
  { name: 'GradingConfig', model: GradingConfig },
  { name: 'PromotionDecision', model: PromotionDecision },
  { name: 'ExchangeRate', model: ExchangeRate },
  { name: 'Enrollment', model: Enrollment },
  { name: 'SchoolIdentity', model: SchoolIdentity },
  { name: 'DocumentSequence', model: DocumentSequence },
  { name: 'OtpChallenge', model: OtpChallenge },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getManifestPath(): string {
  return path.join(BACKUP_DIR, MANIFEST_FILE);
}

function loadManifest(): BackupRecord[] {
  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw) as BackupRecord[];
  } catch {
    return [];
  }
}

function saveManifest(records: BackupRecord[]): void {
  ensureBackupDir();
  fs.writeFileSync(getManifestPath(), JSON.stringify(records, null, 2), 'utf-8');
}

function generateBackupId(): string {
  return `backup_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function getBackupFilePath(id: string, tableName: string): string {
  return path.join(BACKUP_DIR, `${id}__${tableName}.json`);
}

function getBackupSize(id: string): number {
  let total = 0;
  const entries = loadManifest();
  const record = entries.find((r) => r.id === id);
  if (!record) return 0;
  for (const table of record.tables) {
    const filePath = getBackupFilePath(id, table);
    if (fs.existsSync(filePath)) {
      total += fs.statSync(filePath).size;
    }
  }
  return total;
}

// ─── Core operations ────────────────────────────────────────────────────────

/**
 * Create a new backup of the database.
 * Exports schema and data for all registered models to JSON files.
 */
export async function createBackup(
  type: BackupType = 'full',
  createdBy?: string
): Promise<BackupRecord> {
  ensureBackupDir();

  const id = generateBackupId();
  const timestamp = new Date().toISOString();
  const tables: string[] = [];
  const rowCounts: Record<string, number> = {};

  const record: BackupRecord = {
    id,
    filename: `${id}.json`,
    type,
    status: 'pending',
    size: 0,
    createdAt: timestamp,
    completedAt: null,
    tables,
    rowCounts,
    createdBy,
  };

  // Add to manifest immediately so it shows as pending
  const entries = loadManifest();
  entries.push(record);
  saveManifest(entries);

  try {
    for (const { name, model } of MODELS) {
      const rows = await model.findAll({ raw: true });
      const filePath = getBackupFilePath(id, name);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8');
      tables.push(name);
      rowCounts[name] = rows.length;
    }

    // Write manifest for this specific backup
    const backupManifest: BackupManifest = {
      version: BACKUP_VERSION,
      createdAt: timestamp,
      type,
      tables,
      rowCounts,
      sequelizeVersion: '6.37.0',
    };
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${id}__manifest.json`),
      JSON.stringify(backupManifest, null, 2),
      'utf-8'
    );

    // Update record
    record.status = 'completed';
    record.completedAt = new Date().toISOString();
    record.size = getBackupSize(id);

    // Update manifest
    const updatedEntries = loadManifest();
    const idx = updatedEntries.findIndex((r) => r.id === id);
    if (idx !== -1) {
      updatedEntries[idx] = record;
      saveManifest(updatedEntries);
    }

    return record;
  } catch (error) {
    record.status = 'failed';
    record.error = (error as Error).message;
    record.completedAt = new Date().toISOString();

    const updatedEntries = loadManifest();
    const idx = updatedEntries.findIndex((r) => r.id === id);
    if (idx !== -1) {
      updatedEntries[idx] = record;
      saveManifest(updatedEntries);
    }

    throw error;
  }
}

/**
 * List all backups from the manifest.
 */
export function listBackups(): BackupRecord[] {
  const entries = loadManifest();
  // Return sorted by date descending
  return entries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get a single backup by ID.
 */
export function getBackup(id: string): BackupRecord | null {
  const entries = loadManifest();
  return entries.find((r) => r.id === id) || null;
}

/**
 * Restore the database from a backup.
 * Requires explicit confirmation to prevent accidental data loss.
 */
export async function restoreBackup(
  id: string,
  options: RestoreOptions
): Promise<{ restored: string[]; errors: string[] }> {
  if (!options.confirm) {
    throw new Error('Restore requires explicit confirmation. Set confirm: true to proceed.');
  }

  const record = getBackup(id);
  if (!record) {
    throw new Error(`Backup not found: ${id}`);
  }

  if (record.status !== 'completed') {
    throw new Error(`Cannot restore from backup with status: ${record.status}`);
  }

  const tablesToRestore = options.tables || record.tables;
  const restored: string[] = [];
  const errors: string[] = [];

  for (const tableName of tablesToRestore) {
    const entry = MODELS.find((m) => m.name === tableName);
    if (!entry) {
      errors.push(`Unknown table: ${tableName}`);
      continue;
    }

    const filePath = getBackupFilePath(id, tableName);
    if (!fs.existsSync(filePath)) {
      errors.push(`Backup file not found for table: ${tableName}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const rows = JSON.parse(raw) as Record<string, unknown>[];

      // Use bulkCreate with upsert-like behavior
      // First, try to delete existing data for clean restore
      await entry.model.destroy({ where: {}, truncate: true });

      // Insert in batches to avoid memory issues
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await entry.model.bulkCreate(batch, {
          validate: false,
          hooks: false,
        });
      }

      restored.push(tableName);
    } catch (error) {
      errors.push(`Failed to restore ${tableName}: ${(error as Error).message}`);
    }
  }

  // Update record status
  const entries = loadManifest();
  const idx = entries.findIndex((r) => r.id === id);
  if (idx !== -1) {
    entries[idx].status = 'restored';
    saveManifest(entries);
  }

  return { restored, errors };
}

/**
 * Delete a backup and its associated files.
 */
export function deleteBackup(id: string): boolean {
  const entries = loadManifest();
  const record = entries.find((r) => r.id === id);
  if (!record) return false;

  // Delete table files
  for (const table of record.tables) {
    const filePath = getBackupFilePath(id, table);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Delete backup manifest
  const backupManifestPath = path.join(BACKUP_DIR, `${id}__manifest.json`);
  if (fs.existsSync(backupManifestPath)) {
    fs.unlinkSync(backupManifestPath);
  }

  // Remove from manifest
  const updated = entries.filter((r) => r.id !== id);
  saveManifest(updated);

  return true;
}

/**
 * Clean up old backups based on retention policy.
 * Removes backups older than maxAgeDays and keeps at most maxBackups.
 */
export function cleanupOldBackups(options: CleanupOptions = {}): {
  deleted: string[];
  kept: string[];
} {
  const maxAgeDays = options.maxAgeDays || 30;
  const maxBackups = options.maxBackups || 10;

  const entries = loadManifest();
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  // Sort by date descending (newest first)
  const sorted = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const deleted: string[] = [];
  const kept: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const record = sorted[i];
    const age = now - new Date(record.createdAt).getTime();
    const isTooOld = age > maxAgeMs;
    const isBeyondRetention = i >= maxBackups;

    if (isTooOld || isBeyondRetention) {
      deleteBackup(record.id);
      deleted.push(record.id);
    } else {
      kept.push(record.id);
    }
  }

  return { deleted, kept };
}

/**
 * Get the configured backup directory path.
 */
export function getBackupDir(): string {
  return BACKUP_DIR;
}

/**
 * Validate that a backup is complete and all files exist.
 */
export function validateBackup(id: string): {
  valid: boolean;
  missing: string[];
  record: BackupRecord | null;
} {
  const record = getBackup(id);
  if (!record) {
    return { valid: false, missing: [], record: null };
  }

  const missing: string[] = [];
  for (const table of record.tables) {
    const filePath = getBackupFilePath(id, table);
    if (!fs.existsSync(filePath)) {
      missing.push(table);
    }
  }

  return { valid: missing.length === 0, missing, record };
}

// ─── Export ─────────────────────────────────────────────────────────────────

export default {
  createBackup,
  listBackups,
  getBackup,
  restoreBackup,
  deleteBackup,
  cleanupOldBackups,
  getBackupDir,
  validateBackup,
};
