const { PUBLIC_PORTAL_SESSION_KEY } = require('../../../application/services/AccessService');
const { emitEventUpdate } = require('../../../infrastructure/realtime/socket');

function normalizeCategoryPayload(body) {
  return {
    name: body.name,
    description: body.description || null,
    quota: body.quota ? Number(body.quota) : null,
    isActive: body.isActive === 'on' ? 1 : 0,
    sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
  };
}

function resolveAccessType(req) {
  if (req.params.type) {
    return req.params.type;
  }

  return req.originalUrl.includes('/wristbands') ? 'wristband' : 'pass';
}

function normalizeRequestProfilePayload(body) {
  return {
    name: body.name,
    notes: body.notes || null,
    isActive: body.isActive === 'on',
    passQuota: body.passQuota || {},
    wristbandQuota: body.wristbandQuota || {},
  };
}

function normalizeAdminFilters(query) {
  return {
    query: query.q || '',
    profileId: query.profileId ? Number(query.profileId) : null,
    categoryId: query.categoryId ? Number(query.categoryId) : null,
    status: query.status || '',
    company: query.company || '',
  };
}

function normalizeRequestPayload(body) {
  return {
    categoryId: body.categoryId,
    fullName: body.fullName,
    companyName: body.companyName,
    phone: body.phone,
    email: body.email,
    notes: body.notes,
  };
}

