-- Paket B: RLS + RPC för "Efterfråga anpassad utbildning".
--
-- Principer
--  * Alla skrivningar och statusövergångar går via SECURITY DEFINER-RPC med
--    rollkontroll och event-loggning. Inga INSERT/UPDATE/DELETE-policies på
--    training_requests / assignments / events (endast admin notes får admin-ALL).
--  * Varje funktion kontrollerar auth.uid() IS NOT NULL / get_user_provider_id()
--    IS NOT NULL explicit före jämförelser (en NULL-jämförelse i IF hoppar
--    annars över RAISE – jfr update_provider_terms-buggen 2026-09-17).
--  * Köparen ser tilldelade lärosäten och offerter bara via RPC i begränsad
--    form; avböjanden och återkallade tilldelningar exponeras aldrig.
--  * Leverantörspolicyerna på custom_requests stramas åt: tidigare släpptes
--    training_id IS NULL igenom till ALLA leverantörer, vilket skulle läcka
--    tilldelade offertrader mellan lärosäten. Gamla allmänna förfrågningar
--    (utan provider_id) blir därmed osynliga för leverantörer; admin hanterar dem.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Intern händelselogg
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tr_log_event(
  p_request_id UUID,
  p_assignment_id UUID,
  p_actor_role TEXT,
  p_event_type TEXT,
  p_visible_to_buyer BOOLEAN,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO training_request_events
    (request_id, assignment_id, actor_user_id, actor_role, event_type, visible_to_buyer, payload)
  VALUES
    (p_request_id, p_assignment_id, auth.uid(), p_actor_role, p_event_type, p_visible_to_buyer, coalesce(p_payload, '{}'::jsonb))
$$;

REVOKE ALL ON FUNCTION public.tr_log_event(UUID, UUID, TEXT, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. RLS (läsning; inga skrivpolicies utom admin notes)
-- ════════════════════════════════════════════════════════════════════════
CREATE POLICY "Buyers, admins and assigned providers can read training requests"
  ON public.training_requests FOR SELECT TO authenticated
  USING (
    buyer_user_id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.training_request_assignments a
      WHERE a.request_id = training_requests.id
        AND a.provider_id = (SELECT public.get_user_provider_id())
        AND a.status <> 'withdrawn'
    )
  );

CREATE POLICY "Providers and admins can read own assignments"
  ON public.training_request_assignments FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (provider_id = (SELECT public.get_user_provider_id()) AND status <> 'withdrawn')
  );

CREATE POLICY "Buyers read visible events, admins read all"
  ON public.training_request_events FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      visible_to_buyer
      AND EXISTS (
        SELECT 1 FROM public.training_requests r
        WHERE r.id = training_request_events.request_id
          AND r.buyer_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "Only admins manage admin notes"
  ON public.training_request_admin_notes FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()) AND author_id = (SELECT auth.uid()));

-- ── custom_requests: stram åt leverantörs- och köparpolicyer ─────────────
DROP POLICY IF EXISTS "Providers can view relevant custom requests" ON public.custom_requests;
DROP POLICY IF EXISTS "Providers can update relevant custom requests" ON public.custom_requests;

CREATE POLICY "Providers can view own custom requests"
  ON public.custom_requests FOR SELECT TO authenticated
  USING (
    (SELECT public.get_user_provider_id()) IS NOT NULL
    AND (
      provider_id = (SELECT public.get_user_provider_id())
      OR EXISTS (
        SELECT 1 FROM public.trainings t
        WHERE t.id = custom_requests.training_id
          AND t.provider_id = (SELECT public.get_user_provider_id())
      )
    )
  );

CREATE POLICY "Providers can update own custom requests"
  ON public.custom_requests FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_provider_id()) IS NOT NULL
    AND (
      provider_id = (SELECT public.get_user_provider_id())
      OR EXISTS (
        SELECT 1 FROM public.trainings t
        WHERE t.id = custom_requests.training_id
          AND t.provider_id = (SELECT public.get_user_provider_id())
      )
    )
  )
  WITH CHECK (
    (SELECT public.get_user_provider_id()) IS NOT NULL
    AND (
      provider_id = (SELECT public.get_user_provider_id())
      OR EXISTS (
        SELECT 1 FROM public.trainings t
        WHERE t.id = custom_requests.training_id
          AND t.provider_id = (SELECT public.get_user_provider_id())
      )
    )
  );

