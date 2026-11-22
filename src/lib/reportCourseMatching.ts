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
  ssyk_skills: { id: string; title?: string }[] | null;
  providerName: string | null;
}

export async function loadCoursesForReport(marketplace: Marketplace | null): Promise<ReportCourse[]> {
  const allowedIds = await getMarketplaceTrainingIds(marketplace);
  if (allowedIds && allowedIds.length === 0) return [];

  let query = supabase
    .from('trainings')
    .select('id, slug, title, description, target_audience, ssyk_skills, providers(name)')
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
    providerName: t.providers?.name ?? null,
  }));
}

const THRESHOLD = 3;

export function matchRecommendations(
  recs: Recommendation[],
  courses: ReportCourse[],
  ssykIds: string[],
  perRec = 2
): Map<number, ReportCourse[]> {
  const result = new Map<number, ReportCourse[]>();
  const used = new Set<string>();
  const ssykSet = new Set(ssykIds);

  const prepared = courses.map((c) => ({
    c,
    titleTokens: tokenize(c.title),
    bodyTokens: tokenize(`${c.description} ${c.target_audience ?? ''}`),
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
          if ([...p.titleTokens].some((t) => wordsMatch(term, t))) score += 2;
          else if ([...p.bodyTokens].some((t) => wordsMatch(term, t))) score += 1;
        }
        const skillHits = (p.c.ssyk_skills ?? []).filter((s) => ssykSet.has(s.id)).length;
        score += Math.min(skillHits, 2) * 2;
        return { c: p.c, score };
      })
      .filter((x) => x.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, perRec);

    if (scored.length > 0) {
      scored.forEach((x) => used.add(x.c.id));
      result.set(i, scored.map((x) => x.c));
    }
  });

  return result;
}
