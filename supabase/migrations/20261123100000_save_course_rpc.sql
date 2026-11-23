-- Atomisk sparning av en hel kurs: kursraden (trainings), kursstarter (scheduled_starts),
-- moduler (curriculum_modules) och FAQ (training_faq) i EN transaktion.
--
-- Bakgrund: kursformuläret gjorde ett separat anrop per tabell och kontrollerade inte alla
-- fel. Föll något mitt i (nätverk, RLS, ogiltigt värde, publiceringsspärren) kunde kursen
-- ligga halvsparad, och moduler/FAQ kunde försvinna tyst. Nu rullas allt tillbaka vid fel.
--
-- SECURITY INVOKER (standard) med flit: den som anropar behöver redan skrivrätt via
-- befintliga RLS-policyer (leverantör för sin egen kurs, admin för alla). Funktionen ger
-- alltså ingen ny behörighet och har ingen egen behörighetslogik som kan bli fel.
-- Befintliga triggers (t.ex. spärren mot publicering utan avbokningsvillkor) körs som förut.
--
-- p_training_id = NULL  -> skapa kurs (provider_id och slug måste ligga i p_training)
-- p_training_id = <id>  -> uppdatera kurs (provider_id och slug ignoreras, kursen flyttas aldrig)
-- p_starts: lista av {id?, start_date, application_deadline, price, max_participants,
--           available_spots, status}. Med id = uppdatera, utan id = skapa. Starter som finns
--           i databasen men inte i listan raderas, men bara om de saknar anmälningar och
--           bokningar (annars avbryts hela sparningen).
-- Returnerar kursens id.

