-- =====================================================
-- Uppdragsutbildning.nu - Initial Database Schema
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROVIDERS TABLE
-- =====================================================
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('university', 'private')),
  description TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CATEGORIES TABLE
-- =====================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default categories
INSERT INTO categories (name, slug, description) VALUES
  ('Ledarskap', 'ledarskap', 'Ledarutveckling och chefsutbildning'),
  ('AI & Teknik', 'ai-teknik', 'Artificiell intelligens och teknikkompetens'),
  ('HR & Personal', 'hr-personal', 'Personal och HR-utveckling'),
  ('Hälsa & Vård', 'halsa-vard', 'Utbildning för vård och omsorg'),
  ('Offentlig Sektor', 'offentlig-sektor', 'Utbildning för myndigheter och kommuner'),
  ('Industri & Tillverkning', 'industri', 'Industriell kompetens och tillverkning'),
  ('Hållbarhet', 'hallbarhet', 'Hållbarhet och miljöutbildning'),
  ('Digital Transformation', 'digital-transformation', 'Digital transformation och innovation');

-- =====================================================
-- TRAININGS TABLE
-- =====================================================
CREATE TABLE trainings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  course_code TEXT,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  format TEXT NOT NULL CHECK (format IN ('online', 'onsite', 'hybrid')),
  duration TEXT NOT NULL,
  credits NUMERIC NOT NULL,
  target_audience TEXT NOT NULL,
  image_url TEXT NOT NULL,
  training_type TEXT NOT NULL CHECK (training_type IN ('custom', 'scheduled', 'both')),
  is_popular BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  views INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  learning_outcomes TEXT[],
  instructor_name TEXT,
  instructor_title TEXT,
  instructor_bio TEXT,
  contact_person_name TEXT,
  contact_person_title TEXT,
  contact_person_email TEXT,
  contact_person_phone TEXT,
  contact_person_response_time TEXT DEFAULT 'Svarar inom 24 timmar',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CURRICULUM TABLE
-- =====================================================
CREATE TABLE curriculum_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topics TEXT[] NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- FAQ TABLE
-- =====================================================
CREATE TABLE training_faq (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SCHEDULED STARTS TABLE
-- =====================================================
CREATE TABLE scheduled_starts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  application_deadline DATE NOT NULL,
  price NUMERIC NOT NULL,
  max_participants INTEGER NOT NULL,
  available_spots INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'few_spots', 'full', 'upcoming')),
  location TEXT,
  language TEXT DEFAULT 'Svenska',
  admission_requirements TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- APPLICATIONS TABLE
-- =====================================================
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scheduled_start_id UUID NOT NULL REFERENCES scheduled_starts(id) ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_email TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  company TEXT NOT NULL,
  department TEXT,
  status TEXT NOT NULL CHECK (status IN ('new', 'reviewed', 'confirmed', 'declined')) DEFAULT 'new',
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CUSTOM REQUESTS TABLE
-- =====================================================
CREATE TABLE custom_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  training_id UUID REFERENCES trainings(id) ON DELETE SET NULL,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  course_topic TEXT NOT NULL,
  description TEXT NOT NULL,
  budget TEXT,
  timeline TEXT NOT NULL,
  participants_count TEXT NOT NULL,
  ai_score TEXT CHECK (ai_score IN ('high', 'medium', 'low')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('new', 'responded', 'negotiating', 'accepted', 'declined')) DEFAULT 'new',
  response TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- PROFILES TABLE (linked to auth.users)
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'provider')) DEFAULT 'provider',
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_trainings_provider ON trainings(provider_id);
CREATE INDEX idx_trainings_category ON trainings(category_id);
CREATE INDEX idx_trainings_active ON trainings(is_active);
CREATE INDEX idx_scheduled_starts_training ON scheduled_starts(training_id);
CREATE INDEX idx_applications_training ON applications(training_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_custom_requests_status ON custom_requests(status);
CREATE INDEX idx_profiles_provider ON profiles(provider_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trainings_updated_at BEFORE UPDATE ON trainings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_starts_updated_at BEFORE UPDATE ON scheduled_starts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_requests_updated_at BEFORE UPDATE ON custom_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
