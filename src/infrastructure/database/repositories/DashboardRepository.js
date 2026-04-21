class DashboardRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getEventSummary(eventId) {
    const [[summary]] = await this.pool.execute(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM event_users
            WHERE event_id = ?
          ) AS total_members,
          (
            SELECT COUNT(*)
            FROM pass_categories
            WHERE event_id = ?
              AND deleted_at IS NULL
          ) AS total_pass_categories,
          (
            SELECT COUNT(*)
            FROM wristband_categories
            WHERE event_id = ?
              AND deleted_at IS NULL
          ) AS total_wristband_categories,
          (
            SELECT COUNT(*)
            FROM pass_requests
            WHERE event_id = ?
              AND deleted_at IS NULL
          ) AS total_pass_requests,
          (
            SELECT COUNT(*)
            FROM wristband_requests
            WHERE event_id = ?
              AND deleted_at IS NULL
          ) AS total_wristband_requests
      `,
      [eventId, eventId, eventId, eventId, eventId],
    );

    return {
      totalMembers: Number(summary.total_members || 0),
      totalPassCategories: Number(summary.total_pass_categories || 0),
      totalWristbandCategories: Number(summary.total_wristband_categories || 0),
      totalPassRequests: Number(summary.total_pass_requests || 0),
      totalWristbandRequests: Number(summary.total_wristband_requests || 0),
    };
  }
}

module.exports = { DashboardRepository };
