const REQUEST_CONFIG = {
  pass: {
    requestTable: 'pass_requests',
    categoryTable: 'pass_categories',
    quotaTable: 'request_profile_pass_categories',
    categoryIdField: 'pass_category_id',
    label: 'pass',
  },
  wristband: {
    requestTable: 'wristband_requests',
    categoryTable: 'wristband_categories',
    quotaTable: 'request_profile_wristband_categories',
    categoryIdField: 'wristband_category_id',
    label: 'wristband',
  },
};

class RequestRepository {
  constructor(pool) {
    this.pool = pool;
  }

  resolveConfig(type) {
    const config = REQUEST_CONFIG[type];

    if (!config) {
      throw new Error(`Unsupported request type: ${type}`);
    }

    return config;
  }

  async listAdminRequests(eventId, type, filters = {}) {
    const config = this.resolveConfig(type);
    const where = ['request.event_id = ?', 'request.deleted_at IS NULL', 'category.deleted_at IS NULL'];
    const params = [eventId];
    const orderDirection = filters.sort === 'oldest' ? 'ASC' : 'DESC';

    if (filters.status) {
      where.push('request.status = ?');
      params.push(filters.status);
    }

    if (filters.categoryId) {
      where.push(`request.${config.categoryIdField} = ?`);
      params.push(filters.categoryId);
    }

    if (filters.profileId) {
      where.push('request.request_profile_id = ?');
      params.push(filters.profileId);
    }

    if (filters.company) {
      where.push('request.company_name LIKE ?');
      params.push(`%${filters.company}%`);
    }

    if (filters.query) {
      where.push(
        `(
          request.full_name LIKE ?
          OR request.phone LIKE ?
          OR request.email LIKE ?
          OR request.company_name LIKE ?
          OR request.notes LIKE ?
          OR profile.name LIKE ?
          OR category.name LIKE ?
        )`,
      );

      const like = `%${filters.query}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const [rows] = await this.pool.execute(
      `
        SELECT
          request.id,
          request.event_id,
          request.request_profile_id,
          request.${config.categoryIdField} AS category_id,
          request.full_name,
          request.company_name,
          request.phone,
          request.email,
          request.notes,
          request.status,
          request.handed_out_at,
          request.status_updated_at,
          request.created_at,
          request.updated_at,
          profile.name AS profile_name,
          profile.public_slug,
          category.name AS category_name,
          handed_out_by.full_name AS handed_out_by_name,
          status_updated_by.full_name AS status_updated_by_name
        FROM ${config.requestTable} request
        INNER JOIN ${config.categoryTable} category ON category.id = request.${config.categoryIdField}
        LEFT JOIN request_profiles profile ON profile.id = request.request_profile_id AND profile.deleted_at IS NULL
        LEFT JOIN users handed_out_by ON handed_out_by.id = request.handed_out_by_user_id
        LEFT JOIN users status_updated_by ON status_updated_by.id = request.status_updated_by_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY
          request.created_at ${orderDirection},
          request.id ${orderDirection}
      `,
      params,
    );

    return rows;
  }

  async getAdminSummary(eventId, type) {
    const config = this.resolveConfig(type);
    const [[totals]] = await this.pool.execute(
      `
        SELECT
          COUNT(*) AS total_requests,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
          SUM(CASE WHEN status = 'handed_out' THEN 1 ELSE 0 END) AS handed_out_requests
        FROM ${config.requestTable}
        WHERE event_id = ?
          AND deleted_at IS NULL
      `,
      [eventId],
    );

    return {
      totalRequests: Number(totals.total_requests || 0),
      pendingRequests: Number(totals.pending_requests || 0),
      handedOutRequests: Number(totals.handed_out_requests || 0),
    };
  }

  async listCategoryRequestCounts(eventId, type) {
    const config = this.resolveConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          category.id AS category_id,
          COUNT(request.id) AS total_requests,
          SUM(CASE WHEN request.status = 'handed_out' THEN 1 ELSE 0 END) AS handed_out_requests
        FROM ${config.categoryTable} category
        LEFT JOIN ${config.requestTable} request
          ON request.${config.categoryIdField} = category.id
         AND request.event_id = category.event_id
         AND request.deleted_at IS NULL
        WHERE category.event_id = ?
          AND category.deleted_at IS NULL
        GROUP BY category.id, category.sort_order, category.name
        ORDER BY category.sort_order ASC, category.name ASC
      `,
      [eventId],
    );

    return rows.map((row) => ({
      category_id: Number(row.category_id),
      total_requests: Number(row.total_requests || 0),
      handed_out_requests: Number(row.handed_out_requests || 0),
    }));
  }

  async findById(type, requestId) {
    const config = this.resolveConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          request.*,
          profile.name AS profile_name,
          profile.public_slug,
          category.name AS category_name
        FROM ${config.requestTable} request
        LEFT JOIN request_profiles profile ON profile.id = request.request_profile_id
        LEFT JOIN ${config.categoryTable} category ON category.id = request.${config.categoryIdField}
        WHERE request.id = ?
          AND request.deleted_at IS NULL
        LIMIT 1
      `,
      [requestId],
    );

    return rows[0] || null;
  }

  async findAnyById(type, requestId) {
    const config = this.resolveConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          request.*,
          profile.name AS profile_name,
          profile.public_slug,
          category.name AS category_name
        FROM ${config.requestTable} request
        LEFT JOIN request_profiles profile ON profile.id = request.request_profile_id
        LEFT JOIN ${config.categoryTable} category ON category.id = request.${config.categoryIdField}
        WHERE request.id = ?
        LIMIT 1
      `,
      [requestId],
    );

