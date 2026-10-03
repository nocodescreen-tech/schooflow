import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

/**
 * OtpChallenge — a single verification code request (§4).
 *
 * Security invariants encoded in this model:
 *  - the raw code is NEVER stored; only a SHA-256 hash (§4);
 *  - `status` is an explicit state machine, not a boolean `used` flag, so a
 *    code can be PENDING → VERIFIED | EXPIRED | FAILED | LOCKED | CANCELLED |
 *    CONSUMED and every transition is auditable;
 *  - `schoolId` is set whenever the challenge belongs to an establishment, so a
 *    code can never be replayed against another school (§38).
 */

export const OTP_PURPOSES = [
  'EMAIL_VERIFICATION',
  'ACCOUNT_ACTIVATION',
  'PASSWORD_RESET',
  'EMAIL_CHANGE',
  'ACCOUNT_RECOVERY',
  'STEP_UP_AUTH',
  'INVITATION_ACCEPTANCE',
  'SECURITY_CONFIRMATION',
  'LOGIN',
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export type OtpStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'FAILED'
  | 'LOCKED'
  | 'CANCELLED'
  | 'CONSUMED';

class OtpChallenge extends Model {
  declare id: string;
  /** Nullable: a challenge can target an email that has no account yet. */
  declare userId: string | null;
  /** Nullable for the same reason; set whenever the workflow belongs to a school. */
  declare schoolId: string | null;
  /** The email the code was sent to. Kept so a later account can be linked. */
  declare email: string;
  declare purpose: OtpPurpose;
  /** SHA-256 hash of the code. The raw code is never persisted. */
  declare codeHash: string;
  declare status: OtpStatus;
  declare expiresAt: Date;
  declare verifiedAt: Date | null;
  declare consumedAt: Date | null;
  declare attempts: number;
  declare maxAttempts: number;
  declare resendCount: number;
  declare lastSentAt: Date | null;
  /** Short-lived authorization issued after a successful PASSWORD_RESET. */
  declare resetTokenHash: string | null;
  declare metadata: Record<string, unknown>;
  declare readonly createdAt: Date;
  declare updatedAt: Date;
}

OtpChallenge.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    schoolId: { type: DataTypes.UUID, references: { model: 'schools', key: 'id' }, onDelete: 'CASCADE' },
    email: { type: DataTypes.STRING(255), allowNull: false },
    purpose: { type: DataTypes.ENUM(...OTP_PURPOSES), allowNull: false },
    codeHash: { type: DataTypes.STRING(64), allowNull: false },
    status: {
      type: DataTypes.ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED', 'LOCKED', 'CANCELLED', 'CONSUMED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    verifiedAt: { type: DataTypes.DATE },
    consumedAt: { type: DataTypes.DATE },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    resendCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastSentAt: { type: DataTypes.DATE },
    resetTokenHash: { type: DataTypes.STRING(64) },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  {
    sequelize,
    tableName: 'otp_challenges',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id', 'purpose', 'status'] },
      { fields: ['school_id', 'purpose'] },
      { fields: ['email', 'created_at'] },
    ],
  }
);

export default OtpChallenge;