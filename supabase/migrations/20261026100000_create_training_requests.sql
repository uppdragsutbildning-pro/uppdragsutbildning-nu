-- Paket A: Datamodell för "Efterfråga anpassad utbildning".
--
-- Köpare efterfrågar en anpassad utbildning (training_requests). Admin tilldelar
-- ett eller flera lärosäten (training_request_assignments). När ett lärosäte
-- svarar skapas en rad i befintliga custom_requests (RFP-flödet), kopplad
-- tillbaka via training_request_assignment_id. Statusövergångar sker enbart via
-- RPC (Paket B) – därför aktiveras RLS här men policies och RPC:er kommer i
-- nästa migration. Tills dess är tabellerna otillgängliga för klienten.
--
-- Konvention: TEXT + CHECK istället för Postgres-enums (som övriga schemat).
-- Kompetenstaggar lagras som `ssyk_skills` (jsonb [{id,title}]), inte ESCO.

-- ── updated_at-trigger (staging saknar update_updated_at_column) ─────────
CREATE OR REPLACE FUNCTION public.tr_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── training_requests ───────────────────────────────────────────────────
CREATE TABLE public.training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Idempotensnyckel från klienten: förhindrar dubbelsändning vid auto-submit efter inloggning.
  client_request_id UUID NOT NULL,
  buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buyer_org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  search_query TEXT,
  source TEXT NOT NULL DEFAULT 'direct'
    CHECK (source IN ('search_no_results', 'search_weak_results', 'direct')),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  learning_goals TEXT,
  target_group TEXT NOT NULL CHECK (length(trim(target_group)) > 0),
  participant_count INTEGER CHECK (participant_count IS NULL OR participant_count > 0),
  delivery_format TEXT NOT NULL
    CHECK (delivery_format IN ('on_site', 'remote', 'hybrid', 'flexible')),
  location TEXT,
  desired_start TEXT,
  budget_range TEXT,
  ssyk_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'assigned', 'offers_received',
                      'closed', 'cancelled', 'no_match')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_requests_buyer_client_key UNIQUE (buyer_user_id, client_request_id)
);

CREATE INDEX idx_training_requests_buyer ON public.training_requests(buyer_user_id);
CREATE INDEX idx_training_requests_org ON public.training_requests(buyer_org_id);
CREATE INDEX idx_training_requests_marketplace ON public.training_requests(marketplace_id);
-- Adminens inkorg: filtrera på status, sortera äldst först.
CREATE INDEX idx_training_requests_status_submitted ON public.training_requests(status, submitted_at);

CREATE TRIGGER training_requests_set_updated_at
  BEFORE UPDATE ON public.training_requests
  FOR EACH ROW EXECUTE FUNCTION public.tr_set_updated_at();

-- ── training_request_assignments ────────────────────────────────────────
CREATE TABLE public.training_request_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.training_requests(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'viewed', 'declined', 'quoted', 'withdrawn')),
  response_deadline TIMESTAMPTZ NOT NULL,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  decline_reason TEXT,
  -- Satt av provider_respond_with_quote (custom_requests får nedan motsatt koppling).
  quote_request_id UUID REFERENCES public.custom_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_request_assignments_request_provider_key UNIQUE (request_id, provider_id)
);

CREATE INDEX idx_tra_provider_status ON public.training_request_assignments(provider_id, status);
CREATE INDEX idx_tra_assigned_by ON public.training_request_assignments(assigned_by);
CREATE INDEX idx_tra_quote_request ON public.training_request_assignments(quote_request_id);
-- Deadline-översikt (admin) och cron-eskalering: bara öppna tilldelningar.
CREATE INDEX idx_tra_open_deadline ON public.training_request_assignments(response_deadline)
  WHERE status IN ('assigned', 'viewed');

CREATE TRIGGER training_request_assignments_set_updated_at
  BEFORE UPDATE ON public.training_request_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tr_set_updated_at();

-- ── Koppling custom_requests ↔ tilldelning (offert i befintligt RFP-flöde) ──
ALTER TABLE public.custom_requests
  ADD COLUMN provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN training_request_assignment_id UUID
    REFERENCES public.training_request_assignments(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_requests_provider ON public.custom_requests(provider_id);
CREATE UNIQUE INDEX idx_custom_requests_tr_assignment
  ON public.custom_requests(training_request_assignment_id)
  WHERE training_request_assignment_id IS NOT NULL;

-- ── training_request_events (tidslinje + revisionslogg) ─────────────────
CREATE TABLE public.training_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.training_requests(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.training_request_assignments(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('buyer', 'provider', 'admin', 'system')),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('submitted', 'assigned', 'viewed', 'declined', 'quoted',
                          'withdrawn', 'status_changed', 'cancelled', 'closed',
                          'no_match', 'deadline_passed')),
  visible_to_buyer BOOLEAN NOT NULL DEFAULT false,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tre_request_created ON public.training_request_events(request_id, created_at);
CREATE INDEX idx_tre_assignment ON public.training_request_events(assignment_id);
CREATE INDEX idx_tre_actor ON public.training_request_events(actor_user_id);

-- ── training_request_admin_notes (endast admin) ─────────────────────────
CREATE TABLE public.training_request_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.training_requests(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trn_request ON public.training_request_admin_notes(request_id);
CREATE INDEX idx_trn_author ON public.training_request_admin_notes(author_id);

-- ── RLS på (policies kommer i Paket B; utan policy nekas all klientåtkomst) ──
ALTER TABLE public.training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_request_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_request_admin_notes ENABLE ROW LEVEL SECURITY;
