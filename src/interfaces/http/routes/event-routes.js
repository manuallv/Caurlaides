const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  categoryValidator,
  categoryUpdateValidator,
  eventValidator,
  memberRoleValidator,
  memberValidator,
} = require('../validators/event-validators');

function buildEventRoutes({ eventController, categoryController }) {
  const router = express.Router();

  router.get('/events/new', requireAuth, eventController.showCreateForm);
  router.post('/events', requireAuth, eventValidator, validateRequest, asyncHandler(eventController.create));

  router.get('/events/:eventId', requireAuth, asyncHandler(eventController.showDashboard));
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

  router.get('/events/:eventId/categories', requireAuth, asyncHandler(categoryController.showIndex));
  router.post(
    '/events/:eventId/categories',
    requireAuth,
    categoryValidator,
    validateRequest,
    asyncHandler(categoryController.create),
  );
  router.put(
    '/events/:eventId/categories/:type/:categoryId',
    requireAuth,
    categoryUpdateValidator,
    validateRequest,
    asyncHandler(categoryController.update),
  );
  router.delete(
    '/events/:eventId/categories/:type/:categoryId',
    requireAuth,
    asyncHandler(categoryController.destroy),
  );

  router.get('/events/:eventId/activity', requireAuth, asyncHandler(eventController.showAuditLog));

  return router;
}

module.exports = { buildEventRoutes };
