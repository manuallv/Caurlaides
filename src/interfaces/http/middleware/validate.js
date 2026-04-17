const { validationResult } = require('express-validator');

function wantsJson(req) {
  return req.get('X-Requested-With') === 'XMLHttpRequest'
    || req.xhr
    || req.originalUrl.startsWith('/api/');
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  const mappedErrors = errors.array().map((error) => error.msg);

  if (wantsJson(req)) {
    return res.status(422).json({
      success: false,
      errors: mappedErrors,
    });
  }

  mappedErrors.forEach((message) => req.flash('error', message));

  return res.redirect(req.get('Referrer') || '/');
}

module.exports = { validateRequest };
