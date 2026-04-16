function buildAuthController({ authService, systemService }) {
  return {
    showLogin(req, res) {
      res.render('auth/login', {
        pageTitle: req.t('auth.login.title'),
      });
    },

    showRegister(req, res) {
      res.render('auth/register', {
        pageTitle: req.t('auth.register.title'),
      });
    },

    showForgotPassword(req, res) {
      res.render('auth/forgot-password', {
        pageTitle: req.t('auth.forgot.title'),
      });
    },

    showResetPassword(req, res) {
      res.render('auth/reset-password', {
        pageTitle: req.t('auth.reset.title'),
        token: req.params.token,
      });
    },

    async register(req, res) {
      try {
        const user = await authService.register({
          fullName: req.body.fullName,
          email: req.body.email,
          password: req.body.password,
        }, req.t);

        req.session.user = user;
        req.flash('success', req.t('flash.accountCreated'));
        return res.redirect('/dashboard');
      } catch (error) {
        req.flash('error', error.message);
        return res.redirect('/register');
      }
    },

    async login(req, res) {
      try {
        const user = await authService.login({
          email: req.body.email,
          password: req.body.password,
        }, req.t);

        req.session.user = user;
        req.flash('success', req.t('flash.welcomeBack', { name: user.full_name }));
        return res.redirect('/dashboard');
      } catch (error) {
        req.flash('error', error.message);
        return res.redirect('/login');
      }
    },

    async forgotPassword(req, res) {
      await systemService.sendForgotPassword(req.body.email, req.t);
      req.flash('success', req.t('flash.passwordResetSent'));
      return res.redirect('/forgot-password');
    },

    async resetPassword(req, res) {
      try {
        await systemService.resetPassword(req.params.token, req.body.password, req.t);
        req.flash('success', req.t('flash.passwordResetComplete'));
        return res.redirect('/login');
      } catch (error) {
        req.flash('error', error.message);
        return res.redirect(`/reset-password/${req.params.token}`);
      }
    },

    logout(req, res, next) {
      const locale = req.locale;

      req.session.destroy((error) => {
        if (error) {
          return next(error);
        }

        res.clearCookie('caurlaides.sid');
        return res.redirect(`/language/${locale}?redirect=/login`);
      });
    },
  };
}

module.exports = { buildAuthController };
