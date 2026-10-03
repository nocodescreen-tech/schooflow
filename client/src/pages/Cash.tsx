import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, TrendingUp, TrendingDown, Wallet, CalendarDays, Filter, XCircle, Lock, Download, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useSettingsStore } from '../store/settingsStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDateShort } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number | string;
  description: string;
  reference: string;
  date: string;
  notes?: string;
  closedAt?: string | null;
}

interface CashSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  todayTransactions: Transaction[];
}

interface DailyReport {
  date: string;
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
}

const num = (v: number | string | undefined | null): number => Number(v) || 0;

const getApiError = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const INCOME_CATEGORIES = ['Scolarité', 'Cantine', 'Transport', 'Sortie pédagogique', 'Don', 'Autre'];
const EXPENSE_CATEGORIES = ['Fournitures', 'Salaire', 'Maintenance', 'Facture', 'Transport', 'Autre'];

const fetchTransactions = async (): Promise<Transaction[]> => {
  const res = await api.get('/cash');
  return (res.data?.data?.items ?? []) as Transaction[];
};

const fetchSummary = async (): Promise<CashSummary> => {
  const res = await api.get('/cash/summary');
  return res.data?.data as CashSummary;
};

const fetchDaily = async (date: string): Promise<DailyReport> => {
  const res = await api.get('/cash/daily', { params: { date } });
  return res.data?.data as DailyReport;
};

