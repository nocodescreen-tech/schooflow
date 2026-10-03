import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import Role from './Role.js';

class UserRole extends Model {
  declare id: string;
  declare userId: string;
  declare roleId: string;
  declare schoolId: string;
  declare startAt: Date | null;
  declare endAt: Date | null;
  declare status: string;
  declare assignedBy: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserRole.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    roleId: { type: DataTypes.UUID, allowNull: false, references: { model: 'roles', key: 'id' }, onDelete: 'CASCADE' },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    startAt: { type: DataTypes.DATE },
    endAt: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('active', 'inactive', 'expired'), defaultValue: 'active' },
    assignedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'user_roles', timestamps: true, underscored: true }
);

export default UserRole;