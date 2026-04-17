function wantsJson(req) {
  return req.get('X-Requested-With') === 'XMLHttpRequest'
    || req.xhr
    || req.originalUrl.startsWith('/api/');
}

function notFoundHandler(req, res) {
  res.status(404).render('errors/404', {
    pageTitle: req.t('errors.notFound.title'),
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const isCsrfError = error.code === 'EBADCSRFTOKEN';
  const statusCode = error.statusCode || (isCsrfError ? 403 : 500);
  const message = isCsrfError
    ? req.t('errors.csrf')
    : error.message || req.t('errors.genericMessage');

  if (statusCode >= 500) {
    console.error(error);
  }

  if (wantsJson(req)) {
    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }

  res.status(statusCode).render('errors/error', {
    pageTitle: req.t('errors.generic.title'),
    statusCode,
    message,
    currentUser: req.currentUser || null,
    activeEvent: null,
    isPublicPortal: false,
    currentPath: req.originalUrl || '',
    csrfToken: '',
    locale: req.locale || 'en',
    t: req.t,
    supportedLocales: res.locals.supportedLocales || ['en', 'lv'],
    flash: {
      success: req.flash ? req.flash('success') : [],
      error: req.flash ? req.flash('error') : [],
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
