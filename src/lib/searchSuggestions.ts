// Reservförslag under sökfältet när det inte finns tillräckligt med data än eller när hämtningen
// misslyckas. De riktiga förslagen byggs av mest sökta sökningar, populära områden och kurser.
export const NEED_CHIPS = [
  'Ledarskap i förändring',
  'AI i verksamheten',
  'Hållbarhet och CSRD',
  'Projektledning',
  'Digital kompetens',
  'Arbetsmiljö och välmående',
];

const SEARCH_STOPWORDS = new Set([
  'och', 'att', 'som', 'för', 'med', 'ett', 'det', 'den', 'detta', 'denna', 'till', 'från', 'inom',
  'ska', 'kan', 'har', 'vara', 'blir', 'samt', 'eller', 'även', 'sina', 'deras', 'våra', 'vill',
  'behöver', 'bättre', 'utbildning', 'utbildningen', 'kurs', 'kursen',
]);

// Delar upp en sökning i sökord. Köparen beskriver ofta behovet med en hel mening
// ("våra chefer behöver leda bättre i förändring"), som aldrig matchar som en sammanhängande
// fras, så varje ord söks för sig. Korta ord och vanliga småord hoppas över; en kort sökning
// som "AI" lämnas orörd av anroparen när inga sökord blir kvar.
export function searchTokens(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-zåäö0-9]+/)
    .filter(t => t.length >= 3 && !SEARCH_STOPWORDS.has(t));
  return [...new Set(tokens)];
}

const MAX_SUGGESTION_LENGTH = 40;
const ACRONYMS = new Set(['ai', 'hr', 'it', 'esg', 'csrd', 'gdpr', 'ux']);
const MAX_SUGGESTION_WORDS = 6;

// Rensar en text till en kort, ren rad: ett mellanslag mellan orden och stor första bokstav.
// Returnerar null för texter som är för korta, för långa eller innehåller siffror och adresser,
// så att förslagen aldrig innehåller märkliga texter.
export function toSuggestion(text: string | null | undefined): string | null {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3 || cleaned.length > MAX_SUGGESTION_LENGTH) return null;
  if (cleaned.split(' ').length > MAX_SUGGESTION_WORDS) return null;
  if (/[@/:]|https?|www\./i.test(cleaned)) return null;
  // Sparade sökningar är gemener; förkortningar ska ändå skrivas rätt ("AI", inte "Ai").
  const withAcronyms = cleaned
    .split(' ')
    .map(word => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word))
    .join(' ');
  return withAcronyms.charAt(0).toLocaleUpperCase('sv-SE') + withAcronyms.slice(1);
}

interface SuggestionSources {
  popular: string[]; // mest sökta sökningar (senaste 60 dagarna)
  areas: string[]; // populära områden (kategorier), mest visade först
  courses: string[]; // populära kurser, mest visade först
  limit?: number;
}

// Sätter ihop förslagen: först de mest sökta, sedan populära områden och kurser (högst två av
// varje typ i första omgången så att listan blir blandad), därefter fylls det som återstår på av
// vad som finns kvar, och sist av reservförslagen. Dubbletter tas bort utan hänsyn till versaler.
export function composeSuggestions({ popular, areas, courses, limit = 6 }: SuggestionSources): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const text = toSuggestion(raw);
    if (!text || seen.has(text.toLowerCase()) || result.length >= limit) return;
    seen.add(text.toLowerCase());
    result.push(text);
  };
  const take = (list: string[], count: number) => {
    let added = 0;
    for (const item of list) {
      if (added >= count || result.length >= limit) break;
      const before = result.length;
      add(item);
      if (result.length > before) added += 1;
    }
  };

  take(popular, 2);
  take(areas, 2);
  take(courses, 2);
  for (const list of [popular, areas, courses]) take(list, limit);
  for (const chip of NEED_CHIPS) add(chip);
  return result;
}
