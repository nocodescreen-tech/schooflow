import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class Sanction extends Model {
  declare id: string;
  declare incidentId: string;
  declare sanction: string;
  declare startDate: Date;
  declare endDate: Date;
  declare decidedById: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Sanction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    incidentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'incidents', key: 'id' }, onDelete: 'CASCADE' },
    sanction: { type: DataTypes.TEXT, allowNull: false },
    startDate: { type: DataTypes.DATE },
    endDate: { type: DataTypes.DATE },
    decidedById: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'sanctions', timestamps: true, underscored: true }
);

export default Sanction;
