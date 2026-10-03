import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class CalendarEvent extends Model {
  declare id: string;
  declare schoolId: string;
  declare title: string;
  declare description: string;
  declare type: string;
  declare startDate: Date;
  declare endDate: Date;
  declare audience: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

CalendarEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },
    type: { type: DataTypes.ENUM('rentree', 'vacances', 'examen', 'reunion', 'conseil', 'evaluation', 'pedagogique', 'autre'), defaultValue: 'autre' },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE },
    audience: { type: DataTypes.STRING(50), defaultValue: 'all' },
  },
  { sequelize, tableName: 'calendar_events', timestamps: true, underscored: true }
);

export default CalendarEvent;
