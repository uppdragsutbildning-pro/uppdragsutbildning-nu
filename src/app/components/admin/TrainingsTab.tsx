import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabaseClient';
import { getPaginationRange } from '../../../hooks/usePaginatedQuery';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../ui/pagination';

// Adminens Utbildningar (steg 1): riktig data, fritextsök, fasetterade filter, sortering och
// paginering. Allt filtreras i webbläsaren (några hundra kurser räcker gott). Filtren ligger i
// URL:en så att en vy går att länka. Redigering/publicering/anmälningar kommer i steg 2–3.

interface StartRow {
  id: string;
  start_date: string;
  status: string;
  available_spots: number;
  max_participants: number;
}
interface TrainingRow {
  id: string;
  slug: string;
  title: string;
  course_code: string | null;
  is_active: boolean;
  featured: boolean;
  is_popular: boolean;
  format: string;
  training_type: string;
  provider_id: string;
  category_id: string;
  ssyk_skills: unknown;
  instructor_name: string | null;
  views: number;
  leads: number;
  created_at: string;
  updated_at: string;
  providers: { name: string } | null;
  categories: { name: string } | null;
  scheduled_starts: StartRow[] | null;
  marketplace_trainings: { marketplace_id: string; removed_at: string | null }[] | null;
}
interface MarketplaceRow {
  id: string;
  name: string;
  type: string;
  status: string;
  provider_id: string | null;
}
interface AppRow {
  training_id: string;
  status: string;
}

interface Row extends TrainingRow {
  nextStart: string | null;
  upcomingCount: number;
  spotsLeft: number;
  spotsMax: number;
  almostFull: boolean;
  isFull: boolean;
  appTotal: number;
  appNew: number;
  appConfirmed: number;
  marketplaceIds: string[];
  tagged: boolean;
  searchText: string;
}

const NEW_STATUSES = ['new', 'pending', 'submitted'];
const PAGE_SIZE = 25;
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (d: string) => Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000);

const FORMAT_LABEL: Record<string, string> = { online: 'Online', hybrid: 'Hybrid', onsite: 'Onsite', 'on-site': 'Onsite' };
const fmt = (f: string) => FORMAT_LABEL[f?.toLowerCase()] ?? f;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('sv-SE') : '–');

type SortKey = 'title' | 'provider' | 'status' | 'nextStart' | 'apps' | 'updated';

const QUICK: { key: string; label: string; params: Record<string, string> }[] = [
  { key: 'unpub', label: 'Ej publicerade', params: { status: 'unpublished' } },
  { key: 'nostart', label: 'Publicerad utan kursstart', params: { status: 'published', start: 'none' } },
  { key: 'soon', label: 'Startar inom 30 dagar', params: { start: 'soon' } },
  { key: 'newapps', label: 'Obehandlade anmälningar', params: { apps: 'new' } },
  { key: 'untagged', label: 'Ej SSYK-taggad', params: { tagged: 'no' } },
];

const FILTER_KEYS = ['status', 'provider', 'category', 'marketplace', 'format', 'type', 'start', 'apps', 'spots', 'tagged', 'featured'];

