-- Partnermarknadsplatser (Arbetspaket A)
-- Se docs/specs/partnermarknadsplatser.md för bakgrund och beslutade vägval.
-- Bygger marketplaces-infrastrukturen från grunden för både provider_storefront
-- (varumärkt leverantörssubdomän) och partner_curated (partnermarknadsplats).

-- =====================================================
-- PARTNER_ORGANIZATIONS
-- =====================================================
CREATE TABLE partner_organizations (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name TEXT NOT NULL,
  org_number TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =====================================================
-- MARKETPLACES
-- =====================================================
CREATE TABLE marketplaces (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('open', 'provider_storefront', 'partner_curated')),
  slug TEXT NOT NULL UNIQUE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('provider', 'partner_organization', 'platform')),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  partner_organization_id UUID REFERENCES partner_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused')) DEFAULT 'draft',
  access_mode TEXT NOT NULL CHECK (access_mode IN ('open', 'gated', 'mixed')) DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT marketplaces_owner_matches_type CHECK (
    (owner_type = 'provider' AND provider_id IS NOT NULL AND partner_organization_id IS NULL) OR
    (owner_type = 'partner_organization' AND partner_organization_id IS NOT NULL AND provider_id IS NULL) OR
    (owner_type = 'platform' AND provider_id IS NULL AND partner_organization_id IS NULL)
  )
);

CREATE INDEX idx_marketplaces_provider ON marketplaces(provider_id);
CREATE INDEX idx_marketplaces_partner_organization ON marketplaces(partner_organization_id);
CREATE INDEX idx_marketplaces_status ON marketplaces(status);

-- =====================================================
-- MARKETPLACE_BRANDING (1:1 med marketplaces)
-- =====================================================
CREATE TABLE marketplace_branding (
  marketplace_id UUID PRIMARY KEY REFERENCES marketplaces(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  hero_image_url TEXT,
  tagline TEXT
);

-- =====================================================
-- MARKETPLACE_TRAININGS (kuration; specens "marketplace_courses",
-- omdöpt för att matcha befintlig trainings-nomenklatur)
-- =====================================================
CREATE TABLE marketplace_trainings (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  marketplace_id UUID NOT NULL REFERENCES marketplaces(id) ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  removed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_marketplace_trainings_marketplace ON marketplace_trainings(marketplace_id);
CREATE INDEX idx_marketplace_trainings_training ON marketplace_trainings(training_id);

-- Förhindrar dubblettkuration av samma träning i samma marknadsplats
-- samtidigt som borttagna rader (removed_at satt) kan lämnas kvar som historik.
CREATE UNIQUE INDEX idx_marketplace_trainings_active_unique
  ON marketplace_trainings(marketplace_id, training_id)
  WHERE removed_at IS NULL;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE partner_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_trainings ENABLE ROW LEVEL SECURITY;

-- PARTNER_ORGANIZATIONS: endast admin (interna kontaktuppgifter, ingen publik/leverantörsyta)
CREATE POLICY "Admins can do everything with partner organizations"
  ON partner_organizations FOR ALL
  USING (is_admin());

-- MARKETPLACES
CREATE POLICY "Public can view active marketplaces"
  ON marketplaces FOR SELECT
  USING (status = 'active');

CREATE POLICY "Providers can view their own storefront marketplace"
  ON marketplaces FOR SELECT
  USING (owner_type = 'provider' AND provider_id = get_user_provider_id());

CREATE POLICY "Admins can do everything with marketplaces"
  ON marketplaces FOR ALL
  USING (is_admin());

-- MARKETPLACE_BRANDING
CREATE POLICY "Public can view branding for active marketplaces"
  ON marketplace_branding FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM marketplaces
      WHERE marketplaces.id = marketplace_branding.marketplace_id
      AND marketplaces.status = 'active'
    )
  );

CREATE POLICY "Admins can do everything with marketplace branding"
  ON marketplace_branding FOR ALL
  USING (is_admin());

-- MARKETPLACE_TRAININGS
CREATE POLICY "Public can view curated trainings on active marketplaces"
  ON marketplace_trainings FOR SELECT
  USING (
    removed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM marketplaces
      WHERE marketplaces.id = marketplace_trainings.marketplace_id
      AND marketplaces.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = marketplace_trainings.training_id
      AND trainings.is_active = true
    )
  );

CREATE POLICY "Providers can view curation of their own trainings"
  ON marketplace_trainings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = marketplace_trainings.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

CREATE POLICY "Admins can do everything with marketplace trainings"
  ON marketplace_trainings FOR ALL
  USING (is_admin());
