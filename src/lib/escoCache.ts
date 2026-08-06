export interface ESCOSearchResult {
  title: string;
  uri: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'esco_cache_v1:';

type CacheEntry = { data: ESCOSearchResult[]; ts: number };

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ESCOSearchResult[]>>();

function readCache(key: string): CacheEntry | undefined {
  const mem = memoryCache.get(key);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry;
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage kan vara otillgängligt (privat läge/quota) - cachen blir då bara in-memory för sessionen.
  }
}

export async function fetchESCOTerm(term: string, limit = 5): Promise<ESCOSearchResult[]> {
  const key = `${term.toLowerCase()}::${limit}`;

  const cached = readCache(key);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = fetch(
    `https://ec.europa.eu/esco/api/search?text=${encodeURIComponent(term)}&type=skill&language=sv&limit=${limit}`
  )
    .then((res) => res.json())
    .then((data): ESCOSearchResult[] =>
      (data?._embedded?.results ?? []).map((item: { title?: string; preferredLabel?: string; uri: string }) => ({
        title: item.title || item.preferredLabel || term,
        uri: item.uri,
      }))
    )
    .then((data) => {
      writeCache(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
