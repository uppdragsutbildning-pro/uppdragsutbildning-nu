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
