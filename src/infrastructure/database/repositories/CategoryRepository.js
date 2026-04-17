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

  async attachPassEntryWindows(categories = []) {
    if (!categories.length) {
      return categories;
    }

    const categoryIds = categories
      .map((category) => Number(category.id))
      .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0);

    if (!categoryIds.length) {
      return categories.map((category) => ({
        ...category,
        entry_windows: [],
      }));
    }

    const windows = await this.listPassEntryWindowsByCategoryIds(categoryIds);
    const windowsByCategoryId = windows.reduce((map, window) => {
      const categoryId = Number(window.pass_category_id);

      if (!map[categoryId]) {
        map[categoryId] = [];
      }

      map[categoryId].push(window);
      return map;
    }, {});

    return categories.map((category) => ({
      ...category,
      entry_windows: windowsByCategoryId[Number(category.id)] || [],
    }));
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

    if (type === 'pass') {
      return this.attachPassEntryWindows(rows);
    }

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

    const category = rows[0] || null;

    if (!category || type !== 'pass') {
      return category;
    }

    return (await this.attachPassEntryWindows([category]))[0] || null;
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

    const category = rows[0] || null;

    if (!category || type !== 'pass') {
      return category;
    }

    return (await this.attachPassEntryWindows([category]))[0] || null;
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
    await this.updateWithConnection(this.pool, type, categoryId, payload);
  }

  async updateWithConnection(connection, type, categoryId, payload) {
    const table = this.resolveTable(type);

    await connection.query(
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

  async listPassEntryWindowsByCategoryIds(categoryIds = []) {
    const normalizedCategoryIds = categoryIds
      .map((categoryId) => Number(categoryId))
      .filter((categoryId) => Number.isInteger(categoryId) && categoryId > 0);

    if (!normalizedCategoryIds.length) {
      return [];
    }

    const [rows] = await this.pool.query(
      `
        SELECT
          id,
          pass_category_id,
          start_at,
          end_at,
          sort_order,
          created_at,
          updated_at
        FROM pass_category_entry_windows
        WHERE pass_category_id IN (?)
        ORDER BY sort_order ASC, start_at ASC, id ASC
      `,
      [normalizedCategoryIds],
    );

    return rows;
  }

  async replacePassEntryWindows(connection, categoryId, entryWindows = []) {
    await connection.query(
      `
        DELETE FROM pass_category_entry_windows
        WHERE pass_category_id = ?
      `,
      [categoryId],
    );

    if (!entryWindows.length) {
      return;
    }

    for (const [index, entryWindow] of entryWindows.entries()) {
      await connection.query(
        `
          INSERT INTO pass_category_entry_windows (
            pass_category_id,
            start_at,
            end_at,
            sort_order
          )
          VALUES (?, ?, ?, ?)
        `,
        [
          categoryId,
          entryWindow.startAt,
          entryWindow.endAt,
          Number(entryWindow.sortOrder ?? index),
        ],
      );
    }
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
