-- Kompetensindex: fånga namn och e-postadress från den som genomför analysen.
-- Obligatoriska fält i UI:t (Info-steget), därför NOT NULL i databasen.

ALTER TABLE cpi_results
  ADD COLUMN contact_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';

ALTER TABLE cpi_results
  ALTER COLUMN contact_name DROP DEFAULT,
  ALTER COLUMN contact_email DROP DEFAULT;
