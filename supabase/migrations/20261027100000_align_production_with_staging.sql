-- Paritet mellan Production och Staging (2026-10-27).
--
-- Production har äldre policyer som Staging aldrig fick eller har städat bort. Den här migrationen tar
-- bort dem och är idempotent (DROP POLICY IF EXISTS), så den är en no-op i Staging. Varje borttagen
-- policy är antingen en dubblett eller täcks av en annan policy som finns kvar i båda miljöerna:
--
--   cpi_results   "Allow admin reads"   SELECT TO authenticated USING (true)
--                 Gav VARJE inloggad användare läsrätt på alla Kompetensindex-svar, inklusive namn och
--                 e-post. Admin läser via "Admins can read cpi_results" (is_admin()). Blir akut när
--                 köpare kan logga in (Mitt konto).
--                 "Allow anonymous inserts": dubblett av "Anyone can insert cpi_results".
--   providers, scheduled_starts, curriculum_modules, training_faq, trainings   "Public read"
--                 Läste alla rader (providers: även inaktiva). Kvar finns "Public can view ...".
--   categories    "Public read": dubblett av "Anyone can view categories".
--   applications  "Anyone can create": dubblett av "Anyone can create applications".
--                 "Provider read own": dubblett av "Providers can view applications for their trainings".
--   custom_requests "Allow anonymous inserts on custom_requests", "Anyone can create": dubbletter av
--                 "Anyone can create custom requests". "Provider read own": ersätts av
--                 "Providers can view own custom requests" (migration 20261026110000).
--   trainings     "Provider manage own": ALL via profiles.provider_id, täcks av de fyra
--                 "Providers can ..."-policyerna via get_user_provider_id().
--
-- Därefter låses kolumner som är NOT NULL i Staging men nullable i Production (alla har defaultvärden).
-- Bara kolumner utan NULL-värden låses; övriga hoppas över med ett meddelande.
--
-- Production behåller medvetet sina äldre index och updated_at-triggers (Staging saknar dem).

DROP POLICY IF EXISTS "Allow admin reads" ON public.cpi_results;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.cpi_results;

DROP POLICY IF EXISTS "Public read" ON public.providers;
DROP POLICY IF EXISTS "Public read" ON public.scheduled_starts;
DROP POLICY IF EXISTS "Public read" ON public.curriculum_modules;
DROP POLICY IF EXISTS "Public read" ON public.training_faq;
DROP POLICY IF EXISTS "Public read" ON public.trainings;
DROP POLICY IF EXISTS "Public read" ON public.categories;

DROP POLICY IF EXISTS "Anyone can create" ON public.applications;
DROP POLICY IF EXISTS "Provider read own" ON public.applications;

DROP POLICY IF EXISTS "Allow anonymous inserts on custom_requests" ON public.custom_requests;
DROP POLICY IF EXISTS "Anyone can create" ON public.custom_requests;
DROP POLICY IF EXISTS "Provider read own" ON public.custom_requests;

DROP POLICY IF EXISTS "Provider manage own" ON public.trainings;

DO $$
DECLARE
  c RECORD;
  n BIGINT;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('applications', 'submitted_at'), ('applications', 'updated_at'),
      ('categories', 'created_at'),
      ('custom_requests', 'ai_score'), ('custom_requests', 'submitted_at'), ('custom_requests', 'updated_at'),
      ('profiles', 'created_at'), ('profiles', 'is_active'), ('profiles', 'updated_at'),
      ('providers', 'created_at'), ('providers', 'is_active'), ('providers', 'updated_at'),
      ('scheduled_starts', 'created_at'), ('scheduled_starts', 'language'), ('scheduled_starts', 'updated_at'),
      ('trainings', 'created_at'), ('trainings', 'featured'), ('trainings', 'is_active'), ('trainings', 'is_popular'),
      ('trainings', 'leads'), ('trainings', 'updated_at'), ('trainings', 'views')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col AND is_nullable = 'YES'
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NULL', c.tbl, c.col) INTO n;
      IF n = 0 THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', c.tbl, c.col);
      ELSE
        RAISE NOTICE 'Hoppar över %.%: % rader har NULL', c.tbl, c.col, n;
      END IF;
    END IF;
  END LOOP;
END $$;
