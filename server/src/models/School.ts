import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class School extends Model {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare plan: string;
  declare currency: string;
  declare phone: string;
  declare address: string;
  declare logo: string;
  declare province: string;
  declare city: string;
  declare territory: string;
  declare code: string;
  declare emblem: string;
  declare settings: Record<string, unknown>;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

School.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    plan: { type: DataTypes.ENUM('starter', 'standard', 'pro', 'enterprise'), defaultValue: 'starter' },
    currency: { type: DataTypes.STRING(3), defaultValue: 'USD' },
    phone: { type: DataTypes.STRING(50) },
    address: { type: DataTypes.TEXT },
    logo: { type: DataTypes.STRING(500) },
    province: { type: DataTypes.STRING(255) },
    city: { type: DataTypes.STRING(255) },
    territory: { type: DataTypes.STRING(255) },
    code: { type: DataTypes.STRING(100) },
    emblem: { type: DataTypes.STRING(500) },
    settings: { type: DataTypes.JSONB, defaultValue: {} },
  },
  { sequelize, tableName: 'schools', timestamps: true, underscored: true }
);

export default School;
