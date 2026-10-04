import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * EvaluationPeriod — one closed grading window (trimestre, semestre, séquence, etc.)
 *
 * A school year is split into periods. Each period has its own grades and
 * can be closed independently. When closed, no more grade mutations are
 * allowed inside it.
 *
 * Legacy aliases (`sequence`, `startAt`, `endAt`) are exposed as VIRTUAL
 * getters so historical code keeps working while the canonical
 * columns remain `position`, `startDate`, `endDate`.
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

  // Legacy aliases (virtual — not persisted)
  declare sequence: number;
  declare startAt: Date;
  declare endAt: Date;
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
    // Legacy virtual aliases
    sequence: {
      type: DataTypes.VIRTUAL,
      get() {
        return (this as unknown as { position: number }).position;
      },
    },
    startAt: {
      type: DataTypes.VIRTUAL,
      get() {
        return (this as unknown as { startDate: Date }).startDate;
      },
    },
    endAt: {
      type: DataTypes.VIRTUAL,
      get() {
        return (this as unknown as { endDate: Date }).endDate;
      },
    },
  },
  { sequelize, tableName: 'evaluation_periods', timestamps: true, underscored: true }
);

export default EvaluationPeriod;
