import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Coins, Plus, RefreshCw, AlertTriangle, Loader2, Radio, ShieldCheck, Trash2, Info,
} from 'lucide-react';
import api from '../lib/api';
import { useCan } from '../store/authStore';
import { useToastStore } from './Toast';
import { cn } from '../lib/utils';

interface Currency { code: string; name: string; symbol: string; decimals: number; common: boolean }
interface RateRow {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveFrom: string;
  source: 'manual' | 'live';
  note?: string | null;
  provider?: string | null;
}
interface LiveResponse {
  ok: boolean;
  provider: string;
  base?: string;
  rates?: Record<string, number>;
  fetchedAt?: string;
  cached?: boolean;
  error?: string;
  advisory?: string;
}

function errMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}

function fmt(n: number, decimals: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(n) || 0);
}

export default function CurrencyPanel() {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const canEdit = useCan('finance', 'create');
  const canView = useCan('finance', 'view');

  const [form, setForm] = useState({ from: 'USD', to: 'CDF', rate: '', note: '' });

  const infoQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await api.get('/currencies');
      return res.data?.data as { baseCurrency: string; currencies: Currency[]; common: Currency[] };
    },
    enabled: canView,
  });

  const ratesQuery = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: async (): Promise<RateRow[]> => {
      const res = await api.get('/currencies/rates');
      return res.data?.data?.items ?? [];
    },
    enabled: canView,
  });

  const liveQuery = useQuery({
    queryKey: ['live-rates', infoQuery.data?.baseCurrency],
    queryFn: async (): Promise<LiveResponse> => {
      const res = await api.get('/currencies/live');
      return res.data?.data;
    },
    enabled: canView && !!infoQuery.data?.baseCurrency,
    // Rates move slowly; the backend caches for 10 minutes.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const addRate = useMutation({
    mutationFn: async () => {
      const res = await api.post('/currencies/rates', {
        from: form.from,
        to: form.to,
        rate: Number(form.rate),
        note: form.note || undefined,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      addToast('success', 'Taux enregistré');
      setForm((p) => ({ ...p, rate: '', note: '' }));
      void queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
    onError: (err: unknown) => addToast('error', errMsg(err, 'Enregistrement impossible')),
  });

  const changeBase = useMutation({
    mutationFn: async (currency: string) => {
      const res = await api.put('/currencies/base', { currency });
      return res.data?.data;
    },
    onSuccess: (_d, currency) => {
      addToast('success', `Devise de comptabilité : ${currency}`);
      void queryClient.invalidateQueries({ queryKey: ['currencies'] });
      void queryClient.invalidateQueries({ queryKey: ['live-rates'] });
    },
    onError: (err: unknown) => addToast('error', errMsg(err, 'Changement impossible')),
  });

  const base = infoQuery.data?.baseCurrency;
  const currencies = infoQuery.data?.currencies ?? [];
  const rates = ratesQuery.data ?? [];
  const manualRates = rates.filter((r) => r.source === 'manual');
  const live = liveQuery.data;

  if (!canView) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-3" />
        <p className="text-text font-medium">Accès restreint</p>
        <p className="text-sm text-muted mt-1">
          La gestion des devises exige la permission <code>finance.view</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Base currency */}
      <div className="card p-5">
        <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
          <Coins className="w-4 h-4" /> Devise de comptabilité
        </h3>
        <p className="text-sm text-muted dark:text-gray-400 mt-1 mb-4">
          Devise dans laquelle tous vos frais et soldes sont comptabilisés. Les paiements peuvent être
          reçus dans une autre devise et sont convertis au taux convenu.
        </p>
        <div className="max-w-sm">
          <select
            value={base ?? ''}
            disabled={!canEdit || changeBase.isPending}
            onChange={(e) => changeBase.mutate(e.target.value)}
            className="input-field disabled:opacity-50"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          {changeBase.isPending && <Loader2 className="w-4 h-4 animate-spin mt-2" />}
        </div>
        <p className="text-xs text-muted dark:text-gray-500 mt-3">
          Changer la devise de base ne réécrit aucun montant existant : les paiements conservent le
          taux et le montant qui avaient été enregistrés.
        </p>
      </div>

      {/* Live rates */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
              <Radio className="w-4 h-4" /> Taux de référence (live)
            </h3>
            <p className="text-sm text-muted dark:text-gray-400 mt-1">
              Aide à la caisse. Un taux live ne valide jamais un encaissement sans confirmation
              explicite.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void liveQuery.refetch()}
            className="btn-icon"
            aria-label="Rafraîchir les taux"
          >
            <RefreshCw className={cn('w-4 h-4', liveQuery.isFetching && 'animate-spin')} />
          </button>
        </div>

        {liveQuery.isLoading ? (
          <div className="h-10 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
        ) : !live?.ok ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Service de taux indisponible{live?.error ? ` (${live.error})` : ''}. Utilisez les taux
              convenus ci-dessous — le fonctionnement n’est pas affecté.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(live.rates ?? {}).map(([code, value]) => (
                <div key={code} className="p-2.5 rounded-lg bg-gray-50 dark:bg-white/5">
                  <p className="text-xs text-muted dark:text-gray-400">1 {live.base} =</p>
                  <p className="text-sm font-semibold text-text dark:text-gray-200">
                    {fmt(value, value > 1000 ? 0 : 4)} {code}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted dark:text-gray-500 mt-3">
              Source {live.provider} · {live.cached ? 'cache' : 'temps réel'} ·{' '}
              {live.fetchedAt ? new Date(live.fetchedAt).toLocaleString('fr-FR') : ''}
            </p>
          </>
        )}
      </div>

      {/* Add an agreed rate */}
      {canEdit && (
        <div className="card p-5">
          <h3 className="font-semibold text-text dark:text-gray-100 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Enregistrer un taux convenu
          </h3>
          <p className="text-sm text-muted dark:text-gray-400 mt-1 mb-4">
            Le « taux convenu » fait autorité pour la comptabilité. Il s’ajoute à l’historique sans
            jamais modifier les taux précédents.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">De</label>
              <select
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                className="input-field w-full"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Vers</label>
              <select
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                className="input-field w-full"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Taux</label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="ex. 2850"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text dark:text-gray-300 mb-1.5">Note</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="facultatif"
                className="input-field w-full"
              />
            </div>
          </div>
          <p className="text-xs text-muted dark:text-gray-500 mt-2">
            1 {form.from} = <strong>{form.rate || '?'}</strong> {form.to}
            {form.rate ? ` — soit ${fmt(Number(form.rate), 0)} ${form.to} pour 1 ${form.from}` : ''}
          </p>
          <button
            onClick={() => addRate.mutate()}
            disabled={addRate.isPending || !form.rate || Number(form.rate) <= 0 || form.from === form.to}
            className="btn-primary mt-4 disabled:opacity-50"
          >
            {addRate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Enregistrer le taux
          </button>
        </div>
      )}

      {/* Rate history */}
      <div className="card p-5">
        <h3 className="font-semibold text-text dark:text-gray-100 mb-1">Historique des taux</h3>
        <p className="text-sm text-muted dark:text-gray-400 mb-4">
          {manualRates.length} taux convenu(s). Chaque paiement reste rattaché au taux en vigueur à sa
          date.
        </p>
        {ratesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : rates.length === 0 ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Aucun taux enregistré. Les paiements dans la devise de base fonctionnent déjà ; pour
              accepter une autre devise, enregistrez son taux convenu.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border dark:border-white/10">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Paire</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted dark:text-gray-400 uppercase">Taux</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Effective le</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Source</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted dark:text-gray-400 uppercase">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-white/5">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-3 py-3 text-sm text-text dark:text-gray-200">
                      1 {r.fromCurrency} = {r.rate} {r.toCurrency}
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-medium text-text dark:text-gray-200">
                      {r.rate}
                    </td>
                    <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">
                      {new Date(r.effectiveFrom).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        r.source === 'manual'
                          ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                      )}>
                        {r.source === 'manual' ? 'convenu' : 'live'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-muted dark:text-gray-400">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { ShieldCheck, Trash2 };
