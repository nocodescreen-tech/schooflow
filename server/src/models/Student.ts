import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Student extends Model {
  declare id: string;
  declare schoolId: string;
  /** Links the student record to its user account (one account max per student). */
  declare userId: string | null;
  declare parentId: string;
  declare classId: string;
  declare studentId: string;
  declare firstName: string;
  declare lastName: string;
  declare dateOfBirth: Date;
  declare gender: string;
  declare address: string;
  declare phone: string;
  declare email: string;
  declare parentName: string;
  declare parentPhone: string;
  declare parentEmail: string;
  declare photo: string;
  declare birthPlace: string;
  declare nationality: string;
  declare status: string;
  declare enrollmentDate: Date;
  declare notes: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Student.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    parentId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    studentId: { type: DataTypes.STRING(20), allowNull: false },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    dateOfBirth: { type: DataTypes.DATE },
    gender: { type: DataTypes.ENUM('M', 'F') },
    address: { type: DataTypes.TEXT },
    phone: { type: DataTypes.STRING(50) },
    email: { type: DataTypes.STRING(255) },
    parentName: { type: DataTypes.STRING(255) },
    parentPhone: { type: DataTypes.STRING(50) },
    parentEmail: { type: DataTypes.STRING(255) },
    photo: { type: DataTypes.STRING(500) },
    birthPlace: { type: DataTypes.STRING(255) },
    nationality: { type: DataTypes.STRING(255) },
    status: { type: DataTypes.ENUM('active', 'inactive', 'graduated', 'transferred'), defaultValue: 'active' },
    enrollmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT },
  },
  { sequelize, tableName: 'students', timestamps: true, underscored: true }
);

export default Student;
