import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Subject extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare code: string;
  declare coefficient: number;
  declare department: string;
  declare teacherId: string;
  declare classId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Subject.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(20) },
    coefficient: { type: DataTypes.DECIMAL(3, 1), defaultValue: 1.0 },
    department: { type: DataTypes.STRING(100) },
    teacherId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    classId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'subjects', timestamps: true, underscored: true }
);

export default Subject;
