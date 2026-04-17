class EventRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listForUser(userId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          eu.role,
          (
            SELECT COUNT(*)
            FROM event_users member_count
            WHERE member_count.event_id = e.id
          ) AS member_count,
          (
            SELECT COUNT(*)
            FROM pass_requests pass_request_count
            WHERE pass_request_count.event_id = e.id
              AND pass_request_count.deleted_at IS NULL
          ) AS total_pass_requests,
          (
            SELECT COUNT(*)
            FROM wristband_requests wristband_request_count
            WHERE wristband_request_count.event_id = e.id
              AND wristband_request_count.deleted_at IS NULL
          ) AS total_wristband_requests
        FROM event_users eu
        INNER JOIN events e ON e.id = eu.event_id
        WHERE eu.user_id = ?
          AND e.deleted_at IS NULL
        ORDER BY
          FIELD(e.status, 'active', 'draft', 'completed', 'archived'),
          e.start_date ASC
      `,
      [userId],
    );

    return rows;
  }

  async create(connection, payload) {
    const [result] = await connection.execute(
      `
        INSERT INTO events (
          owner_id,
          name,
          description,
          start_date,
          end_date,
          location,
          status,
          pass_request_deadline,
          wristband_request_deadline
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.ownerId,
        payload.name,
        payload.description,
        payload.startDate,
        payload.endDate,
        payload.location,
        payload.status,
        payload.passRequestDeadline,
        payload.wristbandRequestDeadline,
      ],
    );

    return result.insertId;
  }

  async addMember(connection, { eventId, userId, role, invitedByUserId = null }) {
    await connection.execute(
      `
        INSERT INTO event_users (event_id, user_id, role, invited_by_user_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          role = VALUES(role),
          invited_by_user_id = VALUES(invited_by_user_id)
      `,
      [eventId, userId, role, invitedByUserId],
    );
  }

  async update(eventId, payload) {
    await this.pool.execute(
      `
        UPDATE events
        SET
          name = ?,
          description = ?,
          start_date = ?,
          end_date = ?,
          location = ?,
          status = ?,
          pass_request_deadline = ?,
          wristband_request_deadline = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.description,
        payload.startDate,
        payload.endDate,
        payload.location,
        payload.status,
        payload.passRequestDeadline,
        payload.wristbandRequestDeadline,
        eventId,
      ],
    );
  }

  async delete(eventId, userId) {
    await this.pool.execute(
      `
        UPDATE events
        SET
          deleted_at = NOW(),
          deleted_by_user_id = ?
        WHERE id = ?
      `,
      [userId, eventId],
    );
  }

  async restore(eventId) {
    await this.pool.execute(
      `
        UPDATE events
        SET
          deleted_at = NULL,
          deleted_by_user_id = NULL
        WHERE id = ?
      `,
      [eventId],
    );
  }

  async findById(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.owner_id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.id = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [eventId],
    );

    return rows[0] || null;
  }

  async findAccessibleById(eventId, userId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.owner_id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.deleted_at,
          e.created_at,
          e.updated_at,
          eu.role
        FROM events e
        INNER JOIN event_users eu ON eu.event_id = e.id
        WHERE e.id = ? AND eu.user_id = ? AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [eventId, userId],
    );

    return rows[0] || null;
  }

  async findAnyById(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.owner_id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.id = ?
        LIMIT 1
      `,
      [eventId],
    );

    return rows[0] || null;
  }

  async listMembers(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          eu.user_id,
          eu.role,
          eu.created_at,
          u.full_name,
          u.email,
          inviter.full_name AS invited_by_name
        FROM event_users eu
        INNER JOIN users u ON u.id = eu.user_id
        LEFT JOIN users inviter ON inviter.id = eu.invited_by_user_id
        WHERE eu.event_id = ?
        ORDER BY FIELD(eu.role, 'owner', 'admin', 'staff'), u.full_name ASC
      `,
      [eventId],
    );

    return rows;
  }

  async findMember(eventId, userId) {
    const [rows] = await this.pool.execute(
      `
        SELECT event_id, user_id, role
        FROM event_users
        WHERE event_id = ? AND user_id = ?
        LIMIT 1
      `,
      [eventId, userId],
    );

    return rows[0] || null;
  }

  async updateMemberRole(eventId, userId, role) {
    await this.pool.execute(
      `
        UPDATE event_users
        SET role = ?
        WHERE event_id = ? AND user_id = ?
      `,
      [role, eventId, userId],
    );
  }

  async removeMember(eventId, userId) {
    await this.pool.execute(
      `
        DELETE FROM event_users
        WHERE event_id = ? AND user_id = ?
      `,
      [eventId, userId],
    );
  }

  async findByVehicleCheckToken(token) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.owner_id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.vehicle_check_token = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async updateVehicleCheckToken(connection, eventId, token) {
    await connection.execute(
      `
        UPDATE events
        SET
          vehicle_check_token = ?,
          vehicle_check_token_created_at = NOW()
        WHERE id = ?
      `,
      [token, eventId],
    );
  }

  async findByVehicleGateApiToken(token) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          e.id,
          e.owner_id,
          e.name,
          e.description,
          e.start_date,
          e.end_date,
          e.location,
          e.status,
          e.pass_request_deadline,
          e.wristband_request_deadline,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.vehicle_gate_api_token = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async updateVehicleGateApiConfig(connection, eventId, payload) {
    await connection.execute(
      `
        UPDATE events
        SET
          vehicle_gate_api_token = ?,
          vehicle_gate_api_token_created_at = CASE
            WHEN vehicle_gate_api_token <=> ? THEN vehicle_gate_api_token_created_at
            ELSE NOW()
          END,
          vehicle_gate_api_auth_mode = ?,
          vehicle_gate_api_key = ?,
          vehicle_gate_api_mode = ?,
          vehicle_gate_api_dedupe_seconds = ?
        WHERE id = ?
      `,
      [
        payload.token,
        payload.token,
        payload.authMode,
        payload.apiKey,
        payload.mode,
        payload.dedupeSeconds,
        eventId,
      ],
    );
  }
}

module.exports = { EventRepository };
