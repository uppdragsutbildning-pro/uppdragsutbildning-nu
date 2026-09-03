import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { Loader2, ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { Marketplace } from '../../../lib/marketplaces';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

const emptyBranding = {
  logoUrl: '',
  heroImageUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#16a34a',
  tagline: '',
};

export function MarketplaceBrandingPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [branding, setBranding] = useState(emptyBranding);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: mp, error: mpError }, { data: br }] = await Promise.all([
        supabase.from('marketplaces').select('*').eq('id', id).single(),
        supabase.from('marketplace_branding').select('*').eq('marketplace_id', id).maybeSingle(),
      ]);
      if (mpError || !mp) {
        toast.error('Kunde inte hämta marknadsplatsen', { description: mpError?.message });
        navigate('/admin');
        return;
      }
      setMarketplace(mp as Marketplace);
      if (br) {
        setBranding({
          logoUrl: br.logo_url ?? '',
          heroImageUrl: br.hero_image_url ?? '',
          primaryColor: br.primary_color ?? emptyBranding.primaryColor,
          secondaryColor: br.secondary_color ?? emptyBranding.secondaryColor,
          tagline: br.tagline ?? '',
        });
      }
      setLoading(false);
    }
    load();
  }, [id, navigate]);

  async function uploadAsset(file: File, kind: 'logo' | 'hero', maxMb: number) {
    if (!id) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Endast bildfiler stöds');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error('Filen är för stor', { description: `Max ${maxMb}MB.` });
      return;
    }
    const setUploading = kind === 'logo' ? setUploadingLogo : setUploadingHero;
    setUploading(true);
    try {
      const extensionMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
      const extension = extensionMatch ? extensionMatch[0] : '.png';
      const path = `${id}/${kind}-${crypto.randomUUID()}${extension}`;
      const { error: uploadError } = await supabase.storage.from('marketplace-branding').upload(path, file);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('marketplace-branding').getPublicUrl(path);
      setBranding((prev) => ({
        ...prev,
        [kind === 'logo' ? 'logoUrl' : 'heroImageUrl']: data.publicUrl,
      }));
      toast.success(kind === 'logo' ? 'Logga uppladdad' : 'Hero-bild uppladdad');
    } catch (err) {
      console.error(err);
      toast.error('Kunde inte ladda upp filen', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (branding.primaryColor && !HEX_PATTERN.test(branding.primaryColor)) {
      toast.error('Ogiltig primärfärg', { description: 'Ange en hex-färg, t.ex. #2563eb' });
      return;
    }
    if (branding.secondaryColor && !HEX_PATTERN.test(branding.secondaryColor)) {
      toast.error('Ogiltig sekundärfärg', { description: 'Ange en hex-färg, t.ex. #16a34a' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('marketplace_branding').upsert({
        marketplace_id: id,
        logo_url: branding.logoUrl || null,
        hero_image_url: branding.heroImageUrl || null,
        primary_color: branding.primaryColor || null,
        secondary_color: branding.secondaryColor || null,
        tagline: branding.tagline || null,
      });
      if (error) throw error;
      toast.success('Varumärkning sparad');
      navigate('/admin');
    } catch (err) {
      toast.error('Kunde inte spara varumärkning', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !marketplace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till admin
        </Link>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h1 className="text-lg font-semibold text-slate-900 mb-1">Varumärkning</h1>
            <p className="text-sm text-slate-600 mb-6">{marketplace.name} — {marketplace.slug}.uppdragsutbildning.nu</p>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Logga (SVG/PNG, transparent, max 2MB)</label>
                <div className="flex items-center gap-3">
                  {branding.logoUrl && (
                    <img src={branding.logoUrl} alt="Logga" className="w-12 h-12 object-contain border border-slate-200 rounded-lg bg-slate-50" />
                  )}
                  <label className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm cursor-pointer">
                    {uploadingLogo ? 'Laddar upp...' : 'Välj fil'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingLogo}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) uploadAsset(file, 'logo', 2);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Hero-bild (JPG/PNG, 1600×600, max 5MB)</label>
                <div className="flex items-center gap-3">
                  {branding.heroImageUrl ? (
                    <img src={branding.heroImageUrl} alt="Hero" className="w-20 h-8 object-cover border border-slate-200 rounded-lg" />
                  ) : (
                    <div className="w-20 h-8 flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50">
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <label className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-sm cursor-pointer">
                    {uploadingHero ? 'Laddar upp...' : 'Välj fil'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingHero}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) uploadAsset(file, 'hero', 5);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Primärfärg</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_PATTERN.test(branding.primaryColor) ? branding.primaryColor : '#2563eb'}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      className="w-10 h-10 border border-slate-200 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="#2563eb"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sekundärfärg</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_PATTERN.test(branding.secondaryColor) ? branding.secondaryColor : '#16a34a'}
                      onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                      className="w-10 h-10 border border-slate-200 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={branding.secondaryColor}
                      onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="#16a34a"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tagline</label>
                <input
                  type="text"
                  value={branding.tagline}
                  onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Kompetensutveckling för TRR:s anslutna företag"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
              >
                {saving ? 'Sparar...' : 'Spara varumärkning'}
              </button>
              <button
                onClick={() => navigate('/admin')}
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Avbryt
              </button>
            </div>
          </div>

          {/* Live-förhandsgranskning */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-fit">
            <div className="px-4 py-2 text-xs font-medium text-slate-500 border-b border-slate-200">
              Förhandsgranskning
            </div>
            <div
              className="relative h-40 bg-slate-100 bg-cover bg-center flex flex-col justify-end p-4"
              style={branding.heroImageUrl ? { backgroundImage: `url(${branding.heroImageUrl})` } : undefined}
            >
              <div className="absolute inset-0 bg-black/30" />
              <div className="relative flex items-center gap-2 mb-1">
                {branding.logoUrl && (
                  <img src={branding.logoUrl} alt="Logga" className="w-8 h-8 object-contain bg-white rounded p-1" />
                )}
                <span className="text-white font-semibold">{marketplace.name}</span>
              </div>
              {branding.tagline && <p className="relative text-white/90 text-sm">{branding.tagline}</p>}
            </div>
            <div className="p-4 space-y-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: HEX_PATTERN.test(branding.primaryColor) ? branding.primaryColor : '#2563eb' }}
              >
                Begär offert
              </button>
              <button
                type="button"
                className="ml-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: HEX_PATTERN.test(branding.secondaryColor) ? branding.secondaryColor : '#16a34a' }}
              >
                Boka nu
              </button>
              <p className="text-xs text-slate-400 pt-2">
                Faktisk rendering byggs i Paket C (subdomän-routing & theming).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
