const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');

function buildDashboardRoutes({ dashboardController, accessController }) {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(dashboardController.index));
  router.get('/dashboard', requireAuth, asyncHandler(dashboardController.index));
  router.get('/check', requireAuth, (req, res) => res.redirect('/dashboard'));

  return router;
}

module.exports = { buildDashboardRoutes };
