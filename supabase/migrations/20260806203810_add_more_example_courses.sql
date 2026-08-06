-- Fler exempelkurser i staging: en kurs per kategori som saknade en, plus fler
-- kursstarter på ALLA exempelkurser (så "Om utbildningen"/"Utbildningsstarter"-
-- flikarna alltid visas, i linje med hur production ser ut).

-- 1) Fler kursstarter på de tre befintliga exempelkurserna
insert into scheduled_starts (training_id, start_date, application_deadline, price, max_participants, available_spots, status, location, language, admission_requirements) values
  ('4ce52818-9f68-490a-82b2-9752f9bb88f9', '2027-02-15', '2027-01-15', 45000, 20, 12, 'open', 'Stockholm', 'sv', 'Minst 5 års chefserfarenhet.'),
  ('64fb5211-4365-4a63-9c54-8dc9e97d4427', '2026-11-10', '2026-10-20', 28000, 25, 4, 'few_spots', null, 'sv', 'Grundläggande IT-vana.'),
  ('64fb5211-4365-4a63-9c54-8dc9e97d4427', '2027-03-02', '2027-02-01', 28000, 25, 25, 'open', null, 'sv', 'Grundläggande IT-vana.'),
  ('d5a3eee2-a6f6-4a0f-b22f-3088bb69265c', '2026-10-20', '2026-09-20', 38000, 18, 0, 'full', 'Lund', 'sv', 'Chefsbefattning inom offentlig sektor.'),
  ('d5a3eee2-a6f6-4a0f-b22f-3088bb69265c', '2027-01-12', '2026-12-10', 38000, 18, 10, 'open', 'Lund', 'sv', 'Chefsbefattning inom offentlig sektor.');

-- 2) Fem nya kurser, en per kategori som tidigare saknade exempel

insert into trainings (
  id, title, description, course_code, provider_id, category_id, format, duration, credits,
  target_audience, featured, views, leads, image_url, training_type, is_popular,
  learning_outcomes, instructor_name, instructor_title, instructor_bio, is_active
) values
  (
    'e47d0a7c-e27a-4a97-ab04-f99033cd87a4',
    'Praktisk AI för Verksamhetsutveckling',
    'En handfast kurs i hur AI och maskininlärning kan användas för att effektivisera och utveckla verksamheter. Fokus på praktiska use-cases, verktyg och implementation snarare än ren teori.',
    'KTH2201',
    'b33bf9cf-e36c-4770-bc0e-1f66dec71b5d',
    '0f8794df-a92d-4f5f-b6b9-968a1df8be29',
    'online', '6 veckor', 10,
    'IT-ansvariga, verksamhetsutvecklare och projektledare som vill förstå och tillämpa AI i sin organisation.',
    false, 210, 18,
    'https://images.unsplash.com/photo-1776039325240-02916820bfeb?w=800',
    'both', true,
    array['Identifiera lämpliga AI-användningsfall i er verksamhet', 'Förstå grunderna i maskininlärning och stora språkmodeller', 'Utvärdera och välja rätt AI-verktyg för olika behov', 'Planera och driva en AI-implementation'],
    'Dr. Johan Eklund', 'Forskare i Tillämpad AI', 'Johan Eklund forskar på tillämpad maskininlärning på KTH och har lett flera AI-implementationsprojekt inom näringslivet.',
    true
  ),
  (
    '57b39fc0-e808-42f2-922a-eaed42188edb',
    'Hållbarhetsstrategi och ESG-rapportering',
    'Kursen ger dig verktygen för att utveckla en hållbarhetsstrategi och navigera de nya EU-kraven på ESG-rapportering (CSRD). Praktiskt fokus på mätning, rapportering och verksamhetsintegration.',
    'UU3312',
    '560bba15-7a8f-4b8b-9db2-5ae11e2a115c',
    '8177b0d6-f045-40a2-ae3c-b1461c2ab344',
    'hybrid', '8 veckor', 12,
    'Hållbarhetsansvariga, CFO:er och styrelseledamöter som ansvarar för hållbarhetsarbete och rapportering.',
    false, 134, 9,
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
    'scheduled', false,
    array['Förstå CSRD och EU:s taxonomi för hållbarhet', 'Utveckla en hållbarhetsstrategi kopplad till affärsmål', 'Bygga en robust process för ESG-datainsamling', 'Kommunicera hållbarhetsarbete till investerare och kunder'],
    'Dr. Sara Lindqvist', 'Universitetslektor i Hållbar Utveckling', 'Sara Lindqvist forskar om företags hållbarhetsomställning och har rådgivit flera börsbolag om ESG-rapportering.',
    true
  ),
  (
    'd089fcc7-efc3-4120-9d60-2c2e9ab8568f',
    'Modern HR-strategi och Talangutveckling',
    'En strategisk kurs för HR-ledare som vill utveckla morgondagens medarbetarupplevelse. Fokus på talangutveckling, datadriven HR och att bygga en kultur som attraherar och behåller kompetens.',
    'SSE3350',
    '9e5e6345-6b04-4dd4-ad21-72d9e79109c0',
    '81f0360b-4dfc-4287-8fb0-40d6369c1782',
    'onsite', '4 veckor', 8,
    'HR-chefer, HR Business Partners och andra som leder strategiskt HR-arbete.',
    false, 175, 14,
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    'both', true,
    array['Designa en modern talangstrategi', 'Använda data för bättre HR-beslut', 'Stärka medarbetarupplevelsen genom hela anställningscykeln', 'Leda förändring i HR-funktionen'],
    'Cecilia Nordin', 'Adjungerad Professor i HR-strategi', 'Cecilia Nordin har mer än 20 års erfarenhet som HR-direktör inom svenskt näringsliv och undervisar nu i strategiskt HR-arbete.',
    true
  ),
  (
    '77dabd14-d5f2-4772-ba0a-13d9657104c4',
    'Smart Industri och Automation',
    'Kursen ger en grundlig introduktion till Industri 4.0 – smart automation, IoT och datadriven produktion. Du får praktiska verktyg för att digitalisera och effektivisera tillverkningsprocesser.',
    'KTH5510',
    'b33bf9cf-e36c-4770-bc0e-1f66dec71b5d',
    'a965d844-f464-422b-aff2-9c860c16ace8',
    'hybrid', '10 veckor', 20,
    'Produktionschefer, ingenjörer och tekniska specialister inom tillverkande industri.',
    false, 98, 6,
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
    'scheduled', false,
    array['Förstå kärnkoncepten inom Industri 4.0', 'Identifiera automationsmöjligheter i produktionsflöden', 'Använda IoT och sensordata för processoptimering', 'Planera en digitaliseringsresa för sin verksamhet'],
    'Prof. Mikael Ahlgren', 'Professor i Produktionsteknik', 'Mikael Ahlgren leder KTH:s forskning inom smart produktion och har lång erfarenhet av samarbeten med svensk tillverkningsindustri.',
    true
  ),
  (
    'b9578ea9-811d-487a-9ca2-202b97a76c09',
    'Ledarskap och Styrning i Offentlig Verksamhet',
    'En ledarskapskurs särskilt anpassad för offentlig sektor, med fokus på politiskt styrda organisationer, medborgardialog och att leda med begränsade resurser.',
    'LIU4420',
    '44f0ae31-1a17-47d4-9d93-9ac03f1c354b',
    'd69f1396-c670-4cd4-85cb-e9f060bf6db4',
    'hybrid', '6 veckor', 15,
    'Chefer och ledare inom kommun, region och statlig förvaltning.',
    false, 121, 11,
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    'both', false,
    array['Leda i en politiskt styrd organisation', 'Skapa effektiv medborgardialog', 'Prioritera och styra med begränsade resurser', 'Driva verksamhetsutveckling i offentlig sektor'],
    'Karin Bergström', 'Docent i Offentlig Förvaltning', 'Karin Bergström forskar om ledarskap i offentlig sektor och har själv arbetat som kommundirektör i över tio år.',
    true
  );

