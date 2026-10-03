import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Direct (individual) permission grant or revocation applied on top of the
 * permissions inherited from a user's roles.
 *
 * effect = 'grant'  → adds the permission
 * effect = 'revoke' → removes the permission, even if a role grants it
 *
 * scopeType/scopeId optionally narrow WHERE the permission applies
 * (e.g. grant `grades.create` limited to one class).
 */
class UserPermissionOverride extends Model {
  declare id: string;
  declare schoolId: string;
  declare userId: string;
  declare permission: string;
  declare effect: 'grant' | 'revoke';
  declare scopeType: string | null;
  declare scopeId: string | null;
  declare startAt: Date | null;
  declare endAt: Date | null;
  declare reason: string | null;
  declare authorizedBy: string | null;
  declare status: 'active' | 'revoked' | 'expired';
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

UserPermissionOverride.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    permission: { type: DataTypes.STRING(100), allowNull: false },
    effect: { type: DataTypes.ENUM('grant', 'revoke'), allowNull: false, defaultValue: 'grant' },
    scopeType: { type: DataTypes.STRING(50) },
    scopeId: { type: DataTypes.UUID },
    startAt: { type: DataTypes.DATE },
    endAt: { type: DataTypes.DATE },
    reason: { type: DataTypes.TEXT },
    authorizedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    status: { type: DataTypes.ENUM('active', 'revoked', 'expired'), allowNull: false, defaultValue: 'active' },
  },
  {
    sequelize,
    tableName: 'user_permission_overrides',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id', 'permission'] }],
  }
);

export default UserPermissionOverride;
