-- Del 1 av 3: äldre migrationer som saknas i Production, plus paritet med Staging
-- Genererad 2026-10-27 av migrationsfilerna i supabase/migrations. Körs som EN transaktion: går något fel rullas allt tillbaka.
-- Projekt: PRODUCTION (iswctazjdtirrzswqkor). Kontrollera projektet innan Run.

BEGIN;

-- ═══ 20260806181149_add_missing_fk_indexes.sql ═══
-- Index på foreign keys som saknade dem: förbättrar joins/cascading deletes vid skalning.

create index if not exists idx_curriculum_modules_training
  on curriculum_modules(training_id);

create index if not exists idx_training_faq_training
  on training_faq(training_id);

create index if not exists idx_applications_scheduled_start
  on applications(scheduled_start_id);

create index if not exists idx_custom_requests_training
  on custom_requests(training_id);


-- ═══ 20260806215417_add_course_brochures_storage.sql ═══
-- Privat Storage-bucket för kursbroschyrer (PDF) som leverantörer laddar upp
-- för AI-extraktion. Varje leverantör kan bara läsa/skriva sin egen mapp
-- ({provider_id}/...), enligt samma get_user_provider_id()-funktion som
-- redan används för trainings/curriculum_modules/training_faq/scheduled_starts.

insert into storage.buckets (id, name, public)
values ('course-brochures', 'course-brochures', false);

create policy "Providers manage own brochures"
on storage.objects for all
using (
  bucket_id = 'course-brochures'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
)
with check (
  bucket_id = 'course-brochures'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
);


-- ═══ 20260806222849_add_course_images_storage.sql ═══
-- Publik Storage-bucket för kursbilder som leverantörer laddar upp via
-- redigeringsformuläret. Till skillnad från course-brochures (privat) är
-- denna publik, eftersom kursbilder visas öppet i katalogen för alla besökare.
-- Skrivrättigheter är fortfarande scopade per leverantör via provider_id-prefix,
-- samma mönster som course-brochures.

insert into storage.buckets (id, name, public)
values ('course-images', 'course-images', true);

create policy "Providers manage own course images"
on storage.objects for all
using (
  bucket_id = 'course-images'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
)
with check (
  bucket_id = 'course-images'
  and (storage.foldername(name))[1] = get_user_provider_id()::text
);


-- ═══ 20260917100000_allow_null_email_log_recipient.sql ═══
-- Tillåter NULL i recipient_email så att ett misslyckat utskick (t.ex. en
-- leverantör som saknar contact_email) kan loggas med status='failed' istället
-- för att tystas ned helt innan e-postadressen ens är känd.

alter table email_log alter column recipient_email drop not null;


-- ═══ 20260917153000_add_slug_to_trainings.sql ═══
-- Lägger till en SEO-vänlig slug per kurs (t.ex. "ledarskap-for-nya-chefer")
-- för den kanoniska URL:en /kurs/{slug}, som ersätter /training/{uuid} som
-- primär, indexerad URL (den gamla UUID-routen fortsätter fungera som ett
-- alias i frontend, se src/app/routes.tsx).
--
-- Backfill sker i tre steg: (1) generera en bas-slug ur titeln, (2) para ihop
-- dubbletter (samma bas-slug) med ett löpnummer-suffix så unikheten kan
-- garanteras, (3) lås fältet med NOT NULL + UNIQUE. Nya rader får sin slug
-- från applikationslagret (src/lib/slug.ts) vid skapande.

alter table trainings add column slug text;

with slugged as (
  select
    id,
    coalesce(
      nullif(
        trim(both '-' from
          regexp_replace(
            translate(
              lower(title),
              'åäöàáâãéèêëíìîïóòôõúùûüçñø',
              'aaoaaaaeeeeiiiiooooouuuucno'
            ),
            '[^a-z0-9]+', '-', 'g'
          )
        ),
        ''
      ),
      'kurs-' || substr(id::text, 1, 8)
    ) as base_slug
  from trainings
),
numbered as (
  select id, base_slug,
    row_number() over (partition by base_slug order by id) as rn
  from slugged
)
update trainings t
set slug = case when n.rn = 1 then n.base_slug else n.base_slug || '-' || n.rn::text end
from numbered n
where t.id = n.id;

