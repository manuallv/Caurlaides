const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  accessTypeValidator,
  eventValidator,
  memberRoleValidator,
  memberValidator,
  requestProfileValidator,
  requestStatusValidator,
} = require('../validators/event-validators');

function buildEventRoutes({ eventController, accessController }) {
  const router = express.Router();

  router.get('/events/new', requireAuth, eventController.showCreateForm);
  router.post('/events', requireAuth, eventValidator, validateRequest, asyncHandler(eventController.create));

  router.get('/events/:eventId', requireAuth, asyncHandler(eventController.showDashboard));
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
  router.post(
    '/events/:eventId/:type(pass|wristband)/types',
    requireAuth,
    accessTypeValidator,
    validateRequest,
    asyncHandler(accessController.createType),
  );
  router.put(
    '/events/:eventId/:type(pass|wristband)/types/:categoryId',
    requireAuth,
    accessTypeValidator,
    validateRequest,
    asyncHandler(accessController.updateType),
  );
  router.delete(
    '/events/:eventId/:type(pass|wristband)/types/:categoryId',
    requireAuth,
    asyncHandler(accessController.destroyType),
  );

  router.get('/events/:eventId/request-profiles', requireAuth, asyncHandler(accessController.showRequestProfiles));
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
    '/events/:eventId/:type(pass|wristband)/requests/:requestId/status',
    requireAuth,
    requestStatusValidator,
    validateRequest,
    asyncHandler(accessController.updateRequestStatus),
  );

  router.get('/events/:eventId/activity', requireAuth, asyncHandler(eventController.showAuditLog));

  return router;
}

module.exports = { buildEventRoutes };
