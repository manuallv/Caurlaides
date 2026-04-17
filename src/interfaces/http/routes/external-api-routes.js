const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireExternalApiKey } = require('../middleware/external-api-key');
const { validateRequest } = require('../middleware/validate');
const { externalVehicleEntryValidator } = require('../validators/event-validators');

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
    asyncHandler(accessController.registerVehicleEntry),
  );

  return router;
}

module.exports = { buildExternalApiRoutes };
