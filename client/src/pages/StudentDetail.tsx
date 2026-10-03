import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, Mail, Phone, Calendar, MapPin, User, ClipboardList, CalendarCheck, Receipt, Edit } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useSettingsStore } from '../store/settingsStore';
import PageTransition from '../components/PageTransition';
import PhotoUpload from '../components/PhotoUpload';
import Modal from '../components/Modal';
import { useToastStore } from '../components/Toast';
import { formatDate, getInitials, getGradeColor } from '../lib/utils';
import { formatCurrency } from '../lib/currency';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface StudentGrade {
  id: string;
  score: number;
  examName?: string | null;
  examType?: string | null;
  term: number;
  date: string;
  subject?: { id: string; name: string; code?: string | null } | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
}

interface StudentFee {
  id: string;
  type: string;
  amount: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
}

interface StudentPayment {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  date: string;
  fee?: { id: string; type: string } | null;
}

interface StudentDetail {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  status: string;
  enrollmentDate?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  photo?: string | null;
  classId?: string | null;
  class?: { id: string; name: string } | null;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const feeTypeLabels: Record<string, string> = {
  tuition: 'Scolarité',
  registration: 'Inscription',
  exam: 'Examen',
  transport: 'Transport',
  canteen: 'Cantine',
  uniform: 'Uniforme',
  other: 'Autre',
};

const feeStatusLabels: Record<string, { label: string; badge: string }> = {
  paid: { label: 'Payé', badge: 'badge-success' },
  pending: { label: 'En attente', badge: 'badge-warning' },
  partial: { label: 'Partiel', badge: 'badge-warning' },
  overdue: { label: 'En retard', badge: 'badge-danger' },
};

const paymentMethodLabels: Record<string, string> = {
  cash: 'Espèces',
  bank: 'Banque',
  transfer: 'Virement',
  other: 'Autre',
};

const emptyEditForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  parentName: '',
  parentPhone: '',
  parentEmail: '',
};

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const { settings } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'grades' | 'attendance' | 'fees'>('info');
  const [studentPhoto, setStudentPhoto] = useState<string | undefined>(undefined);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ ...emptyEditForm });

  const { data: student, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', id],
    queryFn: async (): Promise<StudentDetail> => {
      const res = await api.get(`/students/${id}`);
      return res.data?.data?.student as StudentDetail;
    },
    enabled: !!id,
  });

  const { data: grades = [], isLoading: gradesLoading } = useQuery({
    queryKey: ['student-grades', id],
    queryFn: async (): Promise<StudentGrade[]> => {
      const res = await api.get('/grades', { params: { studentId: id } });
      return (res.data?.data?.items ?? []) as StudentGrade[];
    },
    enabled: !!id && activeTab === 'grades',
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['student-attendance', id],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const res = await api.get('/attendance', { params: { studentId: id } });
      return (res.data?.data?.items ?? []) as AttendanceRecord[];
    },
    enabled: !!id && activeTab === 'attendance',
  });

  const { data: fees = [], isLoading: feesLoading } = useQuery({
    queryKey: ['student-fees', id],
    queryFn: async (): Promise<StudentFee[]> => {
      const res = await api.get('/fees', { params: { studentId: id } });
      return (res.data?.data?.items ?? []) as StudentFee[];
    },
    enabled: !!id && activeTab === 'fees',
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['student-payments', id],
    queryFn: async (): Promise<StudentPayment[]> => {
      const res = await api.get('/payments', { params: { studentId: id } });
      return (res.data?.data?.items ?? []) as StudentPayment[];
    },
    enabled: !!id && activeTab === 'fees',
  });

  const updateMutation = useMutation({
    mutationFn: async (form: typeof emptyEditForm) => {
      const res = await api.patch(`/students/${id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        parentName: form.parentName || null,
        parentPhone: form.parentPhone || null,
        parentEmail: form.parentEmail || null,
      });
      return res.data?.data?.student;
    },
    onSuccess: () => {
      addToast('success', 'Élève modifié avec succès');
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setShowEditModal(false);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de la modification de l'élève"));
    },
  });

  const openEdit = () => {
    if (!student) return;
    setEditForm({
      firstName: student.firstName ?? '',
      lastName: student.lastName ?? '',
      email: student.email ?? '',
      phone: student.phone ?? '',
      address: student.address ?? '',
      parentName: student.parentName ?? '',
      parentPhone: student.parentPhone ?? '',
      parentEmail: student.parentEmail ?? '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(editForm);
  };

  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setStudentPhoto(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    const formData = new FormData();
    formData.append('photo', file);
    api
      .patch(`/students/${id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(() => {
        addToast('success', 'Photo mise à jour');
        queryClient.invalidateQueries({ queryKey: ['student', id] });
      })
      .catch((err: unknown) => {
        addToast('error', getErrorMessage(err, "Échec de l'envoi de la photo"));
      });
  };

  const handlePhotoRemove = () => {
    setStudentPhoto(undefined);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-muted dark:text-gray-400 mb-4">
          Impossible de charger les informations de l'élève
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={() => navigate('/app/students')} className="btn-ghost">
            Retour aux élèves
          </button>
          <button onClick={() => refetch()} className="btn-secondary">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'info' as const, label: 'Informations', icon: User },
    { id: 'grades' as const, label: 'Notes', icon: ClipboardList },
    { id: 'attendance' as const, label: 'Présences', icon: CalendarCheck },
    { id: 'fees' as const, label: 'Frais', icon: Receipt },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/app/students')}
          className="flex items-center gap-2 text-muted hover:text-text dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux élèves
        </button>

        {/* Student Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <PhotoUpload
              currentPhoto={studentPhoto ?? student.photo ?? undefined}
              onUpload={handlePhotoUpload}
              onRemove={handlePhotoRemove}
              size="lg"
              label="Photo de l'élève"
            />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-text dark:text-gray-100">
                {student.firstName} {student.lastName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="badge-info badge">{student.class?.name ?? '—'}</span>
                <span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                  {student.status === 'active' ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
            <button onClick={openEdit} className="btn-secondary flex items-center gap-2">
              <Edit className="w-4 h-4" />
              Modifier
            </button>
          </div>
        </motion.div>

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
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Informations personnelles</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Email</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.email ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Téléphone</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.phone ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Date de naissance</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.dateOfBirth ? formatDate(student.dateOfBirth) : '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Adresse</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.address ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Date d'inscription</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.enrollmentDate ? formatDate(student.enrollmentDate) : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="card p-6">
                <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Parent / Tuteur</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Nom</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.parentName ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Téléphone</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.parentPhone ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted dark:text-gray-400" />
                    <div>
                      <p className="text-xs text-muted dark:text-gray-400">Email</p>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{student.parentEmail ?? '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'grades' && (
            <div className="card overflow-hidden">
              {gradesLoading ? (
                <div className="p-4 space-y-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="skeleton h-12 rounded-xl" />
                  ))}
                </div>
              ) : grades.length === 0 ? (
                <p className="p-6 text-sm text-muted dark:text-gray-400 text-center">Aucune note pour cet élève</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Matière</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Note</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Trimestre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {grades.map((grade) => {
                      const score = Number(grade.score);
                      return (
                        <tr key={grade.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">
                            {grade.subject?.name ?? grade.examName ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-sm font-bold', getGradeColor(score))}>
                              {score}/20
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{grade.date ? formatDate(grade.date) : '—'}</td>
                          <td className="px-4 py-3">
                            <span className="badge-info badge">T{grade.term}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="card overflow-hidden">
              {attendanceLoading ? (
                <div className="p-4 space-y-3">
                  {Array(4).fill(0).map((_, i) => (
                    <div key={i} className="skeleton h-12 rounded-xl" />
                  ))}
                </div>
              ) : attendance.length === 0 ? (
                <p className="p-6 text-sm text-muted dark:text-gray-400 text-center">Aucun relevé de présence pour cet élève</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-white/5">
                    {attendance.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-text dark:text-gray-200">{formatDate(record.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`badge ${
                            record.status === 'present' ? 'badge-success' :
                            record.status === 'absent' ? 'badge-danger' : 'badge-warning'
                          }`}>
                            {record.status === 'present' ? 'Présent' : record.status === 'absent' ? 'Absent' : record.status === 'late' ? 'Retard' : 'Excusé'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              <div className="card overflow-hidden">
                {feesLoading ? (
                  <div className="p-4 space-y-3">
                    {Array(3).fill(0).map((_, i) => (
                      <div key={i} className="skeleton h-12 rounded-xl" />
                    ))}
                  </div>
                ) : fees.length === 0 ? (
                  <p className="p-6 text-sm text-muted dark:text-gray-400 text-center">Aucun frais pour cet élève</p>
                ) : (
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
                      {fees.map((fee) => {
                        const status = feeStatusLabels[fee.status] ?? { label: fee.status, badge: 'badge-warning' };
                        return (
                          <tr key={fee.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{feeTypeLabels[fee.type] ?? fee.type}</td>
                            <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(Number(fee.totalAmount ?? fee.amount), settings.currency)}</td>
                            <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{fee.dueDate ? formatDate(fee.dueDate) : '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`badge ${status.badge}`}>
                                {status.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="card overflow-hidden">
                <h3 className="font-semibold text-text dark:text-gray-100 px-4 pt-4 pb-2">Paiements reçus</h3>
                {payments.length === 0 ? (
                  <p className="p-6 text-sm text-muted dark:text-gray-400 text-center">Aucun paiement enregistré pour cet élève</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Montant</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Méthode</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Référence</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border dark:divide-white/5">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-text dark:text-gray-200">{formatCurrency(Number(payment.amount), settings.currency)}</td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{paymentMethodLabels[payment.method] ?? payment.method}</td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{payment.reference ?? '—'}</td>
                          <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{payment.date ? formatDate(payment.date) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Edit Student Modal */}
        <Modal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          title="Modifier l'élève"
        >
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Prénom</label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom</label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Téléphone</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Adresse</label>
              <input
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Parent / Tuteur</label>
              <input
                type="text"
                value={editForm.parentName}
                onChange={(e) => setEditForm((p) => ({ ...p, parentName: e.target.value }))}
                className="input-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Tél. parent</label>
                <input
                  type="tel"
                  value={editForm.parentPhone}
                  onChange={(e) => setEditForm((p) => ({ ...p, parentPhone: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Email parent</label>
                <input
                  type="email"
                  value={editForm.parentEmail}
                  onChange={(e) => setEditForm((p) => ({ ...p, parentEmail: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowEditModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </PageTransition>
  );
}
