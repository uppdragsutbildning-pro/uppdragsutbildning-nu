-- Del 3 av 3: Fakturering Fas 1
-- Genererad 2026-10-27 av migrationsfilerna i supabase/migrations. Körs som EN transaktion: går något fel rullas allt tillbaka.
-- Projekt: PRODUCTION (iswctazjdtirrzswqkor). Kontrollera projektet innan Run.

BEGIN;

-- ═══ 20261026140000_billing_phase1_data_model.sql ═══
-- Paket A (Fakturering Fas 1): datamodell.
--
-- Bokning med fryst pris, fakturaunderlag, revisionslogg, inställningar,
-- fakturauppgifter på organisationer, utbetalningsuppgifter och avbokningsregler
-- för lärosäten, samt strukturerad offert och status "Ej vald" på custom_requests.
--
-- Principer (se Notion: "Uppdrag: Fakturering Fas 1"):
--  * Alla nya tabeller har RLS. Endast admin får läsa dem direkt. Köpare och
--    lärosäte läser via RPC (kommer i paket B–H). Inga skrivpolicies: skrivningar
--    sker via SECURITY DEFINER-RPC.
--  * Belopp är numeric(12,2). Sats-kolumner (moms, provision) lagras som bråktal:
--    0.2500 = 25 %.
--  * Bokningar och fakturaunderlag är bokföringsmaterial: FK mot organisation,
--    lärosäte, kursstart och offert är RESTRICT så att de inte försvinner av misstag.
--  * Utbetalningsuppgifter (bankgiro m.m.) ligger i en egen tabell, inte på
--    providers, eftersom providers är publikt läsbar rad för rad.

-- ── Inställningar (en rad) ──────────────────────────────────────────────
CREATE TABLE public.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  default_vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.2500 CHECK (default_vat_rate BETWEEN 0 AND 1),
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.2000 CHECK (commission_rate BETWEEN 0 AND 1),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  payout_days_after_payment INTEGER NOT NULL DEFAULT 10 CHECK (payout_days_after_payment >= 0),
  -- Säljarens uppgifter (CTC Nordic AB). Tomma tills de levereras; utkastet visar då "Uppgifter saknas".
  seller_name TEXT,
  seller_org_number TEXT,
  seller_vat_number TEXT,
  seller_address JSONB CHECK (seller_address IS NULL OR jsonb_typeof(seller_address) = 'object'),
  seller_bankgiro TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.billing_settings (id) VALUES (true);

COMMENT ON COLUMN public.billing_settings.default_vat_rate IS 'Bråktal: 0.2500 = 25 %.';
COMMENT ON COLUMN public.billing_settings.commission_rate IS 'Bråktal: 0.2000 = 20 %. Räknas på priset exklusive moms.';

-- ── Fakturauppgifter på organisationen (köparen) ────────────────────────
-- organizations har redan RLS som bara släpper igenom medlemmar och admin.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS invoice_address JSONB
    CHECK (invoice_address IS NULL OR jsonb_typeof(invoice_address) = 'object'),
  ADD COLUMN IF NOT EXISTS invoice_email TEXT,
  ADD COLUMN IF NOT EXISTS e_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS default_reference TEXT;

-- ── Avbokningsregler på lärosätet ───────────────────────────────────────
-- Publik information (visas på kursdetaljen), därför på providers.
-- Form: {"free_until_days_before_start": int, "late_fee_percent": 0-100, "text": "…"}.
-- NULL = ingen policy registrerad. Fälten valideras av RPC (paket D2).
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS cancellation_policy JSONB
    CHECK (cancellation_policy IS NULL OR jsonb_typeof(cancellation_policy) = 'object');

-- ── Utbetalningsuppgifter (endast admin) ────────────────────────────────
CREATE TABLE public.provider_payout_details (
  provider_id UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payout_details) = 'object'),
  payout_org_number TEXT,
  vat_registered BOOLEAN,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_payout_details_confirmed_by ON public.provider_payout_details(confirmed_by);

