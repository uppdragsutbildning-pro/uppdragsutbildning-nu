-- Sparade rapporter från Strategiskt kompetensindex.
--
-- En inloggad köpare kan spara rapporten som en fullständig, oföränderlig ögonblicksbild (svar, poäng,
-- yrkesroller, kompetenser och AI-texter) och gå tillbaka till den i Mitt konto. Rapporten ägs av
-- användaren (owner_id) och är bara läsbar för ägaren. Skrivning sker enbart via save_my_report(), som
-- kräver inloggning. Klienten har varken INSERT- eller UPDATE-policy. Ägaren kan radera sina rapporter.
--
-- Tabellen cpi_results (anonym Quick Scan för adminstatistik) rörs inte.

CREATE TABLE public.ski_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Idempotensnyckel från klienten: samma rapport sparas aldrig två gånger (t.ex. efter inloggningsflödet).
  client_report_id UUID NOT NULL,
  company_name TEXT NOT NULL CHECK (length(trim(company_name)) > 0),
  total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  -- Hela rapporten: { result: {...}, analysis: {...} }
  report JSONB NOT NULL,
  -- Version av rapportens JSON-format, så att äldre rapporter kan visas även när formatet ändras.
  report_version INTEGER NOT NULL DEFAULT 1,
  -- Vilken samtyckestext användaren godkände när rapporten sparades.
  consent_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_report_id)
);

CREATE INDEX idx_ski_reports_owner_created ON public.ski_reports (owner_id, created_at DESC);

ALTER TABLE public.ski_reports ENABLE ROW LEVEL SECURITY;

-- Bara ägaren läser och raderar. Ingen INSERT/UPDATE-policy: skrivning går via save_my_report().
CREATE POLICY "Owners can view their reports"
  ON public.ski_reports FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their reports"
  ON public.ski_reports FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ── Spara rapport ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_my_report(
  p_client_report_id UUID,
  p_company_name TEXT,
  p_total_score INTEGER,
  p_report JSONB,
  p_consent_version TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  existing UUID;
  new_id UUID;
BEGIN
  -- Uttryckliga kontroller före någon jämförelse: en oautentiserad anropare har auth.uid() = NULL,
  -- och NULL-jämförelser får inte tolkas som tillåtet.
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_client_report_id IS NULL OR p_report IS NULL OR p_consent_version IS NULL
     OR p_company_name IS NULL OR length(trim(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'Missing required fields' USING ERRCODE = '22023';
  END IF;
  IF p_total_score IS NULL OR p_total_score < 0 OR p_total_score > 100 THEN
    RAISE EXCEPTION 'Invalid score' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_report) <> 'object' THEN
    RAISE EXCEPTION 'Invalid report' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_report) > 500000 THEN
    RAISE EXCEPTION 'Report too large' USING ERRCODE = '54000';
  END IF;

  -- Samma rapport sparad tidigare (t.ex. dubbel körning efter inloggning): returnera den befintliga.
  SELECT id INTO existing FROM ski_reports
    WHERE owner_id = caller AND client_report_id = p_client_report_id;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  -- Skydd mot missbruk: högst 100 sparade rapporter per användare.
  IF (SELECT count(*) FROM ski_reports WHERE owner_id = caller) >= 100 THEN
    RAISE EXCEPTION 'Report limit reached' USING ERRCODE = '53400';
  END IF;

  INSERT INTO ski_reports (owner_id, client_report_id, company_name, total_score, report, consent_version)
  VALUES (caller, p_client_report_id, left(trim(p_company_name), 200), p_total_score, p_report, left(p_consent_version, 50))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_report(UUID, TEXT, INTEGER, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_report(UUID, TEXT, INTEGER, JSONB, TEXT) TO authenticated;
