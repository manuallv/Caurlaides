function requireAuth(req, res, next) {
  if (req.currentUser) {
    return next();
  }

  req.flash('error', 'Please log in to continue.');
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
