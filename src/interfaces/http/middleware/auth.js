const { env } = require('../../../config/env');

function requireAuth(req, res, next) {
  if (req.currentUser) {
    return next();
  }

  req.flash('error', req.t('service.auth.loginRequired'));
  return res.redirect('/login');
}

function requireGuest(req, res, next) {
  if (!req.currentUser) {
    return next();
  }

  return res.redirect('/dashboard');
}

function requireSuperAdmin(req, res, next) {
  if (!req.currentUser) {
    req.flash('error', req.t('service.auth.loginRequired'));
    return res.redirect('/login');
  }

  if (String(req.currentUser.email || '').trim().toLowerCase() === env.superAdminEmail) {
    return next();
  }

  req.flash('error', req.t('service.auth.superAdminOnly'));
  return res.redirect('/dashboard');
}

module.exports = {
  requireAuth,
  requireGuest,
  requireSuperAdmin,
};
