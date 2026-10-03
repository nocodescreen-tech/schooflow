import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class StudentParent extends Model {
  declare id: string;
  declare studentId: string;
  declare parentId: string;
  declare relation: string;
  declare isPrimaryContact: boolean;
  declare emergencyContact: boolean;
  declare authorization: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

StudentParent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    parentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'parents', key: 'id' }, onDelete: 'CASCADE' },
    relation: { type: DataTypes.STRING(50), defaultValue: 'parent' },
    isPrimaryContact: { type: DataTypes.BOOLEAN, defaultValue: false },
    emergencyContact: { type: DataTypes.BOOLEAN, defaultValue: false },
    authorization: { type: DataTypes.TEXT },
  },
  {
    sequelize,
    tableName: 'student_parents',
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ['student_id', 'parent_id'] }],
  }
);

export default StudentParent;
