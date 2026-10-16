-- Köparkonton för "Mitt konto" (etapp 1).
--
-- Köpare loggar in med e-postlänk (Supabase Auth) och har ingen rad i
-- `profiles` (den tabellens role är bara 'admin'/'provider'). Köparens
-- tillhörighet ligger i organization_members. Alla skrivningar mot
-- organizations/organization_members går via SECURITY DEFINER-funktioner –
-- inga INSERT/UPDATE/DELETE-policies för klienten.

-- ── Tabeller ────────────────────────────────────────────────────────────
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  organization_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  role_title TEXT,
  access_role TEXT NOT NULL DEFAULT 'owner'
    CHECK (access_role IN ('owner', 'admin', 'buyer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user ON public.organization_members(user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ── Hjälpfunktion (SECURITY DEFINER undviker cirkulär RLS, jfr Paket G) ──
CREATE OR REPLACE FUNCTION public.my_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_organization_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_organization_ids() TO authenticated;

-- ── RLS: endast läsning ─────────────────────────────────────────────────
CREATE POLICY "Members can view their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT public.my_organization_ids()) OR is_admin());

CREATE POLICY "Users can view their own memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ── Koppling förfrågan → organisation ───────────────────────────────────
ALTER TABLE public.custom_requests
  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_requests_organization ON public.custom_requests(organization_id);

CREATE POLICY "Members can view their organization's requests"
  ON public.custom_requests FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.my_organization_ids()));

-- Anonym INSERT är tillåten på custom_requests (WITH CHECK (true)), så
-- organization_id får aldrig kunna sättas fritt av klienten: vid INSERT
-- behålls värdet bara om anroparen är medlem i den organisationen, och
-- vid UPDATE får det bara ändras av admin eller claim_my_requests().
CREATE OR REPLACE FUNCTION public.guard_custom_request_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
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

CREATE TRIGGER guard_custom_request_organization
  BEFORE INSERT OR UPDATE ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_request_organization();

-- ── RPC: koppla äldre förfrågningar (samma verifierade e-post) ──────────
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
  RETURN claimed;
END;
$$;

-- ── RPC: skapa egen organisation vid första inloggningen ────────────────
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
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- En organisation per användare i v1.
  IF EXISTS (SELECT 1 FROM organization_members WHERE user_id = caller) THEN
    RAISE EXCEPTION 'Användaren tillhör redan en organisation' USING ERRCODE = '23505';
  END IF;

  INSERT INTO organizations (name, organization_number)
  VALUES (trim(p_name), nullif(trim(coalesce(p_organization_number, '')), ''))
  RETURNING id INTO new_org;

  INSERT INTO organization_members (organization_id, user_id, display_name, access_role)
  VALUES (new_org, caller, trim(p_display_name), 'owner');

  PERFORM public.claim_my_requests();

  RETURN new_org;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_my_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_my_organization(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_organization(TEXT, TEXT, TEXT) TO authenticated;
