import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Incident extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare type: string;
  declare description: string;
  declare date: Date;
  declare severity: string;
  declare status: string;
  declare reportedById: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Incident.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.ENUM('absence', 'retard', 'perturbation', 'violence', 'tricherie', 'autre'), allowNull: false },
    description: { type: DataTypes.TEXT },
    date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    severity: { type: DataTypes.ENUM('faible', 'moyenne', 'grave'), allowNull: false },
    status: { type: DataTypes.ENUM('ouvert', 'examen', 'decide', 'clos'), defaultValue: 'ouvert' },
    reportedById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'incidents', timestamps: true, underscored: true }
);

export default Incident;