    return rows[0] || null;
  }

  async create(connection, type, payload) {
    const config = this.resolveConfig(type);
    const [result] = await connection.execute(
      `
        INSERT INTO ${config.requestTable} (
          event_id,
          request_profile_id,
          ${config.categoryIdField},
          full_name,
          company_name,
          phone,
          email,
          notes,
          status,
          status_updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
      `,
      [
        payload.eventId,
        payload.requestProfileId,
        payload.categoryId,
        payload.fullName,
        payload.companyName,
        payload.phone,
        payload.email,
        payload.notes,
      ],
    );

    return result.insertId;
  }

  async update(connection, type, requestId, payload) {
    const config = this.resolveConfig(type);
    await connection.execute(
      `
        UPDATE ${config.requestTable}
        SET
          request_profile_id = ?,
          ${config.categoryIdField} = ?,
          full_name = ?,
          company_name = ?,
          phone = ?,
          email = ?,
          notes = ?
        WHERE id = ?
      `,
      [
        payload.requestProfileId || null,
        payload.categoryId,
        payload.fullName,
        payload.companyName,
        payload.phone,
        payload.email,
        payload.notes,
        requestId,
      ],
    );
  }

  async delete(connection, type, requestId) {
    return this.softDelete(connection, type, requestId, null);
  }

  async softDelete(connection, type, requestId, userId = null) {
    const config = this.resolveConfig(type);
    await connection.execute(
      `
        UPDATE ${config.requestTable}
        SET
          deleted_at = NOW(),
          deleted_by_user_id = ?
        WHERE id = ?
      `,
      [userId, requestId],
    );
  }

  async restore(type, requestId) {
    const config = this.resolveConfig(type);
    await this.pool.execute(
      `
        UPDATE ${config.requestTable}
        SET
          deleted_at = NULL,
          deleted_by_user_id = NULL
        WHERE id = ?
      `,
      [requestId],
    );
  }

  async setStatus(type, requestId, payload) {
    const config = this.resolveConfig(type);

    if (payload.status === 'handed_out') {
      await this.pool.execute(
        `
          UPDATE ${config.requestTable}
          SET
            status = 'handed_out',
            handed_out_at = NOW(),
            handed_out_by_user_id = ?,
            status_updated_at = NOW(),
            status_updated_by_user_id = ?
          WHERE id = ?
        `,
        [payload.userId, payload.userId, requestId],
      );
      return;
    }

    await this.pool.execute(
      `
        UPDATE ${config.requestTable}
        SET
          status = 'pending',
          handed_out_at = NULL,
          handed_out_by_user_id = NULL,
          status_updated_at = NOW(),
          status_updated_by_user_id = ?
        WHERE id = ?
      `,
      [payload.userId, requestId],
    );
  }

  async listProfileRequests(profileId, type) {
    const config = this.resolveConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          request.id,
          request.request_profile_id,
          request.${config.categoryIdField} AS category_id,
          request.full_name,
          request.company_name,
          request.phone,
          request.email,
          request.notes,
          request.status,
          request.handed_out_at,
          request.status_updated_at,
          request.created_at,
          request.updated_at,
          category.name AS category_name
        FROM ${config.requestTable} request
        INNER JOIN ${config.categoryTable} category ON category.id = request.${config.categoryIdField}
        WHERE request.request_profile_id = ?
          AND request.deleted_at IS NULL
          AND category.deleted_at IS NULL
        ORDER BY FIELD(request.status, 'pending', 'handed_out'), request.created_at DESC, request.id DESC
      `,
      [profileId],
    );

    return rows;
  }

  async countUsedQuota(profileId, type, categoryId, excludeRequestId = null) {
    const config = this.resolveConfig(type);
    const params = [profileId, categoryId];
    let exclusionClause = '';

    if (excludeRequestId) {
      exclusionClause = 'AND id != ?';
      params.push(excludeRequestId);
    }

    const [[row]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS used_count
        FROM ${config.requestTable}
        WHERE request_profile_id = ?
          AND ${config.categoryIdField} = ?
          AND deleted_at IS NULL
          ${exclusionClause}
      `,
      params,
    );

    return Number(row.used_count || 0);
  }

  async listQuotaUsage(profileId, type) {
    const config = this.resolveConfig(type);
    const [rows] = await this.pool.execute(
      `
        SELECT
          quota.${config.categoryIdField} AS category_id,
          quota.quota,
          category.name AS category_name,
          COUNT(request.id) AS used_count
        FROM ${config.quotaTable} quota
        INNER JOIN ${config.categoryTable} category ON category.id = quota.${config.categoryIdField}
        LEFT JOIN ${config.requestTable} request
          ON request.request_profile_id = quota.request_profile_id
         AND request.${config.categoryIdField} = quota.${config.categoryIdField}
         AND request.deleted_at IS NULL
        WHERE quota.request_profile_id = ?
          AND category.deleted_at IS NULL
        GROUP BY quota.${config.categoryIdField}, quota.quota, category.name, category.sort_order
        ORDER BY category.sort_order ASC, category.name ASC
      `,
      [profileId],
    );

    return rows.map((row) => ({
      ...row,
      quota: Number(row.quota || 0),
      used_count: Number(row.used_count || 0),
    }));
  }
}

module.exports = { RequestRepository };
