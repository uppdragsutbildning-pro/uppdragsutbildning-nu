import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FileText, ExternalLink, CalendarX } from 'lucide-react';
import { useProviderContext } from '../../../contexts/ProviderContext';
import { supabase } from '../../../lib/supabase';

export function ProviderTermsSettingsPage() {
  const { selectedProviderId } = useProviderContext();
  const [termsText, setTermsText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyDays, setPolicyDays] = useState('');
  const [policyFee, setPolicyFee] = useState('');
  const [policyText, setPolicyText] = useState('');
  const [policyRegistered, setPolicyRegistered] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    if (!selectedProviderId) return;
    loadTerms(selectedProviderId);
  }, [selectedProviderId]);

  async function loadTerms(providerId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('providers')
      .select('terms_text, cancellation_policy')
      .eq('id', providerId)
      .single();

    if (error) {
      toast.error('Kunde inte hämta villkor');
    } else {
      setTermsText(data?.terms_text ?? '');
      const pol = data?.cancellation_policy as { free_until_days_before_start?: number; late_fee_percent?: number; text?: string } | null;
      setPolicyRegistered(pol?.free_until_days_before_start !== undefined && pol?.late_fee_percent !== undefined);
      setPolicyDays(pol?.free_until_days_before_start !== undefined ? String(pol.free_until_days_before_start) : '');
      setPolicyFee(pol?.late_fee_percent !== undefined ? String(pol.late_fee_percent) : '');
      setPolicyText(pol?.text ?? '');
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

  async function handleSavePolicy() {
    if (!selectedProviderId) return;
    setSavingPolicy(true);
    const { error } = await supabase.rpc('provider_update_cancellation_policy', {
      p_provider_id: selectedProviderId,
      p_free_until_days_before_start: Number(policyDays),
      p_late_fee_percent: Number(policyFee.replace(',', '.')),
      p_text: policyText || null,
    });
    setSavingPolicy(false);
    if (error) {
      toast.error('Kunde inte spara avbokningsreglerna', { description: error.message });
      return;
    }
    setPolicyRegistered(true);
    toast.success('Avbokningsreglerna är sparade', { description: 'De gäller för nya bokningar. Redan gjorda bokningar behåller sina villkor.' });
  }

  const policyValid =
    policyDays.trim() !== '' && Number.isInteger(Number(policyDays)) && Number(policyDays) >= 0 && Number(policyDays) <= 365 &&
    policyFee.trim() !== '' && Number(policyFee.replace(',', '.')) >= 0 && Number(policyFee.replace(',', '.')) <= 100;

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

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
            <CalendarX className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Avbokningsregler</h2>
            <p className="text-sm text-slate-500">
              Visas för köparen vid bokning och gäller nya bokningar. Redan gjorda bokningar behåller reglerna som gällde då.
            </p>
          </div>
        </div>
        {!policyRegistered && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            Ni har inte registrerat avbokningsregler än. Det krävs för att kunna publicera en ny kurs. Utkast kan sparas utan.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm text-slate-700">
            Fri avbokning till så många dagar före start
            <input
              inputMode="numeric"
              value={policyDays}
              onChange={(e) => setPolicyDays(e.target.value)}
              placeholder="t.ex. 14"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </label>
          <label className="text-sm text-slate-700">
            Avgift därefter, procent av priset
            <input
              inputMode="decimal"
              value={policyFee}
              onChange={(e) => setPolicyFee(e.target.value)}
              placeholder="t.ex. 50"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm text-slate-700 mt-4">
          Övrig information (valfri)
          <textarea
            rows={3}
            value={policyText}
            onChange={(e) => setPolicyText(e.target.value)}
            maxLength={2000}
            className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </label>
        <p className="text-xs text-slate-500 mt-2">
          Köparen kan avboka direkt fram till gränsen. Därefter skickar köparen en begäran som plattformen hanterar tillsammans med er.
        </p>
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSavePolicy}
            disabled={savingPolicy || !policyValid}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {savingPolicy ? 'Sparar...' : 'Spara avbokningsregler'}
          </button>
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
