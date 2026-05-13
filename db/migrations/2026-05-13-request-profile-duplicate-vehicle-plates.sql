ALTER TABLE request_profiles
  ADD COLUMN IF NOT EXISTS allow_duplicate_vehicle_plates TINYINT(1) NOT NULL DEFAULT 0 AFTER is_unlimited_quota;
