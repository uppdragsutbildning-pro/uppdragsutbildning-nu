import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Filter, X, GraduationCap, TrendingUp, ArrowRight, BookOpen, Sparkles, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { adaptTraining, adaptCategory, adaptProvider, type AdaptedTraining, type AdaptedCategory, type AdaptedProvider } from '../../../lib/marketplaceAdapters';
import { providerLogos } from '../../data/providerLogos';
import { usePaginatedQuery, getPaginationRange } from '../../../hooks/usePaginatedQuery';
import { useMarketplace } from '../../../lib/marketplaceContext';
import { getMarketplaceTrainingIds } from '../../../lib/marketplaces';
import { NEED_CHIPS, searchTokens } from '../../../lib/searchSuggestions';
import {
  WEAK_RESULTS_THRESHOLD,
  buildRequestUrl,
  NoResultsRequestBlock,
  WeakResultsRequestCard,
  PermanentRequestLink,
} from './CustomTrainingPrompt';
import {
  CatalogFilterGroups,
  EMPTY_FILTERS,
  buildActiveChips,
  countActiveFilters,
  isStartFilterActive,
  type CatalogFilters,
} from './CatalogFilters';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../ui/pagination';

const PAGE_SIZE = 12;

interface UpcomingStart {
  training_id: string;
  start_date: string;
  price: number | null;
  available_spots: number | null;
  location: string | null;
  language: string | null;
}

type SortBy = 'relevance' | 'popular' | 'leads' | 'newest';

// Antal sökord (efter rensning av småord) vid vilket fler än ett måste träffa för att en kurs ska visas.
const MIN_TOKENS_FOR_STRICT_MATCH = 3;

