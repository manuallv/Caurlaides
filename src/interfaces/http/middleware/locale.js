const {
  SUPPORTED_LOCALES,
  createTranslator,
  normalizeLocale,
  resolveLocale,
} = require('../../../shared/i18n');

function attachLocale(req, res, next) {
  const locale = resolveLocale({
    sessionLocale: req.session && req.session.locale,
    acceptLanguage: req.get('Accept-Language'),
  });

  if (req.session) {
    req.session.locale = locale;
  }

  req.locale = locale;
  req.t = createTranslator(locale);
  res.locals.locale = locale;
  res.locals.supportedLocales = SUPPORTED_LOCALES;
  next();
}

function sanitizeRedirect(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return '/';
  }

  if (value.startsWith('//')) {
    return '/';
  }

  return value;
}

function setLocale(req, res) {
  const locale = normalizeLocale(req.params.locale);
  const redirectTo = sanitizeRedirect(req.query.redirect || '/');

  if (locale && req.session) {
    req.session.locale = locale;
  }

  return res.redirect(redirectTo);
}

module.exports = {
  attachLocale,
  setLocale,
};
