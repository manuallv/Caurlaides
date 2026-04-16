const TABLE_BY_TYPE = {
  pass: 'pass_categories',
  wristband: 'wristband_categories',
};

class CategoryRepository {
  constructor(pool) {
    this.pool = pool;
  }

  resolveTable(type) {
    const table = TABLE_BY_TYPE[type];

    if (!table) {
      throw new Error(`Unsupported category type: ${type}`);
    }

    return table;
  }

  async listByEvent(eventId, type) {
    const table = this.resolveTable(type);
    const [rows] = await this.pool.query(
      `
        SELECT
          id,
          event_id,
          name,
          description,
          quota,
          is_active,
          sort_order,
          deleted_at,
          created_at,
          updated_at
        FROM ${table}
        WHERE event_id = ?
          AND deleted_at IS NULL
        ORDER BY sort_order ASC, name ASC
      `,
      [eventId],
    );

    return rows;
  }

  async findById(type, categoryId) {
    const table = this.resolveTable(type);
    const [rows] = await this.pool.query(
      `
        SELECT
          id,
          event_id,
          name,
          description,
          quota,
          is_active,
          sort_order,
          deleted_at,
          created_at,
          updated_at
        FROM ${table}
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [categoryId],
    );

    return rows[0] || null;
  }

  async findAnyById(type, categoryId) {
    const table = this.resolveTable(type);
    const [rows] = await this.pool.query(
      `
        SELECT
          id,
          event_id,
          name,
          description,
          quota,
          is_active,
          sort_order,
          deleted_at,
          created_at,
          updated_at
        FROM ${table}
        WHERE id = ?
        LIMIT 1
      `,
      [categoryId],
    );

    return rows[0] || null;
  }

  async create(connection, type, payload) {
    const table = this.resolveTable(type);
    const [result] = await connection.query(
      `
        INSERT INTO ${table} (
          event_id,
          name,
          description,
          quota,
          is_active,
          sort_order,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId,
        payload.name,
        payload.description,
        payload.quota,
        payload.isActive,
        payload.sortOrder,
        payload.userId,
        payload.userId,
      ],
    );

    return result.insertId;
  }

  async update(type, categoryId, payload) {
    const table = this.resolveTable(type);
    await this.pool.query(
      `
        UPDATE ${table}
        SET
          name = ?,
          description = ?,
          quota = ?,
          is_active = ?,
          sort_order = ?,
          updated_by_user_id = ?
        WHERE id = ?
      `,
      [
        payload.name,
        payload.description,
        payload.quota,
        payload.isActive,
        payload.sortOrder,
        payload.userId,
        categoryId,
      ],
    );
  }

  async delete(type, categoryId, userId) {
    const table = this.resolveTable(type);
    await this.pool.query(
      `
        UPDATE ${table}
        SET
          deleted_at = NOW(),
          deleted_by_user_id = ?,
          is_active = 0
        WHERE id = ?
      `,
      [userId, categoryId],
    );
  }

  async restore(type, categoryId) {
    const table = this.resolveTable(type);
    await this.pool.query(
      `
        UPDATE ${table}
        SET
          deleted_at = NULL,
          deleted_by_user_id = NULL,
          is_active = 1
        WHERE id = ?
      `,
      [categoryId],
    );
  }
}

module.exports = { CategoryRepository };
