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
