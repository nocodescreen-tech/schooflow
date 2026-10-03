import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import LanguageSwitcher from '../components/LanguageSwitcher';
import OtpVerification from './OtpVerification';
import api from '../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) {
      setError('Veuillez entrer votre adresse email.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible d\'envoyer le code.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = ({ resetToken }: { resetToken?: string }) => {
    if (resetToken) {
      navigate(`/reset-password?token=${resetToken}`);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background dark:bg-dark flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0, 0, 0, 1] }}
          className="w-full max-w-md"
        >
          <div className="card p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-6 h-6 text-primary-500" />
            </div>
            <h1 className="text-xl font-bold text-text">Code envoyé</h1>
            <p className="text-sm text-muted mt-2">
              Si un compte correspond à <strong>{email}</strong>, un code de récupération a été envoyé.
            </p>
            <p className="text-sm text-muted mt-4">Vérifiez votre boîte de réception (et les spams).</p>
            <Link to="/login" className="mt-6 btn-secondary inline-flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Retour à la connexion
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

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
              <Mail className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-text">
              SCHOOL<span className="text-primary-500">FLOW</span>
            </span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        <h1 className="text-3xl font-bold text-text dark:text-white mb-2">Mot de passe oublié</h1>
        <p className="text-muted dark:text-gray-400 mb-6">
          Entrez votre adresse email pour recevoir un code de récupération.
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

        <form onSubmit={handleRequestCode} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Adresse email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-11"
                placeholder="vous@exemple.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <button type="submit" disabled={loading || !email} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                Envoi…
              </>
            ) : (
              <>
                Envoyer le code
                <ArrowLeft className="w-4 h-4 -rotate-90" />
              </>
            )}
          </button>
        </form>

        <Link to="/login" className="mt-6 block text-center text-sm text-muted dark:text-gray-400 hover:text-primary-500 transition-colors">
          Retour à la connexion
        </Link>
      </motion.div>
    </div>
  );
}