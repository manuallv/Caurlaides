const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireExternalApiKey } = require('../middleware/external-api-key');
const { validateRequest } = require('../middleware/validate');
const { externalVehicleDecisionValidator, externalVehicleEntryValidator } = require('../validators/event-validators');

function buildExternalApiRoutes({ accessController }) {
  const router = express.Router();

  router.post(
    '/api/external/pass-entries',
    requireExternalApiKey,
    externalVehicleEntryValidator,
    validateRequest,
    asyncHandler(accessController.registerVehicleEntry),
  );
  router.post(
    '/api/external/pass-checks',
    requireExternalApiKey,
    externalVehicleEntryValidator,
    validateRequest,
    asyncHandler(accessController.checkVehicleAccess),
  );
  router.post(
    '/api/external/events/:token/vehicle-decisions',
    externalVehicleDecisionValidator,
    validateRequest,
    asyncHandler(accessController.processVehicleGateDecision),
  );

  return router;
}

module.exports = { buildExternalApiRoutes };
