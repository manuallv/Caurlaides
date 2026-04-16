const {
  formatDate,
  formatDateTime,
  formatDateTimeLocalInput,
  truncate,
} = require('../../../shared/utils/formatters');
const { formatAuditMessage } = require('../../../shared/i18n');
const { env } = require('../../../config/env');

function attachViewLocals(req, res, next) {
  res.locals.currentUser = req.currentUser;
  res.locals.isSuperAdmin = Boolean(
    req.currentUser
      && String(req.currentUser.email || '').trim().toLowerCase() === env.superAdminEmail,
  );
  res.locals.activeEvent = res.locals.activeEvent || null;
  res.locals.t = req.t;
  res.locals.flash = {
    success: req.flash('success'),
    error: req.flash('error'),
  };
  res.locals.helpers = {
    formatDate: (value) => formatDate(value, req.locale, req.t('common.notSet')),
    formatDateTime: (value) => formatDateTime(value, req.locale, req.t('common.notSet')),
    formatDateTimeLocalInput,
    truncate,
    formatAuditMessage: (entry) => formatAuditMessage(entry, req.t),
    roleLabel: (role) => req.t(`roles.${role}`),
    statusLabel: (status) => req.t(`statuses.${status}`),
    auditEntityLabel: (entityType) => req.t(`audit.entity.${entityType}`),
    auditActionLabel: (action) => req.t(`audit.action.${action}`),
  };
  res.locals.currentPath = req.originalUrl;
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  next();
}

module.exports = { attachViewLocals };
