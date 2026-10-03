import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * EvaluationPeriod — one closed grading window (trimestre, semestre, séquence, etc.)
 *
 * A school year is split into periods. Each period has its own grades and
 * can be closed independently. When closed, no more grade mutations are
 * allowed inside it.
 */
class EvaluationPeriod extends Model {
  declare id: string;
  declare schoolId: string;
  declare academicYearId: string;
  declare name: string;
  declare code: string;
  declare startDate: Date;
  declare endDate: Date;
  declare status: 'open' | 'closed' | 'archived';
  declare position: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

EvaluationPeriod.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    academicYearId: { type: DataTypes.UUID, allowNull: false, references: { model: 'academic_years', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(20), allowNull: false },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('open', 'closed', 'archived'), allowNull: false, defaultValue: 'open' },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, tableName: 'evaluation_periods', timestamps: true, underscored: true }
);

export default EvaluationPeriod;