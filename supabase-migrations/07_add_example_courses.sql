-- =====================================================
-- Migration 07: Add Example Courses (Idempotent)
-- =====================================================
-- Safe to run multiple times. Handles duplicates and
-- missing UNIQUE constraints automatically.

DO $$
BEGIN

  -- -------------------------------------------------------
  -- STEP 1: Remove duplicate providers (keep lowest id)
  -- -------------------------------------------------------
  DELETE FROM providers
  WHERE id NOT IN (
    SELECT MIN(id) FROM providers GROUP BY name
  );

  -- -------------------------------------------------------
  -- STEP 2: Ensure UNIQUE constraint on providers.name
  -- -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'providers_name_key'
      AND conrelid = 'providers'::regclass
  ) THEN
    ALTER TABLE providers ADD CONSTRAINT providers_name_key UNIQUE (name);
  END IF;

  -- -------------------------------------------------------
  -- STEP 3: Ensure UNIQUE constraint on trainings.course_code
  -- -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trainings_course_code_key'
      AND conrelid = 'trainings'::regclass
  ) THEN
    ALTER TABLE trainings ADD CONSTRAINT trainings_course_code_key UNIQUE (course_code);
  END IF;

END $$;

-- -------------------------------------------------------
-- STEP 4: Insert providers (safe, idempotent)
-- -------------------------------------------------------
INSERT INTO providers (name, type, description, is_active) VALUES
  ('Handelshögskolan i Stockholm', 'högskola', 'Sveriges ledande handelshögskola med fokus på affärsutveckling och ledarskap.', true),
  ('Karolinska Institutet', 'universitet', 'Ett av världens främsta medicinska universitet med fokus på hälsa och vård.', true),
  ('Lunds Universitet', 'universitet', 'Nordens största forskningsuniversitet med bred kompetens inom alla akademiska områden.', true)
ON CONFLICT (name) DO NOTHING;

-- -------------------------------------------------------
-- STEP 5: Insert courses (safe, idempotent)
-- -------------------------------------------------------

-- KTH - Miljöpsykologi och beteendedesign
INSERT INTO trainings (
  title, description, course_code, provider_id, category_id,
  format, duration, credits, target_audience, image_url,
  training_type, is_popular, featured, views, leads,
  learning_outcomes, instructor_name, instructor_title, instructor_bio,
  contact_person_name, contact_person_title, contact_person_email, contact_person_phone,
  is_active
)
SELECT
  'Miljöpsykologi och beteendedesign',
  'Vårt klimat förändras. I den här kursen tränar du dig i att förstå, analysera och förändra beteenden som påverkar vår miljö. Du får använda beteendedesign för att skapa verklig förändring - och kan ta fram ett konkret beteendeprojekt för din verksamhet redan under kursen.',
  'FL10002',
  (SELECT id FROM providers WHERE name = 'KTH Kungliga Tekniska Högskolan' LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'hallbarhet' LIMIT 1),
  'online', '4 veckor', 4,
  'Chefer, projektledare och strategiska medarbetare som vill använda beteendevetenskap för att skapa hållbar omställning.',
  'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800',
  'both', true, true, 312, 19,
  ARRAY['Förstå grunderna i beteendepsykologi', 'Analysera och kartlägga beteendemönster', 'Designa interventioner för beteendeförändring', 'Mäta och utvärdera effekter'],
  'Dr. Emma Bergström', 'Lektor i Miljöpsykologi',
  'Dr. Emma Bergström är forskare och kursledare med över 15 års erfarenhet av beteendeförändring inom hållbarhet.',
  'Maria Andersson', 'Programansvarig', 'maria.andersson@kth.se', '+46 8 790 60 00',
  true
WHERE NOT EXISTS (SELECT 1 FROM trainings WHERE course_code = 'FL10002');