-- ── Strukturerad offert och "Ej vald" på custom_requests ────────────────
ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS offer_total_ex_vat NUMERIC(12,2) CHECK (offer_total_ex_vat IS NULL OR offer_total_ex_vat >= 0),
  ADD COLUMN IF NOT EXISTS offer_participants INTEGER CHECK (offer_participants IS NULL OR offer_participants > 0),
  ADD COLUMN IF NOT EXISTS offer_start_date DATE,
  ADD COLUMN IF NOT EXISTS offer_end_date DATE,
  ADD COLUMN IF NOT EXISTS offer_valid_until DATE,
  ADD COLUMN IF NOT EXISTS offer_location TEXT,
  ADD COLUMN IF NOT EXISTS offer_terms TEXT,
  ADD COLUMN IF NOT EXISTS not_selected_reason_code TEXT
    CHECK (not_selected_reason_code IS NULL OR not_selected_reason_code IN ('price', 'timing', 'content', 'experience', 'other')),
  ADD COLUMN IF NOT EXISTS not_selected_reason_text TEXT;

-- Statusvärdet 'not_selected' (Ej vald). Constraintens namn kan skilja mellan miljöer,
-- så den hittas via katalogen i stället för att antas.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.custom_requests'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
       AND pg_get_constraintdef(oid) ILIKE '%responded%'
  LOOP
    EXECUTE format('ALTER TABLE public.custom_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.custom_requests
  ADD CONSTRAINT custom_requests_status_check
  CHECK (status IN ('new', 'responded', 'negotiating', 'accepted', 'declined', 'not_selected'));

-- Direkta INSERT från anon/authenticated (den publika förfrågan) får inte sätta de nya
-- kopplings- och offertfälten eller status 'not_selected'. SECURITY DEFINER-RPC körs som
-- funktionens ägare (current_user ≠ anon/authenticated) och påverkas inte.
CREATE OR REPLACE FUNCTION public.guard_custom_request_insert_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.provider_id := NULL;
    NEW.training_request_assignment_id := NULL;
    NEW.offer_total_ex_vat := NULL;
    NEW.offer_participants := NULL;
    NEW.offer_start_date := NULL;
    NEW.offer_end_date := NULL;
    NEW.offer_valid_until := NULL;
    NEW.offer_location := NULL;
    NEW.offer_terms := NULL;
    NEW.not_selected_reason_code := NULL;
    NEW.not_selected_reason_text := NULL;
    IF NEW.status = 'not_selected' THEN
      NEW.status := 'new';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER custom_requests_guard_insert_columns
  BEFORE INSERT ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_insert_columns();

-- ── Bokningar ───────────────────────────────────────────────────────────
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Idempotensnyckel från klienten: dubbelklick ger ingen dubblett.
  client_booking_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('scheduled_start', 'custom_quote')),
  buyer_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE SET NULL,
  training_id UUID REFERENCES public.trainings(id) ON DELETE SET NULL,
  scheduled_start_id UUID REFERENCES public.scheduled_starts(id) ON DELETE RESTRICT,
  training_request_id UUID REFERENCES public.training_requests(id) ON DELETE SET NULL,
  quote_request_id UUID REFERENCES public.custom_requests(id) ON DELETE RESTRICT,
  -- Frysta värden vid bekräftelse
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  participants INTEGER NOT NULL CHECK (participants > 0),
  unit_price_ex_vat NUMERIC(12,2) CHECK (unit_price_ex_vat IS NULL OR unit_price_ex_vat >= 0),
  total_ex_vat NUMERIC(12,2) NOT NULL CHECK (total_ex_vat >= 0),
  vat_rate NUMERIC(5,4) NOT NULL CHECK (vat_rate BETWEEN 0 AND 1),
  commission_rate NUMERIC(5,4) NOT NULL CHECK (commission_rate BETWEEN 0 AND 1),
  start_date DATE NOT NULL,
  reference TEXT,
  -- Avbokning: lärosätets regler fryses vid bokningen, och köparen bekräftar dem.
  cancellation_policy JSONB CHECK (cancellation_policy IS NULL OR jsonb_typeof(cancellation_policy) = 'object'),
  cancellation_accepted_at TIMESTAMPTZ,
  cancellation_requested_at TIMESTAMPTZ,
  cancellation_request_message TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_buyer_client_key UNIQUE (buyer_user_id, client_booking_id),
  CONSTRAINT bookings_source_consistent CHECK (
    (source = 'scheduled_start' AND scheduled_start_id IS NOT NULL)
    OR (source = 'custom_quote' AND quote_request_id IS NOT NULL)
  )
);

