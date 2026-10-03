import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Timetable extends Model {
  declare id: string;
  declare schoolId: string;
  declare classId: string;
  declare subjectId: string;
  declare teacherId: string;
  declare room: string;
  declare dayOfWeek: number;
  declare startTime: string;
  declare endTime: string;
  declare academicYear: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Timetable.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    classId: { type: DataTypes.UUID, allowNull: false, references: { model: 'classes', key: 'id' }, onDelete: 'CASCADE' },
    subjectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'subjects', key: 'id' }, onDelete: 'CASCADE' },
    teacherId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    room: { type: DataTypes.STRING(100) },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: false },
    startTime: { type: DataTypes.STRING(5), allowNull: false },
    endTime: { type: DataTypes.STRING(5), allowNull: false },
    academicYear: { type: DataTypes.STRING(20), defaultValue: '2025-2026' },
  },
  { sequelize, tableName: 'timetables', timestamps: true, underscored: true }
);

export default Timetable;
