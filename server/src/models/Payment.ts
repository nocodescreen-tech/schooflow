import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Payment extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare feeId: string;
  declare amount: number;
  declare method: string;
  declare reference: string;
  declare notes: string;
  declare status: string;
  declare receivedById: string;
  declare date: Date;
  // --- Multi-currency (additive: existing rows keep working) ---
  /** Currency the parent actually handed over. */
  declare currency: string;
  /** Amount in the school's base currency - what accounting uses. */
  declare amountInBase: number;
  /** Rate frozen at posting time. Never recomputed. */
  declare exchangeRate: number | null;
  declare rateSource: string | null;
  declare rateEffectiveFrom: Date | null;
  declare rateId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Payment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    feeId: { type: DataTypes.UUID, references: { model: 'fees', key: 'id' }, onDelete: 'SET NULL' },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const value = this.getDataValue('amount');
        return value === null ? null : Number(value);
      },
    },
    method: { type: DataTypes.ENUM('cash', 'bank', 'transfer', 'other'), defaultValue: 'cash' },
    reference: { type: DataTypes.STRING(100) },
    notes: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('completed', 'cancelled'), defaultValue: 'completed' },
    receivedById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    amountInBase: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const v = this.getDataValue('amountInBase');
        return v === null ? null : Number(v);
      },
    },
    exchangeRate: {
      type: DataTypes.DECIMAL(20, 8),
      get() {
        const v = this.getDataValue('exchangeRate');
        return v === null ? null : Number(v);
      },
    },
    rateSource: { type: DataTypes.STRING(20) },
    rateEffectiveFrom: { type: DataTypes.DATE },
    rateId: { type: DataTypes.UUID, references: { model: 'exchange_rates', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'payments', timestamps: true, underscored: true }
);

export default Payment;
