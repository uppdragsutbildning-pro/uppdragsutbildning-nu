import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import {
  isSlugTaken,
  isValidSlug,
  MarketplaceType,
  MarketplaceStatus,
  MarketplaceAccessMode,
  PartnerOrganization,
} from '../../../lib/marketplaces';

interface Provider {
  id: string;
  name: string;
}

const emptyForm = {
  type: 'partner_curated' as MarketplaceType,
  name: '',
  slug: '',
  partnerOrganizationId: '',
  providerId: '',
  accessMode: 'open' as MarketplaceAccessMode,
  status: 'draft' as MarketplaceStatus,
};

export function MarketplaceFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [partnerOrgs, setPartnerOrgs] = useState<PartnerOrganization[]>([]);
  const [showNewPartnerOrg, setShowNewPartnerOrg] = useState(false);
  const [newPartnerOrgName, setNewPartnerOrgName] = useState('');
  const [creatingPartnerOrg, setCreatingPartnerOrg] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const [{ data: provs }, { data: orgs }] = await Promise.all([
        supabase.from('providers').select('id, name').order('name'),
        supabase.from('partner_organizations').select('*').order('name'),
      ]);
      setProviders((provs ?? []) as Provider[]);
      setPartnerOrgs((orgs ?? []) as PartnerOrganization[]);
    }
    loadOptions();
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    async function loadMarketplace() {
      const { data, error } = await supabase.from('marketplaces').select('*').eq('id', id).single();
      if (error || !data) {
        toast.error('Kunde inte hämta marknadsplatsen', { description: error?.message });
        navigate('/admin');
        return;
      }
      setFormData({
        type: data.type as MarketplaceType,
        name: data.name,
        slug: data.slug,
        partnerOrganizationId: data.partner_organization_id ?? '',
        providerId: data.provider_id ?? '',
        accessMode: data.access_mode as MarketplaceAccessMode,
        status: data.status as MarketplaceStatus,
      });
      setLoading(false);
    }
    loadMarketplace();
  }, [id, isEdit, navigate]);

  async function checkSlug(slug: string) {
    if (!slug) {
      setSlugError(null);
      return;
    }
    if (!isValidSlug(slug)) {
      setSlugError('Endast a-z, 0-9 och bindestreck, minst 2 tecken');
      return;
    }
    setCheckingSlug(true);
    try {
      const taken = await isSlugTaken(slug, id);
      setSlugError(taken ? 'Denna subdomän är redan upptagen' : null);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingSlug(false);
    }
  }

  async function handleCreatePartnerOrg() {
    if (!newPartnerOrgName.trim()) return;
    setCreatingPartnerOrg(true);
    try {
      const { data, error } = await supabase
        .from('partner_organizations')
        .insert({ name: newPartnerOrgName.trim() })
        .select('*')
        .single();
      if (error) throw error;
      setPartnerOrgs((prev) => [...prev, data as PartnerOrganization]);
      setFormData((prev) => ({ ...prev, partnerOrganizationId: data.id }));
      setNewPartnerOrgName('');
      setShowNewPartnerOrg(false);
      toast.success('Partnerorganisation skapad');
    } catch (err) {
      toast.error('Kunde inte skapa partnerorganisation', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingPartnerOrg(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValidSlug(formData.slug)) {
      toast.error('Ogiltig subdomän', { description: 'Endast a-z, 0-9 och bindestreck, minst 2 tecken' });
      return;
    }
    if (formData.type === 'partner_curated' && !formData.partnerOrganizationId) {
      toast.error('Välj en partnerorganisation');
      return;
    }
    if (formData.type === 'provider_storefront' && !formData.providerId) {
      toast.error('Välj en leverantör');
      return;
    }

    setSaving(true);
    try {
      const taken = await isSlugTaken(formData.slug, id);
      if (taken) {
        setSlugError('Denna subdomän är redan upptagen');
        setSaving(false);
        return;
      }

      const payload = {
        type: formData.type,
        name: formData.name,
        slug: formData.slug,
        owner_type: formData.type === 'partner_curated' ? 'partner_organization' : 'provider',
        partner_organization_id: formData.type === 'partner_curated' ? formData.partnerOrganizationId : null,
        provider_id: formData.type === 'provider_storefront' ? formData.providerId : null,
        access_mode: formData.accessMode,
        status: formData.status,
      };

      let marketplaceId = id;
      if (isEdit) {
        const { error } = await supabase.from('marketplaces').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('marketplaces').insert(payload).select('id').single();
        if (error) throw error;
        marketplaceId = data.id;
      }

      toast.success(isEdit ? 'Marknadsplats uppdaterad' : 'Marknadsplats skapad');
      navigate(isEdit ? '/admin' : `/admin/marketplaces/${marketplaceId}/branding`);
    } catch (err) {
      console.error(err);
      toast.error('Något gick fel', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till admin
        </Link>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h1 className="text-lg font-semibold text-slate-900 mb-1">
            {isEdit ? 'Redigera marknadsplats' : 'Skapa marknadsplats'}
          </h1>
          <p className="text-sm text-slate-600 mb-6">
            Varumärkt subdomän för en leverantör eller partnerorganisation
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Typ *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as MarketplaceType })}
                disabled={isEdit}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="partner_curated">Partnermarknadsplats (kuraterat urval från flera leverantörer)</option>
                <option value="provider_storefront">Leverantörsbutik (en leverantörs egna kurser)</option>
              </select>
              {isEdit && <p className="text-xs text-slate-500 mt-1">Typ kan inte ändras efter skapande.</p>}
            </div>

            {formData.type === 'partner_curated' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Partnerorganisation *</label>
                <div className="flex gap-2">
                  <select
                    value={formData.partnerOrganizationId}
                    onChange={(e) => setFormData({ ...formData, partnerOrganizationId: e.target.value })}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Välj partnerorganisation...</option>
                    {partnerOrgs.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewPartnerOrg((v) => !v)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm whitespace-nowrap"
                  >
                    + Ny partner
                  </button>
                </div>
                {showNewPartnerOrg && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newPartnerOrgName}
                      onChange={(e) => setNewPartnerOrgName(e.target.value)}
                      placeholder="Partnerorganisationens namn"
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleCreatePartnerOrg}
                      disabled={creatingPartnerOrg || !newPartnerOrgName.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors text-sm"
                    >
                      {creatingPartnerOrg ? 'Skapar...' : 'Skapa'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Leverantör *</label>
                <select
                  value={formData.providerId}
                  onChange={(e) => setFormData({ ...formData, providerId: e.target.value })}
                  disabled={isEdit}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                  required
                >
                  <option value="">Välj leverantör...</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Visningsnamn *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="TRR Karriärstöd"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Subdomän (slug) *</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setFormData({ ...formData, slug });
                  }}
                  onBlur={() => checkSlug(formData.slug)}
                  className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 font-mono text-sm ${
                    slugError ? 'border-red-300 focus:ring-red-400' : 'border-slate-200 focus:ring-blue-500'
                  }`}
                  placeholder="trr"
                  required
                />
                <span className="text-sm text-slate-500 whitespace-nowrap">.uppdragsutbildning.nu</span>
              </div>
              {checkingSlug && <p className="text-xs text-slate-500 mt-1">Kontrollerar tillgänglighet...</p>}
              {slugError && <p className="text-xs text-red-600 mt-1">{slugError}</p>}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Åtkomst</label>
                <select
                  value={formData.accessMode}
                  onChange={(e) => setFormData({ ...formData, accessMode: e.target.value as MarketplaceAccessMode })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Öppen katalog, inloggning krävs för RFP/bokning</option>
                  <option value="gated">Kräver inloggning för hela katalogen</option>
                  <option value="mixed">Blandat (avgörs per innehåll)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as MarketplaceStatus })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="draft">Utkast</option>
                  <option value="active">Aktiv</option>
                  <option value="paused">Pausad</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving || !!slugError || checkingSlug}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Sparar...' : isEdit ? 'Spara ändringar' : 'Skapa och fortsätt till varumärkning'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
