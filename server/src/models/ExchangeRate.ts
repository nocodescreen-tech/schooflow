import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * An exchange rate, effective from a given date.
 *
 * Rates are APPENDED, never overwritten: a rate that was used to post a
 * payment must keep describing reality on that day, even after the school
 * updates its rate. The "current" rate is simply the most recent row whose
 * effectiveFrom is <= today.
 *
 * `source` matters for accounting:
 *  - 'manual'  the rate the school agreed on (taux convenu). Authoritative.
 *  - 'live'    fetched from a public provider. A reference only — it is never
 *              silently applied to a posted payment.
 */
class ExchangeRate extends Model {
  declare id: string;
  declare schoolId: string;
  declare fromCurrency: string;
  declare toCurrency: string;
  /** How many `toCurrency` one `fromCurrency` buys. */
  declare rate: number;
  declare effectiveFrom: Date;
  /** manual | live */
  declare source: 'manual' | 'live';
  declare setBy: string | null;
  declare note: string | null;
  /** Where the live rate came from, for traceability. */
  declare provider: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ExchangeRate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    fromCurrency: { type: DataTypes.STRING(3), allowNull: false },
    toCurrency: { type: DataTypes.STRING(3), allowNull: false },
    rate: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      get() {
        const v = this.getDataValue('rate');
        return v === null ? null : Number(v);
      },
    },
    effectiveFrom: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    source: { type: DataTypes.ENUM('manual', 'live'), allowNull: false, defaultValue: 'manual' },
    setBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    note: { type: DataTypes.TEXT },
    provider: { type: DataTypes.STRING(50) },
  },
  {
    sequelize,
    tableName: 'exchange_rates',
    timestamps: true,
    underscored: true,
    // Index names are capped at 63 bytes by PostgreSQL — keep them short.
    indexes: [
      { fields: ['school_id', 'from_currency', 'to_currency', 'effective_from'], name: 'exch_rate_lookup' },
      { fields: ['school_id', 'source'], name: 'exch_rate_source' },
    ],
  }
);

export default ExchangeRate;
