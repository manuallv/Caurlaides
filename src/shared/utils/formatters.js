const dayjs = require('dayjs');
require('dayjs/locale/lv');

function formatDateTime(value, locale = 'en', emptyLabel = 'Not set') {
  if (!value) {
    return emptyLabel;
  }

  return dayjs(value).locale(locale).format('DD MMM YYYY, HH:mm');
}

function formatDate(value, locale = 'en', emptyLabel = 'Not set') {
  if (!value) {
    return emptyLabel;
  }

  return dayjs(value).locale(locale).format('DD MMM YYYY');
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

  return dayjs(value).format('YYYY-MM-DDTHH:mm');
}

module.exports = {
  formatDate,
  formatDateTime,
  formatDateTimeLocalInput,
  truncate,
};
