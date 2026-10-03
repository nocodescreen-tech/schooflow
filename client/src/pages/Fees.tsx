import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Filter, Check, AlertCircle, Clock, CreditCard, Printer } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useSettingsStore } from '../store/settingsStore';
import { useCan } from '../store/authStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface FeeStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface Fee {
  id: string;
  studentId: string;
  type: 'tuition' | 'registration' | 'exam' | 'transport' | 'canteen' | 'uniform' | 'other';
  amount: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  installments: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'partial' | 'overdue';
  academicYear?: string;
  term?: number;
  notes?: string;
  student?: FeeStudent | null;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

const num = (v: number | string | undefined | null): number => Number(v) || 0;

const typeLabels: Record<Fee['type'], string> = {
  tuition: 'Scolarité',
  registration: 'Inscription',
  exam: 'Examen',
  transport: 'Transport',
  canteen: 'Cantine',
  uniform: 'Uniforme',
  other: 'Autre',
};

const statusLabels: Record<Fee['status'], string> = {
  paid: 'Payé',
  pending: 'En attente',
  partial: 'Partiel',
  overdue: 'En retard',
};

const getApiError = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const studentName = (fee: Fee): string =>
  fee.student ? `${fee.student.firstName} ${fee.student.lastName}` : '—';

const fetchFees = async (): Promise<Fee[]> => {
  const res = await api.get('/fees');
  return (res.data?.data?.items ?? []) as Fee[];
};

const fetchStudents = async (): Promise<StudentOption[]> => {
  const res = await api.get('/students', { params: { limit: 500 } });
  return (res.data?.data?.items ?? []) as StudentOption[];
};

