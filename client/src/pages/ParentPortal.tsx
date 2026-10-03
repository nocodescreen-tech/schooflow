import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { User, ClipboardList, CalendarCheck, Receipt, CreditCard, FileText, Download, ArrowRight, MessageSquare, ChevronDown, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate, getGradeColor, getInitials } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface ChildRow {
  id: string;
  firstName: string;
  lastName: string;
  parentId?: string | null;
  parentEmail?: string | null;
  class?: { id: string; name: string } | null;
}

interface GradeRow {
  id: string;
  score: number | string;
  term?: number | string;
  createdAt?: string;
  subject?: { id: string; name: string } | null;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: string;
}

interface FeeRow {
  id: string;
  type: string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueDate: string;
  status: string;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
}

interface ReportCardRow {
  id: string;
  studentId: string;
  term: number;
  academicYear: string;
}

interface ParentChildRow {
  id: string;
  firstName: string;
  lastName: string;
  class?: string | { id: string; name: string } | null;
}

const toChildRow = (c: ParentChildRow): ChildRow => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  class:
    typeof c.class === 'string'
      ? c.class
        ? { id: '', name: c.class }
        : null
      : (c.class ?? null),
});

// Primary source: GET /parents?search=<email> matched by email, then
// GET /parents/:id for the linked children. Returns null when the
// endpoint is unavailable or no parent matches, so callers fall back.
const fetchChildrenFromParents = async (email: string): Promise<ChildRow[] | null> => {
  try {
    const res = await api.get('/parents', { params: { search: email } });
    const items = (res.data?.data?.items ?? []) as { id: string; email?: string | null }[];
    const match = items.find((p) => p.email?.toLowerCase() === email.toLowerCase());
    if (!match) return null;
    const detail = await api.get(`/parents/${match.id}`);
    const kids = (detail.data?.data?.children ?? []) as ParentChildRow[];
    return kids.map(toChildRow);
  } catch {
    return null;
  }
};

// Legacy fallback: filter students by parentId / parentEmail.
const fetchChildrenFallback = async (userId?: string, email?: string | null): Promise<ChildRow[]> => {
  const res = await api.get('/students', { params: { limit: 200 } });
  const items: ChildRow[] = res.data?.data?.items ?? [];
  return items.filter(
    (s) => (userId && s.parentId === userId) || (email && s.parentEmail?.toLowerCase() === email.toLowerCase())
  );
};

const fetchChildren = async (userId?: string, email?: string | null): Promise<ChildRow[]> => {
  if (email) {
    const viaParents = await fetchChildrenFromParents(email);
    if (viaParents) return viaParents;
  }
  return fetchChildrenFallback(userId, email);
};

const fetchGrades = async (studentId: string): Promise<GradeRow[]> => {
  const res = await api.get('/grades', { params: { studentId } });
  return res.data?.data?.items ?? [];
};

const fetchAttendance = async (studentId: string): Promise<AttendanceRow[]> => {
  const res = await api.get('/attendance', { params: { studentId } });
  return res.data?.data?.items ?? [];
};

const fetchFees = async (studentId: string): Promise<FeeRow[]> => {
  const res = await api.get('/fees', { params: { studentId } });
  return res.data?.data?.items ?? [];
};

const fetchReportCards = async (studentId: string): Promise<ReportCardRow[]> => {
  const res = await api.get('/report-cards');
  const items: ReportCardRow[] = res.data?.data?.items ?? [];
  return items.filter((r) => r.studentId === studentId);
};

const fetchNotifications = async (): Promise<NotificationRow[]> => {
  const res = await api.get('/notifications');
  return res.data?.data?.items ?? [];
};

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

