ALTER TABLE public.custom_requests
  ADD COLUMN IF NOT EXISTS recommended_categories text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS has_provider_match boolean DEFAULT false;
