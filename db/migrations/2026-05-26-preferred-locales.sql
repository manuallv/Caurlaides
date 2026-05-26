ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv' AFTER phone;

UPDATE users
SET preferred_locale = 'lv'
WHERE preferred_locale IS NULL OR preferred_locale = '';

ALTER TABLE users
  MODIFY preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv';

ALTER TABLE request_profiles
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv' AFTER contact_phone;

UPDATE request_profiles
SET preferred_locale = 'lv'
WHERE preferred_locale IS NULL OR preferred_locale = '';

ALTER TABLE request_profiles
  MODIFY preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv';

ALTER TABLE request_profile_applications
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv' AFTER contact_phone;

UPDATE request_profile_applications
SET preferred_locale = 'lv'
WHERE preferred_locale IS NULL OR preferred_locale = '';

ALTER TABLE request_profile_applications
  MODIFY preferred_locale VARCHAR(8) NOT NULL DEFAULT 'lv';

ALTER TABLE email_templates
  MODIFY locale VARCHAR(8) NOT NULL DEFAULT 'lv';
