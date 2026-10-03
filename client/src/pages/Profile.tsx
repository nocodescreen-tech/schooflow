import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  Shield,
  Camera,
  Check,
  AlertTriangle,
  Loader2,
  KeyRound,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import { cn } from '../lib/utils';

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const school = useAuthStore((s) => s.school);
  const setUser = useAuthStore((s) => s.setUser);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [touched, setTouched] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwError, setPwError] = useState('');

  const nameError = touched && !name.trim() ? 'Le nom est obligatoire' : '';
  const phoneError =
    touched && phone && !/^[+0-9 ().-]{6,20}$/.test(phone) ? 'Numéro de téléphone invalide' : '';
  const pwLocalError =
    next.length > 0 && next.length < 6 ? 'Au moins 6 caractères' : next !== confirm ? 'Les mots de passe ne correspondent pas' : '';

  const profileMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put('/settings/profile', { name: name.trim(), phone: phone.trim() });
      return res.data?.data?.user;
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated);
      addToast('success', 'Profil mis à jour');
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (err: unknown) =>
      addToast(
        'error',
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de mettre à jour le profil'
      ),
  });

  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('photo', file);
      const res = await api.post('/settings/photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.user;
    },
    onSuccess: (updated) => {
      if (updated) setUser(updated);
      addToast('success', 'Photo mise à jour');
    },
    onError: () => addToast('error', 'Upload impossible (type ou taille non autorisé)'),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      await api.post('/settings/password', { currentPassword: current, newPassword: next });
    },
    onSuccess: () => {
      addToast('success', 'Mot de passe modifié');
      setPwOpen(false);
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (err: unknown) =>
      setPwError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Impossible de modifier le mot de passe'
      ),
  });

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (next.length < 6) {
      setPwError('Le nouveau mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (next !== confirm) {
      setPwError('Les deux mots de passe ne correspondent pas');
      return;
    }
    passwordMutation.mutate();
  };

  const initials = (user?.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <PageTransition>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Mon profil</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Vos informations personnelles et votre sécurité
          </p>
        </div>

        {/* Identity card */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-24 h-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-accent flex items-center justify-center text-white text-2xl font-bold">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={photoMutation.isPending}
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-surface dark:bg-[#1E293B] border border-border dark:border-white/10 flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Changer la photo"
                title="Changer la photo"
              >
                {photoMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                ) : (
                  <Camera className="w-4 h-4 text-muted" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) photoMutation.mutate(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="text-center sm:text-left min-w-0">
              <h2 className="text-xl font-semibold text-text dark:text-gray-100 truncate">
                {user?.name ?? '—'}
              </h2>
              <p className="text-sm text-muted dark:text-gray-400 mt-0.5 flex items-center gap-1.5 justify-center sm:justify-start">
                <Mail className="w-3.5 h-3.5" /> {user?.email ?? '—'}
              </p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                <span className="badge badge-info">
                  <Shield className="w-3 h-3 mr-1" />
                  {user?.role ?? '—'}
                </span>
                {school?.name && (
                  <span className="badge">
                    <Building2 className="w-3 h-3 mr-1" />
                    {school.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <form
          className="card p-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!name.trim() || (phone && !/^[+0-9 ().-]{6,20}$/.test(phone))) return;
            profileMutation.mutate();
          }}
        >
          <h3 className="font-semibold text-text dark:text-gray-100">Informations personnelles</h3>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Nom complet
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className={cn('input-field pl-10', nameError && '!border-danger')}
                />
              </div>
              {nameError && <p className="text-xs text-danger mt-1">{nameError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                Téléphone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="+243 8.. .. .. .."
                  className={cn('input-field pl-10', phoneError && '!border-danger')}
                />
              </div>
              {phoneError && <p className="text-xs text-danger mt-1">{phoneError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
              Adresse email
            </label>
            <input value={user?.email ?? ''} disabled className="input-field opacity-60" />
            <p className="text-xs text-muted dark:text-gray-400 mt-1.5">
              L’adresse email est votre identifiant de connexion et ne peut pas être modifiée ici.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileMutation.isPending}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {profileMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {profileMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>

        {/* Security */}
        <div className="card p-6">
          <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Sécurité</h3>
          <p className="text-sm text-muted dark:text-gray-400 mb-5">
            Choisissez un mot de passe que vous seul connaissez.
          </p>

          {!pwOpen ? (
            <button onClick={() => setPwOpen(true)} className="btn-secondary flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Changer mon mot de passe
            </button>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submitPassword}
              className="space-y-4"
            >
              {pwError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-danger dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {pwError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Nouveau mot de passe
                  </label>
                  <input
                    type="password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                    Confirmer
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
              </div>

              {pwLocalError && <p className="text-xs text-danger">{pwLocalError}</p>}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPwOpen(false);
                    setPwError('');
                    setCurrent('');
                    setNext('');
                    setConfirm('');
                  }}
                  className="btn-ghost"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={passwordMutation.isPending}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {passwordMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {passwordMutation.isPending ? 'Modification…' : 'Modifier'}
                </button>
              </div>
            </motion.form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
