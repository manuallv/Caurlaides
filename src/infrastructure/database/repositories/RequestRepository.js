const REQUEST_CONFIG = {
  pass: {
    requestTable: 'pass_requests',
    categoryTable: 'pass_categories',
    quotaTable: 'request_profile_pass_categories',
    categoryIdField: 'pass_category_id',
    label: 'pass',
    supportsVehiclePlate: true,
  },
  wristband: {
    requestTable: 'wristband_requests',
    categoryTable: 'wristband_categories',
    quotaTable: 'request_profile_wristband_categories',
    categoryIdField: 'wristband_category_id',
    label: 'wristband',
    supportsVehiclePlate: false,
  },
};

function buildVehiclePlateSelect(config, alias = 'request') {
  if (config.supportsVehiclePlate) {
    return `
      ${alias}.vehicle_plate,
      ${alias}.vehicle_plate_normalized,
      ${alias}.entered_at,
      ${alias}.last_entry_at,
      ${alias}.last_exit_at
    `;
  }

  return `
    NULL AS vehicle_plate,
    NULL AS vehicle_plate_normalized,
    NULL AS entered_at,
    NULL AS last_entry_at,
    NULL AS last_exit_at
  `;
}

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
    const searchColumns = [
      'request.full_name',
      'request.phone',
      'request.email',
      'request.company_name',
      'request.notes',
      'profile.name',
      'category.name',
    ];

    if (config.supportsVehiclePlate) {
      searchColumns.push('request.vehicle_plate');
    }

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
      where.push(`(${searchColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`);

      const like = `%${filters.query}%`;
      params.push(...searchColumns.map(() => like));
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
          ${buildVehiclePlateSelect(config)},
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
          request.*
          ${config.supportsVehiclePlate ? '' : `,
          NULL AS vehicle_plate,
          NULL AS vehicle_plate_normalized,
          NULL AS entered_at,
          NULL AS last_entry_at,
          NULL AS last_exit_at`}
          ,
          request.${config.categoryIdField} AS category_id,
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
          request.*
          ${config.supportsVehiclePlate ? '' : `,
          NULL AS vehicle_plate,
          NULL AS vehicle_plate_normalized,
          NULL AS entered_at,
          NULL AS last_entry_at,
          NULL AS last_exit_at`}
          ,
          request.${config.categoryIdField} AS category_id,
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

    if (config.supportsVehiclePlate) {
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
            vehicle_plate,
            vehicle_plate_normalized,
            notes,
            status,
            status_updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
        `,
        [
          payload.eventId,
          payload.requestProfileId,
          payload.categoryId,
          payload.fullName,
          payload.companyName,
          payload.phone,
          payload.email,
          payload.vehiclePlate || null,
          payload.vehiclePlateNormalized || null,
          payload.notes,
        ],
      );

      return result.insertId;
    }

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

    if (config.supportsVehiclePlate) {
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
            vehicle_plate = ?,
            vehicle_plate_normalized = ?,
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
          payload.vehiclePlate || null,
          payload.vehiclePlateNormalized || null,
          payload.notes,
          requestId,
        ],
      );
      return;
    }

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
          ${buildVehiclePlateSelect(config)},
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

  async listPassesByVehiclePlate(eventId, vehiclePlateNormalized) {
    const config = this.resolveConfig('pass');
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
          ${buildVehiclePlateSelect(config)},
          request.notes,
          request.status,
          request.handed_out_at,
          request.status_updated_at,
          request.created_at,
          request.updated_at,
          profile.name AS profile_name,
          profile.public_slug,
          category.name AS category_name
        FROM ${config.requestTable} request
        INNER JOIN ${config.categoryTable} category ON category.id = request.${config.categoryIdField}
        LEFT JOIN request_profiles profile ON profile.id = request.request_profile_id AND profile.deleted_at IS NULL
        WHERE request.event_id = ?
          AND request.vehicle_plate_normalized = ?
          AND request.deleted_at IS NULL
          AND category.deleted_at IS NULL
        ORDER BY request.created_at DESC, request.id DESC
      `,
      [eventId, vehiclePlateNormalized],
    );

    return rows;
  }

  async listRecentPassVehicleMovements(eventId, limit = 20) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          log.id,
          log.event_id,
          log.pass_request_id,
          log.direction,
          log.vehicle_plate,
          log.vehicle_plate_normalized,
          log.gate_name,
          log.source,
          log.metadata,
          log.created_at,
          request.full_name,
          request.company_name,
          request.last_entry_at,
          request.last_exit_at,
          request.entered_at,
          request.status,
          category.name AS category_name,
          profile.name AS profile_name
        FROM pass_request_entry_logs log
        INNER JOIN pass_requests request ON request.id = log.pass_request_id
        INNER JOIN pass_categories category ON category.id = request.pass_category_id
        LEFT JOIN request_profiles profile ON profile.id = request.request_profile_id AND profile.deleted_at IS NULL
        WHERE log.event_id = ?
          AND request.deleted_at IS NULL
          AND category.deleted_at IS NULL
        ORDER BY log.created_at DESC, log.id DESC
        LIMIT ?
      `,
      [eventId, Number(limit)],
    );

    return rows;
  }

  async registerPassVehicleMovement(connection, requestId, payload) {
    const metadata = payload.metadata ? JSON.stringify(payload.metadata) : null;
    const [insertResult] = await connection.execute(
      `
        INSERT INTO pass_request_entry_logs (
          event_id,
          pass_request_id,
          direction,
          vehicle_plate,
          vehicle_plate_normalized,
          gate_name,
          source,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId,
        requestId,
        payload.direction,
        payload.vehiclePlate,
        payload.vehiclePlateNormalized,
        payload.gateName || null,
        payload.source || null,
        metadata,
      ],
    );

    if (payload.direction === 'exit') {
      await connection.execute(
        `
          UPDATE pass_requests
          SET
            last_exit_at = NOW()
          WHERE id = ?
        `,
        [requestId],
      );
    } else {
      await connection.execute(
        `
          UPDATE pass_requests
          SET
            entered_at = COALESCE(entered_at, NOW()),
            last_entry_at = NOW()
          WHERE id = ?
        `,
        [requestId],
      );
    }

    return insertResult.insertId;
  }
}

module.exports = { RequestRepository };
