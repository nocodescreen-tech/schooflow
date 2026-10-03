import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FileText, Upload, Download, Trash2, Eye, Search, Filter, Award, File, FileSpreadsheet, FileImage, XCircle, UploadCloud } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import Modal from '../components/Modal';
import PageTransition from '../components/PageTransition';
import RowActions from '../components/RowActions';
import { useToastStore } from '../components/Toast';
import { formatDateShort } from '../lib/utils';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
}

interface DocumentItem {
  id: string;
  name: string;
  type: string;
  fileSize: number;
  mimeType?: string;
  studentId?: string | null;
  notes?: string;
  createdAt: string;
  student?: StudentRef | null;
}

const DOCUMENT_TYPES = ['certificate', 'attestation', 'contract', 'report', 'other'];

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate: 'Certificat',
  attestation: 'Attestation',
  contract: 'Contrat',
  report: 'Bulletin / Rapport',
  other: 'Autre',
};

const fetchDocuments = async (params: { search?: string; type?: string; studentId?: string }): Promise<DocumentItem[]> => {
  const res = await api.get('/documents', { params });
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

function downloadBlob(data: BlobPart, filename: string, mime = 'application/octet-stream') {
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function getDocumentIcon(type: string) {
  switch (type) {
    case 'report': return FileText;
    case 'certificate': return Award;
    case 'contract': return FileSpreadsheet;
    case 'attestation': return FileImage;
    default: return File;
  }
}

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

export default function Documents() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [dragOver, setDragOver] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', type: 'other', studentId: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [certificateStudentId, setCertificateStudentId] = useState('');
  const [certificateType, setCertificateType] = useState('certificate');

  const { data: documents = [], isLoading, isError } = useQuery({
    queryKey: ['documents', searchQuery, typeFilter, studentFilter],
    queryFn: () => fetchDocuments({
      search: searchQuery || undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      studentId: studentFilter !== 'all' ? studentFilter : undefined,
    }),
  });

  const { data: studentOptions = [] } = useQuery({
    queryKey: ['students-options'],
    queryFn: fetchStudentOptions,
  });

  // Server already applies search/type/student filters.
  const filteredDocuments = documents;

  const studentFullName = (s?: StudentRef | null) =>
    s ? `${s.firstName} ${s.lastName}` : '—';

  const uploadMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; studentId: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('name', data.name || data.file.name);
      formData.append('type', data.type);
      if (data.studentId) formData.append('studentId', data.studentId);
      const res = await api.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data?.document;
    },
    onSuccess: () => {
      addToast('success', 'Document téléversé avec succès');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowUploadModal(false);
      setUploadForm({ name: '', type: 'other', studentId: '' });
      setSelectedFile(null);
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors du téléversement'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/documents/${id}`);
      return { id };
    },
    onSuccess: () => {
      addToast('success', 'Document supprimé');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowDeleteModal(false);
      setDeleteTarget(null);
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors de la suppression'));
    },
  });

  const certificateMutation = useMutation({
    mutationFn: async (data: { studentId: string; type: string }) => {
      const res = await api.post('/documents/generate-certificate', data);
      return res.data?.data?.document as DocumentItem;
    },
    onSuccess: async (document) => {
      addToast('success', 'Certificat généré avec succès');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowCertificateModal(false);
      setCertificateStudentId('');
      if (document?.id) {
        try {
          const res = await api.get(`/documents/${document.id}/download`, { responseType: 'blob' });
          downloadBlob(res.data, document.name || 'certificat.pdf', 'application/pdf');
        } catch {
          addToast('error', 'Certificat généré mais téléchargement impossible');
        }
      }
    },
    onError: (err) => {
      addToast('error', getApiError(err, 'Erreur lors de la génération du certificat'));
    },
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadForm((p) => ({ ...p, name: p.name || file.name }));
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadForm((p) => ({ ...p, name: p.name || file.name }));
    }
  }, []);

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      addToast('error', 'Veuillez sélectionner un fichier');
      return;
    }
    uploadMutation.mutate({ ...uploadForm, file: selectedFile });
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
      downloadBlob(res.data, doc.name, doc.mimeType || 'application/octet-stream');
      addToast('success', `Téléchargement de "${doc.name}"`);
    } catch (err) {
      addToast('error', getApiError(err, 'Téléchargement impossible'));
    }
  };

  const handlePreview = (doc: DocumentItem) => {
    setSelectedDocument(doc);
    setShowPreviewModal(true);
  };

  const handleDelete = (doc: DocumentItem) => {
    setDeleteTarget(doc);
    setShowDeleteModal(true);
  };

  const handleGenerateCertificate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateStudentId) {
      addToast('error', 'Veuillez sélectionner un élève');
      return;
    }
    certificateMutation.mutate({ studentId: certificateStudentId, type: certificateType });
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Documents</h1>
            <p className="text-muted dark:text-gray-400 mt-1">{documents.length} documents</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCertificateModal(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Award className="w-4 h-4" />
              Générer un certificat
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Téléverser
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un document..."
              className="input-field pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted dark:text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="all">Tous les types</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{documentTypeLabel(type)}</option>
              ))}
            </select>
          </div>
          <select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">Tous les élèves</option>
            {studentOptions.map((student) => (
              <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
            ))}
          </select>
        </div>

        {/* Documents Table */}
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
              <p className="text-muted dark:text-gray-400">Erreur lors du chargement des documents</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted dark:text-gray-400">Aucun document trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Nom</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Taille</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Élève</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5">
                  {filteredDocuments.map((doc, index) => {
                    const DocIcon = getDocumentIcon(doc.type);
                    return (
                      <motion.tr
                        key={doc.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                              <DocIcon className="w-4 h-4 text-primary-500" />
                            </div>
                            <span className="text-sm font-medium text-text dark:text-gray-200 truncate max-w-[200px]">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge badge-info">{documentTypeLabel(doc.type)}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatFileSize(doc.fileSize)}</td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{studentFullName(doc.student)}</td>
                        <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{formatDateShort(doc.createdAt)}</td>
                        <td className="px-4 py-3">
                          <RowActions
                            items={[
                              { label: 'Aperçu', icon: <Eye className="w-4 h-4" />, onClick: () => handlePreview(doc) },
                              { label: 'Télécharger', icon: <Download className="w-4 h-4" />, onClick: () => handleDownload(doc) },
                              { label: 'Supprimer', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => handleDelete(doc) },
                            ]}
                          />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upload Modal */}
        <Modal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          title="Téléverser un document"
        >
          <form className="space-y-4" onSubmit={handleUploadSubmit}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer',
                dragOver
                  ? 'border-primary-500 bg-primary-500/5'
                  : 'border-border dark:border-white/10 hover:border-primary-500/50'
              )}
            >
              <UploadCloud className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted dark:text-gray-400">
                Glissez-déposez un fichier ici, ou{' '}
                <label className="text-primary-500 cursor-pointer hover:underline">
                  parcourir
                  <input type="file" className="hidden" onChange={handleFileSelect} />
                </label>
              </p>
              <p className="text-xs text-muted dark:text-gray-500 mt-1">PDF, DOC, XLS, JPG, PNG — 10 Mo max</p>
              {selectedFile && (
                <p className="text-xs text-success mt-2">Fichier sélectionné : {selectedFile.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Nom du document</label>
              <input
                type="text"
                value={uploadForm.name}
                onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))}
                className="input-field"
                placeholder="Nom du document"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type</label>
              <select
                value={uploadForm.type}
                onChange={(e) => setUploadForm((p) => ({ ...p, type: e.target.value }))}
                className="input-field"
                required
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{documentTypeLabel(type)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève (optionnel)</label>
              <select
                value={uploadForm.studentId}
                onChange={(e) => setUploadForm((p) => ({ ...p, studentId: e.target.value }))}
                className="input-field"
              >
                <option value="">Aucun</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowUploadModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? 'Téléversement...' : 'Téléverser'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Preview Modal */}
        <Modal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          title="Aperçu du document"
          size="sm"
        >
          {selectedDocument && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-xl">
                {(() => {
                  const DocIcon = getDocumentIcon(selectedDocument.type);
                  return (
                    <div className="w-12 h-12 bg-primary-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                      <DocIcon className="w-6 h-6 text-primary-500" />
                    </div>
                  );
                })()}
                <div>
                  <p className="font-medium text-text dark:text-gray-200">{selectedDocument.name}</p>
                  <p className="text-sm text-muted dark:text-gray-400">{documentTypeLabel(selectedDocument.type)} · {formatFileSize(selectedDocument.fileSize)}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Type</span>
                  <span className="text-text dark:text-gray-200">{documentTypeLabel(selectedDocument.type)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Taille</span>
                  <span className="text-text dark:text-gray-200">{formatFileSize(selectedDocument.fileSize)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Élève</span>
                  <span className="text-text dark:text-gray-200">{studentFullName(selectedDocument.student)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted dark:text-gray-400">Date de téléversement</span>
                  <span className="text-text dark:text-gray-200">{formatDateShort(selectedDocument.createdAt)}</span>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowPreviewModal(false)} className="btn-ghost">
                  Fermer
                </button>
                <button
                  onClick={() => handleDownload(selectedDocument)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </button>
              </div>
            </div>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Supprimer le document"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted dark:text-gray-400">
              Êtes-vous sûr de vouloir supprimer <strong className="text-text dark:text-gray-200">"{deleteTarget?.name}"</strong> ?
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

        {/* Certificate Modal */}
        <Modal
          isOpen={showCertificateModal}
          onClose={() => setShowCertificateModal(false)}
          title="Générer un certificat"
          size="sm"
        >
          <form className="space-y-4" onSubmit={handleGenerateCertificate}>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Élève</label>
              <select
                value={certificateStudentId}
                onChange={(e) => setCertificateStudentId(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Sélectionner un élève</option>
                {studentOptions.map((student) => (
                  <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Type de certificat</label>
              <select
                className="input-field"
                value={certificateType}
                onChange={(e) => setCertificateType(e.target.value)}
              >
                <option value="certificate">Certificat de scolarité</option>
                <option value="attestation">Attestation scolaire</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setShowCertificateModal(false)} className="btn-ghost">
                Annuler
              </button>
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={certificateMutation.isPending}>
                <Award className="w-4 h-4" />
                {certificateMutation.isPending ? 'Génération...' : 'Générer le PDF'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </PageTransition>
  );
}
