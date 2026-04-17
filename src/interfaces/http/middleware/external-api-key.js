const crypto = require('crypto');
const { env } = require('../../../config/env');
const { AppError } = require('../../../shared/errors/AppError');

function extractApiKey(req) {
  const authorization = String(req.get('Authorization') || '').trim();

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return String(req.get('X-API-Key') || '').trim();
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireExternalApiKey(req, res, next) {
  if (!env.vehicleEntryApiKey) {
    return next(new AppError(req.t('service.vehicleEntry.apiUnavailable'), 503));
  }

  const providedApiKey = extractApiKey(req);

  if (!providedApiKey || !safeCompare(providedApiKey, env.vehicleEntryApiKey)) {
    return next(new AppError(req.t('service.vehicleEntry.forbidden'), 403));
  }

  return next();
}

module.exports = { requireExternalApiKey };
