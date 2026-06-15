-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_starts ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's provider_id
CREATE OR REPLACE FUNCTION get_user_provider_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT provider_id FROM profiles
    WHERE id = auth.uid() AND role = 'provider' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PROVIDERS POLICIES
-- =====================================================

-- Public can read active providers
CREATE POLICY "Public can view active providers"
  ON providers FOR SELECT
  USING (is_active = true);

-- Providers can read their own data
CREATE POLICY "Providers can view their own data"
  ON providers FOR SELECT
  USING (id = get_user_provider_id());

-- Admins can do everything
CREATE POLICY "Admins can do everything with providers"
  ON providers FOR ALL
  USING (is_admin());

-- =====================================================
-- CATEGORIES POLICIES
-- =====================================================

-- Everyone can read categories (public data)
CREATE POLICY "Anyone can view categories"
  ON categories FOR SELECT
  TO PUBLIC
  USING (true);

-- =====================================================
-- TRAININGS POLICIES
-- =====================================================

-- Public can read active trainings
CREATE POLICY "Public can view active trainings"
  ON trainings FOR SELECT
  USING (is_active = true);

-- Providers can read their own trainings
CREATE POLICY "Providers can view their own trainings"
  ON trainings FOR SELECT
  USING (provider_id = get_user_provider_id());

-- Providers can create trainings for their provider
CREATE POLICY "Providers can create trainings"
  ON trainings FOR INSERT
  WITH CHECK (provider_id = get_user_provider_id());

-- Providers can update their own trainings
CREATE POLICY "Providers can update their own trainings"
  ON trainings FOR UPDATE
  USING (provider_id = get_user_provider_id())
  WITH CHECK (provider_id = get_user_provider_id());

-- Providers can delete their own trainings
CREATE POLICY "Providers can delete their own trainings"
  ON trainings FOR DELETE
  USING (provider_id = get_user_provider_id());

-- Admins can do everything
CREATE POLICY "Admins can do everything with trainings"
  ON trainings FOR ALL
  USING (is_admin());

-- =====================================================
-- CURRICULUM MODULES POLICIES
-- =====================================================

-- Public can read curriculum for active trainings
CREATE POLICY "Public can view curriculum for active trainings"
  ON curriculum_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = curriculum_modules.training_id
      AND trainings.is_active = true
    )
  );

-- Providers can manage curriculum for their trainings
CREATE POLICY "Providers can manage their own curriculum"
  ON curriculum_modules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = curriculum_modules.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with curriculum"
  ON curriculum_modules FOR ALL
  USING (is_admin());

-- =====================================================
-- FAQ POLICIES
-- =====================================================

-- Public can read FAQ for active trainings
CREATE POLICY "Public can view FAQ for active trainings"
  ON training_faq FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = training_faq.training_id
      AND trainings.is_active = true
    )
  );

-- Providers can manage FAQ for their trainings
CREATE POLICY "Providers can manage their own FAQ"
  ON training_faq FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = training_faq.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with FAQ"
  ON training_faq FOR ALL
  USING (is_admin());

-- =====================================================
-- SCHEDULED STARTS POLICIES
-- =====================================================

-- Public can read starts for active trainings
CREATE POLICY "Public can view starts for active trainings"
  ON scheduled_starts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = scheduled_starts.training_id
      AND trainings.is_active = true
    )
  );

-- Providers can manage starts for their trainings
CREATE POLICY "Providers can manage their own starts"
  ON scheduled_starts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = scheduled_starts.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with starts"
  ON scheduled_starts FOR ALL
  USING (is_admin());

-- =====================================================
-- APPLICATIONS POLICIES
-- =====================================================

-- Public can create applications (anyone can apply)
CREATE POLICY "Anyone can create applications"
  ON applications FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

-- Providers can view applications for their trainings
CREATE POLICY "Providers can view applications for their trainings"
  ON applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = applications.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Providers can update applications for their trainings
CREATE POLICY "Providers can update applications for their trainings"
  ON applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = applications.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with applications"
  ON applications FOR ALL
  USING (is_admin());

-- =====================================================
-- CUSTOM REQUESTS POLICIES
-- =====================================================

-- Public can create custom requests (anyone can request)
CREATE POLICY "Anyone can create custom requests"
  ON custom_requests FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

-- Providers can view requests related to their trainings or all if training_id is null
CREATE POLICY "Providers can view relevant custom requests"
  ON custom_requests FOR SELECT
  USING (
    training_id IS NULL OR
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = custom_requests.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Providers can update requests they can see
CREATE POLICY "Providers can update relevant custom requests"
  ON custom_requests FOR UPDATE
  USING (
    training_id IS NULL OR
    EXISTS (
      SELECT 1 FROM trainings
      WHERE trainings.id = custom_requests.training_id
      AND trainings.provider_id = get_user_provider_id()
    )
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with custom requests"
  ON custom_requests FOR ALL
  USING (is_admin());

-- =====================================================
-- PROFILES POLICIES
-- =====================================================

-- Users can read their own profile
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile (but not role or provider_id)
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
    provider_id = (SELECT provider_id FROM profiles WHERE id = auth.uid())
  );

-- Admins can do everything
CREATE POLICY "Admins can do everything with profiles"
  ON profiles FOR ALL
  USING (is_admin());
