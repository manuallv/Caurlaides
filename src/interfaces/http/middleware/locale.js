const {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  createTranslator,
  normalizeLocale,
  resolveLocale,
} = require('../../../shared/i18n');

const PUBLIC_PORTAL_SESSION_KEY = 'publicRequestProfileId';

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
    preferredLocale: req.session?.user?.preferred_locale,
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

function buildSetLocale({ userRepository, requestProfileRepository } = {}) {
  return async function setLocale(req, res, next) {
    const locale = normalizeLocale(req.params.locale);
    const redirectTo = sanitizeRedirect(req.query.redirect || '/');

    if (locale && req.session) {
      req.session.locale = locale;
      req.session.localeManuallySelected = true;

      const userId = req.session.user?.id;
      const publicProfileId = req.session[PUBLIC_PORTAL_SESSION_KEY];

      try {
        if (userId && userRepository?.updatePreferredLocale) {
          await userRepository.updatePreferredLocale(userId, locale);
          req.session.user.preferred_locale = locale;
        }

        if (publicProfileId && requestProfileRepository?.updatePreferredLocale) {
          await requestProfileRepository.updatePreferredLocale(publicProfileId, locale);
        }
      } catch (error) {
        return next(error);
      }
    }

    return res.redirect(redirectTo);
  };
}

module.exports = {
  attachLocale,
  buildSetLocale,
  setLocale: buildSetLocale(),
};
