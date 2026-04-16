ALTER TABLE request_profile_pass_categories
  ADD COLUMN IF NOT EXISTS quota INT UNSIGNED NOT NULL DEFAULT 0 AFTER pass_category_id;

ALTER TABLE request_profile_wristband_categories
  ADD COLUMN IF NOT EXISTS quota INT UNSIGNED NOT NULL DEFAULT 0 AFTER wristband_category_id;

ALTER TABLE pass_requests
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NULL AFTER company_name;

ALTER TABLE wristband_requests
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NULL AFTER company_name;
