-- Offert: föreslaget upplägg, behovsgranskning och kommentar till köparen (leverantörssidan),
-- samt fler fält till köparens jämförelsevy.
--
--  * Nya kolumner på custom_requests: offer_delivery_format, offer_duration_hours, offer_modules,
--    offer_fit_comment, offer_needs_check, offer_reviewed_at.
--  * provider_submit_offer får fem nya parametrar och kräver p_reviewed = true (leverantören
--    bekräftar att förfrågan är granskad). Den gamla 9-parametersversionen tas bort.
--  * guard_custom_request_client_update skyddar de nya fälten mot direkta klientändringar.
--  * buyer_request_offers returnerar de nya fälten samt leverantörens avbokningsvillkor
--    (returtypen ändras, så funktionen droppas och skapas om).
--
-- Inga destruktiva ändringar av data: bara nya nullable kolumner.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Kolumner
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS offer_delivery_format TEXT
    CHECK (offer_delivery_format IS NULL OR offer_delivery_format IN ('on_site', 'remote', 'hybrid', 'flexible')),
  ADD COLUMN IF NOT EXISTS offer_duration_hours NUMERIC
    CHECK (offer_duration_hours IS NULL OR (offer_duration_hours > 0 AND offer_duration_hours <= 10000)),
  ADD COLUMN IF NOT EXISTS offer_modules JSONB,
  ADD COLUMN IF NOT EXISTS offer_fit_comment TEXT,
  ADD COLUMN IF NOT EXISTS offer_needs_check JSONB,
  ADD COLUMN IF NOT EXISTS offer_reviewed_at TIMESTAMPTZ;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Skydd mot direkta klientändringar (samma som tidigare + nya fält)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_custom_request_client_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR coalesce(is_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF NEW.offer_total_ex_vat IS DISTINCT FROM OLD.offer_total_ex_vat
     OR NEW.offer_participants IS DISTINCT FROM OLD.offer_participants
     OR NEW.offer_start_date IS DISTINCT FROM OLD.offer_start_date
     OR NEW.offer_end_date IS DISTINCT FROM OLD.offer_end_date
     OR NEW.offer_valid_until IS DISTINCT FROM OLD.offer_valid_until
     OR NEW.offer_location IS DISTINCT FROM OLD.offer_location
     OR NEW.offer_terms IS DISTINCT FROM OLD.offer_terms
     OR NEW.offer_delivery_format IS DISTINCT FROM OLD.offer_delivery_format
     OR NEW.offer_duration_hours IS DISTINCT FROM OLD.offer_duration_hours
     OR NEW.offer_modules IS DISTINCT FROM OLD.offer_modules
     OR NEW.offer_fit_comment IS DISTINCT FROM OLD.offer_fit_comment
     OR NEW.offer_needs_check IS DISTINCT FROM OLD.offer_needs_check
     OR NEW.offer_reviewed_at IS DISTINCT FROM OLD.offer_reviewed_at
     OR NEW.not_selected_reason_code IS DISTINCT FROM OLD.not_selected_reason_code
     OR NEW.not_selected_reason_text IS DISTINCT FROM OLD.not_selected_reason_text THEN
    RAISE EXCEPTION 'Offertfälten kan bara ändras via offertfunktionerna' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'not_selected' AND OLD.status IS DISTINCT FROM 'not_selected' THEN
    RAISE EXCEPTION 'Status Ej vald sätts av köparens val av offert' USING ERRCODE = '42501';
  END IF;

  IF OLD.training_request_assignment_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.response IS DISTINCT FROM OLD.response) THEN
    RAISE EXCEPTION 'Offerten lämnas med provider_submit_offer och accepteras av köparen'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. Lärosätet lämnar offert med upplägg och behovsgranskning
-- ════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.provider_submit_offer(UUID, NUMERIC, INTEGER, DATE, DATE, DATE, TEXT, TEXT, TEXT);

