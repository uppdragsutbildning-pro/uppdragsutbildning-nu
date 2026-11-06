-- Avtal, förhandling: versioner, godkännande, tur och notiser.
--
-- Bygger vidare på 20261106100000_create_contracts.sql. Flödet:
--   1. Någon part skapar utkastet (version 1, genererat).
--   2. Parterna laddar växelvis upp justerade versioner (Word eller PDF) med kommentar.
--      Den som laddar upp godkänner sin egen version automatiskt. Motparten måste
--      godkänna den senaste versionen uttryckligen.
--   3. När båda har godkänt samma version är avtalet "agreed" och kan signeras.
--   4. Den signerade PDF:en laddas upp. Status "signed". Ändringar efter det görs som tillägg.
--
-- Status: generated -> negotiating -> agreed -> signed.
-- awaiting_party säger vems tur det är ('buyer', 'provider', 'both' vid signering) och
-- awaiting_since när turen började. Det dagliga cron-jobbet påminner och admin ser fastnade avtal.
--
-- Principer som tidigare: ingen direkt skrivåtkomst, skrivning via SECURITY DEFINER-RPC,
-- versioner kan inte ändras eller raderas, admin kan läsa allt men inte ladda upp versioner
-- eller godkänna (admin kan däremot registrera signerad fil som undantag, t.ex. när parterna
-- förhandlat utanför plattformen).

-- ── contracts: status, tur och påminnelser ─────────────────────────────
ALTER TABLE public.contracts DROP CONSTRAINT contracts_status_check;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_status_check CHECK (status IN ('generated', 'negotiating', 'agreed', 'signed'));

ALTER TABLE public.contracts
  ADD COLUMN awaiting_party TEXT CHECK (awaiting_party IS NULL OR awaiting_party IN ('buyer', 'provider', 'both')),
  ADD COLUMN awaiting_since TIMESTAMPTZ,
  ADD COLUMN last_reminder_at TIMESTAMPTZ,
  ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0 CHECK (reminder_count >= 0),
  ADD COLUMN agreed_version_id UUID;

-- Cron läser bara avtal där någon väntar på någon.
CREATE INDEX idx_contracts_awaiting ON public.contracts(awaiting_since) WHERE awaiting_party IS NOT NULL;

-- ── Versioner och godkännanden ─────────────────────────────────────────
CREATE TABLE public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  -- generated: plattformens utkast (ingen fil, byggs ur contracts.snapshot). edited: uppladdad fil.
  kind TEXT NOT NULL CHECK (kind IN ('generated', 'edited')),
  file_path TEXT,
  file_name TEXT,
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_role TEXT NOT NULL CHECK (uploaded_role IN ('buyer', 'provider', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_versions_no_key UNIQUE (contract_id, version_no),
  CONSTRAINT contract_versions_edited_has_file CHECK (kind <> 'edited' OR (file_path IS NOT NULL AND file_name IS NOT NULL))
);

CREATE INDEX idx_contract_versions_uploaded_by ON public.contract_versions(uploaded_by);

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_agreed_version_fkey
  FOREIGN KEY (agreed_version_id) REFERENCES public.contract_versions(id) ON DELETE RESTRICT;
CREATE INDEX idx_contracts_agreed_version ON public.contracts(agreed_version_id);

CREATE TABLE public.contract_version_approvals (
  version_id UUID NOT NULL REFERENCES public.contract_versions(id) ON DELETE RESTRICT,
  party TEXT NOT NULL CHECK (party IN ('buyer', 'provider')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (version_id, party)
);

CREATE INDEX idx_contract_version_approvals_approved_by ON public.contract_version_approvals(approved_by);

-- Backfill: avtal som skapades före den här migrationen får version 1 (genererat utkast), med
-- skaparens roll hämtad från den första händelsen. Före migrationen fanns bara status
-- generated och signed, och en signerad fil hade ingen version, så bara version 1 skapas.
INSERT INTO public.contract_versions (contract_id, version_no, kind, uploaded_by, uploaded_role, created_at)
SELECT c.id, 1, 'generated', c.generated_by,
       coalesce((SELECT e.actor_role FROM public.contract_events e WHERE e.contract_id = c.id ORDER BY e.created_at LIMIT 1), 'admin'),
       c.generated_at
  FROM public.contracts c;

ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_version_approvals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contract_versions, public.contract_version_approvals FROM anon, authenticated;
GRANT SELECT ON public.contract_versions, public.contract_version_approvals TO authenticated;

CREATE POLICY "Parties can read contract versions"
  ON public.contract_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = contract_id AND public.contract_actor_role(c.booking_id, false) IS NOT NULL
  ));

CREATE POLICY "Parties can read contract version approvals"
  ON public.contract_version_approvals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contract_versions v
      JOIN public.contracts c ON c.id = v.contract_id
     WHERE v.id = version_id AND public.contract_actor_role(c.booking_id, false) IS NOT NULL
  ));

