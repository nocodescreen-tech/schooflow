import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Parent extends Model {
  declare id: string;
  declare schoolId: string;
  /** Links the parent record to its user account (one account max per parent). */
  declare userId: string | null;
  declare firstName: string;
  declare lastName: string;
  declare phone: string;
  declare email: string;
  declare address: string;
  declare profession: string;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

Parent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    phone: { type: DataTypes.STRING(50) },
    email: { type: DataTypes.STRING(255) },
    address: { type: DataTypes.TEXT },
    profession: { type: DataTypes.STRING(255) },
  },
  { sequelize, tableName: 'parents', timestamps: true, underscored: true }
);

export default Parent;
