class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ fullName, email, passwordHash }) {
    const [result] = await this.pool.execute(
      `
        INSERT INTO users (full_name, email, password_hash)
        VALUES (?, ?, ?)
      `,
      [fullName, email.toLowerCase(), passwordHash],
    );

    return this.findById(result.insertId);
  }

  async findByEmail(email) {
    const [rows] = await this.pool.execute(
      `
        SELECT id, full_name, email, password_hash, last_login_at, created_at, updated_at
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
        SELECT id, full_name, email, last_login_at, created_at, updated_at
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
        SELECT id, full_name, email
        FROM users
        WHERE email = ?
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
}

module.exports = { UserRepository };
