import { useEffect, useState } from 'react';
import { Globe, Store } from 'lucide-react';
import { useProviderContext } from '../../../contexts/ProviderContext';
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

      const trainingIds = (trainingRows ?? []).map((t) => t.id);
      if (trainingIds.length > 0) {
        const { data: curationRows } = await supabase
          .from('marketplace_trainings')
          .select('training_id, marketplaces(*)')
          .in('training_id', trainingIds)
          .is('removed_at', null);

        if (!active) return;
        const grouped: Record<string, Marketplace[]> = {};
        (curationRows ?? []).forEach((row: any) => {
          if (!row.marketplaces) return;
          grouped[row.training_id] = grouped[row.training_id] ?? [];
          grouped[row.training_id].push(row.marketplaces as Marketplace);
        });
        setCuratedByTraining(grouped);
      } else {
        setCuratedByTraining({});
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [selectedProviderId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Var visas mina kurser?</h1>
        <p className="text-slate-600">
          Översikt över var dina kurser syns just nu — öppna marknadsplatsen, din egen leverantörsbutik
          och eventuella partnermarknadsplatser du är kuraterad in i.
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
                  {partnerMarketplaces.map((m) => (
                    <span
                      key={m.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-transparent ${STATUS_STYLE[m.status] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      {m.name} ({STATUS_LABEL[m.status] ?? m.status})
                    </span>
                  ))}
                  {!training.is_active && !storefront && partnerMarketplaces.length === 0 && (
                    <span className="text-xs text-slate-400">Kursen är ett utkast och syns ingenstans ännu.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