alter table trainings alter column slug set not null;
alter table trainings add constraint trainings_slug_key unique (slug);


-- ═══ 20260917180000_add_provider_terms.sql ═══
-- Leverantörsspecifik villkorstext, visas för deltagare via /leverantor/{id}/villkor
-- och länkas till från "Anmälan bekräftad"-mejlet.
ALTER TABLE providers ADD COLUMN terms_text TEXT;

-- Leverantörer har idag ingen generell UPDATE-policy på providers (bara admins, se
-- "Admins can do everything with providers" i 02_row_level_security.sql). En bred
-- UPDATE-policy för providers skulle exponera fält som name/is_active för redigering,
-- inte bara villkorstexten. Denna SECURITY DEFINER-funktion skriver därför enbart
-- terms_text, och enbart för anroparens egen leverantör (eller valfri leverantör om
-- anroparen är admin, samma mönster som is_admin()-koll i övriga policies).
CREATE OR REPLACE FUNCTION update_provider_terms(target_provider_id UUID, new_terms_text TEXT)
RETURNS VOID AS $$
DECLARE
  caller_provider_id UUID := get_user_provider_id();
BEGIN
  -- get_user_provider_id() returnerar NULL för en oautentiserad/icke-provider-anropare.
  -- "target_provider_id = NULL" utvärderas då till NULL (inte false), och
  -- "IF NOT (false OR NULL)" är NULL => grenen körs INTE => RAISE skulle tyst hoppas
  -- över och vem som helst kunde skriva över valfri leverantörs villkor. Därför
  -- kollas caller_provider_id explicit mot NULL innan jämförelsen.
  IF NOT (is_admin() OR (caller_provider_id IS NOT NULL AND target_provider_id = caller_provider_id)) THEN
    RAISE EXCEPTION 'Not authorized to update this provider''s terms';
  END IF;

  UPDATE providers
  SET terms_text = new_terms_text, updated_at = NOW()
  WHERE id = target_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION update_provider_terms(UUID, TEXT) TO authenticated;


-- ═══ 20261015120000_create_buyer_accounts.sql ═══
-- Köparkonton för "Mitt konto" (etapp 1).
--
-- Köpare loggar in med e-postlänk (Supabase Auth) och har ingen rad i
-- `profiles` (den tabellens role är bara 'admin'/'provider'). Köparens
-- tillhörighet ligger i organization_members. Alla skrivningar mot
-- organizations/organization_members går via SECURITY DEFINER-funktioner –
-- inga INSERT/UPDATE/DELETE-policies för klienten.

-- ── Tabeller ────────────────────────────────────────────────────────────
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  organization_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  role_title TEXT,
  access_role TEXT NOT NULL DEFAULT 'owner'
    CHECK (access_role IN ('owner', 'admin', 'buyer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user ON public.organization_members(user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ── Hjälpfunktion (SECURITY DEFINER undviker cirkulär RLS, jfr Paket G) ──
CREATE OR REPLACE FUNCTION public.my_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_organization_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_organization_ids() TO authenticated;

-- ── RLS: endast läsning ─────────────────────────────────────────────────
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.my_organization_ids()) OR is_admin());

CREATE POLICY "Users can view their own memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ── Koppling förfrågan → organisation ───────────────────────────────────
ALTER TABLE public.custom_requests
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_requests_organization ON public.custom_requests(organization_id);

CREATE POLICY "Members can view their organization's requests"
  ON public.custom_requests FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.my_organization_ids()));

-- Anonym INSERT är tillåten på custom_requests (WITH CHECK (true)), så
-- organization_id får aldrig kunna sättas fritt av klienten: vid INSERT
-- behålls värdet bara om anroparen är medlem i den organisationen, och
-- vid UPDATE får det bara ändras av admin eller claim_my_requests().
CREATE OR REPLACE FUNCTION public.guard_custom_request_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL
       AND NOT (NEW.organization_id IN (SELECT public.my_organization_ids())) THEN
      NEW.organization_id := NULL;
    END IF;
  ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT (is_admin() OR coalesce(current_setting('app.claiming', true), '') = '1') THEN
      RAISE EXCEPTION 'organization_id på en förfrågan kan inte ändras'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_custom_request_organization
  BEFORE INSERT OR UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_organization();

