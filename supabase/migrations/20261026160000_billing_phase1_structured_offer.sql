-- Fakturering Fas 1, paket C: strukturerad offert, acceptera offert och "Ej vald".
--
-- Kolumnerna offer_* och not_selected_* samt statusvärdet not_selected skapades i paket A.
-- Här kommer logiken:
--  * provider_submit_offer: lärosätet skickar offerten med strukturerade fält (ersätter direkt UPDATE).
--  * guard_custom_request_client_update: klienten kan inte längre sätta status, svar, offertfält
--    eller Ej vald på offertrader (rader från efterfrågningar) eller offertfälten på någon rad.
--    Lärosätet kan alltså inte acceptera en offert. Admin och SECURITY DEFINER-RPC påverkas inte.
--  * buyer_accept_quote: köparen accepterar. Skapar bokning och fakturaunderlag, sätter övriga
--    offerter till not_selected (med köparens valfria anledning), drar tillbaka öppna tilldelningar
--    och avslutar efterfrågan.
--  * buyer_request_offers: returnerar nu de strukturerade fälten (ändrad returtyp).
--  * Nya händelsetyper quote_accepted och not_selected i training_request_events.
--
-- Avgränsning: kravet på ifyllda fakturauppgifter vid accept läggs till i paket D, där
-- buyer_update_billing_details och formuläret finns. Mejl för Ej vald hör till paket I.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Händelsetyper
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.training_request_events'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.training_request_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.training_request_events
  ADD CONSTRAINT training_request_events_event_type_check
  CHECK (event_type IN ('submitted', 'assigned', 'viewed', 'declined', 'quoted',
                        'withdrawn', 'status_changed', 'cancelled', 'closed',
                        'no_match', 'deadline_passed', 'quote_accepted', 'not_selected'));

-- ════════════════════════════════════════════════════════════════════════
-- 2. Skydd mot direkta klientändringar av offertdata
-- ════════════════════════════════════════════════════════════════════════
-- Ingen SECURITY DEFINER här: current_user ska vara den som kör UPDATE. RPC-funktionerna
-- körs som funktionens ägare och släpps därför igenom, direkta anrop från anon/authenticated
-- stoppas (utom för admin).
CREATE OR REPLACE FUNCTION public.guard_custom_request_client_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR coalesce(is_admin(), false) THEN
    RETURN NEW;
  END IF;

  -- Offert- och Ej vald-fälten sätts bara av RPC, på alla rader.
  IF NEW.offer_total_ex_vat IS DISTINCT FROM OLD.offer_total_ex_vat
     OR NEW.offer_participants IS DISTINCT FROM OLD.offer_participants
     OR NEW.offer_start_date IS DISTINCT FROM OLD.offer_start_date
     OR NEW.offer_end_date IS DISTINCT FROM OLD.offer_end_date
     OR NEW.offer_valid_until IS DISTINCT FROM OLD.offer_valid_until
     OR NEW.offer_location IS DISTINCT FROM OLD.offer_location
     OR NEW.offer_terms IS DISTINCT FROM OLD.offer_terms
     OR NEW.not_selected_reason_code IS DISTINCT FROM OLD.not_selected_reason_code
     OR NEW.not_selected_reason_text IS DISTINCT FROM OLD.not_selected_reason_text THEN
    RAISE EXCEPTION 'Offertfälten kan bara ändras via offertfunktionerna' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'not_selected' AND OLD.status IS DISTINCT FROM 'not_selected' THEN
    RAISE EXCEPTION 'Status Ej vald sätts av köparens val av offert' USING ERRCODE = '42501';
  END IF;

  -- Offertrader från efterfrågningar: status och svar går via provider_submit_offer och
  -- buyer_accept_quote. Leverantören kan alltså inte sätta accepted eller negotiating.
  IF OLD.training_request_assignment_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.response IS DISTINCT FROM OLD.response) THEN
    RAISE EXCEPTION 'Offerten lämnas med provider_submit_offer och accepteras av köparen'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_client_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_requests_guard_client_update
  BEFORE UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_client_update();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Lärosätet lämnar strukturerad offert
