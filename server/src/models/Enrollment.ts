import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Dossier de candidature / inscription (§11 — CANDIDAT → DOSSIER → ADMISSION →
 * MATRICULE → AFFECTATION CLASSE → INSCRIPTION VALIDÉE → COMPTE ÉLÈVE).
 *
 * A dossier exists BEFORE the student does. Nothing here creates a school
 * record: admission only decides, and `EnrollmentService.enrollDossier` is the
 * single step that turns an accepted dossier into a Student (and, optionally,
 * an account or an activation code).
 *
 * Rejected and waitlisted dossiers are never deleted — they are the school's
 * record of what it decided and why.
 */

export type EnrollmentStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'waitlisted'
  | 'rejected'
  | 'enrolled'
  | 'withdrawn';

class Enrollment extends Model {
  declare id: string;
  declare schoolId: string;
  declare academicYearId: string;
  /** Class the applicant is asking for; resolved to a real class on enrollment. */
  declare requestedClassId: string | null;

  // Candidate identity
  declare firstName: string;
  declare lastName: string;
  declare dateOfBirth: Date | null;
  declare gender: 'M' | 'F' | null;
  declare birthPlace: string | null;
  declare nationality: string | null;

  // Contact
  declare address: string | null;
  declare phone: string | null;
  declare email: string | null;

  // Guardian
  declare guardianName: string | null;
  declare guardianPhone: string | null;
  declare guardianEmail: string | null;
  declare guardianRelation: string | null;

  // Previous school
  declare previousSchool: string | null;
  declare previousClass: string | null;
  declare previousAverage: string | null;

  /** Document checklist, e.g. { birthCertificate: true, ... }. No binary files. */
  declare documents: Record<string, boolean>;

  declare status: EnrollmentStatus;
  /** Position on the waiting list, recomputed when the school decides. */
  declare waitlistPosition: number | null;

  /** Reference code the applicant can quote; unique inside the school. */
  declare reference: string;

  // Admission
  declare studentId: string | null;
  declare matricule: string | null;
  declare decisionNote: string | null;
  declare decidedAt: Date | null;
  declare decidedBy: string | null;
  declare appliedAt: Date | null;
  declare createdBy: string | null;
  declare withdrawnAt: Date | null;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

Enrollment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    academicYearId: { type: DataTypes.UUID, allowNull: false, references: { model: 'academic_years', key: 'id' }, onDelete: 'CASCADE' },
    requestedClassId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'SET NULL' },

    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    dateOfBirth: { type: DataTypes.DATE },
    gender: { type: DataTypes.ENUM('M', 'F') },
    birthPlace: { type: DataTypes.STRING(255) },
    nationality: { type: DataTypes.STRING(255) },

    address: { type: DataTypes.TEXT },
    phone: { type: DataTypes.STRING(50) },
    email: { type: DataTypes.STRING(255) },

    guardianName: { type: DataTypes.STRING(255) },
    guardianPhone: { type: DataTypes.STRING(50) },
    guardianEmail: { type: DataTypes.STRING(255) },
    guardianRelation: { type: DataTypes.STRING(80) },

    previousSchool: { type: DataTypes.STRING(255) },
    previousClass: { type: DataTypes.STRING(80) },
    // String, not Float: an admission average is a decimal, and the DB keeps it exact.
    previousAverage: { type: DataTypes.DECIMAL(5, 2) },

    documents: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    status: {
      type: DataTypes.ENUM('draft', 'submitted', 'under_review', 'accepted', 'waitlisted', 'rejected', 'enrolled', 'withdrawn'),
      allowNull: false,
      defaultValue: 'draft',
    },
    waitlistPosition: { type: DataTypes.INTEGER },

    reference: { type: DataTypes.STRING(24), allowNull: false },

    studentId: { type: DataTypes.UUID, references: { model: 'students', key: 'id' }, onDelete: 'SET NULL' },
    matricule: { type: DataTypes.STRING(20) },
    decisionNote: { type: DataTypes.TEXT },
    decidedAt: { type: DataTypes.DATE },
    decidedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    appliedAt: { type: DataTypes.DATE },
    createdBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    withdrawnAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    tableName: 'enrollments',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['school_id', 'status'] },
      { fields: ['school_id', 'academic_year_id'] },
      { unique: true, fields: ['school_id', 'reference'] },
    ],
  }
);

export default Enrollment;