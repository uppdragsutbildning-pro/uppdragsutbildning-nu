-- Paket B (Fakturering Fas 1): RPC för admin och cron, beloppsfunktion,
-- händelselogg och skydd mot ogiltiga övergångar.
--
-- Principer
--  * Alla statusändringar och alla belopp går via SECURITY DEFINER-RPC. Tabellerna har
--    redan RLS och saknar skrivrättigheter (paket A).
--  * Varje RPC kontrollerar auth.uid() och admin-rollen explicit före jämförelser
--    (NULL-fallet: en oautentiserad anropare ger NULL i en jämförelse, och RAISE körs då inte).
--  * Beloppen räknas i databasen och endast här (billing_compute_amounts). Klienten räknar aldrig.
--  * En trigger på invoice_bases är sista försvaret: den nekar ogiltiga statusövergångar,
--    ändrade belopp efter fakturering och status utan de uppgifter övergången kräver.
--    Det gäller även om någon i framtiden skriver direkt som service role.
--  * Interna hjälpfunktioner (billing_*) har inga grants till klientroller.

-- ── Beloppsfunktion ─────────────────────────────────────────────────────
-- Avrundning: round(numeric, 2) rundar halvt bort från noll. Moms och provision räknas på
-- det avrundade beloppet exkl. moms, och utbetalning = belopp − provision.
CREATE OR REPLACE FUNCTION public.billing_compute_amounts(
  p_total_ex_vat NUMERIC,
  p_vat_rate NUMERIC,
  p_commission_rate NUMERIC
)
RETURNS TABLE (
  total_ex_vat NUMERIC,
  vat_amount NUMERIC,
  total_inc_vat NUMERIC,
  commission_amount NUMERIC,
  payout_amount NUMERIC
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT x.t,
         round(x.t * p_vat_rate, 2),
         round(x.t + round(x.t * p_vat_rate, 2), 2),
         round(x.t * p_commission_rate, 2),
         round(x.t - round(x.t * p_commission_rate, 2), 2)
    FROM (SELECT round(p_total_ex_vat, 2) AS t) x
$$;

-- ── Interna hjälpfunktioner ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_require_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_log_event(
  p_basis_id UUID,
  p_actor_role TEXT,
  p_event_type TEXT,
  p_visible_to_provider BOOLEAN,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO invoice_basis_events (basis_id, actor_user_id, actor_role, event_type, visible_to_provider, payload)
  VALUES (p_basis_id, auth.uid(), p_actor_role, p_event_type, p_visible_to_provider, coalesce(p_payload, '{}'::jsonb))
$$;

-- Återställer platser när en bokning på en kursstart avbokas.
CREATE OR REPLACE FUNCTION public.billing_release_spots(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  s scheduled_starts%ROWTYPE;
  new_spots INTEGER;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.source <> 'scheduled_start' OR b.scheduled_start_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO s FROM scheduled_starts WHERE id = b.scheduled_start_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  new_spots := s.available_spots + b.participants;
  IF s.max_participants > 0 THEN
    new_spots := least(new_spots, s.max_participants);
  END IF;

  UPDATE scheduled_starts
     SET available_spots = new_spots,
         status = CASE WHEN s.status = 'full' AND new_spots > 0 THEN 'open' ELSE s.status END
   WHERE id = s.id;
END;
$$;

-- Skapar fakturaunderlaget för en bokning (idempotent). Anropas av boknings-RPC:erna (paket C och D).
CREATE OR REPLACE FUNCTION public.billing_create_basis(p_booking_id UUID, p_actor_role TEXT DEFAULT 'system')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  amt RECORD;
  new_id UUID;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bokningen hittades inte' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO amt FROM billing_compute_amounts(b.total_ex_vat, b.vat_rate, b.commission_rate);

  INSERT INTO invoice_bases (
    booking_id, lines, total_ex_vat, vat_rate, vat_amount, total_inc_vat, commission_amount, payout_amount
  ) VALUES (
    b.id,
    jsonb_build_array(jsonb_build_object(
      'description', b.title,
      'quantity', b.participants,
      'unit_price_ex_vat', b.unit_price_ex_vat,
      'total_ex_vat', amt.total_ex_vat
    )),
    amt.total_ex_vat, b.vat_rate, amt.vat_amount, amt.total_inc_vat, amt.commission_amount, amt.payout_amount
  )
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO new_id;

  IF new_id IS NULL THEN
    SELECT id INTO new_id FROM invoice_bases WHERE booking_id = p_booking_id;
    RETURN new_id;
  END IF;

  PERFORM billing_log_event(new_id, p_actor_role, 'created', true, jsonb_build_object('booking_id', b.id));
  RETURN new_id;
END;
$$;

-- ── Skydd på invoice_bases ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_guard_basis_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'preliminary' AND NEW.status IN ('ready', 'cancelled'))
      OR (OLD.status = 'ready' AND NEW.status IN ('invoiced', 'cancelled'))
      OR (OLD.status = 'invoiced' AND NEW.status IN ('paid', 'credited'))
      OR (OLD.status = 'paid' AND NEW.status IN ('paid_out', 'credited'))
    ) THEN
      RAISE EXCEPTION 'Ogiltig statusövergång % till %', OLD.status, NEW.status USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status = 'invoiced'
       AND (NEW.fortnox_invoice_no IS NULL OR NEW.invoice_date IS NULL OR NEW.due_date IS NULL) THEN
      RAISE EXCEPTION 'Fakturerad kräver Fortnox fakturanummer, fakturadatum och förfallodatum' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'paid' AND (NEW.paid_at IS NULL OR NEW.payout_due_date IS NULL) THEN
      RAISE EXCEPTION 'Betald kräver betaldatum och utbetalningsdatum' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'paid_out' AND NEW.paid_out_at IS NULL THEN
      RAISE EXCEPTION 'Utbetald kräver utbetalningsdatum' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'credited' AND NEW.credit_note_no IS NULL THEN
      RAISE EXCEPTION 'Krediterad kräver kreditfakturans nummer' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Belopp och rader får bara ändras medan underlaget är preliminärt eller klart.
  IF OLD.status NOT IN ('preliminary', 'ready') AND (
    NEW.lines IS DISTINCT FROM OLD.lines
    OR NEW.total_ex_vat IS DISTINCT FROM OLD.total_ex_vat
    OR NEW.vat_rate IS DISTINCT FROM OLD.vat_rate
    OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
    OR NEW.total_inc_vat IS DISTINCT FROM OLD.total_inc_vat
    OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
    OR NEW.payout_amount IS DISTINCT FROM OLD.payout_amount
  ) THEN
    RAISE EXCEPTION 'Belopp kan inte ändras efter fakturering' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_bases_guard_update
  BEFORE UPDATE ON public.invoice_bases
  FOR EACH ROW EXECUTE FUNCTION public.billing_guard_basis_update();

-- ── Admin: justera underlag ─────────────────────────────────────────────
-- Tre sätt att ange nytt belopp: totalpris direkt, à-pris (× antal), eller bara nytt antal
-- (behåller à-priset). Anledning krävs och loggas. Bokningens frysta värden ändras inte.
CREATE OR REPLACE FUNCTION public.admin_adjust_invoice_basis(
  p_basis_id UUID,
  p_reason TEXT,
  p_participants INTEGER DEFAULT NULL,
  p_unit_price_ex_vat NUMERIC DEFAULT NULL,
  p_total_ex_vat NUMERIC DEFAULT NULL,
  p_vat_rate NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
  b bookings%ROWTYPE;
  line JSONB;
  old_qty INTEGER;
  old_unit NUMERIC;
  new_qty INTEGER;
  new_unit NUMERIC;
  new_total NUMERIC;
  new_vat NUMERIC;
  amt RECORD;
BEGIN
  PERFORM billing_require_admin();

  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Anledning krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status NOT IN ('preliminary', 'ready') THEN
    RAISE EXCEPTION 'Underlaget kan inte justeras i status %', v.status USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = v.booking_id;

  line := v.lines -> 0;
  old_qty := coalesce((line ->> 'quantity')::INTEGER, b.participants);
  old_unit := (line ->> 'unit_price_ex_vat')::NUMERIC;
  new_qty := coalesce(p_participants, old_qty);
  IF new_qty <= 0 THEN
    RAISE EXCEPTION 'Antal deltagare måste vara större än 0' USING ERRCODE = '22023';
  END IF;

  IF p_total_ex_vat IS NOT NULL THEN
    new_total := p_total_ex_vat;
    new_unit := NULL;
  ELSIF p_unit_price_ex_vat IS NOT NULL THEN
    new_unit := p_unit_price_ex_vat;
    new_total := round(p_unit_price_ex_vat * new_qty, 2);
  ELSIF p_participants IS NOT NULL AND old_unit IS NOT NULL THEN
    new_unit := old_unit;
    new_total := round(old_unit * new_qty, 2);
  ELSE
    RAISE EXCEPTION 'Ange nytt pris. Nytt antal räcker bara när à-pris finns på raden' USING ERRCODE = '22023';
  END IF;

  IF new_total < 0 OR (new_unit IS NOT NULL AND new_unit < 0) THEN
    RAISE EXCEPTION 'Priset kan inte vara negativt' USING ERRCODE = '22023';
  END IF;

  new_vat := coalesce(p_vat_rate, v.vat_rate);
  IF new_vat < 0 OR new_vat > 1 THEN
    RAISE EXCEPTION 'Momssats måste vara ett bråktal mellan 0 och 1' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO amt FROM billing_compute_amounts(new_total, new_vat, b.commission_rate);

  UPDATE invoice_bases
     SET lines = jsonb_build_array(jsonb_build_object(
           'description', coalesce(line ->> 'description', b.title),
           'quantity', new_qty,
           'unit_price_ex_vat', new_unit,
           'total_ex_vat', amt.total_ex_vat
         )),
         total_ex_vat = amt.total_ex_vat,
         vat_rate = new_vat,
         vat_amount = amt.vat_amount,
         total_inc_vat = amt.total_inc_vat,
         commission_amount = amt.commission_amount,
         payout_amount = amt.payout_amount,
         adjusted = true
   WHERE id = v.id;

  PERFORM billing_log_event(v.id, 'admin', 'adjusted', true, jsonb_build_object(
    'reason', trim(p_reason),
    'before', jsonb_build_object('participants', old_qty, 'total_ex_vat', v.total_ex_vat, 'vat_rate', v.vat_rate),
    'after', jsonb_build_object('participants', new_qty, 'total_ex_vat', amt.total_ex_vat, 'vat_rate', new_vat)
  ));
END;
$$;

-- ── Admin: statusövergångar ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_mark_ready(p_basis_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
BEGIN
  PERFORM billing_require_admin();
  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status <> 'preliminary' THEN
    RAISE EXCEPTION 'Underlaget kan inte flyttas till klar från status %', v.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE invoice_bases SET status = 'ready' WHERE id = v.id;
  PERFORM billing_log_event(v.id, 'admin', 'ready', true, jsonb_build_object('reason', 'manual'));
END;
$$;

-- Markerar att underlag har exporterats till Fortnox. Statusen ändras inte.
CREATE OR REPLACE FUNCTION public.admin_mark_exported(p_basis_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  n INTEGER := 0;
BEGIN
  PERFORM billing_require_admin();
  IF p_basis_ids IS NULL OR coalesce(array_length(p_basis_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Inga underlag valda' USING ERRCODE = '22023';
  END IF;

  FOR rec IN
    SELECT id FROM invoice_bases WHERE id = ANY (p_basis_ids) AND status = 'ready' FOR UPDATE
  LOOP
    UPDATE invoice_bases SET exported_at = now() WHERE id = rec.id;
    PERFORM billing_log_event(rec.id, 'admin', 'exported', false);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_invoiced(
  p_basis_id UUID,
  p_fortnox_invoice_no TEXT,
  p_invoice_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
  terms INTEGER;
  inv_no TEXT := trim(coalesce(p_fortnox_invoice_no, ''));
BEGIN
  PERFORM billing_require_admin();
  IF inv_no = '' THEN
    RAISE EXCEPTION 'Fortnox fakturanummer krävs' USING ERRCODE = '22023';
  END IF;
  IF p_invoice_date IS NULL THEN
    RAISE EXCEPTION 'Fakturadatum krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status <> 'ready' THEN
    RAISE EXCEPTION 'Underlaget kan inte faktureras från status %', v.status USING ERRCODE = 'P0001';
  END IF;

  SELECT payment_terms_days INTO terms FROM billing_settings LIMIT 1;

  BEGIN
    UPDATE invoice_bases
       SET status = 'invoiced',
           fortnox_invoice_no = inv_no,
           invoice_date = p_invoice_date,
           due_date = p_invoice_date + coalesce(terms, 30),
           sent_at = now()
     WHERE id = v.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Fortnox fakturanumret % används redan på ett annat underlag', inv_no USING ERRCODE = '23505';
  END;

  PERFORM billing_log_event(v.id, 'admin', 'invoiced', true, jsonb_build_object(
    'fortnox_invoice_no', inv_no,
    'invoice_date', p_invoice_date,
    'due_date', p_invoice_date + coalesce(terms, 30)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_paid(p_basis_id UUID, p_paid_at DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
  payout_days INTEGER;
BEGIN
  PERFORM billing_require_admin();
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Betaldatum krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status <> 'invoiced' THEN
    RAISE EXCEPTION 'Underlaget kan inte markeras betalt från status %', v.status USING ERRCODE = 'P0001';
  END IF;
  IF p_paid_at < v.invoice_date THEN
    RAISE EXCEPTION 'Betaldatum kan inte ligga före fakturadatum' USING ERRCODE = '22023';
  END IF;
  IF p_paid_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'Betaldatum kan inte ligga i framtiden' USING ERRCODE = '22023';
  END IF;

  SELECT payout_days_after_payment INTO payout_days FROM billing_settings LIMIT 1;

  UPDATE invoice_bases
     SET status = 'paid',
         paid_at = p_paid_at::TIMESTAMPTZ,
         payout_due_date = p_paid_at + coalesce(payout_days, 10)
   WHERE id = v.id;

  PERFORM billing_log_event(v.id, 'admin', 'paid', true, jsonb_build_object(
    'paid_at', p_paid_at,
    'payout_due_date', p_paid_at + coalesce(payout_days, 10)
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_paid_out(
  p_basis_id UUID,
  p_reference TEXT DEFAULT NULL,
  p_paid_out_at DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
BEGIN
  PERFORM billing_require_admin();
  IF p_paid_out_at IS NULL THEN
    RAISE EXCEPTION 'Utbetalningsdatum krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status <> 'paid' THEN
    RAISE EXCEPTION 'Underlaget kan inte markeras utbetalt från status %', v.status USING ERRCODE = 'P0001';
  END IF;
  IF p_paid_out_at < v.paid_at::DATE THEN
    RAISE EXCEPTION 'Utbetalningsdatum kan inte ligga före betaldatum' USING ERRCODE = '22023';
  END IF;
  IF p_paid_out_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'Utbetalningsdatum kan inte ligga i framtiden' USING ERRCODE = '22023';
  END IF;

  UPDATE invoice_bases
     SET status = 'paid_out',
         paid_out_at = p_paid_out_at::TIMESTAMPTZ,
         payout_reference = nullif(trim(coalesce(p_reference, '')), '')
   WHERE id = v.id;

  PERFORM billing_log_event(v.id, 'admin', 'paid_out', true, jsonb_build_object(
    'paid_out_at', p_paid_out_at,
    'reference', nullif(trim(coalesce(p_reference, '')), '')
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_credited(p_basis_id UUID, p_credit_note_no TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v invoice_bases%ROWTYPE;
  cn TEXT := trim(coalesce(p_credit_note_no, ''));
BEGIN
  PERFORM billing_require_admin();
  IF cn = '' THEN
    RAISE EXCEPTION 'Kreditfakturans nummer krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE id = p_basis_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Underlaget hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF v.status NOT IN ('invoiced', 'paid') THEN
    RAISE EXCEPTION 'Underlaget kan inte krediteras från status %', v.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE invoice_bases SET status = 'credited', credit_note_no = cn WHERE id = v.id;
  PERFORM billing_log_event(v.id, 'admin', 'credited', true, jsonb_build_object('credit_note_no', cn));
END;
$$;

-- Avbokar en bokning. Utan avgift avbryts underlaget. Med avgift (enligt lärosätets regler)
-- ersätts raden med en avgiftsrad och underlaget lever vidare. Redan fakturerade
-- underlag krediteras i stället (admin_mark_credited).
CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id UUID,
  p_reason TEXT,
  p_fee_ex_vat NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  v invoice_bases%ROWTYPE;
  has_basis BOOLEAN;
  amt RECORD;
BEGIN
  PERFORM billing_require_admin();
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Anledning krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bokningen hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Bokningen kan inte avbokas i status %', b.status USING ERRCODE = 'P0001';
  END IF;
  IF p_fee_ex_vat IS NOT NULL AND (p_fee_ex_vat < 0 OR p_fee_ex_vat > b.total_ex_vat) THEN
    RAISE EXCEPTION 'Avgiften måste vara mellan 0 och bokningens pris' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM invoice_bases WHERE booking_id = b.id FOR UPDATE;
  has_basis := FOUND;
  IF has_basis AND v.status NOT IN ('preliminary', 'ready') THEN
    RAISE EXCEPTION 'Fakturan är redan skapad. Kreditera den i stället.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE bookings
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = trim(p_reason)
   WHERE id = b.id;
  PERFORM billing_release_spots(b.id);

  IF NOT has_basis THEN
    RETURN;
  END IF;

  IF p_fee_ex_vat IS NOT NULL AND p_fee_ex_vat > 0 THEN
    SELECT * INTO amt FROM billing_compute_amounts(p_fee_ex_vat, v.vat_rate, b.commission_rate);
    UPDATE invoice_bases
       SET lines = jsonb_build_array(jsonb_build_object(
             'description', 'Avbokningsavgift: ' || b.title,
             'quantity', 1,
             'unit_price_ex_vat', amt.total_ex_vat,
             'total_ex_vat', amt.total_ex_vat
           )),
           total_ex_vat = amt.total_ex_vat,
           vat_amount = amt.vat_amount,
           total_inc_vat = amt.total_inc_vat,
           commission_amount = amt.commission_amount,
           payout_amount = amt.payout_amount,
           adjusted = true
     WHERE id = v.id;
    PERFORM billing_log_event(v.id, 'admin', 'cancelled', true, jsonb_build_object(
      'reason', trim(p_reason), 'fee_ex_vat', amt.total_ex_vat, 'booking_id', b.id
    ));
  ELSE
    UPDATE invoice_bases SET status = 'cancelled' WHERE id = v.id;
    PERFORM billing_log_event(v.id, 'admin', 'cancelled', true, jsonb_build_object(
      'reason', trim(p_reason), 'booking_id', b.id
    ));
  END IF;
END;
$$;

-- ── Admin: inställningar ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_provider_payout_details(
  p_provider_id UUID,
  p_payout_details JSONB,
  p_payout_org_number TEXT DEFAULT NULL,
  p_vat_registered BOOLEAN DEFAULT NULL,
  p_confirmed BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM billing_require_admin();
  IF NOT EXISTS (SELECT 1 FROM providers WHERE id = p_provider_id) THEN
    RAISE EXCEPTION 'Lärosätet hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF p_payout_details IS NULL OR jsonb_typeof(p_payout_details) <> 'object' THEN
    RAISE EXCEPTION 'Utbetalningsuppgifter måste vara ett objekt' USING ERRCODE = '22023';
  END IF;

  INSERT INTO provider_payout_details (provider_id, payout_details, payout_org_number, vat_registered, confirmed_at, confirmed_by)
  VALUES (
    p_provider_id, p_payout_details, nullif(trim(coalesce(p_payout_org_number, '')), ''), p_vat_registered,
    CASE WHEN p_confirmed THEN now() END, CASE WHEN p_confirmed THEN auth.uid() END
  )
  ON CONFLICT (provider_id) DO UPDATE
    SET payout_details = EXCLUDED.payout_details,
        payout_org_number = EXCLUDED.payout_org_number,
        vat_registered = EXCLUDED.vat_registered,
        confirmed_at = EXCLUDED.confirmed_at,
        confirmed_by = EXCLUDED.confirmed_by,
        updated_at = now();
END;
$$;

-- Satsändringar gäller bara nya bokningar. Befintliga bokningar har sina värden frysta.
CREATE OR REPLACE FUNCTION public.admin_update_billing_settings(
  p_default_vat_rate NUMERIC DEFAULT NULL,
  p_commission_rate NUMERIC DEFAULT NULL,
  p_payment_terms_days INTEGER DEFAULT NULL,
  p_payout_days_after_payment INTEGER DEFAULT NULL,
  p_seller JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM billing_require_admin();

  IF p_default_vat_rate IS NOT NULL AND (p_default_vat_rate < 0 OR p_default_vat_rate > 1) THEN
    RAISE EXCEPTION 'Momssats måste vara ett bråktal mellan 0 och 1' USING ERRCODE = '22023';
  END IF;
  IF p_commission_rate IS NOT NULL AND (p_commission_rate < 0 OR p_commission_rate > 1) THEN
    RAISE EXCEPTION 'Provisionssats måste vara ett bråktal mellan 0 och 1' USING ERRCODE = '22023';
  END IF;
  IF p_payment_terms_days IS NOT NULL AND p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Betalningsvillkor kan inte vara negativt' USING ERRCODE = '22023';
  END IF;
  IF p_payout_days_after_payment IS NOT NULL AND p_payout_days_after_payment < 0 THEN
    RAISE EXCEPTION 'Utbetalningstid kan inte vara negativ' USING ERRCODE = '22023';
  END IF;
  IF p_seller IS NOT NULL AND jsonb_typeof(p_seller) <> 'object' THEN
    RAISE EXCEPTION 'Säljaruppgifter måste vara ett objekt' USING ERRCODE = '22023';
  END IF;
  IF p_seller ? 'address' AND jsonb_typeof(p_seller -> 'address') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'Adressen måste vara ett objekt' USING ERRCODE = '22023';
  END IF;

  UPDATE billing_settings SET
    default_vat_rate = coalesce(p_default_vat_rate, default_vat_rate),
    commission_rate = coalesce(p_commission_rate, commission_rate),
    payment_terms_days = coalesce(p_payment_terms_days, payment_terms_days),
    payout_days_after_payment = coalesce(p_payout_days_after_payment, payout_days_after_payment),
    seller_name = CASE WHEN p_seller ? 'name' THEN nullif(trim(p_seller ->> 'name'), '') ELSE seller_name END,
    seller_org_number = CASE WHEN p_seller ? 'org_number' THEN nullif(trim(p_seller ->> 'org_number'), '') ELSE seller_org_number END,
    seller_vat_number = CASE WHEN p_seller ? 'vat_number' THEN nullif(trim(p_seller ->> 'vat_number'), '') ELSE seller_vat_number END,
    seller_bankgiro = CASE WHEN p_seller ? 'bankgiro' THEN nullif(trim(p_seller ->> 'bankgiro'), '') ELSE seller_bankgiro END,
    seller_address = CASE
      WHEN p_seller ? 'address' AND jsonb_typeof(p_seller -> 'address') = 'object' THEN p_seller -> 'address'
      WHEN p_seller ? 'address' THEN NULL
      ELSE seller_address END,
    updated_at = now(),
    updated_by = auth.uid();
END;
$$;

-- ── Cron: underlag blir klara vid kursstart ─────────────────────────────
-- Anropas av det dagliga cron-jobbet (service role). Returnerar de underlag som flyttades,
-- så att jobbet kan mejla admin. Ett andra anrop samma dag flyttar och returnerar inget.
CREATE OR REPLACE FUNCTION public.billing_mark_ready_due()
RETURNS TABLE (basis_id UUID, number TEXT, provider_id UUID, start_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    UPDATE invoice_bases ib
       SET status = 'ready'
      FROM bookings b
     WHERE ib.booking_id = b.id
       AND ib.status = 'preliminary'
       AND b.status = 'confirmed'
       AND b.start_date <= CURRENT_DATE
    RETURNING ib.id AS basis_id, ib.number AS number, b.provider_id AS provider_id, b.start_date AS start_date
  ), logged AS (
    INSERT INTO invoice_basis_events (basis_id, actor_user_id, actor_role, event_type, visible_to_provider, payload)
    SELECT due.basis_id, NULL, 'system', 'ready', true, jsonb_build_object('reason', 'course_started') FROM due
  )
  SELECT due.basis_id, due.number, due.provider_id, due.start_date FROM due;
END;
$$;

-- ── Behörigheter ────────────────────────────────────────────────────────
-- Hjälpfunktioner: inga klientgrants (de körs bara inifrån andra SECURITY DEFINER-funktioner).
REVOKE ALL ON FUNCTION public.billing_compute_amounts(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_log_event(UUID, TEXT, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_release_spots(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_create_basis(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_guard_basis_update() FROM PUBLIC, anon, authenticated;

-- Admin-RPC: bara inloggade kan anropa, och rollen kontrolleras i funktionen.
REVOKE ALL ON FUNCTION public.admin_adjust_invoice_basis(UUID, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_ready(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_exported(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_invoiced(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_paid(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_paid_out(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_credited(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_booking(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_provider_payout_details(UUID, JSONB, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_billing_settings(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_adjust_invoice_basis(UUID, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_exported(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_invoiced(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_paid(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_paid_out(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_credited(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_payout_details(UUID, JSONB, TEXT, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_billing_settings(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB) TO authenticated;

-- Cron-funktionen: bara service role.
REVOKE ALL ON FUNCTION public.billing_mark_ready_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_mark_ready_due() TO service_role;
