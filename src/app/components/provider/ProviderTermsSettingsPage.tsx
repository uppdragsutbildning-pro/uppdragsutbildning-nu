import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FileText, ExternalLink } from 'lucide-react';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase } from '../../../lib/supabase';

export function ProviderTermsSettingsPage() {
  const { selectedProviderId } = useProviderContext();
  const [termsText, setTermsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedProviderId) return;
    loadTerms(selectedProviderId);
  }, [selectedProviderId]);

  async function loadTerms(providerId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('providers')
      .select('terms_text')
      .eq('id', providerId)
      .single();

    if (error) {
      toast.error('Kunde inte hämta villkor');
    } else {
      setTermsText(data?.terms_text ?? '');
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!selectedProviderId) return;
    setSaving(true);
    const { error } = await supabase.rpc('update_provider_terms', {
      target_provider_id: selectedProviderId,
      new_terms_text: termsText,
    });
    setSaving(false);

    if (error) {
      toast.error('Kunde inte spara villkoren');
    } else {
      toast.success('Villkoren har sparats');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Villkor</h1>
          <p className="text-sm text-slate-500">
            Visas för deltagare i mejlet "Anmälan bekräftad" och på en publik sida.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <label htmlFor="terms" className="block text-sm font-medium text-slate-700 mb-2">
          Villkorstext
        </label>
        <textarea
          id="terms"
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
          rows={14}
          placeholder="T.ex. avbokningsregler, betalningsvillkor, force majeure..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />

        <div className="flex items-center justify-between mt-4">
          {selectedProviderId ? (
            <Link
              to={`/leverantor/${selectedProviderId}/villkor`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
            >
              Förhandsgranska publik sida <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <span />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  );
}
