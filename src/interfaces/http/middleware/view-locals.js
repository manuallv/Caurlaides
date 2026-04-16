const {
  formatDate,
  formatDateTime,
  formatDateTimeLocalInput,
  truncate,
} = require('../../../shared/utils/formatters');

function attachViewLocals(req, res, next) {
  res.locals.currentUser = req.currentUser;
  res.locals.activeEvent = res.locals.activeEvent || null;
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
  };
  res.locals.helpers = {
    formatDate,
    formatDateTime,
    formatDateTimeLocalInput,
    truncate,
  };
  res.locals.currentPath = req.originalUrl;
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
}

module.exports = { attachViewLocals };
