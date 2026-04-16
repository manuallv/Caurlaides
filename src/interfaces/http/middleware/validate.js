const { validationResult } = require('express-validator');

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  errors
    .array()
    .forEach((error) => req.flash('error', error.msg));

  return res.redirect(req.get('Referrer') || '/');
}

module.exports = { validateRequest };
