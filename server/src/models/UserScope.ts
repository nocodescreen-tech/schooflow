import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class UserScope extends Model {
  declare id: string;
  declare userId: string;
  declare scopeType: string;
  declare scopeId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

UserScope.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    scopeType: { type: DataTypes.ENUM('class', 'subject', 'department', 'section', 'level'), allowNull: false },
    scopeId: { type: DataTypes.UUID, allowNull: false },
  },
  { sequelize, tableName: 'user_scopes', timestamps: true, underscored: true }
);

export default UserScope;