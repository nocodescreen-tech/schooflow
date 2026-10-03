import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Plus, Filter, Download, MoreVertical, Mail, Phone, Calendar, Edit, Archive, Eye, Printer, X } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { useCan } from '../store/authStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import RowActions from '../components/RowActions';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { formatDate, getInitials } from '../lib/utils';
import api from '../lib/api';

interface Student {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  classId: string | null;
  class?: { id: string; name: string } | null;
  status: string;
  enrollmentDate: string;
}

interface ClassOption {
  id: string;
  name: string;
}

type ApiError = { response?: { data?: { error?: string } } };
const getErrorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const emptyForm = { firstName: '', lastName: '', email: '', phone: '', classId: '', status: 'active', dateOfBirth: '', createAccount: 'none' as 'none' | 'now' | 'activation_code' };

export default function Students() {
  const { t } = useLanguageStore();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [classFilter, setClassFilter] = useState(() => searchParams.get('classId') ?? 'all');
  const [tableSearch, setTableSearch] = useState(() => searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [newStudent, setNewStudent] = useState({ ...emptyForm });
  const [enrollmentResult, setEnrollmentResult] = useState<{
    kind: 'account' | 'code';
    studentName: string;
    username?: string | null;
    temporaryPassword?: string;
    code?: string;
    expiresAt?: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkArchive, setShowBulkArchive] = useState(false);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const canCreateStudents = useCan('students', 'create');
  const canDeleteStudents = useCan('students', 'delete');

  // Sync search + classId filter to URL query params (debounced, shareable views).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tableSearch) next.set('search', tableSearch);
          else next.delete('search');
          if (classFilter !== 'all') next.set('classId', classFilter);
          else next.delete('classId');
          return next;
        },
        { replace: true }
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tableSearch, classFilter, setSearchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['students', classFilter, statusFilter],
    queryFn: async (): Promise<{ items: Student[]; total: number }> => {
      const res = await api.get('/students', {
        params: {
          ...(classFilter !== 'all' ? { classId: classFilter } : {}),
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          limit: 100,
        },
      });
      const d = res.data?.data;
      const items = (Array.isArray(d) ? d : (d?.items ?? [])) as Student[];
      const total = typeof d?.total === 'number' ? d.total : items.length;
      return { items, total };
    },
  });

  const students = data?.items ?? [];
  const total = data?.total ?? 0;

  const { data: classOptions = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: async (): Promise<ClassOption[]> => {
      const res = await api.get('/classes');
      return (res.data?.data?.items ?? []) as ClassOption[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (form: typeof emptyForm) => {
      const res = await api.post('/students', {
        firstName: form.firstName,
        lastName: form.lastName,
        ...(form.email ? { email: form.email } : {}),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.classId ? { classId: form.classId } : {}),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        ...(form.createAccount !== 'none' ? { createAccount: form.createAccount } : {}),
      });
      return res.data?.data as {
        student: Student;
        account: { userId: string; username: string | null; temporaryPassword: string } | null;
        activationCode: { code: string; expiresAt: string } | null;
      };
    },
    onSuccess: (data) => {
      addToast('success', 'Élève ajouté avec succès');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setShowAddModal(false);
      setNewStudent({ ...emptyForm });
      // Enrollment → account: show the credentials / activation code once.
      if (data?.account?.temporaryPassword) {
        setEnrollmentResult({ kind: 'account', studentName: `${data.student?.firstName ?? ''} ${data.student?.lastName ?? ''}`.trim(), username: data.account.username, temporaryPassword: data.account.temporaryPassword });
      } else if (data?.activationCode?.code) {
        setEnrollmentResult({ kind: 'code', studentName: `${data.student?.firstName ?? ''} ${data.student?.lastName ?? ''}`.trim(), code: data.activationCode.code, expiresAt: data.activationCode.expiresAt });
      }
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de l'ajout de l'élève"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (form: typeof emptyForm) => {
      const res = await api.patch(`/students/${editingStudent!.id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        phone: form.phone || null,
        classId: form.classId || null,
        status: form.status,
      });
      return res.data?.data?.student;
    },
    onSuccess: () => {
      addToast('success', 'Élève modifié avec succès');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setShowAddModal(false);
      setEditingStudent(null);
      setNewStudent({ ...emptyForm });
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de la modification de l'élève"));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/students/${id}`);
      return { id };
    },
    onSuccess: () => {
      addToast('success', 'Élève archivé');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setDeletingStudent(null);
    },
    onError: (err: unknown) => {
      addToast('error', getErrorMessage(err, "Erreur lors de l'archivage de l'élève"));
    },
  });

  const openAdd = () => {
    setEditingStudent(null);
    setNewStudent({ ...emptyForm });
    setShowAddModal(true);
  };

  const openEdit = (s: Student) => {
    setEditingStudent(s);
    setNewStudent({
      ...emptyForm,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ?? '',
      phone: s.phone ?? '',
      classId: s.classId ?? '',
      status: s.status ?? 'active',
    });
    setShowAddModal(true);
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/import-export/export/students', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `eleves-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast('success', 'Export CSV téléchargé');
    } catch (err) {
      addToast('error', getErrorMessage(err, "Erreur lors de l'export"));
    }
  };

  // --- Bulk selection -------------------------------------------------------
  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.has(s.id)),
    [students, selectedIds]
  );

  const handleExportSelected = () => {
    const header = 'Prénom;Nom;Email;Téléphone;Classe;Statut';
    const lines = selectedStudents.map((s) =>
      [s.firstName, s.lastName, s.email ?? '', s.phone ?? '', s.class?.name ?? '', s.status].join(';')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eleves-selection-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast('success', 'Export CSV téléchargé');
  };

  const handleBulkArchive = async () => {
    setBulkArchiving(true);
    try {
      for (const s of selectedStudents) {
        await api.delete(`/students/${s.id}`);
      }
      addToast('success', `${selectedStudents.length} élève(s) archivé(s)`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setShowBulkArchive(false);
    } catch (err) {
      addToast('error', getErrorMessage(err, "Erreur lors de l'archivage"));
    } finally {
      setBulkArchiving(false);
    }
  };

  // --- Print (current filtered list) -----------------------------------------
  const printStudents = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.firstName, s.lastName, s.email ?? ''].some((v) => v.toLowerCase().includes(q))
    );
  }, [students, tableSearch]);

  const columns = [
    {
      key: 'name',
      header: 'Élève',
      render: (student: Student) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-500/10 rounded-full flex items-center justify-center">
            <span className="text-xs font-semibold text-primary-500">
              {getInitials(student.firstName, student.lastName)}
            </span>
          </div>
          <div>
            <p className="font-medium text-text dark:text-gray-200">{student.firstName} {student.lastName}</p>
            <p className="text-xs text-muted dark:text-gray-400">{student.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'class', header: 'Classe', render: (s: Student) => <span className="badge-info badge">{s.class?.name ?? '—'}</span> },
    {
      key: 'phone',
      header: 'Téléphone',
      render: (s: Student) => (
        <div className="flex items-center gap-2 text-muted dark:text-gray-400">
          <Phone className="w-3.5 h-3.5" />
          <span className="text-sm">{s.phone ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'enrollmentDate',
      header: 'Inscription',
      render: (s: Student) => (
        <div className="flex items-center gap-2 text-muted dark:text-gray-400">
          <Calendar className="w-3.5 h-3.5" />
          <span className="text-sm">{s.enrollmentDate ? formatDate(s.enrollmentDate) : '—'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (s: Student) => (
        <span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
          {s.status === 'active' ? 'Actif' : 'Inactif'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (s: Student) => (
        <RowActions
          items={[
            { label: 'Voir', icon: <Eye className="w-4 h-4" />, onClick: () => navigate(`/app/students/${s.id}`) },
            { label: 'Modifier', icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(s) },
            ...(canDeleteStudents
              ? [{ label: 'Archiver', icon: <Archive className="w-4 h-4" />, danger: true, onClick: () => setDeletingStudent(s) }]
              : []),
          ]}
        />
      ),
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStudent) {
      updateMutation.mutate(newStudent);
    } else {
      addMutation.mutate(newStudent);
    }
  };

  const isSaving = addMutation.isPending || updateMutation.isPending;

  return (
    <PageTransition>
      <div className="space-y-6 no-print">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">{t('students.title')}</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{total} élèves inscrits</p>
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
              onClick={() => window.print()}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            {canCreateStudents && (
              <button
                onClick={openAdd}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('students.addStudent')}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Toutes les classes</option>
              {classOptions.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>

        {/* Table */}
        <div className="card p-4">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 px-2 py-2 bg-primary-500/5 rounded-xl">
              <span className="text-sm font-medium text-text dark:text-gray-200">
                {selectedIds.size} sélectionné(s)
              </span>
              <button onClick={handleExportSelected} className="btn-secondary !px-3 !py-1.5 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" />
                Exporter CSV
              </button>
              {canDeleteStudents && (
                <button onClick={() => setShowBulkArchive(true)} className="btn-danger !px-3 !py-1.5 text-sm flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Archiver
                </button>
              )}
              <button onClick={() => setSelectedIds(new Set())} className="btn-ghost !px-3 !py-1.5 text-sm flex items-center gap-1">
                <X className="w-4 h-4" />
                Effacer
              </button>
            </div>
          )}
          {isLoading ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <DataTable
              data={students}
              columns={columns}
              searchKeys={['firstName', 'lastName', 'email']}
              searchPlaceholder="Rechercher un élève..."
              searchValue={tableSearch}
              onSearchChange={setTableSearch}
              selectable
              rowId={(s) => s.id}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleSelectAll={toggleSelectAll}
              pageSize={8}
              onRowClick={(student) => navigate(`/app/students/${student.id}`)}
              emptyMessage="Aucun élève trouvé"
            />
          )}
        </div>

        {/* Add/Edit Student Modal */}
        <Modal
          isOpen={showAddModal}
          onClose={() => { setShowAddModal(false); setEditingStudent(null); }}
          title={editingStudent ? 'Modifier l\'élève' : t('students.addStudent')}
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Prénom</label>
                <input
                  type="text"
                  value={newStudent.firstName}
                  onChange={(e) => setNewStudent((p) => ({ ...p, firstName: e.target.value }))}
                  className="input-field"
                  placeholder="Emma"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom</label>
                <input
                  type="text"
                  value={newStudent.lastName}
                  onChange={(e) => setNewStudent((p) => ({ ...p, lastName: e.target.value }))}
                  className="input-field"
                  placeholder="Martin"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={newStudent.email}
                onChange={(e) => setNewStudent((p) => ({ ...p, email: e.target.value }))}
                className="input-field"
                placeholder="emma.martin@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Téléphone</label>
              <input
                type="tel"
                value={newStudent.phone}
                onChange={(e) => setNewStudent((p) => ({ ...p, phone: e.target.value }))}
                className="input-field"
                placeholder="+33 6 12 34 56 78"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Classe</label>
              <select
                value={newStudent.classId}
                onChange={(e) => setNewStudent((p) => ({ ...p, classId: e.target.value }))}
                className="input-field"
              >
                <option value="">Sélectionner une classe</option>
                {classOptions.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            {editingStudent && (
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Statut</label>
                <select
                  value={newStudent.status}
                  onChange={(e) => setNewStudent((p) => ({ ...p, status: e.target.value }))}
                  className="input-field"
                >
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>
            )}
            {!editingStudent && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Date de naissance</label>
                  <input
                    type="date"
                    value={newStudent.dateOfBirth}
                    onChange={(e) => setNewStudent((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 space-y-2">
                  <label className="block text-sm font-medium text-text dark:text-gray-300">
                    Créer le compte élève SchoolFlow ?
                  </label>
                  <select
                    value={newStudent.createAccount}
                    onChange={(e) => setNewStudent((p) => ({ ...p, createAccount: e.target.value as 'none' | 'now' | 'activation_code' }))}
                    className="input-field"
                  >
                    <option value="none">Plus tard</option>
                    <option value="now">Maintenant (identifiant + mot de passe temporaire)</option>
                    <option value="activation_code">Code d’activation (l’élève active lui-même)</option>
                  </select>
                  {newStudent.createAccount !== 'none' && !newStudent.email && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Un email sera nécessaire pour créer le compte.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingStudent(null); }} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Enregistrement...' : editingStudent ? 'Enregistrer' : 'Ajouter l\'élève'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Enrollment → account result (credentials or activation code, shown once) */}
        <Modal
          isOpen={!!enrollmentResult}
          onClose={() => setEnrollmentResult(null)}
          title={enrollmentResult?.kind === 'account' ? 'Compte élève créé' : 'Code d’activation généré'}
        >
          {enrollmentResult && (
            <div className="space-y-4">
              {enrollmentResult.kind === 'account' ? (
                <>
                  <p className="text-sm text-muted dark:text-gray-400">
                    Transmettez ces informations à <span className="font-medium text-text dark:text-gray-200">{enrollmentResult.studentName}</span>.
                    Le mot de passe devra être changé à la première connexion et ne sera plus jamais affiché.
                  </p>
                  {enrollmentResult.username && (
                    <div>
                      <p className="text-xs text-muted mb-1">Identifiant</p>
                      <code className="block p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-sm text-text break-all">
                        {enrollmentResult.username}
                      </code>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted mb-1">Mot de passe temporaire</p>
                    <code className="block p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-sm text-text break-all">
                      {enrollmentResult.temporaryPassword}
                    </code>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted dark:text-gray-400">
                    Transmettez ce code à <span className="font-medium text-text dark:text-gray-200">{enrollmentResult.studentName}</span> :
                    il pourra créer son compte depuis la page « Activer mon compte » avec son matricule et sa date de naissance.
                  </p>
                  <code className="block p-3 rounded-lg bg-gray-100 dark:bg-white/5 font-mono text-lg tracking-widest text-text text-center break-all">
                    {enrollmentResult.code}
                  </code>
                  {enrollmentResult.expiresAt && (
                    <p className="text-xs text-muted text-center">
                      Expire le {new Date(enrollmentResult.expiresAt).toLocaleString('fr-FR')}
                    </p>
                  )}
                </>
              )}
              <button className="btn-primary w-full" onClick={() => setEnrollmentResult(null)}>
                J’ai noté ces informations
              </button>
            </div>
          )}
        </Modal>

        {/* Archive confirmation Modal */}
        <Modal
          isOpen={!!deletingStudent}
          onClose={() => setDeletingStudent(null)}
          title="Archiver l'élève"
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment archiver {deletingStudent?.firstName} {deletingStudent?.lastName} ? L'élève passera au statut inactif.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setDeletingStudent(null)} className="btn-ghost">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => deletingStudent && archiveMutation.mutate(deletingStudent.id)}
              className="btn-danger"
              disabled={archiveMutation.isPending}
            >
              {archiveMutation.isPending ? 'Archivage...' : 'Archiver'}
            </button>
          </div>
        </Modal>

        {/* Bulk archive confirmation Modal */}
        <Modal
          isOpen={showBulkArchive}
          onClose={() => setShowBulkArchive(false)}
          title={`Archiver ${selectedIds.size} élève(s)`}
        >
          <p className="text-sm text-muted dark:text-gray-400">
            Voulez-vous vraiment archiver les {selectedIds.size} élève(s) sélectionné(s) ? Ils passeront au statut inactif.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setShowBulkArchive(false)} className="btn-ghost">
              Annuler
            </button>
            <button
              type="button"
              onClick={handleBulkArchive}
              className="btn-danger"
              disabled={bulkArchiving}
            >
              {bulkArchiving ? 'Archivage...' : 'Tout archiver'}
            </button>
          </div>
        </Modal>
      </div>

      {/* Print-only view: current filtered list */}
      <div className="print-only">
        <h1>Liste des élèves</h1>
        <p>{printStudents.length} élève(s) — imprimé le {new Date().toLocaleDateString('fr-FR')}</p>
        <table>
          <thead>
            <tr>
              <th>Prénom</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Téléphone</th>
              <th>Classe</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {printStudents.map((s) => (
              <tr key={s.id}>
                <td>{s.firstName}</td>
                <td>{s.lastName}</td>
                <td>{s.email ?? '—'}</td>
                <td>{s.phone ?? '—'}</td>
                <td>{s.class?.name ?? '—'}</td>
                <td>{s.status === 'active' ? 'Actif' : 'Inactif'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageTransition>
  );
}
