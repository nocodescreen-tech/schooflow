import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Assessment — a single graded activity (interrogation, examen, TP, devoir, etc.)
 *
 * An assessment belongs to one period and one subject/class combination.
 * It carries its own max score, coefficient, date, and type.
 */
class Assessment extends Model {
  declare id: string;
  declare schoolId: string;
  declare evaluationPeriodId: string;
  declare subjectId: string;
  declare classId: string;
  declare teacherId: string;
  declare name: string;
  declare type: 'interrogation' | 'examen' | 'tp' | 'devoir' | 'projet' | 'oral' | 'autre';
  declare maxScore: number;
  declare coefficient: number;
  declare date: Date;
  declare isPublished: boolean;
  declare description: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Assessment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    evaluationPeriodId: { type: DataTypes.UUID, allowNull: false, references: { model: 'evaluation_periods', key: 'id' }, onDelete: 'CASCADE' },
    subjectId: { type: DataTypes.UUID, allowNull: false, references: { model: 'subjects', key: 'id' }, onDelete: 'CASCADE' },
    classId: { type: DataTypes.UUID, allowNull: false, references: { model: 'classes', key: 'id' }, onDelete: 'CASCADE' },
    teacherId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.ENUM('interrogation', 'examen', 'tp', 'devoir', 'projet', 'oral', 'autre'), allowNull: false, defaultValue: 'interrogation' },
    maxScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 20 },
    coefficient: { type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 1 },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    description: { type: DataTypes.TEXT },
  },
  { sequelize, tableName: 'assessments', timestamps: true, underscored: true }
);

export default Assessment;