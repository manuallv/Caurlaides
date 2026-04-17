CREATE TABLE IF NOT EXISTS pass_category_entry_windows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pass_category_id BIGINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pass_category_entry_windows_category (pass_category_id),
  KEY idx_pass_category_entry_windows_start (start_at),
  KEY idx_pass_category_entry_windows_end (end_at),
  CONSTRAINT fk_pass_category_entry_windows_category
    FOREIGN KEY (pass_category_id) REFERENCES pass_categories (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;
