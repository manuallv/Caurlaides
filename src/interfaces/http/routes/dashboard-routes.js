const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { externalVehicleEntryValidator } = require('../validators/event-validators');

function buildDashboardRoutes({ dashboardController, accessController }) {
  const router = express.Router();

  router.get('/', requireAuth, asyncHandler(dashboardController.index));
  router.get('/dashboard', requireAuth, asyncHandler(dashboardController.index));
  router.get('/check', requireAuth, asyncHandler(accessController.showVehicleCheck));
  router.post(
    '/check',
    requireAuth,
    externalVehicleEntryValidator,
    validateRequest,
    asyncHandler(accessController.submitVehicleCheck),
  );

  return router;
}

module.exports = { buildDashboardRoutes };