export function TrainingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trainings, setTrainings] = useState<TrainingRow[]>([]);
  const [marketplaces, setMarketplaces] = useState<MarketplaceRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updated', dir: 'desc' });
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const get = (k: string) => searchParams.get(k) ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v);
    else next.delete(k);
    setSearchParams(next, { replace: true });
    setPage(1);
  };
  const applyQuick = (params: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    FILTER_KEYS.forEach(k => next.delete(k));
    Object.entries(params).forEach(([k, v]) => next.set(k, v));
    setSearchParams(next, { replace: true });
    setPage(1);
  };
  const clearAll = () => {
    const next = new URLSearchParams(searchParams);
    [...FILTER_KEYS, 'q'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });
    setQuery('');
    setPage(1);
  };

  // Debounce för fritextsökningen så att URL:en inte skrivs om för varje tangenttryck.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((searchParams.get('q') ?? '') !== query) setParam('q', query);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [t, m, a] = await Promise.all([
        supabase
          .from('trainings')
          .select(
            'id, slug, title, course_code, is_active, featured, is_popular, format, training_type, provider_id, category_id, ssyk_skills, instructor_name, views, leads, created_at, updated_at, providers(name), categories(name), scheduled_starts(id, start_date, status, available_spots, max_participants), marketplace_trainings(marketplace_id, removed_at)'
          )
          .order('updated_at', { ascending: false })
          .limit(2000),
        supabase.from('marketplaces').select('id, name, type, status, provider_id'),
        supabase.from('applications').select('training_id, status').limit(20000),
      ]);
      if (!active) return;
      if (t.error) {
        setError(t.error.message);
      } else {
        setTrainings((t.data ?? []) as unknown as TrainingRow[]);
        setMarketplaces((m.data ?? []) as MarketplaceRow[]);
        setApps((a.data ?? []) as AppRow[]);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    const appsBy = new Map<string, AppRow[]>();
    apps.forEach(a => appsBy.set(a.training_id, [...(appsBy.get(a.training_id) ?? []), a]));
    const storefrontsByProvider = new Map<string, string[]>();
    marketplaces
      .filter(m => m.type === 'provider_storefront' && m.provider_id)
      .forEach(m => storefrontsByProvider.set(m.provider_id!, [...(storefrontsByProvider.get(m.provider_id!) ?? []), m.id]));
    const t0 = today();
    return trainings.map(t => {
      const upcoming = (t.scheduled_starts ?? []).filter(s => s.start_date >= t0).sort((a, b) => a.start_date.localeCompare(b.start_date));
      const spotsLeft = upcoming.reduce((n, s) => n + s.available_spots, 0);
      const spotsMax = upcoming.reduce((n, s) => n + s.max_participants, 0);
      const full = upcoming.length > 0 && upcoming.every(s => s.status === 'full' || s.available_spots <= 0);
      const almost = !full && upcoming.some(s => s.status === 'few_spots' || (s.max_participants > 0 && s.available_spots / s.max_participants <= 0.2));
      const myApps = appsBy.get(t.id) ?? [];
      const mp = new Set<string>([
        ...(t.marketplace_trainings ?? []).filter(x => !x.removed_at).map(x => x.marketplace_id),
        ...(storefrontsByProvider.get(t.provider_id) ?? []),
      ]);
      const skills = Array.isArray(t.ssyk_skills) ? t.ssyk_skills : [];
      return {
        ...t,
        nextStart: upcoming[0]?.start_date ?? null,
        upcomingCount: upcoming.length,
        spotsLeft,
        spotsMax,
        almostFull: almost,
        isFull: full,
        appTotal: myApps.length,
        appNew: myApps.filter(a => NEW_STATUSES.includes(a.status)).length,
        appConfirmed: myApps.filter(a => a.status === 'confirmed').length,
        marketplaceIds: [...mp],
        tagged: skills.length > 0,
        searchText: [t.title, t.course_code, t.providers?.name, t.categories?.name, t.instructor_name, JSON.stringify(skills)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    });
  }, [trainings, apps, marketplaces]);

  const providerOptions = useMemo(() => {
    const m = new Map<string, string>();
    trainings.forEach(t => m.set(t.provider_id, t.providers?.name ?? 'Okänd'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'sv'));
  }, [trainings]);
  const categoryOptions = useMemo(() => {
    const m = new Map<string, string>();
    trainings.forEach(t => m.set(t.category_id, t.categories?.name ?? 'Okänd'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'sv'));
  }, [trainings]);
  const typeOptions = useMemo(() => [...new Set(trainings.map(t => t.training_type).filter(Boolean))].sort(), [trainings]);
  const formatOptions = useMemo(() => [...new Set(trainings.map(t => t.format).filter(Boolean))].sort(), [trainings]);

  const filtered = useMemo(() => {
    const q = (searchParams.get('q') ?? '').trim().toLowerCase();
    const f = Object.fromEntries(FILTER_KEYS.map(k => [k, searchParams.get(k) ?? '']));
    return rows.filter(r => {
      if (q && !q.split(/\s+/).every(w => r.searchText.includes(w))) return false;
      if (f.status === 'published' && !r.is_active) return false;
      if (f.status === 'unpublished' && r.is_active) return false;
      if (f.provider && r.provider_id !== f.provider) return false;
      if (f.category && r.category_id !== f.category) return false;
      if (f.format && r.format !== f.format) return false;
      if (f.type && r.training_type !== f.type) return false;
      if (f.marketplace === 'none') {
        if (r.marketplaceIds.length > 0) return false;
      } else if (f.marketplace && !r.marketplaceIds.includes(f.marketplace)) return false;
      if (f.start === 'has' && r.upcomingCount === 0) return false;
      if (f.start === 'none' && r.upcomingCount > 0) return false;
      if (f.start === 'soon' && !(r.nextStart && daysUntil(r.nextStart) <= 30)) return false;
      if (f.apps === 'new' && r.appNew === 0) return false;
      if (f.apps === 'any' && r.appTotal === 0) return false;
      if (f.apps === 'none' && r.appTotal > 0) return false;
      if (f.spots === 'almost' && !r.almostFull) return false;
      if (f.spots === 'full' && !r.isFull) return false;
      if (f.spots === 'available' && !(r.upcomingCount > 0 && !r.isFull && !r.almostFull)) return false;
      if (f.tagged === 'yes' && !r.tagged) return false;
      if (f.tagged === 'no' && r.tagged) return false;
      if (f.featured === 'yes' && !(r.featured || r.is_popular)) return false;
      return true;
    });
  }, [rows, searchParams]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (r: Row): string | number => {
      switch (sort.key) {
        case 'title': return r.title.toLowerCase();
        case 'provider': return (r.providers?.name ?? '').toLowerCase();
        case 'status': return r.is_active ? 1 : 0;
        case 'nextStart': return r.nextStart ?? '9999-12-31';
        case 'apps': return r.appNew * 1000 + r.appTotal;
        case 'updated': return r.updated_at;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const activeFilterCount = FILTER_KEYS.filter(k => get(k)).length + (get('q') ? 1 : 0);
  const publishedCount = rows.filter(r => r.is_active).length;

  const [busyId, setBusyId] = useState<string | null>(null);
  const togglePublished = async (r: Row) => {
    const publish = !r.is_active;
    if (publish && !r.tagged && !window.confirm('Kursen saknar SSYK-kompetenser. Publicera ändå?')) return;
    if (!publish && !window.confirm(`Avpublicera "${r.title}"? Kursen försvinner ur katalogen och från marknadsplatser.`)) return;
    setBusyId(r.id);
    const { error: err } = await supabase.from('trainings').update({ is_active: publish }).eq('id', r.id);
    setBusyId(null);
    if (err) {
      // Databasen stoppar publicering när lärosätet saknar avbokningsvillkor.
      toast.error(err.message.includes('avbokningsvillkor') ? 'Lärosätet har inte registrerat avbokningsvillkor, så kursen kan inte publiceras' : 'Kunde inte ändra status', { description: err.message });
      return;
    }
    setTrainings(prev => prev.map(t => (t.id === r.id ? { ...t, is_active: publish, updated_at: new Date().toISOString() } : t)));
    toast.success(publish ? 'Kursen är publicerad' : 'Kursen är avpublicerad');
  };

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'updated' || key === 'apps' ? 'desc' : 'asc' }));

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const mpName = (id: string) => marketplaces.find(m => m.id === id)?.name ?? id;
    const head = ['Titel', 'Kurskod', 'Leverantör', 'Kategori', 'Format', 'Typ', 'Publicerad', 'Nästa start', 'Kommande starter', 'Lediga platser', 'Anmälningar', 'Obehandlade', 'Marknadsplatser', 'SSYK-taggad', 'Uppdaterad'];
    const lines = sorted.map(r =>
      [r.title, r.course_code, r.providers?.name, r.categories?.name, fmt(r.format), r.training_type, r.is_active ? 'Ja' : 'Nej', r.nextStart, r.upcomingCount, r.spotsLeft, r.appTotal, r.appNew, r.marketplaceIds.map(mpName).join('; '), r.tagged ? 'Ja' : 'Nej', fmtDate(r.updated_at)].map(esc).join(',')
    );
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `utbildningar-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`${sorted.length} utbildningar exporterade`);
  };

  const select = 'px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const SortHead = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-3 text-left font-medium text-slate-600 ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
        {children}
        {sort.key === k ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
      </button>
    </th>
  );

  if (loading) return <p className="text-sm text-slate-500">Laddar utbildningar…</p>;
  if (error) return <p className="text-sm text-red-600">Kunde inte hämta utbildningar: {error}</p>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Alla utbildningar</h2>
          <p className="text-sm text-slate-600">
            {rows.length} utbildningar, {publishedCount} publicerade, {rows.length - publishedCount} ej publicerade
          </p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-sm font-medium text-slate-700">
          <Download className="w-4 h-4" />
          Exportera ({sorted.length})
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK.map(q => {
          const on = Object.entries(q.params).every(([k, v]) => get(k) === v);
          return (
            <button
              key={q.key}
              onClick={() => (on ? clearAll() : applyQuick(q.params))}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök på titel, kurskod, leverantör, kategori, instruktör eller kompetens…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className={select} value={get('status')} onChange={e => setParam('status', e.target.value)} aria-label="Status">
            <option value="">Alla statusar</option>
            <option value="published">Publicerad</option>
            <option value="unpublished">Ej publicerad</option>
          </select>
          <select className={select} value={get('provider')} onChange={e => setParam('provider', e.target.value)} aria-label="Leverantör">
            <option value="">Alla leverantörer</option>
            {providerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className={select} value={get('marketplace')} onChange={e => setParam('marketplace', e.target.value)} aria-label="Marknadsplats">
            <option value="">Alla marknadsplatser</option>
            <option value="none">Endast öppna katalogen</option>
            {marketplaces.map(m => <option key={m.id} value={m.id}>{m.name}{m.type === 'provider_storefront' ? ' (egen butik)' : ''}</option>)}
          </select>
          <select className={select} value={get('category')} onChange={e => setParam('category', e.target.value)} aria-label="Kategori">
            <option value="">Alla kategorier</option>
            {categoryOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className={select} value={get('format')} onChange={e => setParam('format', e.target.value)} aria-label="Format">
            <option value="">Alla format</option>
            {formatOptions.map(f => <option key={f} value={f}>{fmt(f)}</option>)}
          </select>
          <select className={select} value={get('type')} onChange={e => setParam('type', e.target.value)} aria-label="Typ">
            <option value="">Alla typer</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={select} value={get('start')} onChange={e => setParam('start', e.target.value)} aria-label="Kursstart">
            <option value="">Kursstart: alla</option>
            <option value="has">Har kommande start</option>
            <option value="none">Saknar kommande start</option>
            <option value="soon">Startar inom 30 dagar</option>
          </select>
          <select className={select} value={get('apps')} onChange={e => setParam('apps', e.target.value)} aria-label="Anmälningar">
            <option value="">Anmälningar: alla</option>
            <option value="new">Har obehandlade</option>
            <option value="any">Har anmälningar</option>
            <option value="none">Inga anmälningar</option>
          </select>
          <select className={select} value={get('spots')} onChange={e => setParam('spots', e.target.value)} aria-label="Platser">
            <option value="">Platser: alla</option>
            <option value="available">Lediga platser</option>
            <option value="almost">Nästan fullt</option>
            <option value="full">Fullt</option>
          </select>
          <select className={select} value={get('tagged')} onChange={e => setParam('tagged', e.target.value)} aria-label="SSYK-taggning">
            <option value="">SSYK-taggning: alla</option>
            <option value="yes">Taggad</option>
            <option value="no">Ej taggad</option>
          </select>
          <select className={select} value={get('featured')} onChange={e => setParam('featured', e.target.value)} aria-label="Utvald">
            <option value="">Utvald/populär: alla</option>
            <option value="yes">Utvald eller populär</option>
          </select>
          {activeFilterCount > 0 && (
            <button onClick={clearAll} className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-900">
              <X className="w-4 h-4" />
              Rensa ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500 mb-2">{sorted.length} av {rows.length} utbildningar</p>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <SortHead k="title">Utbildning</SortHead>
              <SortHead k="provider">Leverantör</SortHead>
              <SortHead k="status">Status</SortHead>
              <SortHead k="nextStart">Nästa start</SortHead>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Platser</th>
              <SortHead k="apps">Anmälningar</SortHead>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Marknadsplatser</th>
              <SortHead k="updated">Uppdaterad</SortHead>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">Inga utbildningar matchar filtren.</td>
              </tr>
            )}
            {pageRows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 max-w-xs">
                  <Link to={`/admin/trainings/${r.id}/edit`} className="font-medium text-slate-900 hover:text-blue-600 truncate block">{r.title}</Link>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                    <span>{r.categories?.name}</span>
                    <span>{fmt(r.format)}</span>
                    {r.featured && <span className="text-amber-700">Utvald</span>}
                    {!r.tagged && <span className="text-slate-400">Ej taggad</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.providers?.name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => togglePublished(r)}
                    disabled={busyId === r.id}
                    title={r.is_active ? 'Avpublicera' : 'Publicera'}
                    className={`px-2 py-0.5 rounded-full text-xs border disabled:opacity-50 ${r.is_active ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {r.is_active ? 'Publicerad' : 'Ej publicerad'}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                  {r.nextStart ? fmtDate(r.nextStart) : <span className="text-slate-400">Ingen</span>}
                  {r.upcomingCount > 1 && <span className="text-xs text-slate-500"> (+{r.upcomingCount - 1})</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.upcomingCount === 0 ? (
                    <span className="text-slate-400">–</span>
                  ) : (
                    <span className={r.isFull ? 'text-red-600' : r.almostFull ? 'text-amber-700' : 'text-slate-700'}>
                      {r.spotsMax - r.spotsLeft}/{r.spotsMax}
                      {r.isFull ? ' fullt' : r.almostFull ? ' nästan fullt' : ''}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                  {r.appTotal}
                  {r.appNew > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-xs">{r.appNew} nya</span>}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-[12rem]">
                  {r.marketplaceIds.length === 0 ? (
                    <span className="text-slate-400">Öppen</span>
                  ) : (
                    <span className="truncate block">{r.marketplaceIds.map(id => marketplaces.find(m => m.id === id)?.name).filter(Boolean).join(', ')}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                <td className="px-4 py-3">
                  <a href={`/kurs/${r.slug}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600" aria-label="Öppna kurssidan">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" onClick={e => { e.preventDefault(); setPage(Math.max(1, pageClamped - 1)); }} className={pageClamped === 1 ? 'pointer-events-none opacity-40' : ''} />
            </PaginationItem>
            {getPaginationRange(pageClamped, totalPages).map((p, i) =>
              p === 'ellipsis' ? (
                <PaginationItem key={`e-${i}`}><PaginationEllipsis /></PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink href="#" isActive={p === pageClamped} onClick={e => { e.preventDefault(); setPage(p); }}>{p}</PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext href="#" onClick={e => { e.preventDefault(); setPage(Math.min(totalPages, pageClamped + 1)); }} className={pageClamped === totalPages ? 'pointer-events-none opacity-40' : ''} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
