const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Template = sequelize.define('Template', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Ex: Bulletin de notes 7ème année'
  },
  type: {
    type: DataTypes.ENUM('bulletin', 'vacances', 'frais', 'rapport'),
    allowNull: false,
    comment: 'Type de document spécifique'
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'Structure des blocs (header, body, table, footer) avec coordonnées'
  },
  variables: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Liste des variables requises pour ce template (student, school, etc.)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    default: true
  }
});

module.exports = Template;
