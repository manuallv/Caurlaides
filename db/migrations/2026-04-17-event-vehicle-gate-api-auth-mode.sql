ALTER TABLE events
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_auth_mode ENUM('none', 'api_key') NOT NULL DEFAULT 'api_key' AFTER vehicle_gate_api_token_created_at,
  ADD COLUMN IF NOT EXISTS vehicle_gate_api_key CHAR(48) NULL AFTER vehicle_gate_api_auth_mode;

SET @has_events_vehicle_gate_api_key_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'uq_events_vehicle_gate_api_key'
);

SET @events_vehicle_gate_api_key_index_sql := IF(
  @has_events_vehicle_gate_api_key_index = 0,
  'ALTER TABLE events ADD UNIQUE KEY uq_events_vehicle_gate_api_key (vehicle_gate_api_key)',
  'SELECT 1'
);

PREPARE events_vehicle_gate_api_key_index_stmt FROM @events_vehicle_gate_api_key_index_sql;
EXECUTE events_vehicle_gate_api_key_index_stmt;
DEALLOCATE PREPARE events_vehicle_gate_api_key_index_stmt;
