import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Attendance extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare classId: string;
  declare date: Date;
  declare status: string;
  declare notes: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Attendance.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    classId: { type: DataTypes.UUID, allowNull: false, references: { model: 'classes', key: 'id' }, onDelete: 'CASCADE' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('present', 'absent', 'late', 'excused'), defaultValue: 'present' },
    notes: { type: DataTypes.TEXT },
  },
  { sequelize, tableName: 'attendance', timestamps: true, underscored: true }
);

export default Attendance;
