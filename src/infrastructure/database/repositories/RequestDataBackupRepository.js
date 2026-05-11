const BACKUP_SOURCE_TABLES = [
  'request_profiles',
  'request_profile_pass_categories',
  'request_profile_wristband_categories',
  'request_profile_applications',
  'pass_requests',
  'wristband_requests',
];

const REQUEST_PROFILE_COLUMNS = [
  'id',
  'event_id',
  'name',
  'public_slug',
  'access_code',
  'access_code_hash',
  'max_people',
  'is_unlimited_quota',
  'contact_email',
  'contact_phone',
  'notify_contact_on_create',
  'notes',
  'is_active',
  'locked_at',
  'deleted_at',
  'deleted_by_user_id',
  'created_by_user_id',
  'updated_by_user_id',
  'created_at',
  'updated_at',
];

const REQUEST_PROFILE_APPLICATION_COLUMNS = [
  'id',
  'event_id',
  'status',
  'profile_name',
  'contact_email',
  'contact_phone',
  'notes',
  'requested_pass_quota',
  'requested_wristband_quota',
  'approved_profile_id',
  'reviewed_by_user_id',
  'reviewed_at',
  'rejection_reason',
  'created_at',
  'updated_at',
];

const PASS_REQUEST_COLUMNS = [
  'id',
  'event_id',
  'request_profile_id',
  'pass_category_id',
  'full_name',
  'company_name',
  'phone',
  'email',
  'vehicle_plate',
  'vehicle_plate_normalized',
  'notes',
  'status',
  'submitted_by_user_id',
  'handed_out_by_user_id',
  'returned_by_user_id',
  'handed_out_at',
  'returned_at',
  'finalized_at',
  'entered_at',
  'last_entry_at',
  'last_exit_at',
  'deleted_at',
  'deleted_by_user_id',
  'status_updated_at',
  'status_updated_by_user_id',
  'created_at',
  'updated_at',
];

const WRISTBAND_REQUEST_COLUMNS = [
  'id',
  'event_id',
  'request_profile_id',
  'wristband_category_id',
  'full_name',
  'company_name',
  'phone',
  'email',
  'notes',
  'status',
  'submitted_by_user_id',
  'handed_out_by_user_id',
  'returned_by_user_id',
  'handed_out_at',
  'returned_at',
  'finalized_at',
  'deleted_at',
  'deleted_by_user_id',
  'status_updated_at',
  'status_updated_by_user_id',
  'created_at',
  'updated_at',
];

const JSON_COLUMNS = new Set([
  'requested_pass_quota',
  'requested_wristband_quota',
]);

