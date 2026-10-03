import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * GradingConfig — school-specific grading rules.
 *
 * Each school can override the default grading thresholds, rounding mode,
 * precision, and all calculation policies. This avoids hardcoding
 * French-centric values in the engine.
 */
class GradingConfig extends Model {
  declare id: string;
  declare schoolId: string;
  declare passingAverage: number;
  /** JSON: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 } */
  declare mentionThresholds: Record<string, number>;
  declare rounding: 'standard' | 'floor' | 'ceil';
  declare precision: number;
  /** How to weight grades: 'coefficient' (default) or 'equal' */
  declare weighting: 'coefficient' | 'equal';
  /** How to handle missing grades: 'zero' | 'ignore' | 'fail' */
  declare missingPolicy: 'zero' | 'ignore' | 'fail';
  /** Minimum number of grades required for a valid average */
  declare minGrades: number;
  /** Enable repêchage (oral makeup) for averages below passing */
  declare repEnabled: boolean;
  /** Minimum average to be eligible for repêchage */
  declare repMinAverage: number;
  /** Maximum average after repêchage (capped) */
  declare repMaxAverage: number;
  /** Whether to use coefficient as weight (true) or equal weighting (false) */
  declare useCoefficientWeight: boolean;
  /** Whether to normalize scores to /20 scale before averaging */
  declare normalizeTo20: boolean;
  /** Minimum grade (0-20) to consider a grade valid */
  declare minValidGrade: number;
  /** Maximum grade (0-20) to consider a grade valid */
  declare maxValidGrade: number;
  /** Whether to include absent/absent grades in average calculation */
  declare includeAbsentInAverage: boolean;
  /** JSON for custom grade scales (e.g., { A: {min:16, max:20}, B: {min:14, max:15.99} }) */
  declare customGradeScales: Record<string, { min: number; max: number }> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

GradingConfig.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    passingAverage: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 10 },
    mentionThresholds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
    },
    rounding: { type: DataTypes.ENUM('standard', 'floor', 'ceil'), allowNull: false, defaultValue: 'standard' },
    precision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    // New configurable rules
    weighting: { type: DataTypes.ENUM('coefficient', 'equal'), allowNull: false, defaultValue: 'coefficient' },
    missingPolicy: { type: DataTypes.ENUM('zero', 'ignore', 'fail'), allowNull: false, defaultValue: 'ignore' },
    minGrades: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    repEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    repMinAverage: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 8 },
    repMaxAverage: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 10 },
    useCoefficientWeight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    normalizeTo20: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    minValidGrade: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 0 },
    maxValidGrade: { type: DataTypes.DECIMAL(4, 2), allowNull: false, defaultValue: 20 },
    includeAbsentInAverage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    customGradeScales: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
  },
  { sequelize, tableName: 'grading_configs', timestamps: true, underscored: true }
);

export default GradingConfig;