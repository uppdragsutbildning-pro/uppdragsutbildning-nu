import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { Loader2, ArrowLeft, Plus, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { Marketplace } from '../../../lib/marketplaces';

interface TrainingRow {
  id: string;
  title: string;
  provider_id: string;
  is_active: boolean;
  providerName?: string;
}

interface CurationRow {
  id: string;
  training_id: string;
}

export function MarketplaceCurationPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [allTrainings, setAllTrainings] = useState<TrainingRow[]>([]);
  const [curation, setCuration] = useState<CurationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyTrainingId, setBusyTrainingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: mp, error: mpError } = await supabase.from('marketplaces').select('*').eq('id', id).single();
      if (mpError || !mp) {
        toast.error('Kunde inte hämta marknadsplatsen', { description: mpError?.message });
        navigate('/admin');
        return;
      }
      setMarketplace(mp as Marketplace);

      const [{ data: trainings }, { data: providers }, { data: curated }] = await Promise.all([
        supabase.from('trainings').select('id, title, provider_id, is_active').order('title'),
        supabase.from('providers').select('id, name'),
        supabase
          .from('marketplace_trainings')
          .select('id, training_id')
          .eq('marketplace_id', id)
          .is('removed_at', null),
      ]);

      const providerNames: Record<string, string> = {};
      (providers ?? []).forEach((p) => (providerNames[p.id] = p.name));

      setAllTrainings(
        ((trainings ?? []) as TrainingRow[]).map((t) => ({ ...t, providerName: providerNames[t.provider_id] }))
      );
      setCuration((curated ?? []) as CurationRow[]);
      setLoading(false);
    }
    load();
  }, [id, navigate]);

  const curatedTrainingIds = useMemo(() => new Set(curation.map((c) => c.training_id)), [curation]);

  const filteredTrainings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allTrainings;
    return allTrainings.filter(
      (t) => t.title.toLowerCase().includes(q) || t.providerName?.toLowerCase().includes(q)
    );
  }, [allTrainings, search]);

  const curatedTrainings = useMemo(
    () => allTrainings.filter((t) => curatedTrainingIds.has(t.id)),
    [allTrainings, curatedTrainingIds]
  );

  async function handleAdd(trainingId: string) {
    if (!id) return;
    setBusyTrainingId(trainingId);
    try {
      const { data, error } = await supabase
        .from('marketplace_trainings')
        .insert({ marketplace_id: id, training_id: trainingId })
        .select('id, training_id')
        .single();
      if (error) throw error;
      setCuration((prev) => [...prev, data as CurationRow]);
      toast.success('Kurs tillagd i marknadsplatsen');
    } catch (err) {
      toast.error('Kunde inte lägga till kursen', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyTrainingId(null);
    }
  }

  async function handleRemove(trainingId: string) {
    const row = curation.find((c) => c.training_id === trainingId);
    if (!row) return;
    setBusyTrainingId(trainingId);
    try {
      const { error } = await supabase
        .from('marketplace_trainings')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      setCuration((prev) => prev.filter((c) => c.id !== row.id));
      toast.success('Kurs borttagen från marknadsplatsen');
    } catch (err) {
      toast.error('Kunde inte ta bort kursen', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyTrainingId(null);
    }
  }

  if (loading || !marketplace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (marketplace.type !== 'partner_curated') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Tillbaka till admin
          </Link>
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-600">
            Kuratering är inte tillämpligt för leverantörsbutiker — de visar automatiskt alla publicerade
            kurser från leverantören.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Tillbaka till admin
        </Link>

        <h1 className="text-lg font-semibold text-slate-900 mb-1">Kurskuration</h1>
        <p className="text-sm text-slate-600 mb-6">{marketplace.name} — {curatedTrainings.length} kurser valda</p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="font-medium text-slate-900 mb-3">Hela kurskatalogen</h2>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök på titel eller leverantör..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto">
              {filteredTrainings.map((t) => {
                const curated = curatedTrainingIds.has(t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-900 truncate">
                        {t.title}
                        {!t.is_active && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-500 rounded">Utkast</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{t.providerName}</div>
                    </div>
                    <button
                      onClick={() => handleAdd(t.id)}
                      disabled={curated || busyTrainingId === t.id}
                      className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium transition-colors flex-shrink-0 ${
                        curated
                          ? 'bg-slate-100 text-slate-400 cursor-default'
                          : 'border border-blue-200 text-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {curated ? 'Tillagd' : 'Lägg till'}
                    </button>
                  </div>
                );
              })}
              {filteredTrainings.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">Inga kurser matchade sökningen</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="font-medium text-slate-900 mb-3">Aktuellt urval</h2>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto">
              {curatedTrainings.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-900 truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 truncate">{t.providerName}</div>
                  </div>
                  <button
                    onClick={() => handleRemove(t.id)}
                    disabled={busyTrainingId === t.id}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                    Ta bort
                  </button>
                </div>
              ))}
              {curatedTrainings.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">Inga kurser valda ännu</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
