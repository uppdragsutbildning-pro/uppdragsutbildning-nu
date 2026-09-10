const API_BASE = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface OccupationField {
  id: string;
  label: string;
}

export interface OccupationName {
  id: string;
  label: string;
}

export interface OccupationSkill {
  id: string;
  title: string;
}

export interface OccupationDetails {
  id: string;
  label: string;
  definition: string;
  ssykGroupLabel: string | null;
  skills: OccupationSkill[];
}

type Concept = {
  'taxonomy/id': string;
  'taxonomy/type': string;
  'taxonomy/preferred-label': string;
  'taxonomy/definition'?: string;
};

type CacheEntry<T> = { data: T; ts: number };
const memoryCache = new Map<string, CacheEntry<unknown>>();
const STORAGE_PREFIX = 'jobtech_taxonomy_cache_v1:';

function readCache<T>(key: string): T | undefined {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem && Date.now() - mem.ts < TTL_MS) return mem.data;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.ts >= TTL_MS) return undefined;
    memoryCache.set(key, parsed);
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, ts: Date.now() };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage kan vara otillgängligt (privat läge/quota) - cachen blir då bara in-memory för sessionen.
  }
}

async function getConcepts(params: Record<string, string>): Promise<Concept[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/main/concepts?${qs}`);
  if (!res.ok) throw new Error(`JobTech Taxonomy API error: ${res.status}`);
  return res.json();
}

export async function fetchOccupationFields(): Promise<OccupationField[]> {
  const key = 'occupation-fields';
  const cached = readCache<OccupationField[]>(key);
  if (cached) return cached;

  const concepts = await getConcepts({ type: 'occupation-field', limit: '100' });
  const fields = concepts
    .map((c) => ({ id: c['taxonomy/id'], label: c['taxonomy/preferred-label'] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'sv'));

  writeCache(key, fields);
  return fields;
}

export async function searchOccupationNames(fieldId: string, query: string): Promise<OccupationName[]> {
  if (!query.trim()) return [];
  const qs = new URLSearchParams({
    'query-string': query,
    type: 'occupation-name',
    'related-ids': fieldId,
    relation: 'related',
    limit: '10',
  }).toString();

  const res = await fetch(`${API_BASE}/suggesters/autocomplete?${qs}`);
  if (!res.ok) throw new Error(`JobTech Taxonomy API error: ${res.status}`);
  const concepts: Concept[] = await res.json();
  return concepts.map((c) => ({ id: c['taxonomy/id'], label: c['taxonomy/preferred-label'] }));
}

async function fetchOneOccupationDetails(id: string): Promise<OccupationDetails> {
  const key = `occupation-details:${id}`;
  const cached = readCache<OccupationDetails>(key);
  if (cached) return cached;

  const [selfConcepts, essential, optional, broader] = await Promise.all([
    getConcepts({ id }),
    getConcepts({ 'related-ids': id, relation: 'essential' }).catch(() => []),
    getConcepts({ 'related-ids': id, relation: 'optional' }).catch(() => []),
    getConcepts({ 'related-ids': id, relation: 'broader' }).catch(() => []),
  ]);

  const self = selfConcepts[0];
  const label = self?.['taxonomy/preferred-label'] ?? id;
  const definition = self?.['taxonomy/definition'] ?? '';

  const ssykGroup = broader.find((c) => c['taxonomy/type'] === 'ssyk-level-4');
  const ssykGroupLabel = ssykGroup?.['taxonomy/preferred-label'] ?? null;

  const seen = new Set<string>();
  const skills: OccupationSkill[] = [];
  for (const c of [...essential, ...optional]) {
    if (seen.has(c['taxonomy/id'])) continue;
    seen.add(c['taxonomy/id']);
    skills.push({ id: c['taxonomy/id'], title: c['taxonomy/preferred-label'] });
  }

  const details: OccupationDetails = { id, label, definition, ssykGroupLabel, skills };
  writeCache(key, details);
  return details;
}

export async function fetchOccupationDetails(ids: string[]): Promise<OccupationDetails[]> {
  return Promise.all(ids.map((id) => fetchOneOccupationDetails(id)));
}
