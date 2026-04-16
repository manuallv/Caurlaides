class AuditLogRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create(connectionOrPool, payload) {
    const executor = connectionOrPool || this.pool;

    await executor.execute(
      `
        INSERT INTO audit_logs (
          event_id,
          user_id,
          entity_type,
          entity_id,
          action,
          message,
          before_state,
          after_state,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId || null,
        payload.userId || null,
        payload.entityType,
        payload.entityId || null,
        payload.action,
        payload.message,
        payload.beforeState ? JSON.stringify(payload.beforeState) : null,
        payload.afterState ? JSON.stringify(payload.afterState) : null,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
      ],
    );
  }

  async listByEvent(eventId, limit = 20) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          audit.id,
          audit.entity_type,
          audit.entity_id,
          audit.action,
          audit.message,
          audit.created_at,
          user.full_name AS actor_name
        FROM audit_logs audit
        LEFT JOIN users user ON user.id = audit.user_id
        WHERE audit.event_id = ?
        ORDER BY audit.created_at DESC
        LIMIT ?
      `,
      [eventId, limit],
    );

    return rows;
  }
}

module.exports = { AuditLogRepository };
