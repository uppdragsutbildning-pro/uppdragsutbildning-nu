// Förslag på lärosäten till en anpassad efterfrågan. Admin fattar alltid beslutet;
// det här är bara ett stöd som rangordnar och visar matchningsskälet.
//
// 1. SSYK-överlapp: efterfrågans taggar mot lärosätets kurser (kursernas ssyk_skills).
//    Kurser saknar ofta taggar, och köparen väljer yrkesroller medan kurserna taggas
//    med kompetenser, så överlappet är ofta tomt.
// 2. Nyckelordsmatch (fallback): ord ur efterfrågans rubrik/beskrivning/mål mot
//    kursernas titel, beskrivning, målgrupp och kategori.

export interface RequestForMatching {
  title: string;
  description: string;
  learning_goals: string | null;
  ssyk_skills: { id: string; title: string }[] | null;
}

export interface CourseForMatching {
  provider_id: string;
  title: string;
  description: string;
  target_audience: string | null;
  category_name: string | null;
  ssyk_skills: { id: string; title?: string }[] | null;
}

export interface ProviderMatch {
  providerId: string;
  score: number;
  reason: string;
}

const STOPWORDS = new Set([
  'och', 'att', 'som', 'för', 'med', 'att', 'ett', 'det', 'den', 'detta', 'denna', 'till', 'från', 'inom',
  'ska', 'kan', 'har', 'vara', 'blir', 'samt', 'eller', 'även', 'sina', 'deras', 'våra', 'vill', 'behöver',
  'utbildning', 'utbildningen', 'program', 'kurs', 'kursen', 'anpassad', 'anpassat', 'personal', 'medarbetare',
  'organisation', 'organisationen', 'verksamhet', 'verksamheten', 'under', 'över', 'efter', 'mellan', 'alla',
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-zåäö0-9]+/)) {
    if (raw.length >= 4 && !STOPWORDS.has(raw)) tokens.add(raw);
  }
  return tokens;
}

// Enkel stamjämförelse: "ledarskap" matchar "ledarskapsprogram" (gemensamt prefix ≥ 6 tecken).
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.startsWith(short);
}

export function matchProviders(
  request: RequestForMatching,
  courses: CourseForMatching[],
  providerIds: string[]
): Map<string, ProviderMatch> {
  const requestSkills = request.ssyk_skills ?? [];
  const requestSkillIds = new Set(requestSkills.map(s => s.id));
  const requestTokens = tokenize(`${request.title} ${request.description} ${request.learning_goals ?? ''}`);

  const result = new Map<string, ProviderMatch>();
  for (const providerId of providerIds) {
    const own = courses.filter(c => c.provider_id === providerId);

    const providerSkillIds = new Set<string>();
    for (const c of own) for (const s of c.ssyk_skills ?? []) providerSkillIds.add(s.id);
    const skillHits = [...requestSkillIds].filter(id => providerSkillIds.has(id)).length;

    const courseTokens = new Set<string>();
    for (const c of own) {
      for (const t of tokenize(`${c.title} ${c.description} ${c.target_audience ?? ''} ${c.category_name ?? ''}`)) {
        courseTokens.add(t);
      }
    }
    const keywordHits = [...requestTokens].filter(rt => [...courseTokens].some(ct => wordsMatch(rt, ct)));

    const score = skillHits * 10 + keywordHits.length;
    if (score === 0) continue;

    const reasons: string[] = [];
    if (skillHits > 0) reasons.push(`${skillHits} av ${requestSkillIds.size} kompetenser`);
    if (keywordHits.length > 0) reasons.push(`Nyckelord: ${keywordHits.slice(0, 3).join(', ')}`);
    result.set(providerId, { providerId, score, reason: reasons.join(' · ') });
  }
  return result;
}
