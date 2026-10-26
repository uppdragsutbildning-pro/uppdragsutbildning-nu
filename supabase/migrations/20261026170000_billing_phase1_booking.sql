-- Fakturering Fas 1, paket D: boka kursstart, fakturauppgifter och köparens bokningslista.
--
--  * billing_org_missing_details: vilka fakturauppgifter som saknas på en organisation (intern).
--  * buyer_update_billing_details: owner/admin sparar organisationens fakturauppgifter.
--  * buyer_book_scheduled_start: bokar en kursstart. Fryser pris (à-pris per deltagare × antal),
--    moms, provision och lärosätets avbokningsregler, låser kursstarten, minskar platser och
--    skapar exakt ett preliminärt fakturaunderlag. Idempotent via client_booking_id.
--  * buyer_accept_quote (ersätts): kräver nu fakturauppgifter, i övrigt oförändrad från paket C.
--  * buyer_list_bookings: köparens bokningar (basetabellen är bara läsbar för admin).
--
-- Fakturaadressen lagras som JSON med nycklarna street, postal_code, city (och valfritt co, country).

-- ════════════════════════════════════════════════════════════════════════
-- 1. Saknade fakturauppgifter
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.billing_org_missing_details(p_org_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o organizations%ROWTYPE;
  missing TEXT[] := '{}';
BEGIN
  SELECT * INTO o FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN ARRAY['organization'];
  END IF;
  IF length(trim(coalesce(o.organization_number, ''))) = 0 THEN
    missing := array_append(missing, 'organization_number');
  END IF;
  IF o.invoice_address IS NULL
     OR length(trim(coalesce(o.invoice_address->>'street', ''))) = 0
     OR length(trim(coalesce(o.invoice_address->>'postal_code', ''))) = 0
     OR length(trim(coalesce(o.invoice_address->>'city', ''))) = 0 THEN
    missing := array_append(missing, 'invoice_address');
  END IF;
  IF length(trim(coalesce(o.invoice_email, ''))) = 0 THEN
    missing := array_append(missing, 'invoice_email');
  END IF;
  RETURN missing;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_org_missing_details(UUID) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Köparen sparar fakturauppgifter
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buyer_update_billing_details(
  p_org_id UUID,
  p_organization_number TEXT,
  p_invoice_address JSONB,
  p_invoice_email TEXT,
  p_e_invoice_id TEXT DEFAULT NULL,
  p_vat_number TEXT DEFAULT NULL,
  p_default_reference TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  org_no TEXT := trim(coalesce(p_organization_number, ''));
  email TEXT := trim(coalesce(p_invoice_email, ''));
  addr JSONB;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = p_org_id AND m.user_id = caller
       AND m.access_role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Du har inte behörighet att ändra organisationens fakturauppgifter' USING ERRCODE = '42501';
  END IF;

  IF org_no !~ '^[0-9]{6}-?[0-9]{4}$' THEN
    RAISE EXCEPTION 'Ange organisationsnummer med 10 siffror (t.ex. 556123-4567)' USING ERRCODE = '22023';
  END IF;
  IF email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Ange en giltig e-postadress för fakturor' USING ERRCODE = '22023';
  END IF;
  IF p_invoice_address IS NULL OR jsonb_typeof(p_invoice_address) <> 'object'
     OR length(trim(coalesce(p_invoice_address->>'street', ''))) = 0
     OR length(trim(coalesce(p_invoice_address->>'postal_code', ''))) = 0
     OR length(trim(coalesce(p_invoice_address->>'city', ''))) = 0 THEN
    RAISE EXCEPTION 'Ange fakturaadress med gata, postnummer och ort' USING ERRCODE = '22023';
  END IF;

  -- Bara kända nycklar sparas, och texterna trimmas.
  addr := jsonb_strip_nulls(jsonb_build_object(
    'street', trim(p_invoice_address->>'street'),
    'postal_code', trim(p_invoice_address->>'postal_code'),
    'city', trim(p_invoice_address->>'city'),
    'co', nullif(trim(coalesce(p_invoice_address->>'co', '')), ''),
    'country', coalesce(nullif(trim(coalesce(p_invoice_address->>'country', '')), ''), 'Sverige')
  ));

  UPDATE organizations
     SET organization_number = org_no,
         invoice_address = addr,
         invoice_email = email,
         e_invoice_id = nullif(trim(coalesce(p_e_invoice_id, '')), ''),
         vat_number = nullif(trim(coalesce(p_vat_number, '')), ''),
         default_reference = nullif(trim(coalesce(p_default_reference, '')), '')
   WHERE id = p_org_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Boka kursstart
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buyer_book_scheduled_start(
  p_org_id UUID,
  p_scheduled_start_id UUID,
  p_client_booking_id UUID,
  p_participants INTEGER,
  p_reference TEXT DEFAULT NULL,
  p_cancellation_accepted BOOLEAN DEFAULT FALSE,
  p_marketplace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  s scheduled_starts%ROWTYPE;
  t trainings%ROWTYPE;
  existing_id UUID;
  new_booking UUID;
  vat NUMERIC;
  comm NUMERIC;
  policy JSONB;
  missing TEXT[];
  new_spots INTEGER;
  provider_active BOOLEAN;
  unit_price NUMERIC;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_client_booking_id IS NULL THEN
    RAISE EXCEPTION 'client_booking_id saknas' USING ERRCODE = '22023';
  END IF;

  -- Dubbelklick: samma klient-id ger samma bokning.
  SELECT id INTO existing_id FROM bookings
   WHERE buyer_user_id = caller AND client_booking_id = p_client_booking_id;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  IF p_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = p_org_id AND m.user_id = caller
       AND m.access_role IN ('owner', 'admin', 'buyer')
  ) THEN
    RAISE EXCEPTION 'Du har inte behörighet att boka för organisationen' USING ERRCODE = '42501';
  END IF;

  IF p_participants IS NULL OR p_participants <= 0 THEN
    RAISE EXCEPTION 'Ange antal deltagare' USING ERRCODE = '22023';
  END IF;
  IF p_participants > 500 THEN
    RAISE EXCEPTION 'Kontakta oss för bokningar över 500 deltagare' USING ERRCODE = '22023';
  END IF;

  missing := billing_org_missing_details(p_org_id);
  IF coalesce(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Fakturauppgifter saknas: %', array_to_string(missing, ', ') USING ERRCODE = 'P0001';
  END IF;

  -- Låser kursstarten så att två samtidiga bokningar inte kan dela på samma platser.
  SELECT * INTO s FROM scheduled_starts WHERE id = p_scheduled_start_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kursstarten hittades inte' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO t FROM trainings WHERE id = s.training_id;
  SELECT p.is_active INTO provider_active FROM providers p WHERE p.id = t.provider_id;
  IF NOT coalesce(t.is_active, false) OR NOT coalesce(provider_active, false) THEN
    RAISE EXCEPTION 'Utbildningen kan inte bokas just nu' USING ERRCODE = 'P0001';
  END IF;
  IF s.status = 'upcoming' THEN
    RAISE EXCEPTION 'Kursstarten är inte öppen för bokning än' USING ERRCODE = 'P0001';
  END IF;
  IF s.application_deadline < current_date OR s.start_date < current_date THEN
    RAISE EXCEPTION 'Sista anmälningsdag har passerat' USING ERRCODE = 'P0001';
  END IF;
  IF s.max_participants <= 0 THEN
    RAISE EXCEPTION 'Kursstarten saknar uppgift om antal platser och kan inte bokas' USING ERRCODE = 'P0001';
  END IF;
  IF s.price <= 0 THEN
    RAISE EXCEPTION 'Kursstarten saknar pris och kan inte bokas' USING ERRCODE = 'P0001';
  END IF;
  IF s.available_spots < p_participants THEN
    RAISE EXCEPTION 'Det finns bara % lediga platser', s.available_spots USING ERRCODE = 'P0001';
  END IF;

  -- À-priset avrundas till öre först, så att à-pris × antal alltid blir exakt summan på raden.
  unit_price := round(s.price, 2);

  SELECT st.default_vat_rate, st.commission_rate INTO vat, comm FROM billing_settings st;
  IF vat IS NULL OR comm IS NULL THEN
    RAISE EXCEPTION 'Faktureringsinställningar saknas' USING ERRCODE = 'P0001';
  END IF;

  SELECT CASE WHEN jsonb_typeof(p.cancellation_policy) = 'object' AND p.cancellation_policy <> '{}'::jsonb
              THEN p.cancellation_policy END
    INTO policy
    FROM providers p WHERE p.id = t.provider_id;

  INSERT INTO bookings (
    client_booking_id, source, buyer_org_id, buyer_user_id, provider_id, marketplace_id,
    training_id, scheduled_start_id, title, participants, unit_price_ex_vat, total_ex_vat,
    vat_rate, commission_rate, start_date, reference, cancellation_policy, cancellation_accepted_at
  ) VALUES (
    p_client_booking_id, 'scheduled_start', p_org_id, caller, t.provider_id,
    (SELECT m.id FROM marketplaces m WHERE m.id = p_marketplace_id),
    t.id, s.id, t.title, p_participants, unit_price, unit_price * p_participants,
    vat, comm, s.start_date,
    coalesce(nullif(trim(coalesce(p_reference, '')), ''),
             (SELECT o.default_reference FROM organizations o WHERE o.id = p_org_id)),
    policy,
    CASE WHEN coalesce(p_cancellation_accepted, false) THEN now() END
  )
  RETURNING id INTO new_booking;

  new_spots := s.available_spots - p_participants;
  UPDATE scheduled_starts
     SET available_spots = new_spots,
         status = CASE WHEN new_spots = 0 THEN 'full' ELSE s.status END
   WHERE id = s.id;

  PERFORM billing_create_basis(new_booking, 'buyer');

  RETURN new_booking;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. buyer_accept_quote: kräver fakturauppgifter (annars oförändrad från paket C)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buyer_accept_quote(
  p_quote_id UUID,
  p_client_booking_id UUID,
  p_reason_code TEXT DEFAULT NULL,
  p_reason_text TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_cancellation_accepted BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  q custom_requests%ROWTYPE;
  a training_request_assignments%ROWTYPE;
  r training_requests%ROWTYPE;
  other RECORD;
  existing_id UUID;
  new_booking UUID;
  vat NUMERIC;
  comm NUMERIC;
  policy JSONB;
  missing TEXT[];
  reason_text TEXT := nullif(trim(coalesce(p_reason_text, '')), '');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_client_booking_id IS NULL THEN
    RAISE EXCEPTION 'client_booking_id saknas' USING ERRCODE = '22023';
  END IF;
  IF p_reason_code IS NOT NULL AND p_reason_code NOT IN ('price', 'timing', 'content', 'experience', 'other') THEN
    RAISE EXCEPTION 'Okänd anledning %', p_reason_code USING ERRCODE = '22023';
  END IF;
  IF reason_text IS NOT NULL AND length(reason_text) > 1000 THEN
    RAISE EXCEPTION 'Anledningen får vara högst 1000 tecken' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing_id FROM bookings
   WHERE buyer_user_id = caller AND client_booking_id = p_client_booking_id;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  SELECT * INTO q FROM custom_requests WHERE id = p_quote_id;
  IF NOT FOUND OR q.training_request_assignment_id IS NULL THEN
    RAISE EXCEPTION 'Offerten hittades inte' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO a FROM training_request_assignments WHERE id = q.training_request_assignment_id;
  SELECT * INTO r FROM training_requests WHERE id = a.request_id FOR UPDATE;
  IF r.buyer_user_id <> caller THEN
    RAISE EXCEPTION 'Offerten hittades inte' USING ERRCODE = '42501';
  END IF;
  IF r.buyer_org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = r.buyer_org_id AND m.user_id = caller
       AND m.access_role IN ('owner', 'admin', 'buyer')
  ) THEN
    RAISE EXCEPTION 'Du har inte behörighet att acceptera offerter för organisationen' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO q FROM custom_requests WHERE id = p_quote_id FOR UPDATE;
  IF q.status = 'accepted' THEN
    SELECT id INTO existing_id FROM bookings
     WHERE quote_request_id = q.id AND status <> 'cancelled';
    IF existing_id IS NOT NULL THEN
      RETURN existing_id;
    END IF;
  END IF;
  IF r.status IN ('cancelled', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Efterfrågan är avslutad' USING ERRCODE = 'P0001';
  END IF;
  IF q.status NOT IN ('responded', 'negotiating') THEN
    RAISE EXCEPTION 'Offerten kan inte accepteras i status %', q.status USING ERRCODE = 'P0001';
  END IF;
  IF q.offer_total_ex_vat IS NULL OR q.offer_participants IS NULL OR q.offer_start_date IS NULL THEN
    RAISE EXCEPTION 'Offerten saknar pris, antal eller startdatum och kan inte accepteras' USING ERRCODE = 'P0001';
  END IF;
  IF q.offer_valid_until IS NOT NULL AND q.offer_valid_until < current_date THEN
    RAISE EXCEPTION 'Offerten har gått ut' USING ERRCODE = 'P0001';
  END IF;

  -- Nytt i paket D: underlaget kräver organisationens fakturauppgifter.
  missing := billing_org_missing_details(r.buyer_org_id);
  IF coalesce(array_length(missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Fakturauppgifter saknas: %', array_to_string(missing, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT s.default_vat_rate, s.commission_rate INTO vat, comm FROM billing_settings s;
  IF vat IS NULL OR comm IS NULL THEN
    RAISE EXCEPTION 'Faktureringsinställningar saknas' USING ERRCODE = 'P0001';
  END IF;

  SELECT CASE WHEN jsonb_typeof(p.cancellation_policy) = 'object' AND p.cancellation_policy <> '{}'::jsonb
              THEN p.cancellation_policy END
    INTO policy
    FROM providers p WHERE p.id = a.provider_id;

  INSERT INTO bookings (
    client_booking_id, source, buyer_org_id, buyer_user_id, provider_id, marketplace_id,
    training_request_id, quote_request_id, title, participants, unit_price_ex_vat, total_ex_vat,
    vat_rate, commission_rate, start_date, reference, cancellation_policy, cancellation_accepted_at
  ) VALUES (
    p_client_booking_id, 'custom_quote', r.buyer_org_id, caller, a.provider_id, r.marketplace_id,
    r.id, q.id, r.title, q.offer_participants, NULL, q.offer_total_ex_vat,
    vat, comm, q.offer_start_date,
    coalesce(nullif(trim(coalesce(p_reference, '')), ''),
             (SELECT o.default_reference FROM organizations o WHERE o.id = r.buyer_org_id)),
    policy,
    CASE WHEN coalesce(p_cancellation_accepted, false) THEN now() END
  )
  RETURNING id INTO new_booking;

  PERFORM billing_create_basis(new_booking, 'buyer');

  UPDATE custom_requests SET status = 'accepted' WHERE id = q.id;

  FOR other IN
    SELECT c.id AS quote_id, a2.id AS assignment_id, a2.provider_id
      FROM training_request_assignments a2
      JOIN custom_requests c ON c.training_request_assignment_id = a2.id
     WHERE a2.request_id = r.id AND c.id <> q.id AND c.status IN ('responded', 'negotiating')
  LOOP
    UPDATE custom_requests
       SET status = 'not_selected',
           not_selected_reason_code = p_reason_code,
           not_selected_reason_text = reason_text
     WHERE id = other.quote_id;
    PERFORM tr_log_event(r.id, other.assignment_id, 'buyer', 'not_selected', false,
                         jsonb_build_object('quote_id', other.quote_id,
                                            'reason_code', p_reason_code,
                                            'reason_text', reason_text));
  END LOOP;

  FOR other IN
    SELECT id FROM training_request_assignments
     WHERE request_id = r.id AND status IN ('assigned', 'viewed')
  LOOP
    UPDATE training_request_assignments SET status = 'withdrawn' WHERE id = other.id;
    PERFORM tr_log_event(r.id, other.id, 'buyer', 'withdrawn', false,
                         jsonb_build_object('reason', 'quote_accepted'));
  END LOOP;

  UPDATE training_requests SET status = 'closed', closed_at = now() WHERE id = r.id;
  PERFORM tr_log_event(r.id, a.id, 'buyer', 'quote_accepted', true,
                       jsonb_build_object('quote_id', q.id, 'booking_id', new_booking,
                                          'provider_id', a.provider_id));

  RETURN new_booking;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Köparens bokningar
-- ════════════════════════════════════════════════════════════════════════
-- Alla medlemmar i organisationen (även viewer) får se dess bokningar. Provision och
-- lärosätets utbetalning visas aldrig för köparen.
CREATE OR REPLACE FUNCTION public.buyer_list_bookings()
RETURNS TABLE (
  booking_id UUID,
  organization_id UUID,
  organization_name TEXT,
  source TEXT,
  title TEXT,
  provider_id UUID,
  provider_name TEXT,
  training_id UUID,
  participants INTEGER,
  unit_price_ex_vat NUMERIC,
  total_ex_vat NUMERIC,
  vat_rate NUMERIC,
  start_date DATE,
  reference TEXT,
  status TEXT,
  confirmed_at TIMESTAMPTZ,
  cancellation_policy JSONB,
  cancellation_requested_at TIMESTAMPTZ
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
  RETURN QUERY
    SELECT b.id, b.buyer_org_id, o.name, b.source, b.title, b.provider_id, p.name, b.training_id,
           b.participants, b.unit_price_ex_vat, b.total_ex_vat, b.vat_rate, b.start_date,
           b.reference, b.status, b.confirmed_at, b.cancellation_policy, b.cancellation_requested_at
      FROM bookings b
      JOIN organizations o ON o.id = b.buyer_org_id
      JOIN providers p ON p.id = b.provider_id
     WHERE b.buyer_org_id IN (SELECT my_organization_ids())
     ORDER BY b.confirmed_at DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Behörigheter
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.buyer_update_billing_details(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_book_scheduled_start(UUID, UUID, UUID, INTEGER, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_accept_quote(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_list_bookings() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.buyer_update_billing_details(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_book_scheduled_start(UUID, UUID, UUID, INTEGER, TEXT, BOOLEAN, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_accept_quote(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_list_bookings() TO authenticated;
