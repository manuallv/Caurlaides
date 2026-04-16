function buildAuthController({ authService }) {
  return {
    showLogin(req, res) {
      res.render('auth/login', {
        pageTitle: 'Log in',
      });
    },

    showRegister(req, res) {
      res.render('auth/register', {
        pageTitle: 'Create account',
      });
    },

    async register(req, res) {
      try {
        const user = await authService.register({
          fullName: req.body.fullName,
          email: req.body.email,
          password: req.body.password,
        });

        req.session.user = user;
        req.flash('success', 'Account created successfully.');
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
        });

        req.session.user = user;
        req.flash('success', `Welcome back, ${user.full_name}.`);
        return res.redirect('/dashboard');
      } catch (error) {
        req.flash('error', error.message);
        return res.redirect('/login');
      }
    },

    logout(req, res, next) {
      req.session.destroy((error) => {
        if (error) {
          return next(error);
        }

        res.clearCookie('caurlaides.sid');
        return res.redirect('/login');
      });
    },
  };
}

module.exports = { buildAuthController };
