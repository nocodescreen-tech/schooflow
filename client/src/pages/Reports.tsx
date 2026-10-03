import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FileText, Download, BarChart3, TrendingUp, Users, CalendarCheck, CreditCard, GraduationCap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '../store/languageStore';
import { useSettingsStore } from '../store/settingsStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface DashboardKpis {
  totalStudents: number;
  totalTeachers: number;
  attendanceRate: number;
  collected: number | string;
  outstanding: number | string;
  avgGrade: number | string;
}

interface RevenuePoint {
  month: string;
  revenue: number | string;
}

interface DashboardData {
  kpis: DashboardKpis;
  charts: {
    revenueByMonth: RevenuePoint[];
  };
}

const fetchDashboard = async (): Promise<DashboardData | null> => {
  const res = await api.get('/dashboard');
  return res.data?.data ?? null;
};

const EXPORT_REPORTS = [
  { key: 'students', title: 'Export des élèves', type: 'Élèves', icon: Users, color: 'bg-success' },
  { key: 'teachers', title: 'Export des enseignants', type: 'Enseignants', icon: GraduationCap, color: 'bg-primary-500' },
  { key: 'grades', title: 'Export des notes', type: 'Notes', icon: BarChart3, color: 'bg-purple' },
  { key: 'payments', title: 'Export des paiements', type: 'Paiements', icon: CreditCard, color: 'bg-warning' },
] as const;

const typeColors: Record<string, string> = {
  'Élèves': 'badge-success',
  'Enseignants': 'badge-info',
  'Notes': 'badge-purple',
  'Paiements': 'badge-warning',
};

function downloadBlob(data: BlobPart, filename: string, mime = 'text/csv') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function Reports() {
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reports-dashboard'],
    queryFn: fetchDashboard,
  });

  const kpis = data?.kpis;
  const revenueByMonth = data?.charts?.revenueByMonth ?? [];
  const maxRevenue = Math.max(1, ...revenueByMonth.map((r) => Number(r.revenue) || 0));

  const handleDownload = async (key: string, title: string) => {
    setDownloading(key);
    try {
      const res = await api.get(`/import-export/export/${key}`, { responseType: 'blob' });
      downloadBlob(res.data, `${key}-${new Date().toISOString().split('T')[0]}.csv`);
      addToast('success', `${title} téléchargé`);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast('error', e.response?.data?.error ?? 'Téléchargement impossible');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Rapports</h1>
            <p className="text-muted dark:text-gray-400 mt-1">Rapports et statistiques de l'école</p>
          </div>
          <button
            onClick={() => navigate('/app/report-cards')}
            className="btn-primary flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Bulletins scolaires
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Présence</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">
                  {isLoading ? '…' : `${kpis?.attendanceRate ?? 0}%`}
                </p>
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
                <CreditCard className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Recettes</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">
                  {isLoading ? '…' : formatCurrency(Number(kpis?.collected ?? 0), settings.currency)}
                </p>
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
              <div className="w-10 h-10 bg-purple/10 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-purple" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Moyenne</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">
                  {isLoading ? '…' : `${Number(kpis?.avgGrade ?? 0)}/20`}
                </p>
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
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted dark:text-gray-400">Élèves</p>
                <p className="text-xl font-bold text-text dark:text-gray-100">
                  {isLoading ? '…' : (kpis?.totalStudents ?? 0)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Revenue by month (real data) */}
        {revenueByMonth.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="card p-6"
          >
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-success" />
              Recettes des 6 derniers mois
            </h3>
            <div className="flex items-end gap-3 h-32">
              {revenueByMonth.map((point, index) => {
                const value = Number(point.revenue) || 0;
                const height = Math.max(4, Math.round((value / maxRevenue) * 100));
                const label = (() => {
                  const d = new Date(point.month);
                  return isNaN(d.getTime())
                    ? String(point.month)
                    : d.toLocaleDateString('fr-FR', { month: 'short' });
                })();
                return (
                  <div key={`${point.month}-${index}`} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-text dark:text-gray-200">
                      {formatCurrency(value, settings.currency)}
                    </span>
                    <div
                      className="w-full bg-success/80 rounded-t-lg"
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-muted dark:text-gray-400 capitalize">{label}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Reports List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border dark:border-white/10">
            <h3 className="font-semibold text-text dark:text-gray-100">Exports disponibles</h3>
          </div>
          <div className="divide-y divide-border dark:divide-white/5">
            {EXPORT_REPORTS.map((report, index) => (
              <motion.div
                key={report.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + index * 0.05 }}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 ${report.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <report.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">{report.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('badge', typeColors[report.type] || 'badge-info')}>{report.type}</span>
                      <span className="text-xs text-muted dark:text-gray-400">CSV · {formatDate(new Date())}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(report.key, report.title)}
                    disabled={downloading === report.key}
                    className="p-2 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors text-success disabled:opacity-50"
                    title="Télécharger"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}
