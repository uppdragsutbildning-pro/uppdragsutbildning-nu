-- Avtal om uppdragsutbildning, Steg 0.
--
-- Plattformen tar fram ett avtalsutkast ur bokningens data. Parterna redigerar och
-- signerar utanför plattformen, och laddar upp den signerade filen. Avtalet räknas
-- som giltigt i plattformen först när den signerade filen är uppladdad.
--
-- Principer:
--  * Tre nya tabeller, alla med RLS. Ingen direkt skrivåtkomst: skrivningar sker via
--    SECURITY DEFINER-RPC som kontrollerar att anroparen är part i bokningen.
--  * Parter: köparorganisationens medlemmar (skriva kräver owner/admin/buyer, viewer
--    får bara läsa), bokningens lärosäte och admin.
--  * Filer ligger i en privat bucket "contracts". Inga UPDATE- eller DELETE-policies:
--    en uppladdad fil kan inte skrivas över eller raderas av användare. En ersättning
--    laddas upp som en ny fil och loggas.
--  * Ett avtal per bokning (UNIQUE). Ändringar och tillägg är en egen tabell med
--    signerad fil per tillägg.
--  * Provision och utbetalning finns aldrig i avtalsdata (snapshot).

-- ── Tabeller ────────────────────────────────────────────────────────────
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  -- state_authority: tvist hänskjuts till regeringen (statlig part mot statlig part).
  -- general: tvist avgörs av allmän domstol (kommun, region, företag).
  variant TEXT NOT NULL CHECK (variant IN ('state_authority', 'general')),
  -- Valfri referens, t.ex. diarienummer. Förifylls från bokningens referens men kan ändras.
  buyer_reference TEXT CHECK (buyer_reference IS NULL OR length(buyer_reference) <= 200),
  template_version TEXT NOT NULL,
  -- De uppgifter utkastet byggdes på, frysta vid generering.
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'signed')),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_file_path TEXT,
  signed_file_name TEXT,
  signed_registered_at TIMESTAMPTZ,
  signed_registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_registered_role TEXT CHECK (signed_registered_role IS NULL OR signed_registered_role IN ('buyer', 'provider', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contracts_signed_has_file CHECK (status <> 'signed' OR signed_file_path IS NOT NULL)
);

CREATE INDEX idx_contracts_generated_by ON public.contracts(generated_by);
CREATE INDEX idx_contracts_signed_registered_by ON public.contracts(signed_registered_by);

CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.tr_set_updated_at();

-- Ändringar och tillägg: skriftliga och undertecknade av båda parter, bifogas avtalet.
CREATE TABLE public.contract_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  seq INTEGER NOT NULL CHECK (seq > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  signed_file_path TEXT NOT NULL,
  signed_file_name TEXT NOT NULL,
  registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  registered_role TEXT NOT NULL CHECK (registered_role IN ('buyer', 'provider', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_amendments_seq_key UNIQUE (contract_id, seq)
);

CREATE INDEX idx_contract_amendments_registered_by ON public.contract_amendments(registered_by);

-- Revisionslogg: vem gjorde vad och när (bevis för att avtalet registrerats).
CREATE TABLE public.contract_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('buyer', 'provider', 'admin')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'generated', 'regenerated', 'signed_registered', 'signed_replaced', 'amendment_registered'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_events_contract ON public.contract_events(contract_id, created_at);
CREATE INDEX idx_contract_events_actor ON public.contract_events(actor_user_id);

-- ── Behörighetsfunktioner ───────────────────────────────────────────────
-- Anroparens roll i en bokning: 'admin', 'provider', 'buyer' eller NULL (ingen part).
-- p_write = true kräver att köparen har owner/admin/buyer (inte viewer).
CREATE OR REPLACE FUNCTION public.contract_actor_role(p_booking_id UUID, p_write BOOLEAN DEFAULT false)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF coalesce(is_admin(), false) THEN
    RETURN 'admin';
  END IF;

  SELECT provider_id, buyer_org_id INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF get_user_provider_id() IS NOT NULL AND b.provider_id = get_user_provider_id() THEN
    RETURN 'provider';
  END IF;

  IF EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = b.buyer_org_id
       AND m.user_id = auth.uid()
       AND (NOT p_write OR m.access_role IN ('owner', 'admin', 'buyer'))
  ) THEN
    RETURN 'buyer';
  END IF;

  RETURN NULL;
END;
$$;

-- För Storage-policyer: första mappen i objektnamnet är bokningens id. Ogiltigt id ger false.
CREATE OR REPLACE FUNCTION public.contract_storage_access(p_object_name TEXT, p_write BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  folder TEXT := (storage.foldername(p_object_name))[1];
BEGIN
  IF folder IS NULL OR folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN contract_actor_role(folder::uuid, p_write) IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.contract_actor_role(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contract_storage_access(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_actor_role(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_storage_access(TEXT, BOOLEAN) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contracts, public.contract_amendments, public.contract_events FROM anon, authenticated;
GRANT SELECT ON public.contracts, public.contract_amendments, public.contract_events TO authenticated;

CREATE POLICY "Parties can read contracts"
  ON public.contracts FOR SELECT TO authenticated
  USING (public.contract_actor_role(booking_id, false) IS NOT NULL);

CREATE POLICY "Parties can read contract amendments"
  ON public.contract_amendments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = contract_id AND public.contract_actor_role(c.booking_id, false) IS NOT NULL
  ));

CREATE POLICY "Parties can read contract events"
  ON public.contract_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = contract_id AND public.contract_actor_role(c.booking_id, false) IS NOT NULL
  ));

-- ── Underlag till avtalsmallen ──────────────────────────────────────────
-- Samlar det mallen behöver ur bokning, offert/kursstart, köpare, lärosäte och säljare.
-- Innehåller aldrig provision, utbetalning eller bankuppgifter.
CREATE OR REPLACE FUNCTION public.get_contract_context(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  q custom_requests%ROWTYPE;
  s scheduled_starts%ROWTYPE;
  org organizations%ROWTYPE;
  prov providers%ROWTYPE;
  prov_org_nr TEXT;
  buyer_name TEXT;
  buyer_email TEXT;
  offer JSONB := NULL;
  start_info JSONB := NULL;
  seller JSONB;
  terms_days INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF contract_actor_role(p_booking_id, false) IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  SELECT * INTO org FROM organizations WHERE id = b.buyer_org_id;
  SELECT * INTO prov FROM providers WHERE id = b.provider_id;
  SELECT payout_org_number INTO prov_org_nr FROM provider_payout_details WHERE provider_id = b.provider_id;

  SELECT m.display_name INTO buyer_name
    FROM organization_members m
   WHERE m.organization_id = b.buyer_org_id AND m.user_id = b.buyer_user_id;
  SELECT u.email INTO buyer_email FROM auth.users u WHERE u.id = b.buyer_user_id;

  IF b.quote_request_id IS NOT NULL THEN
    SELECT * INTO q FROM custom_requests WHERE id = b.quote_request_id;
    offer := jsonb_build_object(
      'end_date', q.offer_end_date,
      'location', q.offer_location,
      'delivery_format', q.offer_delivery_format,
      'duration_hours', q.offer_duration_hours,
      'modules', coalesce(q.offer_modules, '[]'::jsonb),
      'terms', q.offer_terms,
      'valid_until', q.offer_valid_until
    );
  END IF;

  IF b.scheduled_start_id IS NOT NULL THEN
    SELECT * INTO s FROM scheduled_starts WHERE id = b.scheduled_start_id;
    start_info := jsonb_build_object('location', s.location, 'language', s.language);
  END IF;

  SELECT jsonb_build_object('name', bs.seller_name, 'org_number', bs.seller_org_number),
         bs.payment_terms_days
    INTO seller, terms_days
    FROM billing_settings bs;

  RETURN jsonb_build_object(
    'booking', jsonb_build_object(
      'id', b.id,
      'title', b.title,
      'source', b.source,
      'participants', b.participants,
      'unit_price_ex_vat', b.unit_price_ex_vat,
      'total_ex_vat', b.total_ex_vat,
      'vat_rate', b.vat_rate,
      'start_date', b.start_date,
      'confirmed_at', b.confirmed_at,
      'reference', b.reference,
      'status', b.status,
      'cancellation_policy', b.cancellation_policy
    ),
    'offer', offer,
    'start', start_info,
    'buyer', jsonb_build_object(
      'name', org.name,
      'organization_number', org.organization_number,
      'address', org.invoice_address,
      'contact_name', buyer_name,
      'contact_email', buyer_email
    ),
    'provider', jsonb_build_object(
      'name', prov.name,
      'organization_number', prov_org_nr,
      'contact_email', prov.contact_email,
      'contact_phone', prov.contact_phone
    ),
    'seller', seller,
    'payment_terms_days', terms_days
  );
END;
$$;

-- ── Skrivfunktioner ─────────────────────────────────────────────────────
-- Skapar eller uppdaterar utkastet. Ett redan signerat och uppladdat avtal ändras bara
-- genom tillägg, aldrig genom att generera om utkastet.
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
    UPDATE contracts
       SET variant = p_variant, buyer_reference = ref, template_version = p_template_version,
           snapshot = p_snapshot, generated_at = now(), generated_by = auth.uid()
     WHERE id = existing.id;
    INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
      VALUES (existing.id, auth.uid(), actor, 'regenerated',
              jsonb_build_object('variant', p_variant, 'template_version', p_template_version));
    RETURN existing.id;
  END IF;

  INSERT INTO contracts (booking_id, variant, buyer_reference, template_version, snapshot, generated_by)
    VALUES (p_booking_id, p_variant, ref, p_template_version, p_snapshot, auth.uid())
    RETURNING id INTO new_id;
  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (new_id, auth.uid(), actor, 'generated',
            jsonb_build_object('variant', p_variant, 'template_version', p_template_version));
  RETURN new_id;
END;
$$;

-- Registrerar den signerade filen. Filen måste redan ligga i bucketen "contracts" under
-- {booking_id}/{contract_id}/. Avtalet räknas som giltigt i plattformen först här.
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
  IF fname IS NULL OR length(fname) > 255 THEN
    RAISE EXCEPTION 'Filnamn saknas eller är för långt' USING ERRCODE = '22023';
  END IF;
  IF p_file_path IS NULL OR left(p_file_path, length(c.booking_id::text || '/' || c.id::text || '/')) <> c.booking_id::text || '/' || c.id::text || '/' THEN
    RAISE EXCEPTION 'Ogiltig filsökväg' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'contracts' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Filen finns inte uppladdad' USING ERRCODE = '22023';
  END IF;

  UPDATE contracts
     SET status = 'signed', signed_file_path = p_file_path, signed_file_name = fname,
         signed_registered_at = now(), signed_registered_by = auth.uid(), signed_registered_role = actor
   WHERE id = c.id;

  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (c.id, auth.uid(), actor,
            CASE WHEN c.status = 'signed' THEN 'signed_replaced' ELSE 'signed_registered' END,
            jsonb_build_object('file_name', fname, 'previous_file_name', c.signed_file_name));
END;
$$;

-- Registrerar ett signerat tillägg till ett redan signerat avtal.
CREATE OR REPLACE FUNCTION public.register_contract_amendment(
  p_contract_id UUID,
  p_description TEXT,
  p_file_path TEXT,
  p_file_name TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c contracts%ROWTYPE;
  actor TEXT;
  descr TEXT := trim(coalesce(p_description, ''));
  fname TEXT := nullif(trim(coalesce(p_file_name, '')), '');
  next_seq INTEGER;
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
  IF c.status <> 'signed' THEN
    RAISE EXCEPTION 'Tillägg kan bara registreras när avtalet är signerat och uppladdat' USING ERRCODE = '22023';
  END IF;
  IF length(descr) = 0 OR length(descr) > 2000 THEN
    RAISE EXCEPTION 'Beskrivningen ska vara 1 till 2000 tecken' USING ERRCODE = '22023';
  END IF;
  IF fname IS NULL OR length(fname) > 255 THEN
    RAISE EXCEPTION 'Filnamn saknas eller är för långt' USING ERRCODE = '22023';
  END IF;
  IF p_file_path IS NULL OR left(p_file_path, length(c.booking_id::text || '/' || c.id::text || '/')) <> c.booking_id::text || '/' || c.id::text || '/' THEN
    RAISE EXCEPTION 'Ogiltig filsökväg' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'contracts' AND o.name = p_file_path) THEN
    RAISE EXCEPTION 'Filen finns inte uppladdad' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(seq), 0) + 1 INTO next_seq FROM contract_amendments WHERE contract_id = c.id;
  INSERT INTO contract_amendments (contract_id, seq, description, signed_file_path, signed_file_name, registered_by, registered_role)
    VALUES (c.id, next_seq, descr, p_file_path, fname, auth.uid(), actor);
  INSERT INTO contract_events (contract_id, actor_user_id, actor_role, event_type, payload)
    VALUES (c.id, auth.uid(), actor, 'amendment_registered',
            jsonb_build_object('seq', next_seq, 'file_name', fname));
  RETURN next_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.get_contract_context(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_contract_draft(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_signed_contract(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_contract_amendment(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contract_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_contract_draft(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_signed_contract(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_contract_amendment(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- ── Storage: privat bucket för signerade avtal ──────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contracts', 'contracts', false, 15728640, ARRAY['application/pdf']);

CREATE POLICY "Contract parties can read files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND public.contract_storage_access(name, false));

CREATE POLICY "Contract parties can upload files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND public.contract_storage_access(name, true));
