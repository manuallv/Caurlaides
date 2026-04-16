function notFoundHandler(req, res) {
  res.status(404).render('errors/404', {
    pageTitle: 'Page not found',
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const isCsrfError = error.code === 'EBADCSRFTOKEN';
  const statusCode = error.statusCode || (isCsrfError ? 403 : 500);
  const message = isCsrfError
    ? 'Your form session expired. Please refresh the page and try again.'
    : error.message || 'Something went wrong.';

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).render('errors/error', {
    pageTitle: 'Something went wrong',
    statusCode,
    message,
    currentUser: req.currentUser || null,
    activeEvent: null,
    currentPath: req.originalUrl || '',
    csrfToken: '',
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
