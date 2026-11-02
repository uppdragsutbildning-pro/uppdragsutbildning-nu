import { useEffect, useState } from 'react';
import { Globe, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import type { Marketplace } from '../../../lib/marketplaces';

interface TrainingRow {
  id: string;
  title: string;
  is_active: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Utkast (ej publik ännu)',
  active: 'Aktiv',
  paused: 'Pausad',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
};

export function ProviderMarketplacesPage() {
  const { selectedProviderId } = useProviderContext();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  // Marknadsplatser kursen kan kopplas till: admin = alla partnermarknadsplatser,
  // leverantör = de som admin kopplat till leverantören.
  const [assignable, setAssignable] = useState<Marketplace[]>([]);
  // training_id -> marketplace_id -> marketplace_trainings.id
  const [curationRows, setCurationRows] = useState<Record<string, Record<string, string>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [storefront, setStorefront] = useState<Marketplace | null>(null);
  const [curatedByTraining, setCuratedByTraining] = useState<Record<string, Marketplace[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedProviderId) return;
    let active = true;

    async function load() {
      setLoading(true);

      const [{ data: trainingRows }, { data: storefrontRow }] = await Promise.all([
        supabase
          .from('trainings')
          .select('id, title, is_active')
          .eq('provider_id', selectedProviderId)
          .order('title'),
        supabase
          .from('marketplaces')
          .select('*')
          .eq('owner_type', 'provider')
          .eq('provider_id', selectedProviderId)
          .eq('type', 'provider_storefront')
          .maybeSingle(),
      ]);

      if (!active) return;
      setTrainings((trainingRows ?? []) as TrainingRow[]);
      setStorefront((storefrontRow as Marketplace) ?? null);

      let assignableList: Marketplace[] = [];
      if (isAdmin) {
        const { data } = await supabase.from('marketplaces').select('*').eq('type', 'partner_curated').order('name');
        assignableList = (data ?? []) as Marketplace[];
      } else {
        const { data } = await supabase
          .from('marketplace_providers')
          .select('marketplaces(*)')
          .eq('provider_id', selectedProviderId);
        assignableList = (data ?? [])
          .map((r: any) => r.marketplaces as Marketplace | null)
          .filter((m): m is Marketplace => !!m && m.type === 'partner_curated');
      }
      if (!active) return;
      setAssignable(assignableList);

      const trainingIds = (trainingRows ?? []).map((t) => t.id);
      if (trainingIds.length > 0) {
        const { data: curationRows } = await supabase
          .from('marketplace_trainings')
          .select('id, training_id, marketplace_id, marketplaces(*)')
          .in('training_id', trainingIds)
          .is('removed_at', null);

        if (!active) return;
        const grouped: Record<string, Marketplace[]> = {};
        const rowMap: Record<string, Record<string, string>> = {};
        (curationRows ?? []).forEach((row: any) => {
          rowMap[row.training_id] = { ...(rowMap[row.training_id] ?? {}), [row.marketplace_id]: row.id };
          if (!row.marketplaces) return;
          grouped[row.training_id] = grouped[row.training_id] ?? [];
          grouped[row.training_id].push(row.marketplaces as Marketplace);
        });
        setCuratedByTraining(grouped);
        setCurationRows(rowMap);
      } else {
        setCuratedByTraining({});
        setCurationRows({});
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [selectedProviderId, isAdmin]);

  async function setCurated(trainingId: string, marketplace: Marketplace, on: boolean) {
    const key = `${trainingId}:${marketplace.id}`;
    setBusyKey(key);
    try {
      const rowId = curationRows[trainingId]?.[marketplace.id];
      if (on && !rowId) {
        const { data, error } = await supabase
          .from('marketplace_trainings')
          .insert({ marketplace_id: marketplace.id, training_id: trainingId, added_by: profile?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        setCurationRows((prev) => ({ ...prev, [trainingId]: { ...(prev[trainingId] ?? {}), [marketplace.id]: data.id } }));
        setCuratedByTraining((prev) => ({ ...prev, [trainingId]: [...(prev[trainingId] ?? []), marketplace] }));
      } else if (!on && rowId) {
        const { error } = await supabase
          .from('marketplace_trainings')
          .update({ removed_at: new Date().toISOString() })
          .eq('id', rowId);
        if (error) throw error;
        setCurationRows((prev) => {
          const next = { ...(prev[trainingId] ?? {}) };
          delete next[marketplace.id];
          return { ...prev, [trainingId]: next };
        });
        setCuratedByTraining((prev) => ({
          ...prev,
          [trainingId]: (prev[trainingId] ?? []).filter((m) => m.id !== marketplace.id),
        }));
      }
    } catch (err) {
      toast.error('Kunde inte uppdatera marknadsplatserna', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyKey(null);
    }
  }

  async function setAll(trainingId: string, on: boolean) {
    for (const m of assignable) {
      await setCurated(trainingId, m, on);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Var visas mina kurser?</h1>
        <p className="text-slate-600">
          Välj vilka marknadsplatser varje kurs ska visas i. Du kan välja bland de marknadsplatser som
          är kopplade till leverantören.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : trainings.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">Du har inga kurser ännu.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trainings.map((training) => {
            const partnerMarketplaces = curatedByTraining[training.id] ?? [];
            return (
              <div key={training.id} className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="font-semibold text-slate-900 mb-3">{training.title}</h3>
                <div className="flex flex-wrap gap-2">
                  {training.is_active && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      <Globe className="w-3.5 h-3.5" />
                      Öppna marknadsplatsen
                    </span>
                  )}
                  {storefront && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-transparent ${STATUS_STYLE[storefront.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      <Store className="w-3.5 h-3.5" />
                      {storefront.name} ({STATUS_LABEL[storefront.status] ?? storefront.status})
                    </span>
                  )}
                  {!training.is_active && !storefront && partnerMarketplaces.length === 0 && assignable.length === 0 && (
                    <span className="text-xs text-slate-400">Kursen är ett utkast och syns ingenstans ännu.</span>
                  )}
                </div>

                {assignable.length > 0 ? (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Visas i marknadsplatser</span>
                      {isAdmin && (
                        <div className="flex gap-3 text-xs">
                          <button onClick={() => setAll(training.id, true)} className="text-blue-700 hover:underline">Alla</button>
                          <button onClick={() => setAll(training.id, false)} className="text-slate-500 hover:underline">Ingen</button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assignable.map((m) => {
                        const on = !!curationRows[training.id]?.[m.id];
                        return (
                          <label
                            key={m.id}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
                              on ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={busyKey === `${training.id}:${m.id}`}
                              onChange={(e) => setCurated(training.id, m, e.target.checked)}
                              className="w-3.5 h-3.5"
                            />
                            {m.name} ({STATUS_LABEL[m.status] ?? m.status})
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  !isAdmin && (
                    <p className="mt-3 text-xs text-slate-400">
                      Inga marknadsplatser är kopplade till din leverantör ännu. Kontakta Uppdragsutbildning för att koppla dem.
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
