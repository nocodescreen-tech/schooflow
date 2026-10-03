import { SchoolBranding } from '../../services/email.js';

interface PaymentReceiptData {
  studentName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  reference: string;
  feeType: string;
  school: SchoolBranding;
}

export function paymentReceiptEmail(data: PaymentReceiptData): string {
  const primaryColor = data.school.primaryColor || '#1a56db';
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background-color:${primaryColor};padding:30px;text-align:center;">
            ${data.school.logo ? `<img src="${data.school.logo}" alt="Logo" style="max-height:60px;margin-bottom:10px;" />` : ''}
            <h1 style="color:#ffffff;margin:0;font-size:24px;">${data.school.name}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 30px;">
            <h2 style="color:#111827;margin-top:0;">Reçu de Paiement</h2>
            <p style="color:#4b5563;font-size:15px;">Référence : <strong>${data.reference}</strong></p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Élève</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold;">${data.studentName}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Type de frais</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold;">${data.feeType}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Date</td>
                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:bold;">${data.paymentDate}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#111827;font-size:16px;"><strong>Montant payé</strong></td>
                <td style="padding:10px 0;text-align:right;font-size:16px;"><strong>${data.amount.toFixed(2)} ${data.currency}</strong></td>
              </tr>
            </table>
            <p style="color:#6b7280;font-size:13px;">Merci pour votre paiement. Ce reçu fait office de preuve de paiement.</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">
              ${data.school.address ? `${data.school.address} · ` : ''}${data.school.phone ? `Tél: ${data.school.phone}` : ''}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
