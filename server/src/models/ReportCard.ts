import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class ReportCard extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare student: any;
  declare term: number;
  declare academicYear: string;
  declare average: number;
  declare rank: number;
  declare totalStudents: number;
  declare status: string;
  declare generatedAt: Date;
  declare pdfPath: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ReportCard.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    term: { type: DataTypes.INTEGER, allowNull: false },
    academicYear: { type: DataTypes.STRING(20), defaultValue: '2025-2026' },
    average: { type: DataTypes.DECIMAL(5, 2) },
    rank: { type: DataTypes.INTEGER },
    totalStudents: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('draft', 'sent', 'published'), defaultValue: 'draft' },
    generatedAt: { type: DataTypes.DATE },
    pdfPath: { type: DataTypes.STRING(500) },
  },
  { sequelize, tableName: 'report_cards', timestamps: true, underscored: true }
);

export default ReportCard;
