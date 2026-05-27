const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  adminRequestEditorValidator,
  accessTypeParamValidator,
  accessTypeValidator,
  eventValidator,
  memberRoleValidator,
  memberValidator,
  requestProfileValidator,
  requestStatusValidator,
  vehicleGateApiSettingsValidator,
  publicVehicleCheckValidator,
  requestProfileApplicationValidator,
} = require('../validators/event-validators');

function buildEventRoutes({ eventController, accessController }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
    },
  });
  const templateUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 12 * 1024 * 1024,
    },
  });

  router.get('/events/new', requireAuth, eventController.showCreateForm);
  router.post('/events', requireAuth, eventValidator, validateRequest, asyncHandler(eventController.create));

  router.get('/events/:eventId', requireAuth, asyncHandler(eventController.showDashboard));
  router.post('/events/:eventId/vehicle-check-link', requireAuth, asyncHandler(eventController.generateVehicleCheckLink));
  router.post('/events/:eventId/vehicle-check-links', requireAuth, asyncHandler(eventController.createVehicleCheckLink));
  router.put('/events/:eventId/vehicle-check-links/:linkId', requireAuth, asyncHandler(eventController.updateVehicleCheckLink));
  router.post(
    '/events/:eventId/vehicle-check-links/:linkId/regenerate',
    requireAuth,
    asyncHandler(eventController.regenerateVehicleCheckGateLink),
  );
  router.delete('/events/:eventId/vehicle-check-links/:linkId', requireAuth, asyncHandler(eventController.deleteVehicleCheckLink));
  router.post(
    '/events/:eventId/vehicle-gate-api',
    requireAuth,
    vehicleGateApiSettingsValidator,
    validateRequest,
    asyncHandler(eventController.updateVehicleGateApi),
  );
  router.post('/events/:eventId/vehicle-gate-api/regenerate', requireAuth, asyncHandler(eventController.regenerateVehicleGateApi));
  router.get('/events/:eventId/categories', requireAuth, (req, res) =>
    res.redirect(`/events/${req.params.eventId}/wristbands`),
  );
  router.get('/events/:eventId/edit', requireAuth, asyncHandler(eventController.showEditForm));
  router.put('/events/:eventId', requireAuth, eventValidator, validateRequest, asyncHandler(eventController.update));
  router.delete('/events/:eventId', requireAuth, asyncHandler(eventController.destroy));

  router.get('/events/:eventId/members', requireAuth, asyncHandler(eventController.showMembers));
  router.get('/events/:eventId/members/search', requireAuth, asyncHandler(eventController.searchMemberCandidates));
  router.post(
    '/events/:eventId/members',
    requireAuth,
    memberValidator,
    validateRequest,
    asyncHandler(eventController.addMember),
  );
  router.put(
    '/events/:eventId/members/:userId',
    requireAuth,
    memberRoleValidator,
    validateRequest,
    asyncHandler(eventController.updateMemberRole),
  );
  router.put(
    '/events/:eventId/members/:userId/notifications',
    requireAuth,
    asyncHandler(eventController.updateMemberNotifications),
  );
  router.delete('/events/:eventId/members/:userId', requireAuth, asyncHandler(eventController.removeMember));

  router.get('/events/:eventId/passes', requireAuth, asyncHandler(accessController.showTypePage));
  router.get('/events/:eventId/passes/print', requireAuth, asyncHandler(accessController.showPassPrintPage));
  router.get(
    '/events/:eventId/passes/print/template/export',
    requireAuth,
    asyncHandler(accessController.exportPassPrintTemplate),
  );
  router.post(
    '/events/:eventId/passes/print/template/import',
    requireAuth,
    templateUpload.single('templateFile'),
    asyncHandler(accessController.importPassPrintTemplate),
  );
  router.post(
    '/events/:eventId/passes/print/template',
    requireAuth,
    upload.single('backgroundImage'),
    asyncHandler(accessController.savePassPrintTemplate),
  );
  router.post(
    '/events/:eventId/passes/print/preview',
    requireAuth,
    upload.single('backgroundImage'),
    asyncHandler(accessController.previewPassPrintPdf),
  );
  router.post('/events/:eventId/passes/print/selected', requireAuth, asyncHandler(accessController.printSelectedPassPrintPdf));
  router.get('/events/:eventId/passes/print/export', requireAuth, asyncHandler(accessController.exportPassPrintPdf));
  router.get('/events/:eventId/wristbands', requireAuth, asyncHandler(accessController.showTypePage));
  router.get(
    '/events/:eventId/:type/requests/:requestId/history',
    requireAuth,
    accessTypeParamValidator,
    asyncHandler(accessController.getRequestHistory),
  );
  router.get('/events/:eventId/check', requireAuth, asyncHandler(accessController.showVehicleCheck));
  router.post(
    '/events/:eventId/check',
    requireAuth,
    publicVehicleCheckValidator,
    validateRequest,
    asyncHandler(accessController.submitVehicleCheck),
  );
  router.get(
    '/events/:eventId/:type/export',
    requireAuth,
    accessTypeParamValidator,
    asyncHandler(accessController.exportRequests),
  );
  router.post(
    '/events/:eventId/:type/types',
    requireAuth,
    accessTypeParamValidator,
    accessTypeValidator,
    validateRequest,
    asyncHandler(accessController.createType),
  );
  router.put(
    '/events/:eventId/:type/types/:categoryId',
    requireAuth,
    accessTypeParamValidator,
    accessTypeValidator,
    validateRequest,
    asyncHandler(accessController.updateType),
  );
  router.delete(
    '/events/:eventId/:type/types/:categoryId',
    requireAuth,
    accessTypeParamValidator,
    validateRequest,
    asyncHandler(accessController.destroyType),
  );

  router.get('/events/:eventId/request-profiles', requireAuth, asyncHandler(accessController.showRequestProfiles));
  router.get('/events/:eventId/request-profiles/new', requireAuth, asyncHandler(accessController.showRequestProfileForm));
  router.get(
    '/events/:eventId/request-profiles/applications',
    requireAuth,
    asyncHandler(accessController.showRequestProfileApplications),
  );
  router.get(
    '/events/:eventId/request-profiles/:profileId/edit',
    requireAuth,
    asyncHandler(accessController.showRequestProfileForm),
  );
  router.post(
    '/events/:eventId/request-profiles',
    requireAuth,
    requestProfileValidator,
    validateRequest,
    asyncHandler(accessController.createRequestProfile),
  );
  router.post(
    '/events/:eventId/request-profile-applications/:applicationId/approve',
    requireAuth,
    requestProfileApplicationValidator.filter((validator) => !validator.builder.fields.includes('profileName')
      && !validator.builder.fields.includes('contactEmail')
      && !validator.builder.fields.includes('contactPhone')),
    validateRequest,
    asyncHandler(accessController.approveRequestProfileApplication),
  );
  router.post(
    '/events/:eventId/request-profile-applications/:applicationId/reject',
    requireAuth,
    asyncHandler(accessController.rejectRequestProfileApplication),
  );
  router.put(
    '/events/:eventId/request-profiles/:profileId',
    requireAuth,
    requestProfileValidator,
    validateRequest,
    asyncHandler(accessController.updateRequestProfile),
  );
  router.post(
    '/events/:eventId/request-profiles/:profileId/send-invite',
    requireAuth,
    asyncHandler(accessController.sendRequestProfileInvite),
  );
  router.delete(
    '/events/:eventId/request-profiles/:profileId',
    requireAuth,
    asyncHandler(accessController.destroyRequestProfile),
  );
  router.post(
    '/events/:eventId/request-profiles/:profileId/regenerate-code',
    requireAuth,
    asyncHandler(accessController.regenerateRequestProfileCode),
  );

  router.put(
    '/events/:eventId/:type/requests/:requestId',
    requireAuth,
    accessTypeParamValidator,
    adminRequestEditorValidator,
    validateRequest,
    asyncHandler(accessController.updateRequest),
  );
  router.post(
    '/events/:eventId/:type/requests',
    requireAuth,
    accessTypeParamValidator,
    adminRequestEditorValidator,
    validateRequest,
    asyncHandler(accessController.createRequest),
  );
  router.post(
    '/events/:eventId/wristbands/status',
    requireAuth,
    asyncHandler(accessController.updateWristbandRequestStatuses),
  );
  router.put(
    '/events/:eventId/:type/requests/:requestId/status',
    requireAuth,
    accessTypeParamValidator,
    requestStatusValidator,
    validateRequest,
    asyncHandler(accessController.updateRequestStatus),
  );
  router.post(
    '/events/:eventId/pass/requests/:requestId/movement',
    requireAuth,
    asyncHandler(accessController.registerRequestMovement),
  );

  router.get('/events/:eventId/activity', requireAuth, asyncHandler(eventController.showAuditLog));
  router.post('/events/:eventId/activity/:auditId/restore', requireAuth, asyncHandler(accessController.restoreAuditEntry));

  return router;
}

module.exports = { buildEventRoutes };