CREATE FUNCTION public.provider_submit_offer(
  p_assignment_id UUID,
  p_total_ex_vat NUMERIC,
  p_participants INTEGER,
  p_start_date DATE,
  p_end_date DATE DEFAULT NULL,
  p_valid_until DATE DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_terms TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_delivery_format TEXT DEFAULT NULL,
  p_duration_hours NUMERIC DEFAULT NULL,
  p_modules JSONB DEFAULT NULL,
  p_fit_comment TEXT DEFAULT NULL,
  p_needs_check JSONB DEFAULT NULL,
  p_reviewed BOOLEAN DEFAULT FALSE
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
  m JSONB;
  n JSONB;
  fit TEXT := nullif(trim(coalesce(p_fit_comment, '')), '');
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
  IF NOT coalesce(p_reviewed, FALSE) THEN
    RAISE EXCEPTION 'Bekräfta att du har granskat förfrågan innan du skickar offerten' USING ERRCODE = '22023';
  END IF;

  IF p_delivery_format IS NOT NULL AND p_delivery_format NOT IN ('on_site', 'remote', 'hybrid', 'flexible') THEN
    RAISE EXCEPTION 'Okänt genomförandesätt %', p_delivery_format USING ERRCODE = '22023';
  END IF;
  IF p_duration_hours IS NOT NULL AND (p_duration_hours <= 0 OR p_duration_hours > 10000) THEN
    RAISE EXCEPTION 'Omfattningen i timmar måste vara större än 0' USING ERRCODE = '22023';
  END IF;
  IF fit IS NOT NULL AND length(fit) > 4000 THEN
    RAISE EXCEPTION 'Kommentaren om behovet får vara högst 4000 tecken' USING ERRCODE = '22023';
  END IF;

  IF p_modules IS NOT NULL THEN
    IF jsonb_typeof(p_modules) <> 'array' OR jsonb_array_length(p_modules) > 15 THEN
      RAISE EXCEPTION 'Upplägget måste vara en lista med högst 15 moduler' USING ERRCODE = '22023';
    END IF;
    FOR m IN SELECT * FROM jsonb_array_elements(p_modules) LOOP
      IF jsonb_typeof(m) <> 'object'
         OR length(trim(coalesce(m->>'title', ''))) = 0
         OR length(m->>'title') > 200
         OR length(coalesce(m->>'description', '')) > 2000 THEN
        RAISE EXCEPTION 'Varje modul behöver en titel (högst 200 tecken) och en beskrivning (högst 2000)' USING ERRCODE = '22023';
      END IF;
      IF m ? 'hours' AND m->>'hours' IS NOT NULL AND (
           jsonb_typeof(m->'hours') <> 'number' OR (m->>'hours')::numeric < 0 OR (m->>'hours')::numeric > 10000) THEN
        RAISE EXCEPTION 'Timmar för en modul måste vara ett tal mellan 0 och 10000' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF p_needs_check IS NOT NULL THEN
    IF jsonb_typeof(p_needs_check) <> 'array' OR jsonb_array_length(p_needs_check) > 12 THEN
      RAISE EXCEPTION 'Behovsgranskningen måste vara en lista' USING ERRCODE = '22023';
    END IF;
    FOR n IN SELECT * FROM jsonb_array_elements(p_needs_check) LOOP
      IF jsonb_typeof(n) <> 'object'
         OR coalesce(n->>'key', '') NOT IN ('goals', 'target_group', 'participants', 'format', 'location', 'period', 'budget')
         OR coalesce(n->>'status', '') NOT IN ('meets', 'deviates')
         OR length(coalesce(n->>'comment', '')) > 1000 THEN
        RAISE EXCEPTION 'Ogiltig rad i behovsgranskningen' USING ERRCODE = '22023';
      END IF;
      IF n->>'status' = 'deviates' AND length(trim(coalesce(n->>'comment', ''))) = 0 THEN
        RAISE EXCEPTION 'Förklara avvikelsen i behovsgranskningen' USING ERRCODE = '22023';
      END IF;
    END LOOP;
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
         offer_delivery_format = p_delivery_format,
         offer_duration_hours = p_duration_hours,
         offer_modules = CASE WHEN p_modules IS NULL OR jsonb_array_length(p_modules) = 0 THEN NULL ELSE p_modules END,
         offer_fit_comment = fit,
         offer_needs_check = CASE WHEN p_needs_check IS NULL OR jsonb_array_length(p_needs_check) = 0 THEN NULL ELSE p_needs_check END,
         offer_reviewed_at = now(),
         response = coalesce(nullif(trim(coalesce(p_message, '')), ''), response, ''),
         status = CASE WHEN status = 'new' THEN 'responded' ELSE status END
   WHERE id = quote_id;

  RETURN quote_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Köparen ser upplägg, behovsgranskning och avbokningsvillkor
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
  offer_terms TEXT,
  offer_delivery_format TEXT,
  offer_duration_hours NUMERIC,
  offer_modules JSONB,
  offer_fit_comment TEXT,
  offer_needs_check JSONB,
  cancellation_policy JSONB
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
           c.offer_valid_until, c.offer_location, c.offer_terms,
           c.offer_delivery_format, c.offer_duration_hours, c.offer_modules,
           c.offer_fit_comment, c.offer_needs_check, p.cancellation_policy
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

REVOKE ALL ON FUNCTION public.provider_submit_offer(UUID, NUMERIC, INTEGER, DATE, DATE, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_request_offers(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.provider_submit_offer(UUID, NUMERIC, INTEGER, DATE, DATE, DATE, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_request_offers(UUID) TO authenticated;
