SET @has_sessions_expires := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sessions'
    AND INDEX_NAME = 'idx_sessions_expires'
);

SET @sessions_expires_sql := IF(
  @has_sessions_expires = 0,
  'ALTER TABLE sessions ADD INDEX idx_sessions_expires (expires)',
  'SELECT 1'
);

PREPARE sessions_expires_stmt FROM @sessions_expires_sql;
EXECUTE sessions_expires_stmt;
DEALLOCATE PREPARE sessions_expires_stmt;

SET @has_pass_requests_profile_deleted_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pass_requests'
    AND INDEX_NAME = 'idx_pass_requests_profile_deleted_created'
);

SET @pass_requests_profile_deleted_created_sql := IF(
  @has_pass_requests_profile_deleted_created = 0,
  'ALTER TABLE pass_requests ADD INDEX idx_pass_requests_profile_deleted_created (request_profile_id, deleted_at, created_at, id)',
  'SELECT 1'
);

PREPARE pass_requests_profile_deleted_created_stmt FROM @pass_requests_profile_deleted_created_sql;
EXECUTE pass_requests_profile_deleted_created_stmt;
DEALLOCATE PREPARE pass_requests_profile_deleted_created_stmt;

SET @has_pass_requests_profile_category_deleted := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pass_requests'
    AND INDEX_NAME = 'idx_pass_requests_profile_category_deleted'
);

SET @pass_requests_profile_category_deleted_sql := IF(
  @has_pass_requests_profile_category_deleted = 0,
  'ALTER TABLE pass_requests ADD INDEX idx_pass_requests_profile_category_deleted (request_profile_id, pass_category_id, deleted_at)',
  'SELECT 1'
);

PREPARE pass_requests_profile_category_deleted_stmt FROM @pass_requests_profile_category_deleted_sql;
EXECUTE pass_requests_profile_category_deleted_stmt;
DEALLOCATE PREPARE pass_requests_profile_category_deleted_stmt;

SET @has_wristband_requests_profile_deleted_created := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wristband_requests'
    AND INDEX_NAME = 'idx_wristband_requests_profile_deleted_created'
);

SET @wristband_requests_profile_deleted_created_sql := IF(
  @has_wristband_requests_profile_deleted_created = 0,
  'ALTER TABLE wristband_requests ADD INDEX idx_wristband_requests_profile_deleted_created (request_profile_id, deleted_at, created_at, id)',
  'SELECT 1'
);

PREPARE wristband_requests_profile_deleted_created_stmt FROM @wristband_requests_profile_deleted_created_sql;
EXECUTE wristband_requests_profile_deleted_created_stmt;
DEALLOCATE PREPARE wristband_requests_profile_deleted_created_stmt;

SET @has_wristband_requests_profile_category_deleted := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wristband_requests'
    AND INDEX_NAME = 'idx_wristband_requests_profile_category_deleted'
);

SET @wristband_requests_profile_category_deleted_sql := IF(
  @has_wristband_requests_profile_category_deleted = 0,
  'ALTER TABLE wristband_requests ADD INDEX idx_wristband_requests_profile_category_deleted (request_profile_id, wristband_category_id, deleted_at)',
  'SELECT 1'
);

PREPARE wristband_requests_profile_category_deleted_stmt FROM @wristband_requests_profile_category_deleted_sql;
EXECUTE wristband_requests_profile_category_deleted_stmt;
DEALLOCATE PREPARE wristband_requests_profile_category_deleted_stmt;
