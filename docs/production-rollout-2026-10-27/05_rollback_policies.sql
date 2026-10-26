-- Återställer de policyer som 01_legacy_parity.sql tar bort (exakta definitioner hämtade ur Production
-- 2026-10-27, före utrullningen). Använd bara om något visar sig sluta fungera efter utrullningen.
-- OBS: "Allow admin reads" på cpi_results ger alla inloggade läsrätt på kompetensindexsvar med
-- kontaktuppgifter. Återställ den INTE om det inte är absolut nödvändigt.
-- Övriga delar av utrullningen är additiva (nya tabeller, kolumner, funktioner) och rullas inte tillbaka
-- här; återställ vid behov från Supabase-backupen.

BEGIN;
CREATE POLICY "Anyone can create" ON public.applications AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Provider read own" ON public.applications AS PERMISSIVE FOR SELECT TO public USING ((training_id IN ( SELECT trainings.id
   FROM trainings
  WHERE (trainings.provider_id = ( SELECT profiles.provider_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Public read" ON public.categories AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow anonymous inserts" ON public.cpi_results AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public read" ON public.curriculum_modules AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow anonymous inserts on custom_requests" ON public.custom_requests AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can create" ON public.custom_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Provider read own" ON public.custom_requests AS PERMISSIVE FOR SELECT TO public USING ((training_id IN ( SELECT trainings.id
   FROM trainings
  WHERE (trainings.provider_id = ( SELECT profiles.provider_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Public read" ON public.providers AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Public read" ON public.scheduled_starts AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Public read" ON public.training_faq AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Provider manage own" ON public.trainings AS PERMISSIVE FOR ALL TO public USING ((provider_id = ( SELECT profiles.provider_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Public read" ON public.trainings AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
-- Utelämnad med avsikt: "Allow admin reads" på cpi_results (se ovan).
COMMIT;