export default function ParentPortal() {
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<'overview' | 'grades' | 'attendance' | 'fees' | 'messages'>('overview');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [showChildSelector, setShowChildSelector] = useState(false);

  const tabs = [
    { id: 'overview' as const, label: 'Vue d\'ensemble', icon: User },
    { id: 'grades' as const, label: 'Notes', icon: ClipboardList },
    { id: 'attendance' as const, label: 'Présences', icon: CalendarCheck },
    { id: 'fees' as const, label: 'Frais', icon: Receipt },
    { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
  ];

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['portal-children', user?.id],
    queryFn: () => fetchChildren(user?.id, user?.email),
    enabled: !!user,
  });

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0] ?? null;
  const childName = selectedChild ? `${selectedChild.firstName} ${selectedChild.lastName}` : '';
  const childClass = selectedChild?.class?.name ?? '—';

  const { data: grades = [] } = useQuery({
    queryKey: ['portal-grades', selectedChild?.id],
    queryFn: () => fetchGrades(selectedChild!.id),
    enabled: !!selectedChild,
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ['portal-attendance', selectedChild?.id],
    queryFn: () => fetchAttendance(selectedChild!.id),
    enabled: !!selectedChild,
  });

  const { data: fees = [] } = useQuery({
    queryKey: ['portal-fees', selectedChild?.id],
    queryFn: () => fetchFees(selectedChild!.id),
    enabled: !!selectedChild,
  });

  const { data: reportCards = [] } = useQuery({
    queryKey: ['portal-report-cards', selectedChild?.id],
    queryFn: () => fetchReportCards(selectedChild!.id),
    enabled: !!selectedChild,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['portal-notifications'],
    queryFn: fetchNotifications,
  });

  const feeBalance = (f: FeeRow) => Number(f.totalAmount) - Number(f.paidAmount || 0);
  const totalDue = fees.filter((f) => f.status !== 'paid').reduce((sum, f) => sum + feeBalance(f), 0);

  const handlePayNow = () => {
    navigate('/app/payments');
  };

  const handleSendMessage = () => {
    navigate('/app/messages');
  };

  const handleDownloadReport = async () => {
    const latest = reportCards[0];
    if (!latest) {
      addToast('error', 'Aucun bulletin disponible');
      return;
    }
    try {
      const res = await api.get(`/report-cards/${latest.id}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data, `bulletin_T${latest.term}.pdf`);
      addToast('success', 'Bulletin téléchargé');
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast('error', e.response?.data?.error ?? 'Téléchargement impossible');
    }
  };

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm text-muted dark:text-gray-400">
          <span>Portail Parent</span>
          <ArrowRight className="w-3 h-3" />
          <span className="text-text dark:text-gray-200 font-medium">{childName || '—'}</span>
        </div>

        {childrenLoading && (
          <div className="card p-8 text-center">
            <p className="text-muted dark:text-gray-400">Chargement…</p>
          </div>
        )}

        {!childrenLoading && children.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-muted dark:text-gray-400">Aucun enfant rattaché à votre compte</p>
          </div>
        )}

        {!childrenLoading && selectedChild && (
        <>
        {/* Child Selector */}
        <div className="relative">
          <button
            onClick={() => setShowChildSelector(!showChildSelector)}
            className="card p-4 w-full flex items-center justify-between hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary-500/10 rounded-2xl flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-500">
                  {getInitials(selectedChild.firstName, selectedChild.lastName)}
                </span>
              </div>
              <div className="text-left">
                <h1 className="text-2xl font-bold text-text dark:text-gray-100">{childName}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <span className="badge-info badge">{childClass}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {totalDue > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePayNow(); }}
                  className="btn-primary flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Payer {formatCurrency(totalDue, settings.currency)}
                </button>
              )}
              <ChevronDown className={cn('w-5 h-5 text-muted dark:text-gray-400 transition-transform', showChildSelector && 'rotate-180')} />
            </div>
          </button>
          {showChildSelector && children.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-2 card p-2 z-10 shadow-xl">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => { setSelectedChildId(child.id); setShowChildSelector(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left',
                    selectedChild.id === child.id ? 'bg-primary-50 dark:bg-primary-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                  )}
                >
                  <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-primary-500">
                      {getInitials(child.firstName, child.lastName)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text dark:text-gray-200">{child.firstName} {child.lastName}</p>
                    <p className="text-xs text-muted dark:text-gray-400">{child.class?.name ?? '—'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 text-primary-500 shadow-sm'
                  : 'text-muted dark:text-gray-400 hover:text-text dark:hover:text-gray-200'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Dernières notes</h3>
                {grades.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-4">Aucune note enregistrée</p>
                ) : (
                  <div className="space-y-3">
                    {grades.slice(0, 4).map((grade) => (
                      <div key={grade.id} className="flex items-center justify-between">
                        <span className="text-sm text-text dark:text-gray-200">{grade.subject?.name ?? '—'}</span>
                        <span className={cn('text-sm font-bold', getGradeColor(Number(grade.score)))}>
                          {Number(grade.score)}/20
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setActiveTab('grades')}
                  className="mt-4 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
                >
                  Voir toutes les notes →
                </button>
              </div>
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Présences récentes</h3>
                {attendance.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-4">Aucune présence enregistrée</p>
                ) : (
                  <div className="space-y-3">
                    {attendance.slice(0, 4).map((record) => (
                      <div key={record.id} className="flex items-center justify-between">
                        <span className="text-sm text-text dark:text-gray-200">{formatDate(record.date)}</span>
                        <span className={cn(
                          'badge',
                          record.status === 'present' ? 'badge-success' :
                          record.status === 'absent' ? 'badge-danger' : 'badge-warning'
                        )}>
                          {record.status === 'present' ? 'Présent' : record.status === 'absent' ? 'Absent' : 'Retard'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setActiveTab('attendance')}
                  className="mt-4 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 font-medium"
                >
                  Voir l'historique →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'grades' && (
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Moyennes par matière</h3>
                {grades.length === 0 ? (
                  <p className="text-sm text-muted dark:text-gray-400 text-center py-4">Aucune note enregistrée</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {grades.map((grade) => (
                      <div key={grade.id} className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-center">
                        <p className="text-xs text-muted dark:text-gray-400 mb-1">{grade.subject?.name ?? '—'}</p>
                        <p className={cn('text-2xl font-bold', getGradeColor(Number(grade.score)))}>
                          {Number(grade.score)}/20
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {grades.length > 0 && (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Matière</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Note</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Trimestre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {grades.map((grade) => (
                      <tr key={grade.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{grade.subject?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-sm font-bold', getGradeColor(Number(grade.score)))}>
                            {Number(grade.score)}/20
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge-info badge">T{grade.term ?? '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Résumé du mois</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-success">{attendance.filter((a) => a.status === 'present').length}</p>
                    <p className="text-xs text-muted dark:text-gray-400">Présent</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-danger">{attendance.filter((a) => a.status === 'absent').length}</p>
                    <p className="text-xs text-muted dark:text-gray-400">Absent</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-warning">{attendance.filter((a) => a.status === 'late').length}</p>
                    <p className="text-xs text-muted dark:text-gray-400">Retard</p>
                  </div>
                </div>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {attendance.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-sm text-muted dark:text-gray-400 text-center">Aucune présence enregistrée</td>
                      </tr>
                    )}
                    {attendance.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{formatDate(record.date)}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'badge',
                            record.status === 'present' ? 'badge-success' :
                            record.status === 'absent' ? 'badge-danger' : 'badge-warning'
                          )}>
                            {record.status === 'present' ? 'Présent' : record.status === 'absent' ? 'Absent' : 'Retard'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Échéance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {fees.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-sm text-muted dark:text-gray-400 text-center">Aucun frais enregistré</td>
                      </tr>
                    )}
                    {fees.map((fee) => (
                      <tr key={fee.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{fee.type}</td>
                        <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(feeBalance(fee), settings.currency)}</td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDate(fee.dueDate)}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'badge',
                            fee.status === 'paid' ? 'badge-success' :
                            fee.status === 'pending' ? 'badge-warning' : 'badge-danger'
                          )}>
                            {fee.status === 'paid' ? 'Payé' : fee.status === 'pending' ? 'En attente' : 'En retard'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalDue > 0 && (
                <div className="card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-text dark:text-gray-100">Total à payer</h3>
                      <p className="text-sm text-muted dark:text-gray-400 mt-1">{fees.filter((f) => f.status !== 'paid').length} frais en attente</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-text dark:text-gray-100">{formatCurrency(totalDue, settings.currency)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handlePayNow}
                    className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Payer maintenant
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="space-y-6">
              <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-border dark:border-white/10 flex items-center justify-between">
                  <h3 className="font-semibold text-text dark:text-gray-100">Messages</h3>
                  <button
                    onClick={handleSendMessage}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Nouveau message
                  </button>
                </div>
                <div className="divide-y divide-border dark:divide-white/5">
                  {messages.length === 0 && (
                    <p className="px-6 py-6 text-sm text-muted dark:text-gray-400 text-center">Aucun message</p>
                  )}
                  {messages.map((msg) => (
                    <div key={msg.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={handleSendMessage}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={cn('text-sm font-medium', msg.isRead ? 'text-text dark:text-gray-200' : 'text-text dark:text-gray-100 font-semibold')}>
                            {msg.title}
                          </p>
                          <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{msg.message}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted dark:text-gray-400">{formatDate(msg.createdAt)}</span>
                          {!msg.isRead && <span className="w-2 h-2 bg-primary-500 rounded-full" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Report Card Download */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple/10 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple" />
              </div>
              <div>
                <h3 className="font-semibold text-text dark:text-gray-100">Bulletin scolaire</h3>
                <p className="text-sm text-muted dark:text-gray-400">
                  {reportCards[0] ? `Trimestre ${reportCards[0].term} — ${reportCards[0].academicYear}` : 'Aucun bulletin disponible'}
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadReport}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Télécharger
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </PageTransition>
  );
}
