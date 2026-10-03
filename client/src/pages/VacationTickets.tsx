import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Filter, Eye, Check, X, Download, Plane, Trash2 } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate, getInitials } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  class?: { id: string; name: string } | null;
}

interface VacationTicketItem {
  id: string;
  studentId: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  reason: string;
  destination: string;
  status: 'draft' | 'approved' | 'rejected' | 'used';
  ticketNumber: string;
  notes?: string;
  createdAt: string;
  student?: StudentRef | null;
}

const fetchVacationTickets = async (params: { status?: string }): Promise<VacationTicketItem[]> => {
  const res = await api.get('/vacation-tickets', { params });
  return res.data?.data?.items ?? [];
};

const fetchStudentOptions = async (): Promise<StudentRef[]> => {
  const res = await api.get('/students', { params: { limit: 200 } });
  return res.data?.data?.items ?? [];
};

function getApiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e.response?.data?.error ?? fallback;
}

function downloadBlob(data: BlobPart, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  used: 'Utilisé',
};

const statusBadge: Record<string, string> = {
  draft: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  used: 'badge-info',
};

export default function VacationTickets() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<VacationTicketItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VacationTicketItem | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [newTicket, setNewTicket] = useState({
    studentId: '',
    startDate: '',
    endDate: '',
    reason: '',
    destination: '',
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['vacation-tickets', statusFilter],
    queryFn: () => fetchVacationTickets({
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
  });

  const { data: studentOptions = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: fetchStudentOptions,
  });

  const ticketStudentName = (t: VacationTicketItem) =>
    t.student ? `${t.student.firstName} ${t.student.lastName}` : t.studentId;
  const ticketClassName = (t: VacationTicketItem) => t.student?.class?.name ?? '—';

  const createMutation = useMutation({
    mutationFn: async (data: typeof newTicket) => {
      const res = await api.post('/vacation-tickets', {
        ...data,
        academicYear: '2025-2026',
      });
      return res.data?.data?.ticket;
    },
    onSuccess: () => {
      addToast('success', 'Demande de congé créée avec succès');
      queryClient.invalidateQueries({ queryKey: ['vacation-tickets'] });
      setShowCreateModal(false);
      setNewTicket({ studentId: '', startDate: '', endDate: '', reason: '', destination: '' });
    },
    onError: (err) => {
      addToast('error', getApiError(err, "Erreur lors de la création de la demande"));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/vacation-tickets/${id}/approve`);
      return res.data?.data?.ticket;
    },
    onSuccess: () => {
      addToast('success', 'Demande approuvée');
      queryClient.invalidateQueries({ queryKey: ['vacation-tickets'] });
    },
    onError: (err) => {
      addToast('error', getApiError(err, "Erreur lors de l'approbation"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/vacation-tickets/${id}/reject`);
      return res.data?.data?.ticket;
    },
    onSuccess: () => {
      addToast('success', 'Demande rejetée');
      queryClient.invalidateQueries({ queryKey: ['vacation-tickets'] });
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors du rejet'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vacation-tickets/${id}`);
      return { id };
    },
    onSuccess: () => {
      addToast('success', 'Demande supprimée');
      queryClient.invalidateQueries({ queryKey: ['vacation-tickets'] });
      setShowDeleteModal(false);
      setDeleteTarget(null);
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors de la suppression'));
    },
  });

  const classes = [...new Set(studentOptions.map((s) => s.class?.name).filter((n): n is string => !!n))];

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (classFilter !== 'all' && ticketClassName(t) !== classFilter) return false;
    return true;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newTicket);
  };

  const handleDownloadPDF = async (ticket: VacationTicketItem) => {
    try {
      const res = await api.get(`/vacation-tickets/${ticket.id}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data, `billet-vacances-${ticket.ticketNumber}.pdf`);
      addToast('success', `PDF de la demande ${ticket.ticketNumber} téléchargé`);
    } catch (err) {
      addToast('error', getApiError(err, 'Téléchargement du PDF impossible'));
    }
  };

  const handleDelete = (ticket: VacationTicketItem) => {
    setDeleteTarget(ticket);
    setShowDeleteModal(true);
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Demandes de congé</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{tickets.length} demandes</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nouvelle demande
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
              <option value="used">Utilisé</option>
            </select>
          </div>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Toutes les classes</option>
            {classes.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        {/* Tickets Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Classe</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Destination</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {filteredTickets.map((ticket, index) => (
                  <motion.tr
                    key={ticket.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-500/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-primary-500">
                            {ticket.student
                              ? getInitials(ticket.student.firstName, ticket.student.lastName)
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-text dark:text-gray-200">{ticketStudentName(ticket)}</span>
                          <p className="text-xs text-muted dark:text-gray-400">{ticket.ticketNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-info badge">{ticketClassName(ticket)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">
                      {formatDate(ticket.startDate)} — {formatDate(ticket.endDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{ticket.destination}</td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', statusBadge[ticket.status])}>
                        {statusLabels[ticket.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedTicket(ticket)}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors text-primary-500"
                          title="Voir"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {ticket.status === 'draft' && (
                          <>
                            <button
                              onClick={() => approveMutation.mutate(ticket.id)}
                              className="p-1.5 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors text-success"
                              title="Approuver"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => rejectMutation.mutate(ticket.id)}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-danger"
                              title="Rejeter"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDownloadPDF(ticket)}
                          className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors text-purple"
                          title="Télécharger PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(ticket)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-danger"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Ticket Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Nouvelle demande de congé"
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={newTicket.studentId}
                onChange={(e) => setNewTicket((p) => ({ ...p, studentId: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Sélectionner un élève</option>
                {studentOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date de début</label>
                <input
                  type="date"
                  value={newTicket.startDate}
                  onChange={(e) => setNewTicket((p) => ({ ...p, startDate: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date de fin</label>
                <input
                  type="date"
                  value={newTicket.endDate}
                  onChange={(e) => setNewTicket((p) => ({ ...p, endDate: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Motif</label>
              <input
                type="text"
                value={newTicket.reason}
                onChange={(e) => setNewTicket((p) => ({ ...p, reason: e.target.value }))}
                className="input-field"
                placeholder="Vacances familiales"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Destination</label>
              <input
                type="text"
                value={newTicket.destination}
                onChange={(e) => setNewTicket((p) => ({ ...p, destination: e.target.value }))}
                className="input-field"
                placeholder="Lyon"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Création...' : 'Créer la demande'}
              </button>
            </div>
          </form>
        </Modal>

        {/* View Ticket Modal */}
        <Modal
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
          title={selectedTicket ? `Demande ${selectedTicket.ticketNumber} — ${ticketStudentName(selectedTicket)}` : ''}
          size="lg"
        >
          {selectedTicket && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Élève</p>
                  <p className="font-medium text-text dark:text-gray-200">{ticketStudentName(selectedTicket)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">N° de billet</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedTicket.ticketNumber}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Classe</p>
                  <p className="font-medium text-text dark:text-gray-200">{ticketClassName(selectedTicket)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Date de début</p>
                  <p className="font-medium text-text dark:text-gray-200">{formatDate(selectedTicket.startDate)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Date de fin</p>
                  <p className="font-medium text-text dark:text-gray-200">{formatDate(selectedTicket.endDate)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Motif</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedTicket.reason}</p>
                </div>
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-muted dark:text-gray-400 mb-1">Destination</p>
                  <p className="font-medium text-text dark:text-gray-200">{selectedTicket.destination}</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Plane className="w-5 h-5 text-primary-500" />
                  <span className="font-medium text-text dark:text-gray-200">Statut</span>
                </div>
                <span className={cn('badge', statusBadge[selectedTicket.status])}>
                  {statusLabels[selectedTicket.status]}
                </span>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => handleDownloadPDF(selectedTicket)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Télécharger PDF
                </button>
                {selectedTicket.status === 'draft' && (
                  <>
                    <button
                      onClick={() => { approveMutation.mutate(selectedTicket.id); setSelectedTicket(null); }}
                      className="btn-primary flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Approuver
                    </button>
                    <button
                      onClick={() => { rejectMutation.mutate(selectedTicket.id); setSelectedTicket(null); }}
                      className="btn-secondary flex items-center gap-2 text-danger"
                    >
                      <X className="w-4 h-4" />
                      Rejeter
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Supprimer la demande"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              Êtes-vous sûr de vouloir supprimer la demande <strong className="text-text dark:text-gray-200">"{deleteTarget?.ticketNumber}"</strong> ?
            </p>
            <p className="text-xs text-muted dark:text-gray-400">Cette action est irréversible.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                className="px-5 py-2.5 rounded-xl bg-danger text-white font-medium hover:bg-red-600 transition-all"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </PageTransition>
  );
}
