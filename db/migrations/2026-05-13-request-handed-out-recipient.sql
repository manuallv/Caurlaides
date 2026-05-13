SET @current_schema = DATABASE();

SET @pass_recipient_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @current_schema
    AND TABLE_NAME = 'pass_requests'
    AND COLUMN_NAME = 'handed_out_recipient_name'
);

SET @pass_recipient_column_sql = IF(
  @pass_recipient_column_exists = 0,
  'ALTER TABLE pass_requests ADD COLUMN handed_out_recipient_name VARCHAR(160) NULL AFTER handed_out_by_user_id',
  'DO 0'
);

PREPARE pass_recipient_column_stmt FROM @pass_recipient_column_sql;
EXECUTE pass_recipient_column_stmt;
DEALLOCATE PREPARE pass_recipient_column_stmt;

SET @wristband_recipient_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @current_schema
    AND TABLE_NAME = 'wristband_requests'
    AND COLUMN_NAME = 'handed_out_recipient_name'
);

SET @wristband_recipient_column_sql = IF(
  @wristband_recipient_column_exists = 0,
  'ALTER TABLE wristband_requests ADD COLUMN handed_out_recipient_name VARCHAR(160) NULL AFTER handed_out_by_user_id',
  'DO 0'
);

PREPARE wristband_recipient_column_stmt FROM @wristband_recipient_column_sql;
EXECUTE wristband_recipient_column_stmt;
DEALLOCATE PREPARE wristband_recipient_column_stmt;