export default function Fees() {
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const canCreateFees = useCan('fees', 'create');
  const canDeleteFees = useCan('fees', 'delete');
  const canUpdateFees = useCan('fees', 'update');
  const [showAddModal, setShowAddModal] = useState(false);
  const [payFee, setPayFee] = useState<Fee | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [newFee, setNewFee] = useState({ studentId: '', type: 'tuition', totalAmount: '', installments: '1', dueDate: '', notes: '' });

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ['fees'],
    queryFn: fetchFees,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: fetchStudents,
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newFee) => {
      const res = await api.post('/fees', {
        studentId: data.studentId,
        type: data.type,
        totalAmount: Number(data.totalAmount),
        installments: Number(data.installments) || 1,
        dueDate: data.dueDate,
        notes: data.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Frais ajouté avec succès');
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      setShowAddModal(false);
      setNewFee({ studentId: '', type: 'tuition', totalAmount: '', installments: '1', dueDate: '', notes: '' });
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, "Erreur lors de l'ajout du frais"));
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/fees/${id}`, { status: 'paid' });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Frais marqué comme payé');
      queryClient.invalidateQueries({ queryKey: ['fees'] });
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, 'Erreur lors de la mise à jour du frais'));
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (fee: Fee) => {
      const remaining = num(fee.totalAmount || fee.amount) - num(fee.paidAmount);
      const res = await api.post('/payments', {
        studentId: fee.studentId,
        feeId: fee.id,
        amount: remaining,
        method: 'cash',
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Paiement enregistré avec succès');
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setPayFee(null);
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, "Erreur lors de l'enregistrement du paiement"));
    },
  });

  const remainingOf = (f: Fee) => num(f.totalAmount || f.amount) - num(f.paidAmount);

  const filteredFees = fees.filter((f) => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    return true;
  });

  const totalCollected = fees.reduce((sum, f) => sum + num(f.paidAmount), 0);
  const totalPending = fees
    .filter((f) => f.status === 'pending' || f.status === 'partial')
    .reduce((sum, f) => sum + remainingOf(f), 0);
  const totalOverdue = fees
    .filter((f) => f.status === 'overdue')
    .reduce((sum, f) => sum + remainingOf(f), 0);

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('fees.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{fees.length} frais enregistrés</p>
          </div>
          <div className="flex items-center gap-3">
            {canCreateFees && (
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('fees.addFee')}
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <Check className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Collecté</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalCollected, settings.currency)}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">En attente</p>
                <p className="text-xl font-bold text-warning">{formatCurrency(totalPending, settings.currency)}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-danger/10 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">En retard</p>
                <p className="text-xl font-bold text-danger">{formatCurrency(totalOverdue, settings.currency)}</p>
              </div>
            </div>
          </motion.div>
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
              <option value="paid">Payé</option>
              <option value="pending">En attente</option>
              <option value="partial">Partiel</option>
              <option value="overdue">En retard</option>
            </select>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Tous les types</option>
            {(Object.keys(typeLabels) as Fee['type'][]).map((type) => (
              <option key={type} value={type}>{typeLabels[type]}</option>
            ))}
          </select>
        </div>

        {/* Fees Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Échéance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {filteredFees.map((fee, index) => (
                  <motion.tr
                    key={fee.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-text dark:text-gray-200">{studentName(fee)}</p>
                        <p className="text-xs text-muted dark:text-gray-400">{fee.student?.studentId ?? ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{typeLabels[fee.type] ?? fee.type}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(num(fee.totalAmount || fee.amount), settings.currency)}</td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDate(fee.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'badge',
                        fee.status === 'paid' ? 'badge-success' :
                        fee.status === 'overdue' ? 'badge-danger' : 'badge-warning'
                      )}>
                        {statusLabels[fee.status] ?? fee.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canUpdateFees && fee.status !== 'paid' && (
                          <button
                            onClick={() => markPaidMutation.mutate(fee.id)}
                            className="p-1.5 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors text-success"
                            title="Marquer payé"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {canCreateFees && fee.status !== 'paid' && (
                          <button
                            onClick={() => setPayFee(fee)}
                            className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors text-purple"
                            title="Enregistrer paiement"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add Fee Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={t('fees.addFee')}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addMutation.mutate(newFee); }}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={newFee.studentId}
                onChange={(e) => setNewFee((p) => ({ ...p, studentId: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Sélectionner un élève</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type de frais</label>
              <select
                value={newFee.type}
                onChange={(e) => setNewFee((p) => ({ ...p, type: e.target.value }))}
                className="input-field"
                required
              >
                {(Object.keys(typeLabels) as Fee['type'][]).map((type) => (
                  <option key={type} value={type}>{typeLabels[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Montant total</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newFee.totalAmount}
                onChange={(e) => setNewFee((p) => ({ ...p, totalAmount: e.target.value }))}
                className="input-field"
                placeholder="250"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nombre de versements</label>
              <input
                type="number"
                min="1"
                step="1"
                value={newFee.installments}
                onChange={(e) => setNewFee((p) => ({ ...p, installments: e.target.value }))}
                className="input-field"
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date d'échéance</label>
              <input
                type="date"
                value={newFee.dueDate}
                onChange={(e) => setNewFee((p) => ({ ...p, dueDate: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Notes (optionnel)</label>
              <input
                type="text"
                value={newFee.notes}
                onChange={(e) => setNewFee((p) => ({ ...p, notes: e.target.value }))}
                className="input-field"
                placeholder="Notes..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Enregistrement...' : 'Ajouter le frais'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Record Payment Confirm Modal */}
        <Modal
          isOpen={payFee !== null}
          onClose={() => setPayFee(null)}
          title="Enregistrer le paiement"
          size="sm"
        >
          {payFee && (
            <div className="space-y-4">
              <p className="text-sm text-muted dark:text-gray-400">
                Enregistrer le paiement du solde restant pour <strong className="text-text dark:text-gray-200">{studentName(payFee)}</strong> ({typeLabels[payFee.type] ?? payFee.type}) ?
              </p>
              <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Total</span>
                  <span className="font-semibold text-text dark:text-gray-200">{formatCurrency(num(payFee.totalAmount || payFee.amount), settings.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Déjà payé</span>
                  <span className="font-semibold text-text dark:text-gray-200">{formatCurrency(num(payFee.paidAmount), settings.currency)}</span>
                </div>
                <hr className="border-border dark:border-white/10" />
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-text dark:text-gray-200">Reste à payer</span>
                  <span className="font-bold text-success">{formatCurrency(remainingOf(payFee), settings.currency)}</span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setPayFee(null)} className="btn-ghost">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => recordPaymentMutation.mutate(payFee)}
                  className="btn-primary"
                  disabled={recordPaymentMutation.isPending}
                >
                  {recordPaymentMutation.isPending ? 'Enregistrement...' : 'Confirmer le paiement'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </PageTransition>
  );
}
