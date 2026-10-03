import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class DocumentTemplate extends Model {
  declare id: string;
  declare schoolId: string;
  declare name: string;
  declare description: string;
  declare category: string;
  declare format: string;
  declare orientation: string;
  declare version: number;
  declare status: string;
  declare miniature: string;
  declare creatorId: string;
  declare schema: any;
  declare scope: { cycles?: string[]; levels?: string[]; sections?: string[]; options?: string[] } | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

DocumentTemplate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    schoolId: { type: DataTypes.UUID, allowNull: false, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },
    category: { 
      type: DataTypes.ENUM('bulletin', 'certificat', 'billet_vacances', 'avis_parents', 'document_administratif', 'autre'),
      allowNull: false 
    },
    format: { type: DataTypes.ENUM('A4', 'A5', 'A6', 'Letter', 'Legal', 'custom'), defaultValue: 'A4' },
    orientation: { type: DataTypes.ENUM('portrait', 'landscape'), defaultValue: 'portrait' },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: { 
      type: DataTypes.ENUM('brouillon', 'actif', 'archive'), 
      defaultValue: 'brouillon' 
    },
    miniature: { type: DataTypes.STRING(500) },
    schema: { type: DataTypes.JSONB, defaultValue: { elements: [] } },
    scope: { type: DataTypes.JSONB },
    creatorId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
  },
  { sequelize, tableName: 'document_templates', timestamps: true, underscored: true }
);

export default DocumentTemplate;