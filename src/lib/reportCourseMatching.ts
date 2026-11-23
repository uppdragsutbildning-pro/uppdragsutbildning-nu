// Kopplar rapportens rekommendationer till publicerade kurser.
// SSYK-överlapp är en svag signal (kurser saknar ofta taggar), så nyckelord ur rekommendationens
// söktermer mot kursens titel och beskrivning är huvudspåret. En kurs visas högst en gång per rapport.

import { supabase } from './supabase';
import { getMarketplaceTrainingIds, type Marketplace } from './marketplaces';
import { tokenize, wordsMatch } from './trainingRequestMatching';
import type { Recommendation } from './kompetensindexReport';

export interface ReportCourse {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  target_audience: string | null;
  ssyk_skills: { id: string; title?: string; source?: 'ssyk' | 'esco' }[] | null;
  categoryName: string | null;
  providerName: string | null;
}

export async function loadCoursesForReport(marketplace: Marketplace | null): Promise<ReportCourse[]> {
  const allowedIds = await getMarketplaceTrainingIds(marketplace);
  if (allowedIds && allowedIds.length === 0) return [];

  let query = supabase
    .from('trainings')
    .select('id, slug, title, description, target_audience, ssyk_skills, providers(name), categories(name)')
    .eq('is_active', true)
    .limit(500);
  if (allowedIds) query = query.in('id', allowedIds);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((t: any) => ({
    id: t.id,
    slug: t.slug ?? null,
    title: t.title,
    description: t.description ?? '',
    target_audience: t.target_audience ?? null,
    ssyk_skills: Array.isArray(t.ssyk_skills) ? t.ssyk_skills : null,
    categoryName: t.categories?.name ?? null,
    providerName: t.providers?.name ?? null,
  }));
}

// Kurs med de taggar som motiverar träffen (visas under kursnamnet i rapporten).
export interface MatchedCourse extends ReportCourse {
  matchedTags: { id: string; title: string; source: 'ssyk' | 'esco' }[];
  // Kompetenser ur köparens valda yrkesroller som kursen täcker (via samma tagg eller via ord i taggarnas titlar).
  coveredSkills: { id: string; title: string }[];
}

export interface RoleSkill { id: string; title: string }

// Vilka av köparens yrkeskompetenser en kurs täcker. En kompetens är täckt om kursen har samma SSYK-tagg, eller
// om ett specifikt ord (minst 6 tecken, inte ett brett ord) i kompetensens titel finns i någon av kursens taggar
// (SSYK eller ESCO). Ordjämförelsen gör att ESCO-taggar kan täcka SSYK-kompetenser utan någon ID-koppling.
export function coveredBy(course: ReportCourse, roleSkills: RoleSkill[]): RoleSkill[] {
  const tags = (course.ssyk_skills ?? []).filter((t) => typeof t.title === 'string');
  if (tags.length === 0) return [];
  const ids = new Set(tags.map((t) => t.id));
  const tagWords = [...tokenize(tags.map((t) => t.title).join(' '))];
  return roleSkills.filter((sk) => {
    if (ids.has(sk.id)) return true;
    const words = [...tokenize(sk.title)].filter((w) => w.length >= 6 && !GENERIC.has(w));
    return words.some((w) => tagWords.some((t) => wordsMatch(w, t)));
  });
}

function pickMatchedTags(course: ReportCourse, terms: Set<string>, tagSet: Set<string>) {
  const tags = (course.ssyk_skills ?? [])
    .filter((t): t is { id: string; title: string; source?: 'ssyk' | 'esco' } => typeof t.title === 'string' && t.title.length > 0)
    .map((t) => ({ id: t.id, title: t.title, source: t.source === 'esco' ? ('esco' as const) : ('ssyk' as const) }));
  const byId = tags.filter((t) => tagSet.has(t.id));
  const byTerm = tags.filter((t) => !tagSet.has(t.id) && [...tokenize(t.title)].some((w) => [...terms].some((term) => wordsMatch(term, w))));
  const picked = [...byId, ...byTerm];
  // Inga taggar matchade själva (träffen kom från titel/kategori): visa kursens första taggar.
  return (picked.length > 0 ? picked : tags).slice(0, 3);
}

const THRESHOLD = 3;

// Breda ord som förekommer i många kurser. De ger bara en svag träff, annars matchar till exempel
// "digital" varje kurs med digital i titeln, oavsett vad rekommendationen handlar om.
const GENERIC = new Set([
  'digital', 'digitala', 'ledarskap', 'strategi', 'strategisk', 'chefer', 'chef', 'utveckling',
  'kompetens', 'lärande', 'verksamhet', 'verksamhetsutveckling', 'arbetssätt', 'program', 'kvalitet',
]);

// Poäng per söktermsträff: specifik term i titeln eller i en kompetenstagg (SSYK/ESCO) 3, i kategorin 2, i beskrivningen/målgruppen 1.
// Breda termer ger 1 i titeln och inget i övrigt. SSYK/ESCO-taggar ger 3 per gemensam tagg (högst två).
export function matchRecommendations(
  recs: Recommendation[],
  courses: ReportCourse[],
  roleSkills: RoleSkill[],
  perRec = 2
): Map<number, MatchedCourse[]> {
  const result = new Map<number, MatchedCourse[]>();
  const used = new Set<string>();
  const tagSet = new Set(roleSkills.map((s) => s.id));

  const prepared = courses.map((c) => ({
    c,
    titleTokens: [...tokenize(c.title)],
    tagTokens: [...tokenize((c.ssyk_skills ?? []).map((t) => t.title ?? '').join(' '))],
    categoryTokens: [...tokenize(c.categoryName ?? '')],
    bodyTokens: [...tokenize(`${c.description} ${c.target_audience ?? ''}`)],
  }));

  recs.forEach((rec, i) => {
    const terms = new Set<string>();
    for (const t of rec.searchTerms) for (const w of tokenize(t)) terms.add(w);
    if (terms.size === 0) return;

    const scored = prepared
      .filter((p) => !used.has(p.c.id))
      .map((p) => {
        let score = 0;
        for (const term of terms) {
          const generic = GENERIC.has(term);
          if (p.titleTokens.some((t) => wordsMatch(term, t)) || p.tagTokens.some((t) => wordsMatch(term, t))) score += generic ? 1 : 3;
          else if (!generic && p.categoryTokens.some((t) => wordsMatch(term, t))) score += 2;
          else if (!generic && p.bodyTokens.some((t) => wordsMatch(term, t))) score += 1;
        }
        const tagHits = (p.c.ssyk_skills ?? []).filter((s) => tagSet.has(s.id)).length;
        score += Math.min(tagHits, 2) * 3;
        return { c: p.c, score };
      })
      .filter((x) => x.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, perRec);

    if (scored.length > 0) {
      scored.forEach((x) => used.add(x.c.id));
      result.set(i, scored.map((x) => ({ ...x.c, matchedTags: pickMatchedTags(x.c, terms, tagSet), coveredSkills: coveredBy(x.c, roleSkills) })));
    }
  });

  return result;
}
