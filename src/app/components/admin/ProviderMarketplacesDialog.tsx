import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import type { Marketplace } from '../../../lib/marketplaces';

interface Props {
  providerId: string;
  providerName: string;
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  partner_curated: 'Partnermarknadsplats',
  provider_storefront: 'Leverantörsbutik',
};

// Admin kopplar en eller flera marknadsplatser till en leverantör. Leverantören
// kan därefter själv välja vilka av sina kurser som visas i dem.
export function ProviderMarketplacesDialog({ providerId, providerName, onClose }: Props) {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: mps }, { data: links }] = await Promise.all([
        supabase.from('marketplaces').select('*').neq('type', 'open').order('name'),
        supabase.from('marketplace_providers').select('marketplace_id').eq('provider_id', providerId),
      ]);
      setMarketplaces((mps ?? []) as Marketplace[]);
      setLinked(new Set((links ?? []).map((l) => l.marketplace_id)));
      setLoading(false);
    }
    load();
  }, [providerId]);

  async function toggle(marketplace: Marketplace) {
    const isLinked = linked.has(marketplace.id);
    if (isLinked) {
      const ok = window.confirm(
        `Ta bort kopplingen till ${marketplace.name}? ${providerName}s kurser som visas där tas också bort från marknadsplatsen.`
      );
      if (!ok) return;
    }
    setBusyId(marketplace.id);
    try {
      if (isLinked) {
        const { data: own } = await supabase.from('trainings').select('id').eq('provider_id', providerId);
        const trainingIds = (own ?? []).map((t) => t.id);
        if (trainingIds.length > 0) {
          const { error: curErr } = await supabase
            .from('marketplace_trainings')
            .update({ removed_at: new Date().toISOString() })
            .eq('marketplace_id', marketplace.id)
            .in('training_id', trainingIds)
            .is('removed_at', null);
          if (curErr) throw curErr;
        }
        const { error } = await supabase
          .from('marketplace_providers')
          .delete()
          .eq('marketplace_id', marketplace.id)
          .eq('provider_id', providerId);
        if (error) throw error;
        setLinked((prev) => {
          const next = new Set(prev);
          next.delete(marketplace.id);
          return next;
        });
      } else {
        const { error } = await supabase
          .from('marketplace_providers')
          .insert({ marketplace_id: marketplace.id, provider_id: providerId });
        if (error) throw error;
        setLinked((prev) => new Set(prev).add(marketplace.id));
      }
    } catch (err) {
      toast.error('Kunde inte uppdatera kopplingen', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Marknadsplatser</h3>
            <p className="text-sm text-slate-600">
              Välj vilka marknadsplatser {providerName} kan visa sina kurser i.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Stäng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : marketplaces.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Inga marknadsplatser skapade ännu.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {marketplaces.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={linked.has(m.id)}
                  disabled={busyId === m.id}
                  onChange={() => toggle(m)}
                  className="w-4 h-4"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 truncate">{m.name}</div>
                  <div className="text-xs text-slate-500">{TYPE_LABEL[m.type] ?? m.type}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
