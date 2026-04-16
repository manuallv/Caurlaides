const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');

function buildDashboardRoutes({ dashboardController }) {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(dashboardController.index));
  router.get('/dashboard', requireAuth, asyncHandler(dashboardController.index));

  return router;
}

module.exports = { buildDashboardRoutes };
