import { SchoolBranding } from '../../services/EmailService.js';
import { PURPOSE_LABEL } from '../../services/OtpService.js';

export type OtpPurpose =
  | 'EMAIL_VERIFICATION'
  | 'ACCOUNT_ACTIVATION'
  | 'PASSWORD_RESET'
  | 'EMAIL_CHANGE'
  | 'ACCOUNT_RECOVERY'
  | 'STEP_UP_AUTH'
  | 'INVITATION_ACCEPTANCE'
  | 'SECURITY_CONFIRMATION'
  | 'LOGIN';

interface OtpEmailData {
  code: string;
  school: SchoolBranding;
  purpose: OtpPurpose;
  expiresInMinutes: number;
}

/**
 * Transactional OTP email (§11, §12).
 *
 * Carries the establishment's branding when the workflow belongs to a school —
 * name, logo, contact details, and the school's configured accent colour used
 * flat, never as a gradient. When there is no school (e.g. a system-level
 * recovery), it falls back to the SchoolFlow identity so the mail still looks
 * intentional rather than generic.
 */
export function otpEmail(data: OtpEmailData): string {
  const accent = data.school.primaryColor || '#2447d8';
  const schoolName = data.school.name || 'SchoolFlow';
  const reason = PURPOSE_LABEL[data.purpose] || 'Vérification de sécurité';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f6fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e7ef;">

        <!-- Header: school identity, or SchoolFlow when there is no school -->
        <tr>
          <td style="background-color:${accent};padding:28px 32px;text-align:center;">
            ${data.school.logo ? `<img src="${data.school.logo}" alt="Logo de ${schoolName}" style="max-height:56px;margin-bottom:12px;" />` : ''}
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">${schoolName}</h1>
            <p style="color:#ffffff;opacity:0.85;margin:6px 0 0;font-size:13px;">SchoolFlow</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 32px;">
            <h2 style="color:#171d2b;margin:0 0 8px;font-size:19px;">${reason}</h2>
            <p style="color:#505b76;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Utilisez le code ci-dessous pour continuer.
            </p>

            <div style="text-align:center;margin:0 0 24px;">
              <div style="display:inline-block;background-color:#f4f6fa;border:2px dashed ${accent};border-radius:10px;padding:18px 36px;">
                <span style="font-size:34px;font-weight:700;letter-spacing:8px;color:${accent};font-family:'Courier New',monospace;">${data.code}</span>
              </div>
            </div>

            <p style="color:#6b7793;font-size:13px;text-align:center;margin:0;">
              Ce code expire dans <strong>${data.expiresInMinutes} minutes</strong>.
            </p>

            <p style="color:#6b7793;font-size:13px;line-height:1.6;margin:24px 0 0;">
              Ne partagez jamais ce code. Le personnel de ${schoolName} ne vous le
              demandera jamais. Si vous n’avez pas demandé ce code, ignorez cet e-mail
              ou contactez l’administration de votre établissement.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;padding:20px 32px;border-top:1px solid #e2e7ef;text-align:center;">
            <p style="color:#9aa5ba;font-size:12px;margin:0;">
              ${data.school.address ? `${data.school.address} · ` : ''}${data.school.phone ? `Tél: ${data.school.phone}` : ''}
            </p>
            <p style="color:#9aa5ba;font-size:11px;margin:8px 0 0;">
              SchoolFlow — Progiciel de gestion scolaire
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}