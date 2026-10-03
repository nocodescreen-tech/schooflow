import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { sendEmail } from '../services/EmailService.js';

const router = Router();

/**
 * POST /api/contact — Send a contact/support email
 *
 * Public endpoint (no auth required) for contact forms on public pages.
 * Also usable by authenticated users for support requests.
 */
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Le nom est obligatoire'),
    body('email').isEmail().withMessage('Email invalide'),
    body('subject').trim().notEmpty().withMessage('L\'objet est obligatoire'),
    body('message').trim().notEmpty().withMessage('Le message est obligatoire'),
    body('page').optional().isString(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { name, email, subject, message, page } = req.body;

      // Build HTML email
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8fafc; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: #2563eb; border-radius: 12px; margin-bottom: 12px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <h1 style="margin: 0; color: #1e293b; font-size: 24px; font-weight: 700;">SCHOOLFLOW</h1>
              <p style="margin: 8px 0 0; color: #64748b; font-size: 14px;">Nouveau message de contact</p>
            </div>

            <div style="background: white; border-radius: 8px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">De</label>
                <p style="margin: 0; font-size: 16px; color: #1e293b;">${name} <${email}></p>
              </div>
              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Objet</label>
                <p style="margin: 0; font-size: 16px; color: #1e293b;">${subject}</p>
              </div>
              ${page ? `
              <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Page d'origine</label>
                <p style="margin: 0; font-size: 14px; color: #64748b;">${page}</p>
              </div>
              ` : ''}
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Message</label>
                <div style="background: #f8fafc; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px; color: #334155;">${message}</div>
              </div>
            </div>

            <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">Cet email a été envoyé depuis le formulaire de contact de SchoolFlow.</p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Répondez directement à cet email pour contacter l'expéditeur.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Send email to support address
      const result = await sendEmail({
        to: 'schoolflow.platform@gmail.com',
        subject: `[SchoolFlow Contact] ${subject}`,
        html,
        replyTo: email,
      });

      if (!result.success) {
        console.error('[CONTACT] Email sending failed:', result);
        return res.status(500).json({ success: false, error: 'Échec de l\'envoi de l\'email. Veuillez réessayer.' });
      }

      return res.json({ success: true, data: { message: 'Message envoyé avec succès' } });
    } catch (error) {
      console.error('[CONTACT] Error:', error);
      return res.status(500).json({ success: false, error: 'Erreur serveur. Veuillez réessayer plus tard.' });
    }
  }
);

export default router;