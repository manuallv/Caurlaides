const { DEFAULT_LOCALE, normalizeLocale } = require('../../../shared/i18n');

const QUOTA_CONFIG = {
  pass: {
    table: 'request_profile_pass_categories',
    categoryTable: 'pass_categories',
    categoryIdField: 'pass_category_id',
  },
  wristband: {
    table: 'request_profile_wristband_categories',
    categoryTable: 'wristband_categories',
    categoryIdField: 'wristband_category_id',
  },
};

function normalizeStoredLocale(locale) {
  return normalizeLocale(locale) || DEFAULT_LOCALE;
}

function buildRequestProfileBackupSnapshot() {
  return `
        JSON_OBJECT(
          'id', profile.id,
          'event_id', profile.event_id,
          'name', profile.name,
          'public_slug', profile.public_slug,
          'contact_email', profile.contact_email,
          'contact_phone', profile.contact_phone,
          'preferred_locale', profile.preferred_locale,
          'access_code', profile.access_code,
          'access_code_hash', profile.access_code_hash,
          'max_people', profile.max_people,
          'is_unlimited_quota', profile.is_unlimited_quota,
          'allow_duplicate_vehicle_plates', profile.allow_duplicate_vehicle_plates,
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
  `;
}

async function backupRequestProfileRow(executor, profileId, operation) {
  await executor.execute(
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
        'request_profiles',
        profile.id,
        CAST(profile.id AS CHAR),
        profile.event_id,
        profile.id,
        ?,
        ${buildRequestProfileBackupSnapshot()}
      FROM request_profiles profile
      WHERE profile.id = ?
      LIMIT 1
    `,
    [operation, profileId],
  );
}

async function backupRequestProfileQuotaRows(executor, config, profileId, operation) {
  await executor.execute(
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
        CONCAT(quota.request_profile_id, ':', quota.${config.categoryIdField}),
        profile.event_id,
        quota.request_profile_id,
        ?,
        JSON_OBJECT(
          'request_profile_id', quota.request_profile_id,
          '${config.categoryIdField}', quota.${config.categoryIdField},
          'quota', quota.quota
        )
      FROM ${config.table} quota
      LEFT JOIN request_profiles profile ON profile.id = quota.request_profile_id
      WHERE quota.request_profile_id = ?
    `,
    [config.table, operation, profileId],
  );
}

class RequestProfileRepository {
  constructor(pool) {
    this.pool = pool;
  }

  resolveQuotaConfig(type) {
    const config = QUOTA_CONFIG[type];

    if (!config) {
      throw new Error(`Unsupported quota type: ${type}`);
    }

    return config;
  }

  async listByEvent(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.event_id = ?
          AND rp.deleted_at IS NULL
        ORDER BY rp.created_at DESC, rp.name ASC
      `,
      [eventId],
    );

    return rows;
  }

  async listOptionsByEvent(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.name,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale
        FROM request_profiles rp
        WHERE rp.event_id = ?
          AND rp.deleted_at IS NULL
        ORDER BY rp.created_at DESC, rp.name ASC
      `,
      [eventId],
    );

