class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ fullName, email, phone = null, passwordHash, isActive = 1 }) {
    const [result] = await this.pool.execute(
      `
        INSERT INTO users (full_name, email, phone, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?)
      `,
      [fullName, email.toLowerCase(), phone, passwordHash, isActive ? 1 : 0],
    );

    return this.findById(result.insertId);
  }

  async findByEmail(email) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          full_name,
          email,
          phone,
          password_hash,
          last_login_at,
          is_active,
          deleted_at,
          created_at,
          updated_at
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email.toLowerCase()],
    );

    return rows[0] || null;
  }

  async findById(id) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          full_name,
          email,
          phone,
          last_login_at,
          is_active,
          deleted_at,
          created_at,
          updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [id],
    );

    return rows[0] || null;
  }

  async findForInvitation(email) {
    const [rows] = await this.pool.execute(
      `
        SELECT id, full_name, email, phone, is_active, deleted_at
        FROM users
        WHERE email = ?
          AND is_active = 1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email.toLowerCase()],
    );

    return rows[0] || null;
  }

  async touchLastLogin(id) {
    await this.pool.execute(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = ?
      `,
      [id],
    );
  }

  async listAllWithStats() {
    const [rows] = await this.pool.execute(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.phone,
          u.last_login_at,
          u.is_active,
          u.deleted_at,
          u.created_at,
          u.updated_at,
          (
            SELECT COUNT(DISTINCT eu.event_id)
            FROM event_users eu
            INNER JOIN events e ON e.id = eu.event_id
            WHERE eu.user_id = u.id
              AND e.deleted_at IS NULL
          ) AS total_events,
          (
            SELECT COUNT(*)
            FROM pass_requests pr
            INNER JOIN event_users eu ON eu.event_id = pr.event_id
            WHERE eu.user_id = u.id
              AND pr.deleted_at IS NULL
          ) + (
            SELECT COUNT(*)
            FROM wristband_requests wr
            INNER JOIN event_users eu ON eu.event_id = wr.event_id
            WHERE eu.user_id = u.id
              AND wr.deleted_at IS NULL
          ) AS total_records
        FROM users u
        ORDER BY u.deleted_at IS NOT NULL, u.full_name ASC
      `,
    );

    return rows;
  }

  async updateByAdmin(userId, { fullName, email, phone = null, isActive = 1 }) {
    await this.pool.execute(
      `
        UPDATE users
        SET
          full_name = ?,
          email = ?,
          phone = ?,
          is_active = ?,
          deleted_at = CASE WHEN ? = 1 THEN NULL ELSE deleted_at END,
          deleted_by_user_id = CASE WHEN ? = 1 THEN NULL ELSE deleted_by_user_id END
        WHERE id = ?
      `,
      [fullName, email.toLowerCase(), phone, isActive ? 1 : 0, isActive ? 1 : 0, isActive ? 1 : 0, userId],
    );
  }

  async updatePassword(userId, passwordHash) {
    await this.pool.execute(
      `
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
      `,
      [passwordHash, userId],
    );
  }

  async softDelete(userId, actorId) {
    await this.pool.execute(
      `
        UPDATE users
        SET
          is_active = 0,
          deleted_at = NOW(),
          deleted_by_user_id = ?
        WHERE id = ?
      `,
      [actorId, userId],
    );
  }

  async restore(userId) {
    await this.pool.execute(
      `
        UPDATE users
        SET
          is_active = 1,
          deleted_at = NULL,
          deleted_by_user_id = NULL
        WHERE id = ?
      `,
      [userId],
    );
  }
}

module.exports = { UserRepository };
