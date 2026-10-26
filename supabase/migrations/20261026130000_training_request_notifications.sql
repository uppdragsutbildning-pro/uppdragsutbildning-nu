-- Paket H: e-postnotiser för "Efterfråga anpassad utbildning".
--
-- Återanvänder det befintliga mönstret: DB-trigger → notify_webhook() (pg_net) →
-- api/notify-webhook.ts → sendEmail (Brevo + email_log).
--
-- Källa är training_request_events, som redan loggar varje relevant steg. Triggern
-- skickar bara de händelsetyper som ger ett mejl:
--   submitted  → admin ("Ny efterfrågan")
--   assigned   → leverantörens användare (per tilldelning) och köparen (sammanfattning)
--   no_match   → köparen
--   closed     → köparen
-- "Offert inkommen → köparen" täcks redan av trigger på custom_requests (status
-- 'responded'), eftersom offertraden bär köparens e-post. "Deadline passerad utan svar →
-- admin" skickas av den dagliga cronen (api/check-overdue-requests.ts); escalated_at
-- hindrar att samma tilldelning eskaleras flera gånger.

CREATE TRIGGER trg_notify_training_request_events
  AFTER INSERT ON public.training_request_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('submitted', 'assigned', 'no_match', 'closed'))
  EXECUTE FUNCTION public.notify_webhook();

ALTER TABLE public.training_request_assignments
  ADD COLUMN escalated_at TIMESTAMPTZ;

-- En ny deadline (t.ex. när en återkallad tilldelning aktiveras igen) ska kunna eskaleras på nytt.
CREATE OR REPLACE FUNCTION public.tr_reset_assignment_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.response_deadline IS DISTINCT FROM OLD.response_deadline THEN
    NEW.escalated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER training_request_assignments_reset_escalation
  BEFORE UPDATE ON public.training_request_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tr_reset_assignment_escalation();
