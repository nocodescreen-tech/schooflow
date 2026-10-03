import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { KeyRound, ShieldCheck, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { cn } from '../lib/utils';
import api from '../lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguageStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'verify' | 'password' | 'done'>('verify');
  const [resetToken, setResetToken] = useState<string | null>(null);

  const resetTokenFromUrl = searchParams.get('token');

  // If we have a reset token from URL (from email link), skip verification step
  useEffect(() => {
    if (resetTokenFromUrl) {
      setStep('password');
      setResetToken(resetTokenFromUrl);
    }
  }, [resetTokenFromUrl]);

  const passwordsMatch = newPassword === confirmPassword;
  const strongEnough = newPassword.length >= 8;
  const canSubmitPassword = strongEnough && passwordsMatch && !loading;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) {
      setError('Veuillez entrer votre adresse email.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Le code comporte 6 chiffres.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/otp/verify', {
        email: email.trim(),
        code,
        purpose: 'PASSWORD_RESET',
      });
      const token = res.data?.data?.resetToken;
      if (token) {
        setResetToken(token);
        setStep('password');
      } else {
        setError('Impossible d\'obtenir le token de réinitialisation.');
      }
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Code invalide ou expiré.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!passwordsMatch) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!strongEnough) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (!resetToken) {
      setError('Session expirée. Veuillez recommencer.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/otp/password-reset', {
        token: resetToken,
        newPassword,
      });
      setStep('done');
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de réinitialiser le mot de passe.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-background dark:bg-dark flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          className="w-full max-w-md"
        >
          <div className="card p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h1 className="text-xl font-bold text-text mb-2">Mot de passe réinitialisé</h1>
            <p className="text-sm text-muted">Redirection vers la connexion…</p>
            <Link to="/login" className="mt-4 btn-primary inline-flex items-center gap-2">
              Se connecter <ArrowLeft className="w-4 h-4 -rotate-90" />
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="min-h-screen bg-background dark:bg-dark flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          className="w-full max-w-md"
        >
          <div className="card p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6 text-primary-500" />
              </div>
              <h1 className="text-xl font-bold text-text">Nouveau mot de passe</h1>
              <p className="text-sm text-muted mt-1">
                Entrez votre nouveau mot de passe
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input w-full pr-10"
                    minLength={8}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                    aria-label={showNew ? 'Masquer' : 'Afficher'}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword && !strongEnough && (
                  <p className="text-xs text-danger mt-1">8 caractères minimum.</p>
                )}
              </div>
              <div>
                <label className="label">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={cn('input w-full pr-10', confirmPassword && !passwordsMatch && '!border-danger')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                    aria-label={showConfirm ? 'Masquer' : 'Afficher'}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-danger mt-1">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading || !canSubmitPassword} className="btn-primary w-full">
                {loading ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border dark:border-white/10 flex items-center justify-between">
              <p className="text-xs text-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Vos autres sessions seront déconnectées
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Step: verify code (with email input)
  return (
    <div className="min-h-screen bg-background dark:bg-dark flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
        className="w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-text">
              SCHOOL<span className="text-primary-500">FLOW</span>
            </span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        <h1 className="text-3xl font-bold text-text dark:text-white mb-2">Réinitialiser le mot de passe</h1>
        <p className="text-muted dark:text-gray-400 mb-6">
          Entrez votre email et le code à 6 chiffres reçu.
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger-text"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Adresse email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="vous@exemple.com"
                required
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Code de vérification
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="input-field tracking-[0.4em] text-center font-mono"
              placeholder="000000"
              required
            />
          </div>
          <button type="submit" disabled={loading || !email || code.length !== 6} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Vérification…
              </>
            ) : (
              <>
                Vérifier le code
                <ArrowLeft className="w-4 h-4 -rotate-90" />
              </>
            )}
          </button>
        </form>

        <Link to="/forgot-password" className="mt-6 block text-center text-sm text-muted dark:text-gray-400 hover:text-primary-500 transition-colors">
          <ArrowLeft className="w-4 h-4 inline" /> Renvoyer un code
        </Link>
        <Link to="/login" className="mt-4 block text-center text-sm text-muted dark:text-gray-400 hover:text-primary-500 transition-colors">
          Retour à la connexion
        </Link>
      </motion.div>
    </div>
  );
}