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
  ChevronRight,
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
  Trash2 as Trash2Icon,
  Search,
  Filter,
  ArrowLeft,
  Globe,
  School,
  Award,
  Users,
  BookOpen,
  ClipboardList,
  ArrowRight,
  ArrowRight as ArrowRightIcon,
  ChevronLeft,
} from 'lucide-react';
import { useToastStore } from '../components/Toast';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { useSettingsStore } from '../store/settingsStore';

type Step = 1 | 2 | 3 | 4 | 5;

export default function RolloverWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState<Step>(1);
  const [stepData, setStepData] = useState<Partial<{
    sourceYearId: string;
    name: string;
    startDate: string;
    endDate: string;
    copyStructure: boolean;
  }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState('');
  const [step2Error, setStep2Error] = useState('');
  const [step3Error, setStep3Error] = useState('');
  const [step4Error, setStep4Error] = useState('');

  const { data: academicYears } = useQuery({
    queryKey: ['academic-years-rollover'],
    queryFn: async () => {
      const res = await api.get('/academic-years', { params: { status: 'active,closed', limit: 50 } });
      return res.data?.data?.items ?? [];
    },
  });

  const validateStep1 = () => {
    if (!stepData.sourceYearId) {
      setStep1Error('Veuillez sélectionner une année source');
      return false;
    }
    setStep1Error('');
    return true;
  };

  const validateStep2 = () => {
    if (!stepData.name?.trim()) {
      setStep2Error('Le nom est requis');
      return false;
    }
    if (!stepData.startDate) {
      setStep2Error('La date de début est requise');
      return false;
    }
    if (!stepData.endDate) {
      setStep2Error('La date de fin est requise');
      return false;
    }
    if (new Date(stepData.endDate) <= new Date(stepData.startDate)) {
      setStep2Error('La date de fin doit être après la date de début');
      return false;
    }
    setStep2Error('');
    return true;
  };

  const validateStep3 = () => {
    setStep3Error('');
    return true;
  };

  const validateStep4 = () => {
    setStep4Error('');
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3 && !validateStep3()) return;
    if (step === 4 && !validateStep4()) return;
    if (step < 5) setStep((s) => Math.min(s + 1, 5) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => Math.max(s - 1, 1) as Step);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 5) {
      // Execute rollover
      setLoading(true);
      setError(null);
      try {
        const res = await api.post('/academic-years/rollover/prepare', {
          targetName: stepData.name,
          sourceYearId: stepData.sourceYearId,
          targetStartDate: stepData.startDate,
          targetEndDate: stepData.endDate,
          copyStructure: stepData.copyStructure,
        });
        addToast('success', 'Année cible créée avec succès');
        window.location.href = `/academic-years/${res.data.data.targetYearId}/periods`;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Erreur lors de la création');
      } finally {
        setLoading(false);
      }
    }
  };

  const getStepTitle = (step: Step) => {
    switch (step) {
      case 1: return 'Choisir l\'année source';
      case 2: return 'Définir la nouvelle année';
      case 3: return 'Options de copie';
      case 4: return 'Confirmation';
      case 5: return 'Exécution';
      default: return '';
    }
  };

  const getStepDescription = (step: Step) => {
    switch (step) {
      case 1: return 'Sélectionnez l\'année scolaire source pour le report';
      case 2: return 'Définissez le nom et les dates de la nouvelle année scolaire';
      case 3: return 'Choisissez les éléments à copier vers la nouvelle année';
      case 4: return 'Confirmez les détails avant de lancer le report';
      case 5: return 'Exécution du report en cours...';
      default: return '';
    }
  };

  const getStepShortTitle = (step: number) => {
    switch (step) {
      case 1: return '1. Année source';
      case 2: return '2. Nouvelle année';
      case 3: return '3. Options';
      case 4: return '4. Confirmation';
      case 5: return '5. Exécution';
      default: return '';
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-2">
                Année scolaire source *
              </label>
              <select
                value={stepData.sourceYearId}
                onChange={(e) => setStepData({ ...stepData, sourceYearId: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Sélectionner l'année source</option>
                {academicYears?.map((y: { id: string; name: string; startDate: string; endDate: string }) => (
                  <option key={y.id} value={y.id}>
                    {y.name} ({y.startDate} → {y.endDate})
                  </option>
                ))}
              </select>
              {step === 1 && !stepData.sourceYearId && (
                <p className="text-xs text-danger mt-1">Veuillez sélectionner une année source</p>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Nom de la nouvelle année *
                </label>
                <input
                  type="text"
                  value={stepData.name}
                  onChange={(e) => setStepData({ ...stepData, name: e.target.value })}
                  className="input-field"
                  placeholder="Ex: 2025-2026"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Date de début *
                </label>
                <input
                  type="date"
                  value={stepData.startDate}
                  onChange={(e) => setStepData({ ...stepData, startDate: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">
                  Date de fin *
                </label>
                <input
                  type="date"
                  value={stepData.endDate}
                  onChange={(e) => setStepData({ ...stepData, endDate: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted dark:text-gray-400 mt-2">
              La date de fin doit être postérieure à la date de début
            </p>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stepData.copyStructure}
                  onChange={(e) => setStepData({ ...stepData, copyStructure: e.target.checked })}
                  className="w-5 h-5 rounded border-border dark:border-white/20 text-primary-500 focus:ring-primary-500"
                />
                <span className="font-medium text-text dark:text-gray-200">Copier la structure (périodes, classes, matières)</span>
              </label>
              <p className="text-sm text-muted dark:text-gray-400 ml-8">
                Copie les périodes d'évaluation, classes, matières et leur structure vers la nouvelle année.
              </p>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-6">
            <div className="card p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl">
              <h4 className="font-semibold text-text dark:text-gray-100 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary-500" />
                Récapitulatif
              </h4>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted dark:text-gray-400">Année source</dt>
                  <dd className="font-medium text-text dark:text-gray-200">{academicYears?.find((y: { id: string; name: string }) => y.id === stepData.sourceYearId)?.name || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted dark:text-gray-400">Nouvelle année</dt>
                  <dd className="font-medium text-text dark:text-gray-200">{stepData.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted dark:text-gray-400">Période</dt>
                  <dd className="font-medium text-text dark:text-gray-200">
                    {stepData.startDate && stepData.endDate
                      ? `${new Date(stepData.startDate).toLocaleDateString('fr-FR')} → ${new Date(stepData.endDate).toLocaleDateString('fr-FR')}`
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted dark:text-gray-400">Copier la structure</dt>
                  <dd className="font-medium text-text dark:text-gray-200">{stepData.copyStructure ? 'Oui' : 'Non'}</dd>
                </div>
              </dl>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Cette action créera la nouvelle année scolaire. L'année source ne sera pas modifiée.
              </p>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary-500 mb-4" />
            <h3 className="text-lg font-semibold text-text dark:text-gray-100 mb-2">Exécution du report en cours...</h3>
            <p className="text-muted dark:text-gray-400">Création de la nouvelle année scolaire en cours...</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-dark">
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {Array.from({ length: 5 }, (_, i) => i + 1).map((s, i) => (
              <div key={s} className="flex flex-col items-center flex-1">
                <div
                  className={`relative flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm transition-all duration-300 ${
                    step > s ? 'bg-primary-500 text-white' :
                    step === s ? 'bg-primary-500 text-white' :
                    'bg-gray-200 dark:bg-white/10 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {step > s ? <Check className="w-5 h-5" /> : s}
                </div>
                <span className="text-xs text-center text-muted dark:text-gray-400 mt-1">
                  {['Année source', 'Nouvelle année', 'Options', 'Confirmation', 'Exécution'][i]}
                </span>
                {i < 4 && (
                  <div className={`flex-1 h-0.5 mt-6 -mb-1 ${step > i ? 'bg-primary-500' : 'bg-gray-200 dark:bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-text dark:text-gray-100 mb-1">{getStepTitle(step)}</h3>
          <p className="text-muted dark:text-gray-400 mb-6">{getStepDescription(step)}</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {renderStep()}

            <div className="flex justify-between pt-4 border-t border-border dark:border-white/10">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 1}
                className="btn-secondary disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mr-2" /> Retour
              </button>
              <div className="flex-1" />
              {step < 5 ? (
                <button type="submit" className="btn-primary flex items-center gap-2">
                  Suivant <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Exécution...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Exécuter le report
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}