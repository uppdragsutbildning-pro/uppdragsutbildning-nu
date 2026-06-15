-- Add email column to profiles table
-- This makes it easier to display user info without needing admin API access

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing profiles with their email from auth.users
-- (You'll need to manually update these if you already have users)
