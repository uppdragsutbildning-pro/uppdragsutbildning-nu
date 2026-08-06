import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Filter, X, GraduationCap, TrendingUp, ArrowRight, BookOpen } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { adaptTraining, adaptCategory, adaptProvider, type AdaptedTraining, type AdaptedCategory, type AdaptedProvider } from '../../../lib/marketplaceAdapters';
import { providerLogos } from '../../data/providerLogos';
import { usePaginatedQuery, getPaginationRange } from '../../../hooks/usePaginatedQuery';
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

export function CatalogPage() {
  const [searchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState<AdaptedCategory[]>([]);
  const [providers, setProviders] = useState<AdaptedProvider[]>([]);

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.get('category') ? [searchParams.get('category')!] : []
  );
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'popular' | 'newest'>('popular');
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('categories').select('*').order('name');
      if (data) setCategories(data.map(adaptCategory));
    })();
    (async () => {
      const { data } = await supabase.from('providers').select('*').eq('is_active', true).order('name');
      if (data) setProviders(data.map(adaptProvider));
    })();
  }, []);

  const {
    rows: trainingRows,
    page,
    setPage,
    totalPages,
    count,
  } = usePaginatedQuery<AdaptedTraining>({
    pageSize: PAGE_SIZE,
    deps: [selectedCategories, selectedFormats, selectedProviders, searchQuery, sortBy],
    queryFn: async ({ from, to }) => {
      let query = supabase
        .from('trainings')
        .select('*, providers(*), categories(*)', { count: 'exact' })
        .eq('is_active', true);

      if (selectedCategories.length > 0) query = query.in('category_id', selectedCategories);
      if (selectedFormats.length > 0) query = query.in('format', selectedFormats);
      if (selectedProviders.length > 0) query = query.in('provider_id', selectedProviders);
      if (searchQuery) {
        const q = searchQuery.replace(/[%,]/g, '');
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,target_audience.ilike.%${q}%`);
      }

      query = query.order(sortBy === 'popular' ? 'views' : 'leads', { ascending: false });

      const { data, count: total, error } = await query.range(from, to);
      return { data: data ? (data as any[]).map(adaptTraining) : null, count: total, error };
    },
  });

  const filteredTrainings = trainingRows;

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleFormat = (format: string) => {
    setSelectedFormats(prev => 
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    );
  };

  const toggleProvider = (id: string) => {
    setSelectedProviders(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedFormats([]);
    setSelectedProviders([]);
  };

  const activeFiltersCount = selectedCategories.length + selectedFormats.length + selectedProviders.length;

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Utbildningskatalog
          </h1>
          <p className="text-slate-600">
            Bläddra bland {count} utbildningsprogram från ledande leverantörer
          </p>
          {searchQuery && (
            <p className="text-sm text-slate-500 mt-2">
              Sökresultat för: <span className="font-medium text-slate-900">"{searchQuery}"</span>
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Filters Sidebar - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 p-6 sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-slate-900">Filter</h2>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Rensa alla
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-900 mb-3">Kategori</h3>
                <div className="space-y-2">
                  {categories.map(category => (
                    <label key={category.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category.id)}
                        onChange={() => toggleCategory(category.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Format Filter */}
              <div className="mb-6 pb-6 border-b border-slate-200">
                <h3 className="text-sm font-medium text-slate-900 mb-3">Format</h3>
                <div className="space-y-2">
                  {[
                    { value: 'online', label: 'Online' },
                    { value: 'onsite', label: 'På plats' },
                    { value: 'hybrid', label: 'Hybrid' }
                  ].map(format => (
                    <label key={format.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFormats.includes(format.value)}
                        onChange={() => toggleFormat(format.value)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{format.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Provider Filter */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Leverantör</h3>
                <div className="space-y-2">
                  {providers.slice(0, 6).map(provider => (
                    <label key={provider.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(provider.id)}
                        onChange={() => toggleProvider(provider.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 line-clamp-1">{provider.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {/* Mobile Filter Toggle & Sort */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  {count} resultat
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'popular' | 'newest')}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="popular">Mest Populära</option>
                  <option value="newest">Flest Förfrågningar</option>
                </select>
              </div>
            </div>

            {/* Mobile Filters */}
            {showFilters && (
              <div className="lg:hidden bg-white rounded-xl border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold text-slate-900">Filters</h2>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 hover:bg-slate-100 rounded"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                {/* Same filter content as desktop */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 mb-3">Kategori</h3>
                    <div className="space-y-2">
                      {categories.map(category => (
                        <label key={category.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(category.id)}
                            onChange={() => toggleCategory(category.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{category.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-slate-900 mb-3">Format</h3>
                    <div className="space-y-2">
                      {[
                        { value: 'online', label: 'Online' },
                        { value: 'onsite', label: 'På plats' },
                        { value: 'hybrid', label: 'Hybrid' }
                      ].map(format => (
                        <label key={format.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedFormats.includes(format.value)}
                            onChange={() => toggleFormat(format.value)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{format.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-slate-900 mb-3">Leverantör</h3>
                    <div className="space-y-2">
                      {providers.slice(0, 6).map(provider => (
                        <label key={provider.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedProviders.includes(provider.id)}
                            onChange={() => toggleProvider(provider.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{provider.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {activeFiltersCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium text-sm transition-colors"
                    >
                      Rensa alla filter
                    </button>
                  )}
                </div>
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
                    to={`/training/${training.id}`}
                    className="group block bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all overflow-hidden"
                  >
                    <div className="md:flex">
                      <div
                        className="md:w-64 aspect-video md:aspect-auto relative bg-cover bg-center"
                        style={{ backgroundImage: `url(${backgroundImage})` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/40 to-blue-800/40 group-hover:from-blue-600/20 group-hover:to-blue-800/20 transition-all" />
                        <div className="absolute top-3 left-3">
                          <span className="inline-block bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-900">
                            {category?.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 p-6">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {training.title}
                          </h3>
                          <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0" />
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
                          <div className="flex items-center gap-2 text-blue-600 font-medium text-sm">
                            Visa detaljer
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {filteredTrainings.length === 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <Filter className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      Inga utbildningar hittades
                    </h3>
                    <p className="text-slate-600 mb-6">
                      Försök justera dina filter eller sökord för att hitta det du letar efter.
                    </p>
                    <button
                      onClick={clearFilters}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Rensa filter
                    </button>
                  </div>
                </div>
              )}
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
    </div>
  );
}