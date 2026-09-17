import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { FileText, ArrowLeft } from 'lucide-react';
import { supabase, Provider } from '../../../lib/supabase';

export function ProviderTermsPage() {
  const { id } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadProvider(id);
  }, [id]);

  async function loadProvider(providerId: string) {
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
    } else {
      setProvider(data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !provider) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Leverantören hittades inte</h1>
          <p className="text-slate-600 mb-6">Kontrollera länken eller kontakta leverantören direkt.</p>
          <Link to="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
            <ArrowLeft className="w-4 h-4" /> Till startsidan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Villkor från</p>
              <h1 className="text-xl font-bold text-slate-900">{provider.name}</h1>
            </div>
          </div>

          {provider.terms_text?.trim() ? (
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {provider.terms_text}
            </div>
          ) : (
            <p className="text-slate-500 italic">
              Leverantören har inte angett några villkor än. Kontakta leverantören direkt vid frågor.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
