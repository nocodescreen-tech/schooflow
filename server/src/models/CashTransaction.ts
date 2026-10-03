import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class CashTransaction extends Model {
  declare id: string;
  declare schoolId: string;
  declare type: string;
  declare category: string;
  declare amount: number;
  declare description: string;
  declare reference: string;
  declare date: Date;
  declare recordedById: string;
  declare notes: string;
  declare responsible: string;
  declare attachment: string;
  declare isDeleted: boolean;
  declare closedAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CashTransaction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.ENUM('income', 'expense'), allowNull: false },
    category: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'other' },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    description: { type: DataTypes.TEXT },
    reference: { type: DataTypes.STRING(100) },
    date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    recordedById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    notes: { type: DataTypes.TEXT },
    responsible: { type: DataTypes.STRING(255) },
    attachment: { type: DataTypes.STRING(500) },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    closedAt: { type: DataTypes.DATE },
  },
  { sequelize, tableName: 'cash_transactions', timestamps: true, underscored: true }
);

export default CashTransaction;
