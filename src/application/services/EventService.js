const { AppError } = require('../../shared/errors/AppError');
const { EVENT_ROLES, MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
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

    await this.eventRepository.delete(eventId);
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

    if (event.role !== EVENT_ROLES.OWNER) {
      throw new AppError(tx('service.event.ownerRemovesMembers'), 403);
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
