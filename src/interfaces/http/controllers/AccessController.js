const {
  PUBLIC_PORTAL_IMPORTS_KEY,
  PUBLIC_PORTAL_SESSION_KEY,
} = require('../../../application/services/AccessService');
const { emitEventUpdate } = require('../../../infrastructure/realtime/socket');
const { AppError } = require('../../../shared/errors/AppError');

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
    contactEmail: body.contactEmail || null,
    contactPhone: body.contactPhone || null,
    notifyContactOnCreate: body.notifyContactOnCreate === 'on',
    unlimitedQuota: body.unlimitedQuota === 'on',
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
    sort: query.sort === 'oldest' ? 'oldest' : 'newest',
  };
}

function normalizeRequestPayload(body) {
  return {
    requestProfileId: body.requestProfileId ? Number(body.requestProfileId) : null,
    categoryId: body.categoryId,
    fullName: body.fullName,
    companyName: body.companyName,
    phone: body.phone,
    email: body.email,
    vehiclePlate: body.vehiclePlate,
    notes: body.notes,
  };
}

function normalizeVehicleEntryPayload(body) {
  return {
    eventId: body.eventId ? Number(body.eventId) : null,
    vehiclePlate: body.vehiclePlate,
    direction: body.direction,
    gateName: body.gateName,
    source: body.source,
    metadata: body.metadata,
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

function buildAccessRequestLivePayload(req, res, type, request, summary = null) {
  if (!request) {
    return null;
  }

  const status = request.status || 'pending';

  return {
    requestType: type,
    request: {
      id: Number(request.id),
      eventId: Number(request.event_id),
      requestProfileId: request.request_profile_id ? Number(request.request_profile_id) : null,
      categoryId: request.category_id ? Number(request.category_id) : null,
      fullName: request.full_name || '',
      companyName: request.company_name || '',
      phone: request.phone || '',
      email: request.email || '',
      vehiclePlate: request.vehicle_plate || '',
      notes: request.notes || '',
      profileName: request.profile_name || '',
      categoryName: request.category_name || '',
      status,
      statusLabel: req.t(`statuses.${status}`),
      statusTone: status === 'handed_out' ? 'active' : 'pending',
      statusUpdatedAtLabel: request.status_updated_at
        ? res.locals.helpers.formatDateTime(request.status_updated_at)
        : '',
      statusUpdatedAtTs: request.status_updated_at ? new Date(request.status_updated_at).getTime() : 0,
      enteredAtLabel: request.entered_at ? res.locals.helpers.formatDateTime(request.entered_at) : '',
      enteredAtTs: request.entered_at ? new Date(request.entered_at).getTime() : 0,
      lastEntryAtLabel: request.last_entry_at ? res.locals.helpers.formatDateTime(request.last_entry_at) : '',
      lastEntryAtTs: request.last_entry_at ? new Date(request.last_entry_at).getTime() : 0,
      createdAtLabel: request.created_at ? res.locals.helpers.formatDateTime(request.created_at) : '',
      createdAtTs: request.created_at ? new Date(request.created_at).getTime() : 0,
      nextStatus: status === 'handed_out' ? 'pending' : 'handed_out',
      nextStatusLabel: req.t(`statuses.${status === 'handed_out' ? 'pending' : 'handed_out'}`),
      nextStatusTone: status === 'handed_out' ? 'secondary' : 'primary',
    },
    summary,
  };
}

function buildAccessRequestDeletePayload(type, requestId, summary = null) {
  return {
    requestType: type,
    requestId: Number(requestId),
    summary,
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
        profiles: data.profiles,
      });
    },

    async showRequestProfileForm(req, res) {
      const data = await accessService.getRequestProfilesPage(req.params.eventId, req.currentUser.id, req.t);
      const editingProfileId = req.params.profileId ? Number(req.params.profileId) : null;
      const editingProfile = editingProfileId
        ? data.profiles.find((profile) => Number(profile.id) === editingProfileId)
        : null;

      if (editingProfileId && !editingProfile) {
        throw new AppError(req.t('service.requestProfile.notFound'), 404);
      }

      return res.render('events/request-profile-form', {
        pageTitle: `${data.event.name} · ${editingProfile ? req.t('requestProfiles.editorEditTitle') : req.t('requestProfiles.editorCreateTitle')}`,
        activeEvent: data.event,
        passCategories: data.passCategories,
        wristbandCategories: data.wristbandCategories,
        editingProfile,
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

    async restoreAuditEntry(req, res) {
      await accessService.restoreAuditEntity(
        req.params.eventId,
        req.params.auditId,
        req.currentUser.id,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.entityRestored'));
      return res.redirect(`/events/${req.params.eventId}/activity`);
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

    async createRequest(req, res) {
      const type = resolveAccessType(req);
      const result = await accessService.createAdminRequest(
        req.params.eventId,
        req.currentUser.id,
        type,
        normalizeRequestPayload(req.body),
        req.t,
      );
      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        type,
        result.request,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.event.id, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.event.id, 'dashboard:refresh', {
        eventId: result.event.id,
      });
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${result.event.id}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.portalRequestCreated'),
        payload: {
          liveRequestUpsert,
        },
      });
    },

    async updateRequest(req, res) {
      const type = resolveAccessType(req);
      const result = await accessService.updateAdminRequest(
        req.params.eventId,
        req.params.requestId,
        req.currentUser.id,
        type,
        normalizeRequestPayload(req.body),
        req.t,
      );
      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        type,
        result.request,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.event.id, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.event.id, 'dashboard:refresh', {
        eventId: result.event.id,
      });
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${result.event.id}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.portalRequestUpdated'),
        payload: {
          liveRequestUpsert,
        },
      });
    },

    async updateRequestStatus(req, res) {
      const type = resolveAccessType(req);
      const result = await accessService.updateRequestStatus(
        req.params.eventId,
        req.params.requestId,
        req.currentUser.id,
        type,
        req.body.status,
        req.t,
      );

      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        type,
        result.request,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.event.id, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.event.id, 'dashboard:refresh', {
        eventId: result.event.id,
      });
      return sendMutationResponse(req, res, {
        redirectTo: `/events/${result.event.id}/${type === 'pass' ? 'passes' : 'wristbands'}`,
        message: req.t('flash.requestStatusUpdated'),
        payload: {
          liveRequestUpsert,
        },
      });
    },

    async exportRequests(req, res) {
      const type = resolveAccessType(req);
      const exportFile = await accessService.exportAdminRequests(
        req.params.eventId,
        req.currentUser.id,
        type,
        req.query.format,
        req.t,
      );

      res.setHeader('Content-Type', exportFile.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
      return res.send(exportFile.buffer);
    },

    async showVehicleCheck(req, res) {
      const data = await accessService.getVehicleCheckPage(
        req.currentUser.id,
        req.query.eventId,
        req.t,
      );

      return res.render('check/index', {
        pageTitle: req.t('check.title'),
        selectedEvent: data.selectedEvent,
        events: data.events,
        recentMovements: data.recentMovements,
        checkResult: null,
        checkFormValues: {
          vehiclePlate: '',
          gateName: '',
        },
      });
    },

    async submitVehicleCheck(req, res) {
      const payload = normalizeVehicleEntryPayload(req.body);
      const result = await accessService.registerVehicleCheck(req.currentUser.id, payload, req.t);
      const data = await accessService.getVehicleCheckPage(
        req.currentUser.id,
        payload.eventId,
        req.t,
      );

      return res.render('check/index', {
        pageTitle: req.t('check.title'),
        selectedEvent: data.selectedEvent,
        events: data.events,
        recentMovements: data.recentMovements,
        checkResult: result,
        checkFormValues: {
          vehiclePlate: payload.vehiclePlate || '',
          gateName: payload.gateName || '',
        },
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
        portalHeaderTitle: data.profile.name,
        portalLogoutAction: '/p/logout',
        portalLogoutLabel: req.t('portal.logout'),
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
            previewVehiclePlateColumn: req.t('portal.import.preview.vehiclePlate'),
            previewValidationColumn: req.t('portal.import.preview.validation'),
            previewOk: req.t('portal.import.preview.ok'),
            sortDirectionAsc: req.t('portal.sort.directionAsc'),
            sortDirectionDesc: req.t('portal.sort.directionDesc'),
          },
        },
        portalEventRoom: data.profile.event_id,
        isPublicPortal: true,
        portalPageMode: 'manage',
      });
    },

    async createPortalRequest(req, res) {
      const result = await accessService.createPortalRequest(
        req.session,
        req.params.type,
        normalizeRequestPayload(req.body),
        req.t,
      );
      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        req.params.type,
        result.request,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.eventId, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.eventId, 'dashboard:refresh', { eventId: result.eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalRequestCreated'),
      });
    },

    async updatePortalRequest(req, res) {
      const result = await accessService.updatePortalRequest(
        req.session,
        req.params.type,
        req.params.requestId,
        normalizeRequestPayload(req.body),
        req.t,
      );
      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        req.params.type,
        result.request,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.eventId, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.eventId, 'dashboard:refresh', { eventId: result.eventId });
      return sendMutationResponse(req, res, {
        redirectTo: '/p/manage',
        message: req.t('flash.portalRequestUpdated'),
      });
    },

    async destroyPortalRequest(req, res) {
      const result = await accessService.deletePortalRequest(
        req.session,
        req.params.type,
        req.params.requestId,
        req.t,
      );
      const liveRequestDelete = buildAccessRequestDeletePayload(
        result.type,
        result.requestId,
        result.summary,
      );

      emitEventUpdate(req.app.locals.io, result.eventId, 'access:request-delete', liveRequestDelete);
      emitEventUpdate(req.app.locals.io, result.eventId, 'dashboard:refresh', { eventId: result.eventId });
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

    async registerVehicleEntry(req, res) {
      const payload = normalizeVehicleEntryPayload(req.body);
      const result = await accessService.registerVehicleEntry(payload, req.t);
      const liveRequestUpsert = buildAccessRequestLivePayload(
        req,
        res,
        'pass',
        result.request,
        null,
      );

      emitEventUpdate(req.app.locals.io, result.eventId, 'access:request-upsert', liveRequestUpsert);
      emitEventUpdate(req.app.locals.io, result.eventId, 'dashboard:refresh', { eventId: result.eventId });

      return res.json({
        success: true,
        message: req.t(
          result.direction === 'exit' ? 'flash.vehicleExitRegistered' : 'flash.vehicleEntryRegistered',
          {
          plate: result.request?.vehicle_plate || payload.vehiclePlate || '',
          },
        ),
        direction: result.direction,
        alreadyEntered: result.alreadyEntered,
        currentPresence: result.currentPresence,
        request: {
          id: Number(result.request.id),
          fullName: result.request.full_name || '',
          companyName: result.request.company_name || '',
          categoryName: result.request.category_name || '',
          vehiclePlate: result.request.vehicle_plate || '',
          enteredAt: result.request.entered_at || null,
          lastEntryAt: result.request.last_entry_at || null,
          lastExitAt: result.request.last_exit_at || null,
          performedAt: result.performedAt || null,
          enteredAtLabel: result.request.entered_at
            ? res.locals.helpers.formatDateTime(result.request.entered_at)
            : '',
          lastEntryAtLabel: result.request.last_entry_at
            ? res.locals.helpers.formatDateTime(result.request.last_entry_at)
            : '',
          lastExitAtLabel: result.request.last_exit_at
            ? res.locals.helpers.formatDateTime(result.request.last_exit_at)
            : '',
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
