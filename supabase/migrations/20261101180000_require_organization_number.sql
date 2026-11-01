-- Organisationsnummer är obligatoriskt när en köparorganisation skapas.
--
-- create_my_organization() tog tidigare emot ett tomt organisationsnummer (fältet var valfritt i
-- formulären), och numret krävdes först vid bokning via fakturauppgifterna. Nu krävs ett svenskt
-- organisationsnummer med 10 siffror redan när organisationen skapas, och det sparas på formen
-- NNNNNN-NNNN. Personnummer (tredje och fjärde siffran under 20) avvisas. Kontrollsiffran (Luhn)
-- valideras i klienten.
--
-- Befintliga organisationer utan nummer påverkas inte (ingen NOT NULL-constraint på kolumnen);
-- de får fortfarande fylla i numret via fakturauppgifterna innan bokning.
--
-- Funktionens signatur och behörigheter är oförändrade (CREATE OR REPLACE behåller GRANT/REVOKE).
--
-- OBS vid utrullning till Production: driftsätt klientkoden FÖRE den här migrationen, annars
-- skickar den äldre klienten ett tomt nummer och skapa-konto-flödet slutar fungera.

CREATE OR REPLACE FUNCTION public.create_my_organization(
  p_name TEXT,
  p_organization_number TEXT,
  p_display_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  new_org UUID;
  org_digits TEXT := regexp_replace(coalesce(p_organization_number, ''), '[^0-9]', '', 'g');
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF length(org_digits) <> 10 THEN
    RAISE EXCEPTION 'Organisationsnummer krävs (10 siffror)' USING ERRCODE = '22023';
  END IF;

  -- Tredje och fjärde siffran är minst 20 för juridiska personer. Lägre värden är en månad,
  -- alltså ett personnummer (enskild firma), som är en personuppgift och inte ska sparas här.
  IF substr(org_digits, 3, 2)::int < 20 THEN
    RAISE EXCEPTION 'Ange organisationsnummer, inte personnummer' USING ERRCODE = '22023';
  END IF;

  -- En organisation per användare i v1.
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = caller) THEN
    RAISE EXCEPTION 'Användaren tillhör redan en organisation' USING ERRCODE = '23505';
  END IF;

  INSERT INTO organizations (name, organization_number)
  VALUES (trim(p_name), substr(org_digits, 1, 6) || '-' || substr(org_digits, 7))
  RETURNING id INTO new_org;

  INSERT INTO organization_members (organization_id, user_id, display_name, access_role)
  VALUES (new_org, caller, trim(p_display_name), 'owner');

  PERFORM public.claim_my_requests();

  RETURN new_org;
END;
$$;
