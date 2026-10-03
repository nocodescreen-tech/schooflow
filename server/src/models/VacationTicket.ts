import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

export type VacationTicketStatus = 'draft' | 'approved' | 'rejected' | 'used';

class VacationTicket extends Model {
  declare id: string;
  declare schoolId: string;
  declare studentId: string;
  declare academicYear: string;
  declare startDate: Date;
  declare endDate: Date;
  declare reason: string;
  declare destination: string;
  declare status: VacationTicketStatus;
  declare ticketNumber: string;
  declare notes: string;
  declare pdfPath: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

VacationTicket.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    studentId: { type: DataTypes.UUID, allowNull: false, references: { model: 'students', key: 'id' }, onDelete: 'CASCADE' },
    academicYear: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '2025-2026' },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    destination: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.ENUM('draft', 'approved', 'rejected', 'used'), defaultValue: 'draft' },
    ticketNumber: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    notes: { type: DataTypes.TEXT },
    pdfPath: { type: DataTypes.STRING(500) },
  },
  { sequelize, tableName: 'vacation_tickets', timestamps: true, underscored: true }
);

export default VacationTicket;
