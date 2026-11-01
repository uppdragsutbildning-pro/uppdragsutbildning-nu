-- Efterfrågan från en kurs: koppling till kursen och lärosätet, och direkt tilldelning.
--
-- När köparen begär anpassad utbildning från en kurssida ("Begär anpassad utbildning") kopplas
-- efterfrågan till kursen och dess lärosäte, och skickas direkt till just det lärosätet utan att
-- vänta på admin. Admin ser allt, kan dra tillbaka tilldelningen och kan lägga till fler lärosäten.
-- En efterfrågan från sökning utan träff har ingen koppling och hanteras som förut (admin väljer).
--
-- 1. training_requests får related_training_id och preferred_provider_id, och source får värdet
--    'course_customization'.
-- 2. tr_assign_providers_internal(): tilldelningslogiken bryts ut ur admin_assign_providers så att
--    både admin och inskicket kan använda den. Den är intern: ingen roll får anropa den direkt.
-- 3. admin_assign_providers(): samma beteende som förut (auktorisering kvar), men anropar helpern.
-- 4. submit_training_request(): ny parameter p_related_training_id (sist, DEFAULT NULL). Lärosätet
--    härleds i databasen från kursen, aldrig från klienten. Den gamla signaturen med 14 parametrar
--    tas bort (DROP FUNCTION) så att anrop inte blir tvetydiga; äldre klienter som inte skickar den
--    nya parametern fungerar fortfarande mot den nya funktionen.
--
-- Kursen eller lärosätet inaktivt, eller kursen okänd: ingen automatisk tilldelning, efterfrågan
-- går till admin som vid en vanlig sökning.
--
-- OBS vid utrullning till Production: kör migrationen FÖRE klientkoden som skickar
-- p_related_training_id, annars finns inte parametern (anropet misslyckas).

-- ── 1. Kolumner och source ──────────────────────────────────────────────
ALTER TABLE public.training_requests
  ADD COLUMN related_training_id UUID REFERENCES public.trainings(id) ON DELETE SET NULL,
  ADD COLUMN preferred_provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL;

CREATE INDEX idx_training_requests_preferred_provider
  ON public.training_requests(preferred_provider_id)
  WHERE preferred_provider_id IS NOT NULL;

ALTER TABLE public.training_requests DROP CONSTRAINT training_requests_source_check;
ALTER TABLE public.training_requests ADD CONSTRAINT training_requests_source_check
  CHECK (source IN ('search_no_results', 'search_weak_results', 'direct', 'course_customization'));

-- ── 2. Intern tilldelning (ingen auktorisering: anropas bara av andra definer-funktioner) ──
CREATE OR REPLACE FUNCTION public.tr_assign_providers_internal(
  p_request_id UUID,
  p_provider_ids UUID[],
  p_deadline TIMESTAMPTZ,
  p_assigned_by UUID,
  p_actor_role TEXT
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
      VALUES (p_request_id, pid, p_assigned_by, deadline)
      RETURNING id INTO a_id;
    ELSIF existing_status = 'withdrawn' THEN
      UPDATE training_request_assignments
         SET status = 'assigned', response_deadline = deadline, assigned_by = p_assigned_by,
             viewed_at = NULL, responded_at = NULL, decline_reason = NULL
       WHERE id = a_id;
    ELSE
      CONTINUE; -- redan tilldelat
    END IF;

    assigned_count := assigned_count + 1;
    PERFORM tr_log_event(p_request_id, a_id, p_actor_role, 'assigned', false,
                         jsonb_build_object('provider_id', pid, 'response_deadline', deadline));
  END LOOP;

  IF assigned_count > 0 THEN
    -- Köparen ser en sammanfattning, inte vilka lärosäten som har tackat nej.
    PERFORM tr_log_event(p_request_id, NULL, p_actor_role, 'assigned', true,
                         jsonb_build_object('count', assigned_count));
    IF r.status IN ('submitted', 'in_review') THEN
      UPDATE training_requests SET status = 'assigned' WHERE id = p_request_id;
    END IF;
  END IF;

  RETURN assigned_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tr_assign_providers_internal(UUID, UUID[], TIMESTAMPTZ, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ── 3. Admins tilldelning: samma beteende, delegerar till helpern ───────────
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
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(is_admin(), false) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN public.tr_assign_providers_internal(p_request_id, p_provider_ids, p_deadline, auth.uid(), 'admin');
END;
$$;

-- ── 4. Inskick: ny parameter, koppling till kurs och direkt tilldelning ──────
DROP FUNCTION public.submit_training_request(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, UUID
);

CREATE FUNCTION public.submit_training_request(
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
  p_marketplace_id UUID DEFAULT NULL,
  p_related_training_id UUID DEFAULT NULL
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
  rel_training UUID;
  pref_provider UUID;
  auto_assign BOOLEAN := false;
  src TEXT;
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

  -- Kopplingen till kurs och lärosäte härleds här, aldrig från klienten. Okänd kurs ignoreras.
  IF p_related_training_id IS NOT NULL THEN
    SELECT t.id, t.provider_id, (t.is_active AND coalesce(pr.is_active, false))
      INTO rel_training, pref_provider, auto_assign
      FROM trainings t
      LEFT JOIN providers pr ON pr.id = t.provider_id
     WHERE t.id = p_related_training_id;
    IF NOT FOUND THEN
      rel_training := NULL;
      pref_provider := NULL;
      auto_assign := false;
    END IF;
  END IF;

  src := CASE WHEN rel_training IS NOT NULL THEN 'course_customization' ELSE coalesce(p_source, 'direct') END;

  INSERT INTO training_requests (
    client_request_id, buyer_user_id, buyer_org_id, title, search_query, source,
    description, learning_goals, target_group, participant_count, delivery_format,
    location, desired_start, budget_range, ssyk_skills, marketplace_id,
    related_training_id, preferred_provider_id
  ) VALUES (
    p_client_request_id, caller, org, trim(p_title), nullif(trim(coalesce(p_search_query, '')), ''),
    src, trim(p_description), nullif(trim(coalesce(p_learning_goals, '')), ''),
    trim(p_target_group), p_participant_count, p_delivery_format,
    nullif(trim(coalesce(p_location, '')), ''), nullif(trim(coalesce(p_desired_start, '')), ''),
    nullif(trim(coalesce(p_budget_range, '')), ''), coalesce(p_ssyk_skills, '[]'::jsonb), mkt,
    rel_training, pref_provider
  )
  RETURNING id INTO new_id;

  PERFORM tr_log_event(new_id, NULL, 'buyer', 'submitted', true, jsonb_build_object('source', src));

  -- Från en kurs: skicka direkt till kursens lärosäte (admin kan dra tillbaka eller lägga till fler).
  IF coalesce(auto_assign, false) AND pref_provider IS NOT NULL THEN
    PERFORM tr_assign_providers_internal(new_id, ARRAY[pref_provider], NULL, NULL, 'system');
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_training_request(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, UUID, UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_training_request(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, UUID, UUID
) TO authenticated;
