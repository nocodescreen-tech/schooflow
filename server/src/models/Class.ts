import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Class extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare level: string;
  declare section: string;
  declare capacity: number;
  declare teacherId: string;
  declare academicYear: string;
  declare cycleId: string | null;
  declare filiereId: string | null;
  declare sectionId: string | null;
  declare optionId: string | null;
  declare niveauId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Class.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    level: { type: DataTypes.STRING(50) },
    section: { type: DataTypes.STRING(10) },
    capacity: { type: DataTypes.INTEGER, defaultValue: 40 },
    teacherId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    academicYear: { type: DataTypes.STRING(20), defaultValue: '2025-2026' },
    cycleId: { type: DataTypes.UUID, references: { model: 'cycles', key: 'id' }, onDelete: 'SET NULL' },
    filiereId: { type: DataTypes.UUID, references: { model: 'filieres', key: 'id' }, onDelete: 'SET NULL' },
    sectionId: { type: DataTypes.UUID, references: { model: 'sections', key: 'id' }, onDelete: 'SET NULL' },
    optionId: { type: DataTypes.UUID, references: { model: 'options', key: 'id' }, onDelete: 'SET NULL' },
    niveauId: { type: DataTypes.UUID, references: { model: 'niveaux', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'classes', timestamps: true, underscored: true }
);

export default Class;
