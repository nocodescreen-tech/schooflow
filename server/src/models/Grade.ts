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
 */
class Grade extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare assessmentId: string;
  declare score: number;
  declare comment: string | null;
  declare isPublished: boolean;
  declare publishedAt: Date | null;
  declare publishedBy: string | null;
  declare createdBy: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Grade.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    assessmentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'assessments', key: 'id' }, onDelete: 'CASCADE' },
    score: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    comment: { type: DataTypes.TEXT },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt: { type: DataTypes.DATE },
    publishedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    createdBy: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
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
    ],
  }
);

export default Grade;