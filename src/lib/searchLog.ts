import { supabase } from './supabase';

const LAST_LOGGED_KEY = 'ub.lastLoggedSearch';

// Sparar en sökning för förslagen under sökfältet. Databasen avgör vad som sparas (bara korta, rena
// sökningar som ger träff, utan koppling till en person), så anropet kan skickas för vilken sökning
// som helst. En sökning som redan sparats i den här sessionen skickas inte igen, så en omladdning
// inte räknas som en ny sökning. Fel ignoreras: förslagen är en bonus och får aldrig störa sökningen.
export function logSearchQuery(query: string, marketplaceId: string | null): void {
  const q = query.trim();
  if (q.length < 3 || q.length > 50) return;
  const key = `${marketplaceId ?? ''}|${q.toLowerCase()}`;
  try {
    if (sessionStorage.getItem(LAST_LOGGED_KEY) === key) return;
    sessionStorage.setItem(LAST_LOGGED_KEY, key);
  } catch {
    // sessionStorage blockerat: sökningen sparas ändå
  }
  void supabase
    .rpc('log_search_query', { p_query: q, p_marketplace_id: marketplaceId })
    .then(
      () => undefined,
      () => undefined
    );
}
