-- Härdning: claim_my_requests() sätter transaktionslokala flaggan app.claiming
-- för att få ändra custom_requests.organization_id förbi guard-triggern. Flaggan
-- nollas nu direkt efter UPDATE så att den inte läcker till övriga satser i
-- samma transaktion (t.ex. om funktionen anropas inifrån en längre RPC).

CREATE OR REPLACE FUNCTION public.claim_my_requests()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_email TEXT;
  caller_org UUID;
  claimed INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = caller AND email_confirmed_at IS NOT NULL;

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'E-postadressen är inte verifierad' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO caller_org
  FROM organization_members WHERE user_id = caller LIMIT 1;

  IF caller_org IS NULL THEN
    RAISE EXCEPTION 'Ingen organisation för användaren' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.claiming', '1', true);

  UPDATE custom_requests
  SET organization_id = caller_org
  WHERE organization_id IS NULL
    AND lower(contact_email) = lower(caller_email);

  GET DIAGNOSTICS claimed = ROW_COUNT;

  PERFORM set_config('app.claiming', '', true);

  RETURN claimed;
END;
$$;
