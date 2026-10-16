-- Rättelse av 20261015120000: triggerfunktionen kördes som anroparen, och anon
-- har (avsiktligt) inte EXECUTE på my_organization_ids(). Ett anonymt inskick
-- med ett organization_id i payloaden gav därför "permission denied" i stället
-- för att värdet nollades. SECURITY DEFINER gör att kontrollen körs oavsett
-- roll; auth.uid() läses fortfarande från anroparens JWT.

CREATE OR REPLACE FUNCTION public.guard_custom_request_organization()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.organization_id IS NOT NULL
       AND NOT (NEW.organization_id IN (SELECT public.my_organization_ids())) THEN
      NEW.organization_id := NULL;
    END IF;
  ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    IF NOT (is_admin() OR coalesce(current_setting('app.claiming', true), '') = '1') THEN
      RAISE EXCEPTION 'organization_id på en förfrågan kan inte ändras'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_custom_request_organization() FROM PUBLIC, anon, authenticated;
