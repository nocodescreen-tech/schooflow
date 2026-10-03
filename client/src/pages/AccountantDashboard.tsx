import { motion } from 'motion/react';
import {
  CreditCard,
  Clock,
  AlertCircle,
  TrendingUp,
  Receipt,
  Download,
  BarChart3,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSettingsStore } from '../store/settingsStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import api from '../lib/api';

interface RevenuePoint {
  month: string;
  revenue: number | string;
}

interface OverdueFee {
  id: string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueDate: string;
  student?: { id: string; firstName: string; lastName: string } | null;
}

interface PaymentRow {
  id: string;
  amount: number | string;
  method: string;
  date: string;
  reference: string;
  student?: { id: string; firstName: string; lastName: string } | null;
}

interface DashboardPayload {
  kpis: {
    totalCollected: number | string;
    totalOutstanding: number | string;
    collectionRate: number;
  };
  charts: {
    revenueByMonth: RevenuePoint[];
  };
}

const fetchDashboard = async (): Promise<DashboardPayload> => {
  const res = await api.get('/dashboard');
  return res.data?.data;
};

const fetchOverdue = async (): Promise<OverdueFee[]> => {
  const res = await api.get('/fees/overdue');
  return res.data?.data?.items ?? [];
};

const fetchPayments = async (): Promise<PaymentRow[]> => {
  const res = await api.get('/payments');
  return res.data?.data?.items ?? [];
};

const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { month: 'short' });
};

