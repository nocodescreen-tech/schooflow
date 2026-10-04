import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { errorSlide } from '../lib/motion';
import {
  GraduationCap,
  Mail,
  Lock,
  User,
  School,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { cn } from '../lib/utils';
import api from '../lib/api';

type Step = 1 | 2 | 3 | 4;

const STEPS = ['Informations', 'Compte', 'Conditions', 'Vérification'];
const RESEND_COOLDOWN = 60;

export default function Register() {
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    schoolName: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { register, isLoading } = useAuthStore();
  const { t } = useLanguageStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Live password strength
  const strength = (() => {
    const pw = formData.password;
    const checks = [
      { label: 'Au moins 8 caractères', ok: pw.length >= 8 },
      { label: 'Une lettre minuscule', ok: /[a-z]/.test(pw) },
      { label: 'Une lettre majuscule', ok: /[A-Z]/.test(pw) },
      { label: 'Un chiffre', ok: /\d/.test(pw) },
    ];
    const score = checks.filter((c) => c.ok).length;
    if (pw.length === 0) {
      return { score: 0, label: '', color: 'bg-gray-300', text: 'text-muted', checks };
    }
    if (score <= 1) return { score, label: 'Faible', color: 'bg-danger', text: 'text-danger', checks };
    if (score === 2) return { score, label: 'Moyen', color: 'bg-warning', text: 'text-warning', checks };
    if (score === 3) return { score, label: 'Bon', color: 'bg-primary-500', text: 'text-primary-500', checks };
    return { score, label: 'Excellent', color: 'bg-success', text: 'text-success', checks };
  })();

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const passwordMatch =
    formData.confirmPassword.length === 0 || formData.password === formData.confirmPassword;
  const phoneValid = formData.phone.trim().length >= 6;

  const step1Valid =
    formData.schoolName.trim().length > 0 &&
    formData.firstName.trim().length > 0 &&
    formData.lastName.trim().length > 0 &&
    phoneValid;
  const step2Valid =
    emailValid && formData.password.length >= 8 && formData.password === formData.confirmPassword;

  const next = () => {
    setError('');
    if (step === 1 && !step1Valid) {
      setError('Veuillez remplir tous les champs correctement');
      return;
    }
    if (step === 2 && !step2Valid) {
      if (!emailValid) setError('Adresse email invalide');
      else if (formData.password.length < 8)
        setError('Le mot de passe doit contenir au moins 8 caractères');
      else setError('Les mots de passe ne correspondent pas');
      return;
    }
    setStep((s) => Math.min(4, s + 1) as Step);
  };

  const back = () => {
    setError('');
    setStep((s) => Math.max(1, s - 1) as Step);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptTerms) {
      setError('Vous devez accepter les conditions générales d\'utilisation');
      return;
    }
    try {
      await register({
        schoolName: formData.schoolName.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        password: formData.password,
        acceptTerms: true,
      });
      setCooldown(RESEND_COOLDOWN);
      setStep(4);
    } catch {
      setError("Une erreur est survenue lors de l'inscription");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code)) {
      setError('Le code comporte 6 chiffres');
      return;
    }
    setVerifying(true);
    try {
      await api.post('/otp/verify', {
        email: formData.email.trim(),
        code,
        purpose: 'EMAIL_VERIFICATION',
      });
      navigate('/onboarding');
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Code invalide, veuillez réessayer'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError('');
    setResending(true);
    try {
      await api.post('/otp/resend', {
        email: formData.email.trim(),
        purpose: 'EMAIL_VERIFICATION',
      });
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de renvoyer le code'
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          className="w-full max-w-md py-8"
        >
          <div className="flex items-center justify-between mb-8">
            <Link to="/" className="flex items-center gap-2" aria-label="SCHOOLFLOW - Accueil">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-text dark:text-white">
                SCHOOL<span className="text-accent">FLOW</span>
              </span>
            </Link>
            <LanguageSwitcher compact />
          </div>

          <h1 className="text-3xl font-bold text-text dark:text-white mb-2">Créer un compte</h1>
          <p className="text-text-muted dark:text-gray-400 mb-6">
            Créez le compte de direction de votre établissement
          </p>

          {/* Stepper */}
          <div className="flex items-center gap-1.5 mb-8">
            {STEPS.map((label, i) => {
              const n = (i + 1) as Step;
              const active = step === n;
              const done = step > n;
              return (
                <div key={label} className="flex-1">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-colors',
                      done
                        ? 'bg-success'
                        : active
                        ? 'bg-accent'
                        : 'bg-border'
                    )}
                  />
                  <p
                    className={cn(
                      'text-caption mt-1.5 font-medium',
                      active
                        ? 'text-accent'
                        : done
                        ? 'text-success'
                        : 'text-text-subtle'
                    )}
                  >
                    {label}
                  </p>
                </div>
              );
            })}
          </div>

          {error && (
            <motion.div
              variants={errorSlide}
              initial="initial"
              animate="animate"
              className="mb-6 rounded-xl border border-danger-border bg-danger-soft p-3 text-sm text-danger-text"
            >
              {error}
            </motion.div>
          )}

          {/* Step 1 — Infos */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="input-label">
                  {t('auth.schoolName') || 'Nom de l\'établissement'}
                </label>
                <div className="relative">
                  <School className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="text"
                    value={formData.schoolName}
                    onChange={(e) => updateField('schoolName', e.target.value)}
                    className="input-field pl-11"
                    placeholder="École Internationale"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">
                    {t('auth.firstName') || 'Prénom'}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      className="input-field pl-11"
                      placeholder="Jean"
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">
                    {t('auth.lastName') || 'Nom'}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      className="input-field pl-11"
                      placeholder="Dupont"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="input-label">
                  Téléphone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className={cn(
                      'input-field pl-11 pr-10',
                      formData.phone.length > 0 && !phoneValid && 'input-error'
                    )}
                    placeholder="+224 6 XX XX XX XX"
                  />
                  {formData.phone.length > 0 && (
                    phoneValid ? (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
                    ) : (
                      <X className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-danger" />
                    )
                  )}
                </div>
                {formData.phone.length > 0 && !phoneValid && (
                  <p className="text-xs text-danger mt-1.5">Numéro de téléphone invalide</p>
                )}
              </div>
              <button
                type="button"
                onClick={next}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-6"
              >
                Continuer
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2 — Compte */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="input-label">
                  {t('auth.email') || 'Email'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className={cn(
                      'input-field pl-11 pr-10',
                      formData.email.length > 0 && !emailValid && 'input-error'
                    )}
                    placeholder="admin@ecole.fr"
                  />
                  {formData.email.length > 0 && (
                    emailValid ? (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
                    ) : (
                      <X className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-danger" />
                    )
                  )}
                </div>
                {formData.email.length > 0 && !emailValid && (
                  <p className="text-xs text-danger mt-1.5">Adresse email invalide</p>
                )}
              </div>

              <div>
                <label className="input-label">
                  {t('auth.password') || 'Mot de passe'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    className="input-field pl-11 pr-11"
                    placeholder="Min. 8 caractères"
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

                {formData.password.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                        <motion.div
                          initial={false}
                          animate={{ width: `${(strength.score / 4) * 100}%` }}
                          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                          className={`h-full rounded-full ${strength.color}`}
                        />
                      </div>
                      <span className={`text-xs font-medium ${strength.text}`}>{strength.label}</span>
                    </div>
                    <ul className="space-y-1">
                      {strength.checks.map((c) => (
                        <li key={c.label} className="flex items-center gap-1.5 text-xs">
                          {c.ok ? (
                            <Check className="w-3 h-3 text-success shrink-0" />
                          ) : (
                            <X className="w-3 h-3 text-text-subtle shrink-0" />
                          )}
                          <span className={c.ok ? 'text-text-muted' : 'text-text-subtle'}>
                            {c.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <label className="input-label">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    className={cn('input-field pl-11 pr-10', !passwordMatch && 'input-error')}
                    placeholder="••••••••"
                  />
                  {formData.confirmPassword.length > 0 && (
                    formData.password === formData.confirmPassword ? (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
                    ) : (
                      <X className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-danger" />
                    )
                  )}
                </div>
                {!passwordMatch && formData.confirmPassword.length > 0 && (
                  <p className="text-xs text-danger mt-1.5">
                    Les deux mots de passe ne correspondent pas
                  </p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={back}
                  className="btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
                >
                  Continuer
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — CGU */}
          {step === 3 && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="card p-5 space-y-3">
                <h2 className="font-semibold text-text dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-accent" />
                  Récapitulatif
                </h2>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">{t('auth.schoolName') || 'Établissement'}</dt>
                    <dd className="font-medium text-text text-right">{formData.schoolName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">{t('auth.firstName') || 'Prénom'}</dt>
                    <dd className="font-medium text-text text-right">{formData.firstName} {formData.lastName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">Téléphone</dt>
                    <dd className="font-medium text-text text-right">{formData.phone}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">{t('auth.email') || 'Email'}</dt>
                    <dd className="font-medium text-text text-right break-all">{formData.email}</dd>
                  </div>
                </dl>
              </div>
              <label className="flex items-start gap-3 cursor-pointer card p-4">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-border text-accent focus:ring-accent shrink-0"
                />
                <span className="text-sm text-text dark:text-gray-300">
                  J'accepte les{' '}
                  <Link to="/legal" className="text-accent hover:text-accent-hover font-medium">
                    conditions générales d'utilisation
                  </Link>{' '}
                  et la politique de confidentialité de SCHOOLFLOW. Ce champ est obligatoire.
                </span>
              </label>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={back}
                  className="btn-secondary py-3 flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {t('auth.register') || 'Créer le compte'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 4 — Vérification */}
          {step === 4 && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="card p-5 text-center">
                <ShieldCheck className="w-10 h-10 text-accent mx-auto mb-3" />
                <h2 className="font-semibold text-text dark:text-white">Vérifiez votre email</h2>
                <p className="text-sm text-text-muted mt-1">
                  Un code à 6 chiffres a été envoyé à{' '}
                  <strong className="text-text">{formData.email}</strong>
                </p>
              </div>
              <div>
                <label className="input-label">
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
                />
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                {verifying ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Valider
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                className="btn-ghost w-full py-2 text-sm disabled:opacity-50"
              >
                {resending
                  ? 'Envoi…'
                  : cooldown > 0
                  ? `Renvoyer le code (${cooldown}s)`
                  : 'Renvoyer le code'}
              </button>
            </form>
          )}

          {step < 4 && (
            <p className="mt-6 text-center text-sm text-text-muted">
              {t('auth.hasAccount') || 'Déjà un compte ?'}{' '}
              <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
                {t('auth.login') || 'Se connecter'}
              </Link>
            </p>
          )}
        </motion.div>
      </div>

      {/* Right Panel — composed scene, no decorative blobs */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-surface-sunken lg:flex">
        <div className="relative z-10 w-full max-w-md p-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          >
            <img
              src="/img/scene-classroom.svg"
              alt="Classe en situation d'apprentissage avec SCHOOLFLOW"
              className="mx-auto mb-8 w-full max-w-xs"
            />
            <h2 className="text-h1 text-text">Votre établissement, en un seul endroit</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Élèves, notes, présences, frais scolaires et bulletins — gérés par votre équipe
              chaque jour, avec des données isolées par établissement.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}