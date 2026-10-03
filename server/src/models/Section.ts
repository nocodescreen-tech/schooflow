import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Section extends Model {
  declare id: string;
  declare schoolId: string;
  declare filiereId: string | null;
  declare name: string;
  declare code: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Section.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    filiereId: { type: DataTypes.UUID, references: { model: 'filieres', key: 'id' }, onDelete: 'SET NULL' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
  },
  { sequelize, tableName: 'sections', timestamps: true, underscored: true }
);

export default Section;