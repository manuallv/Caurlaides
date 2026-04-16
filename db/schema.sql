CREATE DATABASE IF NOT EXISTS `caurlaides`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `caurlaides`;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  location VARCHAR(190) NOT NULL,
  status ENUM('draft', 'active', 'completed', 'archived') NOT NULL DEFAULT 'draft',
  pass_request_deadline DATETIME NULL,
  wristband_request_deadline DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_owner_id (owner_id),
  KEY idx_events_status (status),
  CONSTRAINT fk_events_owner
    FOREIGN KEY (owner_id) REFERENCES users (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner', 'admin', 'staff') NOT NULL DEFAULT 'staff',
  invited_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_users_event_user (event_id, user_id),
  KEY idx_event_users_user_id (user_id),
  CONSTRAINT fk_event_users_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_users_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_users_invited_by
    FOREIGN KEY (invited_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pass_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  quota INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pass_categories_event_id (event_id),
  CONSTRAINT fk_pass_categories_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_categories_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_categories_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wristband_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  quota INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wristband_categories_event_id (event_id),
  CONSTRAINT fk_wristband_categories_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_categories_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_categories_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  public_slug CHAR(36) NOT NULL,
  access_code_hash VARCHAR(255) NOT NULL,
  max_people INT UNSIGNED NOT NULL DEFAULT 1,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  locked_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_profiles_public_slug (public_slug),
  KEY idx_request_profiles_event_id (event_id),
  CONSTRAINT fk_request_profiles_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_request_profiles_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_request_profiles_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_profile_pass_categories (
  request_profile_id BIGINT UNSIGNED NOT NULL,
  pass_category_id BIGINT UNSIGNED NOT NULL,
  quota INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (request_profile_id, pass_category_id),
  CONSTRAINT fk_profile_pass_categories_profile
    FOREIGN KEY (request_profile_id) REFERENCES request_profiles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_profile_pass_categories_category
    FOREIGN KEY (pass_category_id) REFERENCES pass_categories (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_profile_wristband_categories (
  request_profile_id BIGINT UNSIGNED NOT NULL,
  wristband_category_id BIGINT UNSIGNED NOT NULL,
  quota INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (request_profile_id, wristband_category_id),
  CONSTRAINT fk_profile_wristband_categories_profile
    FOREIGN KEY (request_profile_id) REFERENCES request_profiles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_profile_wristband_categories_category
    FOREIGN KEY (wristband_category_id) REFERENCES wristband_categories (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pass_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  request_profile_id BIGINT UNSIGNED NULL,
  pass_category_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  company_name VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,
  status ENUM('pending', 'approved', 'rejected', 'handed_out', 'returned', 'finalized') NOT NULL DEFAULT 'pending',
  submitted_by_user_id BIGINT UNSIGNED NULL,
  handed_out_by_user_id BIGINT UNSIGNED NULL,
  returned_by_user_id BIGINT UNSIGNED NULL,
  handed_out_at DATETIME NULL,
  returned_at DATETIME NULL,
  finalized_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pass_requests_event_status (event_id, status),
  KEY idx_pass_requests_profile_id (request_profile_id),
  CONSTRAINT fk_pass_requests_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_requests_profile
    FOREIGN KEY (request_profile_id) REFERENCES request_profiles (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_requests_category
    FOREIGN KEY (pass_category_id) REFERENCES pass_categories (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_requests_submitted_by
    FOREIGN KEY (submitted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_requests_handed_out_by
    FOREIGN KEY (handed_out_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_pass_requests_returned_by
    FOREIGN KEY (returned_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wristband_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  request_profile_id BIGINT UNSIGNED NULL,
  wristband_category_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  company_name VARCHAR(160) NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  notes TEXT NULL,
  status ENUM('pending', 'approved', 'rejected', 'handed_out', 'returned', 'finalized') NOT NULL DEFAULT 'pending',
  submitted_by_user_id BIGINT UNSIGNED NULL,
  handed_out_by_user_id BIGINT UNSIGNED NULL,
  returned_by_user_id BIGINT UNSIGNED NULL,
  handed_out_at DATETIME NULL,
  returned_at DATETIME NULL,
  finalized_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wristband_requests_event_status (event_id, status),
  KEY idx_wristband_requests_profile_id (request_profile_id),
  CONSTRAINT fk_wristband_requests_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_requests_profile
    FOREIGN KEY (request_profile_id) REFERENCES request_profiles (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_requests_category
    FOREIGN KEY (wristband_category_id) REFERENCES wristband_categories (id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_requests_submitted_by
    FOREIGN KEY (submitted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_requests_handed_out_by
    FOREIGN KEY (handed_out_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_wristband_requests_returned_by
    FOREIGN KEY (returned_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  message VARCHAR(255) NOT NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_event_created (event_id, created_at),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_logs_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;
