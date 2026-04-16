const express = require('express');
const { asyncHandler } = require('../../../shared/utils/async-handler');
const { requireGuest } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validate');
const {
  forgotPasswordValidator,
  loginValidator,
  registerValidator,
  resetPasswordValidator,
} = require('../validators/auth-validators');

function buildAuthRoutes({ authController }) {
  const router = express.Router();

  router.get('/login', requireGuest, authController.showLogin);
  router.get('/register', requireGuest, authController.showRegister);
  router.get('/forgot-password', requireGuest, authController.showForgotPassword);
  router.get('/reset-password/:token', requireGuest, authController.showResetPassword);
  router.post('/register', requireGuest, registerValidator, validateRequest, asyncHandler(authController.register));
  router.post('/login', requireGuest, loginValidator, validateRequest, asyncHandler(authController.login));
  router.post(
    '/forgot-password',
    requireGuest,
    forgotPasswordValidator,
    validateRequest,
    asyncHandler(authController.forgotPassword),
  );
  router.post(
    '/reset-password/:token',
    requireGuest,
    resetPasswordValidator,
    validateRequest,
    asyncHandler(authController.resetPassword),
  );
  router.post('/logout', asyncHandler(authController.logout));

  return router;
}

module.exports = { buildAuthRoutes };
