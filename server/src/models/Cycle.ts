import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Cycle extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare code: string;
  declare order: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Cycle.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { sequelize, tableName: 'cycles', timestamps: true, underscored: true }
);

export default Cycle;