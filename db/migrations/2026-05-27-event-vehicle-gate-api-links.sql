CREATE TABLE IF NOT EXISTS event_vehicle_gate_api_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  token VARCHAR(16) NOT NULL,
  mode ENUM('check', 'toggle', 'entry', 'exit') NOT NULL DEFAULT 'check',
  debounce_seconds INT UNSIGNED NOT NULL DEFAULT 300,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id BIGINT UNSIGNED NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_vehicle_gate_api_links_token (token),
  KEY idx_event_vehicle_gate_api_links_event_id (event_id),
  CONSTRAINT fk_event_vehicle_gate_api_links_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_vehicle_gate_api_links_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_vehicle_gate_api_links_updated_by
    FOREIGN KEY (updated_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_vehicle_gate_api_link_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  link_id BIGINT UNSIGNED NOT NULL,
  pass_category_id BIGINT UNSIGNED NOT NULL,
  can_check TINYINT(1) NOT NULL DEFAULT 1,
  can_enter TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_vehicle_gate_api_link_category (link_id, pass_category_id),
  KEY idx_event_vehicle_gate_api_link_categories_category (pass_category_id),
  CONSTRAINT fk_event_vehicle_gate_api_link_categories_link
    FOREIGN KEY (link_id) REFERENCES event_vehicle_gate_api_links (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_vehicle_gate_api_link_categories_category
    FOREIGN KEY (pass_category_id) REFERENCES pass_categories (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_vehicle_gate_api_link_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  link_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  pass_request_id BIGINT UNSIGNED NULL,
  vehicle_plate VARCHAR(40) NULL,
  vehicle_plate_normalized VARCHAR(40) NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(80) NULL,
  mode ENUM('check', 'toggle', 'entry', 'exit') NOT NULL DEFAULT 'check',
  direction ENUM('check', 'entry', 'exit') NULL,
  deduplicated TINYINT(1) NOT NULL DEFAULT 0,
  movement_recorded TINYINT(1) NOT NULL DEFAULT 0,
  message VARCHAR(255) NULL,
  metadata LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_vehicle_gate_api_link_logs_link_created (link_id, created_at),
  KEY idx_event_vehicle_gate_api_link_logs_plate_created (link_id, vehicle_plate_normalized, created_at),
  KEY idx_event_vehicle_gate_api_link_logs_event_created (event_id, created_at),
  KEY idx_event_vehicle_gate_api_link_logs_request (pass_request_id),
  CONSTRAINT fk_event_vehicle_gate_api_link_logs_link
    FOREIGN KEY (link_id) REFERENCES event_vehicle_gate_api_links (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_vehicle_gate_api_link_logs_event
    FOREIGN KEY (event_id) REFERENCES events (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_event_vehicle_gate_api_link_logs_request
    FOREIGN KEY (pass_request_id) REFERENCES pass_requests (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB;
