class DashboardRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getEventSummary(eventId) {
    const [[memberRow]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS total_members
        FROM event_users
        WHERE event_id = ?
      `,
      [eventId],
    );

    const [[passCategoryRow]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS total_pass_categories
        FROM pass_categories
        WHERE event_id = ?
      `,
      [eventId],
    );

    const [[wristbandCategoryRow]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS total_wristband_categories
        FROM wristband_categories
        WHERE event_id = ?
      `,
      [eventId],
    );

    const [[passRequestRow]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS total_pass_requests
        FROM pass_requests
        WHERE event_id = ?
      `,
      [eventId],
    );

    const [[wristbandRequestRow]] = await this.pool.execute(
      `
        SELECT COUNT(*) AS total_wristband_requests
        FROM wristband_requests
        WHERE event_id = ?
      `,
      [eventId],
    );

    return {
      totalMembers: memberRow.total_members,
      totalPassCategories: passCategoryRow.total_pass_categories,
      totalWristbandCategories: wristbandCategoryRow.total_wristband_categories,
      totalPassRequests: passRequestRow.total_pass_requests,
      totalWristbandRequests: wristbandRequestRow.total_wristband_requests,
    };
  }
}

module.exports = { DashboardRepository };
