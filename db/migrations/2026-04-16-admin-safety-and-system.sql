ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER last_login_at,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE users
  ADD CONSTRAINT fk_users_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER wristband_request_deadline,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE events
  ADD CONSTRAINT fk_events_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE pass_categories
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER updated_by_user_id,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE pass_categories
  ADD CONSTRAINT fk_pass_categories_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE wristband_categories
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER updated_by_user_id,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE wristband_categories
  ADD CONSTRAINT fk_wristband_categories_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE request_profiles
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(190) NULL AFTER name,
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40) NULL AFTER contact_email,
  ADD COLUMN IF NOT EXISTS notify_contact_on_create TINYINT(1) NOT NULL DEFAULT 1 AFTER notes,
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER locked_at,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE request_profiles
  ADD CONSTRAINT fk_request_profiles_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE pass_requests
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER finalized_at,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN IF NOT EXISTS status_updated_at DATETIME NULL AFTER deleted_by_user_id,
  ADD COLUMN IF NOT EXISTS status_updated_by_user_id BIGINT UNSIGNED NULL AFTER status_updated_at;

ALTER TABLE pass_requests
  ADD CONSTRAINT fk_pass_requests_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE pass_requests
  ADD CONSTRAINT fk_pass_requests_status_updated_by
    FOREIGN KEY (status_updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE wristband_requests
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER finalized_at,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id BIGINT UNSIGNED NULL AFTER deleted_at,
  ADD COLUMN IF NOT EXISTS status_updated_at DATETIME NULL AFTER deleted_by_user_id,
  ADD COLUMN IF NOT EXISTS status_updated_by_user_id BIGINT UNSIGNED NULL AFTER status_updated_at;

ALTER TABLE wristband_requests
  ADD CONSTRAINT fk_wristband_requests_deleted_by
    FOREIGN KEY (deleted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE wristband_requests
  ADD CONSTRAINT fk_wristband_requests_status_updated_by
    FOREIGN KEY (status_updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(120) NOT NULL,
  setting_value LONGTEXT NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_system_settings_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_templates (
  template_key VARCHAR(120) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html_content LONGTEXT NOT NULL,
  text_content LONGTEXT NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (template_key),
  CONSTRAINT fk_email_templates_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_token_hash (token_hash),
  KEY idx_password_reset_user_id (user_id),
  CONSTRAINT fk_password_reset_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;
