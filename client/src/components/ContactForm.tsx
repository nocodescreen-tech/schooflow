import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToastStore } from './Toast';

interface ContactFormProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSubject?: string;
  pageContext?: string;
}

export default function ContactForm({ isOpen, onClose, defaultSubject, pageContext }: ContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: defaultSubject || '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { addToast } = useToastStore();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Le nom est obligatoire';
    if (!formData.email.trim()) newErrors.email = 'L\'email est obligatoire';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (!formData.subject.trim()) newErrors.subject = 'L\'objet est obligatoire';
    if (!formData.message.trim()) newErrors.message = 'Le message est obligatoire';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      await api.post('/contact', {
        ...formData,
        page: pageContext || window.location.pathname,
      });

      setSubmitStatus('success');
      addToast('success', 'Message envoyé avec succès ! Nous vous répondrons rapidement.');

      // Reset form after success
      setTimeout(() => {
        setFormData({ name: '', email: '', subject: defaultSubject || '', message: '' });
        setSubmitStatus('idle');
        onClose();
      }, 2000);
    } catch (error: any) {
      setSubmitStatus('error');
      const message = error.response?.data?.error || 'Erreur lors de l\'envoi. Veuillez réessayer.';
      addToast('error', message);
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-dark/50 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden dark:bg-[#1E293B] dark:border-white/10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text dark:text-white">Contacter le support</h2>
                <p className="text-xs text-muted dark:text-gray-400">Nous vous répondrons sous 24h</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
              className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-gray-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <AnimatePresence mode="wait">
              {submitStatus === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-text dark:text-white mb-2">Message envoyé !</h3>
                  <p className="text-sm text-muted dark:text-gray-400">
                    Merci {formData.name}. Notre équipe vous répondra à <strong>{formData.email}</strong> sous 24h.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-text dark:text-white mb-1.5">
                      Votre nom
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                      <input
                        id="name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-background dark:bg-[#0B1120] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                        placeholder="Jean Dupont"
                        disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
                        aria-invalid={!!errors.name}
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-text dark:text-white mb-1.5">
                      Votre email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                      <input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-background dark:bg-[#0B1120] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                        placeholder="jean@email.com"
                        disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
                        aria-invalid={!!errors.email}
                      />
                    </div>
                    {errors.email && <p className="mt-1 text-sm text-danger">{errors.email}</p>}
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-text dark:text-white mb-1.5">
                      Objet
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                      <input
                        id="subject"
                        type="text"
                        value={formData.subject}
                        onChange={(e) => handleChange('subject', e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-background dark:bg-[#0B1120] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                        placeholder="Question sur mon compte, facturation, bug, etc."
                        disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
                        aria-invalid={!!errors.subject}
                      />
                    </div>
                    {errors.subject && <p className="mt-1 text-sm text-danger">{errors.subject}</p>}
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-text dark:text-white mb-1.5">
                      Message
                    </label>
                    <textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => handleChange('message', e.target.value)}
                      rows={5}
                      className="w-full px-4 py-2.5 rounded-xl border bg-background dark:bg-[#0B1120] text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
                      placeholder="Décrivez votre demande ou votre problème en détail..."
                      disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
                      aria-invalid={!!errors.message}
                    />
                    {errors.message && <p className="mt-1 text-sm text-danger">{errors.message}</p>}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted dark:text-gray-500">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Vos données ne sont utilisées que pour vous répondre. Consultez notre <a href="/legal/privacy" className="underline hover:text-primary-500">politique de confidentialité</a>.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || (submitStatus as 'idle' | 'success' | 'error') === 'success'}
                    className="w-full py-3 px-4 rounded-xl bg-primary-500 text-white font-medium text-sm hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:ring-offset-surface dark:focus:ring-offset-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Envoyer le message
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}