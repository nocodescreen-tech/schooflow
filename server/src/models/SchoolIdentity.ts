import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * SchoolDocumentIdentity — the ONE place the official identity of an
 * establishment lives.
 *
 * Configured once by the administration (Settings → School Identity), consumed
 * automatically by every document the school issues: bulletins, receipts,
 * certificates, convocations, HR papers, financial reports.
 *
 * Why a separate table rather than columns on `schools`:
 *  - it is a distinct aggregate with its own lifecycle and its own versioning;
 *  - it keeps `schools` lean and lets the whole identity be snapshotted onto a
 *    document in one read;
 *  - branding configuration is a nested structure, not a flat attribute list.
 *
 * IMPORTANT: nothing here is ever hardcoded per school. A school configures it
 * once; the document engine reads it for every generated document.
 */

export type HeaderMode = 'compact' | 'formal' | 'ceremonial' | 'correspondence';
export type FooterMode = 'full' | 'compact' | 'minimal' | 'none';

/** Numbering rule for one document type. */
export interface NumberingRule {
  /** e.g. REC, BUL, CER, PAY. */
  prefix: string;
  /** digits in the sequence part: 6 → 000145 */
  padding: number;
  /** restart the sequence each academic year (default true) */
  perYear: boolean;
}

export interface BrandingConfig {
  headerMode: HeaderMode;
  footerMode: FooterMode;
  /** Watermark printed behind the content, for copy protection. */
  watermark: {
    enabled: boolean;
    text: string | null;
    opacity: number;
    rotation: number;
  };
  footer: {
    showDocumentNumber: boolean;
    showPageNumbers: boolean;
    showGenerationDate: boolean;
    showConfidentiality: boolean;
    confidentialityText: string | null;
  };
  /** Rules keyed by document type; unknown types fall back to `defaultRule`. */
  numbering: { defaultRule: NumberingRule; rules: Record<string, NumberingRule> };
  /** Public verification page used by the QR code. */
  verification: {
    enabled: boolean;
    baseUrl: string | null;
  };
  colors: {
    primary: string;
    text: string;
  };
}

export const DEFAULT_BRANDING: BrandingConfig = {
  headerMode: 'formal',
  footerMode: 'full',
  watermark: { enabled: false, text: null, opacity: 0.08, rotation: 45 },
  footer: {
    showDocumentNumber: true,
    showPageNumbers: true,
    showGenerationDate: true,
    showConfidentiality: false,
    confidentialityText: null,
  },
  numbering: {
    defaultRule: { prefix: 'DOC', padding: 6, perYear: true },
    rules: {},
  },
  verification: { enabled: false, baseUrl: null },
  colors: { primary: '#111827', text: '#111827' },
};

/** Document types that carry the school identity. Also the numbering key. */
export const DOCUMENT_TYPES = [
  'bulletin',
  'attestation',
  'certificat',
  'releve_notes',
  'convention',
  'carte_eleve',
  'carte_personnel',
  'recu',
  'facture',
  'note_frais',
  'piece_jointe',
  'releve_caisse',
  'liste_paie',
  'rapport_academique',
  'rapport_financier',
  'rapport_presence',
  'bulletin_paie',
  'demande_conge',
  'decision_administrative',
  'convocation',
  'sanction',
  'acte_administratif',
  'billet_vacances',
  'avis_parents',
  'autre',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

class SchoolIdentity extends Model {
  declare id: string;
  declare schoolId: string;

  // ── Official identity ──
  declare officialName: string | null;
  declare shortName: string | null;
  declare acronym: string | null;
  declare code: string | null;
  declare ministryLine: string | null;
  declare provinceEducationnelle: string | null;
  declare motto: string | null;
  declare postalCode: string | null;

  // ── Location ──
  declare address: string | null;
  declare commune: string | null;
  declare territory: string | null;
  declare city: string | null;
  declare province: string | null;
  declare country: string | null;

  // ── Contact ──
  declare phone: string | null;
  declare secondaryPhone: string | null;
  declare email: string | null;
  declare website: string | null;

  // ── Signatory ──
  declare directorName: string | null;
  declare directorTitle: string | null;
  declare signatoryName: string | null;
  declare signatoryTitle: string | null;

  // ── Visual assets (paths/URLs, never blobs) ──
  declare logo: string | null;
  declare emblem: string | null;
  declare secondaryLogo: string | null;
  declare monochromeLogo: string | null;
  declare watermarkLogo: string | null;
  declare signatureUrl: string | null;
  declare stampUrl: string | null;

  /** Visual + numbering configuration, see BrandingConfig. */
  declare branding: BrandingConfig;

  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

SchoolIdentity.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // CASCADE: an identity cannot outlive its school, and it is never shared.
    schoolId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'schools', key: 'id' },
      onDelete: 'CASCADE',
    },

    officialName: { type: DataTypes.STRING(255) },
    shortName: { type: DataTypes.STRING(120) },
    acronym: { type: DataTypes.STRING(40) },
    code: { type: DataTypes.STRING(100) },
    ministryLine: { type: DataTypes.TEXT },
    provinceEducationnelle: { type: DataTypes.STRING(255) },
    motto: { type: DataTypes.STRING(255) },
    postalCode: { type: DataTypes.STRING(20) },

    address: { type: DataTypes.TEXT },
    commune: { type: DataTypes.STRING(120) },
    territory: { type: DataTypes.STRING(120) },
    city: { type: DataTypes.STRING(120) },
    province: { type: DataTypes.STRING(120) },
    country: { type: DataTypes.STRING(120) },

    phone: { type: DataTypes.STRING(50) },
    secondaryPhone: { type: DataTypes.STRING(50) },
    email: { type: DataTypes.STRING(255) },
    website: { type: DataTypes.STRING(255) },

    directorName: { type: DataTypes.STRING(255) },
    directorTitle: { type: DataTypes.STRING(120) },
    signatoryName: { type: DataTypes.STRING(255) },
    signatoryTitle: { type: DataTypes.STRING(120) },

    logo: { type: DataTypes.STRING(500) },
    emblem: { type: DataTypes.STRING(500) },
    secondaryLogo: { type: DataTypes.STRING(500) },
    monochromeLogo: { type: DataTypes.STRING(500) },
    watermarkLogo: { type: DataTypes.STRING(500) },
    signatureUrl: { type: DataTypes.STRING(500) },
    stampUrl: { type: DataTypes.STRING(500) },

    branding: { type: DataTypes.JSONB, allowNull: false, defaultValue: DEFAULT_BRANDING },
  },
  { sequelize, tableName: 'school_identities', timestamps: true, underscored: true }
);

export { DEFAULT_BRANDING as defaultBranding };
export default SchoolIdentity;