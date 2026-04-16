const {
  PUBLIC_PORTAL_IMPORTS_KEY,
  PUBLIC_PORTAL_SESSION_KEY,
} = require('../../../application/services/AccessService');
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

function isAsyncRequest(req) {
  return req.get('X-Requested-With') === 'XMLHttpRequest' || req.xhr;
}

function sendMutationResponse(req, res, { redirectTo, message, payload = {} }) {
  if (isAsyncRequest(req)) {
    return res.json({
      success: true,
      message,
      ...payload,
    });
  }

  if (message) {
    req.flash('success', message);
  }

  return res.redirect(redirectTo);
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
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
        pageTitle: `${data.event.name} · ${req.t(type === 'pass' ? 'event.sidebar.autoPasses' : 'event.sidebar.eventWristbands')}`,
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
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: type === 'pass' ? req.t('flash.passTypeCreated') : req.t('flash.wristbandTypeCreated'),
      });
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
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.accessTypeUpdated'),
      });
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
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${req.params.eventId}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.accessTypeDeleted'),
      });
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
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${event.id}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.requestStatusUpdated'),
      });
    },

    async showPortalLogin(req, res) {
      const entry = await accessService.getPortalLoginPage();

      return res.render('public-portal/login', {
        pageTitle: req.t('portal.login.title'),
        portalEntry: entry,
        layout: 'layout',
        isPublicPortal: true,
        portalPageMode: 'login',
      });
    },

    async authorizePortal(req, res) {
      await accessService.authorizePublicProfile(req.body.accessCode, req.session, req.t);
      await saveSession(req);

      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalAccessGranted'),
      });
    },

    async authorizePortalFromLink(req, res) {
      try {
        await accessService.authorizePublicProfile(req.params.accessCode, req.session, req.t);
        await saveSession(req);
        return res.redirect('/p/manage');
      } catch (error) {
        if (!error.statusCode || error.statusCode >= 500) {
          throw error;
        }

        req.flash('error', req.t('service.portal.codeInvalid'));
        return res.redirect('/p');
      }
    },

    async showPortal(req, res) {
      if (Number(req.session[PUBLIC_PORTAL_SESSION_KEY] || 0) <= 0) {
        return res.redirect('/p');
      }

      const data = await accessService.getPublicPortal(req.session, req.t);

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
        combinedRequests: data.combinedRequests,
        portalClientState: {
          passQuotaUsage: data.passQuotaUsage,
          wristbandQuotaUsage: data.wristbandQuotaUsage,
          ui: {
            noAvailableCategories: req.t('portal.import.noAvailableCategories'),
            editRequestTitle: req.t('portal.modal.editRequest'),
            addPassTitle: req.t('portal.modal.addPass'),
            addWristbandTitle: req.t('portal.modal.addWristband'),
            addRequest: req.t('portal.addRequest'),
            saveRequest: req.t('portal.saveRequest'),
            importPassTitle: req.t('portal.modal.importPass'),
            importWristbandTitle: req.t('portal.modal.importWristband'),
            previewRows: req.t('portal.import.preview.rows'),
            previewValidRows: req.t('portal.import.preview.validRows'),
            previewRowColumn: req.t('portal.import.preview.row'),
            previewNameColumn: req.t('portal.import.preview.name'),
            previewPhoneColumn: req.t('portal.import.preview.phone'),
            previewCompanyColumn: req.t('portal.import.preview.company'),
            previewEmailColumn: req.t('portal.import.preview.email'),
            previewValidationColumn: req.t('portal.import.preview.validation'),
            previewOk: req.t('portal.import.preview.ok'),
          },
        },
        portalEventRoom: data.profile.event_id,
        isPublicPortal: true,
        portalPageMode: 'manage',
      });
    },

    async createPortalRequest(req, res) {
      const eventId = await accessService.createPortalRequest(
        req.session,
        req.params.type,
        normalizeRequestPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalRequestCreated'),
      });
    },

    async updatePortalRequest(req, res) {
      const eventId = await accessService.updatePortalRequest(
        req.session,
        req.params.type,
        req.params.requestId,
        normalizeRequestPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalRequestUpdated'),
      });
    },

    async destroyPortalRequest(req, res) {
      const eventId = await accessService.deletePortalRequest(
        req.session,
        req.params.type,
        req.params.requestId,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, eventId, 'dashboard:refresh', { eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalRequestDeleted'),
      });
    },

    async logoutPortal(req, res) {
      await accessService.clearPublicProfileAccess(req.session);
      await saveSession(req);
      return sendMutationResponse(req, res, {
        redirectTo: '/p',
        message: req.t('flash.portalLoggedOut'),
        payload: {
          redirectTo: '/p',
        },
      });
    },

    async downloadImportTemplate(req, res) {
      const template = await accessService.buildImportTemplate(
        req.session,
        req.query.type,
        req.query.categoryId,
        req.t,
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename=\"${template.filename}\"`);
      return res.send(template.buffer);
    },

    async previewPortalImport(req, res) {
      const preview = await accessService.previewPortalImport(
        req.session,
        req.body.type,
        req.body.categoryId,
        req.file,
        req.t,
      );

      return res.json({
        success: true,
        preview,
      });
    },

    async commitPortalImport(req, res) {
      const result = await accessService.commitPortalImport(req.session, req.body.token, req.t);

      emitEventUpdate(req.app.locals.io, result.eventId, 'dashboard:refresh', { eventId: result.eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalImportCreated', { count: result.importedCount }),
        payload: {
          importedCount: result.importedCount,
        },
      });
    },

    redirectLegacyPortal(req, res) {
      if (Number(req.session[PUBLIC_PORTAL_SESSION_KEY] || 0) > 0) {
        return res.redirect('/p/manage');
      }

      delete req.session[PUBLIC_PORTAL_IMPORTS_KEY];
      return res.redirect('/p');
    },
  };
}

module.exports = { buildAccessController };