-- 3) Kursstarter för de fem nya kurserna (två per kurs, varierad status)

insert into scheduled_starts (training_id, start_date, application_deadline, price, max_participants, available_spots, status, location, language, admission_requirements) values
  ('e47d0a7c-e27a-4a97-ab04-f99033cd87a4', '2026-10-05', '2026-09-15', 22000, 30, 22, 'open', null, 'sv', 'Ingen förkunskap krävs.'),
  ('e47d0a7c-e27a-4a97-ab04-f99033cd87a4', '2027-01-18', '2026-12-18', 22000, 30, 30, 'upcoming', null, 'sv', 'Ingen förkunskap krävs.'),

  ('57b39fc0-e808-42f2-922a-eaed42188edb', '2026-11-16', '2026-10-16', 32000, 20, 3, 'few_spots', 'Uppsala', 'sv', 'Erfarenhet av ekonomi- eller hållbarhetsarbete.'),
  ('57b39fc0-e808-42f2-922a-eaed42188edb', '2027-02-08', '2027-01-08', 32000, 20, 20, 'open', 'Uppsala', 'sv', 'Erfarenhet av ekonomi- eller hållbarhetsarbete.'),

  ('d089fcc7-efc3-4120-9d60-2c2e9ab8568f', '2026-10-12', '2026-09-12', 24000, 24, 16, 'open', 'Stockholm', 'sv', 'Minst 2 års erfarenhet inom HR.'),
  ('d089fcc7-efc3-4120-9d60-2c2e9ab8568f', '2027-03-15', '2027-02-15', 24000, 24, 24, 'upcoming', 'Stockholm', 'sv', 'Minst 2 års erfarenhet inom HR.'),

  ('77dabd14-d5f2-4772-ba0a-13d9657104c4', '2026-11-02', '2026-10-02', 42000, 16, 5, 'few_spots', 'Stockholm', 'sv', 'Teknisk grundutbildning eller motsvarande erfarenhet.'),
  ('77dabd14-d5f2-4772-ba0a-13d9657104c4', '2027-02-22', '2027-01-22', 42000, 16, 16, 'open', 'Stockholm', 'sv', 'Teknisk grundutbildning eller motsvarande erfarenhet.'),

  ('b9578ea9-811d-487a-9ca2-202b97a76c09', '2026-10-26', '2026-09-26', 35000, 22, 22, 'open', 'Linköping', 'sv', 'Chefsbefattning inom offentlig sektor.'),
  ('b9578ea9-811d-487a-9ca2-202b97a76c09', '2027-01-25', '2026-12-22', 35000, 22, 0, 'full', 'Linköping', 'sv', 'Chefsbefattning inom offentlig sektor.');
