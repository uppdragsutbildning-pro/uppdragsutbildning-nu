-- Fakturering Fas 1, paket D2: avbokningsvillkor per lärosäte och avbokning.
--
--  * provider_update_cancellation_policy: lärosätet (eller admin) registrerar sina avbokningsregler
--    (antal dagar före start med fri avbokning, avgift i procent därefter, fritext). Reglerna fryses
--    som en kopia i varje ny bokning (paket D) och påverkar alltså aldrig redan gjorda bokningar.
--  * Trigger på trainings: en ny kurs kan inte publiceras (is_active) utan registrerad policy.
--    Befintliga kurser påverkas inte, och körningar utan inloggad användare (migrationer,
--    SQL-editorn, service role) undantas.
--  * buyer_cancel_booking: fri avbokning, bara inom lärosätets fria tid. Återställer platser och
--    avbryter underlaget.
--  * buyer_request_cancellation: begäran till admin när fria tiden gått ut eller policy saknas.
--  * admin_decline_cancellation_request: admin avslår en begäran (bokningen står kvar).
--  * admin_cancel_booking (paket B) tar redan en avgift i stället för full avbokning.
--
-- Mejl till admin vid begäran hör till paket I (triggern lyssnar på händelsen cancellation_requested).

-- ════════════════════════════════════════════════════════════════════════
-- 1. Hjälpfunktioner
-- ════════════════════════════════════════════════════════════════════════
-- En policy räknas som registrerad när dagar och avgiftsprocent finns.
CREATE OR REPLACE FUNCTION public.billing_policy_registered(p_policy JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_policy IS NOT NULL
     AND jsonb_typeof(p_policy) = 'object'
     AND jsonb_typeof(p_policy->'free_until_days_before_start') = 'number'
     AND jsonb_typeof(p_policy->'late_fee_percent') = 'number'
$$;

-- Är fri avbokning fortfarande öppen för en bokning med den här policyn och starten?
CREATE OR REPLACE FUNCTION public.billing_free_cancellation_open(p_policy JSONB, p_start_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT billing_policy_registered(p_policy)
     AND (p_start_date - current_date) >= ((p_policy->>'free_until_days_before_start')::numeric)
$$;

REVOKE ALL ON FUNCTION public.billing_policy_registered(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_free_cancellation_open(JSONB, DATE) FROM PUBLIC, anon, authenticated;

-- Nya händelsetyper på underlagets logg.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.invoice_basis_events'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoice_basis_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.invoice_basis_events
  ADD CONSTRAINT invoice_basis_events_event_type_check
  CHECK (event_type IN (
    'created', 'adjusted', 'ready', 'exported', 'invoiced', 'paid', 'paid_out',
    'cancelled', 'credited', 'cancellation_requested', 'cancellation_declined'
  ));

-- ════════════════════════════════════════════════════════════════════════
-- 2. Lärosätet registrerar avbokningsregler
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.provider_update_cancellation_policy(
  p_provider_id UUID,
  p_free_until_days_before_start INTEGER,
  p_late_fee_percent NUMERIC,
  p_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_provider UUID := get_user_provider_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  -- Explicit kontroll av båda fallen (NULL-jämförelser hoppar annars över RAISE).
  IF NOT coalesce(is_admin(), false)
     AND (caller_provider IS NULL OR p_provider_id IS NULL OR caller_provider <> p_provider_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_free_until_days_before_start IS NULL OR p_free_until_days_before_start < 0 OR p_free_until_days_before_start > 365 THEN
    RAISE EXCEPTION 'Ange antal dagar före start (0 till 365) då avbokning är fri' USING ERRCODE = '22023';
  END IF;
  IF p_late_fee_percent IS NULL OR p_late_fee_percent < 0 OR p_late_fee_percent > 100 THEN
    RAISE EXCEPTION 'Ange avgift i procent (0 till 100) för avbokning efter fria tiden' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_text, '')) > 2000 THEN
    RAISE EXCEPTION 'Texten får vara högst 2000 tecken' USING ERRCODE = '22023';
  END IF;

  UPDATE providers
     SET cancellation_policy = jsonb_strip_nulls(jsonb_build_object(
           'free_until_days_before_start', p_free_until_days_before_start,
           'late_fee_percent', round(p_late_fee_percent, 2),
           'text', nullif(trim(coalesce(p_text, '')), '')
         ))
   WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lärosätet hittades inte' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Ny kurs kräver registrerad policy
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_training_publish_requires_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pol JSONB;
BEGIN
  -- Bara inloggade användare: migrationer, SQL-editorn och service role undantas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT coalesce(NEW.is_active, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND coalesce(OLD.is_active, false) THEN
    RETURN NEW;
  END IF;

  SELECT p.cancellation_policy INTO pol FROM providers p WHERE p.id = NEW.provider_id;
  IF NOT billing_policy_registered(pol) THEN
    RAISE EXCEPTION 'Registrera lärosätets avbokningsvillkor under Villkor innan en kurs publiceras'
      USING ERRCODE = 'P0001', HINT = 'cancellation_policy_required';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_training_publish_requires_policy() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trainings_publish_requires_policy
  BEFORE INSERT OR UPDATE OF is_active ON public.trainings
  FOR EACH ROW EXECUTE FUNCTION public.guard_training_publish_requires_policy();

-- ════════════════════════════════════════════════════════════════════════
-- 4. Köparen avbokar fritt, eller begär avbokning
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buyer_cancel_booking(p_booking_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  b bookings%ROWTYPE;
  v invoice_bases%ROWTYPE;
  has_basis BOOLEAN;
  reason TEXT := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF reason IS NOT NULL AND length(reason) > 1000 THEN
    RAISE EXCEPTION 'Texten får vara högst 1000 tecken' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = b.buyer_org_id AND m.user_id = caller
       AND m.access_role IN ('owner', 'admin', 'buyer')
  ) THEN
    RAISE EXCEPTION 'Bokningen hittades inte' USING ERRCODE = '42501';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Bokningen kan inte avbokas i status %', b.status USING ERRCODE = 'P0001';
  END IF;
  IF NOT billing_free_cancellation_open(b.cancellation_policy, b.start_date) THEN
    RAISE EXCEPTION 'Fria avbokningstiden har gått ut. Skicka en begäran om avbokning i stället.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE booking_id = b.id FOR UPDATE;
  has_basis := FOUND;
  IF has_basis AND v.status NOT IN ('preliminary', 'ready') THEN
    RAISE EXCEPTION 'Fakturan är redan skapad. Skicka en begäran om avbokning i stället.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(reason, 'Avbokad av köparen inom fri avbokningstid')
   WHERE id = b.id;
  PERFORM billing_release_spots(b.id);

  IF has_basis THEN
    UPDATE invoice_bases SET status = 'cancelled' WHERE id = v.id;
    PERFORM billing_log_event(v.id, 'buyer', 'cancelled', true, jsonb_build_object(
      'reason', coalesce(reason, 'Avbokad av köparen inom fri avbokningstid'),
      'booking_id', b.id, 'free_cancellation', true
    ));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.buyer_request_cancellation(p_booking_id UUID, p_message TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  b bookings%ROWTYPE;
  v_id UUID;
  msg TEXT := nullif(trim(coalesce(p_message, '')), '');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF msg IS NOT NULL AND length(msg) > 2000 THEN
    RAISE EXCEPTION 'Texten får vara högst 2000 tecken' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM organization_members m
     WHERE m.organization_id = b.buyer_org_id AND m.user_id = caller
       AND m.access_role IN ('owner', 'admin', 'buyer')
  ) THEN
    RAISE EXCEPTION 'Bokningen hittades inte' USING ERRCODE = '42501';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Bokningen kan inte avbokas i status %', b.status USING ERRCODE = 'P0001';
  END IF;
  IF b.cancellation_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'Du har redan begärt avbokning. Vi återkommer.' USING ERRCODE = 'P0001';
  END IF;
  IF billing_free_cancellation_open(b.cancellation_policy, b.start_date)
     AND EXISTS (SELECT 1 FROM invoice_bases WHERE booking_id = b.id AND status IN ('preliminary', 'ready')) THEN
    RAISE EXCEPTION 'Fria avbokningstiden gäller fortfarande. Avboka direkt i stället.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET cancellation_requested_at = now(), cancellation_request_message = msg
   WHERE id = b.id;

  SELECT id INTO v_id FROM invoice_bases WHERE booking_id = b.id;
  IF v_id IS NOT NULL THEN
    PERFORM billing_log_event(v_id, 'buyer', 'cancellation_requested', false, jsonb_build_object(
      'booking_id', b.id, 'message', msg
    ));
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Admin avslår en begäran
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_decline_cancellation_request(p_booking_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  v_id UUID;
BEGIN
  PERFORM billing_require_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Anledning krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bokningen hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF b.cancellation_requested_at IS NULL THEN
    RAISE EXCEPTION 'Det finns ingen begäran om avbokning på bokningen' USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET cancellation_requested_at = NULL, cancellation_request_message = NULL
   WHERE id = b.id;

  SELECT id INTO v_id FROM invoice_bases WHERE booking_id = b.id;
  IF v_id IS NOT NULL THEN
    PERFORM billing_log_event(v_id, 'admin', 'cancellation_declined', false, jsonb_build_object(
      'booking_id', b.id, 'reason', trim(p_reason),
      'original_message', b.cancellation_request_message,
      'requested_at', b.cancellation_requested_at
    ));
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Behörigheter
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.provider_update_cancellation_policy(UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_cancel_booking(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_request_cancellation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_decline_cancellation_request(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provider_update_cancellation_policy(UUID, INTEGER, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_cancel_booking(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_request_cancellation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decline_cancellation_request(UUID, TEXT) TO authenticated;
