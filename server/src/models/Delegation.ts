import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Temporary transfer of responsibility from one user to another.
 *
 * Example: a school director on leave delegates a subset of their permissions
 * to the deputy director for a bounded period. A delegation only grants access
 * while it is `active` AND inside its [startAt, endAt] window.
 */
class Delegation extends Model {
  declare id: string;
  declare schoolId: string;
  declare fromUserId: string;
  declare toUserId: string;
  declare permissions: string[];
  declare scopeType: string | null;
  declare scopeId: string | null;
  declare startAt: Date;
  declare endAt: Date;
  declare reason: string | null;
  declare authorizedBy: string | null;
  declare status: 'pending' | 'active' | 'revoked' | 'expired';
  declare revokedAt: Date | null;
  declare revokedBy: string | null;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

Delegation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    fromUserId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    toUserId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    scopeType: { type: DataTypes.STRING(50) },
    scopeId: { type: DataTypes.UUID },
    startAt: { type: DataTypes.DATE, allowNull: false },
    endAt: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.TEXT },
    authorizedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    status: { type: DataTypes.ENUM('pending', 'active', 'revoked', 'expired'), allowNull: false, defaultValue: 'active' },
    revokedAt: { type: DataTypes.DATE },
    revokedBy: { type: DataTypes.UUID },
  },
  {
    sequelize,
    tableName: 'delegations',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['to_user_id', 'status'] }],
  }
);

export default Delegation;
