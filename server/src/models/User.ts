import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class User extends Model {
  declare id: string;
  declare schoolId: string;
  declare email: string;
  declare passwordHash: string;
  declare name: string;
  declare role: string;
  declare phone: string;
  declare avatar: string;
  declare photo: string;
  declare isActive: boolean;
  declare tokenVersion: number;
  declare lastLoginAt: Date;
  // --- account lifecycle (added for the provisioning architecture) ---
  declare status: string;
  declare mustChangePassword: boolean;
  declare provisionedBy: string | null;
  declare personId: string | null;
  declare username: string | null;
  declare disabledAt: Date | null;
  declare disabledReason: string | null;
  declare passwordChangedAt: Date | null;
  declare failedLoginAttempts: number;
  declare lockedUntil: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    email: { type: DataTypes.STRING(255), allowNull: false },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM('super_admin', 'admin', 'director', 'teacher', 'accountant', 'parent', 'student', 'receptionist'), defaultValue: 'receptionist' },
    phone: { type: DataTypes.STRING(50) },
    avatar: { type: DataTypes.STRING(500) },
    photo: { type: DataTypes.STRING(500) },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    tokenVersion: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastLoginAt: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'active' },
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    provisionedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    personId: { type: DataTypes.UUID },
    username: { type: DataTypes.STRING(120) },
    disabledAt: { type: DataTypes.DATE },
    disabledReason: { type: DataTypes.TEXT },
    passwordChangedAt: { type: DataTypes.DATE },
    failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE },
  },
  { sequelize, tableName: 'users', timestamps: true, underscored: true }
);

export default User;
