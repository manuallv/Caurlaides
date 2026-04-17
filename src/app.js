const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const flash = require('connect-flash');
const morgan = require('morgan');
const methodOverride = require('method-override');
const expressLayouts = require('express-ejs-layouts');
const csrf = require('csurf');
const { createSessionMiddleware } = require('./config/session');
const { env } = require('./config/env');
const { attachLocale } = require('./interfaces/http/middleware/locale');
const { attachCurrentUser } = require('./interfaces/http/middleware/current-user');
const { attachViewLocals } = require('./interfaces/http/middleware/view-locals');
const { notFoundHandler, errorHandler } = require('./interfaces/http/middleware/error-handler');
const { buildRouter } = require('./interfaces/http/routes');

function createApp() {
  const app = express();
  const csrfProtection = csrf({
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  });

  if (env.isProduction) {
    // Shared hosts such as Hostinger usually terminate HTTPS at a proxy,
    // so Express must trust the forwarded protocol before issuing secure cookies.
    app.set('trust proxy', 1);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('layout', 'layout');

  app.use(expressLayouts);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));
  // Session must be available before flash messages and CSRF protection.
  app.use(createSessionMiddleware());
  app.use(attachLocale);
  app.use(flash());
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/external/')) {
      return next();
    }

    return csrfProtection(req, res, next);
  });
  app.use(attachCurrentUser);
  app.use(attachViewLocals);

  app.use('/public', express.static(path.join(process.cwd(), 'public')));

  app.use(buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
