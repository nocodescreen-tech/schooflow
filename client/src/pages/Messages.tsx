import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Send, Inbox, Trash2, Search, Plus, X } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import { cn } from '../lib/utils';

interface MessageUser {
  id: string;
  name: string;
}

interface Message {
  id: string;
  subject: string | null;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderId: string;
  recipientId: string;
  sender?: MessageUser;
  recipient?: MessageUser;
}

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

type Folder = 'inbox' | 'sent';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function Messages() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const [folder, setFolder] = useState<Folder>('inbox');
  const [items, setItems] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMessages = useCallback(async (f: Folder) => {
    setLoading(true);
    try {
      const res = await api.get(`/messages?folder=${f}`);
      const list: Message[] = res.data?.data?.items ?? [];
      setItems(list);
      setSelectedId((prev) => (list.some((m) => m.id === prev) ? prev : null));
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Impossible de charger les messages'));
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchMessages(folder);
  }, [folder, fetchMessages]);

  useEffect(() => {
    // /messages/recipients only needs messages.create, unlike
    // /settings/users which requires the admin-level users.view permission.
    api.get('/messages/recipients')
      .then((res) => setUsers(res.data?.data?.items ?? []))
      .catch(() => setUsers([]));
  }, []);

  const handleSelect = async (msg: Message) => {
    setSelectedId(msg.id);
    if (folder === 'inbox' && !msg.isRead) {
      try {
        await api.patch(`/messages/${msg.id}/read`);
        setItems((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
      } catch {
        // Non bloquant : le message reste lisible même si le marquage échoue
      }
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleting(true);
    try {
      await api.delete(`/messages/${id}`);
      setItems((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) setSelectedId(null);
      addToast('success', 'Message supprimé');
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Suppression impossible'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCompose = async () => {
    if (!recipientId) {
      addToast('error', 'Choisissez un destinataire');
      return;
    }
    if (!bodyText.trim()) {
      addToast('error', 'Le message est obligatoire');
      return;
    }
    setSending(true);
    try {
      await api.post('/messages', {
        recipientId,
        subject: subject.trim() || undefined,
        body: bodyText.trim(),
      });
      addToast('success', 'Message envoyé');
      setComposeOpen(false);
      setRecipientId('');
      setSubject('');
      setBodyText('');
      if (folder === 'sent') void fetchMessages('sent');
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Envoi impossible'));
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    const msg = items.find((m) => m.id === selectedId);
    if (!msg || !replyText.trim()) return;
    const otherId = folder === 'inbox' ? msg.senderId : msg.recipientId;
    try {
      await api.post('/messages', {
        recipientId: otherId,
        subject: msg.subject ? `Re: ${msg.subject}` : undefined,
        body: replyText.trim(),
      });
      addToast('success', 'Réponse envoyée');
      setReplyText('');
      if (folder === 'sent') void fetchMessages('sent');
    } catch (err) {
      addToast('error', getErrorMessage(err, 'Envoi impossible'));
    }
  };

  const filtered = items.filter((m) => {
    const q = search.toLowerCase();
    const peer = folder === 'inbox' ? m.sender?.name ?? '' : m.recipient?.name ?? '';
    return (m.subject ?? '').toLowerCase().includes(q) || peer.toLowerCase().includes(q) || m.body.toLowerCase().includes(q);
  });

  const selected = items.find((m) => m.id === selectedId) ?? null;
  const unreadCount = folder === 'inbox' ? items.filter((m) => !m.isRead).length : 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('nav.messages')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">
              {folder === 'inbox' ? `${unreadCount} message(s) non lu(s)` : `${items.length} message(s) envoyé(s)`}
            </p>
          </div>
          <button onClick={() => setComposeOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Nouveau message
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFolder('inbox')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              folder === 'inbox'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-white/5 text-text dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'
            )}
          >
            Boîte de réception
          </button>
          <button
            onClick={() => setFolder('sent')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              folder === 'sent'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-white/5 text-text dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'
            )}
          >
            Envoyés
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Message List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card overflow-hidden lg:col-span-1"
          >
            <div className="p-4 border-b border-border dark:border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
            </div>
            <div className="divide-y divide-border dark:divide-white/5 max-h-[500px] overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-sm text-muted dark:text-gray-400 text-center">Chargement...</p>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted dark:text-gray-400 text-center">Aucun message</p>
              ) : (
                filtered.map((msg) => {
                  const peer = folder === 'inbox' ? msg.sender?.name ?? '—' : msg.recipient?.name ?? '—';
                  return (
                    <button
                      key={msg.id}
                      onClick={() => void handleSelect(msg)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors',
                        selectedId === msg.id && 'bg-primary-50 dark:bg-primary-500/10'
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              'text-sm truncate',
                              !msg.isRead && folder === 'inbox'
                                ? 'font-semibold text-text dark:text-gray-100'
                                : 'font-medium text-text dark:text-gray-200'
                            )}
                          >
                            {peer}
                          </p>
                          <p className="text-xs text-muted dark:text-gray-400 truncate mt-0.5">
                            {msg.subject || '(Sans objet)'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {!msg.isRead && folder === 'inbox' && <span className="w-2 h-2 bg-primary-500 rounded-full" />}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* Message Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-6 lg:col-span-2"
          >
            {selected ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-text dark:text-gray-100">
                      {selected.subject || '(Sans objet)'}
                    </h3>
                    <p className="text-sm text-muted dark:text-gray-400 mt-1">
                      {folder === 'inbox' ? `De: ${selected.sender?.name ?? '—'}` : `À: ${selected.recipient?.name ?? '—'}`} ·{' '}
                      {formatDate(selected.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handleDelete(selected.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-danger"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-sm text-text dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Écrire une réponse..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleReply()}
                    className="input-field flex-1"
                  />
                  <button onClick={() => void handleReply()} className="btn-primary flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Envoyer
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Inbox className="w-12 h-12 text-muted dark:text-gray-500 mb-4" />
                <p className="text-muted dark:text-gray-400">Sélectionnez un message pour le lire</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text dark:text-gray-100">Nouveau message</h2>
              <button
                onClick={() => setComposeOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-200 mb-1">Destinataire</label>
              <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="input-field w-full">
                <option value="">— Choisir —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-200 mb-1">Objet (optionnel)</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet du message"
                className="input-field w-full"
                maxLength={255}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-200 mb-1">Message</label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Écrivez votre message..."
                rows={5}
                className="input-field w-full"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setComposeOpen(false)} className="btn-secondary">
                Annuler
              </button>
              <button onClick={() => void handleCompose()} disabled={sending} className="btn-primary flex items-center gap-2">
                <Send className="w-4 h-4" />
                {sending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirmer la suppression"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            Supprimer définitivement ce message ? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="px-5 py-2.5 rounded-xl bg-danger text-white font-medium hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {deleting ? 'Suppression…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}
