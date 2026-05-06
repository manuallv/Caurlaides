ALTER TABLE events
  ADD COLUMN IF NOT EXISTS request_profile_application_token CHAR(36) NULL AFTER wristband_request_deadline;

SET @has_events_profile_application_token_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'events'
    AND INDEX_NAME = 'uq_events_request_profile_application_token'
);

SET @events_profile_application_token_index_sql := IF(
  @has_events_profile_application_token_index = 0,
  'ALTER TABLE events ADD UNIQUE KEY uq_events_request_profile_application_token (request_profile_application_token)',
  'SELECT 1'
);

PREPARE events_profile_application_token_index_stmt FROM @events_profile_application_token_index_sql;
EXECUTE events_profile_application_token_index_stmt;
DEALLOCATE PREPARE events_profile_application_token_index_stmt;

CREATE TABLE IF NOT EXISTS request_profile_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  profile_name VARCHAR(160) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL,
  notes TEXT NULL,
  requested_pass_quota JSON NULL,
  requested_wristband_quota JSON NULL,
  approved_profile_id BIGINT UNSIGNED NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  rejection_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_profile_applications_event_status_created (event_id, status, created_at),
  KEY idx_profile_applications_email (event_id, contact_email),
  CONSTRAINT fk_profile_applications_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_profile_applications_profile
    FOREIGN KEY (approved_profile_id) REFERENCES request_profiles (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_profile_applications_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;
