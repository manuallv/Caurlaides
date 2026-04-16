function attachCurrentUser(req, res, next) {
  req.currentUser = req.session.user || null;
  next();
}

module.exports = { attachCurrentUser };
