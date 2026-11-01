// Förslag på behov som visas under sökfältet (startsidan och sidan Matchande utbildningar).
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
