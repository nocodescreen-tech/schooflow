import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Convocation extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare parentId: string;
  declare date: Date;
  declare reason: string;
  declare status: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Convocation.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    parentId: { type: DataTypes.UUID, references: { model: 'parents', key: 'id' }, onDelete: 'SET NULL' },
    date: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('envoyee', 'confirmee', 'terminee'), defaultValue: 'envoyee' },
  },
  { sequelize, tableName: 'convocations', timestamps: true, underscored: true }
);

export default Convocation;
