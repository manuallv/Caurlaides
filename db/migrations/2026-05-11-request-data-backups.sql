CREATE TABLE IF NOT EXISTS request_data_backups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_table VARCHAR(80) NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  source_key VARCHAR(160) NOT NULL,
  event_id BIGINT UNSIGNED NULL,
  request_profile_id BIGINT UNSIGNED NULL,
  operation VARCHAR(40) NOT NULL,
  row_snapshot JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_request_data_backups_source (source_table, source_key, created_at),
  KEY idx_request_data_backups_event_created (event_id, created_at),
  KEY idx_request_data_backups_profile_created (request_profile_id, created_at)
) ENGINE=InnoDB;

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'request_profiles',
  rp.id,
  CAST(rp.id AS CHAR),
  rp.event_id,
  rp.id,
  'baseline',
  JSON_OBJECT(
    'id', rp.id,
    'event_id', rp.event_id,
    'name', rp.name,
    'public_slug', rp.public_slug,
    'contact_email', rp.contact_email,
    'contact_phone', rp.contact_phone,
    'access_code', rp.access_code,
    'access_code_hash', rp.access_code_hash,
    'max_people', rp.max_people,
    'is_unlimited_quota', rp.is_unlimited_quota,
    'notes', rp.notes,
    'notify_contact_on_create', rp.notify_contact_on_create,
    'is_active', rp.is_active,
    'locked_at', rp.locked_at,
    'deleted_at', rp.deleted_at,
    'deleted_by_user_id', rp.deleted_by_user_id,
    'created_by_user_id', rp.created_by_user_id,
    'updated_by_user_id', rp.updated_by_user_id,
    'created_at', rp.created_at,
    'updated_at', rp.updated_at
  )
FROM request_profiles rp
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'request_profiles'
    AND backup.source_key = CAST(rp.id AS CHAR)
    AND backup.operation = 'baseline'
);

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'request_profile_pass_categories',
  NULL,
  CONCAT(q.request_profile_id, ':', q.pass_category_id),
  rp.event_id,
  q.request_profile_id,
  'baseline',
  JSON_OBJECT(
    'request_profile_id', q.request_profile_id,
    'pass_category_id', q.pass_category_id,
    'quota', q.quota
  )
FROM request_profile_pass_categories q
LEFT JOIN request_profiles rp ON rp.id = q.request_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'request_profile_pass_categories'
    AND backup.source_key = CONCAT(q.request_profile_id, ':', q.pass_category_id)
    AND backup.operation = 'baseline'
);

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'request_profile_wristband_categories',
  NULL,
  CONCAT(q.request_profile_id, ':', q.wristband_category_id),
  rp.event_id,
  q.request_profile_id,
  'baseline',
  JSON_OBJECT(
    'request_profile_id', q.request_profile_id,
    'wristband_category_id', q.wristband_category_id,
    'quota', q.quota
  )
FROM request_profile_wristband_categories q
LEFT JOIN request_profiles rp ON rp.id = q.request_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'request_profile_wristband_categories'
    AND backup.source_key = CONCAT(q.request_profile_id, ':', q.wristband_category_id)
    AND backup.operation = 'baseline'
);

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'request_profile_applications',
  rpa.id,
  CAST(rpa.id AS CHAR),
  rpa.event_id,
  rpa.approved_profile_id,
  'baseline',
  JSON_OBJECT(
    'id', rpa.id,
    'event_id', rpa.event_id,
    'status', rpa.status,
    'profile_name', rpa.profile_name,
    'contact_email', rpa.contact_email,
    'contact_phone', rpa.contact_phone,
    'notes', rpa.notes,
    'requested_pass_quota', rpa.requested_pass_quota,
    'requested_wristband_quota', rpa.requested_wristband_quota,
    'approved_profile_id', rpa.approved_profile_id,
    'reviewed_by_user_id', rpa.reviewed_by_user_id,
    'reviewed_at', rpa.reviewed_at,
    'rejection_reason', rpa.rejection_reason,
    'created_at', rpa.created_at,
    'updated_at', rpa.updated_at
  )
FROM request_profile_applications rpa
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'request_profile_applications'
    AND backup.source_key = CAST(rpa.id AS CHAR)
    AND backup.operation = 'baseline'
);

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'pass_requests',
  pr.id,
  CAST(pr.id AS CHAR),
  pr.event_id,
  pr.request_profile_id,
  'baseline',
  JSON_OBJECT(
    'id', pr.id,
    'event_id', pr.event_id,
    'request_profile_id', pr.request_profile_id,
    'pass_category_id', pr.pass_category_id,
    'full_name', pr.full_name,
    'company_name', pr.company_name,
    'phone', pr.phone,
    'email', pr.email,
    'vehicle_plate', pr.vehicle_plate,
    'vehicle_plate_normalized', pr.vehicle_plate_normalized,
    'notes', pr.notes,
    'status', pr.status,
    'submitted_by_user_id', pr.submitted_by_user_id,
    'handed_out_by_user_id', pr.handed_out_by_user_id,
    'returned_by_user_id', pr.returned_by_user_id,
    'handed_out_at', pr.handed_out_at,
    'returned_at', pr.returned_at,
    'finalized_at', pr.finalized_at,
    'entered_at', pr.entered_at,
    'last_entry_at', pr.last_entry_at,
    'last_exit_at', pr.last_exit_at,
    'deleted_at', pr.deleted_at,
    'deleted_by_user_id', pr.deleted_by_user_id,
    'status_updated_at', pr.status_updated_at,
    'status_updated_by_user_id', pr.status_updated_by_user_id,
    'created_at', pr.created_at,
    'updated_at', pr.updated_at
  )
FROM pass_requests pr
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'pass_requests'
    AND backup.source_key = CAST(pr.id AS CHAR)
    AND backup.operation = 'baseline'
);

INSERT INTO request_data_backups (
  source_table,
  source_id,
  source_key,
  event_id,
  request_profile_id,
  operation,
  row_snapshot
)
SELECT
  'wristband_requests',
  wr.id,
  CAST(wr.id AS CHAR),
  wr.event_id,
  wr.request_profile_id,
  'baseline',
  JSON_OBJECT(
    'id', wr.id,
    'event_id', wr.event_id,
    'request_profile_id', wr.request_profile_id,
    'wristband_category_id', wr.wristband_category_id,
    'full_name', wr.full_name,
    'company_name', wr.company_name,
    'phone', wr.phone,
    'email', wr.email,
    'notes', wr.notes,
    'status', wr.status,
    'submitted_by_user_id', wr.submitted_by_user_id,
    'handed_out_by_user_id', wr.handed_out_by_user_id,
    'returned_by_user_id', wr.returned_by_user_id,
    'handed_out_at', wr.handed_out_at,
    'returned_at', wr.returned_at,
    'finalized_at', wr.finalized_at,
    'deleted_at', wr.deleted_at,
    'deleted_by_user_id', wr.deleted_by_user_id,
    'status_updated_at', wr.status_updated_at,
    'status_updated_by_user_id', wr.status_updated_by_user_id,
    'created_at', wr.created_at,
    'updated_at', wr.updated_at
  )
FROM wristband_requests wr
WHERE NOT EXISTS (
  SELECT 1
  FROM request_data_backups backup
  WHERE backup.source_table = 'wristband_requests'
    AND backup.source_key = CAST(wr.id AS CHAR)
    AND backup.operation = 'baseline'
);
