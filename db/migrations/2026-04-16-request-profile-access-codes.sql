SET @has_access_code := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'request_profiles'
    AND COLUMN_NAME = 'access_code'
);

SET @access_code_sql := IF(
  @has_access_code = 0,
  'ALTER TABLE request_profiles ADD COLUMN access_code VARCHAR(32) NULL AFTER public_slug',
  'SELECT 1'
);

PREPARE request_profile_access_code_stmt FROM @access_code_sql;
EXECUTE request_profile_access_code_stmt;
DEALLOCATE PREPARE request_profile_access_code_stmt;

SET @has_access_code_index := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'request_profiles'
    AND INDEX_NAME = 'uq_request_profiles_access_code'
);

SET @access_code_index_sql := IF(
  @has_access_code_index = 0,
  'ALTER TABLE request_profiles ADD UNIQUE KEY uq_request_profiles_access_code (access_code)',
  'SELECT 1'
);

PREPARE request_profile_access_code_index_stmt FROM @access_code_index_sql;
EXECUTE request_profile_access_code_index_stmt;
DEALLOCATE PREPARE request_profile_access_code_index_stmt;
