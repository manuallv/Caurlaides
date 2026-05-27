const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { env } = require('../../../config/env');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireSuperAdmin } = require('../middleware/auth');

function buildSystemRoutes({ systemController }) {
  const router = express.Router();
  const plateScannerTmpDir = path.join(env.uploadsDir, 'plate-scanner', 'tmp');
  const ensurePlateScannerTmpDir = () => {
    fs.mkdirSync(plateScannerTmpDir, { recursive: true });
    return plateScannerTmpDir;
  };
  const plateScannerSampleUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 8 * 1024 * 1024,
    },
  });
  const plateScannerModelUpload = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        callback(null, ensurePlateScannerTmpDir());
      },
      filename(req, file, callback) {
        const safeName = path.basename(file.originalname || 'model-file')
          .replace(/[^a-zA-Z0-9._-]/g, '-')
          .replace(/-+/g, '-');
        callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
      },
    }),
    limits: {
      fileSize: 12 * 1024 * 1024,
      files: 140,
    },
  });

  router.get('/system/users', requireSuperAdmin, asyncHandler(systemController.showUsers));
  router.get('/system/users/new', requireSuperAdmin, asyncHandler(systemController.showUserForm));
  router.get('/system/users/:userId/edit', requireSuperAdmin, asyncHandler(systemController.showUserForm));
  router.post('/system/users', requireSuperAdmin, asyncHandler(systemController.createUser));
  router.put('/system/users/:userId', requireSuperAdmin, asyncHandler(systemController.updateUser));
  router.delete('/system/users/:userId', requireSuperAdmin, asyncHandler(systemController.deleteUser));

  router.get('/system/backups', requireSuperAdmin, asyncHandler(systemController.showBackups));
  router.post('/system/backups/:backupId/restore', requireSuperAdmin, asyncHandler(systemController.restoreBackup));

  router.get('/system/settings', requireSuperAdmin, asyncHandler(systemController.redirectSettings));
  router.get('/system/settings/email', requireSuperAdmin, asyncHandler(systemController.showEmailSettings));
  router.post('/system/settings/email', requireSuperAdmin, asyncHandler(systemController.updateEmailSettings));
  router.get('/system/settings/test', requireSuperAdmin, asyncHandler(systemController.showEmailTest));
  router.post('/system/settings/test', requireSuperAdmin, asyncHandler(systemController.sendTestEmail));
  router.get('/system/settings/templates', requireSuperAdmin, asyncHandler(systemController.showEmailTemplates));
  router.post(
    '/system/settings/templates/:templateKey',
    requireSuperAdmin,
    asyncHandler(systemController.updateEmailTemplate),
  );
  router.post('/system/settings/templates', requireSuperAdmin, asyncHandler(systemController.updateEmailTemplates));
  router.get('/system/settings/plate-scanner', requireSuperAdmin, asyncHandler(systemController.showPlateScannerSettings));
  router.post(
    '/system/settings/plate-scanner/samples',
    requireSuperAdmin,
    plateScannerSampleUpload.single('image'),
    asyncHandler(systemController.uploadPlateScannerSample),
  );
  router.get(
    '/system/settings/plate-scanner/export',
    requireSuperAdmin,
    asyncHandler(systemController.exportPlateScannerTrainingDataset),
  );
  router.post(
    '/system/settings/plate-scanner/model',
    requireSuperAdmin,
    plateScannerModelUpload.array('modelFiles', 140),
    asyncHandler(systemController.uploadPlateScannerModel),
  );
  router.post(
    '/system/settings/plate-scanner/model/delete',
    requireSuperAdmin,
    asyncHandler(systemController.deletePlateScannerModel),
  );

  return router;
}

module.exports = { buildSystemRoutes };
