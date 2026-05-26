const { DEFAULT_LOCALE, normalizeLocale } = require('../../../shared/i18n');

function normalizeStoredEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeStoredLocale(locale) {
  return normalizeLocale(locale) || DEFAULT_LOCALE;
}

function buildEmailLookupCandidates(email) {
  const normalizedEmail = normalizeStoredEmail(email);
  const candidates = [normalizedEmail].filter(Boolean);
  const [localPart, domain] = normalizedEmail.split('@');

  if (localPart && ['gmail.com', 'googlemail.com'].includes(domain)) {
    const dotlessLocalPart = localPart.split('+')[0].replace(/\./g, '');
    const domains = domain === 'googlemail.com' ? ['googlemail.com', 'gmail.com'] : ['gmail.com', 'googlemail.com'];

    for (const candidateDomain of domains) {
      const candidate = `${dotlessLocalPart}@${candidateDomain}`;

      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async create({ fullName, email, phone = null, passwordHash, isActive = 1, preferredLocale = DEFAULT_LOCALE }) {
    const [result] = await this.pool.execute(
      `
        INSERT INTO users (full_name, email, phone, preferred_locale, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [fullName, normalizeStoredEmail(email), phone, normalizeStoredLocale(preferredLocale), passwordHash, isActive ? 1 : 0],
    );

    return this.findById(result.insertId);
  }

  async findByEmail(email) {
    const candidates = buildEmailLookupCandidates(email);

    if (!candidates.length) {
      return null;
    }

    const placeholders = candidates.map(() => '?').join(', ');
    const [rows] = await this.pool.execute(
      `
        SELECT
          id,
          full_name,
          email,
          phone,
          preferred_locale,
          password_hash,
          last_login_at,
          is_active,
          deleted_at,
          created_at,
          updated_at
        FROM users
        WHERE email IN (${placeholders})
        ORDER BY FIELD(email, ${placeholders})
        LIMIT 1
      `,
      [...candidates, ...candidates],
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
          preferred_locale,
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
    const candidates = buildEmailLookupCandidates(email);

    if (!candidates.length) {
      return null;
    }

    const placeholders = candidates.map(() => '?').join(', ');
    const [rows] = await this.pool.execute(
      `
        SELECT id, full_name, email, phone, preferred_locale, is_active, deleted_at
        FROM users
        WHERE email IN (${placeholders})
          AND is_active = 1
          AND deleted_at IS NULL
        ORDER BY FIELD(email, ${placeholders})
        LIMIT 1
      `,
      [...candidates, ...candidates],
    );

    return rows[0] || null;
  }

  async searchActiveForEventInvitation(query, { excludeEventId = null, limit = 8 } = {}) {
    const normalizedQuery = String(query || '').trim().toLowerCase();

    if (normalizedQuery.length < 2) {
      return [];
    }

    const searchTerm = `%${normalizedQuery}%`;
    const eventExclusionJoin = excludeEventId
      ? 'LEFT JOIN event_users eu ON eu.user_id = u.id AND eu.event_id = ?'
      : '';
    const eventExclusionCondition = excludeEventId
      ? 'AND eu.user_id IS NULL'
      : '';
    const params = [];

    if (excludeEventId) {
      params.push(excludeEventId);
    }

    params.push(searchTerm, searchTerm, Number(limit || 8));

    const [rows] = await this.pool.execute(
      `
        SELECT
          u.id,
          u.full_name,
          u.email,
          u.phone
        FROM users u
        ${eventExclusionJoin}
        WHERE u.is_active = 1
          AND u.deleted_at IS NULL
          ${eventExclusionCondition}
          AND (
            LOWER(u.full_name) LIKE ?
            OR LOWER(u.email) LIKE ?
          )
        ORDER BY
          CASE
            WHEN LOWER(u.email) = ? THEN 0
            WHEN LOWER(u.email) LIKE ? THEN 1
            WHEN LOWER(u.full_name) LIKE ? THEN 2
            ELSE 3
          END,
          u.full_name ASC,
          u.email ASC
        LIMIT ?
      `,
      [
        ...params.slice(0, excludeEventId ? 3 : 2),
        normalizedQuery,
        `${normalizedQuery}%`,
        `${normalizedQuery}%`,
        ...params.slice(excludeEventId ? 3 : 2),
      ],
    );

    return rows;
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
          u.preferred_locale,
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
          preferred_locale = COALESCE(preferred_locale, ?),
          is_active = ?,
          deleted_at = CASE WHEN ? = 1 THEN NULL ELSE deleted_at END,
          deleted_by_user_id = CASE WHEN ? = 1 THEN NULL ELSE deleted_by_user_id END
        WHERE id = ?
      `,
      [
        fullName,
        normalizeStoredEmail(email),
        phone,
        DEFAULT_LOCALE,
        isActive ? 1 : 0,
        isActive ? 1 : 0,
        isActive ? 1 : 0,
        userId,
      ],
    );
  }

  async updatePreferredLocale(userId, preferredLocale) {
    await this.pool.execute(
      `
        UPDATE users
        SET preferred_locale = ?
        WHERE id = ?
      `,
      [normalizeStoredLocale(preferredLocale), userId],
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