export default function Cash() {
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTransaction, setNewTransaction] = useState({
    type: 'income' as 'income' | 'expense',
    category: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const { data: transactions = [], isLoading, isError } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
  });

  const { data: summary } = useQuery({
    queryKey: ['cash-summary'],
    queryFn: fetchSummary,
  });

  const { data: daily } = useQuery({
    queryKey: ['cash-daily', reportDate],
    queryFn: () => fetchDaily(reportDate),
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof newTransaction) => {
      const res = await api.post('/cash', {
        type: data.type,
        category: data.category,
        amount: Number(data.amount),
        description: data.description,
        date: data.date,
      });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Transaction enregistrée avec succès');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily'] });
      setShowAddModal(false);
      setNewTransaction({ type: 'income', category: '', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, "Erreur lors de l'enregistrement"));
    },
  });

  const closeCashMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/cash/close', { date: reportDate });
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Caisse clôturée avec succès');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily'] });
      setShowCloseModal(false);
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, 'Erreur lors de la clôture'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/cash/${id}`);
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Transaction supprimée avec succès');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-daily'] });
      setDeleteTx(null);
    },
    onError: (err: unknown) => {
      addToast('error', getApiError(err, 'Erreur lors de la suppression'));
    },
  });

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.category !== categoryFilter) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, dateFrom, dateTo]);

  const totalIncome = num(summary?.totalIncome);
  const totalExpense = num(summary?.totalExpense);
  const balance = summary ? num(summary.balance) : totalIncome - totalExpense;

  const todayTransactions = useMemo(
    () => summary?.todayTransactions ?? [],
    [summary]
  );
  const todayIncome = todayTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + num(tx.amount), 0);
  const todayExpense = todayTransactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + num(tx.amount), 0);

  const reportTransactions = useMemo(() => daily?.transactions ?? [], [daily]);
  const reportIncome = num(daily?.totalIncome);
  const reportExpense = num(daily?.totalExpense);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach((tx) => cats.add(tx.category));
    return [...cats];
  }, [transactions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate(newTransaction);
  };

  const handleExport = () => {
    const header = 'Date;Type;Catégorie;Montant;Description;Référence\n';
    const rows = filteredTransactions
      .map((tx) => `${tx.date};${tx.type === 'income' ? 'Revenu' : 'Dépense'};${tx.category};${num(tx.amount)};${tx.description};${tx.reference}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `caisse_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Export CSV téléchargé');
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Gestion de caisse</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{transactions.length} transactions enregistrées</p>
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
              onClick={() => setShowCloseModal(true)}
              className="btn-secondary flex items-center gap-2 text-warning"
            >
              <Lock className="w-4 h-4" />
              Clôturer la caisse
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nouvelle transaction
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Revenus totaux</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalIncome, settings.currency)}</p>
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
              <div className="w-10 h-10 bg-danger/10 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-danger" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Dépenses totales</p>
                <p className="text-xl font-bold text-danger">{formatCurrency(totalExpense, settings.currency)}</p>
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
              <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Solde</p>
                <p className={cn('text-xl font-bold', balance >= 0 ? 'text-success' : 'text-danger')}>{formatCurrency(balance, settings.currency)}</p>
              </div>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm text-muted dark:text-gray-400">Transactions du jour</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{todayTransactions.length}</p>
                <p className="text-xs text-muted dark:text-gray-400 mt-0.5">
                  +{formatCurrency(todayIncome, settings.currency)} / -{formatCurrency(todayExpense, settings.currency)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Daily Report */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text dark:text-gray-100">Rapport journalier</h2>
              <p className="text-sm text-muted dark:text-gray-400">Sélectionnez une date pour voir le rapport</p>
            </div>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="input-field w-auto"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-success/5 dark:bg-success/10 rounded-xl">
              <p className="text-sm text-muted dark:text-gray-400">Revenus du jour</p>
              <p className="text-lg font-bold text-success">{formatCurrency(reportIncome, settings.currency)}</p>
            </div>
            <div className="p-4 bg-danger/5 dark:bg-danger/10 rounded-xl">
              <p className="text-sm text-muted dark:text-gray-400">Dépenses du jour</p>
              <p className="text-lg font-bold text-danger">{formatCurrency(reportExpense, settings.currency)}</p>
            </div>
            <div className="p-4 bg-primary-500/5 dark:bg-primary-500/10 rounded-xl">
              <p className="text-sm text-muted dark:text-gray-400">Solde du jour</p>
              <p className={cn('text-lg font-bold', reportIncome - reportExpense >= 0 ? 'text-success' : 'text-danger')}>
                {formatCurrency(reportIncome - reportExpense, settings.currency)}
              </p>
            </div>
          </div>
          {reportTransactions.length > 0 && (
            <div className="mt-4 space-y-2">
              {reportTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    {tx.type === 'income' ? (
                      <ArrowUpRight className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-danger" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{tx.description}</p>
                      <p className="text-xs text-muted dark:text-gray-400">{tx.category} · {tx.reference}</p>
                    </div>
                  </div>
                  <span className={cn('text-sm font-semibold', tx.type === 'income' ? 'text-success' : 'text-danger')}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(num(tx.amount), settings.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Tous les types</option>
              <option value="income">Revenus</option>
              <option value="expense">Dépenses</option>
            </select>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Toutes les catégories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="input-field w-auto"
            placeholder="Du"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="input-field w-auto"
            placeholder="Au"
          />
        </div>

        {/* Transactions Table */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <XCircle className="w-12 h-12 text-danger mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Erreur lors du chargement des transactions</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center">
              <Wallet className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Aucune transaction trouvée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Catégorie</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Référence</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {filteredTransactions.map((tx, index) => (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDateShort(tx.date)}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'badge',
                          tx.type === 'income' ? 'badge-success' : 'badge-danger'
                        )}>
                          {tx.type === 'income' ? 'Revenu' : 'Dépense'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{tx.category}</td>
                      <td className={cn('px-4 py-3 text-sm font-semibold', tx.type === 'income' ? 'text-success' : 'text-danger')}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(num(tx.amount), settings.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{tx.description}</td>
                      <td className="px-4 py-3 text-sm text-muted dark:text-gray-400 font-mono">{tx.reference}</td>
                      <td className="px-4 py-3">
                        {!tx.closedAt && (
                          <button
                            onClick={() => setDeleteTx(tx)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors text-danger"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Transaction Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Nouvelle transaction"
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewTransaction((p) => ({ ...p, type: 'income', category: '' }))}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all',
                    newTransaction.type === 'income'
                      ? 'border-success bg-success/5 text-success'
                      : 'border-border text-muted hover:border-success/50'
                  )}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Revenu
                </button>
                <button
                  type="button"
                  onClick={() => setNewTransaction((p) => ({ ...p, type: 'expense', category: '' }))}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all',
                    newTransaction.type === 'expense'
                      ? 'border-danger bg-danger/5 text-danger'
                      : 'border-border text-muted hover:border-danger/50'
                  )}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  Dépense
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Catégorie</label>
              <select
                value={newTransaction.category}
                onChange={(e) => setNewTransaction((p) => ({ ...p, category: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Sélectionner une catégorie</option>
                {(newTransaction.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Montant</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newTransaction.amount}
                onChange={(e) => setNewTransaction((p) => ({ ...p, amount: e.target.value }))}
                className="input-field"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Description</label>
              <input
                type="text"
                value={newTransaction.description}
                onChange={(e) => setNewTransaction((p) => ({ ...p, description: e.target.value }))}
                className="input-field"
                placeholder="Description de la transaction"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date</label>
              <input
                type="date"
                value={newTransaction.date}
                onChange={(e) => setNewTransaction((p) => ({ ...p, date: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Close Cash Modal */}
        <Modal
          isOpen={showCloseModal}
          onClose={() => setShowCloseModal(false)}
          title="Clôturer la caisse"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              Vous êtes sur le point de clôturer la caisse pour la date du <strong className="text-text dark:text-gray-200">{formatDateShort(reportDate)}</strong>.
            </p>
            <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted dark:text-gray-400">Revenus du jour</span>
                <span className="font-semibold text-success">{formatCurrency(reportIncome, settings.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted dark:text-gray-400">Dépenses du jour</span>
                <span className="font-semibold text-danger">{formatCurrency(reportExpense, settings.currency)}</span>
              </div>
              <hr className="border-border dark:border-white/10" />
              <div className="flex justify-between text-sm">
                <span className="font-medium text-text dark:text-gray-200">Solde du jour</span>
                <span className={cn('font-bold', reportIncome - reportExpense >= 0 ? 'text-success' : 'text-danger')}>
                  {formatCurrency(reportIncome - reportExpense, settings.currency)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted dark:text-gray-400">
              Cette action est irréversible. Les transactions du jour ne pourront plus être modifiées.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowCloseModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => closeCashMutation.mutate()}
                className="btn-primary"
                disabled={closeCashMutation.isPending}
              >
                {closeCashMutation.isPending ? 'Clôture...' : 'Confirmer la clôture'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Delete Transaction Confirm Modal */}
        <Modal
          isOpen={deleteTx !== null}
          onClose={() => setDeleteTx(null)}
          title="Supprimer la transaction"
          size="sm"
        >
          {deleteTx && (
            <div className="space-y-4">
              <p className="text-sm text-muted dark:text-gray-400">
                Supprimer définitivement la transaction <strong className="text-text dark:text-gray-200">{deleteTx.reference || deleteTx.description}</strong> de {formatCurrency(num(deleteTx.amount), settings.currency)} ? Cette action est irréversible.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setDeleteTx(null)} className="btn-ghost">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(deleteTx.id)}
                  className="btn-danger"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </PageTransition>
  );
}
