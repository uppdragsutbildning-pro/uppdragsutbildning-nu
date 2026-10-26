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
