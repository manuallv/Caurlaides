const { AppError } = require('../../shared/errors/AppError');
const { EVENT_ROLES, MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');

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

  async createEvent(actorId, payload) {
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
          message: `Created event "${payload.name}".`,
          afterState: payload,
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

  async getEventAccessOrFail(eventId, userId) {
    const event = await this.eventRepository.findAccessibleById(eventId, userId);

    if (!event) {
      throw new AppError('You do not have access to that event.', 403);
    }

    return event;
  }

  async getEventDashboard(eventId, userId) {
    const event = await this.getEventAccessOrFail(eventId, userId);
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

  async updateEvent(eventId, actorId, payload) {
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(currentEvent.role)) {
      throw new AppError('Only owners and admins can edit this event.', 403);
    }

    await this.eventRepository.update(eventId, payload);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event',
      entityId: eventId,
      action: 'updated',
      message: `Updated event "${payload.name}".`,
      beforeState: currentEvent,
      afterState: payload,
    });

    return this.eventRepository.findAccessibleById(eventId, actorId);
  }

  async deleteEvent(eventId, actorId) {
    const currentEvent = await this.getEventAccessOrFail(eventId, actorId);

    if (currentEvent.role !== EVENT_ROLES.OWNER) {
      throw new AppError('Only the event owner can delete this event.', 403);
    }

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event',
      entityId: eventId,
      action: 'deleted',
      message: `Deleted event "${currentEvent.name}".`,
      beforeState: currentEvent,
    });

    await this.eventRepository.delete(eventId);
  }

  async getMembers(eventId, actorId) {
    const event = await this.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError('Only owners and admins can manage collaborators.', 403);
    }

    const members = await this.eventRepository.listMembers(eventId);

    return {
      event,
      members,
    };
  }

  async addMember(eventId, actorId, { email, role }) {
    const event = await this.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError('Only owners and admins can add collaborators.', 403);
    }

    const user = await this.userRepository.findForInvitation(email);

    if (!user) {
      throw new AppError('That user is not registered yet. Ask them to create an account first.', 404);
    }

    const existingMember = await this.eventRepository.findMember(eventId, user.id);

    if (existingMember) {
      throw new AppError('That user is already part of this event.', 409);
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
      message: `Added ${user.full_name} as ${role}.`,
      afterState: { userId: user.id, email: user.email, role },
    });

    return user;
  }

  async updateMemberRole(eventId, targetUserId, actorId, role) {
    const event = await this.getEventAccessOrFail(eventId, actorId);

    if (event.role !== EVENT_ROLES.OWNER) {
      throw new AppError('Only the owner can change collaborator roles.', 403);
    }

    const existingMember = await this.eventRepository.findMember(eventId, targetUserId);

    if (!existingMember) {
      throw new AppError('Collaborator not found.', 404);
    }

    if (existingMember.role === EVENT_ROLES.OWNER) {
      throw new AppError('Owner role cannot be changed from this screen.', 400);
    }

    await this.eventRepository.updateMemberRole(eventId, targetUserId, role);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event_user',
      entityId: targetUserId,
      action: 'role_updated',
      message: `Updated collaborator role to ${role}.`,
      beforeState: existingMember,
      afterState: { ...existingMember, role },
    });
  }

  async removeMember(eventId, targetUserId, actorId) {
    const event = await this.getEventAccessOrFail(eventId, actorId);

    if (event.role !== EVENT_ROLES.OWNER) {
      throw new AppError('Only the owner can remove collaborators.', 403);
    }

    const existingMember = await this.eventRepository.findMember(eventId, targetUserId);

    if (!existingMember) {
      throw new AppError('Collaborator not found.', 404);
    }

    if (existingMember.role === EVENT_ROLES.OWNER) {
      throw new AppError('The owner cannot be removed.', 400);
    }

    await this.eventRepository.removeMember(eventId, targetUserId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: 'event_user',
      entityId: targetUserId,
      action: 'removed',
      message: 'Removed collaborator from the event.',
      beforeState: existingMember,
    });
  }
}

module.exports = { EventService };
