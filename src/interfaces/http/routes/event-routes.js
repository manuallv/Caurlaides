const express = require('express');
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
} = require('../validators/event-validators');

function buildEventRoutes({ eventController, accessController }) {
  const router = express.Router();

  router.get('/events/new', requireAuth, eventController.showCreateForm);
  router.post('/events', requireAuth, eventValidator, validateRequest, asyncHandler(eventController.create));

  router.get('/events/:eventId', requireAuth, asyncHandler(eventController.showDashboard));
  router.post('/events/:eventId/vehicle-check-link', requireAuth, asyncHandler(eventController.generateVehicleCheckLink));
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
  router.delete('/events/:eventId/members/:userId', requireAuth, asyncHandler(eventController.removeMember));

  router.get('/events/:eventId/passes', requireAuth, asyncHandler(accessController.showTypePage));
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
  router.put(
    '/events/:eventId/request-profiles/:profileId',
    requireAuth,
    requestProfileValidator,
    validateRequest,
    asyncHandler(accessController.updateRequestProfile),
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
  router.put(
    '/events/:eventId/:type/requests/:requestId/status',
    requireAuth,
    accessTypeParamValidator,
    requestStatusValidator,
    validateRequest,
    asyncHandler(accessController.updateRequestStatus),
  );

  router.get('/events/:eventId/activity', requireAuth, asyncHandler(eventController.showAuditLog));
  router.post('/events/:eventId/activity/:auditId/restore', requireAuth, asyncHandler(accessController.restoreAuditEntry));

  return router;
}

module.exports = { buildEventRoutes };
