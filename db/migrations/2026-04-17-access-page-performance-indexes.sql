SET @has_pass_requests_event_deleted_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pass_requests'
    AND INDEX_NAME = 'idx_pass_requests_event_deleted_created'
);

SET @pass_requests_event_deleted_created_sql := IF(
  @has_pass_requests_event_deleted_created = 0,
  'ALTER TABLE pass_requests ADD INDEX idx_pass_requests_event_deleted_created (event_id, deleted_at, created_at, id)',
  'SELECT 1'
);

PREPARE pass_requests_event_deleted_created_stmt FROM @pass_requests_event_deleted_created_sql;
EXECUTE pass_requests_event_deleted_created_stmt;
DEALLOCATE PREPARE pass_requests_event_deleted_created_stmt;

SET @has_wristband_requests_event_deleted_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wristband_requests'
    AND INDEX_NAME = 'idx_wristband_requests_event_deleted_created'
);

SET @wristband_requests_event_deleted_created_sql := IF(
  @has_wristband_requests_event_deleted_created = 0,
  'ALTER TABLE wristband_requests ADD INDEX idx_wristband_requests_event_deleted_created (event_id, deleted_at, created_at, id)',
  'SELECT 1'
);

PREPARE wristband_requests_event_deleted_created_stmt FROM @wristband_requests_event_deleted_created_sql;
EXECUTE wristband_requests_event_deleted_created_stmt;
DEALLOCATE PREPARE wristband_requests_event_deleted_created_stmt;

SET @has_request_profiles_event_deleted_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'request_profiles'
    AND INDEX_NAME = 'idx_request_profiles_event_deleted_created'
);

SET @request_profiles_event_deleted_created_sql := IF(
  @has_request_profiles_event_deleted_created = 0,
  'ALTER TABLE request_profiles ADD INDEX idx_request_profiles_event_deleted_created (event_id, deleted_at, created_at, name)',
  'SELECT 1'
);

PREPARE request_profiles_event_deleted_created_stmt FROM @request_profiles_event_deleted_created_sql;
EXECUTE request_profiles_event_deleted_created_stmt;
DEALLOCATE PREPARE request_profiles_event_deleted_created_stmt;

SET @has_pass_categories_event_deleted_sort := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pass_categories'
    AND INDEX_NAME = 'idx_pass_categories_event_deleted_sort'
);

SET @pass_categories_event_deleted_sort_sql := IF(
  @has_pass_categories_event_deleted_sort = 0,
  'ALTER TABLE pass_categories ADD INDEX idx_pass_categories_event_deleted_sort (event_id, deleted_at, sort_order, name)',
  'SELECT 1'
);

PREPARE pass_categories_event_deleted_sort_stmt FROM @pass_categories_event_deleted_sort_sql;
EXECUTE pass_categories_event_deleted_sort_stmt;
DEALLOCATE PREPARE pass_categories_event_deleted_sort_stmt;

SET @has_wristband_categories_event_deleted_sort := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wristband_categories'
    AND INDEX_NAME = 'idx_wristband_categories_event_deleted_sort'
);

SET @wristband_categories_event_deleted_sort_sql := IF(
  @has_wristband_categories_event_deleted_sort = 0,
  'ALTER TABLE wristband_categories ADD INDEX idx_wristband_categories_event_deleted_sort (event_id, deleted_at, sort_order, name)',
  'SELECT 1'
);

PREPARE wristband_categories_event_deleted_sort_stmt FROM @wristband_categories_event_deleted_sort_sql;
EXECUTE wristband_categories_event_deleted_sort_stmt;
DEALLOCATE PREPARE wristband_categories_event_deleted_sort_stmt;
