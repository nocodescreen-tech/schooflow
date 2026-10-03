import { SchoolBranding } from '../../services/email.js';

interface AnnouncementData {
  title: string;
  message: string;
  authorName: string;
  school: SchoolBranding;
}

export function announcementEmail(data: AnnouncementData): string {
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
            <h2 style="color:#111827;margin-top:0;">${data.title}</h2>
            <p style="color:#4b5563;font-size:15px;line-height:1.8;">${data.message}</p>
            <p style="color:#6b7280;font-size:13px;margin-top:30px;">— ${data.authorName}</p>
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
