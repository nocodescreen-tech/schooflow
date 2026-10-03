import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import OtpInput from '../components/OtpInput';
import { useToastStore } from '../components/Toast';
import api from '../lib/api';

/**
 * OtpVerification — reusable verification page (§13–16, §40).
 *
 * One page serves every workflow: registration, activation, password reset,
 * email change, step-up auth. The `purpose` prop selects the backend policy
 * (TTL, attempt limit, cooldown) and the copy; the logic is identical because
 * it all lives in `OtpService`.
 *
 * States: idle → sending → waiting → verifying → success | error.
 * The resend button shows a live countdown and disables until the cooldown
 * elapses (§8, §36).
 */

type OtpPurpose =
  | 'EMAIL_VERIFICATION'
  | 'ACCOUNT_ACTIVATION'
  | 'PASSWORD_RESET'
  | 'EMAIL_CHANGE'
  | 'ACCOUNT_RECOVERY'
  | 'STEP_UP_AUTH'
  | 'INVITATION_ACCEPTANCE'
  | 'SECURITY_CONFIRMATION';

interface OtpVerificationProps {
  purpose: OtpPurpose;
  email: string;
  /** Called after a successful verification. */
  onVerified: (data: { resetToken?: string }) => void;
  /** Override the default title. */
  title?: string;
  /** Override the default description. */
  description?: string;
}

const PURPOSE_COPY: Record<OtpPurpose, { title: string; description: string }> = {
  EMAIL_VERIFICATION: {
    title: 'Vérifiez votre adresse e-mail',
    description: 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.',
  },
  ACCOUNT_ACTIVATION: {
    title: 'Activez votre compte',
    description: 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail pour activer votre compte.',
  },
  PASSWORD_RESET: {
    title: 'Réinitialisez votre mot de passe',
    description: 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.',
  },
  EMAIL_CHANGE: {
    title: 'Confirmez votre nouvelle adresse',
    description: 'Saisissez le code à 6 chiffres envoyé à votre nouvelle adresse e-mail.',
  },
  ACCOUNT_RECOVERY: {
    title: 'Récupérez votre compte',
    description: 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.',
  },
  STEP_UP_AUTH: {
    title: 'Vérification de sécurité',
    description: 'Saisissez le code à 6 chiffres pour confirmer cette action sensible.',
  },
  INVITATION_ACCEPTANCE: {
    title: 'Acceptez l’invitation',
    description: 'Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.',
  },
  SECURITY_CONFIRMATION: {
    title: 'Confirmation de sécurité',
    description: 'Saisissez le code à 6 chiffres pour confirmer cette opération.',
  },
};

export default function OtpVerification({
  purpose,
  email,
  onVerified,
  title,
  description,
}: OtpVerificationProps) {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const reduce = useReducedMotion();

  const [status, setStatus] = useState<'idle' | 'sending' | 'waiting' | 'verifying'>('idle');
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [expiresInMinutes, setExpiresInMinutes] = useState(10);

  const copy = PURPOSE_COPY[purpose];

  // Request a code on mount.
  useEffect(() => {
    void requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer for the resend cooldown (§8, §36).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setStatus('sending');
    setError('');
    try {
      const res = await api.post('/otp/send', { email, purpose });
      setExpiresInMinutes(res.data?.data?.expiresInMinutes ?? 10);
      setCooldown(res.data?.data?.resendCooldownSeconds ?? 60);
      setStatus('waiting');
    } catch (err) {
      setStatus('idle');
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Impossible d’envoyer le code.');
    }
  };

  const handleComplete = async (code: string) => {
    setStatus('verifying');
    setError('');
    try {
      const res = await api.post('/otp/verify', { email, code, purpose });
      const resetToken = res.data?.data?.resetToken;
      setStatus('idle');
      onVerified({ resetToken });
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Le code est incorrect.';
      setError(message);
      setErrorKey((k) => k + 1);
      setStatus('waiting');
    }
  };

  const handleResend = async () => {
    setStatus('sending');
    setError('');
    try {
      const res = await api.post('/otp/resend', { email, purpose });
      setExpiresInMinutes(res.data?.data?.expiresInMinutes ?? 10);
      setCooldown(res.data?.data?.resendCooldownSeconds ?? 60);
      setStatus('waiting');
      addToast('success', 'Nouveau code envoyé.');
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Impossible de renvoyer le code.';
      setError(message);
      setErrorKey((k) => k + 1);
      setStatus('waiting');
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
        className="w-full max-w-md"
      >
        <div className="card p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle">
            <ShieldCheck className="h-6 w-6 text-accent-text" />
          </div>

          <h1 className="text-h1 text-ink">{title ?? copy.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{description ?? copy.description}</p>

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2">
            <Mail className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="truncate text-sm font-medium text-ink">{email}</span>
          </div>

          <div className="mt-8">
            <OtpInput
              onComplete={handleComplete}
              disabled={status === 'sending' || status === 'verifying'}
              errorKey={errorKey}
            />
          </div>

          {error && (
            <motion.p
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-sm text-danger-text"
              role="alert"
            >
              {error}
            </motion.p>
          )}

          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm text-ink-muted">
              Vous pouvez demander un nouveau code dans{' '}
              <span className="font-semibold tabular-nums text-ink">
                {formatCountdown(cooldown)}
              </span>
            </p>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || status === 'sending' || status === 'verifying'}
              className="btn-secondary w-full"
            >
              {status === 'sending' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Envoi…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Renvoyer le code
                </>
              )}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-ink-subtle">
            Code valide pendant {expiresInMinutes} minutes. Ne partagez jamais ce code.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-4 w-full text-center text-sm text-ink-muted hover:text-ink"
        >
          Retour
        </button>
      </motion.div>
    </div>
  );
}