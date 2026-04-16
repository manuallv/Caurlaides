const dayjs = require('dayjs');

function formatDateTime(value) {
  if (!value) {
    return 'Not set';
  }

  return dayjs(value).format('DD MMM YYYY, HH:mm');
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  return dayjs(value).format('DD MMM YYYY');
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