function parseSnapshot(value) {
  if (!value) {
    return {};
  }

  if (Buffer.isBuffer(value)) {
    return parseSnapshot(value.toString('utf8'));
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function serializeJsonColumn(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch (error) {
      return JSON.stringify(value);
    }
  }

  return JSON.stringify(value);
}

function normalizeValue(column, value) {
  if (value === undefined) {
    return null;
  }

  if (JSON_COLUMNS.has(column)) {
    return serializeJsonColumn(value);
  }

  return value;
}

function buildUpsertSql(tableName, columns, keyColumns = ['id']) {
  const columnSql = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const updateSql = columns
    .filter((column) => !keyColumns.includes(column))
    .map((column) => `${column} = VALUES(${column})`)
    .join(', ');

  return `
    INSERT INTO ${tableName} (${columnSql})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE ${updateSql}
  `;
}

function pickValues(snapshot, columns) {
  return columns.map((column) => normalizeValue(column, snapshot[column]));
}

function requireSnapshotFields(snapshot, fields, sourceTable) {
  const missingFields = fields.filter((field) => (
    snapshot[field] === undefined ||
    snapshot[field] === null ||
    snapshot[field] === ''
  ));

  if (missingFields.length) {
    throw new Error(`Backup snapshot for ${sourceTable} is missing: ${missingFields.join(', ')}`);
  }
}

function backupCurrentRequestProfileSql() {
  return `
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
      profile.id,
      CAST(profile.id AS CHAR),
      profile.event_id,
      profile.id,
      'restore_before',
      JSON_OBJECT(
        'id', profile.id,
        'event_id', profile.event_id,
        'name', profile.name,
        'public_slug', profile.public_slug,
        'contact_email', profile.contact_email,
        'contact_phone', profile.contact_phone,
        'access_code', profile.access_code,
        'access_code_hash', profile.access_code_hash,
        'max_people', profile.max_people,
        'is_unlimited_quota', profile.is_unlimited_quota,
        'notes', profile.notes,
        'notify_contact_on_create', profile.notify_contact_on_create,
        'is_active', profile.is_active,
        'locked_at', profile.locked_at,
        'deleted_at', profile.deleted_at,
        'deleted_by_user_id', profile.deleted_by_user_id,
        'created_by_user_id', profile.created_by_user_id,
        'updated_by_user_id', profile.updated_by_user_id,
        'created_at', profile.created_at,
        'updated_at', profile.updated_at
      )
    FROM request_profiles profile
    WHERE profile.id = ?
    LIMIT 1
  `;
}

function backupCurrentApplicationSql() {
  return `
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
      application.id,
      CAST(application.id AS CHAR),
      application.event_id,
      application.approved_profile_id,
      'restore_before',
      JSON_OBJECT(
        'id', application.id,
        'event_id', application.event_id,
        'status', application.status,
        'profile_name', application.profile_name,
        'contact_email', application.contact_email,
        'contact_phone', application.contact_phone,
        'notes', application.notes,
        'requested_pass_quota', application.requested_pass_quota,
        'requested_wristband_quota', application.requested_wristband_quota,
        'approved_profile_id', application.approved_profile_id,
        'reviewed_by_user_id', application.reviewed_by_user_id,
        'reviewed_at', application.reviewed_at,
        'rejection_reason', application.rejection_reason,
        'created_at', application.created_at,
        'updated_at', application.updated_at
      )
    FROM request_profile_applications application
    WHERE application.id = ?
    LIMIT 1
  `;
}

function backupCurrentPassRequestSql() {
  return `
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
      request.id,
      CAST(request.id AS CHAR),
      request.event_id,
      request.request_profile_id,
      'restore_before',
      JSON_OBJECT(
        'id', request.id,
        'event_id', request.event_id,
        'request_profile_id', request.request_profile_id,
        'pass_category_id', request.pass_category_id,
        'full_name', request.full_name,
        'company_name', request.company_name,
        'phone', request.phone,
        'email', request.email,
        'vehicle_plate', request.vehicle_plate,
        'vehicle_plate_normalized', request.vehicle_plate_normalized,
        'notes', request.notes,
        'status', request.status,
        'submitted_by_user_id', request.submitted_by_user_id,
        'handed_out_by_user_id', request.handed_out_by_user_id,
        'returned_by_user_id', request.returned_by_user_id,
        'handed_out_at', request.handed_out_at,
        'returned_at', request.returned_at,
        'finalized_at', request.finalized_at,
        'entered_at', request.entered_at,
        'last_entry_at', request.last_entry_at,
        'last_exit_at', request.last_exit_at,
        'deleted_at', request.deleted_at,
        'deleted_by_user_id', request.deleted_by_user_id,
        'status_updated_at', request.status_updated_at,
        'status_updated_by_user_id', request.status_updated_by_user_id,
        'created_at', request.created_at,
        'updated_at', request.updated_at
      )
    FROM pass_requests request
    WHERE request.id = ?
    LIMIT 1
  `;
}

function backupCurrentWristbandRequestSql() {
  return `
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
      request.id,
      CAST(request.id AS CHAR),
      request.event_id,
      request.request_profile_id,
      'restore_before',
      JSON_OBJECT(
        'id', request.id,
        'event_id', request.event_id,
        'request_profile_id', request.request_profile_id,
        'wristband_category_id', request.wristband_category_id,
        'full_name', request.full_name,
        'company_name', request.company_name,
        'phone', request.phone,
        'email', request.email,
        'notes', request.notes,
        'status', request.status,
        'submitted_by_user_id', request.submitted_by_user_id,
        'handed_out_by_user_id', request.handed_out_by_user_id,
        'returned_by_user_id', request.returned_by_user_id,
        'handed_out_at', request.handed_out_at,
        'returned_at', request.returned_at,
        'finalized_at', request.finalized_at,
        'deleted_at', request.deleted_at,
        'deleted_by_user_id', request.deleted_by_user_id,
        'status_updated_at', request.status_updated_at,
        'status_updated_by_user_id', request.status_updated_by_user_id,
        'created_at', request.created_at,
        'updated_at', request.updated_at
      )
    FROM wristband_requests request
    WHERE request.id = ?
    LIMIT 1
  `;
}

async function backupCurrentQuota(connection, tableName, profileId, categoryIdField, categoryId) {
  await connection.execute(
    `
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
        ?,
        NULL,
        CONCAT(quota.request_profile_id, ':', quota.${categoryIdField}),
        profile.event_id,
        quota.request_profile_id,
        'restore_before',
        JSON_OBJECT(
          'request_profile_id', quota.request_profile_id,
          '${categoryIdField}', quota.${categoryIdField},
          'quota', quota.quota
        )
      FROM ${tableName} quota
      LEFT JOIN request_profiles profile ON profile.id = quota.request_profile_id
      WHERE quota.request_profile_id = ?
        AND quota.${categoryIdField} = ?
      LIMIT 1
    `,
    [tableName, profileId, categoryId],
  );
}

async function backupCurrentRow(connection, backup) {
  const snapshot = backup.snapshot;

  switch (backup.source_table) {
    case 'request_profiles':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(backupCurrentRequestProfileSql(), [snapshot.id]);
      return;
    case 'request_profile_applications':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(backupCurrentApplicationSql(), [snapshot.id]);
      return;
    case 'pass_requests':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(backupCurrentPassRequestSql(), [snapshot.id]);
      return;
    case 'wristband_requests':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(backupCurrentWristbandRequestSql(), [snapshot.id]);
      return;
    case 'request_profile_pass_categories':
      requireSnapshotFields(snapshot, ['request_profile_id', 'pass_category_id'], backup.source_table);
      await backupCurrentQuota(
        connection,
        'request_profile_pass_categories',
        snapshot.request_profile_id,
        'pass_category_id',
        snapshot.pass_category_id,
      );
      return;
    case 'request_profile_wristband_categories':
      requireSnapshotFields(snapshot, ['request_profile_id', 'wristband_category_id'], backup.source_table);
      await backupCurrentQuota(
        connection,
        'request_profile_wristband_categories',
        snapshot.request_profile_id,
        'wristband_category_id',
        snapshot.wristband_category_id,
      );
      return;
    default:
      throw new Error(`Unsupported backup source: ${backup.source_table}`);
  }
}

async function restoreSnapshot(connection, backup) {
  const snapshot = backup.snapshot;

  switch (backup.source_table) {
    case 'request_profiles':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(
        buildUpsertSql('request_profiles', REQUEST_PROFILE_COLUMNS),
        pickValues(snapshot, REQUEST_PROFILE_COLUMNS),
      );
      return;
    case 'request_profile_applications':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(
        buildUpsertSql('request_profile_applications', REQUEST_PROFILE_APPLICATION_COLUMNS),
        pickValues(snapshot, REQUEST_PROFILE_APPLICATION_COLUMNS),
      );
      return;
    case 'pass_requests':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(
        buildUpsertSql('pass_requests', PASS_REQUEST_COLUMNS),
        pickValues(snapshot, PASS_REQUEST_COLUMNS),
      );
      return;
    case 'wristband_requests':
      requireSnapshotFields(snapshot, ['id'], backup.source_table);
      await connection.execute(
        buildUpsertSql('wristband_requests', WRISTBAND_REQUEST_COLUMNS),
        pickValues(snapshot, WRISTBAND_REQUEST_COLUMNS),
      );
      return;
    case 'request_profile_pass_categories':
      requireSnapshotFields(snapshot, ['request_profile_id', 'pass_category_id'], backup.source_table);
      await connection.execute(
        buildUpsertSql(
          'request_profile_pass_categories',
          ['request_profile_id', 'pass_category_id', 'quota'],
          ['request_profile_id', 'pass_category_id'],
        ),
        [
          snapshot.request_profile_id,
          snapshot.pass_category_id,
          snapshot.quota,
        ],
      );
      return;
    case 'request_profile_wristband_categories':
      requireSnapshotFields(snapshot, ['request_profile_id', 'wristband_category_id'], backup.source_table);
      await connection.execute(
        buildUpsertSql(
          'request_profile_wristband_categories',
          ['request_profile_id', 'wristband_category_id', 'quota'],
          ['request_profile_id', 'wristband_category_id'],
        ),
        [
          snapshot.request_profile_id,
          snapshot.wristband_category_id,
          snapshot.quota,
        ],
      );
      return;
    default:
      throw new Error(`Unsupported backup source: ${backup.source_table}`);
  }
}

class RequestDataBackupRepository {
  constructor(pool) {
    this.pool = pool;
  }

  getSourceTables() {
    return [...BACKUP_SOURCE_TABLES];
  }

  normalize(row) {
    if (!row) {
      return null;
    }

    return {
      ...row,
      snapshot: parseSnapshot(row.row_snapshot),
    };
  }

  async list(filters = {}) {
    const where = [];
    const params = [];
    const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);

    if (BACKUP_SOURCE_TABLES.includes(filters.sourceTable)) {
      where.push('backup.source_table = ?');
      params.push(filters.sourceTable);
    }

    if (filters.eventId) {
      where.push('backup.event_id = ?');
      params.push(filters.eventId);
    }

    if (filters.query) {
      where.push('(backup.source_key LIKE ? OR CAST(backup.row_snapshot AS CHAR) LIKE ?)');
      params.push(`%${filters.query}%`, `%${filters.query}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await this.pool.execute(
      `
        SELECT
          backup.id,
          backup.source_table,
          backup.source_id,
          backup.source_key,
          backup.event_id,
          backup.request_profile_id,
          backup.operation,
          backup.row_snapshot,
          backup.created_at,
          event.name AS event_name,
          profile.name AS current_profile_name
        FROM request_data_backups backup
        LEFT JOIN events event ON event.id = backup.event_id
        LEFT JOIN request_profiles profile ON profile.id = backup.request_profile_id
        ${whereSql}
        ORDER BY backup.created_at DESC, backup.id DESC
        LIMIT ?
      `,
      [...params, limit],
    );

    return rows.map((row) => this.normalize(row));
  }

  async findById(backupId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          source_table,
          source_id,
          source_key,
          event_id,
          request_profile_id,
          operation,
          row_snapshot,
          created_at
        FROM request_data_backups
        WHERE id = ?
        LIMIT 1
      `,
      [backupId],
    );

    return this.normalize(rows[0] || null);
  }

  async restore(backupId) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `
          SELECT
            id,
            source_table,
            source_id,
            source_key,
            event_id,
            request_profile_id,
            operation,
            row_snapshot,
            created_at
          FROM request_data_backups
          WHERE id = ?
          LIMIT 1
        `,
        [backupId],
      );
      const backup = this.normalize(rows[0] || null);

      if (!backup) {
        await connection.rollback();
        return null;
      }

      await backupCurrentRow(connection, backup);
      await restoreSnapshot(connection, backup);
      await connection.commit();

      return backup;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = { RequestDataBackupRepository };
