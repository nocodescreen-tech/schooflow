import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import Role from './Role.js';
import Permission from './Permission.js';

class RolePermission extends Model {
  declare id: string;
  declare roleId: string;
  declare permissionId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

RolePermission.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roleId: { type: DataTypes.UUID, allowNull: false, references: { model: 'roles', key: 'id' }, onDelete: 'CASCADE' },
    permissionId: { type: DataTypes.UUID, allowNull: false, references: { model: 'permissions', key: 'id' }, onDelete: 'CASCADE' },
  },
  { sequelize, tableName: 'role_permissions', timestamps: true, underscored: true }
);

export default RolePermission;