// Sidan Matchande utbildningar: köparen börjar alltid med en sökning, och den här sidan är
// träfflistan (med omsökning och filter). Utan sökning och utan filter visas bara sökfältet.
// På en partnermarknadsplats är det kuraterade urvalet själva butiken och visas alltid.
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<AdaptedCategory[]>([]);
  const [providers, setProviders] = useState<AdaptedProvider[]>([]);
  const { marketplace, loading: marketplaceLoading } = useMarketplace();
  const [scopedTrainingIds, setScopedTrainingIds] = useState<string[] | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
  // null = ingen begränsning (öppen katalog/marknadsplats). Annars id:n för
  // kategorier/leverantörer som faktiskt förekommer i marknadsplatsens
  // kuraterade urval, så filtren inte visar val som ändå ger 0 träffar.
  const [scopedCategoryIds, setScopedCategoryIds] = useState<Set<string> | null>(null);
  const [scopedProviderIds, setScopedProviderIds] = useState<Set<string> | null>(null);

  const [filters, setFilters] = useState<CatalogFilters>(() => ({
    ...EMPTY_FILTERS,
    categories: searchParams.get('category')?.split(',').filter(Boolean) ?? [],
  }));
  const [sortBy, setSortBy] = useState<SortBy>('relevance');
  const searchQuery = searchParams.get('q') || '';
  const [queryInput, setQueryInput] = useState(searchQuery);
  const [upcomingStarts, setUpcomingStarts] = useState<UpcomingStart[] | null>(null);

  useEffect(() => {
    setQueryInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('categories').select('*').order('name');
      if (data) setCategories(data.map(adaptCategory));
    })();
    (async () => {
      const { data } = await supabase.from('providers').select('*').eq('is_active', true).order('name');
      if (data) setProviders(data.map(adaptProvider));
    })();
    // Kommande starter styr filtren period, lediga platser, ort, språk och kostnad.
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('scheduled_starts')
        .select('training_id, start_date, price, available_spots, location, language')
        .gte('start_date', today)
        .limit(2000);
      setUpcomingStarts((data ?? []) as UpcomingStart[]);
    })();
  }, []);

  // Scopar katalogen till en marknadsplats kuraterade/egna kurser när sidan
  // nås via en marknadsplats-kontext (subdomän eller ?via=), se Paket D i
  // docs/specs/partnermarknadsplatser.md avsnitt 13.
  useEffect(() => {
    if (marketplaceLoading) return;
    let active = true;
    (async () => {
      setScopeLoading(true);
      try {
        const ids = await getMarketplaceTrainingIds(marketplace);
        if (!active) return;
        setScopedTrainingIds(ids);

        if (ids === null) {
          setScopedCategoryIds(null);
          setScopedProviderIds(null);
        } else if (ids.length === 0) {
          setScopedCategoryIds(new Set());
          setScopedProviderIds(new Set());
        } else {
          const { data } = await supabase
            .from('trainings')
            .select('category_id, provider_id')
            .in('id', ids)
            .eq('is_active', true);
          if (!active) return;
          setScopedCategoryIds(new Set((data ?? []).map(t => t.category_id)));
          setScopedProviderIds(new Set((data ?? []).map(t => t.provider_id)));
        }
      } finally {
        if (active) setScopeLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [marketplace, marketplaceLoading]);

  const activeFiltersCount = countActiveFilters(filters);
  const startFilterActive = isStartFilterActive(filters);
  // Utan sökning och filter visas bara sökfältet (partnermarknadsplatsens urval visas alltid).
  const searchFirst = !marketplace && !searchQuery && activeFiltersCount === 0;

  // Alternativen för ort och språk kommer från de kommande starterna.
  const startOptions = useMemo(() => {
    const uniq = (values: (string | null)[]) =>
      [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) => a.localeCompare(b, 'sv'));
    // På en marknadsplats räknas bara starter för det kuraterade urvalet.
    const relevant =
      marketplace && scopedTrainingIds
        ? (upcomingStarts ?? []).filter(s => scopedTrainingIds.includes(s.training_id))
        : upcomingStarts ?? [];
    return {
      locations: uniq(relevant.map(s => s.location)),
      languages: uniq(relevant.map(s => s.language)),
    };
  }, [upcomingStarts, marketplace, scopedTrainingIds]);

  // Kurser som har minst en kommande start som uppfyller alla kursstartsfilter.
  const startMatchedIds = useMemo<string[] | null>(() => {
    if (!startFilterActive || upcomingStarts === null) return null;
    const limit = new Date();
    if (filters.period !== 'all') limit.setMonth(limit.getMonth() + Number(filters.period));
    const ids = new Set<string>();
    for (const s of upcomingStarts) {
      if (filters.period !== 'all' && new Date(s.start_date) > limit) continue;
      if (filters.availableSpots && !((s.available_spots ?? 0) > 0)) continue;
      if (filters.locations.length > 0 && !(s.location && filters.locations.includes(s.location))) continue;
      if (filters.languages.length > 0 && !(s.language && filters.languages.includes(s.language))) continue;
      if (filters.maxPrice !== null && !(s.price !== null && Number(s.price) <= filters.maxPrice)) continue;
      ids.add(s.training_id);
    }
    return [...ids];
  }, [startFilterActive, upcomingStarts, filters]);

  const startsReady = !startFilterActive || upcomingStarts !== null;

  const {
    rows: trainingRows,
    loading: trainingsLoading,
    page,
    setPage,
    totalPages,
    count,
  } = usePaginatedQuery<AdaptedTraining>({
    pageSize: PAGE_SIZE,
    deps: [filters, searchQuery, sortBy, scopedTrainingIds, scopeLoading, startMatchedIds, startsReady, searchFirst],
    queryFn: async ({ from, to }) => {
      // Ingen sökning ännu: visa bara sökfältet, hämta ingen lista.
      if (searchFirst) return { data: [], count: 0, error: null };
      // Marknadsplatsen är känd men scopningen (kuraterade/egna kurs-id:n)
      // har inte laddat klart än, eller marknadsplatsen har inget att visa
      // ännu (beslut #10) – visa tomt istället för att köra en okuraterad fråga.
      if (marketplace && (scopeLoading || (scopedTrainingIds && scopedTrainingIds.length === 0))) {
        return { data: [], count: 0, error: null };
      }
      if (!startsReady) return { data: [], count: 0, error: null };

      // Id-begränsning: marknadsplatsens urval och/eller kurser med matchande kommande start.
      let allowedIds: string[] | null = null;
      if (marketplace && scopedTrainingIds && scopedTrainingIds.length > 0) allowedIds = scopedTrainingIds;
      if (startMatchedIds) {
        allowedIds = allowedIds ? allowedIds.filter(id => startMatchedIds.includes(id)) : startMatchedIds;
      }
      if (allowedIds && allowedIds.length === 0) return { data: [], count: 0, error: null };

      let query = supabase
        .from('trainings')
        .select('*, providers(*), categories(*)', { count: 'exact' })
        .eq('is_active', true);

      if (allowedIds) query = query.in('id', allowedIds);
      if (filters.categories.length > 0) query = query.in('category_id', filters.categories);
      if (filters.formats.length > 0) query = query.in('format', filters.formats);
      if (filters.providers.length > 0) query = query.in('provider_id', filters.providers);
      if (filters.customizable) query = query.in('training_type', ['custom', 'both']);
      const tokens = searchQuery ? searchTokens(searchQuery) : [];
      if (searchQuery) {
        // Varje sökord söks för sig (en hel mening matchar sällan som en sammanhängande fras).
        const words = tokens.length > 0 ? tokens : [searchQuery.replace(/[%,()]/g, '').trim()];
        const conditions = words
          .filter(w => w.length > 0)
          .flatMap(w => [`title.ilike.%${w}%`, `description.ilike.%${w}%`, `target_audience.ilike.%${w}%`]);
        if (conditions.length > 0) query = query.or(conditions.join(','));
      }

      const order = sortBy === 'newest' ? 'created_at' : sortBy === 'leads' ? 'leads' : 'views';
      query = query.order(order, { ascending: false });

      // Flera sökord: rangordna efter hur många som träffar (titel väger tyngst) och kräv minst två
      // träffande ord vid längre meningar, så att en enstaka vanlig stam inte matchar hela utbudet.
      // Urvalet är litet nog att rangordnas här; sidindelningen görs efter rangordningen.
      if (tokens.length >= 2) {
        const { data: all, error: allError } = await query.limit(500);
        if (allError || !all) return { data: null, count: 0, error: allError };
        const minHits = tokens.length >= MIN_TOKENS_FOR_STRICT_MATCH ? 2 : 1;
        const scored = (all as any[])
          .map(row => {
            const title = String(row.title ?? '').toLowerCase();
            const body = `${row.description ?? ''} ${row.target_audience ?? ''}`.toLowerCase();
            let hits = 0;
            let score = 0;
            for (const t of tokens) {
              const inTitle = title.includes(t);
              const inBody = body.includes(t);
              if (inTitle || inBody) hits += 1;
              score += inTitle ? 3 : inBody ? 1 : 0;
            }
            return { row, hits, score };
          })
          .filter(r => r.hits >= minHits);
        if (sortBy === 'relevance') scored.sort((a, b) => b.score - a.score);
        const page = scored.slice(from, to + 1).map(r => adaptTraining(r.row));
        return { data: page, count: scored.length, error: null };
      }

      const { data, count: total, error } = await query.range(from, to);
      return { data: data ? (data as any[]).map(adaptTraining) : null, count: total, error };
    },
  });

  const filteredTrainings = trainingRows;

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // Ny sökning (sökfältet eller ett föreslaget behov). Övriga parametrar, som ?via=, behålls.
  const runSearch = (q: string) => {
    const trimmed = q.trim();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      return next;
    });
  };

  // "Rensa filter" lämnade tidigare kvar sökordet; i tomläget rensas båda.
  const clearSearchAndFilters = () => {
    clearFilters();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('q');
      next.delete('category');
      return next;
    }, { replace: true });
  };

  // Sökkontext för "Efterfråga anpassad utbildning" (Paket C → D).
  const resultsReady = !searchFirst && !trainingsLoading && !scopeLoading && !marketplaceLoading && startsReady;
  const isSearching = Boolean(searchQuery) || activeFiltersCount > 0;
  const noResults = resultsReady && filteredTrainings.length === 0;
  const weakResults = resultsReady && isSearching && count > 0 && count <= WEAK_RESULTS_THRESHOLD;
  const requestUrl = buildRequestUrl({
    source: noResults ? 'search_no_results' : weakResults ? 'search_weak_results' : 'direct',
    searchQuery,
    categories: filters.categories,
    formats: filters.formats,
    providers: filters.providers,
    marketplaceSlug: marketplace?.slug,
  });

  const visibleCategories = scopedCategoryIds
    ? categories.filter(c => scopedCategoryIds.has(c.id))
    : categories;
  const visibleProviders = scopedProviderIds
    ? providers.filter(p => scopedProviderIds.has(p.id))
    : providers;
  const activeChips = buildActiveChips(filters, categories, providers);

  const heading = marketplace ? `Kurser hos ${marketplace.name}` : searchFirst ? 'Vad behöver ni utveckla?' : 'Matchande utbildningar';
  const subheading = marketplace
    ? `${count} utvalda utbildningsprogram`
    : searchFirst
      ? 'Beskriv behovet med egna ord, så visar vi de utbildningar som matchar.'
      : `${count} ${count === 1 ? 'matchning' : 'matchningar'}${searchQuery ? ` för "${searchQuery}"` : ''}`;

  const filterGroups = (
    <CatalogFilterGroups
      filters={filters}
      onChange={setFilters}
      categories={visibleCategories}
      providers={visibleProviders}
      startOptions={startOptions}
    />
  );

  return (
    <div className="ub-theme min-h-screen">
      {/* Sök och rubrik */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-slate-900 mb-2">{heading}</h1>
          <p className="text-slate-600 mb-6">{subheading}</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(queryInput);
            }}
            role="search"
            className="max-w-3xl"
          >
            <div data-search-field className="flex items-center bg-white border-[1.5px] border-slate-200 rounded-[14px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] focus-within:border-[var(--marketplace-primary)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--marketplace-primary)_15%,transparent),0_2px_12px_rgba(0,0,0,0.06)]">
              <Search className="ml-[18px] w-[18px] h-[18px] shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="T.ex. våra chefer behöver leda bättre i förändring"
                aria-label="Beskriv ert utbildningsbehov"
                className="flex-1 min-w-0 px-4 py-4 text-base text-slate-900 bg-transparent outline-none placeholder:text-slate-400"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => { setQueryInput(''); runSearch(''); }}
                  aria-label="Rensa sökning"
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="m-1.5 px-3.5 sm:px-[22px] py-3 bg-[var(--marketplace-primary)] hover:brightness-90 text-white text-sm font-semibold rounded-[10px] flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <span className="hidden sm:inline">Hitta utbildning</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only sm:hidden">Hitta utbildning</span>
              </button>
            </div>
          </form>

          {(searchFirst || !marketplace) && (
            <div className={`${searchFirst ? 'flex' : 'hidden sm:flex'} flex-wrap gap-2 mt-4`}>
              {NEED_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => runSearch(chip)}
                  aria-pressed={searchQuery === chip}
                  className={`px-4 py-2 rounded-full text-[13px] border-[1.5px] transition-colors ${
                    searchQuery === chip
                      ? 'bg-[var(--marketplace-primary)]/10 text-[var(--marketplace-primary)] border-[var(--marketplace-primary)]'
                      : 'bg-slate-100 text-slate-700 border-transparent hover:bg-slate-200'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchFirst ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center max-w-2xl mx-auto">
            <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Börja med att beskriva ert behov</h2>
            <p className="text-slate-600 mb-6">
              Skriv vad er organisation behöver utveckla, eller välj ett av förslagen ovan. Därefter kan ni
              förfina träfflistan med filter och söka om. Hittar vi ingen utbildning som passar kan lärosäten
              ta fram en anpassad.
            </p>
            <Link to={buildRequestUrl({ source: 'direct', searchQuery: '', categories: [], formats: [], providers: [] })} className="inline-flex items-center gap-2 text-[var(--marketplace-primary)] font-medium text-sm hover:underline">
              Efterfråga anpassad utbildning direkt
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filters Sidebar - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-6 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-slate-900">Filter</h2>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-[var(--marketplace-primary)] hover:brightness-90 font-medium"
                  >
                    Rensa alla
                  </button>
                )}
              </div>
              {filterGroups}
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Mobile Filter Toggle & Sort */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Filter className="w-4 h-4" />
                Filter
                {activeFiltersCount > 0 && (
                  <span className="bg-[var(--marketplace-primary)] text-white text-xs px-2 py-0.5 rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-slate-600">
                  {count} {count === 1 ? 'träff' : 'träffar'}
                </span>
                <select
                  value={!searchQuery && sortBy === 'relevance' ? 'popular' : sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  aria-label="Sortera"
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--marketplace-primary)]"
                >
                  {searchQuery && <option value="relevance">Bäst träff</option>}
                  <option value="popular">Mest populära</option>
                  <option value="leads">Flest förfrågningar</option>
                  <option value="newest">Nyast</option>
                </select>
              </div>
            </div>

            {/* Valda filter */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6" aria-label="Valda filter">
                {activeChips.map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilters(chip.remove(filters))}
                    className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-[var(--marketplace-primary)]/10 text-[var(--marketplace-primary)] text-xs font-medium hover:bg-[var(--marketplace-primary)]/20 transition-colors"
                    aria-label={`Ta bort filter ${chip.label}`}
                  >
                    {chip.label}
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-800 underline ml-1">
                  Rensa alla
                </button>
              </div>
            )}

            {/* Mobile Filters */}
            {showFilters && (
              <div className="lg:hidden bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold text-slate-900">Filter</h2>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 hover:bg-slate-100 rounded"
                    aria-label="Stäng filter"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
                {filterGroups}
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="w-full mt-6 px-4 py-2 text-[var(--marketplace-primary)] hover:bg-[var(--marketplace-primary)]/10 rounded-lg font-medium text-sm transition-colors"
                  >
                    Rensa alla filter
                  </button>
                )}
              </div>
            )}

            {/* Training List */}
            <div className="space-y-4">
              {filteredTrainings.map((training, index) => {
                const provider = training.provider;
                const category = training.category;
                const backgroundImage = training.imageUrl;

                return (
                  <Link
                    key={training.id}
                    to={`/kurs/${training.slug}`}
                    className="group block bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all overflow-hidden"
                  >
                    <div className="md:flex">
                      <div
                        className="md:w-64 aspect-video md:aspect-auto relative bg-cover bg-center"
                        style={{ backgroundImage: `url(${backgroundImage})` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--marketplace-primary)]/40 to-[var(--marketplace-primary)]/60 group-hover:from-[var(--marketplace-primary)]/20 group-hover:to-[var(--marketplace-primary)]/30 transition-all" />
                        <div className="absolute top-3 left-3">
                          <span className="inline-block bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-900">
                            {category?.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 p-6">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <h3 className="text-xl font-semibold text-slate-900 group-hover:text-[var(--marketplace-primary)] transition-colors">
                            {training.title}
                          </h3>
                          <TrendingUp className="w-5 h-5 text-[var(--marketplace-primary)] flex-shrink-0" />
                        </div>

                        <p className="text-slate-600 mb-4 line-clamp-2">
                          {training.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                          <span className="flex items-center gap-1.5">
                            {providerLogos[provider.name] ? (
                              <img
                                src={providerLogos[provider.name]}
                                alt={provider?.name}
                                className="h-5 w-auto object-contain"
                              />
                            ) : (
                              <GraduationCap className="w-4 h-4" />
                            )}
                            {provider?.name}
                          </span>
                          <span>•</span>
                          <span>{training.duration}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 capitalize">
                            <BookOpen className="w-3.5 h-3.5" />
                            {training.credits} hp
                          </span>
                          {training.courseCode && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                {training.courseCode}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{training.views} visningar</span>
                            <span>•</span>
                            <span>{training.leads} förfrågningar</span>
                          </div>
                          <div className="flex items-center gap-2 text-[var(--marketplace-primary)] font-medium text-sm">
                            Visa detaljer
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {filteredTrainings.length === 0 && marketplace && activeFiltersCount === 0 && !searchQuery ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      Inga kurser ännu
                    </h3>
                    <p className="text-slate-600">
                      {marketplace.name} har inte lagt till några utbildningar här ännu. Kom tillbaka snart.
                    </p>
                  </div>
                </div>
              ) : noResults && (
                <NoResultsRequestBlock
                  searchQuery={searchQuery}
                  requestUrl={requestUrl}
                  hasActiveFilters={activeFiltersCount > 0}
                  onClearAll={clearSearchAndFilters}
                />
              )}

              {weakResults && <WeakResultsRequestCard requestUrl={requestUrl} />}
              {resultsReady && count > WEAK_RESULTS_THRESHOLD && <PermanentRequestLink requestUrl={requestUrl} />}
            </div>

            {totalPages > 1 && (
              <Pagination className="mt-8">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                      className={page === 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  {getPaginationRange(page, totalPages).map((p, i) =>
                    p === 'ellipsis' ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === page}
                          onClick={(e) => { e.preventDefault(); setPage(p); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                      className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
