-- Sparade sökningar för förslagen under sökfältet (senaste och mest sökta).
--
-- Förslagschipsen under sökfältet visar de mest sökta behoven. Sökningar sparas här, men bara om de
-- är korta och rena, och aldrig med någon koppling till en person:
--   * ingen användare, ingen IP-adress och ingen webbläsare sparas, bara själva söktexten,
--   * högst 50 tecken och sex ord, bara bokstäver (inga siffror, mejladresser eller länkar),
--   * bara sökningar som träffar minst en aktiv kurs. Träffarna räknas i databasen, inte av klienten.
-- Längre meningar ("våra chefer behöver leda bättre i förändring") sparas inte alls, eftersom de kan
-- innehålla organisationsnamn eller interna detaljer.
--
-- Skrivning sker bara via log_search_query() (SECURITY DEFINER). Tabellen har inga INSERT-policyer
-- för klienten och är bara läsbar och raderbar för admin. popular_searches() visar bara en sökning
-- som gjorts minst tre gånger de senaste 60 dagarna.
--
-- Klientkoden tål att funktionerna saknas (förslagen faller tillbaka på kurser och områden), så
-- ordningen mot kodens driftsättning spelar ingen roll.

CREATE TABLE public.search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL CHECK (length(query) BETWEEN 3 AND 50),
  result_count INTEGER NOT NULL CHECK (result_count > 0),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_queries_created ON public.search_queries(created_at DESC);
CREATE INDEX idx_search_queries_query ON public.search_queries(query);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read search queries"
  ON public.search_queries FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can delete search queries"
  ON public.search_queries FOR DELETE TO authenticated
  USING (is_admin());

-- ── Spara en sökning (anonymt anrop tillåtet) ───────────────────────────
CREATE OR REPLACE FUNCTION public.log_search_query(
  p_query TEXT,
  p_marketplace_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := lower(trim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
  words TEXT[];
  hits INTEGER;
  mkt UUID;
BEGIN
  IF length(q) < 3 OR length(q) > 50 THEN
    RETURN;
  END IF;
  -- Bara bokstäver, mellanslag, bindestreck och &: inga siffror, mejladresser eller länkar.
  IF q !~ '^[a-zåäöéèüøæ& -]+$' THEN
    RETURN;
  END IF;

  words := regexp_split_to_array(q, ' ');
  IF array_length(words, 1) > 6 THEN
    RETURN;
  END IF;

  -- Träffar på samma sätt som sökningen: minst ett ord (3 tecken eller fler) i titel, beskrivning
  -- eller målgrupp hos en aktiv kurs.
  SELECT count(*) INTO hits
  FROM trainings t
  WHERE t.is_active
    AND EXISTS (
      SELECT 1 FROM unnest(words) w
      WHERE length(w) >= 3
        AND (t.title ILIKE '%' || w || '%'
             OR t.description ILIKE '%' || w || '%'
             OR t.target_audience ILIKE '%' || w || '%')
    );
  IF hits = 0 THEN
    RETURN;
  END IF;

  IF p_marketplace_id IS NOT NULL THEN
    SELECT id INTO mkt FROM marketplaces WHERE id = p_marketplace_id AND status = 'active';
  END IF;

  INSERT INTO search_queries (query, result_count, marketplace_id) VALUES (q, hits, mkt);
END;
$$;

-- ── Mest sökta de senaste 60 dagarna (minst tre sökningar) ──────────────
CREATE OR REPLACE FUNCTION public.popular_searches(
  p_limit INTEGER DEFAULT 6,
  p_marketplace_id UUID DEFAULT NULL
)
RETURNS TABLE (query TEXT, searches BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.query, count(*) AS searches
  FROM search_queries s
  WHERE s.created_at > now() - interval '60 days'
    AND s.marketplace_id IS NOT DISTINCT FROM p_marketplace_id
  GROUP BY s.query
  HAVING count(*) >= 3
  ORDER BY count(*) DESC, max(s.created_at) DESC
  LIMIT least(greatest(coalesce(p_limit, 6), 1), 20)
$$;

REVOKE ALL ON FUNCTION public.log_search_query(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.popular_searches(INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_search_query(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.popular_searches(INTEGER, UUID) TO anon, authenticated;
