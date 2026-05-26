const { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale } = require('../../../shared/i18n');

function normalizeSystemUserPayload(body) {
  return {
    fullName: body.fullName,
    email: body.email,
    phone: body.phone || null,
    password: body.password || '',
    isActive: body.isActive === 'on',
  };
}

function normalizeEmailSettingsPayload(body) {
  return {
    emailProvider: body.emailProvider,
    smtpHost: body.smtpHost || '',
    smtpPort: body.smtpPort || '',
    smtpSecure: body.smtpSecure === 'on',
    smtpUser: body.smtpUser || '',
    smtpPass: body.smtpPass || '',
    smtpFromEmail: body.smtpFromEmail || '',
    smtpFromName: body.smtpFromName || '',
    resendApiKey: body.resendApiKey || '',
    resendFromEmail: body.resendFromEmail || '',
    resendFromName: body.resendFromName || '',
  };
}

function normalizeEmailTemplatesPayload(body) {
  return {
    forgotPasswordSubject: body.forgotPasswordSubject || '',
    forgotPasswordHtml: body.forgotPasswordHtml || '',
    forgotPasswordText: body.forgotPasswordText || '',
    portalInviteSubject: body.portalInviteSubject || '',
    portalInviteHtml: body.portalInviteHtml || '',
    portalInviteText: body.portalInviteText || '',
  };
}

function normalizeEmailTemplatePayload(body) {
  return {
    subject: body.subject || '',
    htmlContent: body.htmlContent || '',
    textContent: body.textContent || '',
  };
}

function resolveTemplateLocale(req) {
  return normalizeLocale(
    (req.body && req.body.locale) ||
    (req.query && req.query.locale) ||
    req.locale,
  ) || DEFAULT_LOCALE;
}

function buildSystemController({ systemService }) {
  return {
    async showUsers(req, res) {
      const users = await systemService.listUsers(req.currentUser, req.t);

      return res.render('settings/users', {
        pageTitle: req.t('system.users.title'),
        users,
        activeEvent: null,
      });
    },

    async showUserForm(req, res) {
      const user = await systemService.getUser(req.params.userId, req.currentUser, req.t);

      return res.render('settings/user-form', {
        pageTitle: user ? req.t('system.users.editTitle') : req.t('system.users.createTitle'),
        user,
        activeEvent: null,
      });
    },

    async createUser(req, res) {
      await systemService.saveUser(normalizeSystemUserPayload(req.body), req.currentUser, req.t);
      req.flash('success', req.t('system.users.created'));
      return res.redirect('/system/users');
    },

    async updateUser(req, res) {
      await systemService.saveUser({
        userId: req.params.userId,
        ...normalizeSystemUserPayload(req.body),
      }, req.currentUser, req.t);
      req.flash('success', req.t('system.users.updated'));
      return res.redirect('/system/users');
    },

    async deleteUser(req, res) {
      await systemService.deleteUser(req.params.userId, req.currentUser, req.t);
      req.flash('success', req.t('system.users.deleted'));
      return res.redirect('/system/users');
    },

    async showBackups(req, res) {
      const filters = {
        sourceTable: req.query.sourceTable || '',
        eventId: req.query.eventId || '',
        query: req.query.q || '',
      };
      const [backups, sourceOptions] = await Promise.all([
        systemService.listRequestDataBackups(filters, req.currentUser, req.t),
        Promise.resolve(systemService.getBackupSourceOptions(req.currentUser, req.t)),
      ]);

      return res.render('settings/backups', {
        pageTitle: req.t('system.backups.title'),
        backups,
        filters,
        sourceOptions,
        activeEvent: null,
      });
    },

    async restoreBackup(req, res) {
      try {
        const backup = await systemService.restoreRequestDataBackup(
          req.params.backupId,
          req.currentUser,
          req.t,
        );

        req.flash('success', req.t('system.backups.restored', { title: backup.title }));
      } catch (error) {
        req.flash('error', error.message || req.t('system.backups.restoreFailed'));
      }

      return res.redirect('/system/backups');
    },

    async redirectSettings(req, res) {
      return res.redirect('/system/settings/email');
    },

    async showEmailSettings(req, res) {
      const data = await systemService.getSystemSettings(req.currentUser, req.t);

      return res.render('settings/system-email', {
        pageTitle: req.t('system.settings.emailTitle'),
        settings: data.settings,
        activeEvent: null,
      });
    },

    async updateEmailSettings(req, res) {
      await systemService.saveEmailSettings(
        normalizeEmailSettingsPayload(req.body),
        req.currentUser,
        req.t,
      );

      req.flash('success', req.t('system.settings.saved'));
      return res.redirect('/system/settings/email');
    },

    async showEmailTest(req, res) {
      const data = await systemService.getSystemSettings(req.currentUser, req.t);

      return res.render('settings/system-email-test', {
        pageTitle: req.t('system.settings.testTitle'),
        settings: data.settings,
        activeEvent: null,
      });
    },

    async sendTestEmail(req, res) {
      try {
        const result = await systemService.sendTestEmail({
          recipientEmail: req.body.testRecipientEmail,
          locale: req.locale,
        }, req.currentUser, req.t);

        req.flash('success', req.t('system.settings.testSent', {
          provider: result.provider === 'resend'
            ? req.t('system.settings.provider.resend')
            : req.t('system.settings.provider.smtp'),
        }));
      } catch (error) {
        req.flash('error', error.message || req.t('errors.generic'));
      }

      return res.redirect('/system/settings/test');
    },

    async showEmailTemplates(req, res) {
      const activeTemplateLocale = resolveTemplateLocale(req);
      const data = await systemService.getSystemSettings(req.currentUser, req.t, {
        templateLocale: activeTemplateLocale,
      });

      return res.render('settings/system-email-templates', {
        pageTitle: req.t('system.settings.templatesTitle'),
        templates: data.templates,
        activeTemplateKey: req.query.template || '',
        activeTemplateLocale,
        templateLocales: SUPPORTED_LOCALES,
        activeEvent: null,
      });
    },

    async updateEmailTemplates(req, res) {
      const activeTemplateLocale = resolveTemplateLocale(req);
      await systemService.saveEmailTemplates(
        normalizeEmailTemplatesPayload(req.body),
        req.currentUser,
        req.t,
        activeTemplateLocale,
      );

      req.flash('success', req.t('system.settings.saved'));
      return res.redirect(`/system/settings/templates?locale=${encodeURIComponent(activeTemplateLocale)}`);
    },

    async updateEmailTemplate(req, res) {
      const templateKey = req.params.templateKey;
      const activeTemplateLocale = resolveTemplateLocale(req);

      try {
        await systemService.saveEmailTemplate(
          templateKey,
          normalizeEmailTemplatePayload(req.body),
          req.currentUser,
          req.t,
          activeTemplateLocale,
        );

        req.flash('success', req.t('system.settings.templateSaved'));
      } catch (error) {
        req.flash('error', error.message || req.t('errors.generic'));
      }

      return res.redirect(
        `/system/settings/templates?template=${encodeURIComponent(templateKey)}&locale=${encodeURIComponent(activeTemplateLocale)}`,
      );
    },
  };
}

module.exports = { buildSystemController };
