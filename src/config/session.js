const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const dbConfig = require('./database');
const { env } = require('./env');

function createSessionMiddleware() {
  const MySQLStore = MySQLStoreFactory(session);
  const sessionStore = new MySQLStore(
    {
      ...dbConfig,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 24 * 60 * 60 * 1000,
      disableTouch: true,
      // We keep the schema in version control so local/dev/prod stay aligned.
      createDatabaseTable: false,
      schema: {
        tableName: 'sessions',
        columnNames: {
          session_id: 'session_id',
          expires: 'expires',
          data: 'data',
        },
      },
    }
  );

  return session({
    name: 'caurlaides.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    rolling: false,
    cookie: {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  });
}

module.exports = { createSessionMiddleware };
