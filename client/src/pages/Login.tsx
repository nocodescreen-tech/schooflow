import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  GraduationCap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { getRoleHomePath } from '../lib/roles';
import LanguageSwitcher from '../components/LanguageSwitcher';
import api from '../lib/api';
import { backdropVariants, dialogVariants, errorSlide, shake, shakeKeyframes } from '../lib/motion';

type ResetStep = 'email' | 'code' | 'done';

/**
 * Login (§11–14).
 *
 * Left: a composed visual panel — a hand-drawn scene of a teacher at work, not a
 * stock photo and not a gradient. Right: the form.
 *
 * The failed-login feedback is a small horizontal shake of the form plus an
 * error panel that slides in (§13). It is deliberately understated: a shake
 * that reads as "that didn't work", never as theatre.
 */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login, isLoading } = useAuthStore();
  const { t } = useLanguageStore();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  // Password reset flow
  const [showReset, setShowReset] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetPending, setResetPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      if (useAuthStore.getState().mustChangePassword) {
        navigate('/app/change-password', { replace: true });
        return;
      }
      navigate(getRoleHomePath(useAuthStore.getState().user?.role));
    } catch {
      setError('Identifiant ou mot de passe incorrect');
    }
  };

  const closeReset = () => {
    setShowReset(false);
    setResetStep('email');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setResetError('');
  };

  const requestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!resetEmail.trim()) {
      setResetError('Saisissez votre adresse email');
      return;
    }
    setResetPending(true);
    try {
      await api.post('/auth/forgot-password', { email: resetEmail.trim() });
      setResetStep('code');
    } catch (err) {
      setResetError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible d\'envoyer le code de récupération.'
      );
    } finally {
      setResetPending(false);
    }
  };

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!/^\d{6}$/.test(resetCode)) {
      setResetError('Le code comporte 6 chiffres');
      return;
    }
    if (newPassword.length < 6) {
      setResetError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Les deux mots de passe ne correspondent pas');
      return;
    }

    setResetPending(true);
    try {
      await api.post('/auth/reset-password', {
        email: resetEmail.trim(),
        code: resetCode,
        newPassword,
      });
      setResetStep('done');
    } catch (err) {
      setResetError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de réinitialiser le mot de passe.'
      );
    } finally {
      setResetPending(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* ── Visual panel (§11) ──
           A composed scene, not a photograph and not a gradient. */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-surface-sunken lg:flex">
        <div className="relative flex h-full w-full max-w-lg flex-col items-center justify-center p-12">
          <img
            src="/img/teacher-at-desk.svg"
            alt="Enseignante utilisant SCHOOLFLOW devant son ordinateur"
            className="max-h-[62vh] w-auto"
          />
          <div className="mt-8 max-w-sm text-center">
            <h2 className="text-h1 text-text">Gérez votre école en toute simplicité</h2>
            <p className="mt-3 text-body text-text-muted">
              Scolarité, notes, présences, finance et documents officiels — dans un seul outil,
              pour tout votre établissement.
            </p>
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5" aria-label="SCHOOLFLOW - Accueil">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                <GraduationCap className="h-5 w-5 text-white" aria-hidden />
              </div>
              <span className="text-h3 font-bold tracking-tight text-text">
                SCHOOL<span className="text-accent">FLOW</span>
              </span>
            </Link>
            <LanguageSwitcher compact />
          </div>

          <h1 className="text-display text-text">Bon retour !</h1>
          <p className="mb-8 mt-2 text-body text-text-muted">Connectez-vous à votre compte</p>

          {/* Error feedback: a small shake plus a sliding message (§13). */}
          <motion.div
            key={error}
            variants={errorSlide}
            initial="initial"
            animate="animate"
            className={error ? 'mb-6' : 'mb-0'}
          >
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger-text"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </motion.div>

          <motion.form
            onSubmit={handleSubmit}
            className="space-y-5"
            animate={error && !reduce ? { x: shakeKeyframes.x } : { x: 0 }}
            transition={shake}
          >
            <div>
              <label htmlFor="login-email" className="input-label">
                {t('auth.email') || 'Email'} <span className="font-normal text-text-muted">ou identifiant</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
                <input
                  id="login-email"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-11"
                  placeholder="admin@ecole.fr ou j.kabeya"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="input-label">
                {t('auth.password') || 'Mot de passe'}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-11 pr-11"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                <span className="text-sm text-text-muted">Se souvenir de moi</span>
              </label>
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="text-sm font-medium text-accent-text hover:underline"
              >
                {t('auth.forgotPassword') || 'Mot de passe oublié ?'}
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary btn-lg w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Connexion…
                </>
              ) : (
                <>
                  {t('auth.login') || 'Se connecter'}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          </motion.form>

          <p className="mt-6 text-center text-sm text-text-muted">
            {t('auth.noAccount') || 'Pas de compte ?'}{' '}
            <Link to="/register" className="font-medium text-accent-text hover:underline">
              {t('auth.register') || 'S\'inscrire'}
            </Link>
          </p>

          <p className="mt-3 text-center text-sm text-text-muted">
            Élève ou parent avec un code d'activation ?{' '}
            <Link to="/activate" className="font-medium text-accent-text hover:underline">
              Activer mon compte
            </Link>
          </p>
        </div>
      </div>

      {/* ── Password reset (§14) ── */}
      {showReset && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-slate-950/40"
            onClick={closeReset}
          />
          <motion.div
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Réinitialiser le mot de passe"
            className="relative w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-lg"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-h3 text-text">Réinitialiser le mot de passe</h2>
              <button onClick={closeReset} className="btn-icon" aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {resetError && (
              <div role="alert" className="mb-4 rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger-text">
                {resetError}
              </div>
            )}

            {resetStep === 'email' && (
              <form onSubmit={requestResetCode} className="space-y-4">
                <p className="text-sm text-text-muted">
                  Saisissez l'adresse email de votre compte. Si elle existe, un code de
                  récupération vous sera envoyé.
                </p>
                <div>
                  <label htmlFor="reset-email" className="input-label">Adresse email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="input-field pl-11"
                      placeholder="admin@ecole.com"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeReset} className="btn-ghost">Annuler</button>
                  <button type="submit" disabled={resetPending} className="btn-primary">
                    {resetPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {resetPending ? 'Envoi…' : 'Envoyer le code'}
                  </button>
                </div>
              </form>
            )}

            {resetStep === 'code' && (
              <form onSubmit={submitNewPassword} className="space-y-4">
                <p className="text-sm text-text-muted">
                  Un code à 6 chiffres a été envoyé à{' '}
                  <strong className="text-text">{resetEmail}</strong>. Saisissez-le avec votre
                  nouveau mot de passe.
                </p>
                <div>
                  <label htmlFor="reset-code" className="input-label">Code de récupération</label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    className="input-field text-center font-mono tracking-[0.4em]"
                    placeholder="000000"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="reset-new" className="input-label">Nouveau mot de passe</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
                    <input
                      id="reset-new"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field pl-11 pr-11"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="btn-icon absolute right-1.5 top-1/2 -translate-y-1/2"
                      aria-label={showPassword ? 'Masquer' : 'Afficher'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="reset-confirm" className="input-label">Confirmer le mot de passe</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" aria-hidden />
                    <input
                      id="reset-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field pl-11"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-between gap-3 pt-2">
                  <button type="button" onClick={() => setResetStep('email')} className="btn-ghost">
                    Recommencer
                  </button>
                  <button type="submit" disabled={resetPending} className="btn-primary">
                    {resetPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {resetPending ? 'Réinitialisation…' : 'Réinitialiser'}
                  </button>
                </div>
              </form>
            )}

            {resetStep === 'done' && (
              <div className="py-4 text-center">
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-success" aria-hidden />
                <h3 className="text-h3 text-text">Mot de passe réinitialisé</h3>
                <p className="mb-6 mt-2 text-sm text-text-muted">
                  Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                </p>
                <button onClick={closeReset} className="btn-primary btn-lg w-full">
                  Retour à la connexion
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}