function serializeQuotaEntries(entries = []) {
  return JSON.stringify(
    entries.map((entry) => ({
      categoryId: Number(entry.categoryId),
      quota: Number(entry.quota || 0),
    })),
  );
}

function parseQuotaEntries(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeApplication(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    requested_pass_quota: parseQuotaEntries(row.requested_pass_quota),
    requested_wristband_quota: parseQuotaEntries(row.requested_wristband_quota),
  };
}

class RequestProfileApplicationRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create(payload) {
    const [result] = await this.pool.execute(
      `
        INSERT INTO request_profile_applications (
          event_id,
          profile_name,
          contact_email,
          contact_phone,
          notes,
          requested_pass_quota,
          requested_wristband_quota
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId,
        payload.profileName,
        payload.contactEmail,
        payload.contactPhone || null,
        payload.notes || null,
        serializeQuotaEntries(payload.passQuotas),
        serializeQuotaEntries(payload.wristbandQuotas),
      ],
    );

    return result.insertId;
  }

  async listByEvent(eventId, limit = 100) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const [rows] = await this.pool.query(
      `
        SELECT
          rpa.id,
          rpa.event_id,
          rpa.status,
          rpa.profile_name,
          rpa.contact_email,
          rpa.contact_phone,
          rpa.notes,
          rpa.requested_pass_quota,
          rpa.requested_wristband_quota,
          rpa.approved_profile_id,
          rpa.reviewed_by_user_id,
          rpa.reviewed_at,
          rpa.rejection_reason,
          rpa.created_at,
          rpa.updated_at,
          reviewer.full_name AS reviewed_by_name,
          approved_profile.access_code AS approved_access_code
        FROM request_profile_applications rpa
        LEFT JOIN users reviewer ON reviewer.id = rpa.reviewed_by_user_id
        LEFT JOIN request_profiles approved_profile ON approved_profile.id = rpa.approved_profile_id
        WHERE rpa.event_id = ?
        ORDER BY
          FIELD(rpa.status, 'pending', 'approved', 'rejected'),
          rpa.created_at DESC,
          rpa.id DESC
        LIMIT ${safeLimit}
      `,
      [eventId],
    );

    return rows.map(normalizeApplication);
  }

  async countPendingByEvent(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT COUNT(*) AS pending_count
        FROM request_profile_applications
        WHERE event_id = ?
          AND status = 'pending'
      `,
      [eventId],
    );

    return Number(rows[0]?.pending_count || 0);
  }

  async findById(applicationId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          event_id,
          status,
          profile_name,
          contact_email,
          contact_phone,
          notes,
          requested_pass_quota,
          requested_wristband_quota,
          approved_profile_id,
          reviewed_by_user_id,
          reviewed_at,
          rejection_reason,
          created_at,
          updated_at
        FROM request_profile_applications
        WHERE id = ?
        LIMIT 1
      `,
      [applicationId],
    );

    return normalizeApplication(rows[0] || null);
  }

  async approve(connection, applicationId, payload) {
    const [result] = await connection.execute(
      `
        UPDATE request_profile_applications
        SET
          status = 'approved',
          approved_profile_id = ?,
          reviewed_by_user_id = ?,
          reviewed_at = NOW(),
          rejection_reason = NULL
        WHERE id = ?
          AND status = 'pending'
      `,
      [payload.profileId, payload.userId, applicationId],
    );

    return result.affectedRows;
  }

  async reject(applicationId, payload) {
    const [result] = await this.pool.execute(
      `
        UPDATE request_profile_applications
        SET
          status = 'rejected',
          reviewed_by_user_id = ?,
          reviewed_at = NOW(),
          rejection_reason = ?
        WHERE id = ?
          AND status = 'pending'
      `,
      [payload.userId, payload.reason || null, applicationId],
    );

    return result.affectedRows;
  }
}

module.exports = { RequestProfileApplicationRepository };