export default function AccountantDashboard() {
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();

  const { data: dashboard } = useQuery({
    queryKey: ['accountant-dashboard'],
    queryFn: fetchDashboard,
  });

  const { data: overdueFees = [] } = useQuery({
    queryKey: ['accountant-overdue'],
    queryFn: fetchOverdue,
  });

  const { data: paymentHistory = [] } = useQuery({
    queryKey: ['accountant-payments'],
    queryFn: fetchPayments,
  });

  const feeBalance = (f: OverdueFee) => Number(f.totalAmount) - Number(f.paidAmount || 0);
  const overdueTotal = overdueFees.reduce((sum, f) => sum + feeBalance(f), 0);

  const revenueData = {
    collected: Number(dashboard?.kpis.totalCollected) || 0,
    outstanding: Number(dashboard?.kpis.totalOutstanding) || 0,
    overdue: overdueTotal,
    collectionRate: dashboard?.kpis.collectionRate ?? 0,
  };

  const monthlyRevenue = (dashboard?.charts.revenueByMonth ?? []).map((d) => ({
    month: monthLabel(d.month),
    amount: Number(d.revenue) || 0,
  }));
  const maxRevenue = monthlyRevenue.length > 0 ? Math.max(...monthlyRevenue.map((d) => d.amount), 1) : 1;

  const overdueAccounts = overdueFees.map((f) => ({
    id: f.id,
    student: f.student ? `${f.student.firstName} ${f.student.lastName}` : '—',
    amount: feeBalance(f),
    dueDate: f.dueDate,
    daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(f.dueDate).getTime()) / (1000 * 60 * 60 * 24))),
  }));

  const handleExportReport = async () => {
    try {
      const res = await api.get('/import-export/export/payments', { responseType: 'blob' });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paiements-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast('success', 'Rapport financier exporté');
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast('error', e.response?.data?.error ?? "Erreur lors de l'export");
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Dashboard Comptable</h1>
            <p className="text-muted dark:text-gray-400 mt-1">Gestion financière et suivi des paiements</p>
          </div>
          <button
            onClick={handleExportReport}
            className="btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <p className="text-xs text-muted dark:text-gray-400">Collecté</p>
                <p className="text-xl font-bold text-success">{formatCurrency(revenueData.collected, settings.currency)}</p>
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
                <p className="text-xs text-muted dark:text-gray-400">En attente</p>
                <p className="text-xl font-bold text-warning">{formatCurrency(revenueData.outstanding, settings.currency)}</p>
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
                <p className="text-xs text-muted dark:text-gray-400">En retard</p>
                <p className="text-xl font-bold text-danger">{formatCurrency(revenueData.overdue, settings.currency)}</p>
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
              <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Taux de recouvrement</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">{revenueData.collectionRate}%</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-500" />
              Revenus mensuels
            </h3>
          </div>
          <div className="flex items-end gap-3 h-48">
            {monthlyRevenue.length === 0 && (
              <p className="text-sm text-muted dark:text-gray-400 text-center w-full py-16">Aucun revenu enregistré sur la période</p>
            )}
            {monthlyRevenue.map((item, index) => (
              <div key={`${item.month}-${index}`} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-text dark:text-gray-300">{formatCurrency(item.amount, settings.currency)}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(item.amount / maxRevenue) * 100}%` }}
                  transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                  className="w-full bg-primary-500/20 rounded-t-lg relative group"
                >
                  <div className="absolute inset-0 bg-primary-500 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.div>
                <span className="text-xs text-muted dark:text-gray-400">{item.month}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Overdue Accounts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-danger" />
                Comptes en retard
              </h3>
              <span className="badge-danger badge">{overdueAccounts.length} comptes</span>
            </div>
            <div className="space-y-3">
              {overdueAccounts.length === 0 && (
                <p className="text-sm text-muted dark:text-gray-400 text-center py-6">Aucun compte en retard</p>
              )}
              {overdueAccounts.map((account, index) => (
                <motion.div
                  key={account.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">{account.student}</p>
                    <p className="text-xs text-muted dark:text-gray-400 mt-0.5">
                      {formatCurrency(account.amount, settings.currency)} · Échéance {formatDate(account.dueDate)} · {account.daysOverdue} jours de retard
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/app/fees')}
                    className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
                  >
                    Voir
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Collection Rate */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card p-6"
          >
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-success" />
              Taux de recouvrement
            </h3>
            <div className="flex items-center justify-center py-8">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-gray-100 dark:text-white/10"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    className="text-success"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - revenueData.collectionRate / 100) }}
                    transition={{ delay: 0.6, duration: 1 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-text dark:text-gray-100">{revenueData.collectionRate}%</p>
                    <p className="text-xs text-muted dark:text-gray-400">Recouvré</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-success">{formatCurrency(revenueData.collected, settings.currency)}</p>
                <p className="text-xs text-muted dark:text-gray-400">Collecté</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-warning">{formatCurrency(revenueData.outstanding, settings.currency)}</p>
                <p className="text-xs text-muted dark:text-gray-400">En attente</p>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-danger">{formatCurrency(revenueData.overdue, settings.currency)}</p>
                <p className="text-xs text-muted dark:text-gray-400">En retard</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Payment History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary-500" />
              Historique des paiements
            </h3>
            <button
              onClick={() => navigate('/app/payments')}
              className="text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
            >
              Voir tout
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Méthode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Référence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {paymentHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-sm text-muted dark:text-gray-400 text-center">Aucun paiement enregistré</td>
                  </tr>
                )}
                {paymentHistory.slice(0, 6).map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">
                      {payment.student ? `${payment.student.firstName} ${payment.student.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(Number(payment.amount), settings.currency)}</td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{payment.method}</td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDate(payment.date)}</td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{payment.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Actions rapides</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Frais', icon: Receipt, path: '/app/fees', color: 'bg-warning' },
              { label: 'Paiements', icon: CreditCard, path: '/app/payments', color: 'bg-success' },
              { label: 'Rapports', icon: BarChart3, path: '/app/reports', color: 'bg-primary-500' },
              { label: 'Exporter', icon: Download, path: '/app/reports', color: 'bg-purple' },
            ].map((action, index) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + index * 0.1 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(action.path)}
                className="card card-hover p-4 flex flex-col items-center gap-3 text-center"
              >
                <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-medium text-text dark:text-gray-200">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