CREATE INDEX idx_bookings_buyer_org ON public.bookings(buyer_org_id);
CREATE INDEX idx_bookings_buyer_user ON public.bookings(buyer_user_id);
CREATE INDEX idx_bookings_provider ON public.bookings(provider_id);
CREATE INDEX idx_bookings_marketplace ON public.bookings(marketplace_id);
CREATE INDEX idx_bookings_training ON public.bookings(training_id);
CREATE INDEX idx_bookings_scheduled_start ON public.bookings(scheduled_start_id);
CREATE INDEX idx_bookings_training_request ON public.bookings(training_request_id);
-- En offert kan bara ligga bakom en aktiv bokning.
CREATE UNIQUE INDEX idx_bookings_quote_active ON public.bookings(quote_request_id)
  WHERE quote_request_id IS NOT NULL AND status <> 'cancelled';
-- Cron: bokningar som startar.
CREATE INDEX idx_bookings_start_confirmed ON public.bookings(start_date) WHERE status = 'confirmed';

CREATE TRIGGER bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tr_set_updated_at();

-- ── Fakturaunderlag ─────────────────────────────────────────────────────
-- Löpnummer för underlag (inte det juridiska fakturanumret, det sätter Fortnox).
CREATE SEQUENCE public.invoice_basis_number_seq;

CREATE TABLE public.invoice_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  number TEXT NOT NULL UNIQUE DEFAULT (
    'UB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_basis_number_seq')::text, 4, '0')
  ),
  status TEXT NOT NULL DEFAULT 'preliminary'
    CHECK (status IN ('preliminary', 'ready', 'invoiced', 'paid', 'paid_out', 'cancelled', 'credited')),
  -- [{"description": "…", "quantity": n, "unit_price_ex_vat": n, "total_ex_vat": n}]
  lines JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  total_ex_vat NUMERIC(12,2) NOT NULL CHECK (total_ex_vat >= 0),
  vat_rate NUMERIC(5,4) NOT NULL CHECK (vat_rate BETWEEN 0 AND 1),
  vat_amount NUMERIC(12,2) NOT NULL CHECK (vat_amount >= 0),
  total_inc_vat NUMERIC(12,2) NOT NULL CHECK (total_inc_vat >= 0),
  commission_amount NUMERIC(12,2) NOT NULL CHECK (commission_amount >= 0),
  payout_amount NUMERIC(12,2) NOT NULL CHECK (payout_amount >= 0),
  adjusted BOOLEAN NOT NULL DEFAULT false,
  invoice_date DATE,
  due_date DATE,
  exported_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_due_date DATE,
  paid_out_at TIMESTAMPTZ,
  fortnox_invoice_no TEXT,
  credit_note_no TEXT,
  payout_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Beloppen hänger ihop. Databasen vägrar underlag där summorna inte stämmer.
  CONSTRAINT invoice_bases_amounts_consistent CHECK (
    total_inc_vat = total_ex_vat + vat_amount
    AND payout_amount = total_ex_vat - commission_amount
    AND commission_amount <= total_ex_vat
  ),
  CONSTRAINT invoice_bases_due_after_invoice CHECK (
    invoice_date IS NULL OR due_date IS NULL OR due_date >= invoice_date
  )
);

CREATE UNIQUE INDEX idx_invoice_bases_fortnox_no ON public.invoice_bases(fortnox_invoice_no)
  WHERE fortnox_invoice_no IS NOT NULL;
CREATE INDEX idx_invoice_bases_status ON public.invoice_bases(status, created_at);
CREATE INDEX idx_invoice_bases_payout_due ON public.invoice_bases(payout_due_date) WHERE status = 'paid';