DROP FUNCTION IF EXISTS public.replace_course_content(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.save_course(
  p_training_id uuid,
  p_training jsonb,
  p_starts jsonb DEFAULT '[]'::jsonb,
  p_modules jsonb DEFAULT '[]'::jsonb,
  p_faq jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid := p_training_id;
  v_outcomes text[];
  v_keep_ids uuid[];
  v_removed_ids uuid[];
BEGIN
  IF p_training IS NULL OR jsonb_typeof(p_training) <> 'object' THEN
    RAISE EXCEPTION 'p_training måste vara ett JSON-objekt' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_starts) <> 'array' OR jsonb_typeof(p_modules) <> 'array' OR jsonb_typeof(p_faq) <> 'array' THEN
    RAISE EXCEPTION 'p_starts, p_modules och p_faq måste vara JSON-listor' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(t), '{}')
    INTO v_outcomes
    FROM jsonb_array_elements_text(COALESCE(p_training -> 'learning_outcomes', '[]'::jsonb)) AS t;

  -- 1. Kursraden
  IF v_id IS NULL THEN
    INSERT INTO trainings (
      title, description, course_code, provider_id, category_id, format, duration, credits,
      target_audience, image_url, training_type, is_popular, featured, learning_outcomes,
      ssyk_skills, instructor_name, instructor_title, instructor_bio, contact_person_name,
      contact_person_title, contact_person_email, contact_person_phone,
      contact_person_response_time, is_active, slug
    ) VALUES (
      p_training ->> 'title',
      p_training ->> 'description',
      p_training ->> 'course_code',
      (p_training ->> 'provider_id')::uuid,
      (p_training ->> 'category_id')::uuid,
      p_training ->> 'format',
      p_training ->> 'duration',
      (p_training ->> 'credits')::numeric,
      p_training ->> 'target_audience',
      p_training ->> 'image_url',
      p_training ->> 'training_type',
      COALESCE((p_training ->> 'is_popular')::boolean, false),
      COALESCE((p_training ->> 'featured')::boolean, false),
      v_outcomes,
      p_training -> 'ssyk_skills',
      p_training ->> 'instructor_name',
      p_training ->> 'instructor_title',
      p_training ->> 'instructor_bio',
      p_training ->> 'contact_person_name',
      p_training ->> 'contact_person_title',
      p_training ->> 'contact_person_email',
      p_training ->> 'contact_person_phone',
      p_training ->> 'contact_person_response_time',
      COALESCE((p_training ->> 'is_active')::boolean, false),
      p_training ->> 'slug'
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE trainings SET
      title = p_training ->> 'title',
      description = p_training ->> 'description',
      course_code = p_training ->> 'course_code',
      category_id = (p_training ->> 'category_id')::uuid,
      format = p_training ->> 'format',
      duration = p_training ->> 'duration',
      credits = (p_training ->> 'credits')::numeric,
      target_audience = p_training ->> 'target_audience',
      image_url = p_training ->> 'image_url',
      training_type = p_training ->> 'training_type',
      is_popular = COALESCE((p_training ->> 'is_popular')::boolean, false),
      featured = COALESCE((p_training ->> 'featured')::boolean, false),
      learning_outcomes = v_outcomes,
      ssyk_skills = p_training -> 'ssyk_skills',
      instructor_name = p_training ->> 'instructor_name',
      instructor_title = p_training ->> 'instructor_title',
      instructor_bio = p_training ->> 'instructor_bio',
      contact_person_name = p_training ->> 'contact_person_name',
      contact_person_title = p_training ->> 'contact_person_title',
      contact_person_email = p_training ->> 'contact_person_email',
      contact_person_phone = p_training ->> 'contact_person_phone',
      contact_person_response_time = p_training ->> 'contact_person_response_time',
      is_active = COALESCE((p_training ->> 'is_active')::boolean, false)
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kursen hittades inte eller du saknar behörighet att ändra den' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Kursstarter: synka per id så att anmälningar och bokningar (hänger på startens id) bevaras
  SELECT COALESCE(array_agg((s ->> 'id')::uuid), '{}')
    INTO v_keep_ids
    FROM jsonb_array_elements(p_starts) AS s
    WHERE s ->> 'id' IS NOT NULL;

  SELECT COALESCE(array_agg(id), '{}')
    INTO v_removed_ids
    FROM scheduled_starts
    WHERE training_id = v_id AND NOT (id = ANY (v_keep_ids));

  IF cardinality(v_removed_ids) > 0 THEN
    IF EXISTS (SELECT 1 FROM applications WHERE scheduled_start_id = ANY (v_removed_ids))
       OR EXISTS (SELECT 1 FROM bookings WHERE scheduled_start_id = ANY (v_removed_ids)) THEN
      RAISE EXCEPTION 'En kursstart du tagit bort har anmälningar eller bokningar och kan inte raderas. Sätt dess status till "Fullt" i stället. Ingenting har sparats.'
        USING ERRCODE = '23503';
    END IF;
    DELETE FROM scheduled_starts WHERE id = ANY (v_removed_ids);
  END IF;

  UPDATE scheduled_starts ss SET
    start_date = (s.elem ->> 'start_date')::date,
    application_deadline = (s.elem ->> 'application_deadline')::date,
    price = (s.elem ->> 'price')::numeric,
    max_participants = (s.elem ->> 'max_participants')::int,
    available_spots = (s.elem ->> 'available_spots')::int,
    status = s.elem ->> 'status'
  FROM jsonb_array_elements(p_starts) AS s(elem)
  WHERE s.elem ->> 'id' IS NOT NULL
    AND ss.id = (s.elem ->> 'id')::uuid
    AND ss.training_id = v_id;

  INSERT INTO scheduled_starts (
    training_id, start_date, application_deadline, price, max_participants,
    available_spots, status, language
  )
  SELECT
    v_id,
    (s ->> 'start_date')::date,
    (s ->> 'application_deadline')::date,
    (s ->> 'price')::numeric,
    (s ->> 'max_participants')::int,
    (s ->> 'available_spots')::int,
    s ->> 'status',
    'Svenska'
  FROM jsonb_array_elements(p_starts) AS s
  WHERE s ->> 'id' IS NULL;

  -- 3. Moduler
  DELETE FROM curriculum_modules WHERE training_id = v_id;
  INSERT INTO curriculum_modules (training_id, title, topics, order_index)
  SELECT
    v_id,
    m.elem ->> 'title',
    COALESCE(
      (SELECT array_agg(t) FROM jsonb_array_elements_text(COALESCE(m.elem -> 'topics', '[]'::jsonb)) AS t),
      '{}'
    ),
    m.ord::int
  FROM jsonb_array_elements(p_modules) WITH ORDINALITY AS m(elem, ord);

  -- 4. FAQ
  DELETE FROM training_faq WHERE training_id = v_id;
  INSERT INTO training_faq (training_id, question, answer, order_index)
  SELECT
    v_id,
    f.elem ->> 'question',
    f.elem ->> 'answer',
    f.ord::int
  FROM jsonb_array_elements(p_faq) WITH ORDINALITY AS f(elem, ord);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_course(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_course(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;
