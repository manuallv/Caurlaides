const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'development-session-secret',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  designAssetsSource: process.env.DESIGN_ASSETS_SOURCE || '',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'caurlaides',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
};

env.isProduction = env.nodeEnv === 'production';

module.exports = { env };
