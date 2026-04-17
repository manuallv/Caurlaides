ALTER TABLE pass_requests
  ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(20) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS vehicle_plate_normalized VARCHAR(20) NULL AFTER vehicle_plate,
  ADD COLUMN IF NOT EXISTS entered_at DATETIME NULL AFTER finalized_at,
  ADD COLUMN IF NOT EXISTS last_entry_at DATETIME NULL AFTER entered_at,
  ADD COLUMN IF NOT EXISTS last_exit_at DATETIME NULL AFTER last_entry_at;

SET @has_pass_requests_event_plate := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pass_requests'
    AND INDEX_NAME = 'idx_pass_requests_event_plate'
);

SET @pass_requests_event_plate_sql := IF(
  @has_pass_requests_event_plate = 0,
  'ALTER TABLE pass_requests ADD INDEX idx_pass_requests_event_plate (event_id, vehicle_plate_normalized, deleted_at)',
  'SELECT 1'
);

PREPARE pass_requests_event_plate_stmt FROM @pass_requests_event_plate_sql;
EXECUTE pass_requests_event_plate_stmt;
DEALLOCATE PREPARE pass_requests_event_plate_stmt;

UPDATE pass_requests
SET
  vehicle_plate = UPPER(TRIM(vehicle_plate)),
  vehicle_plate_normalized = NULLIF(
    UPPER(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(TRIM(COALESCE(vehicle_plate, '')), '-', ''),
            ' ',
            ''
          ),
          '.',
          ''
        ),
        '/',
        ''
      )
    ),
    ''
  )
WHERE vehicle_plate IS NOT NULL;

CREATE TABLE IF NOT EXISTS pass_request_entry_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  pass_request_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('entry', 'exit') NOT NULL DEFAULT 'entry',
  vehicle_plate VARCHAR(20) NOT NULL,
  vehicle_plate_normalized VARCHAR(20) NOT NULL,
  gate_name VARCHAR(120) NULL,
  source VARCHAR(80) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pass_request_entry_logs_event_created (event_id, created_at),
  KEY idx_pass_request_entry_logs_request_created (pass_request_id, created_at),
  KEY idx_pass_request_entry_logs_plate_created (vehicle_plate_normalized, created_at),
  CONSTRAINT fk_pass_request_entry_logs_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_request_entry_logs_request
    FOREIGN KEY (pass_request_id) REFERENCES pass_requests (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

ALTER TABLE pass_request_entry_logs
  ADD COLUMN IF NOT EXISTS direction ENUM('entry', 'exit') NOT NULL DEFAULT 'entry' AFTER pass_request_id;