CREATE TRIGGER invoice_bases_set_updated_at
  BEFORE UPDATE ON public.invoice_bases
  FOR EACH ROW EXECUTE FUNCTION public.tr_set_updated_at();

-- ── Revisionslogg ───────────────────────────────────────────────────────
CREATE TABLE public.invoice_basis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basis_id UUID NOT NULL REFERENCES public.invoice_bases(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('buyer', 'provider', 'admin', 'system')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'adjusted', 'ready', 'exported', 'invoiced', 'paid', 'paid_out',
    'cancelled', 'credited', 'cancellation_requested'
  )),
  visible_to_provider BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_basis_events_basis ON public.invoice_basis_events(basis_id, created_at);
CREATE INDEX idx_invoice_basis_events_actor ON public.invoice_basis_events(actor_user_id);

-- ── RLS och behörigheter ────────────────────────────────────────────────
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_payout_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_basis_events ENABLE ROW LEVEL SECURITY;

-- Skärpning utöver RLS: ingen direkt skrivåtkomst alls, och anon når inget.
REVOKE ALL ON public.billing_settings, public.provider_payout_details, public.bookings,
              public.invoice_bases, public.invoice_basis_events FROM anon, authenticated;
GRANT SELECT ON public.billing_settings, public.provider_payout_details, public.bookings,
                public.invoice_bases, public.invoice_basis_events TO authenticated;

CREATE POLICY "Admins can read billing settings"
  ON public.billing_settings FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can read provider payout details"
  ON public.provider_payout_details FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can read bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can read invoice bases"
  ON public.invoice_bases FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can read invoice basis events"
  ON public.invoice_basis_events FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));


-- ═══ 20261026150000_billing_phase1_rls_rpc_admin.sql ═══
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


-- ═══ 20261026160000_billing_phase1_structured_offer.sql ═══
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


-- ═══ 20261026170000_billing_phase1_booking.sql ═══
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


-- ═══ 20261026180000_billing_phase1_cancellation.sql ═══
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


-- ═══ 20261026190000_billing_phase1_ready_notify.sql ═══
-- Fakturering Fas 1, paket E: automatik vid kursstart.
--
-- billing_mark_ready_due() (paket B) flyttar underlag från preliminary till ready vid kursstart.
-- Problemet med att bara returnera de flyttade raderna: om mejlet till admin misslyckas efter
-- flytten finns inget kvar som talar om att admin inte har fått besked. Därför får underlaget en
-- flagga som cron-jobbet läser och rensar först när mejlet har gått iväg:
--
--   ready_notify_pending = true   sätts bara av billing_mark_ready_due (automatiken)
--   cron skickar ETT samlat mejl per körning och rensar flaggan om mejlet lyckades
--
-- Manuell markering via admin_mark_ready sätter inte flaggan (admin gjorde det själv).
-- Ett andra anrop samma dag flyttar inget och flaggar inget nytt, så inget mejl skickas två gånger.

ALTER TABLE public.invoice_bases
  ADD COLUMN ready_notify_pending BOOLEAN NOT NULL DEFAULT false;

-- Cron-jobbet läser bara de få raderna som väntar på besked.
CREATE INDEX idx_invoice_bases_ready_notify
  ON public.invoice_bases(created_at) WHERE ready_notify_pending;

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
       SET status = 'ready', ready_notify_pending = true
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

-- Behörigheterna är oförändrade (bara service role), men CREATE OR REPLACE behåller dem.
REVOKE ALL ON FUNCTION public.billing_mark_ready_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_mark_ready_due() TO service_role;


