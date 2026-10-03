import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class AcademicYear extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare startDate: Date;
  declare endDate: Date;
  declare status: string;
  declare isActive: boolean;
  declare description: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

AcademicYear.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(50), allowNull: false },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('draft', 'active', 'closed'), defaultValue: 'draft' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: false },
    description: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'academic_years',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['school_id', 'name'] },
      { fields: ['school_id', 'status'] },
      { fields: ['start_date', 'end_date'] },
    ],
  }
);

export default AcademicYear;