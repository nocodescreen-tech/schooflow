import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class SchoolModule extends Model {
  declare id: string;
  declare schoolId: string;
  declare moduleCode: string;
  declare enabled: boolean;
  declare configuration: Record<string, unknown>;
  declare enabledAt: Date | null;
  declare enabledById: string | null;
  declare settings: Record<string, unknown>;
  declare status: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

SchoolModule.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    moduleCode: { type: DataTypes.STRING(50), allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    configuration: { type: DataTypes.JSONB, defaultValue: {} },
    enabledAt: { type: DataTypes.DATE },
    enabledById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    settings: { type: DataTypes.JSONB, defaultValue: {} },
    status: { type: DataTypes.ENUM('active', 'inactive', 'pending', 'error'), defaultValue: 'inactive' },
  },
  { sequelize, tableName: 'school_modules', timestamps: true, underscored: true }
);

export default SchoolModule;