-- ════════════════════════════════════════════════════════════════════════
-- Skapar offertraden om den saknas (via provider_respond_with_quote) och fyller i fälten.
-- Får anropas igen för att revidera tills köparen har agerat (status new, responded, negotiating).
CREATE OR REPLACE FUNCTION public.provider_submit_offer(
  p_assignment_id UUID,
  p_total_ex_vat NUMERIC,
  p_participants INTEGER,
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL,
  p_valid_until DATE DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_terms TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID := get_user_provider_id();
  a training_request_assignments%ROWTYPE;
  r_status TEXT;
  quote_id UUID;
  q_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM training_request_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.provider_id <> pid THEN
    RAISE EXCEPTION 'Tilldelningen hittades inte' USING ERRCODE = '42501';
  END IF;
  IF a.status IN ('declined', 'withdrawn') THEN
    RAISE EXCEPTION 'Kan inte lämna offert i status %', a.status USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO r_status FROM training_requests WHERE id = a.request_id;
  IF r_status IN ('cancelled', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Efterfrågan är avslutad' USING ERRCODE = 'P0001';
  END IF;

  IF p_total_ex_vat IS NULL OR p_total_ex_vat <= 0 THEN
    RAISE EXCEPTION 'Ange totalpris exklusive moms (större än 0)' USING ERRCODE = '22023';
  END IF;
  IF p_participants IS NULL OR p_participants <= 0 THEN
    RAISE EXCEPTION 'Ange antal deltagare' USING ERRCODE = '22023';
  END IF;
  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Ange startdatum' USING ERRCODE = '22023';
  END IF;
  IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Slutdatum kan inte vara före startdatum' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until < current_date THEN
    RAISE EXCEPTION 'Ange en giltighetstid som inte har passerat' USING ERRCODE = '22023';
  END IF;

  quote_id := provider_respond_with_quote(p_assignment_id);

  SELECT status INTO q_status FROM custom_requests WHERE id = quote_id FOR UPDATE;
  IF q_status NOT IN ('new', 'responded', 'negotiating') THEN
    RAISE EXCEPTION 'Offerten kan inte ändras i status %', q_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE custom_requests
     SET offer_total_ex_vat = round(p_total_ex_vat, 2),
         offer_participants = p_participants,
         offer_start_date = p_start_date,
         offer_end_date = p_end_date,
         offer_valid_until = p_valid_until,
         offer_location = nullif(trim(coalesce(p_location, '')), ''),
         offer_terms = nullif(trim(coalesce(p_terms, '')), ''),
         response = coalesce(nullif(trim(coalesce(p_message, '')), ''), response, ''),
         status = CASE WHEN status = 'new' THEN 'responded' ELSE status END
   WHERE id = quote_id;

  RETURN quote_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Köparen ser offerternas fält
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.buyer_request_offers(UUID);

CREATE FUNCTION public.buyer_request_offers(p_request_id UUID)
RETURNS TABLE (
  quote_id UUID,
  provider_id UUID,
  provider_name TEXT,
  status TEXT,
  response TEXT,
  responded_at TIMESTAMPTZ,
  offer_total_ex_vat NUMERIC,
  offer_participants INTEGER,
  offer_start_date DATE,
  offer_end_date DATE,
  offer_valid_until DATE,
  offer_location TEXT,
  offer_terms TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    SELECT c.id, p.id, p.name, c.status, c.response, c.updated_at,
           c.offer_total_ex_vat, c.offer_participants, c.offer_start_date, c.offer_end_date,
           c.offer_valid_until, c.offer_location, c.offer_terms
      FROM training_requests r
      JOIN training_request_assignments a ON a.request_id = r.id
      JOIN custom_requests c ON c.training_request_assignment_id = a.id
      JOIN providers p ON p.id = a.provider_id
     WHERE r.id = p_request_id
       AND r.buyer_user_id = caller
       AND a.status = 'quoted'
       AND c.status <> 'new'
     ORDER BY c.updated_at;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Köparen accepterar en offert
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

  -- Dubbelklick: samma klient-id ger samma bokning.
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
  -- Låser efterfrågan först, så att två samtidiga accepter ställs i kö.
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

  -- Omläsning efter låset (en samtidig accept kan ha hunnit före).
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
    vat, comm, q.offer_start_date, nullif(trim(coalesce(p_reference, '')), ''), policy,
    CASE WHEN coalesce(p_cancellation_accepted, false) THEN now() END
  )
  RETURNING id INTO new_booking;

  PERFORM billing_create_basis(new_booking, 'buyer');

  UPDATE custom_requests SET status = 'accepted' WHERE id = q.id;

  -- Övriga offerter: Ej vald, med köparens anledning om den angetts.
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

  -- Lärosäten som inte hunnit svara: tilldelningen dras tillbaka (de får besked om avslutad efterfrågan).
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
-- 6. Behörigheter
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.provider_submit_offer(UUID, NUMERIC, INTEGER, DATE, DATE, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_request_offers(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_accept_quote(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provider_submit_offer(UUID, NUMERIC, INTEGER, DATE, DATE, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_request_offers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_accept_quote(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
