const {
  SUPPORTED_LOCALES,
  createTranslator,
  normalizeLocale,
  resolveLocale,
} = require('../../../shared/i18n');

const COUNTRY_HEADER_NAMES = [
  'cf-ipcountry',
  'cloudfront-viewer-country',
  'x-country-code',
  'x-vercel-ip-country',
  'x-forwarded-country',
];

function getRequestCountryCode(req) {
  for (const headerName of COUNTRY_HEADER_NAMES) {
    const value = req.get(headerName);

    if (value) {
      return value;
    }
  }

  return '';
}

function attachLocale(req, res, next) {
  const locale = resolveLocale({
    sessionLocale: req.session && req.session.localeManuallySelected ? req.session.locale : null,
    countryCode: getRequestCountryCode(req),
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
    req.session.localeManuallySelected = true;
  }

  return res.redirect(redirectTo);
}

module.exports = {
  attachLocale,
  setLocale,
};
