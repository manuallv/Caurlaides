const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireGuest } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const { loginValidator, registerValidator } = require('../validators/auth-validators');

function buildAuthRoutes({ authController }) {
  const router = express.Router();

  router.get('/login', requireGuest, authController.showLogin);
  router.get('/register', requireGuest, authController.showRegister);
  router.post('/register', requireGuest, registerValidator, validateRequest, asyncHandler(authController.register));
  router.post('/login', requireGuest, loginValidator, validateRequest, asyncHandler(authController.login));
  router.post('/logout', asyncHandler(authController.logout));

  return router;
}

module.exports = { buildAuthRoutes };
