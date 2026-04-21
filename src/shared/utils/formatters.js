const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
require('dayjs/locale/lv');
const { env } = require('../../config/env');

dayjs.extend(utc);
dayjs.extend(timezone);

function toLatviaDateTime(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return dayjs(value).tz(env.timeZone);
  }

  if (typeof value === 'string' && !/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return dayjs.utc(value).tz(env.timeZone);
  }

  return dayjs(value).tz(env.timeZone);
}

function formatDateTime(value, locale = 'en', emptyLabel = 'Not set') {
  if (!value) {
    return emptyLabel;
  }

  return toLatviaDateTime(value).locale(locale).format('DD MMM YYYY, HH:mm');
}

function formatDate(value, locale = 'en', emptyLabel = 'Not set') {
  if (!value) {
    return emptyLabel;
  }

  return toLatviaDateTime(value).locale(locale).format('DD MMM YYYY');
}

function truncate(value, limit = 90) {
  if (!value) {
    return '';
  }

  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function formatDateTimeLocalInput(value) {
  if (!value) {
    return '';
  }

  return toLatviaDateTime(value).format('YYYY-MM-DDTHH:mm');
}

module.exports = {
  formatDate,
  formatDateTime,
  formatDateTimeLocalInput,
  truncate,
};
