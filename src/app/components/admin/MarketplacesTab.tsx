import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Globe, Plus, Palette, ListChecks, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import {
  Marketplace,
  PartnerOrganization,
  getCuratedTrainingCount,
  getProviderStorefrontTrainingCount,
} from '../../../lib/marketplaces';

interface Provider {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Utkast',
  active: 'Aktiv',
  paused: 'Pausad',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
};

const TYPE_LABEL: Record<string, string> = {
  provider_storefront: 'Leverantörsbutik',
  partner_curated: 'Partnermarknadsplats',
  open: 'Öppen marknadsplats',
};

export function MarketplacesTab() {
  const navigate = useNavigate();
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [partnerOrgs, setPartnerOrgs] = useState<Record<string, PartnerOrganization>>({});
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const [{ data: mps, error }, { data: orgs }, { data: provs }] = await Promise.all([
        supabase.from('marketplaces').select('*').order('created_at', { ascending: false }),
        supabase.from('partner_organizations').select('*'),
        supabase.from('providers').select('id, name'),
      ]);
      if (!active) return;
      if (error) {
        console.error(error);
        toast.error('Kunde inte hämta marknadsplatser', { description: error.message });
        setLoading(false);
        return;
      }

      const orgMap: Record<string, PartnerOrganization> = {};
      (orgs ?? []).forEach((o) => (orgMap[o.id] = o as PartnerOrganization));
      const provMap: Record<string, Provider> = {};
      (provs ?? []).forEach((p) => (provMap[p.id] = p as Provider));

      setMarketplaces((mps ?? []) as Marketplace[]);
      setPartnerOrgs(orgMap);
      setProviders(provMap);

      const countEntries = await Promise.all(
        (mps ?? []).map(async (m) => {
          try {
            const count =
              m.type === 'partner_curated'
                ? await getCuratedTrainingCount(m.id)
                : m.provider_id
                ? await getProviderStorefrontTrainingCount(m.provider_id)
                : 0;
            return [m.id, count] as const;
          } catch {
            return [m.id, 0] as const;
          }
        })
      );
      if (!active) return;
      setCounts(Object.fromEntries(countEntries));
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleStatusChange(marketplace: Marketplace, status: 'draft' | 'active' | 'paused') {
    const { error } = await supabase.from('marketplaces').update({ status }).eq('id', marketplace.id);
    if (error) {
      toast.error('Kunde inte ändra status', { description: error.message });
      return;
    }
    setMarketplaces((prev) => prev.map((m) => (m.id === marketplace.id ? { ...m, status } : m)));
    toast.success(`Marknadsplatsen är nu ${STATUS_LABEL[status].toLowerCase()}`);
  }

  async function handleDelete(marketplace: Marketplace) {
    if (!window.confirm(`Ta bort marknadsplatsen "${marketplace.name}"? Detta går inte att ångra.`)) return;
    const { error } = await supabase.from('marketplaces').delete().eq('id', marketplace.id);
    if (error) {
      toast.error('Kunde inte ta bort marknadsplatsen', { description: error.message });
      return;
    }
    setMarketplaces((prev) => prev.filter((m) => m.id !== marketplace.id));
    toast.success('Marknadsplatsen togs bort');
  }

  function ownerName(m: Marketplace): string {
    if (m.owner_type === 'partner_organization' && m.partner_organization_id) {
      return partnerOrgs[m.partner_organization_id]?.name ?? 'Okänd partner';
    }
    if (m.owner_type === 'provider' && m.provider_id) {
      return providers[m.provider_id]?.name ?? 'Okänd leverantör';
    }
    return 'Uppdragsutbildning.nu';
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Marknadsplatser</h2>
          <p className="text-sm text-slate-600">
            Varumärkta subdomäner för leverantörer och partnerorganisationer
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/marketplaces/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Skapa marknadsplats
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Laddar...</div>
      ) : marketplaces.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Globe className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 mb-4">Inga marknadsplatser skapade ännu</p>
          <button
            onClick={() => navigate('/admin/marketplaces/new')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Skapa första marknadsplatsen
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {marketplaces.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-slate-900">{m.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${STATUS_STYLE[m.status]}`}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </div>
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full mr-2">
                    {TYPE_LABEL[m.type] ?? m.type}
                  </span>
                  <span className="text-xs text-slate-500">{ownerName(m)}</span>
                </div>
              </div>

              <div className="text-xs text-slate-600 mb-4 font-mono bg-slate-50 rounded px-2 py-1 inline-block">
                {m.slug}.uppdragsutbildning.nu
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 mb-4">
                <div>
                  <div className="text-lg font-bold text-blue-600">{counts[m.id] ?? 0}</div>
                  <div className="text-xs text-slate-600">Kurser</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 capitalize">{m.access_mode}</div>
                  <div className="text-xs text-slate-600">Åtkomst</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  onClick={() => navigate(`/admin/marketplaces/${m.id}/edit`)}
                  className="px-3 py-1.5 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Redigera
                </button>
                <button
                  onClick={() => navigate(`/admin/marketplaces/${m.id}/branding`)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Palette className="w-3.5 h-3.5" />
                  Varumärke
                </button>
                {m.type === 'partner_curated' && (
                  <button
                    onClick={() => navigate(`/admin/marketplaces/${m.id}/curation`)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    Kurser
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {m.status !== 'active' && (
                  <button
                    onClick={() => handleStatusChange(m, 'active')}
                    className="flex-1 px-3 py-1.5 text-sm border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    Publicera
                  </button>
                )}
                {m.status !== 'paused' && (
                  <button
                    onClick={() => handleStatusChange(m, 'paused')}
                    className="flex-1 px-3 py-1.5 text-sm border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                  >
                    Pausa
                  </button>
                )}
                {m.status !== 'draft' && (
                  <button
                    onClick={() => handleStatusChange(m, 'draft')}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Utkast
                  </button>
                )}
                <button
                  onClick={() => handleDelete(m)}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                  title="Ta bort"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
