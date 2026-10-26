-- Paket F: köparorganisationens namn i leverantörsportalens lista över efterfrågningar.
--
-- Leverantörer får inte läsa `organizations` (RLS: bara medlemmar och admin), men det
-- befintliga RFP-flödet visar redan företagsnamnet för leverantören. Den här funktionen
-- exponerar enbart organisationens NAMN för leverantörens egna, ej återkallade
-- tilldelningar – aldrig kontaktuppgifter. Admin kan fråga per leverantör (förhandsvisning
-- av leverantörsportalen).

CREATE OR REPLACE FUNCTION public.provider_assignment_buyers(p_provider_id UUID DEFAULT NULL)
RETURNS TABLE (assignment_id UUID, organization_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF coalesce(is_admin(), false) THEN
    pid := p_provider_id;
  ELSE
    pid := get_user_provider_id();
  END IF;

  IF pid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT a.id, o.name
      FROM training_request_assignments a
      JOIN training_requests r ON r.id = a.request_id
      LEFT JOIN organizations o ON o.id = r.buyer_org_id
     WHERE a.provider_id = pid
       AND a.status <> 'withdrawn';
END;
$$;

REVOKE ALL ON FUNCTION public.provider_assignment_buyers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_assignment_buyers(UUID) TO authenticated;
