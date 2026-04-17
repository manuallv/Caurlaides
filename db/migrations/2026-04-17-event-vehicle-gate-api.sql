ALTER TABLE events
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_token CHAR(40) NULL AFTER vehicle_check_token_created_at,
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_token_created_at DATETIME NULL AFTER vehicle_gate_api_token,
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_mode ENUM('decision', 'entry', 'exit') NOT NULL DEFAULT 'decision' AFTER vehicle_gate_api_token_created_at,
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_dedupe_seconds INT UNSIGNED NOT NULL DEFAULT 180 AFTER vehicle_gate_api_mode;

SET @has_events_vehicle_gate_api_token_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'uq_events_vehicle_gate_api_token'
);

SET @events_vehicle_gate_api_token_index_sql := IF(
  @has_events_vehicle_gate_api_token_index = 0,
  'ALTER TABLE events ADD UNIQUE KEY uq_events_vehicle_gate_api_token (vehicle_gate_api_token)',
  'SELECT 1'
);

PREPARE events_vehicle_gate_api_token_index_stmt FROM @events_vehicle_gate_api_token_index_sql;
EXECUTE events_vehicle_gate_api_token_index_stmt;
DEALLOCATE PREPARE events_vehicle_gate_api_token_index_stmt;
