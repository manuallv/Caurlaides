const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireSuperAdmin } = require('../middleware/auth');

function buildSystemRoutes({ systemController }) {
  const router = express.Router();

  router.get('/system/users', requireSuperAdmin, asyncHandler(systemController.showUsers));
  router.get('/system/users/new', requireSuperAdmin, asyncHandler(systemController.showUserForm));
  router.get('/system/users/:userId/edit', requireSuperAdmin, asyncHandler(systemController.showUserForm));
  router.post('/system/users', requireSuperAdmin, asyncHandler(systemController.createUser));
  router.put('/system/users/:userId', requireSuperAdmin, asyncHandler(systemController.updateUser));
  router.delete('/system/users/:userId', requireSuperAdmin, asyncHandler(systemController.deleteUser));

  router.get('/system/settings', requireSuperAdmin, asyncHandler(systemController.redirectSettings));
  router.get('/system/settings/email', requireSuperAdmin, asyncHandler(systemController.showEmailSettings));
  router.post('/system/settings/email', requireSuperAdmin, asyncHandler(systemController.updateEmailSettings));
  router.get('/system/settings/test', requireSuperAdmin, asyncHandler(systemController.showEmailTest));
  router.post('/system/settings/test', requireSuperAdmin, asyncHandler(systemController.sendTestEmail));
  router.get('/system/settings/templates', requireSuperAdmin, asyncHandler(systemController.showEmailTemplates));
  router.post('/system/settings/templates', requireSuperAdmin, asyncHandler(systemController.updateEmailTemplates));

  return router;
}

module.exports = { buildSystemRoutes };
