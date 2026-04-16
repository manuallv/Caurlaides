const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { validateRequest } = require('../middleware/validate');
const {
  accessTypeParamValidator,
  portalCodeValidator,
  portalRequestValidator,
} = require('../validators/event-validators');

function buildPublicAccessRoutes({ accessController }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 2 * 1024 * 1024,
    },
  });

  router.get('/p', asyncHandler(accessController.showPortalLogin));
  router.post('/p/access', portalCodeValidator, validateRequest, asyncHandler(accessController.authorizePortal));
  router.get('/p/manage', asyncHandler(accessController.showPortal));
  router.post('/p/logout', asyncHandler(accessController.logoutPortal));
  router.get('/p/import/template', asyncHandler(accessController.downloadImportTemplate));
  router.get('/p/:accessCode', asyncHandler(accessController.authorizePortalFromLink));
  router.post(
    '/p/import/preview',
    upload.single('excelFile'),
    asyncHandler(accessController.previewPortalImport),
  );
  router.post('/p/import/commit', asyncHandler(accessController.commitPortalImport));

  router.post(
    '/p/:type',
    accessTypeParamValidator,
    portalRequestValidator,
    validateRequest,
    asyncHandler(accessController.createPortalRequest),
  );
  router.put(
    '/p/:type/:requestId',
    accessTypeParamValidator,
    portalRequestValidator,
    validateRequest,
    asyncHandler(accessController.updatePortalRequest),
  );
  router.delete(
    '/p/:type/:requestId',
    accessTypeParamValidator,
    validateRequest,
    asyncHandler(accessController.destroyPortalRequest),
  );

  router.get('/portal/:publicSlug', accessController.redirectLegacyPortal);
  router.get('/portal/:publicSlug/manage', accessController.redirectLegacyPortal);
  router.post('/portal/:publicSlug/access', accessController.redirectLegacyPortal);
  router.post('/portal/:publicSlug/logout', accessController.redirectLegacyPortal);
  router.post('/portal/:publicSlug/:type', accessController.redirectLegacyPortal);
  router.put('/portal/:publicSlug/:type/:requestId', accessController.redirectLegacyPortal);
  router.delete('/portal/:publicSlug/:type/:requestId', accessController.redirectLegacyPortal);

  return router;
}

module.exports = { buildPublicAccessRoutes };
