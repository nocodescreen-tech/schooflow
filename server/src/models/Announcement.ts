import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Announcement extends Model {
  declare id: string;
  declare schoolId: string;
  declare title: string;
  declare content: string;
  declare audience: string;
  declare classId: string | null;
  declare publishedAt: Date;
  declare expiresAt: Date | null;
  declare authorId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Announcement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    audience: { type: DataTypes.ENUM('all', 'teachers', 'parents', 'students', 'staff'), defaultValue: 'all' },
    classId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'SET NULL' },
    publishedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    expiresAt: { type: DataTypes.DATE },
    authorId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'announcements', timestamps: true, underscored: true }
);

export default Announcement;
