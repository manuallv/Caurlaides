function normalizeSystemUserPayload(body) {
  return {
    fullName: body.fullName,
    email: body.email,
    phone: body.phone || null,
    password: body.password || '',
    isActive: body.isActive === 'on',
  };
}

function normalizeSystemSettingsPayload(body) {
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
    forgotPasswordSubject: body.forgotPasswordSubject || '',
    forgotPasswordHtml: body.forgotPasswordHtml || '',
    forgotPasswordText: body.forgotPasswordText || '',
    portalInviteSubject: body.portalInviteSubject || '',
    portalInviteHtml: body.portalInviteHtml || '',
    portalInviteText: body.portalInviteText || '',
  };
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

    async showSettings(req, res) {
      const data = await systemService.getSystemSettings(req.currentUser, req.t);

      return res.render('settings/system', {
        pageTitle: req.t('system.settings.title'),
        settings: data.settings,
        templates: data.templates,
        activeEvent: null,
      });
    },

    async updateSettings(req, res) {
      await systemService.saveSystemSettings(
        normalizeSystemSettingsPayload(req.body),
        req.currentUser,
        req.t,
      );

      req.flash('success', req.t('system.settings.saved'));
      return res.redirect('/system/settings');
    },
  };
}

module.exports = { buildSystemController };
