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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          eu.role,
          (
            SELECT COUNT(*)
            FROM event_users member_count
            WHERE member_count.event_id = e.id
          ) AS member_count,
          (
            SELECT COUNT(*)
            FROM pass_requests pass_request_count
            WHERE pass_request_count.event_id = e.id
              AND pass_request_count.deleted_at IS NULL
          ) AS total_pass_requests,
          (
            SELECT COUNT(*)
            FROM wristband_requests wristband_request_count
            WHERE wristband_request_count.event_id = e.id
              AND wristband_request_count.deleted_at IS NULL
          ) AS total_wristband_requests
        FROM event_users eu
        INNER JOIN events e ON e.id = eu.event_id
        WHERE eu.user_id = ?
          AND e.deleted_at IS NULL
        ORDER BY
          e.created_at DESC,
          e.id DESC
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
          wristband_request_deadline,
          allow_duplicate_vehicle_plates
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        payload.allowDuplicateVehiclePlates ? 1 : 0,
      ],
    );

    return result.insertId;
  }

  async addMember(connection, {
    eventId,
    userId,
    role,
    invitedByUserId = null,
    notifyProfileApplications = true,
  }) {
    await connection.execute(
      `
        INSERT INTO event_users (
          event_id,
          user_id,
          role,
          notify_profile_applications,
          invited_by_user_id
        )
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          role = VALUES(role),
          notify_profile_applications = VALUES(notify_profile_applications),
          invited_by_user_id = VALUES(invited_by_user_id)
      `,
      [eventId, userId, role, notifyProfileApplications ? 1 : 0, invitedByUserId],
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
          wristband_request_deadline = ?,
          allow_duplicate_vehicle_plates = ?
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
        payload.allowDuplicateVehiclePlates ? 1 : 0,
        eventId,
      ],
    );
  }

  async delete(eventId, userId) {
    await this.pool.execute(
      `
        UPDATE events
        SET
          deleted_at = NOW(),
          deleted_by_user_id = ?
        WHERE id = ?
      `,
      [userId, eventId],
    );
  }

  async restore(eventId) {
    await this.pool.execute(
      `
        UPDATE events
        SET
          deleted_at = NULL,
          deleted_by_user_id = NULL
        WHERE id = ?
      `,
      [eventId],
    );
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.id = ?
          AND e.deleted_at IS NULL
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
          e.created_at,
          e.updated_at,
          eu.role
        FROM events e
        INNER JOIN event_users eu ON eu.event_id = e.id
        WHERE e.id = ? AND eu.user_id = ? AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [eventId, userId],
    );

    return rows[0] || null;
  }

  async findAnyById(eventId) {
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
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

  async listMembers(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          eu.user_id,
          eu.role,
          eu.notify_profile_applications,
          eu.created_at,
          u.full_name,
          u.email,
          u.preferred_locale,
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

  async listManagementEmailRecipients(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT DISTINCT
          u.id,
          u.full_name,
          u.email,
          u.preferred_locale,
          eu.notify_profile_applications,
          eu.role
        FROM event_users eu
        INNER JOIN users u ON u.id = eu.user_id
        WHERE eu.event_id = ?
          AND eu.role IN ('owner', 'admin')
          AND eu.notify_profile_applications = 1
          AND u.is_active = 1
          AND u.deleted_at IS NULL
        ORDER BY FIELD(eu.role, 'owner', 'admin'), u.full_name ASC
      `,
      [eventId],
    );

    return rows;
  }

  async findMember(eventId, userId) {
    const [rows] = await this.pool.execute(
      `
        SELECT event_id, user_id, role, notify_profile_applications
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

  async updateMemberProfileNotifications(eventId, userId, notifyProfileApplications) {
    await this.pool.execute(
      `
        UPDATE event_users
        SET notify_profile_applications = ?
        WHERE event_id = ? AND user_id = ?
      `,
      [notifyProfileApplications ? 1 : 0, eventId, userId],
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

  async findVehicleCheckLinkByToken(token) {
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
          e.created_at,
          e.updated_at,
          l.id AS vehicle_check_link_id,
          l.name AS vehicle_check_link_name,
          l.token AS vehicle_check_link_token,
          l.created_at AS vehicle_check_link_created_at,
          l.updated_at AS vehicle_check_link_updated_at
        FROM event_vehicle_check_links l
        INNER JOIN events e ON e.id = l.event_id
        WHERE l.token = ?
          AND l.is_active = 1
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async findByVehicleCheckToken(token) {
    const linkEvent = await this.findVehicleCheckLinkByToken(token);

    if (linkEvent) {
      const permissions = await this.listVehicleCheckLinkCategoryPermissions([linkEvent.vehicle_check_link_id]);

      return {
        ...linkEvent,
        vehicle_check_link_categories: permissions,
      };
    }

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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
          e.created_at,
          e.updated_at,
          NULL AS vehicle_check_link_id,
          NULL AS vehicle_check_link_name,
          NULL AS vehicle_check_link_token,
          NULL AS vehicle_check_link_created_at,
          NULL AS vehicle_check_link_updated_at
        FROM events e
        WHERE e.vehicle_check_token = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async updateVehicleCheckToken(connection, eventId, token) {
    await connection.execute(
      `
        UPDATE events
        SET
          vehicle_check_token = ?,
          vehicle_check_token_created_at = NOW()
        WHERE id = ?
      `,
      [token, eventId],
    );
  }

  async listVehicleCheckLinks(eventId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          event_id,
          name,
          token,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM event_vehicle_check_links
        WHERE event_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [eventId],
    );

    if (!rows.length) {
      return [];
    }

    const permissions = await this.listVehicleCheckLinkCategoryPermissions(rows.map((row) => row.id));
    const permissionsByLinkId = permissions.reduce((map, permission) => {
      const linkId = Number(permission.link_id);

      if (!map[linkId]) {
        map[linkId] = [];
      }

      map[linkId].push(permission);
      return map;
    }, {});

    return rows.map((row) => ({
      ...row,
      categories: permissionsByLinkId[Number(row.id)] || [],
    }));
  }

  async listVehicleCheckLinkCategoryPermissions(linkIds = []) {
    const normalizedLinkIds = linkIds
      .map((linkId) => Number(linkId))
      .filter((linkId) => Number.isInteger(linkId) && linkId > 0);

    if (!normalizedLinkIds.length) {
      return [];
    }

    const [rows] = await this.pool.query(
      `
        SELECT
          lc.link_id,
          lc.pass_category_id,
          lc.can_check,
          lc.can_enter,
          pc.name AS category_name,
          pc.sort_order AS category_sort_order,
          pc.is_active AS category_is_active
        FROM event_vehicle_check_link_categories lc
        INNER JOIN pass_categories pc ON pc.id = lc.pass_category_id
        WHERE lc.link_id IN (?)
          AND pc.deleted_at IS NULL
        ORDER BY pc.sort_order ASC, pc.name ASC
      `,
      [normalizedLinkIds],
    );

    return rows;
  }

  async findVehicleCheckLinkById(eventId, linkId) {
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          event_id,
          name,
          token,
          is_active,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM event_vehicle_check_links
        WHERE event_id = ?
          AND id = ?
        LIMIT 1
      `,
      [eventId, linkId],
    );

    const link = rows[0] || null;

    if (!link) {
      return null;
    }

    const permissions = await this.listVehicleCheckLinkCategoryPermissions([link.id]);

    return {
      ...link,
      categories: permissions,
    };
  }

  async createVehicleCheckLink(connection, payload) {
    const [result] = await connection.execute(
      `
        INSERT INTO event_vehicle_check_links (
          event_id,
          name,
          token,
          is_active,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        payload.eventId,
        payload.name,
        payload.token,
        payload.isActive ? 1 : 0,
        payload.userId,
        payload.userId,
      ],
    );

    return result.insertId;
  }

  async updateVehicleCheckLink(connection, eventId, linkId, payload) {
    await connection.execute(
      `
        UPDATE event_vehicle_check_links
        SET
          name = ?,
          is_active = ?,
          updated_by_user_id = ?
        WHERE event_id = ?
          AND id = ?
      `,
      [
        payload.name,
        payload.isActive ? 1 : 0,
        payload.userId,
        eventId,
        linkId,
      ],
    );
  }

  async updateVehicleCheckLinkToken(connection, eventId, linkId, token, userId) {
    await connection.execute(
      `
        UPDATE event_vehicle_check_links
        SET
          token = ?,
          updated_by_user_id = ?
        WHERE event_id = ?
          AND id = ?
      `,
      [token, userId, eventId, linkId],
    );
  }

  async deleteVehicleCheckLink(connection, eventId, linkId) {
    await connection.execute(
      `
        DELETE FROM event_vehicle_check_links
        WHERE event_id = ?
          AND id = ?
      `,
      [eventId, linkId],
    );
  }

  async replaceVehicleCheckLinkCategories(connection, linkId, entries = []) {
    await connection.execute(
      `
        DELETE FROM event_vehicle_check_link_categories
        WHERE link_id = ?
      `,
      [linkId],
    );

    for (const entry of entries) {
      await connection.execute(
        `
          INSERT INTO event_vehicle_check_link_categories (
            link_id,
            pass_category_id,
            can_check,
            can_enter
          )
          VALUES (?, ?, ?, ?)
        `,
        [
          linkId,
          entry.categoryId,
          entry.canCheck ? 1 : 0,
          entry.canEnter ? 1 : 0,
        ],
      );
    }
  }

  async findByRequestProfileApplicationToken(token) {
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.request_profile_application_token = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async updateRequestProfileApplicationToken(connection, eventId, token) {
    await connection.execute(
      `
        UPDATE events
        SET request_profile_application_token = ?
        WHERE id = ?
      `,
      [token, eventId],
    );
  }

  async findByVehicleGateApiToken(token) {
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
          e.allow_duplicate_vehicle_plates,
          e.request_profile_application_token,
          e.vehicle_check_token,
          e.vehicle_check_token_created_at,
          e.vehicle_gate_api_token,
          e.vehicle_gate_api_token_created_at,
          e.vehicle_gate_api_auth_mode,
          e.vehicle_gate_api_key,
          e.vehicle_gate_api_mode,
          e.vehicle_gate_api_dedupe_seconds,
          e.pass_print_template_name,
          e.pass_print_template_background_path,
          e.pass_print_template_background_rotation,
          e.pass_print_template_orientation,
          e.pass_print_template_fields_json,
          e.pass_print_template_updated_at,
          e.deleted_at,
          e.created_at,
          e.updated_at
        FROM events e
        WHERE e.vehicle_gate_api_token = ?
          AND e.deleted_at IS NULL
        LIMIT 1
      `,
      [token],
    );

    return rows[0] || null;
  }

  async updateVehicleGateApiConfig(connection, eventId, payload) {
    await connection.execute(
      `
        UPDATE events
        SET
          vehicle_gate_api_token = ?,
          vehicle_gate_api_token_created_at = CASE
            WHEN vehicle_gate_api_token <=> ? THEN vehicle_gate_api_token_created_at
            ELSE NOW()
          END,
          vehicle_gate_api_auth_mode = ?,
          vehicle_gate_api_key = ?,
          vehicle_gate_api_mode = ?,
          vehicle_gate_api_dedupe_seconds = ?
        WHERE id = ?
      `,
      [
        payload.token,
        payload.token,
        payload.authMode,
        payload.apiKey,
        payload.mode,
        payload.dedupeSeconds,
        eventId,
      ],
    );
  }

  async updatePassPrintTemplate(connection, eventId, payload) {
    await connection.execute(
      `
        UPDATE events
        SET
          pass_print_template_name = ?,
          pass_print_template_background_path = ?,
          pass_print_template_background_rotation = ?,
          pass_print_template_orientation = ?,
          pass_print_template_fields_json = ?,
          pass_print_template_updated_at = NOW()
        WHERE id = ?
      `,
      [
        payload.name,
        payload.backgroundPath,
        payload.backgroundRotation,
        payload.orientation,
        payload.fieldsJson,
        eventId,
      ],
    );
  }
}

module.exports = { EventRepository };
