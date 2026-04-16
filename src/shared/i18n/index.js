const { translations } = require('./translations');

const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'lv'];

function getNestedValue(source, key) {
  if (source && Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key];
  }

  return key.split('.').reduce((value, segment) => {
    if (value && Object.prototype.hasOwnProperty.call(value, segment)) {
      return value[segment];
    }

    return undefined;
  }, source);
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (params[key] === undefined || params[key] === null) {
      return match;
    }

    return String(params[key]);
  });
}

function normalizeLocale(locale) {
  if (!locale) {
    return null;
  }

  const candidate = String(locale).toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.includes(candidate) ? candidate : null;
}

function detectLocale(acceptLanguage = '') {
  const candidates = acceptLanguage
    .split(',')
    .map((item) => item.trim().split(';')[0])
    .map(normalizeLocale)
    .filter(Boolean);

  return candidates[0] || DEFAULT_LOCALE;
}

function resolveLocale({ sessionLocale, requestedLocale, acceptLanguage } = {}) {
  return (
    normalizeLocale(requestedLocale) ||
    normalizeLocale(sessionLocale) ||
    detectLocale(acceptLanguage) ||
    DEFAULT_LOCALE
  );
}

function translate(locale, key, params = {}) {
  const activeLocale = normalizeLocale(locale) || DEFAULT_LOCALE;
  const dictionary = translations[activeLocale] || translations[DEFAULT_LOCALE];
  const fallbackDictionary = translations[DEFAULT_LOCALE];
  const template =
    getNestedValue(dictionary, key) ||
    getNestedValue(fallbackDictionary, key) ||
    key;

  return interpolate(template, params);
}

function createTranslator(locale) {
  return (key, params = {}) => translate(locale, key, params);
}

function buildAuditMetadata(messageKey, messageParams = {}) {
  return {
    messageKey,
    messageParams,
  };
}

function formatAuditMessage(entry, t) {
  const metadata = entry && entry.metadata;

  if (metadata && metadata.messageKey) {
    return t(metadata.messageKey, metadata.messageParams || {});
  }

  return entry.message;
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  buildAuditMetadata,
  createTranslator,
  formatAuditMessage,
  normalizeLocale,
  resolveLocale,
  translate,
};
