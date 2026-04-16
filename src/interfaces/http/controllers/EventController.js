const { MANAGEMENT_ROLES, EVENT_ROLES } = require('../../../shared/constants/event-roles');
const { emitEventUpdate } = require('../../../infrastructure/realtime/socket');

function normalizeEventPayload(body) {
  return {
    name: body.name,
    description: body.description || null,
    startDate: body.startDate,
    endDate: body.endDate,
    location: body.location,
    status: body.status,
    passRequestDeadline: body.passRequestDeadline || null,
    wristbandRequestDeadline: body.wristbandRequestDeadline || null,
  };
}

function buildEventController({ eventService, auditLogService }) {
  return {
    showCreateForm(req, res) {
      res.render('events/form', {
        pageTitle: 'Create event',
        event: {
          status: 'draft',
        },
        formAction: '/events',
        formMethod: 'POST',
        submitLabel: 'Create event',
        activeEvent: null,
      });
    },

    async create(req, res) {
      const event = await eventService.createEvent(req.currentUser.id, normalizeEventPayload(req.body));
      req.flash('success', 'Event created successfully.');
      return res.redirect(`/events/${event.id}`);
    },

    async showDashboard(req, res) {
      const data = await eventService.getEventDashboard(req.params.eventId, req.currentUser.id);

      res.render('events/show', {
        pageTitle: data.event.name,
        activeEvent: data.event,
        summary: data.summary,
        members: data.members,
        recentActivity: data.recentActivity,
        canManage: MANAGEMENT_ROLES.includes(data.event.role),
      });
    },

    async showEditForm(req, res) {
      const event = await eventService.getEventAccessOrFail(req.params.eventId, req.currentUser.id);

      if (!MANAGEMENT_ROLES.includes(event.role)) {
        req.flash('error', 'Only owners and admins can edit this event.');
        return res.redirect(`/events/${event.id}`);
      }

      return res.render('events/form', {
        pageTitle: `Edit ${event.name}`,
        event,
        formAction: `/events/${event.id}?_method=PUT`,
        formMethod: 'POST',
        submitLabel: 'Save changes',
        activeEvent: event,
      });
    },

    async update(req, res) {
      const event = await eventService.updateEvent(
        req.params.eventId,
        req.currentUser.id,
        normalizeEventPayload(req.body),
      );

      emitEventUpdate(req.app.locals.io, event.id, 'dashboard:refresh', { eventId: event.id });
      req.flash('success', 'Event updated successfully.');
      return res.redirect(`/events/${event.id}`);
    },

    async destroy(req, res) {
      await eventService.deleteEvent(req.params.eventId, req.currentUser.id);
      req.flash('success', 'Event deleted successfully.');
      return res.redirect('/dashboard');
    },

    async showMembers(req, res) {
      const data = await eventService.getMembers(req.params.eventId, req.currentUser.id);

      return res.render('events/members', {
        pageTitle: `${data.event.name} collaborators`,
        activeEvent: data.event,
        members: data.members,
        canManageMembers: MANAGEMENT_ROLES.includes(data.event.role),
        canChangeRoles: data.event.role === EVENT_ROLES.OWNER,
      });
    },

    async addMember(req, res) {
      await eventService.addMember(req.params.eventId, req.currentUser.id, {
        email: req.body.email,
        role: req.body.role,
      });

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', 'Collaborator added successfully.');
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async updateMemberRole(req, res) {
      await eventService.updateMemberRole(
        req.params.eventId,
        req.params.userId,
        req.currentUser.id,
        req.body.role,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', 'Collaborator role updated.');
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async removeMember(req, res) {
      await eventService.removeMember(req.params.eventId, req.params.userId, req.currentUser.id);
      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', 'Collaborator removed.');
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async showAuditLog(req, res) {
      const event = await eventService.getEventAccessOrFail(req.params.eventId, req.currentUser.id);
      const activity = await auditLogService.listByEvent(req.params.eventId, 100);

      return res.render('events/audit-log', {
        pageTitle: `${event.name} activity`,
        activeEvent: event,
        activity,
      });
    },
  };
}

module.exports = { buildEventController };
