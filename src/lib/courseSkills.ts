// Kompetenstaggar på kurser. Källor:
//  - ssyk: kompetensbegrepp i Arbetsförmedlingens taxonomi (SSYK 2012), samma vokabulär som köparens yrkesval
//  - esco: EU:s kompetenstaxonomi ESCO, som finns i samma API och är bredare på tvärgående kompetenser
// Taggar sparas som [{ id, title, source }] i trainings.ssyk_skills (jsonb). Äldre taggar utan source räknas som ssyk.

const API_BASE = 'https://taxonomy.api.jobtechdev.se/v1/taxonomy';

export type SkillSource = 'ssyk' | 'esco';
export interface CourseSkillTag {
  id: string;
  title: string;
  source: SkillSource;
}

export const MAX_COURSE_SKILLS = 10;

export const SOURCE_LABEL: Record<SkillSource, string> = { ssyk: 'SSYK', esco: 'ESCO' };
const TYPE_BY_SOURCE: Record<SkillSource, string> = { ssyk: 'skill', esco: 'esco-skill' };

type Concept = { 'taxonomy/id': string; 'taxonomy/preferred-label': string };

export function normalizeCourseSkills(raw: unknown): CourseSkillTag[] {
  if (!Array.isArray(raw)) return [];
  const out: CourseSkillTag[] = [];
  for (const r of raw) {
    if (r && typeof r.id === 'string' && typeof r.title === 'string') {
      out.push({ id: r.id, title: r.title, source: r.source === 'esco' ? 'esco' : 'ssyk' });
    }
  }
  return out;
}

async function autocomplete(query: string, source: SkillSource, limit: number, signal?: AbortSignal): Promise<CourseSkillTag[]> {
  const qs = new URLSearchParams({ 'query-string': query, type: TYPE_BY_SOURCE[source], limit: String(limit) });
  const res = await fetch(`${API_BASE}/suggesters/autocomplete?${qs}`, { signal });
  if (!res.ok) throw new Error(`Taxonomy API: ${res.status}`);
  const concepts: Concept[] = await res.json();
  return concepts.map((c) => ({ id: c['taxonomy/id'], title: c['taxonomy/preferred-label'], source }));
}

// Söker i båda vokabulärerna. SSYK först eftersom den ligger närmast köparens yrkesval.
export async function searchCourseSkills(query: string, signal?: AbortSignal): Promise<CourseSkillTag[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [ssyk, esco] = await Promise.all([
    autocomplete(q, 'ssyk', 6, signal).catch(() => []),
    autocomplete(q, 'esco', 6, signal).catch(() => []),
  ]);
  return [...ssyk, ...esco];
}

export interface SkillSuggestInput {
  title: string;
  description: string;
  targetAudience: string;
  learningOutcomes: string[];
}

// Ber servern föreslå taggar utifrån kursens text. Förslagen är riktiga begrepp ur taxonomin
// (servern slår upp dem), och sparas aldrig här: leverantören väljer vilka som läggs till.
export async function suggestCourseSkills(
  input: SkillSuggestInput,
  accessToken: string
): Promise<CourseSkillTag[]> {
  const res = await fetch('/api/suggest-course-skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Kunde inte hämta förslag');
  return normalizeCourseSkills(data.suggestions);
}
