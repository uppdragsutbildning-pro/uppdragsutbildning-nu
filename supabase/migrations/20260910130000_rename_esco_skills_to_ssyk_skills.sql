-- Plattformsbyte: ESCO (EU:s kompetenstaxonomi) ersätts av SSYK 2012 (Arbetsförmedlingens JobTech Taxonomy).
-- Båda tabellerna har 0 rader i staging idag, så en ren kolumnrename är säker.

ALTER TABLE cpi_results RENAME COLUMN esco_skills TO ssyk_skills;
ALTER TABLE trainings RENAME COLUMN esco_skills TO ssyk_skills;