-- Köpare ser inte offertraderna i sin vanliga förfrågningslista (en rad finns
-- redan som utkast innan leverantören svarat); de läses via buyer_request_offers().
DROP POLICY IF EXISTS "Members can view their organization's requests" ON public.custom_requests;
CREATE POLICY "Members can view their organization's requests"
  ON public.custom_requests FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.my_organization_ids())
    AND training_request_assignment_id IS NULL
  );

-- Skydda kopplingskolumnerna mot ändring från klienten (UPDATE-policyn saknade WITH CHECK-skydd per kolumn).
CREATE OR REPLACE FUNCTION public.guard_custom_request_assignment_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.provider_id IS DISTINCT FROM OLD.provider_id
      OR NEW.training_request_assignment_id IS DISTINCT FROM OLD.training_request_assignment_id)
     AND NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'provider_id och assignment-koppling på en förfrågan kan inte ändras'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_assignment_link() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_requests_guard_assignment_link
  BEFORE UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_assignment_link();

-- ════════════════════════════════════════════════════════════════════════
-- 3. Köpar-RPC
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_training_request(
  p_client_request_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_target_group TEXT,
  p_delivery_format TEXT,
  p_search_query TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'direct',
  p_learning_goals TEXT DEFAULT NULL,
  p_participant_count INTEGER DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_desired_start TEXT DEFAULT NULL,
  p_budget_range TEXT DEFAULT NULL,
  p_ssyk_skills JSONB DEFAULT '[]'::jsonb,
  p_marketplace_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  org UUID;
  mkt UUID;
  new_id UUID;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id krävs' USING ERRCODE = '22023';
  END IF;

  -- Idempotens: samma köpare + samma klient-id ger samma efterfrågan (ingen dubblett vid auto-submit).
  SELECT id INTO new_id FROM training_requests
   WHERE buyer_user_id = caller AND client_request_id = p_client_request_id;
  IF new_id IS NOT NULL THEN
    RETURN new_id;
  END IF;

  SELECT organization_id INTO org FROM organization_members
   WHERE user_id = caller ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN
    RAISE EXCEPTION 'Köparen måste tillhöra en organisation' USING ERRCODE = 'P0001';
  END IF;

  IF length(coalesce(p_title, '')) > 200
     OR length(coalesce(p_description, '')) > 5000
     OR length(coalesce(p_learning_goals, '')) > 5000
     OR length(coalesce(p_target_group, '')) > 1000 THEN
    RAISE EXCEPTION 'För lång text' USING ERRCODE = '22001';
  END IF;
  IF jsonb_typeof(coalesce(p_ssyk_skills, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_ssyk_skills, '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'Ogiltiga kompetenstaggar' USING ERRCODE = '22023';
  END IF;

  IF p_marketplace_id IS NOT NULL THEN
    SELECT id INTO mkt FROM marketplaces WHERE id = p_marketplace_id AND status = 'active';
  END IF;

  INSERT INTO training_requests (
    client_request_id, buyer_user_id, buyer_org_id, title, search_query, source,
    description, learning_goals, target_group, participant_count, delivery_format,
    location, desired_start, budget_range, ssyk_skills, marketplace_id
  ) VALUES (
    p_client_request_id, caller, org, trim(p_title), nullif(trim(coalesce(p_search_query, '')), ''),
    coalesce(p_source, 'direct'), trim(p_description), nullif(trim(coalesce(p_learning_goals, '')), ''),
    trim(p_target_group), p_participant_count, p_delivery_format,
    nullif(trim(coalesce(p_location, '')), ''), nullif(trim(coalesce(p_desired_start, '')), ''),
    nullif(trim(coalesce(p_budget_range, '')), ''), coalesce(p_ssyk_skills, '[]'::jsonb), mkt
  )
  RETURNING id INTO new_id;

  PERFORM tr_log_event(new_id, NULL, 'buyer', 'submitted', true, jsonb_build_object('source', coalesce(p_source, 'direct')));
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_training_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  r training_requests%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM training_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.buyer_user_id <> caller THEN
    RAISE EXCEPTION 'Efterfrågan hittades inte' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('submitted', 'in_review', 'assigned') THEN
    RAISE EXCEPTION 'Efterfrågan kan inte avbrytas i status %', r.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE training_request_assignments
     SET status = 'withdrawn'
   WHERE request_id = p_request_id AND status IN ('assigned', 'viewed');

  UPDATE training_requests SET status = 'cancelled', closed_at = now() WHERE id = p_request_id;
  PERFORM tr_log_event(p_request_id, NULL, 'buyer', 'cancelled', true);
END;
$$;

-- Begränsad vy för köparen: lärosätets namn + förenklad status. Avböjda och
-- återkallade tilldelningar visas aldrig.
CREATE OR REPLACE FUNCTION public.buyer_request_assignments(p_request_id UUID)
RETURNS TABLE (provider_id UUID, provider_name TEXT, simple_status TEXT)
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
    SELECT p.id, p.name,
           CASE a.status WHEN 'quoted' THEN 'offer_received' ELSE 'waiting' END
      FROM training_requests r
      JOIN training_request_assignments a ON a.request_id = r.id
      JOIN providers p ON p.id = a.provider_id
     WHERE r.id = p_request_id
       AND r.buyer_user_id = caller
       AND a.status IN ('assigned', 'viewed', 'quoted')
     ORDER BY p.name;
END;
$$;

-- Inkomna offerter (svarade custom_requests-rader) för köparens efterfrågan.
CREATE OR REPLACE FUNCTION public.buyer_request_offers(p_request_id UUID)
RETURNS TABLE (
  quote_id UUID,
  provider_id UUID,
  provider_name TEXT,
  status TEXT,
  response TEXT,
  responded_at TIMESTAMPTZ
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
    SELECT c.id, p.id, p.name, c.status, c.response, c.updated_at
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
-- 4. Admin-RPC
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_assign_providers(
  p_request_id UUID,
  p_provider_ids UUID[],
  p_deadline TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r training_requests%ROWTYPE;
  pid UUID;
  deadline TIMESTAMPTZ;
  a_id UUID;
  existing_status TEXT;
  assigned_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_provider_ids IS NULL OR coalesce(array_length(p_provider_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Minst ett lärosäte krävs' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM training_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Efterfrågan hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF r.status IN ('cancelled', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Efterfrågan är avslutad (status %)', r.status USING ERRCODE = 'P0001';
  END IF;

  deadline := coalesce(p_deadline, add_business_days(now(), 5));
  IF deadline <= now() THEN
    RAISE EXCEPTION 'Svarsdeadline måste ligga i framtiden' USING ERRCODE = '22023';
  END IF;

  FOREACH pid IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_provider_ids) AS x) LOOP
    IF NOT EXISTS (SELECT 1 FROM providers WHERE id = pid AND is_active) THEN
      RAISE EXCEPTION 'Okänt eller inaktivt lärosäte' USING ERRCODE = '22023';
    END IF;

    a_id := NULL;
    SELECT id, status INTO a_id, existing_status
      FROM training_request_assignments WHERE request_id = p_request_id AND provider_id = pid;

    IF a_id IS NULL THEN
      INSERT INTO training_request_assignments (request_id, provider_id, assigned_by, response_deadline)
      VALUES (p_request_id, pid, auth.uid(), deadline)
      RETURNING id INTO a_id;
    ELSIF existing_status = 'withdrawn' THEN
      UPDATE training_request_assignments
         SET status = 'assigned', response_deadline = deadline, assigned_by = auth.uid(),
             viewed_at = NULL, responded_at = NULL, decline_reason = NULL
       WHERE id = a_id;
    ELSE
      CONTINUE; -- redan tilldelat
    END IF;

    assigned_count := assigned_count + 1;
    PERFORM tr_log_event(p_request_id, a_id, 'admin', 'assigned', false,
                         jsonb_build_object('provider_id', pid, 'response_deadline', deadline));
  END LOOP;

  IF assigned_count > 0 THEN
    -- Köparen ser en sammanfattning, inte vilka lärosäten som har tackat nej.
    PERFORM tr_log_event(p_request_id, NULL, 'admin', 'assigned', true,
                         jsonb_build_object('count', assigned_count));
    IF r.status IN ('submitted', 'in_review') THEN
      UPDATE training_requests SET status = 'assigned' WHERE id = p_request_id;
    END IF;
  END IF;

  RETURN assigned_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_withdraw_assignment(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a training_request_assignments%ROWTYPE;
  r_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM training_request_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tilldelningen hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF a.status IN ('quoted', 'withdrawn') THEN
    RAISE EXCEPTION 'Tilldelningen kan inte dras tillbaka i status %', a.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE training_request_assignments SET status = 'withdrawn' WHERE id = p_assignment_id;
  PERFORM tr_log_event(a.request_id, a.id, 'admin', 'withdrawn', false,
                       jsonb_build_object('provider_id', a.provider_id));

  SELECT status INTO r_status FROM training_requests WHERE id = a.request_id FOR UPDATE;
  IF r_status = 'assigned' AND NOT EXISTS (
    SELECT 1 FROM training_request_assignments
     WHERE request_id = a.request_id AND status IN ('assigned', 'viewed', 'quoted')
  ) THEN
    UPDATE training_requests SET status = 'in_review' WHERE id = a.request_id;
    PERFORM tr_log_event(a.request_id, NULL, 'admin', 'status_changed', false,
                         jsonb_build_object('from', 'assigned', 'to', 'in_review'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_request_status(
  p_request_id UUID,
  p_status TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r training_requests%ROWTYPE;
  ev TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- assigned/offers_received sätts automatiskt av tilldelning/offert, cancelled av köparen.
  IF p_status NOT IN ('in_review', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Status % kan inte sättas manuellt', p_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM training_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Efterfrågan hittades inte' USING ERRCODE = 'P0002';
  END IF;
  IF r.status IN ('cancelled', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Efterfrågan är redan avslutad (status %)', r.status USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'in_review' AND r.status <> 'submitted' THEN
    RAISE EXCEPTION 'in_review kan bara sättas från submitted' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'no_match' AND r.status = 'offers_received' THEN
    RAISE EXCEPTION 'no_match kan inte sättas när offerter har kommit in' USING ERRCODE = 'P0001';
  END IF;

  IF p_status IN ('closed', 'no_match') THEN
    UPDATE training_request_assignments SET status = 'withdrawn'
     WHERE request_id = p_request_id AND status IN ('assigned', 'viewed');
    UPDATE training_requests SET status = p_status, closed_at = now() WHERE id = p_request_id;
  ELSE
    UPDATE training_requests SET status = p_status WHERE id = p_request_id;
  END IF;

  ev := CASE p_status WHEN 'closed' THEN 'closed' WHEN 'no_match' THEN 'no_match' ELSE 'status_changed' END;
  PERFORM tr_log_event(p_request_id, NULL, 'admin', ev, true,
                       jsonb_build_object('from', r.status, 'to', p_status,
                                          'message', nullif(trim(coalesce(p_message, '')), '')));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Leverantörs-RPC
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.provider_mark_viewed(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID := get_user_provider_id();
  a training_request_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  -- Admin som förhandsgranskar leverantörsportalen ska inte märka något som läst.
  IF coalesce(is_admin(), false) THEN
    RETURN;
  END IF;
  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM training_request_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.provider_id <> pid THEN
    RAISE EXCEPTION 'Tilldelningen hittades inte' USING ERRCODE = '42501';
  END IF;

  IF a.status = 'assigned' THEN
    UPDATE training_request_assignments SET status = 'viewed', viewed_at = now() WHERE id = a.id;
    PERFORM tr_log_event(a.request_id, a.id, 'provider', 'viewed', false);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_decline(p_assignment_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID := get_user_provider_id();
  a training_request_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Anledning krävs' USING ERRCODE = '22023';
  END IF;
  IF length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'För lång text' USING ERRCODE = '22001';
  END IF;

  SELECT * INTO a FROM training_request_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.provider_id <> pid THEN
    RAISE EXCEPTION 'Tilldelningen hittades inte' USING ERRCODE = '42501';
  END IF;
  IF a.status NOT IN ('assigned', 'viewed') THEN
    RAISE EXCEPTION 'Kan inte avböja i status %', a.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE training_request_assignments
     SET status = 'declined', responded_at = now(), decline_reason = trim(p_reason),
         viewed_at = coalesce(viewed_at, now())
   WHERE id = a.id;
  -- Inte synligt för köparen.
  PERFORM tr_log_event(a.request_id, a.id, 'provider', 'declined', false,
                       jsonb_build_object('reason', trim(p_reason)));
END;
$$;

-- Skapar (eller returnerar) offertraden i befintliga custom_requests. Leverantören
-- fyller sedan i svaret i det vanliga svarsformuläret; trigger nedan flyttar
-- tilldelningen till 'quoted' och efterfrågan till 'offers_received' vid första svaret.
CREATE OR REPLACE FUNCTION public.provider_respond_with_quote(p_assignment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID := get_user_provider_id();
  a training_request_assignments%ROWTYPE;
  r training_requests%ROWTYPE;
  buyer_email TEXT;
  buyer_name TEXT;
  org_name TEXT;
  new_id UUID;
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
  IF a.quote_request_id IS NOT NULL THEN
    RETURN a.quote_request_id;
  END IF;
  IF a.status NOT IN ('assigned', 'viewed') THEN
    RAISE EXCEPTION 'Kan inte lämna offert i status %', a.status USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM training_requests WHERE id = a.request_id;
  IF r.status IN ('cancelled', 'closed', 'no_match') THEN
    RAISE EXCEPTION 'Efterfrågan är avslutad' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email INTO buyer_email FROM auth.users u WHERE u.id = r.buyer_user_id;
  SELECT m.display_name INTO buyer_name FROM organization_members m
   WHERE m.user_id = r.buyer_user_id AND m.organization_id IS NOT DISTINCT FROM r.buyer_org_id;
  SELECT o.name INTO org_name FROM organizations o WHERE o.id = r.buyer_org_id;

  -- Köparens kontaktuppgifter följer samma regel som i befintligt RFP-flöde (företag, kontakt, e-post).
  INSERT INTO custom_requests (
    company, contact_name, contact_email, contact_phone, course_topic, description,
    budget, timeline, participants_count, status, marketplace_id,
    provider_id, training_request_assignment_id, response_deadline, organization_id
  ) VALUES (
    coalesce(org_name, ''), coalesce(buyer_name, ''), coalesce(buyer_email, ''), '',
    r.title, r.description, r.budget_range, coalesce(r.desired_start, ''),
    coalesce(r.participant_count::text, ''), 'new', r.marketplace_id,
    a.provider_id, a.id, a.response_deadline, r.buyer_org_id
  )
  RETURNING id INTO new_id;

  UPDATE training_request_assignments
     SET quote_request_id = new_id,
         status = CASE WHEN status = 'assigned' THEN 'viewed' ELSE status END,
         viewed_at = coalesce(viewed_at, now())
   WHERE id = a.id;

  RETURN new_id;
END;
$$;

-- När leverantören svarar på offertraden (status lämnar 'new'): tilldelning → quoted,
-- efterfrågan → offers_received, buyer-synligt event.
CREATE OR REPLACE FUNCTION public.sync_training_request_on_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a training_request_assignments%ROWTYPE;
  r_status TEXT;
BEGIN
  SELECT * INTO a FROM training_request_assignments
   WHERE id = NEW.training_request_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.status = 'quoted' THEN
    RETURN NEW;
  END IF;

  UPDATE training_request_assignments
     SET status = 'quoted', responded_at = now()
   WHERE id = a.id;
  PERFORM tr_log_event(a.request_id, a.id, 'provider', 'quoted', true,
                       jsonb_build_object('quote_id', NEW.id));

  SELECT status INTO r_status FROM training_requests WHERE id = a.request_id FOR UPDATE;
  IF r_status IN ('submitted', 'in_review', 'assigned') THEN
    UPDATE training_requests SET status = 'offers_received' WHERE id = a.request_id;
    PERFORM tr_log_event(a.request_id, NULL, 'system', 'status_changed', true,
                         jsonb_build_object('from', r_status, 'to', 'offers_received'));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_training_request_on_quote() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER custom_requests_sync_training_request
  AFTER UPDATE OF status ON public.custom_requests
  FOR EACH ROW
  WHEN (NEW.training_request_assignment_id IS NOT NULL
        AND OLD.status = 'new' AND NEW.status <> 'new')
  EXECUTE FUNCTION public.sync_training_request_on_quote();

-- ════════════════════════════════════════════════════════════════════════
-- 6. Behörigheter: endast inloggade får anropa RPC (anon nekas)
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.submit_training_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_training_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_request_assignments(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_request_offers(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_assign_providers(UUID, UUID[], TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_withdraw_assignment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_request_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_mark_viewed(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_decline(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_respond_with_quote(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_training_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_training_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_request_assignments(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_request_offers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_providers(UUID, UUID[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_withdraw_assignment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_request_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_mark_viewed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_decline(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_respond_with_quote(UUID) TO authenticated;
