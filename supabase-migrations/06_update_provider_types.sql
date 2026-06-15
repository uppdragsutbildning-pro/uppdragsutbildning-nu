-- =====================================================
-- Update Provider Types
-- Add "högskola" and "yrkeshögskola" as valid provider types
-- =====================================================

-- Drop the old constraint
ALTER TABLE providers
DROP CONSTRAINT IF EXISTS providers_type_check;

-- Add new constraint with three types
ALTER TABLE providers
ADD CONSTRAINT providers_type_check
CHECK (type IN ('universitet', 'högskola', 'yrkeshögskola'));

-- Update existing providers to new type names
-- (Convert 'university' to 'universitet', 'private' will need manual update)
UPDATE providers
SET type = 'universitet'
WHERE type = 'university';

UPDATE providers
SET type = 'yrkeshögskola'
WHERE type = 'private';
