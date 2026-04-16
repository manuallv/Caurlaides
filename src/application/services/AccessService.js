const crypto = require('crypto');
const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');
const { comparePassword, hashPassword } = require('../../infrastructure/security/password');

const PUBLIC_PORTAL_SESSION_KEY = 'publicRequestProfiles';

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

function normalizeQuotaEntries(input = {}) {
  return Object.entries(input)
    .map(([categoryId, quota]) => ({
      categoryId: Number(categoryId),
      quota: Number(quota || 0),
    }))
    .filter((entry) => Number.isInteger(entry.categoryId) && entry.categoryId > 0 && entry.quota > 0);
}

function buildRequestPayload(body, fallbackCompanyName = null) {
  return {
    categoryId: Number(body.categoryId),
    fullName: body.fullName ? body.fullName.trim() : '',
    companyName: (body.companyName || fallbackCompanyName || '').trim() || null,
    phone: body.phone ? body.phone.trim() : null,
    email: body.email ? body.email.trim() : null,
    notes: body.notes ? body.notes.trim() : null,
  };
}

function withRemainingQuota(quotaUsage = []) {
  return quotaUsage.map((entry) => {
    const quota = Number(entry.quota || 0);
    const usedCount = Number(entry.used_count || 0);

    return {
      ...entry,
      quota,
      used_count: usedCount,
      remaining_count: Math.max(quota - usedCount, 0),
    };
  });
}

class AccessService {
  constructor({
    pool,
    categoryRepository,
    requestProfileRepository,
    requestRepository,
    eventService,
    auditLogService,
  }) {
    this.pool = pool;
    this.categoryRepository = categoryRepository;
    this.requestProfileRepository = requestProfileRepository;
    this.requestRepository = requestRepository;
    this.eventService = eventService;
    this.auditLogService = auditLogService;
  }

  getPublicProfileSession(session) {
    if (!session[PUBLIC_PORTAL_SESSION_KEY]) {
      session[PUBLIC_PORTAL_SESSION_KEY] = {};
    }

    return session[PUBLIC_PORTAL_SESSION_KEY];
  }

  generateAccessCode() {
    return crypto.randomBytes(4).toString('hex').slice(0, 8).toUpperCase();
  }

