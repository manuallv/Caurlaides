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

function normalizeVehicleGateApiPayload(body) {
  return {
    authMode: body.authMode,
    mode: body.mode,
    dedupeSeconds: body.dedupeSeconds ? Number(body.dedupeSeconds) : 180,
  };
}

function buildEventController({ eventService, auditLogService }) {
  return {
    showCreateForm(req, res) {
      res.render('events/form', {
        pageTitle: req.t('event.form.createTitle'),
        event: {
          status: 'draft',
        },
        formAction: '/events',
        formMethod: 'POST',
        submitLabel: req.t('event.form.createSubmit'),
        activeEvent: null,
      });
    },

    async create(req, res) {
      const event = await eventService.createEvent(req.currentUser.id, normalizeEventPayload(req.body), req.t);
      req.flash('success', req.t('flash.eventCreated'));
      return res.redirect(`/events/${event.id}`);
    },

    async showDashboard(req, res) {
      const data = await eventService.getEventDashboard(req.params.eventId, req.currentUser.id, req.t);

      res.render('events/show', {
        pageTitle: data.event.name,
        activeEvent: data.event,
        summary: data.summary,
        members: data.members,
        recentActivity: data.recentActivity,
        canManage: MANAGEMENT_ROLES.includes(data.event.role),
        vehicleCheckLink: eventService.buildVehicleCheckUrl(data.event.vehicle_check_token),
        vehicleCheckApiUrl: eventService.buildVehicleGateApiUrl(data.event.vehicle_gate_api_token),
        vehicleCheckApiConfigured:
          data.event.vehicle_gate_api_auth_mode === 'none' || Boolean(data.event.vehicle_gate_api_key),
      });
    },

    async showEditForm(req, res) {
      const event = await eventService.getEventAccessOrFail(req.params.eventId, req.currentUser.id, req.t);

      if (!MANAGEMENT_ROLES.includes(event.role)) {
        req.flash('error', req.t('service.event.editRequiresManager'));
        return res.redirect(`/events/${event.id}`);
      }

      return res.render('events/form', {
        pageTitle: req.t('event.form.editTitle', { name: event.name }),
        event,
        formAction: `/events/${event.id}?_method=PUT`,
        formMethod: 'POST',
        submitLabel: req.t('event.form.saveSubmit'),
        activeEvent: event,
      });
    },

    async update(req, res) {
      const event = await eventService.updateEvent(
        req.params.eventId,
        req.currentUser.id,
        normalizeEventPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, event.id, 'dashboard:refresh', { eventId: event.id });
      req.flash('success', req.t('flash.eventUpdated'));
      return res.redirect(`/events/${event.id}`);
    },

    async destroy(req, res) {
      await eventService.deleteEvent(req.params.eventId, req.currentUser.id, req.t);
      req.flash('success', req.t('flash.eventDeleted'));
      return res.redirect('/dashboard');
    },

    async showMembers(req, res) {
      const data = await eventService.getMembers(req.params.eventId, req.currentUser.id, req.t);

      return res.render('events/members', {
        pageTitle: `${data.event.name} · ${req.t('event.collaborators')}`,
        activeEvent: data.event,
        members: data.members,
        canManageMembers: MANAGEMENT_ROLES.includes(data.event.role),
        canChangeRoles: data.event.role === EVENT_ROLES.OWNER,
        canRemoveMembers: MANAGEMENT_ROLES.includes(data.event.role),
      });
    },

    async addMember(req, res) {
      await eventService.addMember(req.params.eventId, req.currentUser.id, {
        email: req.body.email,
        role: req.body.role,
      }, req.t);

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.collaboratorAdded'));
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async updateMemberRole(req, res) {
      await eventService.updateMemberRole(
        req.params.eventId,
        req.params.userId,
        req.currentUser.id,
        req.body.role,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.collaboratorRoleUpdated'));
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async removeMember(req, res) {
      await eventService.removeMember(req.params.eventId, req.params.userId, req.currentUser.id, req.t);
      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.collaboratorRemoved'));
      return res.redirect(`/events/${req.params.eventId}/members`);
    },

    async showAuditLog(req, res) {
      const event = await eventService.getEventAccessOrFail(req.params.eventId, req.currentUser.id, req.t);
      const activity = await auditLogService.listByEvent(req.params.eventId, 100);

      return res.render('events/audit-log', {
        pageTitle: `${event.name} · ${req.t('nav.activity')}`,
        activeEvent: event,
        activity,
      });
    },

    async generateVehicleCheckLink(req, res) {
      const result = await eventService.generateVehicleCheckLink(req.params.eventId, req.currentUser.id, req.t);

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash(
        'success',
        req.t(result.hadExistingLink ? 'flash.vehicleCheckLinkRegenerated' : 'flash.vehicleCheckLinkGenerated'),
      );
      return res.redirect(`/events/${req.params.eventId}#vehicle-check-link`);
    },

    async updateVehicleGateApi(req, res) {
      await eventService.updateVehicleGateApiConfig(
        req.params.eventId,
        req.currentUser.id,
        normalizeVehicleGateApiPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.vehicleGateApiSaved'));
      return res.redirect(`/events/${req.params.eventId}#vehicle-check-api`);
    },

    async regenerateVehicleGateApi(req, res) {
      await eventService.regenerateVehicleGateApi(req.params.eventId, req.currentUser.id, req.t);

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.vehicleGateApiRegenerated'));
      return res.redirect(`/events/${req.params.eventId}#vehicle-check-api`);
    },
  };
}

module.exports = { buildEventController };
