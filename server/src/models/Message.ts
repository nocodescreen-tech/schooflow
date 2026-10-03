import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Message extends Model {
  declare id: string;
  declare schoolId: string;
  declare senderId: string;
  declare recipientId: string;
  declare subject: string;
  declare body: string;
  declare isRead: boolean;
  declare readAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Message.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    senderId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    recipientId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    subject: { type: DataTypes.STRING(255) },
    body: { type: DataTypes.TEXT, allowNull: false },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'messages', timestamps: true, underscored: true }
);

export default Message;
