const crypto = require('crypto');
const { env } = require('../../config/env');
const { AppError } = require('../../shared/errors/AppError');
const { EVENT_ROLES, MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

class EventService {
  constructor({ pool, eventRepository, userRepository, auditLogService, dashboardRepository }) {
    this.pool = pool;
    this.eventRepository = eventRepository;
    this.userRepository = userRepository;
    this.auditLogService = auditLogService;
    this.dashboardRepository = dashboardRepository;
  }

  async listUserEvents(userId) {
    return this.eventRepository.listForUser(userId);
  }

  buildVehicleCheckUrl(token) {
    if (!token) {
      return '';
    }

    return `${env.appUrl.replace(/\/$/, '')}/check/${encodeURIComponent(token)}`;
  }

  buildVehicleGateApiUrl(token) {
    if (!token) {
      return '';
    }

    return `${env.appUrl.replace(/\/$/, '')}/api/external/events/${encodeURIComponent(token)}/vehicle-decisions`;
  }

  async generateUniqueVehicleCheckToken() {
    for (let index = 0; index < 12; index += 1) {
      const token = crypto.randomBytes(20).toString('hex');
      const existingEvent = await this.eventRepository.findByVehicleCheckToken(token);

      if (!existingEvent) {
        return token;
      }
    }

    throw new Error('Unable to generate a unique vehicle check token');
  }

  async generateUniqueVehicleGateApiToken() {
    for (let index = 0; index < 12; index += 1) {
      const token = crypto.randomBytes(20).toString('hex');
      const existingEvent = await this.eventRepository.findByVehicleGateApiToken(token);

      if (!existingEvent) {
        return token;
      }
    }

    throw new Error('Unable to generate a unique vehicle gate API token');
  }

  generateVehicleGateApiKey() {
    return crypto.randomBytes(24).toString('hex');
  }

  async createEvent(actorId, payload, t) {
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Event creation also inserts the owner membership and first audit entry.
      const eventId = await this.eventRepository.create(connection, {
        ownerId: actorId,
        ...payload,
      });

      await this.eventRepository.addMember(connection, {
        eventId,
        userId: actorId,
        role: EVENT_ROLES.OWNER,
        invitedByUserId: actorId,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'event',
          entityId: eventId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.eventCreated', { name: payload.name }),
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.eventCreated', {
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();
      return this.eventRepository.findAccessibleById(eventId, actorId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async getEventAccessOrFail(eventId, userId, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventRepository.findAccessibleById(eventId, userId);

    if (!event) {
      throw new AppError(tx('service.event.accessDenied'), 403);
    }

    return event;
  }

  async getEventDashboard(eventId, userId, t) {
    const event = await this.getEventAccessOrFail(eventId, userId, t);
    const summary = await this.dashboardRepository.getEventSummary(eventId);
    const members = await this.eventRepository.listMembers(eventId);
    const recentActivity = await this.auditLogService.listByEvent(eventId);

    return {
      event,
      summary,
      members,
      recentActivity,
    };
  }

  async generateVehicleCheckLink(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(currentEvent.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const token = await this.generateUniqueVehicleCheckToken();
    const hadExistingLink = Boolean(currentEvent.vehicle_check_token);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.eventRepository.updateVehicleCheckToken(connection, eventId, token);

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'event',
          entityId: eventId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.vehicleCheckLinkGenerated', {
            name: currentEvent.name,
          }),
          beforeState: {
            hasVehicleCheckLink: hadExistingLink,
          },
          afterState: {
            hasVehicleCheckLink: true,
            regenerated: hadExistingLink,
          },
          metadata: buildAuditMetadata('audit.message.vehicleCheckLinkGenerated', {
            name: currentEvent.name,
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

    const event = await this.eventRepository.findAccessibleById(eventId, actorId);

    return {
      event,
      hadExistingLink,
      link: this.buildVehicleCheckUrl(token),
    };
  }

  async getPublicVehicleCheckEventOrFail(token, t) {
    const tx = resolveTranslate(t);
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
      throw new AppError(tx('service.vehicleEntry.checkLinkInvalid'), 404);
    }

    const event = await this.eventRepository.findByVehicleCheckToken(normalizedToken);

    if (!event) {
      throw new AppError(tx('service.vehicleEntry.checkLinkInvalid'), 404);
    }

    return event;
  }

  async getVehicleGateApiEventOrFail(token, t) {
    const tx = resolveTranslate(t);
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
      throw new AppError(tx('service.vehicleEntry.gateApiInvalid'), 404);
    }

    const event = await this.eventRepository.findByVehicleGateApiToken(normalizedToken);

    if (!event) {
      throw new AppError(tx('service.vehicleEntry.gateApiInvalid'), 404);
    }

    return event;
  }

  async updateVehicleGateApiConfig(eventId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(currentEvent.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const authMode = payload.authMode === 'none' ? 'none' : 'api_key';
    const mode = ['decision', 'entry', 'exit'].includes(payload.mode) ? payload.mode : 'decision';
    const dedupeSeconds = Math.max(0, Math.min(3600, Number(payload.dedupeSeconds || 180)));
    const token = currentEvent.vehicle_gate_api_token || await this.generateUniqueVehicleGateApiToken();
    const generatedToken = !currentEvent.vehicle_gate_api_token;
    const apiKey = authMode === 'api_key'
      ? (currentEvent.vehicle_gate_api_key || this.generateVehicleGateApiKey())
      : null;
    const generatedApiKey = authMode === 'api_key' && !currentEvent.vehicle_gate_api_key;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.eventRepository.updateVehicleGateApiConfig(connection, eventId, {
        token,
        authMode,
        apiKey,
        mode,
        dedupeSeconds,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'event',
          entityId: eventId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.vehicleGateApiUpdated', {
            name: currentEvent.name,
          }),
          beforeState: {
            hasVehicleGateApiToken: Boolean(currentEvent.vehicle_gate_api_token),
            vehicleGateApiAuthMode: currentEvent.vehicle_gate_api_auth_mode || 'api_key',
            hasVehicleGateApiKey: Boolean(currentEvent.vehicle_gate_api_key),
            vehicleGateApiMode: currentEvent.vehicle_gate_api_mode || 'decision',
            vehicleGateApiDedupeSeconds: Number(currentEvent.vehicle_gate_api_dedupe_seconds || 180),
          },
          afterState: {
            hasVehicleGateApiToken: true,
            vehicleGateApiAuthMode: authMode,
            hasVehicleGateApiKey: Boolean(apiKey),
            vehicleGateApiMode: mode,
            vehicleGateApiDedupeSeconds: dedupeSeconds,
            generatedToken,
            generatedApiKey,
          },
          metadata: buildAuditMetadata('audit.message.vehicleGateApiUpdated', {
            name: currentEvent.name,
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

    const event = await this.eventRepository.findAccessibleById(eventId, actorId);

    return {
      event,
      generatedToken,
      generatedApiKey,
      endpointUrl: this.buildVehicleGateApiUrl(token),
    };
  }

  async regenerateVehicleGateApi(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(currentEvent.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    const token = await this.generateUniqueVehicleGateApiToken();
    const authMode = currentEvent.vehicle_gate_api_auth_mode === 'none' ? 'none' : 'api_key';
    const apiKey = authMode === 'api_key' ? this.generateVehicleGateApiKey() : null;
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.eventRepository.updateVehicleGateApiConfig(connection, eventId, {
        token,
        authMode,
        apiKey,
        mode: currentEvent.vehicle_gate_api_mode || 'decision',
        dedupeSeconds: Number(currentEvent.vehicle_gate_api_dedupe_seconds || 180),
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: 'event',
          entityId: eventId,
          action: 'updated',
          message: translate(DEFAULT_LOCALE, 'audit.message.vehicleGateApiRegenerated', {
            name: currentEvent.name,
          }),
          beforeState: {
            hasVehicleGateApiToken: Boolean(currentEvent.vehicle_gate_api_token),
            vehicleGateApiAuthMode: currentEvent.vehicle_gate_api_auth_mode || 'api_key',
            hasVehicleGateApiKey: Boolean(currentEvent.vehicle_gate_api_key),
          },
          afterState: {
            hasVehicleGateApiToken: true,
            vehicleGateApiAuthMode: authMode,
            hasVehicleGateApiKey: Boolean(apiKey),
            regenerated: true,
          },
          metadata: buildAuditMetadata('audit.message.vehicleGateApiRegenerated', {
            name: currentEvent.name,
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

    const event = await this.eventRepository.findAccessibleById(eventId, actorId);

    return {
      event,
      apiKey,
      endpointUrl: this.buildVehicleGateApiUrl(token),
    };
  }

  assertVehicleGateApiAuthorized(event, providedApiKey, t) {
    const tx = resolveTranslate(t);
    const authMode = event?.vehicle_gate_api_auth_mode === 'none' ? 'none' : 'api_key';

    if (authMode === 'none') {
      return;
    }

    const expectedApiKey = String(event?.vehicle_gate_api_key || '').trim();

    if (!expectedApiKey) {
      throw new AppError(tx('service.vehicleEntry.apiUnavailable'), 503);
    }

    if (!safeCompare(providedApiKey, expectedApiKey)) {
      throw new AppError(tx('service.vehicleEntry.forbidden'), 403);
    }
  }

  async updateEvent(eventId, actorId, payload, t) {
    const tx = resolveTranslate(t);
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(currentEvent.role)) {
      throw new AppError(tx('service.event.editRequiresManager'), 403);
    }

    await this.eventRepository.update(eventId, payload);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event',
      entityId: eventId,
      action: 'updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.eventUpdated', { name: payload.name }),
      beforeState: currentEvent,
      afterState: payload,
      metadata: buildAuditMetadata('audit.message.eventUpdated', {
        name: payload.name,
      }),
    });

    return this.eventRepository.findAccessibleById(eventId, actorId);
  }

  async deleteEvent(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (currentEvent.role !== EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.deleteRequiresOwner'), 403);
    }

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event',
      entityId: eventId,
      action: 'deleted',
      message: translate(DEFAULT_LOCALE, 'audit.message.eventDeleted', { name: currentEvent.name }),
      beforeState: currentEvent,
      metadata: buildAuditMetadata('audit.message.eventDeleted', {
        name: currentEvent.name,
      }),
    });

    await this.eventRepository.delete(eventId, actorId);
  }

  async restoreEvent(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const actorEvent = await this.eventRepository.findAnyById(eventId);

    if (!actorEvent) {
      throw new AppError(tx('service.event.accessDenied'), 404);
    }

    const membership = await this.eventRepository.findMember(eventId, actorId);

    if (!membership || membership.role !== EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.deleteRequiresOwner'), 403);
    }

    await this.eventRepository.restore(eventId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event',
      entityId: eventId,
      action: 'restored',
      message: translate(DEFAULT_LOCALE, 'audit.message.eventRestored', { name: actorEvent.name }),
      afterState: actorEvent,
      metadata: buildAuditMetadata('audit.message.eventRestored', {
        name: actorEvent.name,
      }),
    });
  }

  async getMembers(eventId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.manageCollaborators'), 403);
    }

    const members = await this.eventRepository.listMembers(eventId);

    return {
      event,
      members,
    };
  }

  async addMember(eventId, actorId, { email, role }, t) {
    const tx = resolveTranslate(t);
    const event = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.addCollaborators'), 403);
    }

    const user = await this.userRepository.findForInvitation(email);

    if (!user) {
      throw new AppError(tx('service.event.userNotRegistered'), 404);
    }

    if (!user.is_active || user.deleted_at) {
      throw new AppError(tx('service.event.userNotRegistered'), 404);
    }

    const existingMember = await this.eventRepository.findMember(eventId, user.id);

    if (existingMember) {
      throw new AppError(tx('service.event.userAlreadyMember'), 409);
    }

    await this.eventRepository.addMember(this.pool, {
      eventId,
      userId: user.id,
      role,
      invitedByUserId: actorId,
    });

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event_user',
      entityId: user.id,
      action: 'added',
      message: translate(DEFAULT_LOCALE, 'audit.message.memberAdded', {
        name: user.full_name,
        role: translate(DEFAULT_LOCALE, `roles.${role}`),
      }),
      afterState: { userId: user.id, email: user.email, role },
      metadata: buildAuditMetadata('audit.message.memberAdded', {
        name: user.full_name,
        role: tx(`roles.${role}`),
      }),
    });

    return user;
  }

  async updateMemberRole(eventId, targetUserId, actorId, role, t) {
    const tx = resolveTranslate(t);
    const event = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (event.role !== EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.ownerChangesRoles'), 403);
    }

    const existingMember = await this.eventRepository.findMember(eventId, targetUserId);

    if (!existingMember) {
      throw new AppError(tx('service.event.memberNotFound'), 404);
    }

    if (existingMember.role === EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.ownerRoleLocked'), 400);
    }

    await this.eventRepository.updateMemberRole(eventId, targetUserId, role);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event_user',
      entityId: targetUserId,
      action: 'role_updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.memberRoleUpdated', {
        role: translate(DEFAULT_LOCALE, `roles.${role}`),
      }),
      beforeState: existingMember,
      afterState: { ...existingMember, role },
      metadata: buildAuditMetadata('audit.message.memberRoleUpdated', {
        role: tx(`roles.${role}`),
      }),
    });
  }

  async removeMember(eventId, targetUserId, actorId, t) {
    const tx = resolveTranslate(t);
    const event = await this.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.event.manageCollaborators'), 403);
    }

    if (Number(targetUserId) === Number(actorId)) {
      throw new AppError(tx('service.event.cannotRemoveSelf'), 400);
    }

    const existingMember = await this.eventRepository.findMember(eventId, targetUserId);

    if (!existingMember) {
      throw new AppError(tx('service.event.memberNotFound'), 404);
    }

    if (existingMember.role === EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.ownerCannotBeRemoved'), 400);
    }

    await this.eventRepository.removeMember(eventId, targetUserId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event_user',
      entityId: targetUserId,
      action: 'removed',
      message: translate(DEFAULT_LOCALE, 'audit.message.memberRemoved'),
      beforeState: existingMember,
      metadata: buildAuditMetadata('audit.message.memberRemoved'),
    });
  }
}

module.exports = { EventService };