-- ═══ 20261026200000_billing_phase1_role_views.sql ═══
-- Fakturering Fas 1, paket H: rollanpassad läsning för lärosäte och köpare.
--
-- Basetabellerna (bookings, invoice_bases, invoice_basis_events) är bara läsbara för admin. Lärosäte
-- och köpare läser via de här funktionerna, som läser exakt samma rader och samma beräknade belopp
-- som Admin ser, men exponerar bara de kolumner rollen får se:
--
--   provider_list_invoicing   lärosätet: status, pris exkl. moms, provision, netto, förfallodatum,
--                             planerat utbetalningsdatum, utbetald, om underlaget justerats.
--                             Aldrig moms, Fortnox-nummer, utbetalningsreferens, bankuppgifter
--                             eller anledningen till en justering.
--   provider_invoicing_events lärosätets synliga händelser för ett underlag (ingen payload).
--   buyer_list_invoices       köparen: status, belopp inkl. moms, förfallodatum, betaldatum,
--                             Fortnox-fakturanummer. Aldrig provision, netto eller utbetalning:
--                             ett underlag som är utbetalt visas för köparen som betalt.
--
-- last_event_at är tidpunkten för senaste händelse som rollen får se, och används för "Nytt"-märken.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Lärosätet
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.provider_list_invoicing(UUID);