  async getTypeManagementPage(eventId, actorId, type, filters, t) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, t);
    const categories = await this.categoryRepository.listByEvent(eventId, type);
    const profiles = await this.requestProfileRepository.listByEvent(eventId);
    const requests = await this.requestRepository.listAdminRequests(eventId, type, filters);
    const summary = await this.requestRepository.getAdminSummary(eventId, type);

    const profileSummaries = await Promise.all(
      profiles.map(async (profile) => ({
        ...profile,
        quotaUsage: withRemainingQuota(await this.requestRepository.listQuotaUsage(profile.id, type)),
      })),
    );

    return {
      event,
      categories,
      profiles: profileSummaries,
      requests,
      summary,
      canManage: MANAGEMENT_ROLES.includes(event.role),
      type,
    };
  }

  async getRequestProfilesPage(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');
    const profiles = await this.requestProfileRepository.listByEvent(eventId);

    const enrichedProfiles = await Promise.all(
      profiles.map(async (profile) => ({
        ...profile,
        passQuotaUsage: withRemainingQuota(
          await this.requestRepository.listQuotaUsage(profile.id, 'pass'),
        ),
        wristbandQuotaUsage: withRemainingQuota(
          await this.requestRepository.listQuotaUsage(profile.id, 'wristband'),
        ),
      })),
    );

    return {
      event,
      passCategories,
      wristbandCategories,
      profiles: enrichedProfiles,
    };
  }

  async createRequestProfile(eventId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const passQuotas = normalizeQuotaEntries(payload.passQuota);
    const wristbandQuotas = normalizeQuotaEntries(payload.wristbandQuota);

    if (!passQuotas.length && !wristbandQuotas.length) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const accessCode = this.generateAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const maxPeople = [...passQuotas, ...wristbandQuotas].reduce((sum, entry) => sum + entry.quota, 0) || 1;

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const profileId = await this.requestProfileRepository.create(connection, {
        eventId,
        userId: actorId,
        name: payload.name,
        publicSlug: uuidv4(),
        accessCodeHash,
        maxPeople,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'pass', passQuotas);
      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'wristband', wristbandQuotas);

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileCreated', { name: payload.name }),
          afterState: {
            name: payload.name,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            passQuotas,
            wristbandQuotas,
          },
          metadata: buildAuditMetadata('audit.message.requestProfileCreated', {
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();

      return {
        profileId,
        accessCode,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateRequestProfile(eventId, profileId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    const passQuotas = normalizeQuotaEntries(payload.passQuota);
    const wristbandQuotas = normalizeQuotaEntries(payload.wristbandQuota);

    if (!passQuotas.length && !wristbandQuotas.length) {
      throw new AppError(tx('service.requestProfile.quotaRequired'), 422);
    }

    const maxPeople = [...passQuotas, ...wristbandQuotas].reduce((sum, entry) => sum + entry.quota, 0) || 1;

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      await this.requestProfileRepository.update(connection, profileId, {
        userId: actorId,
        name: payload.name,
        maxPeople,
        notes: payload.notes || null,
        isActive: payload.isActive ? 1 : 0,
      });

      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'pass', passQuotas);
      await this.requestProfileRepository.replaceQuotas(connection, profileId, 'wristband', wristbandQuotas);

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileUpdated', { name: payload.name }),
          beforeState: existingProfile,
          afterState: {
            name: payload.name,
            notes: payload.notes || null,
            isActive: payload.isActive ? 1 : 0,
            passQuotas,
            wristbandQuotas,
          },
          metadata: buildAuditMetadata('audit.message.requestProfileUpdated', {
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async deleteRequestProfile(eventId, profileId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    await this.requestProfileRepository.delete(profileId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'request_profile',
      entityId: profileId,
      action: 'deleted',
      message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileDeleted', { name: existingProfile.name }),
      beforeState: existingProfile,
      metadata: buildAuditMetadata('audit.message.requestProfileDeleted', {
        name: existingProfile.name,
      }),
    });
  }

  async regenerateRequestProfileCode(eventId, profileId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.requestProfile.manage'), 403);
    }

    const existingProfile = await this.requestProfileRepository.findById(profileId);

    if (!existingProfile || Number(existingProfile.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.requestProfile.notFound'), 404);
    }

    const accessCode = this.generateAccessCode();
    const accessCodeHash = await hashPassword(accessCode);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      await this.requestProfileRepository.updateAccessCode(connection, profileId, {
        accessCodeHash,
        userId: actorId,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'request_profile',
          entityId: profileId,
          action: 'code_regenerated',
          message: translate(DEFAULT_LOCALE, 'audit.message.requestProfileCodeRegenerated', {
            name: existingProfile.name,
          }),
          metadata: buildAuditMetadata('audit.message.requestProfileCodeRegenerated', {
            name: existingProfile.name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return accessCode;
  }

  async updateRequestStatus(eventId, requestId, actorId, type, status, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    await this.requestRepository.setStatus(type, requestId, {
      status,
      userId: actorId,
    });

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_request`,
      entityId: requestId,
      action: 'status_updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.requestStatusUpdated', {
        type: translate(DEFAULT_LOCALE, `accessType.${type}`),
        name: existingRequest.full_name,
        status: translate(DEFAULT_LOCALE, `statuses.${status}`),
      }),
      beforeState: existingRequest,
      afterState: { status },
      metadata: buildAuditMetadata('audit.message.requestStatusUpdated', {
        type: tx(`accessType.${type}`),
        name: existingRequest.full_name,
        status: tx(`statuses.${status}`),
      }),
    });

    return event;
  }

  async getPortalLoginPage(publicSlug) {
    const profile = await this.requestProfileRepository.findBySlug(publicSlug);

    if (!profile) {
      throw new AppError('Portal not found.', 404);
    }

    return profile;
  }

  async authorizePublicProfile(publicSlug, accessCode, session, t) {
    const tx = resolveTranslate(t);
    const profile = await this.requestProfileRepository.findBySlug(publicSlug);

    if (!profile || !profile.is_active) {
      throw new AppError(tx('service.portal.accessDenied'), 404);
    }

    const isValid = await comparePassword(accessCode, profile.access_code_hash);

    if (!isValid) {
      throw new AppError(tx('service.portal.codeInvalid'), 422);
    }

    this.getPublicProfileSession(session)[publicSlug] = profile.id;

    return profile;
  }

  async clearPublicProfileAccess(publicSlug, session) {
    const profileSession = this.getPublicProfileSession(session);
    delete profileSession[publicSlug];
  }

  async getPublicPortal(publicSlug, session, t) {
    const tx = resolveTranslate(t);
    const profile = await this.requestProfileRepository.findBySlug(publicSlug);

    if (!profile || !profile.is_active) {
      throw new AppError(tx('service.portal.accessDenied'), 404);
    }

    const profileSession = this.getPublicProfileSession(session);

    if (Number(profileSession[publicSlug]) !== Number(profile.id)) {
      throw new AppError(tx('service.portal.loginRequired'), 403);
    }

    const passQuotaUsage = withRemainingQuota(
      await this.requestRepository.listQuotaUsage(profile.id, 'pass'),
    );
    const wristbandQuotaUsage = withRemainingQuota(
      await this.requestRepository.listQuotaUsage(profile.id, 'wristband'),
    );
    const passRequests = await this.requestRepository.listProfileRequests(profile.id, 'pass');
    const wristbandRequests = await this.requestRepository.listProfileRequests(profile.id, 'wristband');
    const passPortalOpen = this.isPortalTypeOpen(profile, 'pass');
    const wristbandPortalOpen = this.isPortalTypeOpen(profile, 'wristband');

    return {
      profile,
      passQuotaUsage,
      wristbandQuotaUsage,
      passPortalOpen,
      wristbandPortalOpen,
      canCreatePassRequests:
        passPortalOpen && passQuotaUsage.some((quota) => Number(quota.remaining_count) > 0),
      canCreateWristbandRequests:
        wristbandPortalOpen && wristbandQuotaUsage.some((quota) => Number(quota.remaining_count) > 0),
      passRequests: passRequests.map((request) => ({
        ...request,
        isEditable: this.isPortalRequestEditable(profile, 'pass', request),
      })),
      wristbandRequests: wristbandRequests.map((request) => ({
        ...request,
        isEditable: this.isPortalRequestEditable(profile, 'wristband', request),
      })),
    };
  }

  async createPortalRequest(publicSlug, session, type, body, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(publicSlug, session, tx);
    const payload = buildRequestPayload(body, portal.profile.name);

    await this.assertPortalRequestAllowed(portal.profile, type, payload.categoryId, null, tx);

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const requestId = await this.requestRepository.create(connection, type, {
        eventId: portal.profile.event_id,
        requestProfileId: portal.profile.id,
        ...payload,
      });

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestCreated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: payload.fullName,
          }),
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.portalRequestCreated', {
            type: tx(`accessType.${type}`),
            name: payload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return portal.profile.event_id;
  }

  async updatePortalRequest(publicSlug, session, type, requestId, body, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(publicSlug, session, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.request_profile_id) !== Number(portal.profile.id)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    if (!this.isPortalRequestEditable(portal.profile, type, existingRequest)) {
      throw new AppError(tx('service.portal.requestLocked'), 409);
    }

    const payload = buildRequestPayload(body, portal.profile.name);
    await this.assertPortalRequestAllowed(portal.profile, type, payload.categoryId, requestId, tx);

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.update(connection, type, requestId, payload);

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestUpdated', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: payload.fullName,
          }),
          beforeState: existingRequest,
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.portalRequestUpdated', {
            type: tx(`accessType.${type}`),
            name: payload.fullName,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return portal.profile.event_id;
  }

  async deletePortalRequest(publicSlug, session, type, requestId, t) {
    const tx = resolveTranslate(t);
    const portal = await this.getPublicPortal(publicSlug, session, tx);
    const existingRequest = await this.requestRepository.findById(type, requestId);

    if (!existingRequest || Number(existingRequest.request_profile_id) !== Number(portal.profile.id)) {
      throw new AppError(tx('service.request.notFound'), 404);
    }

    if (!this.isPortalRequestEditable(portal.profile, type, existingRequest)) {
      throw new AppError(tx('service.portal.requestLocked'), 409);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.requestRepository.delete(connection, type, requestId);

      await this.auditLogService.record(
        {
          eventId: portal.profile.event_id,
          userId: null,
          entityType: `${type}_request`,
          entityId: requestId,
          action: 'deleted',
          message: translate(DEFAULT_LOCALE, 'audit.message.portalRequestDeleted', {
            type: translate(DEFAULT_LOCALE, `accessType.${type}`),
            name: existingRequest.full_name,
          }),
          beforeState: existingRequest,
          metadata: buildAuditMetadata('audit.message.portalRequestDeleted', {
            type: tx(`accessType.${type}`),
            name: existingRequest.full_name,
          }),
        },
        connection,
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return portal.profile.event_id;
  }

  isPortalRequestEditable(profile, type, request) {
    if (!request || request.status === 'handed_out') {
      return false;
    }

    if (!this.isPortalTypeOpen(profile, type)) {
      return false;
    }

    return true;
  }

  isPortalTypeOpen(profile, type) {
    const deadlineField = type === 'pass' ? 'pass_request_deadline' : 'wristband_request_deadline';
    const deadline = profile[deadlineField];

    if (!deadline) {
      return true;
    }

    return !dayjs().isAfter(dayjs(deadline));
  }

  async assertPortalRequestAllowed(profile, type, categoryId, excludeRequestId, t) {
    const tx = resolveTranslate(t);
    const quotaUsage = await this.requestRepository.listQuotaUsage(profile.id, type);
    const targetQuota = quotaUsage.find((quota) => Number(quota.category_id) === Number(categoryId));

    if (!targetQuota) {
      throw new AppError(tx('service.portal.categoryNotAllowed'), 422);
    }

    const usedCount = await this.requestRepository.countUsedQuota(
      profile.id,
      type,
      categoryId,
      excludeRequestId,
    );

    if (usedCount >= Number(targetQuota.quota || 0)) {
      throw new AppError(tx('service.portal.quotaReached'), 409);
    }

    const deadlineField = type === 'pass' ? 'pass_request_deadline' : 'wristband_request_deadline';

    if (profile[deadlineField] && dayjs().isAfter(dayjs(profile[deadlineField]))) {
      throw new AppError(tx('service.portal.deadlinePassed'), 409);
    }
  }
}

module.exports = { AccessService, PUBLIC_PORTAL_SESSION_KEY };
