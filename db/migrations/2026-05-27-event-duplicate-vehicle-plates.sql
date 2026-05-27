ALTER TABLE events
  ADD COLUMN IF NOT EXISTS allow_duplicate_vehicle_plates TINYINT(1) NOT NULL DEFAULT 0 AFTER wristband_request_deadline;
