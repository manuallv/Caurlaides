ALTER TABLE request_profiles
  ADD COLUMN IF NOT EXISTS is_unlimited_quota TINYINT(1) NOT NULL DEFAULT 0 AFTER max_people;