-- SSE - Ledarskapsprogram för Chefer
INSERT INTO trainings (
  title, description, course_code, provider_id, category_id,
  format, duration, credits, target_audience, image_url,
  training_type, is_popular, featured, views, leads,
  learning_outcomes, instructor_name, instructor_title, instructor_bio,
  contact_person_name, contact_person_title, contact_person_email, contact_person_phone,
  is_active
)
SELECT
  'Ledarskapsprogram för Chefer',
  'Omfattande ledarutveckling för högre chefer. Lär dig strategiskt tänkande, organisatoriskt ledarskap och förändringshantering. Inkluderar fallstudier, erfarenhetsutbyte och praktiska övningar.',
  'SSE7110',
  (SELECT id FROM providers WHERE name = 'Handelshögskolan i Stockholm' LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'ledarskap' LIMIT 1),
  'hybrid', '12 veckor', 30,
  'Ledande befattningshavare och C-level chefer med minst 5 års erfarenhet.',
  'https://images.unsplash.com/photo-1776039325240-02916820bfeb?w=800',
  'both', true, true, 456, 23,
  ARRAY['Utveckla ett strategiskt ledarskap som skapar långsiktig affärsnytta', 'Leda och driva organisatorisk förändring med hög genomförandeförmåga', 'Bygga högpresterande team och skapa en stark ledningskultur', 'Hantera komplexa affärssituationer och fatta strategiska beslut'],
  'Prof. Anders Söderholm', 'Professor i Strategiskt Ledarskap',
  'Professor Anders Söderholm har över 25 års erfarenhet av forskning och undervisning i strategiskt ledarskap och organisationsutveckling.',
  'Karin Pettersson', 'Programchef', 'karin.pettersson@hhs.se', '+46 8 736 90 00',
  true
WHERE NOT EXISTS (SELECT 1 FROM trainings WHERE course_code = 'SSE7110');

-- Karolinska - AI i Hälso- och sjukvård
INSERT INTO trainings (
  title, description, course_code, provider_id, category_id,
  format, duration, credits, target_audience, image_url,
  training_type, is_popular, featured, views, leads,
  learning_outcomes, instructor_name, instructor_title, instructor_bio,
  contact_person_name, contact_person_title, contact_person_email, contact_person_phone,
  is_active
)
SELECT
  'AI i Hälso- och sjukvård',
  'Lär dig hur artificiell intelligens kan användas för att förbättra vårdens kvalitet och effektivitet. Kursen täcker praktiska tillämpningar, etiska överväganden och framtida möjligheter inom AI och maskininlärning i hälso- och sjukvård.',
  'KI5041',
  (SELECT id FROM providers WHERE name = 'Karolinska Institutet' LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'halsa-vard' LIMIT 1),
  'online', '6 veckor', 7.5,
  'Vårdchefer, medicinska experter, IT-ansvariga och beslutsfattare inom hälso- och sjukvård.',
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
  'both', true, false, 289, 15,
  ARRAY['Förstå AI-teknologins möjligheter och begränsningar i vårdsammanhang', 'Identifiera konkreta användningsområden för AI i din verksamhet', 'Hantera etiska och juridiska aspekter av AI i vården', 'Implementera och utvärdera AI-baserade lösningar'],
  'Dr. Lisa Strömberg', 'Docent i Medicinsk AI',
  'Dr. Lisa Strömberg är specialiserad på AI-tillämpningar inom medicin och leder flera forskningsprojekt på Karolinska Institutet.',
  'Johan Lindqvist', 'Kursansvarig', 'johan.lindqvist@ki.se', '+46 8 524 800 00',
  true
WHERE NOT EXISTS (SELECT 1 FROM trainings WHERE course_code = 'KI5041');

-- Lund - Digital Transformation för Offentlig Sektor
INSERT INTO trainings (
  title, description, course_code, provider_id, category_id,
  format, duration, credits, target_audience, image_url,
  training_type, is_popular, featured, views, leads,
  learning_outcomes, instructor_name, instructor_title, instructor_bio,
  contact_person_name, contact_person_title, contact_person_email, contact_person_phone,
  is_active
)
SELECT
  'Digital Transformation för Offentlig Sektor',
  'En praktisk kurs som hjälper dig att leda digital transformation i offentlig verksamhet. Fokus på medborgarperspektiv, e-tjänster, datadrivna beslut och innovativa arbetsmetoder.',
  'LU8023',
  (SELECT id FROM providers WHERE name = 'Lunds Universitet' LIMIT 1),
  (SELECT id FROM categories WHERE slug = 'digital-transformation' LIMIT 1),
  'hybrid', '8 veckor', 15,
  'Chefer och strateger inom stat, kommun och landsting som driver eller ska driva digitalisering.',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
  'scheduled', false, false, 187, 8,
  ARRAY['Leda och genomföra digital transformation i offentlig sektor', 'Utveckla användarcentrerade digitala tjänster', 'Implementera datadrivna arbetssätt och analys', 'Hantera förändring och skapa engagemang för digitalisering'],
  'Maria Ek', 'Lektor i Digital Förvaltning',
  'Maria Ek forskar om digitaliseringens påverkan på offentlig sektor och har lång erfarenhet av samverkan med myndigheter och kommuner.',
  'Stefan Norberg', 'Programkoordinator', 'stefan.norberg@lu.se', '+46 46 222 00 00',
  true
