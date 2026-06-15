-- =====================================================
-- Seed Data - Initial providers and trainings
-- =====================================================

-- Insert Providers
-- Note: After migration 06, use 'universitet', 'högskola', or 'yrkeshögskola'
INSERT INTO providers (id, name, type, description, is_active) VALUES
  ('1', 'Handelshögskolan i Stockholm', 'högskola', 'Sveriges ledande handelshögskola med fokus på affärsutveckling och ledarskap.', true),
  ('2', 'Karolinska Institutet', 'universitet', 'Ett av världens främsta medicinska universitet med fokus på hälsa och vård.', true),
  ('3', 'Lunds Universitet', 'universitet', 'Nordens största forskningsuniversitet med bred kompetens inom alla akademiska områden.', true),
  ('4', 'Uppsala Universitet', 'universitet', 'Nordens äldsta universitet med stark tradition inom forskning och utbildning.', true),
  ('5', 'Linköpings Universitet', 'universitet', 'Ett innovativt universitet känt för tvärvetenskapliga samarbeten och teknikfokus.', true),
  ('7', 'KTH Kungliga Tekniska Högskolan', 'universitet', 'Nordens största tekniska universitet med världsledande forskning och utbildning.', true);

-- Get category IDs (we need them for the trainings)
-- Note: Category IDs are auto-generated UUIDs, so we'll use subqueries

-- Insert Sample Training from KTH
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
  'Vårt klimat förändras. I den här kursen tränar du dig i att förstå, analysera och förändra beteenden som påverkar vår miljö. Du får dig använda beteendedesign för att skapa verlig förändring - och kan fram ta ett konkret beteendeprojekt för din verksamhet redan under kursen.',
  'FL10002',
  '7',
  (SELECT id FROM categories WHERE slug = 'hallbarhet'),
  'online',
  '4 veckor',
  4,
  'Chefer, projektledare och strategiska medarbetare som vill använda beteendevetenskap för att skapa hållbar omställning.',
  'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800',
  'both',
  true,
  true,
  312,
  19,
  ARRAY['Förstå grunderna i beteendepsykologi', 'Analysera och kartlägga beteendemönster', 'Designa interventioner för beteendeförändring', 'Mäta och utvärdera effekter'],
  'Dr. Emma Bergström',
  'Lektor i Miljöpsykologi',
  'Dr. Emma Bergström är forskare och kursledare med över 15 års erfarenhet av beteendeförändring inom hållbarhet.',
  'Maria Andersson',
  'Programansvarig',
  'maria.andersson@kth.se',
  '+46 8 790 60 00',
  true;

-- Add curriculum for the training
INSERT INTO curriculum_modules (training_id, title, topics, order_index)
SELECT
  t.id,
  'Grunderna i beteendepsykologi',
  ARRAY['Teorier om beteendeförändring', 'Motivationsfaktorer', 'Kognitiva bias'],
  1
FROM trainings t WHERE t.course_code = 'FL10002';

INSERT INTO curriculum_modules (training_id, title, topics, order_index)
SELECT
  t.id,
  'Kartläggning och analys',
  ARRAY['Beteendeanalys', 'Identifiera målbeteenden', 'Barriärer och möjliggörare'],
  2
FROM trainings t WHERE t.course_code = 'FL10002';

-- Add FAQ
INSERT INTO training_faq (training_id, question, answer, order_index)
SELECT
  t.id,
  'Krävs förkunskaper i psykologi?',
  'Nej, kursen är designad för att vara tillgänglig även utan formell utbildning i psykologi. Vi går igenom alla koncept från grunden.',
  1
FROM trainings t WHERE t.course_code = 'FL10002';

-- Add scheduled starts
INSERT INTO scheduled_starts (
  training_id, start_date, application_deadline, price,
  max_participants, available_spots, status, language
)
SELECT
  t.id,
  '2026-09-15',
  '2026-08-31',
  12500,
  30,
  8,
  'few_spots',
  'Svenska'
FROM trainings t WHERE t.course_code = 'FL10002';

-- Note: More trainings can be added similarly
-- This is a starter seed with one complete example
