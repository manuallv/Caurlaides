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

  router.get('/system/settings', requireSuperAdmin, asyncHandler(systemController.showSettings));
  router.post('/system/settings', requireSuperAdmin, asyncHandler(systemController.updateSettings));

  return router;
}

module.exports = { buildSystemRoutes };
