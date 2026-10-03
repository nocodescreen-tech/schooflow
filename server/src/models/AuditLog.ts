import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AuditLog extends Model {
  declare id: string;
  declare schoolId: string;
  declare userId: string;
  declare action: string;
  declare entity: string;
  declare entityId: string;
  declare details: Record<string, unknown>;
  declare ipAddress: string;
  declare userAgent: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

AuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    action: { type: DataTypes.STRING(50), allowNull: false },
    entity: { type: DataTypes.STRING(100), allowNull: false },
    entityId: { type: DataTypes.UUID },
    details: { type: DataTypes.JSONB, defaultValue: {} },
    ipAddress: { type: DataTypes.STRING(45) },
    userAgent: { type: DataTypes.STRING(500) },
  },
  { sequelize, tableName: 'audit_logs', timestamps: true, underscored: true }
);

export default AuditLog;
