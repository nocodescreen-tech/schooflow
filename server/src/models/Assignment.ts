import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Assignment binds a user to an academic resource for a bounded period.
 *
 * A single table covers every assignment kind (class, subject, department,
 * section, level, timetable slot, responsibility) so that scope resolution
 * has one source of truth instead of a per-kind lookup.
 *
 * status: active | inactive | scheduled | expired
 */
class Assignment extends Model {
  declare id: string;
  declare schoolId: string;
  declare userId: string;
  declare academicYearId: string | null;
  declare assignmentType: string;
  declare classId: string | null;
  declare subjectId: string | null;
  declare sectionId: string | null;
  declare levelId: string | null;
  declare departmentId: string | null;
  declare startDate: Date | null;
  declare endDate: Date | null;
  declare status: 'active' | 'inactive' | 'scheduled' | 'expired';
  declare isPrimary: boolean;
  declare assignedBy: string | null;
  declare notes: string | null;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

Assignment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    academicYearId: { type: DataTypes.UUID },
    assignmentType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'class' },
    classId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'CASCADE' },
    subjectId: { type: DataTypes.UUID, references: { model: 'subjects', key: 'id' }, onDelete: 'CASCADE' },
    sectionId: { type: DataTypes.UUID },
    levelId: { type: DataTypes.UUID },
    departmentId: { type: DataTypes.UUID },
    startDate: { type: DataTypes.DATE },
    endDate: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('active', 'inactive', 'scheduled', 'expired'), allowNull: false, defaultValue: 'active' },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    assignedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    notes: { type: DataTypes.TEXT },
  },
  {
    sequelize,
    tableName: 'assignments',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['user_id', 'status'] }, { fields: ['school_id', 'class_id'] }],
  }
);

export default Assignment;
