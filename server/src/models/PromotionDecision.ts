import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A deliberation decision for one student, for one academic year.
 *
 * The decision is persisted BEFORE it is applied, so a promotion is always
 * auditable: who decided what, on which average, at which rank, and when.
 * This is the history the school needs when a result is later contested.
 */
class PromotionDecision extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  /** The year being closed. */
  declare academicYearId: string;
  /** Class the student is leaving (the year's history stays attached to it). */
  declare fromClassId: string | null;
  /** Class the student will join in the next year. */
  declare toClassId: string | null;

  /** PROMU | REDOUBLE | TRANSFERE | EXCLU | A_DELIBERER */
  declare decision: string;
  /** Annual average computed by the Academic Engine at decision time. */
  declare annualAverage: number;
  /** Rank held in the class at decision time. */
  declare rank: number | null;
  /** Council observations / motivation. */
  declare deliberationNotes: string | null;
  /** Catch-up (rattrapage) session taken into account. */
  declare catchUp: boolean;

  /** proposed | confirmed | applied | cancelled */
  declare status: 'proposed' | 'confirmed' | 'applied' | 'cancelled';

  declare decidedBy: string | null;
  declare decidedAt: Date | null;
  /** Audit trail of how the student was placed in the target class. */
  declare appliedAt: Date | null;
  declare appliedBy: string | null;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

PromotionDecision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    academicYearId: { type: DataTypes.UUID, allowNull: false, references: { model: 'academic_years', key: 'id' }, onDelete: 'CASCADE' },
    fromClassId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'SET NULL' },
    toClassId: { type: DataTypes.UUID, references: { model: 'classes', key: 'id' }, onDelete: 'SET NULL' },
    decision: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'A_DELIBERER' },
    annualAverage: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const v = this.getDataValue('annualAverage');
        return v === null ? null : Number(v);
      },
    },
    rank: { type: DataTypes.INTEGER },
    deliberationNotes: { type: DataTypes.TEXT },
    catchUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.ENUM('proposed', 'confirmed', 'applied', 'cancelled'), allowNull: false, defaultValue: 'proposed' },
    decidedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    decidedAt: { type: DataTypes.DATE },
    appliedAt: { type: DataTypes.DATE },
    appliedBy: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  {
    sequelize,
    tableName: 'promotion_decisions',
    timestamps: true,
    underscored: true,
    // One decision per student per year: re-deliberating updates, never duplicates.
    indexes: [{ unique: true, fields: ['student_id', 'academic_year_id'] }, { fields: ['school_id', 'status'] }],
  }
);

export default PromotionDecision;
