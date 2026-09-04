-- Partnermarknadsplatser (Arbetspaket F): RFP/bokning-attribution.
-- Se docs/specs/partnermarknadsplatser.md avsnitt 10 (beslut #11).
-- NULL = kom via öppna marknadsplatsen (ingen marknadsplats-attribution).

ALTER TABLE custom_requests
  ADD COLUMN marketplace_id UUID REFERENCES marketplaces(id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN marketplace_id UUID REFERENCES marketplaces(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_requests_marketplace ON custom_requests(marketplace_id);
CREATE INDEX idx_applications_marketplace ON applications(marketplace_id);
