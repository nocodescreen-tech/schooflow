import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Fee extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare type: string;
  declare amount: number;
  declare totalAmount: number;
  declare paidAmount: number;
  declare installments: number;
  declare dueDate: Date;
  declare status: string;
  declare academicYear: string;
  declare term: number;
  declare notes: string;
  /** Fees are always expressed in the school's base currency. */
  declare currency: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Fee.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    type: { type: DataTypes.ENUM('tuition', 'registration', 'exam', 'transport', 'canteen', 'uniform', 'other'), defaultValue: 'tuition' },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    paidAmount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    installments: { type: DataTypes.INTEGER, defaultValue: 1 },
    dueDate: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'paid', 'partial', 'overdue'), defaultValue: 'pending' },
    academicYear: { type: DataTypes.STRING(20), defaultValue: '2025-2026' },
    term: { type: DataTypes.INTEGER, defaultValue: 1 },
    notes: { type: DataTypes.TEXT },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
  },
  {
    sequelize,
    tableName: 'fees',
    timestamps: true,
    underscored: true,
    hooks: {
      /**
       * `totalAmount` is the full fee, `amount` is the per-installment share.
       * When a caller sets only `amount` (the common case for a single-installment
       * fee), the two are equal.
       *
       * Both hooks are needed: `beforeValidate` covers `create`/`save`, while
       * `beforeBulkCreate` covers `bulkCreate`, which skips the per-instance
       * hooks entirely. Without the second, any bulk insert of fees fails on the
       * NOT NULL constraint.
       */
      beforeValidate: (fee: Fee) => {
        if (fee.totalAmount === undefined || fee.totalAmount === null) {
          fee.totalAmount = fee.amount;
        }
      },
      beforeBulkCreate: (fees: Fee[]) => {
        for (const fee of fees) {
          if (fee.totalAmount === undefined || fee.totalAmount === null) {
            fee.totalAmount = fee.amount;
          }
        }
      },
    },
  }
);

export default Fee;
