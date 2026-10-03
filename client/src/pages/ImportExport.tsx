import { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { Upload, Download, FileText, CheckCircle, XCircle, AlertTriangle, ArrowRight, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import PageTransition from '../components/PageTransition';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';
import api from '../lib/api';

type ImportKey = 'students' | 'teachers' | 'grades';
type ExportKey = 'students' | 'teachers' | 'grades' | 'payments';

interface ImportResult {
  row: number;
  status: string;
  message: string;
}

interface ImportResponse {
  preview: boolean;
  total: number;
  successCount: number;
  errorCount: number;
  results: ImportResult[];
}

interface ImportState {
  step: 'upload' | 'preview' | 'importing' | 'done';
  fileName: string;
  csvText: string;
  total: number;
  successCount: number;
  errorCount: number;
  results: ImportResult[];
}

const IMPORT_TYPES: { key: ImportKey; label: string; columns: string[] }[] = [
  { key: 'students', label: 'Élèves', columns: ['firstName', 'lastName', 'dateOfBirth', 'gender', 'classId', 'parentName', 'parentPhone', 'parentEmail'] },
  { key: 'teachers', label: 'Enseignants', columns: ['name', 'email', 'phone', 'password'] },
  { key: 'grades', label: 'Notes', columns: ['studentId', 'subject', 'score', 'term', 'examType', 'examName', 'coefficient', 'academicYear'] },
];

const EXPORT_TYPES: { key: ExportKey; label: string }[] = [
  { key: 'students', label: 'Élèves' },
  { key: 'teachers', label: 'Enseignants' },
  { key: 'grades', label: 'Notes' },
  { key: 'payments', label: 'Paiements' },
];

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

export default function ImportExport() {
  const { t } = useLanguageStore();
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [dragOver, setDragOver] = useState(false);
  const [importType, setImportType] = useState<ImportKey>('students');
  const [importState, setImportState] = useState<ImportState>({
    step: 'upload',
    fileName: '',
    csvText: '',
    total: 0,
    successCount: 0,
    errorCount: 0,
    results: [],
  });
  const [previewing, setPreviewing] = useState(false);
  const [exportType, setExportType] = useState<ExportKey>('students');
  const [exporting, setExporting] = useState(false);

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      if (!text.trim()) {
        addToast('error', 'Le fichier CSV est vide ou incomplet');
        return;
      }
      setPreviewing(true);
      try {
        const res = await api.post<{ success: boolean; data: ImportResponse }>(
          `/import-export/import/${importType}`,
          { csv: text, preview: true }
        );
        const data = res.data?.data;
        setImportState({
          step: 'preview',
          fileName: file.name,
          csvText: text,
          total: data.total,
          successCount: data.successCount,
          errorCount: data.errorCount,
          results: data.results,
        });
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        addToast('error', e.response?.data?.error ?? 'Analyse du fichier impossible');
      } finally {
        setPreviewing(false);
      }
    };
    reader.readAsText(file);
  }, [addToast, importType]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleImport = useCallback(async () => {
    setImportState((prev) => ({ ...prev, step: 'importing' }));
    try {
      const res = await api.post<{ success: boolean; data: ImportResponse }>(
        `/import-export/import/${importType}`,
        { csv: importState.csvText, preview: false }
      );
      const data = res.data?.data;
      setImportState((prev) => ({
        ...prev,
        step: 'done',
        total: data.total,
        successCount: data.successCount,
        errorCount: data.errorCount,
        results: data.results,
      }));
      addToast('success', `${data.successCount} lignes importées avec succès`);
      if (data.errorCount > 0) {
        addToast('error', `${data.errorCount} lignes en erreur`);
      }
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setImportState((prev) => ({ ...prev, step: 'preview' }));
      addToast('error', e.response?.data?.error ?? 'Import impossible');
    }
  }, [importState.csvText, importType, addToast]);

  const handleReset = () => {
    setImportState({ step: 'upload', fileName: '', csvText: '', total: 0, successCount: 0, errorCount: 0, results: [] });
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await api.get(`/import-export/export/${exportType}`, { responseType: 'blob' });
      downloadBlob(res.data, `${exportType}-${new Date().toISOString().split('T')[0]}.csv`);
      addToast('success', `Export ${exportType} téléchargé`);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      addToast('error', e.response?.data?.error ?? 'Export impossible');
    } finally {
      setExporting(false);
    }
  }, [exportType, addToast]);

  const handleTemplateDownload = useCallback(() => {
    const def = IMPORT_TYPES.find((dt) => dt.key === importType);
    if (!def) return;
    const csv = def.columns.join(',') + '\n';
    downloadBlob(csv, `template_${importType}.csv`);
    addToast('success', 'Modèle CSV téléchargé');
  }, [importType, addToast]);

  const validCount = useMemo(
    () => importState.results.filter((r) => r.status === 'preview' || r.status === 'success').length,
    [importState.results]
  );
  const invalidCount = useMemo(
    () => importState.results.filter((r) => r.status === 'error').length,
    [importState.results]
  );
  const activeColumns = IMPORT_TYPES.find((dt) => dt.key === importType)?.columns ?? [];

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text dark:text-gray-100">Import / Export</h1>
          <p className="text-muted dark:text-gray-400 mt-1">Importez et exportez vos données en CSV</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('import')}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
              activeTab === 'import'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-muted hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
            )}
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
              activeTab === 'export'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-muted hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10'
            )}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {activeTab === 'import' && (
          <div className="space-y-6">
            {/* Data type selector */}
            {importState.step === 'upload' && (
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Type de données à importer</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {IMPORT_TYPES.map((dt) => (
                  <button
                    key={dt.key}
                    onClick={() => setImportType(dt.key)}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left',
                      importType === dt.key
                        ? 'border-primary-500 bg-primary-500/5'
                        : 'border-border dark:border-white/10 hover:border-primary-500/50'
                    )}
                  >
                    <FileText className={cn('w-5 h-5', importType === dt.key ? 'text-primary-500' : 'text-muted')} />
                    <div>
                      <p className="text-sm font-medium text-text dark:text-gray-200">{dt.label}</p>
                      <p className="text-xs text-muted dark:text-gray-400">{dt.columns.length} colonnes</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {activeColumns.map((h) => (
                  <span key={h} className="badge badge-info">{h}</span>
                ))}
              </div>
              <button
                onClick={handleTemplateDownload}
                className="btn-secondary text-sm flex items-center gap-2 mt-4"
              >
                <FileText className="w-4 h-4" />
                Télécharger le modèle
              </button>
            </div>
            )}

            {/* Upload Step */}
            {importState.step === 'upload' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-12 text-center transition-all',
                    dragOver
                      ? 'border-primary-500 bg-primary-500/5'
                      : 'border-border dark:border-white/10 hover:border-primary-500/50'
                  )}
                >
                  <FileSpreadsheet className="w-12 h-12 text-muted mx-auto mb-4" />
                  <p className="text-lg font-medium text-text dark:text-gray-200">
                    {previewing ? 'Analyse du fichier en cours…' : 'Glissez-déposez votre fichier CSV ici'}
                  </p>
                  <p className="text-sm text-muted dark:text-gray-400 mt-1">
                    ou{' '}
                    <label className="text-primary-500 cursor-pointer hover:underline">
                      parcourir
                      <input type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
                    </label>
                  </p>
                  <p className="text-xs text-muted dark:text-gray-500 mt-3">Format accepté : CSV (séparateur ,)</p>
                </div>
              </motion.div>
            )}

            {/* Preview Step */}
            {importState.step === 'preview' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-text dark:text-gray-100">{importState.fileName}</h3>
                    <p className="text-sm text-muted dark:text-gray-400">
                      {importState.total} lignes analysées par le serveur
                    </p>
                  </div>
                  <button onClick={handleReset} className="btn-ghost flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Annuler
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="card p-4 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <div>
                      <p className="text-sm text-muted dark:text-gray-400">Lignes valides</p>
                      <p className="text-lg font-bold text-success">{validCount}</p>
                    </div>
                  </div>
                  <div className="card p-4 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-danger" />
                    <div>
                      <p className="text-sm text-muted dark:text-gray-400">Lignes avec erreurs</p>
                      <p className="text-lg font-bold text-danger">{invalidCount}</p>
                    </div>
                  </div>
                </div>

                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-white/5 border-b border-border dark:border-white/10">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Ligne</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Statut</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Message du serveur</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-white/5">
                        {importState.results.map((row) => (
                          <tr key={row.row} className={cn(row.status === 'error' && 'bg-red-50/50 dark:bg-red-500/5')}>
                            <td className="px-4 py-2 text-sm text-muted dark:text-gray-400">{row.row}</td>
                            <td className="px-4 py-2">
                              {row.status === 'error' ? (
                                <span className="badge badge-danger">Erreur</span>
                              ) : (
                                <span className="badge badge-success">Valide</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm text-text dark:text-gray-200">
                              {row.status === 'error' && (
                                <span className="inline-flex items-center gap-1 text-danger">
                                  <AlertTriangle className="w-3 h-3" />
                                </span>
                              )}{' '}
                              {row.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={handleReset} className="btn-ghost">
                    Annuler
                  </button>
                  <button
                    onClick={handleImport}
                    className="btn-primary flex items-center gap-2"
                    disabled={validCount === 0}
                  >
                    <ArrowRight className="w-4 h-4" />
                    Importer {validCount} lignes
                  </button>
                </div>
              </motion.div>
            )}

            {/* Importing Step */}
            {importState.step === 'importing' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-8 text-center"
              >
                <div className="w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-primary-500 animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold text-text dark:text-gray-100">Import en cours...</h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-1">{importState.fileName}</p>
              </motion.div>
            )}

            {/* Done Step */}
            {importState.step === 'done' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card p-8 text-center"
              >
                <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-lg font-semibold text-text dark:text-gray-100">Import terminé</h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-1">
                  {importState.successCount} lignes ont été importées avec succès
                  {importState.errorCount > 0 && ` · ${importState.errorCount} en erreur`}
                </p>
                <button onClick={handleReset} className="btn-primary mt-6">
                  Nouvel import
                </button>
              </motion.div>
            )}
          </div>
        )}

        {activeTab === 'export' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="card p-6">
              <h3 className="font-semibold text-text dark:text-gray-100 mb-4">Données à exporter</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {EXPORT_TYPES.map((dt) => (
                  <button
                    key={dt.key}
                    onClick={() => setExportType(dt.key)}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left',
                      exportType === dt.key
                        ? 'border-primary-500 bg-primary-500/5'
                        : 'border-border dark:border-white/10 hover:border-primary-500/50'
                    )}
                  >
                    <FileText className={cn('w-5 h-5', exportType === dt.key ? 'text-primary-500' : 'text-muted')} />
                    <p className="text-sm font-medium text-text dark:text-gray-200">{dt.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExport}
                className="btn-primary flex items-center gap-2"
                disabled={exporting}
              >
                <Download className="w-4 h-4" />
                {exporting ? 'Export en cours...' : 'Exporter en CSV'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
