import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Niveau extends Model {
  declare id: string;
  declare schoolId: string;
  declare cycleId: string | null;
  declare name: string;
  declare code: string;
  declare order: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Niveau.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    cycleId: { type: DataTypes.UUID, references: { model: 'cycles', key: 'id' }, onDelete: 'SET NULL' },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(50), allowNull: false },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { sequelize, tableName: 'niveaux', timestamps: true, underscored: true }
);

export default Niveau;