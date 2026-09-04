-- Partnermarknadsplatser (Arbetspaket G): "Var visas mina kurser".
-- Leverantörer behöver kunna läsa namn/slug/status på partnermarknadsplatser
-- som kuraterat in deras kurser, oavsett marknadsplatsens status (draft/paused
-- ska också synas för leverantören, till skillnad från publik vy som bara
-- visar 'active'). Utan detta blockerar befintlig "Public can view active
-- marketplaces"-policy den vyn för icke-aktiva marknadsplatser.
--
-- Använder en SECURITY DEFINER-funktion (samma mönster som is_admin()/
-- get_user_provider_id() i 02_row_level_security.sql) istället för en direkt
-- EXISTS-subquery mot marketplace_trainings i policyn. En direkt subquery
-- skapar en cirkulär RLS-referens: marketplace_trainings har redan en policy
-- som slår upp marketplaces, så en marketplaces-policy som i sin tur slår upp
-- marketplace_trainings ger "infinite recursion detected in policy" för alla
-- roller (även anon), vilket bryter Paket D:s publika katalog-scopning.
-- SECURITY DEFINER-funktionen körs med förhöjd behörighet (samma sätt som
-- befintliga helper-funktioner) och kringgår därmed RLS i sin egen fråga,
-- vilket bryter cirkeln.

CREATE OR REPLACE FUNCTION provider_curated_marketplace_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT mt.marketplace_id
  FROM marketplace_trainings mt
  JOIN trainings t ON t.id = mt.training_id
  WHERE mt.removed_at IS NULL
  AND t.provider_id = get_user_provider_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "Providers can view marketplaces curating their trainings"
  ON marketplaces FOR SELECT
  USING (id IN (SELECT provider_curated_marketplace_ids()));
