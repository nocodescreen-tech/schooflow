import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Lock, Puzzle, Check, X, AlertTriangle, Info, Loader2, RefreshCw,
  ShieldCheck, Package, ChevronDown, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';
import { useCan } from '../store/authStore';
import { useToastStore } from './Toast';
import { cn } from '../lib/utils';

/**
 * Module management panel.
 *
 * Everything shown here comes from the server's module registry — the same
 * source the API guards and the navigation builder use. There is no local
 * fallback catalogue: if the registry cannot be read we say so instead of
 * silently showing a stale, incomplete list.
 */

interface ModuleNavEntry { path: string; label: string; icon: string; permission?: string }
interface ModuleSetting { key: string; label: string; type: string; default: unknown; help?: string }

interface ModuleItem {
  code: string;
  name: string;
  description: string;
  category: string;
  lifecycle: 'core' | 'optional' | 'coming_soon';
  dependencies: string[];
  dependents: string[];
  enabled: boolean;
  core: boolean;
  status: string;
  canEnable: boolean;
  missingDependencies: string[];
  permissions: string[];
  routes: string[];
  nav: ModuleNavEntry[];
  settings: ModuleSetting[];
  workflows: string[];
  dataHint: { label: string; table: string } | null;
}

const CATEGORY_ORDER = [
  'Noyau', 'Scolarité', 'Académique', 'Gestion',
  'Vie scolaire', 'Communication', 'Documents', 'Ressources', 'Pilotage',
];

