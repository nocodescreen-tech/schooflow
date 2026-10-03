import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Settings,
  Shield,
  Target,
  Zap,
  Layers,
  FileText,
  Eye,
  Loader2,
  Copy,
  Search,
  Filter,
  ArrowLeft,
  Globe,
  School,
  Award,
  Users,
  BookOpen,
  ClipboardList,
  ChevronRight,
} from 'lucide-react';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { useSettingsStore } from '../store/settingsStore';

type GradingConfigType = {
  id: string;
  schoolId: string;
  cycleId: string | null;
  niveauId: string | null;
  passingAverage: number;
  mentionThresholds: {
    tres_bien: number;
    bien: number;
    assez_bien: number;
    passable: number;
    insuffisant: number;
  };
  rounding: 'standard' | 'floor' | 'ceil';
  precision: number;
  weighting: 'coefficient' | 'equal';
  missingPolicy: 'zero' | 'ignore' | 'fail';
  minGrades: number;
  repEnabled: boolean;
  repMinAverage: number;
  repMaxAverage: number;
  useCoefficientWeight: boolean;
  normalizeTo20: boolean;
  minValidGrade: number;
  maxValidGrade: number;
  includeAbsentInAverage: boolean;
  customGradeScales: Record<string, { min: number; max: number }> | null;
  cycle?: { id: string; name: string };
  niveau?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type GradingConfigInput = Partial<GradingConfigType> & { schoolId: string };

const MENTION_LABELS = {
  tres_bien: 'Très bien',
  bien: 'Bien',
  assez_bien: 'Assez bien',
  passable: 'Passable',
  insuffisant: 'Insuffisant',
};

const MENTION_COLORS = {
  tres_bien: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  bien: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  assez_bien: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
  passable: 'text-gray-600 bg-gray-50 dark:bg-gray-900/20',
  insuffisant: 'text-red-600 bg-red-50 dark:bg-red-900/20',
};

const WEIGHTING_LABELS = {
  coefficient: 'Par coefficient',
  equal: 'Poids égaux',
};

const WEIGHTING_LABELS_SHORT = {
  coefficient: 'Coef.',
  equal: 'Égal.',
};

const MISSING_POLICY_LABELS = {
  zero: 'Zéro (note manquante = 0)',
  ignore: 'Ignorer (exclure de la moyenne)',
  fail: 'Échouer (erreur si note manquante)',
};

const MISSING_POLICY_SHORT = {
  zero: 'Zéro',
  ignore: 'Ignorer',
  fail: 'Échec',
};

const ROUNDING_LABELS = {
  standard: 'Standard (arrondi mathématique)',
  floor: 'Plancher (arrondi inférieur)',
  ceil: 'Plafond (arrondi supérieur)',
};

const ROUNDING_LABELS_SHORT = {
  standard: 'Standard',
  floor: 'Plancher',
  ceil: 'Plafond',
};

const formatNumber = (n: number, decimals = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function GradingConfigPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();

  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<GradingConfigType | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<GradingConfigType | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState({
    cycleId: '',
    niveauId: '',
    passingAverage: 10,
    mentionThresholds: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
    rounding: 'standard' as 'standard' | 'floor' | 'ceil',
    precision: 2,
    weighting: 'coefficient' as 'coefficient' | 'equal',
    missingPolicy: 'ignore' as 'zero' | 'ignore' | 'fail',
    minGrades: 1,
    repEnabled: false,
    repMinAverage: 8,
    repMaxAverage: 10,
    useCoefficientWeight: true,
    normalizeTo20: true,
    minValidGrade: 0,
    maxValidGrade: 20,
    includeAbsentInAverage: false,
    customGradeScales: null as Record<string, { min: number; max: number }> | null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: cycles } = useQuery({
    queryKey: ['cycles'],
    queryFn: async () => {
      const res = await api.get('/cycles');
      return res.data?.data?.items ?? [];
    },
  });

  const { data: niveaux } = useQuery({
    queryKey: ['niveaux'],
    queryFn: async () => {
      const res = await api.get('/niveaux');
      return res.data?.data?.items ?? [];
    },
  });

  const { data: configs, isLoading, refetch } = useQuery({
    queryKey: ['grading-configs', search],
    queryFn: async () => {
      const res = await api.get('/grading/config/list', {
        params: { search: search || undefined },
      });
      return res.data?.data?.items ?? [];
    },
  });

  const { data: effectiveConfig } = useQuery({
    queryKey: ['grading-effective'],
    queryFn: async () => {
      const res = await api.get('/grading/config');
      return res.data?.data?.effective;
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: GradingConfigInput) => {
      const res = await api.post('/grading/config', data);
      return res.data?.data?.config;
    },
    onSuccess: () => {
      addToast('success', 'Configuration créée');
      queryClient.invalidateQueries({ queryKey: ['grading-configs'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Création impossible'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GradingConfigType> }) => {
      const res = await api.put(`/grading/config/${id}`, data);
      return res.data?.data?.config;
    },
    onSuccess: () => {
      addToast('success', 'Configuration mise à jour');
      queryClient.invalidateQueries({ queryKey: ['grading-configs'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Mise à jour impossible'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/grading/config/${id}`);
    },
    onSuccess: () => {
      addToast('success', 'Configuration supprimée');
      queryClient.invalidateQueries({ queryKey: ['grading-configs'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Suppression impossible'),
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/grading/config/reset');
      return res.data;
    },
    onSuccess: () => {
      addToast('success', 'Configuration réinitialisée aux valeurs par défaut');
      queryClient.invalidateQueries({ queryKey: ['grading-configs'] });
      queryClient.invalidateQueries({ queryKey: ['grading-effective'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Réinitialisation impossible'),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data?.data?.school;
    },
  });

  const initialFormData = {
    cycleId: '',
    niveauId: '',
    passingAverage: 10,
    mentionThresholds: { tres_bien: 16, bien: 14, assez_bien: 12, passable: 10, insuffisant: 0 },
    rounding: 'standard' as 'standard' | 'floor' | 'ceil',
    precision: 2,
    weighting: 'coefficient' as 'coefficient' | 'equal',
    missingPolicy: 'ignore' as 'zero' | 'ignore' | 'fail',
    minGrades: 1,
    repEnabled: false,
    repMinAverage: 8,
    repMaxAverage: 10,
    useCoefficientWeight: true,
    normalizeTo20: true,
    minValidGrade: 0,
    maxValidGrade: 20,
    includeAbsentInAverage: false,
    customGradeScales: null as Record<string, { min: number; max: number }> | null,
  };

  // Handlers
  const handleInputChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.passingAverage || formData.passingAverage < 0 || formData.passingAverage > 20) {
      newErrors.passingAverage = 'Moyenne de passage entre 0 et 20';
    }
    if (formData.minGrades < 1 || formData.minGrades > 50) {
      newErrors.minGrades = 'Minimum 1, maximum 50';
    }
    if (formData.repEnabled && (formData.repMinAverage >= formData.repMaxAverage || formData.repMaxAverage > formData.passingAverage)) {
      newErrors.repMaxAverage = 'Maximum de repêchage doit être < moyenne de passage et > minimum';
    }
    Object.keys(MENTION_LABELS).forEach((key) => {
      const val = formData.mentionThresholds[key as keyof typeof MENTION_LABELS];
      if (val === undefined || val < 0 || val > 20) {
        newErrors[`mentionThresholds.${key}`] = `${MENTION_LABELS[key as keyof typeof MENTION_LABELS]} entre 0 et 20`;
      }
    });
    // Check order
    const thresholds = Object.values(formData.mentionThresholds);
    for (let i = 1; i < thresholds.length; i++) {
      if (thresholds[i] >= thresholds[i - 1]) {
        newErrors.mentionThresholds = 'Les seuils doivent être strictement décroissants';
        break;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (editingConfig) {
        await updateMutation.mutateAsync({ id: editingConfig.id, data: formData });
        setEditingConfig(null);
        setFormData(initialFormData);
      } else {
        await createMutation.mutateAsync({ ...formData, schoolId: settingsData?.id || '' });
        setFormData(initialFormData);
      }
      setShowCreateModal(false);
    } catch (err) {
      // handled by mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setFormData(initialFormData);
    setErrors({});
    setEditingConfig(null);
    setShowCreateModal(true);
  };

  const openEditModal = (config: GradingConfigType) => {
    setFormData({
      cycleId: config.cycleId || '',
      niveauId: config.niveauId || '',
      passingAverage: config.passingAverage,
      mentionThresholds: { ...config.mentionThresholds },
      rounding: config.rounding,
      precision: config.precision,
      weighting: config.weighting,
      missingPolicy: config.missingPolicy,
      minGrades: config.minGrades,
      repEnabled: config.repEnabled,
      repMinAverage: config.repMinAverage,
      repMaxAverage: config.repMaxAverage,
      useCoefficientWeight: config.useCoefficientWeight,
      normalizeTo20: config.normalizeTo20,
      minValidGrade: config.minValidGrade,
      maxValidGrade: config.maxValidGrade,
      includeAbsentInAverage: config.includeAbsentInAverage,
      customGradeScales: config.customGradeScales,
    });
    setEditingConfig(config);
    setShowCreateModal(true);
  };

  const confirmDelete = (config: GradingConfigType) => setDeleteConfirm(config);
  const cancelDelete = () => setDeleteConfirm(null);
  const executeDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  // Helper components
  const MentionInput = ({
    key: mentionKey,
    label,
    value,
    onChange,
    error,
  }: {
    key: string;
    label: string;
    value: number;
    onChange: (v: number) => void;
    error?: string;
  }) => (
    <div className="relative">
      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1">{label}</label>
      <input
        type="number"
        min="0"
        max="20"
        step="0.1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`input-field ${error ? '!border-danger' : ''}`}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );

  const Section = ({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) => (
    <div className="space-y-4">
      <h4 className="font-semibold text-text dark:text-gray-200 flex items-center gap-2">
        <Settings className="w-4 h-4" />
        {title}
      </h4>
      {description && <p className="text-sm text-muted dark:text-gray-400 mb-3">{description}</p>}
      {children}
    </div>
  );

  const Toggle = ({
    label,
    checked,
    onChange,
    description,
  }: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    description?: string;
  }) => (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <span className="text-sm font-medium text-text dark:text-gray-200">{label}</span>
        {description && <span className="text-xs text-muted dark:text-gray-400 block mt-0.5">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-white/20'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );

  const InputField = ({
    label,
    value,
    onChange,
    type = 'text',
    placeholder,
    error,
    min,
    max,
    step,
    disabled,
    className = '',
  }: {
    label: string;
    value: string | number;
    onChange: (v: any) => void;
    type?: string;
    placeholder?: string;
    error?: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    className?: string;
  }) => (
    <div className="relative">
      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={`input-field ${error ? '!border-danger' : ''} ${className}`}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );

  const SelectField = ({
    label,
    value,
    onChange,
    options,
    error,
    disabled,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    error?: string;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input-field ${error ? '!border-danger' : ''}`}
        disabled={disabled}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );

  // Render
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-gray-100">Configuration de notation</h1>
            <p className="text-muted dark:text-gray-400 mt-1">Règles de calcul des moyennes, seuils, repêchage et arrondis</p>
          </div>
          <div className="flex gap-2">
            <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle configuration
            </button>
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" /> Réinitialiser défauts
            </button>
          </div>
        </div>

        {/* Effective config preview */}
        {effectiveConfig && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary-500" />
              <span className="font-semibold text-text dark:text-gray-100">Configuration effective actuelle</span>
              <span className="badge badge-info ml-2">Utilisée par défaut pour tous les calculs</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted dark:text-gray-400">Moyenne de passage</span>
                <span className="block font-medium">{effectiveConfig.passingAverage}/20</span>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Arrondi</span>
                <span className="block font-medium capitalize">{effectiveConfig.rounding}</span>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Pondération</span>
                <span className="block font-medium">{WEIGHTING_LABELS[effectiveConfig.weighting as keyof typeof WEIGHTING_LABELS]}</span>
              </div>
              <div>
                <span className="text-muted dark:text-gray-400">Repêchage</span>
                <span className="block font-medium">{effectiveConfig.repEnabled ? 'Activé' : 'Désactivé'}</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Config list */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text dark:text-gray-100">
              Configurations de notation ({configs?.length ?? 0})
            </h2>
            <input
              type="text"
              placeholder="Rechercher par cycle, niveau..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field !w-auto ml-auto sm:w-64"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
          ) : configs?.length === 0 ? (
            <div className="card p-12 text-center">
              <Target className="w-12 h-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text dark:text-gray-200 mb-2">Aucune configuration</h3>
              <p className="text-muted dark:text-gray-400 mb-4">Créez votre première configuration de notation</p>
              <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Créer la première
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {configs!
                .filter(
                  (c: GradingConfigType) =>
                    c.cycle?.name?.toLowerCase().includes(search.toLowerCase()) ||
                    c.niveau?.name?.toLowerCase().includes(search.toLowerCase())
                )
                .map((config: GradingConfigType) => (
                  <motion.div
                    key={config.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="card overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text dark:text-gray-200 truncate">
                                {config.cycle?.name
                                  ? `${config.cycle.name}`
                                  : config.niveau?.name
                                  ? `${config.niveau.name}`
                                  : 'Global'}
                              </span>
                              {config.cycle && config.niveau && (
                                <span className="badge badge-info text-xs">
                                  {config.cycle.name} / {config.niveau.name}
                                </span>
                              )}
                              {!config.cycle && !config.niveau && (
                                <span className="badge badge-info text-xs">Global</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-400">
                              <span>{WEIGHTING_LABELS_SHORT[config.weighting]}</span>
                              <span>·</span>
                              <span>{MISSING_POLICY_SHORT[config.missingPolicy]}</span>
                              <span>·</span>
                              <span>{ROUNDING_LABELS_SHORT[config.rounding]}</span>
                              <span>· {config.precision} déc.</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400">
                              {config.passingAverage}/20
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                              Précision: {config.precision} déc.
                            </span>
                            {config.repEnabled && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                                Repêchage: {config.repMinAverage}-{config.repMaxAverage}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            onClick={() => openEditModal(config)}
                            className="btn-icon hover:!text-primary-500"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(config)}
                            className="btn-icon hover:!text-danger"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text dark:text-gray-100">
                  {editingConfig ? 'Modifier la configuration' : 'Nouvelle configuration de notation'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData(initialFormData);
                    setEditingConfig(null);
                    setErrors({});
                  }}
                  className="btn-icon hover:!text-muted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <SelectField
                    label="Cycle"
                    value={formData.cycleId}
                    onChange={(v) => handleInputChange('cycleId', v)}
                    options={cycles.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))}
                    error={errors.cycleId}
                  />
                  <SelectField
                    label="Niveau"
                    value={formData.niveauId}
                    onChange={(v) => handleInputChange('niveauId', v)}
                    options={niveaux.map((n: { id: string; name: string }) => ({ value: n.id, label: n.name }))}
                    error={errors.niveauId}
                  />
                </div>

                <Section
                  title="Moyenne de passage"
                  description="Seuil minimum pour être considéré comme reçu (sur 20)"
                >
                  <InputField
                    label="Moyenne de passage (/20)"
                    type="number"
                    value={formData.passingAverage}
                    onChange={(v) => handleInputChange('passingAverage', v)}
                    error={errors.passingAverage}
                    min={0}
                    max={20}
                    step={0.1}
                  />
                </Section>

                <Section
                  title="Seuils de mentions"
                  description="Les seuils doivent être strictement décroissants (Très bien > Bien > Assez bien > Passable > Insuffisant)"
                >
                  <div className="grid sm:grid-cols-2 gap-4">
                    <MentionInput
                      key="tres_bien"
                      label="Très bien ≥"
                      value={formData.mentionThresholds.tres_bien}
                      onChange={(v) => handleInputChange('mentionThresholds.tres_bien', v)}
                      error={errors['mentionThresholds.tres_bien']}
                    />
                    <MentionInput
                      key="bien"
                      label="Bien ≥"
                      value={formData.mentionThresholds.bien}
                      onChange={(v) => handleInputChange('mentionThresholds.bien', v)}
                      error={errors['mentionThresholds.bien']}
                    />
                    <MentionInput
                      key="assez_bien"
                      label="Assez bien ≥"
                      value={formData.mentionThresholds.assez_bien}
                      onChange={(v) => handleInputChange('mentionThresholds.assez_bien', v)}
                      error={errors['mentionThresholds.assez_bien']}
                    />
                    <MentionInput
                      key="passable"
                      label="Passable ≥"
                      value={formData.mentionThresholds.passable}
                      onChange={(v) => handleInputChange('mentionThresholds.passable', v)}
                      error={errors['mentionThresholds.passable']}
                    />
                    <MentionInput
                      key="insuffisant"
                      label="Insuffisant ≥"
                      value={formData.mentionThresholds.insuffisant}
                      onChange={(v) => handleInputChange('mentionThresholds.insuffisant', v)}
                      error={errors['mentionThresholds.insuffisant']}
                    />
                  </div>
                </Section>

                <Section
                  title="Arrondi et précision"
                  description="Mode d'arrondi et nombre de décimales pour l'affichage des moyennes"
                >
                  <div className="grid sm:grid-cols-3 gap-4">
                    <SelectField
                      label="Mode d'arrondi"
                      value={formData.rounding}
                      onChange={(v) => handleInputChange('rounding', v)}
                      options={[
                        { value: 'standard', label: 'Standard (0.5→1)' },
                        { value: 'floor', label: 'Plancher (vers le bas)' },
                        { value: 'ceil', label: 'Plafond (vers le haut)' },
                      ]}
                    />
                    <InputField
                      label="Décimales"
                      type="number"
                      value={formData.precision}
                      onChange={(v) => handleInputChange('precision', v)}
                      min={0}
                      max={4}
                    />
                    <InputField
                      label="Décimales affichage"
                      type="number"
                      value={formData.precision}
                      onChange={(v) => handleInputChange('precision', v)}
                      min={0}
                      max={4}
                    />
                  </div>
                </Section>

                <Section
                  title="Pondération et notes manquantes"
                  description="Méthode de calcul de la moyenne pondérée et gestion des notes manquantes"
                >
                  <div className="grid sm:grid-cols-3 gap-4">
                    <SelectField
                      label="Pondération"
                      value={formData.weighting}
                      onChange={(v) => handleInputChange('weighting', v)}
                      options={[
                        { value: 'coefficient', label: 'Par coefficient' },
                        { value: 'equal', label: 'Poids égaux' },
                      ]}
                    />
                    <SelectField
                      label="Notes manquantes"
                      value={formData.missingPolicy}
                      onChange={(v) => handleInputChange('missingPolicy', v)}
                      options={[
                        { value: 'zero', label: 'Compter 0' },
                        { value: 'ignore', label: 'Ignorer (exclure)' },
                        { value: 'fail', label: 'Échouer (erreur)' },
                      ]}
                    />
                    <InputField
                      label="Nb notes min."
                      type="number"
                      value={formData.minGrades}
                      onChange={(v) => handleInputChange('minGrades', v)}
                      min={1}
                      max={50}
                    />
                  </div>
                </Section>

                <Section
                  title="Repêchage (épreuve de rattrapage)"
                  description="Permet aux élèves juste en dessous de la moyenne de passer un oral de rattrapage"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <Toggle
                      label="Activer le repêchage"
                      checked={formData.repEnabled}
                      onChange={(v) => handleInputChange('repEnabled', v)}
                    />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <InputField
                      label="Moyenne min. repêchage"
                      type="number"
                      value={formData.repMinAverage}
                      onChange={(v) => handleInputChange('repMinAverage', v)}
                      min={0}
                      max={20}
                      step={0.1}
                      disabled={!formData.repEnabled}
                    />
                    <InputField
                      label="Moyenne max. après repêchage"
                      type="number"
                      value={formData.repMaxAverage}
                      onChange={(v) => handleInputChange('repMaxAverage', v)}
                      min={0}
                      max={20}
                      step={0.1}
                      disabled={!formData.repEnabled}
                    />
                    <div className="sm:col-span-2 pt-6">
                      <Toggle
                        label="Utiliser coefficient comme poids"
                        checked={formData.useCoefficientWeight}
                        onChange={(v) => handleInputChange('useCoefficientWeight', v)}
                        description="Si désactivé, tous les coefficients = 1"
                      />
                    </div>
                  </div>
                </Section>

                <Section
                  title="Normalisation et validation"
                  description="Options de normalisation des notes et bornes de validité"
                >
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Toggle
                      label="Normaliser sur 20"
                      checked={formData.normalizeTo20}
                      onChange={(v) => handleInputChange('normalizeTo20', v)}
                      description="Convertit les notes sur /20 selon le barème max de l'évaluation"
                    />
                    <InputField
                      label="Note min. valide"
                      type="number"
                      value={formData.minValidGrade}
                      onChange={(v) => handleInputChange('minValidGrade', v)}
                      min={0}
                      max={20}
                      step={0.1}
                    />
                    <InputField
                      label="Note max. valide"
                      type="number"
                      value={formData.maxValidGrade}
                      onChange={(v) => handleInputChange('maxValidGrade', v)}
                      min={0}
                      max={20}
                      step={0.1}
                    />
                  </div>
                </Section>

                <Section
                  title="Notes d'absence"
                  description="Inclure les absences (note = 0) dans le calcul de la moyenne"
                >
                  <div className="flex items-center">
                    <Toggle
                      label="Inclure les absences comme 0"
                      checked={formData.includeAbsentInAverage}
                      onChange={(v) => handleInputChange('includeAbsentInAverage', v)}
                    />
                  </div>
                </Section>

                <Section
                  title="Échelles de notes personnalisées (optionnel)"
                  description="Définir vos propres lettres/grades avec bornes min/max (ex: A: 16-20, B: 14-15.99)"
                >
                  <InputField
                    label={`JSON des échelles (ex: {"A":{"min":16,"max":20}})`}
                    type="text"
                    value={formData.customGradeScales ? JSON.stringify(formData.customGradeScales, null, 2) : ''}
                    onChange={(v: string) => {
                      try {
                        handleInputChange('customGradeScales', v ? JSON.parse(v) : null);
                      } catch { }
                    }}
                    placeholder='{"A": {"min": 16, "max": 20}, "B": {"min": 14, "max": 15.99}}'
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted dark:text-gray-400 mt-1">
                    {'Format JSON : {"A": {"min": 16, "max": 20}, "B": {"min": 14, "max": 15.99}}'}
                  </p>
                </Section>

                <div className="flex justify-end gap-3 pt-4 border-t border-border dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setFormData(initialFormData);
                      setEditingConfig(null);
                      setErrors({});
                    }}
                    className="btn-secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSubmitting ? 'Enregistrement...' : editingConfig ? 'Mettre à jour' : 'Créer'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-danger" />
              <h3 className="text-lg font-bold text-text dark:text-gray-100">Supprimer la configuration ?</h3>
            </div>
            <p className="text-sm text-muted dark:text-gray-400 mb-6">
              Cette action est irréversible. La configuration{' '}
              <strong>{deleteConfirm.cycle?.name || deleteConfirm.niveau?.name || 'Globale'}</strong> sera définitivement supprimée.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelDelete} className="btn-secondary">
                Annuler
              </button>
              <button onClick={executeDelete} className="btn-danger flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}