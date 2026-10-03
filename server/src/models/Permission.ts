import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Permission extends Model {
  declare id: string;
  declare module: string;
  declare action: string;
  declare description: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Permission.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    module: { type: DataTypes.STRING(50), allowNull: false },
    action: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.STRING(255) },
  },
  { sequelize, tableName: 'permissions', timestamps: true, underscored: true }
);

export default Permission;