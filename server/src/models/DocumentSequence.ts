import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * DocumentSequence — the official counter behind every document number.
 *
 * §5: a number must be unique, sequential, traceable, linked to the school and
 * to the academic year, recorded, and never random. That is exactly what this
 * row holds.
 *
 * Concurrency: allocation locks the row (`SELECT … FOR UPDATE`) inside the
 * caller's transaction, so two simultaneous receipts can never receive the same
 * number. Two admins generating at the same time is normal in a school.
 */
class DocumentSequence extends Model {
  declare id: string;
  declare schoolId: string;
  /** DOCUMENT_TYPES value, e.g. 'recu'. */
  declare documentType: string;
  declare academicYearId: string | null;
  /**
   * Non-null scope key of the counter: the academic year id, or `'all'` when
   * the school's numbering rule says the sequence spans years.
   *
   * It exists because Postgres treats NULLs as distinct in a unique index, so a
   * nullable `academic_year_id` would happily produce two counters for the very
   * same scope. The unique index is built on this column instead.
   */
  declare scopeKey: string;
  /** Calendar year embedded in the number: REC-2026-000145. */
  declare period: number;
  declare prefix: string;
  declare padding: number;
  /** Last value handed out; the next allocation is `lastNumber + 1`. */
  declare lastNumber: number;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

DocumentSequence.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    documentType: { type: DataTypes.STRING(50), allowNull: false },
    academicYearId: { type: DataTypes.UUID, references: { model: 'academic_years', key: 'id' }, onDelete: 'CASCADE' },
    scopeKey: { type: DataTypes.STRING(40), allowNull: false },
    period: { type: DataTypes.INTEGER, allowNull: false },
    prefix: { type: DataTypes.STRING(10), allowNull: false },
    padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
    lastNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'document_sequences',
    timestamps: true,
    underscored: true,
    indexes: [
      // One counter per (school, type, scope). Unique ⇒ never two counters for
      // the same scope, which is what would break sequential numbering.
      { unique: true, fields: ['school_id', 'document_type', 'scope_key'] },
    ],
  }
);

export default DocumentSequence;