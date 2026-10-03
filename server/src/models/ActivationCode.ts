import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Self-service activation code handed to a student (or parent) so they can
 * create their own account without an administrator typing their password.
 *
 * The code is:
 *  - single-use (or limited by maxUses)
 *  - expiring (expiresAt)
 *  - revocable (status)
 *  - invalidated after a successful activation
 *
 * Only the hash is persisted; the plaintext is shown to the admin exactly once.
 */
class ActivationCode extends Model {
  declare id: string;
  declare schoolId: string;
  declare codeHash: string;
  declare targetType: 'student' | 'parent' | 'staff';
  declare targetId: string;
  declare email: string | null;
  declare maxUses: number;
  declare useCount: number;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare usedByUserId: string | null;
  declare status: 'active' | 'used' | 'revoked' | 'expired';
  declare createdBy: string | null;
  declare note: string | null;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

ActivationCode.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    codeHash: { type: DataTypes.STRING(64), allowNull: false },
    targetType: { type: DataTypes.ENUM('student', 'parent', 'staff'), allowNull: false, defaultValue: 'student' },
    targetId: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING(255) },
    maxUses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    useCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE },
    usedByUserId: { type: DataTypes.UUID },
    status: { type: DataTypes.ENUM('active', 'used', 'revoked', 'expired'), allowNull: false, defaultValue: 'active' },
    createdBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    note: { type: DataTypes.TEXT },
  },
  {
    sequelize,
    tableName: 'activation_codes',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['school_id', 'status'] }],
  }
);

export default ActivationCode;