-- ── RPC: koppla äldre förfrågningar (samma verifierade e-post) ──────────
CREATE OR REPLACE FUNCTION public.claim_my_requests()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_email TEXT;
  caller_org UUID;
  claimed INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = caller AND email_confirmed_at IS NOT NULL;

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'E-postadressen är inte verifierad' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO caller_org
  FROM organization_members WHERE user_id = caller LIMIT 1;

  IF caller_org IS NULL THEN
    RAISE EXCEPTION 'Ingen organisation för användaren' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.claiming', '1', true);

  UPDATE custom_requests
  SET organization_id = caller_org
  WHERE organization_id IS NULL
    AND lower(contact_email) = lower(caller_email);

  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END;
$$;

-- ── RPC: skapa egen organisation vid första inloggningen ────────────────
CREATE OR REPLACE FUNCTION public.create_my_organization(
  p_name TEXT,
  p_organization_number TEXT,
  p_display_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  new_org UUID;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- En organisation per användare i v1.
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = caller) THEN
    RAISE EXCEPTION 'Användaren tillhör redan en organisation' USING ERRCODE = '23505';
  END IF;

  INSERT INTO organizations (name, organization_number)
  VALUES (trim(p_name), nullif(trim(coalesce(p_organization_number, '')), ''))
  RETURNING id INTO new_org;

  INSERT INTO organization_members (organization_id, user_id, display_name, access_role)
  VALUES (new_org, caller, trim(p_display_name), 'owner');

  PERFORM public.claim_my_requests();

  RETURN new_org;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_organization(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_organization(TEXT, TEXT, TEXT) TO authenticated;


-- ═══ 20261015120100_guard_custom_request_organization_definer.sql ═══
-- Rättelse av 20261015120000: triggerfunktionen kördes som anroparen, och anon
-- har (avsiktligt) inte EXECUTE på my_organization_ids(). Ett anonymt inskick
-- med ett organization_id i payloaden gav därför "permission denied" i stället
-- för att värdet nollades. SECURITY DEFINER gör att kontrollen körs oavsett
-- roll; auth.uid() läses fortfarande från anroparens JWT.

CREATE OR REPLACE FUNCTION public.guard_custom_request_organization()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL
       AND NOT (NEW.organization_id IN (SELECT public.my_organization_ids())) THEN
      NEW.organization_id := NULL;
    END IF;
  ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT (is_admin() OR coalesce(current_setting('app.claiming', true), '') = '1') THEN
      RAISE EXCEPTION 'organization_id på en förfrågan kan inte ändras'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_organization() FROM PUBLIC, anon, authenticated;


-- ═══ 20261015120200_claim_my_requests_reset_flag.sql ═══
-- Härdning: claim_my_requests() sätter transaktionslokala flaggan app.claiming
-- för att få ändra custom_requests.organization_id förbi guard-triggern. Flaggan
-- nollas nu direkt efter UPDATE så att den inte läcker till övriga satser i
-- samma transaktion (t.ex. om funktionen anropas inifrån en längre RPC).

CREATE OR REPLACE FUNCTION public.claim_my_requests()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_email TEXT;
  caller_org UUID;
  claimed INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = caller AND email_confirmed_at IS NOT NULL;

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'E-postadressen är inte verifierad' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO caller_org
  FROM organization_members WHERE user_id = caller LIMIT 1;

  IF caller_org IS NULL THEN
    RAISE EXCEPTION 'Ingen organisation för användaren' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.claiming', '1', true);

  UPDATE custom_requests
  SET organization_id = caller_org
  WHERE organization_id IS NULL
    AND lower(contact_email) = lower(caller_email);

  GET DIAGNOSTICS claimed = ROW_COUNT;

  PERFORM set_config('app.claiming', '', true);

  RETURN claimed;
END;
$$;


-- ═══ 20261021153821_add_rfp_matching_columns.sql ═══
ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS recommended_categories text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS has_provider_match boolean DEFAULT false;


-- ═══ 20261027100000_align_production_with_staging.sql ═══
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

COMMIT;