-- ── Händelser: nya typer, och "system" för påminnelser ─────────────────
ALTER TABLE public.contract_events DROP CONSTRAINT contract_events_event_type_check;
ALTER TABLE public.contract_events
  ADD CONSTRAINT contract_events_event_type_check CHECK (event_type IN (
    'generated', 'regenerated', 'version_uploaded', 'version_approved', 'agreed',
    'signed_registered', 'signed_replaced', 'amendment_registered', 'reminder_sent'
  ));

ALTER TABLE public.contract_events DROP CONSTRAINT contract_events_actor_role_check;
ALTER TABLE public.contract_events
  ADD CONSTRAINT contract_events_actor_role_check CHECK (actor_role IN ('buyer', 'provider', 'admin', 'system'));

-- ── Filtyper: Word och PDF får laddas upp som versioner ────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ]
 WHERE id = 'contracts';

-- ── Skapa eller uppdatera utkastet: nu med version 1 ───────────────────
CREATE OR REPLACE FUNCTION public.save_contract_draft(
  p_booking_id UUID,
  p_variant TEXT,
  p_buyer_reference TEXT,
  p_template_version TEXT,
  p_snapshot JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT := contract_actor_role(p_booking_id, true);
  existing contracts%ROWTYPE;
  bstatus TEXT;
  new_id UUID;
  next_no INTEGER;
  ref TEXT := nullif(trim(coalesce(p_buyer_reference, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_variant NOT IN ('state_authority', 'general') THEN
    RAISE EXCEPTION 'Okänd avtalsvariant %', p_variant USING ERRCODE = '22023';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Underlag saknas' USING ERRCODE = '22023';
  END IF;
  IF ref IS NOT NULL AND length(ref) > 200 THEN
    RAISE EXCEPTION 'Referensen får vara högst 200 tecken' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO bstatus FROM bookings WHERE id = p_booking_id;
  IF bstatus = 'cancelled' THEN
    RAISE EXCEPTION 'Bokningen är avbokad' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing FROM contracts WHERE booking_id = p_booking_id FOR UPDATE;

  IF FOUND THEN
    IF existing.status = 'signed' THEN
      RAISE EXCEPTION 'Avtalet är redan signerat och uppladdat. Ändringar görs som tillägg.' USING ERRCODE = '22023';
    END IF;
    IF existing.status IN ('negotiating', 'agreed') THEN
      RAISE EXCEPTION 'Det finns redan uppladdade versioner. Ladda upp en ny version i stället för att skapa om utkastet.' USING ERRCODE = '22023';
    END IF;
    UPDATE contracts
       SET variant = p_variant, buyer_reference = ref, template_version = p_template_version,
           snapshot = p_snapshot, generated_at = now(), generated_by = auth.uid()
     WHERE id = existing.id;
    SELECT coalesce(max(version_no), 0) + 1 INTO next_no FROM contract_versions WHERE contract_id = existing.id;
    INSERT INTO contract_versions (contract_id, version_no, kind, uploaded_by, uploaded_role)
      VALUES (existing.id, next_no, 'generated', auth.uid(), actor);
    INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
      VALUES (existing.id, auth.uid(), actor, 'regenerated',
              jsonb_build_object('variant', p_variant, 'template_version', p_template_version, 'version_no', next_no));
    RETURN existing.id;
  END IF;

  INSERT INTO contracts (booking_id, variant, buyer_reference, template_version, snapshot, generated_by)
    VALUES (p_booking_id, p_variant, ref, p_template_version, p_snapshot, auth.uid())
    RETURNING id INTO new_id;
  INSERT INTO contract_versions (contract_id, version_no, kind, uploaded_by, uploaded_role)
    VALUES (new_id, 1, 'generated', auth.uid(), actor);
  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (new_id, auth.uid(), actor, 'generated',
            jsonb_build_object('variant', p_variant, 'template_version', p_template_version, 'version_no', 1));
  RETURN new_id;
END;
$$;

-- ── Ladda upp en justerad version ──────────────────────────────────────
-- Bara köparen och lärosätet. Den som laddar upp godkänner sin egen version, och turen går
-- till motparten. En ny version gör tidigare godkännanden ogiltiga (de gäller en viss version).
CREATE OR REPLACE FUNCTION public.upload_contract_version(
  p_contract_id UUID,
  p_file_path TEXT,
  p_file_name TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c contracts%ROWTYPE;
  actor TEXT;
  fname TEXT := nullif(trim(coalesce(p_file_name, '')), '');
  cmt TEXT := nullif(trim(coalesce(p_comment, '')), '');
  prefix TEXT;
  next_no INTEGER;
  vid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avtalet hittades inte' USING ERRCODE = 'P0002';
  END IF;
  actor := contract_actor_role(c.booking_id, true);
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF actor NOT IN ('buyer', 'provider') THEN
    RAISE EXCEPTION 'Bara köparen och lärosätet kan ladda upp versioner' USING ERRCODE = '42501';
  END IF;
  IF c.status = 'signed' THEN
    RAISE EXCEPTION 'Avtalet är redan signerat. Ändringar görs som tillägg.' USING ERRCODE = '22023';
  END IF;
  IF fname IS NULL OR length(fname) > 255 OR fname !~* '\.(docx?|pdf)$' THEN
    RAISE EXCEPTION 'Filen ska vara Word (.doc, .docx) eller PDF' USING ERRCODE = '22023';
  END IF;
  IF cmt IS NOT NULL AND length(cmt) > 1000 THEN
    RAISE EXCEPTION 'Kommentaren får vara högst 1000 tecken' USING ERRCODE = '22023';
  END IF;
  prefix := c.booking_id::text || '/' || c.id::text || '/';
  IF p_file_path IS NULL OR left(p_file_path, length(prefix)) <> prefix THEN
    RAISE EXCEPTION 'Ogiltig filsökväg' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'contracts' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Filen finns inte uppladdad' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(version_no), 0) + 1 INTO next_no FROM contract_versions WHERE contract_id = c.id;
  INSERT INTO contract_versions (contract_id, version_no, kind, file_path, file_name, comment, uploaded_by, uploaded_role)
    VALUES (c.id, next_no, 'edited', p_file_path, fname, cmt, auth.uid(), actor)
    RETURNING id INTO vid;
  INSERT INTO contract_version_approvals (version_id, party, approved_by) VALUES (vid, actor, auth.uid());

  UPDATE contracts
     SET status = 'negotiating',
         agreed_version_id = NULL,
         awaiting_party = CASE actor WHEN 'buyer' THEN 'provider' ELSE 'buyer' END,
         awaiting_since = now(),
         last_reminder_at = NULL,
         reminder_count = 0
   WHERE id = c.id;

  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (c.id, auth.uid(), actor, 'version_uploaded',
            jsonb_build_object('version_no', next_no, 'file_name', fname, 'comment', cmt));
  RETURN next_no;
END;
$$;

-- ── Godkänn den senaste versionen ──────────────────────────────────────
-- Returnerar avtalets nya status. När båda parter godkänt samma version blir avtalet "agreed".
CREATE OR REPLACE FUNCTION public.approve_contract_version(p_version_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v contract_versions%ROWTYPE;
  c contracts%ROWTYPE;
  actor TEXT;
  latest_no INTEGER;
  inserted INTEGER;
  approved_parties INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v FROM contract_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versionen hittades inte' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO c FROM contracts WHERE id = v.contract_id FOR UPDATE;
  actor := contract_actor_role(c.booking_id, true);
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF actor NOT IN ('buyer', 'provider') THEN
    RAISE EXCEPTION 'Bara köparen och lärosätet kan godkänna' USING ERRCODE = '42501';
  END IF;

  IF c.status = 'agreed' AND c.agreed_version_id = v.id THEN
    RETURN 'agreed';
  END IF;
  IF c.status <> 'negotiating' THEN
    RAISE EXCEPTION 'Det finns ingen version att godkänna just nu' USING ERRCODE = '22023';
  END IF;
  SELECT max(version_no) INTO latest_no FROM contract_versions WHERE contract_id = c.id;
  IF v.kind <> 'edited' OR v.version_no <> latest_no THEN
    RAISE EXCEPTION 'Bara den senaste uppladdade versionen kan godkännas' USING ERRCODE = '22023';
  END IF;

  INSERT INTO contract_version_approvals (version_id, party, approved_by)
    VALUES (v.id, actor, auth.uid())
    ON CONFLICT (version_id, party) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted > 0 THEN
    INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
      VALUES (c.id, auth.uid(), actor, 'version_approved', jsonb_build_object('version_no', v.version_no));
  END IF;

  SELECT count(DISTINCT party) INTO approved_parties FROM contract_version_approvals WHERE version_id = v.id;
  IF approved_parties = 2 THEN
    UPDATE contracts
       SET status = 'agreed', agreed_version_id = v.id, awaiting_party = 'both',
           awaiting_since = now(), last_reminder_at = NULL, reminder_count = 0
     WHERE id = c.id;
    INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
      VALUES (c.id, auth.uid(), actor, 'agreed', jsonb_build_object('version_no', v.version_no));
    RETURN 'agreed';
  END IF;
  RETURN 'negotiating';
END;
$$;

-- ── Registrera signerat avtal: kräver att båda godkänt (admin undantaget) ─
CREATE OR REPLACE FUNCTION public.register_signed_contract(
  p_contract_id UUID,
  p_file_path TEXT,
  p_file_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c contracts%ROWTYPE;
  actor TEXT;
  fname TEXT := nullif(trim(coalesce(p_file_name, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO c FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avtalet hittades inte' USING ERRCODE = 'P0002';
  END IF;
  actor := contract_actor_role(c.booking_id, true);
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF c.status NOT IN ('agreed', 'signed') AND actor <> 'admin' THEN
    RAISE EXCEPTION 'Båda parter måste godkänna en version innan det signerade avtalet kan registreras' USING ERRCODE = '22023';
  END IF;
  IF fname IS NULL OR length(fname) > 255 OR fname !~* '\.pdf$' THEN
    RAISE EXCEPTION 'Det signerade avtalet ska vara en PDF-fil' USING ERRCODE = '22023';
  END IF;
  IF p_file_path IS NULL OR left(p_file_path, length(c.booking_id::text || '/' || c.id::text || '/')) <> c.booking_id::text || '/' || c.id::text || '/' THEN
    RAISE EXCEPTION 'Ogiltig filsökväg' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'contracts' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Filen finns inte uppladdad' USING ERRCODE = '22023';
  END IF;

  UPDATE contracts
     SET status = 'signed', signed_file_path = p_file_path, signed_file_name = fname,
         signed_registered_at = now(), signed_registered_by = auth.uid(), signed_registered_role = actor,
         awaiting_party = NULL, awaiting_since = NULL, last_reminder_at = NULL, reminder_count = 0
   WHERE id = c.id;

  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (c.id, auth.uid(), actor,
            CASE WHEN c.status = 'signed' THEN 'signed_replaced' ELSE 'signed_registered' END,
            jsonb_build_object('file_name', fname, 'previous_file_name', c.signed_file_name));
END;
$$;

-- ── Admin: överblick över alla bokningar och deras avtalsstatus ────────
-- Bokningar utan avtal ingår (status 'none'), så att admin ser vad som saknar avtal.
CREATE OR REPLACE FUNCTION public.admin_list_contracts()
RETURNS TABLE (
  booking_id UUID,
  booking_title TEXT,
  start_date DATE,
  buyer_name TEXT,
  provider_name TEXT,
  contract_id UUID,
  status TEXT,
  awaiting_party TEXT,
  awaiting_since TIMESTAMPTZ,
  variant TEXT,
  buyer_reference TEXT,
  latest_version_no INTEGER,
  version_count INTEGER,
  buyer_approved BOOLEAN,
  provider_approved BOOLEAN,
  amendments_count INTEGER,
  signed_registered_at TIMESTAMPTZ,
  reminder_count INTEGER,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT b.id, b.title, b.start_date, o.name, p.name,
           c.id, coalesce(c.status, 'none'), c.awaiting_party, c.awaiting_since, c.variant, c.buyer_reference,
           lv.version_no,
           (SELECT count(*)::integer FROM contract_versions v WHERE v.contract_id = c.id),
           coalesce(EXISTS (SELECT 1 FROM contract_version_approvals a WHERE a.version_id = lv.id AND a.party = 'buyer'), false),
           coalesce(EXISTS (SELECT 1 FROM contract_version_approvals a WHERE a.version_id = lv.id AND a.party = 'provider'), false),
           (SELECT count(*)::integer FROM contract_amendments am WHERE am.contract_id = c.id),
           c.signed_registered_at, coalesce(c.reminder_count, 0),
           coalesce(c.updated_at, b.confirmed_at)
      FROM bookings b
      JOIN organizations o ON o.id = b.buyer_org_id
      JOIN providers p ON p.id = b.provider_id
      LEFT JOIN contracts c ON c.booking_id = b.id
      LEFT JOIN LATERAL (
        SELECT v.id, v.version_no FROM contract_versions v
         WHERE v.contract_id = c.id AND v.kind = 'edited'
         ORDER BY v.version_no DESC LIMIT 1
      ) lv ON true
     WHERE b.status <> 'cancelled'
     ORDER BY coalesce(c.updated_at, b.confirmed_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.upload_contract_version(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_contract_version(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_contracts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upload_contract_version(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_contract_version(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_contracts() TO authenticated;

-- ── Notiser: händelser som motparten ska få veta om ────────────────────
-- Samma mönster som övriga notiser: trigger -> notify_webhook() -> api/notify-webhook.ts.
-- Vem som mejlas och med vilken text avgörs i webhooken. Påminnelser skickas av det dagliga cron-jobbet.
CREATE TRIGGER trg_notify_contract_events
  AFTER INSERT ON public.contract_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('version_uploaded', 'agreed', 'signed_registered', 'signed_replaced', 'amendment_registered'))
  EXECUTE FUNCTION public.notify_webhook();
