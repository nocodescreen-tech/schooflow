import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, CreditCard, Banknote, Filter, Download, Send, Landmark, Printer, Ban, ArrowLeftRight } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useCan } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface PaymentStudent {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface PaymentFee {
  id: string;
  type: string;
  amount: number | string;
}

interface Payment {
  id: string;
  studentId: string;
  feeId?: string | null;
  amount: number | string;
  method: 'cash' | 'bank' | 'transfer' | 'other';
  date: string;
  reference: string;
  notes?: string;
  status?: string;
  student?: PaymentStudent | null;
  fee?: PaymentFee | null;
}

interface ReceiptData {
  payment?: Payment | null;
  student?: PaymentStudent | null;
  fee?: PaymentFee | null;
  school?: {
    name?: string;
    logo?: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null;
  verifyUrl?: string | null;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface FeeOption {
  id: string;
  studentId: string;
  type: string;
  totalAmount: number | string;
  paidAmount: number | string;
  status: string;
}

const num = (v: number | string | undefined | null): number => Number(v) || 0;

const getApiError = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const fetchPayments = async (): Promise<Payment[]> => {
  const res = await api.get('/payments');
  return (res.data?.data?.items ?? []) as Payment[];
};

const fetchStudents = async (): Promise<StudentOption[]> => {
  const res = await api.get('/students', { params: { limit: 500 } });
  return (res.data?.data?.items ?? []) as StudentOption[];
};

const fetchFees = async (): Promise<FeeOption[]> => {
  const res = await api.get('/fees');
  return (res.data?.data?.items ?? []) as FeeOption[];
};

const methodLabels: Record<Payment['method'], string> = {
  cash: 'Espèces',
  bank: 'Banque',
  transfer: 'Virement',
  other: 'Autre',
};

const methodIcons: Record<Payment['method'], typeof CreditCard> = {
  cash: Banknote,
  bank: Landmark,
  transfer: ArrowLeftRight,
  other: CreditCard,
};

const studentName = (p: Payment): string =>
  p.student ? `${p.student.firstName} ${p.student.lastName}` : '—';

export default function Payments() {
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [methodFilter, setMethodFilter] = useState('all');
  const [newPayment, setNewPayment] = useState({ studentId: '', feeId: '', amount: '', method: 'cash', reference: '', notes: '' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printPayment, setPrintPayment] = useState<Payment | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<ReceiptData | null>(null);
  const [paymentToCancel, setPaymentToCancel] = useState<Payment | null>(null);
  const canCancelPayments = useCan('payments', 'create');

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: fetchPayments,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: fetchStudents,
  });

  const { data: fees = [] } = useQuery({
    queryKey: ['fees-options'],
    queryFn: fetchFees,
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newPayment) => {
      const res = await api.post('/payments', {
        studentId: data.studentId,
        feeId: data.feeId || undefined,
        amount: Number(data.amount),
        method: data.method,
        reference: data.reference || undefined,
        notes: data.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Paiement enregistré avec succès');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      setShowAddModal(false);
      setNewPayment({ studentId: '', feeId: '', amount: '', method: 'cash', reference: '', notes: '' });
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, "Erreur lors de l'enregistrement du paiement"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/payments/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Paiement annulé');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['fees'] });
      setPaymentToCancel(null);
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, "Impossible d'annuler ce paiement"));
    },
  });

  const filteredPayments = payments.filter((p) => {
    if (methodFilter !== 'all' && p.method !== methodFilter) return false;
    return true;
  });

  const totalCollected = payments.reduce((sum, p) => sum + num(p.amount), 0);

  const studentFees = fees.filter((f) => !newPayment.studentId || f.studentId === newPayment.studentId);

  const handleDownloadReceipt = (payment: Payment) => {
    const lines = [
      `Reçu de paiement — ${payment.reference}`,
      `Élève : ${studentName(payment)}`,
      `Montant : ${formatCurrency(num(payment.amount), settings.currency)}`,
      `Méthode : ${methodLabels[payment.method] ?? payment.method}`,
      `Date : ${formatDate(payment.date)}`,
      payment.fee ? `Frais : ${payment.fee.type}` : '',
      payment.notes ? `Notes : ${payment.notes}` : '',
    ].filter(Boolean);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recu_${payment.reference}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', `Reçu ${payment.reference} téléchargé`);
  };

  const handleSendReceipt = (payment: Payment) => {
    const subject = encodeURIComponent(`Reçu de paiement ${payment.reference}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVoici le reçu de paiement ${payment.reference} :\n` +
      `Élève : ${studentName(payment)}\n` +
      `Montant : ${formatCurrency(num(payment.amount), settings.currency)}\n` +
      `Méthode : ${methodLabels[payment.method] ?? payment.method}\n` +
      `Date : ${formatDate(payment.date)}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleExport = () => {
    exportPaymentRows(filteredPayments, `paiements_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportPaymentRows = (rows: Payment[], filename: string) => {
    const header = 'Date;Élève;Montant;Méthode;Référence\n';
    const body = rows
      .map((p) => `${p.date};${studentName(p)};${num(p.amount)};${methodLabels[p.method] ?? p.method};${p.reference}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Export CSV téléchargé');
  };

  // --- Selection + export CSV only -------------------------------------------
  // No bulk delete: the backend exposes no DELETE /payments/:id endpoint.
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filteredPayments.length > 0 && filteredPayments.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredPayments.forEach((p) => {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      });
      return next;
    });
  };

  const selectedPayments = useMemo(
    () => filteredPayments.filter((p) => selectedIds.has(p.id)),
    [filteredPayments, selectedIds]
  );

  const handleExportSelected = () => {
    exportPaymentRows(selectedPayments, `paiements-selection_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // --- Receipt printing --------------------------------------------------------
  // Enriched via GET /payments/:id/receipt-data when available ({payment,
  // student, fee, school, verifyUrl}); otherwise falls back to the
  // already-loaded row data. No QR library is installed (no qrcode.react /
  // qrcode in package.json), so a verifyUrl — when the backend provides one —
  // is rendered as plain verification-link text rather than a QR code.
  const handlePrintReceipt = async (payment: Payment) => {
    setPrintPayment(payment);
    try {
      const res = await api.get(`/payments/${payment.id}/receipt-data`);
      setReceiptDetail((res.data?.data ?? null) as ReceiptData | null);
    } catch {
      setReceiptDetail(null);
    }
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <PageTransition>
      <div className="space-y-6 no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('payments.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{payments.length} paiements enregistrés</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {t('payments.recordPayment')}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Total encaissé</p>
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
              <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                <Banknote className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Nombre de paiements</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{payments.length}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Toutes les méthodes</option>
              {(Object.keys(methodLabels) as Payment['method'][]).map((m) => (
                <option key={m} value={m}>{methodLabels[m]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Payments Table */}
        <div className="card overflow-hidden">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border dark:border-white/10 bg-primary-500/5">
              <span className="text-sm font-medium text-text dark:text-gray-200">
                {selectedIds.size} sélectionné(s)
              </span>
              <button onClick={handleExportSelected} className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exporter CSV
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost !px-3 !py-1.5 text-sm">
                Effacer
              </button>
            </div>
          )}
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
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      aria-label="Tout sélectionner"
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Méthode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Référence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {filteredPayments.map((payment, index) => {
                  const MethodIcon = methodIcons[payment.method] ?? CreditCard;
                  return (
                    <motion.tr
                      key={payment.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(payment.id)}
                          onChange={() => toggleRow(payment.id)}
                          aria-label="Sélectionner ce paiement"
                          className="w-4 h-4 accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text dark:text-gray-200">{studentName(payment)}</p>
                          <p className="text-xs text-muted dark:text-gray-400">{payment.student?.studentId ?? ''}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(num(payment.amount), settings.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
                          <MethodIcon className="w-4 h-4" />
                          <span>{methodLabels[payment.method] ?? payment.method}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDate(payment.date)}</td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400 font-mono">{payment.reference}</td>
                      <td className="px-4 py-3">
                        <span className={cn('badge', payment.status === 'cancelled' ? 'badge-danger' : 'badge-success')}>
                          {payment.status === 'cancelled' ? 'Annulé' : 'Complété'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <RowActions
                          items={[
                            { label: 'Télécharger le reçu', icon: <Download className="w-4 h-4" />, onClick: () => handleDownloadReceipt(payment) },
                            { label: 'Envoyer par email', icon: <Send className="w-4 h-4" />, onClick: () => handleSendReceipt(payment) },
                            { label: 'Imprimer le reçu', icon: <Printer className="w-4 h-4" />, onClick: () => handlePrintReceipt(payment) },
                            ...(canCancelPayments && payment.status !== 'cancelled'
                              ? [{ label: 'Annuler', icon: <Ban className="w-4 h-4" />, danger: true, onClick: () => setPaymentToCancel(payment) }]
                              : []),
                          ]}
                        />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Record Payment Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title={t('payments.recordPayment')}
        >
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addMutation.mutate(newPayment); }}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={newPayment.studentId}
                onChange={(e) => setNewPayment((p) => ({ ...p, studentId: e.target.value, feeId: '' }))}
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
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Frais concerné (optionnel)</label>
              <select
                value={newPayment.feeId}
                onChange={(e) => setNewPayment((p) => ({ ...p, feeId: e.target.value }))}
                className="input-field"
              >
                <option value="">Aucun (paiement libre)</option>
                {studentFees.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.type} — {formatCurrency(num(f.totalAmount), settings.currency)} ({f.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Montant</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPayment.amount}
                onChange={(e) => setNewPayment((p) => ({ ...p, amount: e.target.value }))}
                className="input-field"
                placeholder="250"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Méthode de paiement</label>
              <select
                value={newPayment.method}
                onChange={(e) => setNewPayment((p) => ({ ...p, method: e.target.value }))}
                className="input-field"
                required
              >
                {(Object.keys(methodLabels) as Payment['method'][]).map((m) => (
                  <option key={m} value={m}>{methodLabels[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Référence (auto-générée si vide)</label>
              <input
                type="text"
                value={newPayment.reference}
                onChange={(e) => setNewPayment((p) => ({ ...p, reference: e.target.value }))}
                className="input-field"
                placeholder="PAY-2026-00001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Notes (optionnel)</label>
              <input
                type="text"
                value={newPayment.notes}
                onChange={(e) => setNewPayment((p) => ({ ...p, notes: e.target.value }))}
                className="input-field"
                placeholder="Notes..."
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Enregistrement...' : 'Enregistrer le paiement'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Cancel Payment Modal */}
        <Modal
          isOpen={!!paymentToCancel}
          onClose={() => setPaymentToCancel(null)}
          title="Annuler le paiement"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment annuler le paiement{' '}
            <strong className="text-text dark:text-gray-200">{paymentToCancel?.reference}</strong>{' '}
            de {paymentToCancel ? formatCurrency(num(paymentToCancel.amount), settings.currency) : ''} ?
            Le solde des frais concernés sera ajusté.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setPaymentToCancel(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              onClick={() => paymentToCancel && cancelMutation.mutate(paymentToCancel.id)}
              disabled={cancelMutation.isPending}
              className="btn-danger disabled:opacity-50"
            >
              {cancelMutation.isPending ? 'Annulation…' : 'Annuler le paiement'}
            </button>
          </div>
        </Modal>
      </div>

      {/* Print-only receipt view (enriched from receipt-data when available) */}
      {printPayment && (() => {
        const rp = receiptDetail?.payment ?? printPayment;
        const rs = receiptDetail?.student ?? printPayment.student;
        const rf = receiptDetail?.fee ?? printPayment.fee;
        const verifyUrl = receiptDetail?.verifyUrl ?? null;
        return (
          <div className="print-only">
            {/* Official school identity (§6, §11, §13) — configured once in
                Settings → School Identity, never hardcoded here. */}
            <div className="receipt-head">
              {receiptDetail?.school?.logo && (
                <img src={receiptDetail.school.logo} alt="" className="receipt-logo" />
              )}
              <div>
                <h1>{receiptDetail?.school?.name ?? 'Reçu de paiement'}</h1>
                {receiptDetail?.school?.code && (
                  <p className="receipt-code">Code établissement : {receiptDetail.school.code}</p>
                )}
                {receiptDetail?.school?.address && <p>{receiptDetail.school.address}</p>}
                <p>
                  {receiptDetail?.school?.phone && `Tél : ${receiptDetail.school.phone}`}
                  {receiptDetail?.school?.phone && receiptDetail?.school?.email && ' · '}
                  {receiptDetail?.school?.email && receiptDetail.school.email}
                </p>
              </div>
            </div>

            <h2 className="receipt-title">Reçu de paiement — {rp.reference}</h2>
            <p>Imprimé le {new Date().toLocaleDateString('fr-FR')}</p>
            <table>
              <tbody>
                <tr><th>Élève</th><td>{rs ? `${rs.firstName} ${rs.lastName}` : studentName(printPayment)}</td></tr>
                <tr><th>Montant</th><td>{formatCurrency(num(rp.amount), settings.currency)}</td></tr>
                <tr><th>Méthode</th><td>{methodLabels[rp.method] ?? rp.method}</td></tr>
                <tr><th>Date</th><td>{formatDate(rp.date)}</td></tr>
                <tr><th>Référence</th><td>{rp.reference}</td></tr>
                {rf && <tr><th>Frais</th><td>{rf.type}</td></tr>}
                {rp.notes && <tr><th>Notes</th><td>{rp.notes}</td></tr>}
                {verifyUrl && <tr><th>Vérification</th><td>{verifyUrl}</td></tr>}
              </tbody>
            </table>

            {/* Signature and stamp areas (§6) */}
            <div className="receipt-sign">
              <div className="receipt-sign-box">
                <p>Le caissier</p>
                <span className="receipt-sign-line" />
              </div>
              <div className="receipt-sign-box">
                <p>Cachet de l’établissement</p>
                <span className="receipt-stamp" />
              </div>
            </div>
          </div>
        );
      })()}
    </PageTransition>
  );
}