    return rows;
  }

  async findById(profileId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.id = ?
          AND rp.deleted_at IS NULL
        LIMIT 1
      `,
      [profileId],
    );

    return rows[0] || null;
  }

  async findByEventIdentity(eventId, payload = {}) {
    const matchNameOnly = Boolean(payload.matchNameOnly);

    if (!payload.name || (!matchNameOnly && !payload.contactEmail)) {
      return null;
    }

    const emailCondition = matchNameOnly
      ? ''
      : "AND LOWER(TRIM(COALESCE(rp.contact_email, ''))) = LOWER(TRIM(?))";
    const excludeCondition = payload.excludeProfileId ? 'AND rp.id <> ?' : '';
    const params = [
      eventId,
      payload.name,
    ];

    if (!matchNameOnly) {
      params.push(payload.contactEmail);
    }

    if (payload.excludeProfileId) {
      params.push(payload.excludeProfileId);
    }

    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.event_id = ?
          AND rp.deleted_at IS NULL
          AND LOWER(TRIM(rp.name)) = LOWER(TRIM(?))
          ${emailCondition}
          ${excludeCondition}
        ORDER BY rp.is_active DESC, rp.created_at ASC, rp.id ASC
        LIMIT 1
      `,
      params,
    );

    return rows[0] || null;
  }

  async findAnyById(profileId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.id = ?
        LIMIT 1
      `,
      [profileId],
    );

    return rows[0] || null;
  }

  async findBySlug(publicSlug) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at,
          e.name AS event_name,
          e.status AS event_status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.allow_duplicate_vehicle_plates AS event_allow_duplicate_vehicle_plates
        FROM request_profiles rp
        INNER JOIN events e ON e.id = rp.event_id
        WHERE rp.public_slug = ?
          AND rp.deleted_at IS NULL
        LIMIT 1
      `,
      [publicSlug],
    );

    return rows[0] || null;
  }

  async findPortalById(profileId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at,
          e.name AS event_name,
          e.status AS event_status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.allow_duplicate_vehicle_plates AS event_allow_duplicate_vehicle_plates
        FROM request_profiles rp
        INNER JOIN events e ON e.id = rp.event_id
        WHERE rp.id = ?
          AND rp.deleted_at IS NULL
        LIMIT 1
      `,
      [profileId],
    );

    return rows[0] || null;
  }

  async listActivePortals() {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at,
          e.name AS event_name,
          e.status AS event_status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.allow_duplicate_vehicle_plates AS event_allow_duplicate_vehicle_plates
        FROM request_profiles rp
        INNER JOIN events e ON e.id = rp.event_id
        WHERE rp.is_active = 1
          AND rp.deleted_at IS NULL
        ORDER BY rp.updated_at DESC, rp.id DESC
      `,
    );

    return rows;
  }

  async create(connection, payload) {
    const values = [
      payload.eventId,
      payload.name,
      payload.publicSlug,
      payload.accessCode,
      payload.accessCodeHash,
      payload.maxPeople,
      payload.isUnlimitedQuota ? 1 : 0,
      payload.allowDuplicateVehiclePlates ? 1 : 0,
      payload.contactEmail || null,
      payload.contactPhone || null,
      normalizeStoredLocale(payload.preferredLocale),
      payload.notifyContactOnCreate ? 1 : 0,
      payload.notes,
      payload.isActive,
      payload.lockedAt || null,
      payload.userId,
      payload.userId,
    ];

    const [result] = await connection.execute(
      `
        INSERT INTO request_profiles (
          event_id,
          name,
          public_slug,
          access_code,
          access_code_hash,
          max_people,
          is_unlimited_quota,
          allow_duplicate_vehicle_plates,
          contact_email,
          contact_phone,
          preferred_locale,
          notify_contact_on_create,
          notes,
          is_active,
          locked_at,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      values,
    );

    await backupRequestProfileRow(connection, result.insertId, 'insert');
    return result.insertId;
  }

  async update(connection, profileId, payload) {
    await backupRequestProfileRow(connection, profileId, 'update_before');
    await connection.execute(
      `
        UPDATE request_profiles
        SET
          name = ?,
          max_people = ?,
          is_unlimited_quota = ?,
          allow_duplicate_vehicle_plates = ?,
          contact_email = ?,
          contact_phone = ?,
          preferred_locale = ?,
          notify_contact_on_create = ?,
          notes = ?,
          is_active = ?,
          locked_at = ?,
          updated_by_user_id = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.maxPeople,
        payload.isUnlimitedQuota ? 1 : 0,
        payload.allowDuplicateVehiclePlates ? 1 : 0,
        payload.contactEmail || null,
        payload.contactPhone || null,
        normalizeStoredLocale(payload.preferredLocale),
        payload.notifyContactOnCreate ? 1 : 0,
        payload.notes,
        payload.isActive,
        payload.lockedAt || null,
        payload.userId,
        profileId,
      ],
    );
  }

  async updateAccessCode(connection, profileId, payload) {
    await backupRequestProfileRow(connection, profileId, 'access_code_before');
    await connection.execute(
      `
        UPDATE request_profiles
        SET
          access_code = ?,
          access_code_hash = ?,
          updated_by_user_id = ?
        WHERE id = ?
      `,
      [payload.accessCode, payload.accessCodeHash, payload.userId, profileId],
    );
  }

  async updatePreferredLocale(profileId, preferredLocale) {
    await this.pool.execute(
      `
        UPDATE request_profiles
        SET preferred_locale = ?
        WHERE id = ?
          AND deleted_at IS NULL
      `,
      [normalizeStoredLocale(preferredLocale), profileId],
    );
  }

  async findByAccessCode(accessCode) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.access_code = ?
          AND rp.deleted_at IS NULL
        LIMIT 1
      `,
      [accessCode],
    );

    return rows[0] || null;
  }

  async findActivePortalByAccessCode(accessCode) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          rp.id,
          rp.event_id,
          rp.name,
          rp.public_slug,
          rp.access_code,
          rp.access_code_hash,
          rp.max_people,
          rp.is_unlimited_quota,
          rp.allow_duplicate_vehicle_plates,
          rp.contact_email,
          rp.contact_phone,
          rp.preferred_locale,
          rp.notify_contact_on_create,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.deleted_at,
          rp.created_at,
          rp.updated_at,
          e.name AS event_name,
          e.status AS event_status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.allow_duplicate_vehicle_plates AS event_allow_duplicate_vehicle_plates
        FROM request_profiles rp
        INNER JOIN events e ON e.id = rp.event_id
        WHERE rp.access_code = ?
          AND rp.is_active = 1
          AND rp.deleted_at IS NULL
        LIMIT 1
      `,
      [accessCode],
    );

    return rows[0] || null;
  }

  async delete(profileId, userId) {
    await backupRequestProfileRow(this.pool, profileId, 'delete_before');
    await this.pool.execute(
      `
        UPDATE request_profiles
        SET
          deleted_at = NOW(),
          deleted_by_user_id = ?,
          is_active = 0
        WHERE id = ?
      `,
      [userId, profileId],
    );
  }

  async restore(profileId) {
    await backupRequestProfileRow(this.pool, profileId, 'restore_before');
    await this.pool.execute(
      `
        UPDATE request_profiles
        SET
          deleted_at = NULL,
          deleted_by_user_id = NULL,
          is_active = 1
        WHERE id = ?
      `,
      [profileId],
    );
  }

  async replaceQuotas(connection, profileId, type, quotas = []) {
    const config = this.resolveQuotaConfig(type);

    await backupRequestProfileQuotaRows(connection, config, profileId, 'delete_before');
    await connection.execute(`DELETE FROM ${config.table} WHERE request_profile_id = ?`, [profileId]);

    if (!quotas.length) {
      return;
    }

    const placeholders = quotas.map(() => '(?, ?, ?)').join(', ');
    const values = quotas.flatMap((quota) => [profileId, quota.categoryId, quota.quota]);

    await connection.execute(
      `
        INSERT INTO ${config.table} (request_profile_id, ${config.categoryIdField}, quota)
        VALUES ${placeholders}
      `,
      values,
    );

    await backupRequestProfileQuotaRows(connection, config, profileId, 'insert');
  }

  async listQuotasByProfile(profileId, type) {
    const config = this.resolveQuotaConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          q.${config.categoryIdField} AS category_id,
          q.quota,
          c.name AS category_name,
          c.is_active,
          c.sort_order
        FROM ${config.table} q
        INNER JOIN ${config.categoryTable} c ON c.id = q.${config.categoryIdField}
        WHERE q.request_profile_id = ?
          AND c.deleted_at IS NULL
        ORDER BY c.sort_order ASC, c.name ASC
      `,
      [profileId],
    );

    return rows;
  }
}

module.exports = { RequestProfileRepository };
