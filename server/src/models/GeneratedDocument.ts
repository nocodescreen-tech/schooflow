import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import { DOCUMENT_TYPES, type DocumentType } from './SchoolIdentity.js';

/**
 * A document the school officially issued.
 *
 * Two guarantees this table exists to provide:
 *
 * 1. TRACEABILITY — every issued document has a unique number allocated from a
 *    `DocumentSequence`, never a random string, and never reused inside a
 *    school (the unique index is per school, not global, because two schools
 *    may legitimately both start at REC-2026-000001).
 *
 * 2. HISTORICAL INTEGRITY (§16, §17) — `identitySnapshot` freezes the school
 *    identity and `templateVersion` freezes the template as they were at the
 *    moment of issue. If the school renames itself, moves, or changes its logo
 *    in 2027, a receipt printed in 2026 still shows the 2026 identity.
 */

class GeneratedDocument extends Model {
  declare id: string;
  declare schoolId: string;
  declare templateId: string | null;
  /** DOCUMENT_TYPES value. */
  declare documentType: DocumentType | string;
  declare studentId: string | null;
  declare academicYearId: string | null;
  declare filePath: string;
  declare title: string;

  /** REC-2026-000145 — allocated, never random, unique inside the school. */
  declare documentNumber: string;

  /**
   * Short opaque code printed next to the QR so a holder can check the two
   * match by eye. Derived from the id, so it is stable and non-guessable.
   */
  declare verificationCode: string;

  declare status: 'DRAFT' | 'GENERATED' | 'REVIEWED' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED' | 'REVOKED';

  /**
   * Frozen copy of the school identity used at issue time.
   * This is what §17 asks for: school name, logo, code, address, phone, email
   * as they were officially in force, never re-read from the live row.
   */
  declare identitySnapshot: Record<string, unknown>;

  /** Template version actually used, so a later v2 cannot rewrite a v1. */
  declare templateVersion: number | null;

  /** Snapshot of the data that was rendered (amounts, averages, list…). */
  declare dataSnapshot: Record<string, unknown> | null;

  declare issuedAt: Date | null;
  declare issuedBy: string | null;
  declare revokedAt: Date | null;
  declare revokedBy: string | null;
  declare revokeReason: string | null;
  /** Why the document exists: payment id, student id, period… */
  declare metadata: Record<string, unknown>;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

GeneratedDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    templateId: { type: DataTypes.UUID, references: { model: 'document_templates', key: 'id' }, onDelete: 'SET NULL' },
    documentType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'autre' },
    studentId: { type: DataTypes.UUID, references: { model: 'students', key: 'id' }, onDelete: 'SET NULL' },
    academicYearId: { type: DataTypes.UUID, references: { model: 'academic_years', key: 'id' }, onDelete: 'SET NULL' },
    filePath: { type: DataTypes.STRING(500), allowNull: false },
    title: { type: DataTypes.STRING(255) },

    documentNumber: { type: DataTypes.STRING(50), allowNull: false },
    verificationCode: { type: DataTypes.STRING(24), allowNull: false },

    status: {
      type: DataTypes.ENUM('DRAFT', 'GENERATED', 'REVIEWED', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'REVOKED'),
      allowNull: false,
      defaultValue: 'GENERATED',
    },

    identitySnapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    templateVersion: { type: DataTypes.INTEGER },
    dataSnapshot: { type: DataTypes.JSONB },

    issuedAt: { type: DataTypes.DATE },
    issuedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    revokedAt: { type: DataTypes.DATE },
    revokedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    revokeReason: { type: DataTypes.TEXT },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'generated_documents',
    timestamps: true,
    underscored: true,
    indexes: [
      // Unique INSIDE a school: REC-2026-000001 may exist at two schools.
      { unique: true, fields: ['school_id', 'document_number'] },
      { fields: ['school_id', 'document_type'] },
      { fields: ['verification_code'] },
    ],
  }
);

export { DOCUMENT_TYPES };
export default GeneratedDocument;