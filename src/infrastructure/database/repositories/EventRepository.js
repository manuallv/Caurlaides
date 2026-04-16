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
          eu.role,
          (
            SELECT COUNT(*)
            FROM event_users member_count
            WHERE member_count.event_id = e.id
          ) AS member_count
        FROM event_users eu
        INNER JOIN events e ON e.id = eu.event_id
        WHERE eu.user_id = ?
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

  async delete(eventId) {
    await this.pool.execute('DELETE FROM events WHERE id = ?', [eventId]);
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
          e.created_at,
          e.updated_at,
          eu.role
        FROM events e
        INNER JOIN event_users eu ON eu.event_id = e.id
        WHERE e.id = ? AND eu.user_id = ?
        LIMIT 1
      `,
      [eventId, userId],
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
}

module.exports = { EventRepository };
