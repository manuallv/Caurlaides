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

module.exports = {
  requireAuth,
  requireGuest,
};