function buildAccessController({ categoryService, accessService }) {
  return {
    async showTypePage(req, res) {
      const type = resolveAccessType(req);
      const data = await accessService.getTypeManagementPage(
        req.params.eventId,
        req.currentUser.id,
        type,
        normalizeAdminFilters(req.query),
        req.t,
      );

      return res.render('events/access-management', {
        pageTitle: `${data.event.name} · ${req.t(`nav.${type === 'pass' ? 'passes' : 'wristbands'}`)}`,
        activeEvent: data.event,
        accessType: type,
        categories: data.categories,
        profiles: data.profiles,
        requests: data.requests,
        requestSummary: data.summary,
        filters: normalizeAdminFilters(req.query),
        canManage: data.canManage,
      });
    },

    async createType(req, res) {
      const type = resolveAccessType(req);
      await categoryService.createCategory(
        req.params.eventId,
        req.currentUser.id,
        type,
        normalizeCategoryPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash(
        'success',
        type === 'pass' ? req.t('flash.passTypeCreated') : req.t('flash.wristbandTypeCreated'),
      );
      return res.redirect(`/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`);
    },

    async updateType(req, res) {
      const type = resolveAccessType(req);
      await categoryService.updateCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        type,
        normalizeCategoryPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.accessTypeUpdated'));
      return res.redirect(`/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`);
    },

    async destroyType(req, res) {
      const type = resolveAccessType(req);
      await categoryService.deleteCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        type,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.accessTypeDeleted'));
      return res.redirect(`/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`);
    },

    async showRequestProfiles(req, res) {
      const data = await accessService.getRequestProfilesPage(req.params.eventId, req.currentUser.id, req.t);

      return res.render('events/request-profiles', {
        pageTitle: `${data.event.name} · ${req.t('nav.requestProfiles')}`,
        activeEvent: data.event,
        passCategories: data.passCategories,
        wristbandCategories: data.wristbandCategories,
        profiles: data.profiles,
      });
    },

    async createRequestProfile(req, res) {
      const result = await accessService.createRequestProfile(
        req.params.eventId,
        req.currentUser.id,
        normalizeRequestProfilePayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.requestProfileCreated', { code: result.accessCode }));
      return res.redirect(`/events/${req.params.eventId}/request-profiles`);
    },

    async updateRequestProfile(req, res) {
      await accessService.updateRequestProfile(
        req.params.eventId,
        req.params.profileId,
        req.currentUser.id,
        normalizeRequestProfilePayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.requestProfileUpdated'));
      return res.redirect(`/events/${req.params.eventId}/request-profiles`);
    },

    async destroyRequestProfile(req, res) {
      await accessService.deleteRequestProfile(
        req.params.eventId,
        req.params.profileId,
        req.currentUser.id,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.requestProfileDeleted'));
      return res.redirect(`/events/${req.params.eventId}/request-profiles`);
    },

    async regenerateRequestProfileCode(req, res) {
      const accessCode = await accessService.regenerateRequestProfileCode(
        req.params.eventId,
        req.params.profileId,
        req.currentUser.id,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.requestProfileCodeRegenerated', { code: accessCode }));
      return res.redirect(`/events/${req.params.eventId}/request-profiles`);
    },

    async updateRequestStatus(req, res) {
      const type = resolveAccessType(req);
      const event = await accessService.updateRequestStatus(
        req.params.eventId,
        req.params.requestId,
        req.currentUser.id,
        type,
        req.body.status,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, event.id, 'dashboard:refresh', {
        eventId: event.id,
      });
      req.flash('success', req.t('flash.requestStatusUpdated'));
      return res.redirect(`/events/${event.id}/${type === 'pass' ? 'passes' : 'wristbands'}`);
    },

    async showPortalLogin(req, res) {
      const profile = await accessService.getPortalLoginPage(req.params.publicSlug);

      return res.render('public-portal/login', {
        pageTitle: `${profile.name} · ${req.t('portal.login.title')}`,
        profile,
        layout: 'layout',
      });
    },

    async authorizePortal(req, res) {
      await accessService.authorizePublicProfile(
        req.params.publicSlug,
        req.body.accessCode,
        req.session,
        req.t,
      );

      req.flash('success', req.t('flash.portalAccessGranted'));
      return res.redirect(`/portal/${req.params.publicSlug}/manage`);
    },

    async showPortal(req, res) {
      const portalSession = req.session[PUBLIC_PORTAL_SESSION_KEY] || {};

      if (Number(portalSession[req.params.publicSlug] || 0) <= 0) {
        return res.redirect(`/portal/${req.params.publicSlug}`);
      }

      const data = await accessService.getPublicPortal(req.params.publicSlug, req.session, req.t);

      return res.render('public-portal/manage', {
        pageTitle: `${data.profile.name} · ${req.t('portal.manage.title')}`,
        profile: data.profile,
        passQuotaUsage: data.passQuotaUsage,
        wristbandQuotaUsage: data.wristbandQuotaUsage,
        passPortalOpen: data.passPortalOpen,
        wristbandPortalOpen: data.wristbandPortalOpen,
        canCreatePassRequests: data.canCreatePassRequests,
        canCreateWristbandRequests: data.canCreateWristbandRequests,
        passRequests: data.passRequests,
        wristbandRequests: data.wristbandRequests,
      });
    },

    async createPortalRequest(req, res) {
      const eventId = await accessService.createPortalRequest(
        req.params.publicSlug,
        req.session,
        req.params.type,
        normalizeRequestPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      req.flash('success', req.t('flash.portalRequestCreated'));
      return res.redirect(`/portal/${req.params.publicSlug}/manage`);
    },

    async updatePortalRequest(req, res) {
      const eventId = await accessService.updatePortalRequest(
        req.params.publicSlug,
        req.session,
        req.params.type,
        req.params.requestId,
        normalizeRequestPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      req.flash('success', req.t('flash.portalRequestUpdated'));
      return res.redirect(`/portal/${req.params.publicSlug}/manage`);
    },

    async destroyPortalRequest(req, res) {
      const eventId = await accessService.deletePortalRequest(
        req.params.publicSlug,
        req.session,
        req.params.type,
        req.params.requestId,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      req.flash('success', req.t('flash.portalRequestDeleted'));
      return res.redirect(`/portal/${req.params.publicSlug}/manage`);
    },

    async logoutPortal(req, res) {
      await accessService.clearPublicProfileAccess(req.params.publicSlug, req.session);
      req.flash('success', req.t('flash.portalLoggedOut'));
      return res.redirect(`/portal/${req.params.publicSlug}`);
    },
  };
}

module.exports = { buildAccessController };
