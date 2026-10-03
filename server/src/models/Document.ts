import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Document extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare type: string;
  declare filePath: string;
  declare fileSize: number;
  declare mimeType: string;
  declare uploadedById: string;
  declare studentId: string;
  declare templateId: string;
  declare notes: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Document.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    type: { type: DataTypes.ENUM('certificate', 'attestation', 'contract', 'report', 'other'), defaultValue: 'other' },
    filePath: { type: DataTypes.STRING(500), allowNull: false },
    fileSize: { type: DataTypes.INTEGER, defaultValue: 0 },
    mimeType: { type: DataTypes.STRING(100) },
    uploadedById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    studentId: { type: DataTypes.UUID, references: { model: 'students', key: 'id' }, onDelete: 'SET NULL' },
    templateId: { type: DataTypes.UUID, references: { model: 'document_templates', key: 'id' }, onDelete: 'SET NULL' },
    notes: { type: DataTypes.TEXT },
  },
  { sequelize, tableName: 'documents', timestamps: true, underscored: true }
);

export default Document;