const LIFECYCLE_LABEL: Record<string, { label: string; className: string }> = {
  core: { label: 'Noyau', className: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300' },
  optional: { label: 'Optionnel', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  coming_soon: { label: 'Prévu', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

function errMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}

function ModuleRow({
  module,
  nameOf,
  pending,
  onToggle,
  onInspect,
}: {
  module: ModuleItem;
  nameOf: (code: string) => string;
  pending: boolean;
  onToggle: (m: ModuleItem) => void;
  onInspect: (m: ModuleItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const locked = module.core;
  const roadmap = module.lifecycle === 'coming_soon';
  const blocked = !module.canEnable && !module.enabled;
  const cycle = module.dependents.length > 0;
  const lc = LIFECYCLE_LABEL[module.lifecycle] ?? LIFECYCLE_LABEL.optional;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text dark:text-gray-200">{module.name}</p>
            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', lc.className)}>{lc.label}</span>
            {locked && <Lock className="w-3 h-3 text-muted" aria-label="Verrouillé" />}
            {cycle && (
              <span className="text-[10px] text-muted"> requis par {module.dependents.length} module(s)</span>
            )}
          </div>
          <p className="text-xs text-muted dark:text-gray-400 mt-0.5">{module.description}</p>

          {blocked && module.missingDependencies.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Dépend de : {module.missingDependencies.map((d) => nameOf(d)).join(', ')}
            </p>
          )}
          {roadmap && (
            <p className="text-xs text-muted dark:text-gray-500 mt-1">
              Prévu dans la feuille de route — pas encore disponible.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="btn-icon"
            aria-label={expanded ? 'Masquer le détail' : 'Voir le détail'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {pending ? (
            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" aria-label="En cours" />
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={module.enabled}
              aria-label={`${module.enabled ? 'Désactiver' : 'Activer'} ${module.name}`}
              disabled={locked || roadmap || blocked}
              onClick={() => onToggle(module)}
              title={
                locked ? 'Module du noyau : toujours actif'
                  : roadmap ? 'Pas encore disponible'
                  : blocked ? 'Activez d’abord les dépendances'
                  : undefined
              }
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors shrink-0',
                'disabled:cursor-not-allowed disabled:opacity-40',
                module.enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-white/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                  module.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                )}
              />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-1 pl-3 border-l-2 border-border dark:border-white/10 space-y-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <p className="font-medium text-text dark:text-gray-300">Dépendances</p>
              <p className="text-muted dark:text-gray-400">
                {module.dependencies.length ? module.dependencies.map(nameOf).join(', ') : 'Aucune'}
              </p>
            </div>
            <div>
              <p className="font-medium text-text dark:text-gray-300">Dépendants</p>
              <p className="text-muted dark:text-gray-400">
                {module.dependents.length ? module.dependents.map(nameOf).join(', ') : 'Aucun'}
              </p>
            </div>
            {module.dataHint && (
              <div>
                <p className="font-medium text-text dark:text-gray-300">Données conservées</p>
                <p className="text-muted dark:text-gray-400">{module.dataHint.label}</p>
              </div>
            )}
            <div>
              <p className="font-medium text-text dark:text-gray-300">Permissions</p>
              <p className="text-muted dark:text-gray-400">{module.permissions.length} installées à l’activation</p>
            </div>
            {module.workflows.length > 0 && (
              <div className="sm:col-span-2">
                <p className="font-medium text-text dark:text-gray-300">Flux activés</p>
                <p className="text-muted dark:text-gray-400">{module.workflows.join(' · ')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModulesPanel() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const canEnable = useCan('modules', 'enable');
  const canDisable = useCan('modules', 'disable');

  const [confirm, setConfirm] = useState<ModuleItem | null>(null);
  const [showRoadmap, setShowRoadmap] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['modules-catalog'],
    retry: false,
    queryFn: async (): Promise<ModuleItem[]> => {
      const res = await api.get('/modules');
      return (res.data?.data?.items ?? []) as ModuleItem[];
    },
  });

  const mutation = useMutation({
    mutationFn: async ({ code, enable }: { code: string; enable: boolean }) => {
      await api.post(`/modules/${code}/${enable ? 'enable' : 'disable'}`);
    },
    onSuccess: (_d, vars) => {
      addToast('success', `Module ${vars.enable ? 'activé' : 'désactivé'}`);
      void queryClient.invalidateQueries({ queryKey: ['modules-catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['modules-enabled'] });
      setConfirm(null);
    },
    onError: (err: unknown) => {
      // Surface the real reason (409 dependency, 400 core, 403 permission)
      // instead of a generic message.
      addToast('error', errMsg(err, 'Opération impossible'));
      setConfirm(null);
    },
  });

  const items = data ?? [];
  const nameOf = (code: string) => items.find((m) => m.code === code)?.name ?? code;

  const visible = showRoadmap ? items : items.filter((m) => m.lifecycle !== 'coming_soon');
  const byCategory = new Map<string, ModuleItem[]>();
  for (const m of visible) {
    const list = byCategory.get(m.category);
    if (list) list.push(m);
    else byCategory.set(m.category, [m]);
  }
  const categories = [...byCategory.entries()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 99 * (CATEGORY_ORDER.indexOf(a[0]) < 0 ? 1 : 0))
      - (CATEGORY_ORDER.indexOf(b[0]) + 99 * (CATEGORY_ORDER.indexOf(b[0]) < 0 ? 1 : 0))
  );

  const counts = {
    total: items.length,
    enabled: items.filter((m) => m.enabled).length,
    optional: items.filter((m) => m.lifecycle === 'optional').length,
    roadmap: items.filter((m) => m.lifecycle === 'coming_soon').length,
  };

  const requestToggle = (m: ModuleItem) => {
    if (m.enabled && !canDisable) {
      addToast('error', 'Vous n’avez pas le droit de désactiver un module');
      return;
    }
    if (!m.enabled && !canEnable) {
      addToast('error', 'Vous n’avez pas le droit d’activer un module');
      return;
    }
    // Enabling installs real configuration; disabling can orphan dependents,
    // so both get an explicit confirmation step.
    setConfirm(m);
  };

  if (isLoading) {
    return (
      <div className="card p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-3" />
        <p className="text-text font-medium">Impossible de charger le registre des modules</p>
        <p className="text-sm text-muted mt-1">
          Le serveur n’a pas répondu. Vérifiez que l’API est démarrée.
        </p>
        <button onClick={() => void refetch()} className="btn-outline mt-4">
          <RefreshCw className="w-4 h-4" /> Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <Puzzle className="w-4 h-4" /> Modules
            </h3>
            <p className="text-sm text-muted dark:text-gray-400 mt-1">
              {counts.enabled} actif(s) sur {counts.total} · {counts.optional} optionnels
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-text dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={showRoadmap} onChange={(e) => setShowRoadmap(e.target.checked)} />
            Afficher les modules prévus ({counts.roadmap})
          </label>
        </div>

        {(!canEnable || !canDisable) && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Vous pouvez consulter les modules mais pas les modifier : il manque la permission
              {(!canEnable && !canDisable) ? ' modules.enable / modules.disable' : !canEnable ? ' modules.enable' : ' modules.disable'}.
            </p>
          </div>
        )}
      </div>

      {categories.map(([category, mods]) => (
        <div key={category} className="card p-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-gray-400 mb-2">
            {category}
          </h4>
          <div className="divide-y divide-border dark:divide-white/10">
            {mods.map((m) => (
              <ModuleRow
                key={m.code}
                module={m}
                nameOf={nameOf}
                pending={mutation.isPending && confirm?.code === m.code}
                onToggle={requestToggle}
                onInspect={() => setConfirm(m)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Confirmation dialog — always explicit, explains data preservation */}
      {confirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setConfirm(null)}
          />
          <div className="relative w-full max-w-md card p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                confirm.enabled ? 'bg-amber-500/15' : 'bg-primary-500/15'
              )}>
                {confirm.enabled
                  ? <AlertTriangle className="w-5 h-5 text-amber-500" />
                  : <Package className="w-5 h-5 text-primary-500" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-text dark:text-gray-100">
                  {confirm.enabled ? 'Désactiver' : 'Activer'} « {confirm.name} »
                </h3>
                <p className="text-sm text-muted dark:text-gray-400 mt-0.5">{confirm.description}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {confirm.enabled ? (
                <>
                  <p className="text-muted dark:text-gray-300">
                    Ce module sera retiré de la navigation et ses API seront bloquées.
                  </p>
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-500/10">
                    <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-green-800 dark:text-green-300">
                      <strong>Aucune donnée ne sera supprimée.</strong>
                      {confirm.dataHint ? ` Les ${confirm.dataHint.label.toLowerCase()} sont conservés et l’historique reste accessible.` : ' L’historique reste accessible et la réactivation le restaure intégralement.'}
                    </p>
                  </div>
                  {confirm.dependents.length > 0 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {confirm.dependents.length} module(s) en dépendent et perdront leur accès :{' '}
                        {confirm.dependents.map(nameOf).join(', ')}.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted dark:text-gray-300">
                    L’activation va installer la configuration et {confirm.permissions.length} permissions
                    {confirm.workflows.length > 0 ? ', et activer les flux :' : '.'}
                  </p>
                  {confirm.workflows.length > 0 && (
                    <p className="text-xs text-muted dark:text-gray-400">{confirm.workflows.join(' · ')}</p>
                  )}
                  {confirm.missingDependencies.length > 0 && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Activez d’abord : {confirm.missingDependencies.map(nameOf).join(', ')}.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-outline" onClick={() => setConfirm(null)}>Annuler</button>
              <button
                className={confirm.enabled ? 'btn-danger' : 'btn-primary'}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ code: confirm.code, enable: !confirm.enabled })}
              >
                {mutation.isPending ? 'En cours…' : confirm.enabled ? 'Désactiver' : 'Activer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { Check, X };
