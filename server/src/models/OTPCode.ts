import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

export type OTPType = 'email_verification' | 'password_reset' | 'login';

class OTPCode extends Model {
  declare id: string;
  declare userId: string;
  declare code: string;
  declare type: OTPType;
  declare expiresAt: Date;
  declare used: boolean;
  declare attempts: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

OTPCode.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    code: { type: DataTypes.STRING(6), allowNull: false },
    type: { type: DataTypes.ENUM('email_verification', 'password_reset', 'login'), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    used: { type: DataTypes.BOOLEAN, defaultValue: false },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { sequelize, tableName: 'otp_codes', timestamps: true, underscored: true }
);

export default OTPCode;
