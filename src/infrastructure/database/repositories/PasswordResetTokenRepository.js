class PasswordResetTokenRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async invalidateForUser(userId) {
    await this.pool.execute(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE user_id = ?
          AND used_at IS NULL
      `,
      [userId],
    );
  }

  async create({ userId, tokenHash, expiresAt }) {
    const [result] = await this.pool.execute(
      `
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `,
      [userId, tokenHash, expiresAt],
    );

    return result.insertId;
  }

  async findActiveByTokenHash(tokenHash) {
    const [rows] = await this.pool.execute(
      `
        SELECT id, user_id, token_hash, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash],
    );

    return rows[0] || null;
  }

  async markUsed(id) {
    await this.pool.execute(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE id = ?
      `,
      [id],
    );
  }
}

module.exports = { PasswordResetTokenRepository };
