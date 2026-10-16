-- Säkerhetsfix: leverantörspolicyerna på custom_requests saknade rollbegränsning
-- (TO PUBLIC) och släppte igenom `training_id IS NULL` för vem som helst, även
-- anonyma besökare med den publika anon-nyckeln. Allmänna förfrågningar
-- (kontaktnamn, e-post, telefon) var därmed läs- och uppdateringsbara för alla.
--
-- Nu krävs en inloggad leverantör (get_user_provider_id() IS NOT NULL).
-- Beteendet för leverantörer är oförändrat: de ser allmänna förfrågningar samt
-- förfrågningar på sina egna kurser. Admin har kvar sin ALL-policy.
-- RequestFlowPage gör INSERT utan RETURNING, så anonyma inskick påverkas inte.

DROP POLICY "Providers can view relevant custom requests" ON public.custom_requests;
DROP POLICY "Providers can update relevant custom requests" ON public.custom_requests;

CREATE POLICY "Providers can view relevant custom requests"
  ON public.custom_requests FOR SELECT TO authenticated
  USING (
    get_user_provider_id() IS NOT NULL
    AND (
      training_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.trainings
        WHERE trainings.id = custom_requests.training_id
          AND trainings.provider_id = get_user_provider_id()
      )
    )
  );

CREATE POLICY "Providers can update relevant custom requests"
  ON public.custom_requests FOR UPDATE TO authenticated
  USING (
    get_user_provider_id() IS NOT NULL
    AND (
      training_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.trainings
        WHERE trainings.id = custom_requests.training_id
          AND trainings.provider_id = get_user_provider_id()
      )
    )
  );
