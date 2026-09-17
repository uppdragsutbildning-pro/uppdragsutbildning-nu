-- Leverantörsspecifik villkorstext, visas för deltagare via /leverantor/{id}/villkor
-- och länkas till från "Anmälan bekräftad"-mejlet.
ALTER TABLE providers ADD COLUMN terms_text TEXT;

-- Leverantörer har idag ingen generell UPDATE-policy på providers (bara admins, se
-- "Admins can do everything with providers" i 02_row_level_security.sql). En bred
-- UPDATE-policy för providers skulle exponera fält som name/is_active för redigering,
-- inte bara villkorstexten. Denna SECURITY DEFINER-funktion skriver därför enbart
-- terms_text, och enbart för anroparens egen leverantör (eller valfri leverantör om
-- anroparen är admin, samma mönster som is_admin()-koll i övriga policies).
CREATE OR REPLACE FUNCTION update_provider_terms(target_provider_id UUID, new_terms_text TEXT)
RETURNS VOID AS $$
DECLARE
  caller_provider_id UUID := get_user_provider_id();
BEGIN
  -- get_user_provider_id() returnerar NULL för en oautentiserad/icke-provider-anropare.
  -- "target_provider_id = NULL" utvärderas då till NULL (inte false), och
  -- "IF NOT (false OR NULL)" är NULL => grenen körs INTE => RAISE skulle tyst hoppas
  -- över och vem som helst kunde skriva över valfri leverantörs villkor. Därför
  -- kollas caller_provider_id explicit mot NULL innan jämförelsen.
  IF NOT (is_admin() OR (caller_provider_id IS NOT NULL AND target_provider_id = caller_provider_id)) THEN
    RAISE EXCEPTION 'Not authorized to update this provider''s terms';
  END IF;

  UPDATE providers
  SET terms_text = new_terms_text, updated_at = NOW()
  WHERE id = target_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION update_provider_terms(UUID, TEXT) TO authenticated;
