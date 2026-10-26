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
