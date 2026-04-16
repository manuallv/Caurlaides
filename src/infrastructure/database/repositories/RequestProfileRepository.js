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
          rp.max_people,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.created_at,
          rp.updated_at
        FROM request_profiles rp
        WHERE rp.event_id = ?
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
          rp.access_code_hash,
          rp.max_people,
          rp.notes,
          rp.is_active,
          rp.locked_at,
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
          rp.access_code_hash,
          rp.max_people,
          rp.notes,
          rp.is_active,
          rp.locked_at,
          rp.created_at,
          rp.updated_at,
          e.name AS event_name,
          e.status AS event_status,
          e.pass_request_deadline,
          e.wristband_request_deadline
        FROM request_profiles rp
        INNER JOIN events e ON e.id = rp.event_id
        WHERE rp.public_slug = ?
        LIMIT 1
      `,
      [publicSlug],
    );

    return rows[0] || null;
  }

  async create(connection, payload) {
    const [result] = await connection.execute(
      `
        INSERT INTO request_profiles (
          event_id,
          name,
          public_slug,
          access_code_hash,
          max_people,
          notes,
          is_active,
          locked_at,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId,
        payload.name,
        payload.publicSlug,
        payload.accessCodeHash,
        payload.maxPeople,
        payload.notes,
        payload.isActive,
        payload.lockedAt || null,
        payload.userId,
        payload.userId,
      ],
    );

    return result.insertId;
  }

  async update(connection, profileId, payload) {
    await connection.execute(
      `
        UPDATE request_profiles
        SET
          name = ?,
          max_people = ?,
          notes = ?,
          is_active = ?,
          locked_at = ?,
          updated_by_user_id = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.maxPeople,
        payload.notes,
        payload.isActive,
        payload.lockedAt || null,
        payload.userId,
        profileId,
      ],
    );
  }

  async updateAccessCode(connection, profileId, payload) {
    await connection.execute(
      `
        UPDATE request_profiles
        SET
          access_code_hash = ?,
          updated_by_user_id = ?
        WHERE id = ?
      `,
      [payload.accessCodeHash, payload.userId, profileId],
    );
  }

  async delete(profileId) {
    await this.pool.execute('DELETE FROM request_profiles WHERE id = ?', [profileId]);
  }

  async replaceQuotas(connection, profileId, type, quotas = []) {
    const config = this.resolveQuotaConfig(type);

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
        ORDER BY c.sort_order ASC, c.name ASC
      `,
      [profileId],
    );

    return rows;
  }
}

module.exports = { RequestProfileRepository };
