import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

/**
 * Forced password change screen.
 * The backend refuses every other API with 428 while `mustChangePassword` is
 * set, so this page is the only reachable workspace until the change is done.
 */
export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, setSessionToken, clearMustChangePassword, logout } = useAuthStore();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const match = form.next === form.confirm;
  const strongEnough = form.next.length >= 8;
  const canSubmit = form.current && strongEnough && match && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!match) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!strongEnough) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword: form.current,
        newPassword: form.next,
      });
      const token = res.data?.data?.token;
      if (token) setSessionToken(token);
      clearMustChangePassword();
      setDone(true);
      setTimeout(() => navigate('/app', { replace: true }), 1500);
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message ?? 'Impossible de modifier le mot de passe.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background dark:bg-dark flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {done ? (
          <div className="card p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
            <h1 className="text-xl font-bold text-text mb-2">Mot de passe modifié</h1>
            <p className="text-sm text-muted">Redirection vers votre espace…</p>
          </div>
        ) : (
          <div className="card p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6 text-amber-500" />
              </div>
              <h1 className="text-xl font-bold text-text">Changer votre mot de passe</h1>
              <p className="text-sm text-muted mt-1">
                {user?.name ? `${user.name}, ` : ''}votre mot de passe doit être modifié avant de continuer
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Mot de passe temporaire</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    className="input w-full pr-10"
                    value={form.current}
                    onChange={(e) => setForm({ ...form, current: e.target.value })}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                    aria-label={show ? 'Masquer' : 'Afficher'}
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Nouveau mot de passe</label>
                <input
                  type="password"
                  className="input w-full"
                  value={form.next}
                  onChange={(e) => setForm({ ...form, next: e.target.value })}
                  required
                />
                {form.next && !strongEnough && (
                  <p className="text-xs text-danger mt-1">8 caractères minimum.</p>
                )}
              </div>
              <div>
                <label className="label">Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  className="input w-full"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required
                />
                {form.confirm && !match && (
                  <p className="text-xs text-danger mt-1">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={!canSubmit}>
                {loading ? 'Enregistrement…' : 'Modifier le mot de passe'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border dark:border-white/10 flex items-center justify-between">
              <p className="text-xs text-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Vos autres sessions seront déconnectées
              </p>
              <button onClick={logout} className="text-xs text-muted hover:text-danger transition-colors">
                Se déconnecter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
