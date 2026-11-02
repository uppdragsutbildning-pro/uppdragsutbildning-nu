-- Marknadsplats ↔ leverantör (många-till-många).
-- Admin kopplar en eller flera marknadsplatser till en leverantör. En leverantör
-- kan sedan själv välja vilka av sina kurser som ska visas i de marknadsplatser
-- som är kopplade till den (rader i marketplace_trainings).

CREATE TABLE marketplace_providers (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  marketplace_id UUID NOT NULL REFERENCES marketplaces(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (marketplace_id, provider_id)
);

CREATE INDEX idx_marketplace_providers_marketplace ON marketplace_providers(marketplace_id);
CREATE INDEX idx_marketplace_providers_provider ON marketplace_providers(provider_id);

-- Befintliga leverantörsbutiker kopplas till sin leverantör så att de är
-- konsekventa med den nya modellen.
INSERT INTO marketplace_providers (marketplace_id, provider_id)
SELECT id, provider_id FROM marketplaces
WHERE type = 'provider_storefront' AND provider_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Befintliga kurateringar: koppla leverantörerna till de marknadsplatser som
-- redan visar deras kurser, så att leverantören kan fortsätta hantera dem.
INSERT INTO marketplace_providers (marketplace_id, provider_id)
SELECT DISTINCT mt.marketplace_id, t.provider_id
FROM marketplace_trainings mt
JOIN trainings t ON t.id = mt.training_id
WHERE mt.removed_at IS NULL AND t.provider_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE marketplace_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with marketplace providers"
  ON marketplace_providers FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Providers can view their own marketplace links"
  ON marketplace_providers FOR SELECT
  USING (provider_id = get_user_provider_id());

-- SECURITY DEFINER-hjälpfunktion (samma mönster som provider_curated_marketplace_ids)
-- för att undvika cirkulära RLS-referenser mellan marketplaces och
-- marketplace_providers.
CREATE OR REPLACE FUNCTION provider_linked_marketplace_ids()
RETURNS SETOF UUID AS $$
  SELECT marketplace_id FROM marketplace_providers
  WHERE provider_id = get_user_provider_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Leverantören ska kunna se marknadsplatser den är kopplad till (alla statusar).
CREATE POLICY "Providers can view marketplaces linked to them"
  ON marketplaces FOR SELECT
  USING (id IN (SELECT provider_linked_marketplace_ids()));

-- Leverantören får lägga till/ta bort (soft delete) egna kurser i
-- marknadsplatser som är kopplade till leverantören. Admin täcks redan av
-- "Admins can do everything with marketplace trainings".
CREATE POLICY "Providers can curate own trainings into linked marketplaces (insert)"
  ON marketplace_trainings FOR INSERT
  WITH CHECK (
    marketplace_id IN (SELECT provider_linked_marketplace_ids())
    AND EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = marketplace_trainings.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

CREATE POLICY "Providers can curate own trainings into linked marketplaces (update)"
  ON marketplace_trainings FOR UPDATE
  USING (
    marketplace_id IN (SELECT provider_linked_marketplace_ids())
    AND EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = marketplace_trainings.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  )
  WITH CHECK (
    marketplace_id IN (SELECT provider_linked_marketplace_ids())
    AND EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = marketplace_trainings.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );
