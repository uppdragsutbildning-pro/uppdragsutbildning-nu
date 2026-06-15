-- =====================================================
-- Create Test Admin Account
-- =====================================================
-- Run this AFTER creating a user in Supabase Auth Dashboard

-- Instructions:
-- 1. Go to Authentication > Users in Supabase Dashboard
-- 2. Click "Add user" > "Create new user"
-- 3. Email: admin@uppdragsutbildning.nu (or your preferred email)
-- 4. Password: Choose a secure password
-- 5. Click "Create user"
-- 6. Copy the User ID from the user list
-- 7. Replace 'YOUR_USER_ID_HERE' below with the actual UUID
-- 8. Run this SQL script

-- Insert admin profile
-- Note: Make sure you've run migration 05_add_email_to_profiles.sql first!
INSERT INTO profiles (id, email, full_name, role, is_active, provider_id)
VALUES (
  'YOUR_USER_ID_HERE', -- Replace with actual user ID from Auth
  'admin@uppdragsutbildning.nu', -- Same email as in Auth
  'Admin Testanvändare',
  'admin',
  true,
  NULL -- Admins don't belong to a specific provider
)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email;

-- You can now log in at /login with the email and password you created!