WHERE NOT EXISTS (SELECT 1 FROM trainings WHERE course_code = 'LU8023');

-- -------------------------------------------------------
-- STEP 6: Scheduled starts (safe, idempotent)
-- -------------------------------------------------------
INSERT INTO scheduled_starts (
  training_id, start_date, application_deadline, price,
  max_participants, available_spots, status, language
)
SELECT t.id, '2026-09-15', '2026-08-31', 12500, 30, 8, 'few_spots', 'Svenska'
FROM trainings t
WHERE t.course_code = 'FL10002'
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_starts s
    WHERE s.training_id = t.id AND s.start_date = '2026-09-15'
  );

INSERT INTO scheduled_starts (
  training_id, start_date, application_deadline, price,
  max_participants, available_spots, status, language
)
SELECT t.id, '2026-10-01', '2026-09-15', 45000, 20, 5, 'few_spots', 'Svenska'
FROM trainings t
WHERE t.course_code = 'SSE7110'
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_starts s
    WHERE s.training_id = t.id AND s.start_date = '2026-10-01'
  );

-- -------------------------------------------------------
-- STEP 7: Curriculum modules (safe, idempotent)
-- -------------------------------------------------------
INSERT INTO curriculum_modules (training_id, title, topics, order_index)
SELECT t.id, 'Grunderna i beteendepsykologi',
  ARRAY['Teorier om beteendeförändring', 'Motivationsfaktorer', 'Kognitiva bias'], 1
FROM trainings t
WHERE t.course_code = 'FL10002'
  AND NOT EXISTS (
    SELECT 1 FROM curriculum_modules m WHERE m.training_id = t.id AND m.order_index = 1
  );

INSERT INTO curriculum_modules (training_id, title, topics, order_index)
SELECT t.id, 'Kartläggning och analys',
  ARRAY['Beteendeanalys', 'Identifiera målbeteenden', 'Barriärer och möjliggörare'], 2
FROM trainings t
WHERE t.course_code = 'FL10002'
  AND NOT EXISTS (
    SELECT 1 FROM curriculum_modules m WHERE m.training_id = t.id AND m.order_index = 2
  );

-- -------------------------------------------------------
-- STEP 8: FAQ (safe, idempotent)
-- -------------------------------------------------------
INSERT INTO training_faq (training_id, question, answer, order_index)
SELECT t.id,
  'Krävs förkunskaper i psykologi?',
  'Nej, kursen är designad för att vara tillgänglig även utan formell utbildning i psykologi. Vi går igenom alla koncept från grunden.',
  1
FROM trainings t
WHERE t.course_code = 'FL10002'
  AND NOT EXISTS (
    SELECT 1 FROM training_faq f WHERE f.training_id = t.id AND f.order_index = 1
  );

INSERT INTO training_faq (training_id, question, answer, order_index)
SELECT t.id,
  'Hur mycket tid behöver jag avsätta per vecka?',
  'Vi rekommenderar ca 8-10 timmar per vecka för föreläsningar, övningar och projektarbete.',
  2
FROM trainings t
WHERE t.course_code = 'FL10002'
  AND NOT EXISTS (
    SELECT 1 FROM training_faq f WHERE f.training_id = t.id AND f.order_index = 2
  );

-- -------------------------------------------------------
-- Verification: Show what was inserted
-- -------------------------------------------------------
SELECT
  p.name AS provider,
  t.course_code,
  t.title,
  t.format
FROM trainings t
JOIN providers p ON p.id = t.provider_id
WHERE t.course_code IN ('FL10002', 'SSE7110', 'KI5041', 'LU8023')
ORDER BY t.course_code;
