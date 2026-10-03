import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Option extends Model {
  declare id: string;
  declare schoolId: string;
  declare sectionId: string | null;
  declare name: string;
  declare code: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Option.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    sectionId: { type: DataTypes.UUID, references: { model: 'sections', key: 'id' }, onDelete: 'SET NULL' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
  },
  { sequelize, tableName: 'options', timestamps: true, underscored: true }
);

export default Option;