import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Single-use, expiring password reset token.
 * Only the SHA-256 hash of the token is stored — the raw value never touches
 * the database. A used or superseded token can never be replayed.
 */
class PasswordResetToken extends Model {
  declare id: string;
  declare schoolId: string | null;
  declare userId: string;
  declare tokenHash: string;
  declare purpose: 'reset_password' | 'force_change' | 'activation';
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare usedIp: string | null;
  declare createdBy: string | null;
  declare readonly createdAt: Date;
}

PasswordResetToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    purpose: { type: DataTypes.ENUM('reset_password', 'force_change', 'activation'), allowNull: false, defaultValue: 'reset_password' },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE },
    usedIp: { type: DataTypes.STRING(64) },
    createdBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  {
    sequelize,
    tableName: 'password_reset_tokens',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id', 'purpose'] }],
  }
);

export default PasswordResetToken;
