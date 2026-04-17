ALTER TABLE events
  ADD COLUMN IF NOT EXISTS vehicle_check_token CHAR(40) NULL AFTER wristband_request_deadline,
  ADD COLUMN IF NOT EXISTS vehicle_check_token_created_at DATETIME NULL AFTER vehicle_check_token;

SET @has_events_vehicle_check_token_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'uq_events_vehicle_check_token'
);

SET @events_vehicle_check_token_index_sql := IF(
  @has_events_vehicle_check_token_index = 0,
  'ALTER TABLE events ADD UNIQUE KEY uq_events_vehicle_check_token (vehicle_check_token)',
  'SELECT 1'
);

PREPARE events_vehicle_check_token_index_stmt FROM @events_vehicle_check_token_index_sql;
EXECUTE events_vehicle_check_token_index_stmt;
DEALLOCATE PREPARE events_vehicle_check_token_index_stmt;
