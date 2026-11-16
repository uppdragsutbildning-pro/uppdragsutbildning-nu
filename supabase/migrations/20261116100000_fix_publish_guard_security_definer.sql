-- Fix: "permission denied for function billing_policy_registered" när en
-- inloggad leverantör publicerar en kurs.
--
-- Orsak: triggerfunktionen guard_training_publish_requires_policy() körs som
-- den inloggade användaren (SECURITY INVOKER), men hjälpfunktionen
-- billing_policy_registered() har medvetet EXECUTE återkallat från
-- authenticated (migration 20261026180000). Anropet i triggern nekas därför
-- innan själva policykontrollen hinner köras.
--
-- Lösning: kör triggerfunktionen som ägaren (SECURITY DEFINER). Funktionen
-- använder bara auth.uid() och läser leverantörens egen policy, så den
-- exponerar inget nytt. EXECUTE förblir återkallat för PUBLIC/anon/authenticated.

CREATE OR REPLACE FUNCTION public.guard_training_publish_requires_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol JSONB;
BEGIN
  -- Bara inloggade användare: migrationer, SQL-editorn och service role undantas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT coalesce(NEW.is_active, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND coalesce(OLD.is_active, false) THEN
    RETURN NEW;
  END IF;

  SELECT p.cancellation_policy INTO pol FROM providers p WHERE p.id = NEW.provider_id;
  IF NOT billing_policy_registered(pol) THEN
    RAISE EXCEPTION 'Registrera lärosätets avbokningsvillkor under Villkor innan en kurs publiceras'
      USING ERRCODE = 'P0001', HINT = 'cancellation_policy_required';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_training_publish_requires_policy() FROM PUBLIC, anon, authenticated;