CREATE FUNCTION public.provider_list_invoicing(p_provider_id UUID DEFAULT NULL)
RETURNS TABLE (
  basis_id UUID,
  number TEXT,
  status TEXT,
  booking_id UUID,
  booking_status TEXT,
  source TEXT,
  title TEXT,
  buyer_name TEXT,
  participants INTEGER,
  unit_price_ex_vat NUMERIC,
  total_ex_vat NUMERIC,
  commission_amount NUMERIC,
  payout_amount NUMERIC,
  start_date DATE,
  confirmed_at TIMESTAMPTZ,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payout_due_date DATE,
  paid_out_at TIMESTAMPTZ,
  adjusted BOOLEAN,
  last_event_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(is_admin(), false) THEN
    pid := p_provider_id;
  ELSE
    pid := get_user_provider_id();
  END IF;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT ib.id, ib.number, ib.status, b.id, b.status, b.source, b.title, o.name,
           b.participants, b.unit_price_ex_vat, ib.total_ex_vat, ib.commission_amount, ib.payout_amount,
           b.start_date, b.confirmed_at, ib.due_date, ib.paid_at,
           -- Planerad utbetalning visas bara medan den är aktuell (betald, inte utbetald).
           CASE WHEN ib.status = 'paid' THEN ib.payout_due_date END,
           ib.paid_out_at, ib.adjusted,
           (SELECT max(e.created_at) FROM invoice_basis_events e
             WHERE e.basis_id = ib.id AND e.visible_to_provider)
      FROM invoice_bases ib
      JOIN bookings b ON b.id = ib.booking_id
      JOIN organizations o ON o.id = b.buyer_org_id
     WHERE b.provider_id = pid
     ORDER BY b.start_date DESC, ib.number DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.provider_invoicing_events(UUID, UUID);

CREATE FUNCTION public.provider_invoicing_events(p_basis_id UUID, p_provider_id UUID DEFAULT NULL)
RETURNS TABLE (event_type TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(is_admin(), false) THEN
    pid := p_provider_id;
  ELSE
    pid := get_user_provider_id();
  END IF;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT e.event_type, e.created_at
      FROM invoice_basis_events e
      JOIN invoice_bases ib ON ib.id = e.basis_id
      JOIN bookings b ON b.id = ib.booking_id
     WHERE e.basis_id = p_basis_id
       AND b.provider_id = pid
       AND e.visible_to_provider
     ORDER BY e.created_at;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Köparen
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.buyer_list_invoices();

CREATE FUNCTION public.buyer_list_invoices()
RETURNS TABLE (
  basis_id UUID,
  number TEXT,
  status TEXT,
  booking_id UUID,
  organization_id UUID,
  organization_name TEXT,
  title TEXT,
  provider_name TEXT,
  participants INTEGER,
  start_date DATE,
  reference TEXT,
  total_ex_vat NUMERIC,
  vat_rate NUMERIC,
  vat_amount NUMERIC,
  total_inc_vat NUMERIC,
  fortnox_invoice_no TEXT,
  invoice_date DATE,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ
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
    SELECT ib.id, ib.number,
           -- Utbetalning till lärosätet är inte köparens sak: utbetalt visas som betalt.
           CASE WHEN ib.status = 'paid_out' THEN 'paid' ELSE ib.status END,
           b.id, b.buyer_org_id, o.name, b.title, p.name, b.participants, b.start_date, b.reference,
           ib.total_ex_vat, ib.vat_rate, ib.vat_amount, ib.total_inc_vat,
           ib.fortnox_invoice_no, ib.invoice_date, ib.due_date, ib.paid_at,
           (SELECT max(e.created_at) FROM invoice_basis_events e
             WHERE e.basis_id = ib.id
               AND e.event_type IN ('ready', 'adjusted', 'invoiced', 'paid', 'cancelled', 'credited'))
      FROM invoice_bases ib
      JOIN bookings b ON b.id = ib.booking_id
      JOIN organizations o ON o.id = b.buyer_org_id
      JOIN providers p ON p.id = b.provider_id
     WHERE b.buyer_org_id IN (SELECT my_organization_ids())
     ORDER BY b.start_date DESC, ib.number DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Behörigheter
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.provider_list_invoicing(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_invoicing_events(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_list_invoices() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provider_list_invoicing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_invoicing_events(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_list_invoices() TO authenticated;


-- ═══ 20261026210000_billing_phase1_notifications.sql ═══
-- Fakturering Fas 1, paket I: notiser.
--
-- Återanvänder det befintliga mönstret: DB-trigger -> notify_webhook() (pg_net) -> api/notify-webhook.ts
-- -> sendEmail (Brevo + email_log). Triggers skickar bara ett anrop; vem som får mejl och med vilken
-- text avgörs i webhooken.
--
--   bookings INSERT (bekräftad)         köparen: bokning bekräftad. Lärosätet: bokning bekräftad.
--   training_request_events 'not_selected'
--                                       lärosäte vars offert inte valdes: besked med köparens anledning
--                                       (aldrig vinnarens namn eller pris).
--   training_request_events 'withdrawn' (reason quote_accepted)
--                                       lärosäte som inte hunnit svara: efterfrågan är avslutad.
--   invoice_basis_events 'paid_out'     lärosätet: utbetalning gjord.
--   invoice_basis_events 'cancellation_requested'
--                                       admin: köparen har begärt avbokning.
--
-- Redan på plats och oförändrat: klara underlag vid kursstart till admin (paket E) och mejlet om att en
-- offert har kommit in till köparen. Köparen får inget "avböjts"-mejl när en annan offert väljs, eftersom
-- buyer_accept_quote loggar händelsen quote_accepted (inte closed) och sätter status not_selected (inte declined).
--
-- Påminnelsen till admin när en utbetalning närmar sig skickas av det dagliga cron-jobbet.
-- payout_reminder_sent_at hindrar att samma underlag påminns flera gånger.

ALTER TABLE public.invoice_bases
  ADD COLUMN payout_reminder_sent_at TIMESTAMPTZ;

-- Cron läser bara betalda underlag som ännu inte påmints.
CREATE INDEX idx_invoice_bases_payout_reminder
  ON public.invoice_bases(payout_due_date)
  WHERE status = 'paid' AND payout_reminder_sent_at IS NULL;

-- Utökar den befintliga triggern på efterfrågningarnas händelser med not_selected och withdrawn.
-- (withdrawn skickas också när admin drar tillbaka en tilldelning; webhooken mejlar bara när
-- anledningen är quote_accepted.)
DROP TRIGGER IF EXISTS trg_notify_training_request_events ON public.training_request_events;

CREATE TRIGGER trg_notify_training_request_events
  AFTER INSERT ON public.training_request_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('submitted', 'assigned', 'no_match', 'closed', 'not_selected', 'withdrawn'))
  EXECUTE FUNCTION public.notify_webhook();

CREATE TRIGGER trg_notify_bookings
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION public.notify_webhook();

CREATE TRIGGER trg_notify_invoice_basis_events
  AFTER INSERT ON public.invoice_basis_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('paid_out', 'cancellation_requested'))
  EXECUTE FUNCTION public.notify_webhook();

COMMIT;
