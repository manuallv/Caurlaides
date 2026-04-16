const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { validateRequest } = require('../middleware/validate');
const {
  accessTypeParamValidator,
  portalCodeValidator,
  portalRequestValidator,
} = require('../validators/event-validators');

function buildPublicAccessRoutes({ accessController }) {
  const router = express.Router();

  router.get('/portal/:publicSlug', asyncHandler(accessController.showPortalLogin));
  router.post(
    '/portal/:publicSlug/access',
    portalCodeValidator,
    validateRequest,
    asyncHandler(accessController.authorizePortal),
  );
  router.get('/portal/:publicSlug/manage', asyncHandler(accessController.showPortal));
  router.post('/portal/:publicSlug/logout', asyncHandler(accessController.logoutPortal));

  router.post(
    '/portal/:publicSlug/:type',
    accessTypeParamValidator,
    portalRequestValidator,
    validateRequest,
    asyncHandler(accessController.createPortalRequest),
  );
  router.put(
    '/portal/:publicSlug/:type/:requestId',
    accessTypeParamValidator,
    portalRequestValidator,
    validateRequest,
    asyncHandler(accessController.updatePortalRequest),
  );
  router.delete(
    '/portal/:publicSlug/:type/:requestId',
    accessTypeParamValidator,
    validateRequest,
    asyncHandler(accessController.destroyPortalRequest),
  );

  return router;
}

module.exports = { buildPublicAccessRoutes };
