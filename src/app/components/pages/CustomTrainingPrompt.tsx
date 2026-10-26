import { Link } from 'react-router';
import { ArrowRight, Search } from 'lucide-react';

// Antal träffar (inklusive) under vilket en sökning räknas som "svag". Sökningen
// har ingen relevanspoäng (ilike + views/leads), så antalet träffar är den enda signalen.
export const WEAK_RESULTS_THRESHOLD = 3;

export type RequestSource = 'search_no_results' | 'search_weak_results' | 'direct';

// Katalogens format-värden → efterfrågeformulärets delivery_format.
const FORMAT_TO_DELIVERY: Record<string, string> = {
  online: 'remote',
  onsite: 'on_site',
  hybrid: 'hybrid',
};

interface RequestContext {
  source: RequestSource;
  searchQuery: string;
  categories: string[];
  formats: string[];
  providers: string[];
  marketplaceSlug?: string | null;
}

// Bygger länken till /efterfraga med sökkontexten (sökterm, filter, source, via).
export function buildRequestUrl(ctx: RequestContext): string {
  const params = new URLSearchParams();
  params.set('source', ctx.source);
  if (ctx.searchQuery) params.set('q', ctx.searchQuery);
  if (ctx.categories.length) params.set('category', ctx.categories.join(','));
  const formats = ctx.formats.map(f => FORMAT_TO_DELIVERY[f]).filter(Boolean);
  if (formats.length) params.set('format', formats.join(','));
  if (ctx.providers.length) params.set('provider', ctx.providers.join(','));
  if (ctx.marketplaceSlug) params.set('via', ctx.marketplaceSlug);
  return `/efterfraga?${params.toString()}`;
}

interface NoResultsProps {
  searchQuery: string;
  requestUrl: string;
  hasActiveFilters: boolean;
  onClearAll: () => void;
}

// 0 träffar: framträdande block med primär CTA, filterjustering som sekundärt val.
export function NoResultsRequestBlock({ searchQuery, requestUrl, hasActiveFilters, onClearAll }: NoResultsProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
      <div className="max-w-lg mx-auto">
        <Search className="w-10 h-10 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-900 mb-2">
          {searchQuery ? (
            <>Vi hittade ingen utbildning som matchar <span className="italic">{searchQuery}</span></>
          ) : (
            'Vi hittade ingen utbildning som matchar'
          )}
        </h3>
        <p className="text-slate-600 mb-6">
          Lärosäten kan ta fram en anpassad utbildning efter era behov.
        </p>
        <Link
          to={requestUrl}
          className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Efterfråga anpassad utbildning
          <ArrowRight className="w-4 h-4" />
        </Link>
        {(searchQuery || hasActiveFilters) && (
          <div className="mt-6 text-sm text-slate-500">
            Eller{' '}
            <button
              onClick={onClearAll}
              className="text-blue-600 hover:text-blue-700 font-medium underline-offset-2 hover:underline"
            >
              {hasActiveFilters ? 'rensa sökning och filter' : 'rensa sökningen'}
            </button>{' '}
            och bläddra bland alla utbildningar.
          </div>
        )}
      </div>
    </div>
  );
}

// Svaga träffar: diskret kort efter resultatlistan.
export function WeakResultsRequestCard({ requestUrl }: { requestUrl: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <p className="font-medium text-slate-900">Hittar du inte rätt?</p>
        <p className="text-sm text-slate-600">
          Lärosäten kan ta fram en anpassad utbildning efter era behov.
        </p>
      </div>
      <Link
        to={requestUrl}
        className="inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800 whitespace-nowrap"
      >
        Efterfråga anpassad utbildning
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

// Alltid: liten länk längst ned i resultatlistan.
export function PermanentRequestLink({ requestUrl }: { requestUrl: string }) {
  return (
    <p className="text-sm text-slate-500 text-center pt-2">
      Hittar du inte rätt?{' '}
      <Link to={requestUrl} className="text-blue-600 hover:text-blue-700 font-medium hover:underline underline-offset-2">
        Efterfråga en anpassad utbildning
      </Link>
    </p>
  );
}
