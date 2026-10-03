import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class RefreshToken extends Model {
  declare id: string;
  declare userId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare revoked: boolean;
  declare userAgent: string;
  declare ipAddress: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

RefreshToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    tokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    userAgent: { type: DataTypes.STRING(500) },
    ipAddress: { type: DataTypes.STRING(45) },
  },
  { sequelize, tableName: 'refresh_tokens', timestamps: true, underscored: true }
);

export default RefreshToken;
