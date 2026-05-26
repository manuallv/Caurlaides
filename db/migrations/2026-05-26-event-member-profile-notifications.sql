ALTER TABLE event_users
  ADD COLUMN IF NOT EXISTS notify_profile_applications TINYINT(1) NOT NULL DEFAULT 1 AFTER role;

UPDATE event_users
SET notify_profile_applications = 1
WHERE notify_profile_applications IS NULL;
