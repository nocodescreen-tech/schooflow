import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Grade — a single student's score on a specific assessment.
 *
 * This is the atomic unit of the academic engine. Every grade links:
 * - a student
 * - an assessment
 * - the period it belongs to (via assessment.evaluationPeriodId)
 *
 * The score is stored as DECIMAL to preserve precision (e.g. 14.75 / 20).
 * Validation against the assessment's maxScore happens at API level.
 *
 * Legacy denormalised fields (subjectId, coefficient, term, examType,
 * examName, status, academicYear, periodId, …) are kept as REAL columns
 * so the historical CRUD, bulletin and report code keeps working and so
 * the data is actually persisted (Sequelize silently dropped them before).
 */
class Grade extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare assessmentId: string | null;
  declare score: number;
  declare comment: string | null;
  declare isPublished: boolean;
  declare publishedAt: Date | null;
  declare publishedBy: string | null;
  declare createdBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // ─── Legacy denormalised fields ────────────────────────────────────
  declare subjectId: string | null;
  declare examType: string | null;
  declare examName: string | null;
  declare coefficient: number;
  declare term: number;
  declare date: Date | null;
  declare status: string;
  declare academicYear: string | null;
  declare academicYearId: string | null;
  declare periodId: string | null;
  declare absence: boolean;
  declare remark: string | null;
  declare maxScore: number | null;
}

Grade.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    assessmentId: { type: DataTypes.UUID, references: { model: 'assessments', key: 'id' }, onDelete: 'CASCADE' },
    score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      get() {
        const v = (this as unknown as { getDataValue: (k: string) => unknown }).getDataValue('score');
        return v === null || v === undefined ? v : Number(v);
      },
    },
    comment: { type: DataTypes.TEXT },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt: { type: DataTypes.DATE },
    publishedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    createdBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },

    // Legacy denormalised fields
    subjectId: { type: DataTypes.UUID, references: { model: 'subjects', key: 'id' }, onDelete: 'SET NULL' },
    examType: { type: DataTypes.STRING(50) },
    examName: { type: DataTypes.STRING(200) },
    coefficient: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 1,
      get() {
        const v = (this as unknown as { getDataValue: (k: string) => unknown }).getDataValue('coefficient');
        return v === null || v === undefined ? v : Number(v);
      },
    },
    term: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    date: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
    academicYear: { type: DataTypes.STRING(20) },
    academicYearId: { type: DataTypes.UUID, references: { model: 'academic_years', key: 'id' }, onDelete: 'SET NULL' },
    periodId: { type: DataTypes.UUID, references: { model: 'evaluation_periods', key: 'id' }, onDelete: 'SET NULL' },
    absence: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    remark: { type: DataTypes.TEXT },
    maxScore: {
      type: DataTypes.DECIMAL(5, 2),
      get() {
        const v = (this as unknown as { getDataValue: (k: string) => unknown }).getDataValue('maxScore');
        return v === null || v === undefined ? v : Number(v);
      },
    },
  },
  {
    sequelize,
    tableName: 'grades',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['student_id', 'assessment_id'] },
      { fields: ['school_id', 'student_id'] },
      { fields: ['assessment_id'] },
      { fields: ['subject_id'] },
      { fields: ['period_id'] },
      { fields: ['academic_year_id'] },
    ],
  }
);

export default Grade;
