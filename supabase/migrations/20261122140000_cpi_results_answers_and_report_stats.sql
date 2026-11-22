-- Admin: svaren på skalfrågorna sparas i cpi_results (så att adminvyn kan visa varje fråga som i rapporten/PDF:en)
-- och en funktion som ger antal sparade rapporter (utan innehåll) till adminöversikten.
--
-- Inga destruktiva ändringar: en ny nullable kolumn och en ny funktion. Befintliga rader och policyer rörs inte.

-- Svar på skalfrågorna, utan kontaktuppgifter: { af1..af3, pf1..pf4, ok1..ok4, tr1..tr3, si1..si4 } (värden 1-5).
-- NULL för analyser som gjordes innan kolumnen fanns.
ALTER TABLE public.cpi_results ADD COLUMN IF NOT EXISTS answers JSONB;

-- Antal sparade rapporter (ski_reports) för adminöversikten. Bara siffror, aldrig rapporternas innehåll:
-- ski_reports har medvetet ingen läspolicy för admin.
CREATE OR REPLACE FUNCTION public.admin_ski_report_stats()
RETURNS TABLE (saved_total BIGINT, saved_last_30d BIGINT, users_with_reports BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- is_admin() ger NULL för oinloggade; coalesce gör att NULL aldrig tolkas som tillåtet.
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      count(*),
      count(*) FILTER (WHERE created_at > now() - interval '30 days'),
      count(DISTINCT owner_id)
    FROM ski_reports;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ski_report_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ski_report_stats() TO authenticated;
