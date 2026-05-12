const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Keep all server-side date parsing/formatting aligned with the Latvia-facing
// product, even when the host machine defaults to UTC.
process.env.TZ = process.env.APP_TIME_ZONE || 'Europe/Riga';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  timeZone: process.env.TZ,
  uploadsDir: process.env.UPLOADS_DIR || process.env.CAURLAIDES_UPLOADS_DIR || '',
  vehicleEntryApiKey: String(process.env.VEHICLE_ENTRY_API_KEY || '').trim(),
  sessionSecret: process.env.SESSION_SECRET || 'development-session-secret',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  designAssetsSource: process.env.DESIGN_ASSETS_SOURCE || '',
  superAdminEmail: String(process.env.SUPER_ADMIN_EMAIL || 'artis@untitled.lv').trim().toLowerCase(),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'caurlaides',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },
};

if (!env.uploadsDir) {
  env.uploadsDir = path.resolve(process.cwd(), '..', 'caurlaides-uploads');
} else {
  env.uploadsDir = path.resolve(env.uploadsDir);
}

// Some shared-hosting environments resolve "localhost" to IPv6 (::1),
// while the MySQL user may only be granted access from 127.0.0.1.
if (env.db.host === 'localhost') {
  env.db.host = '127.0.0.1';
}

env.isProduction = env.nodeEnv === 'production';
env.autoDemoSeed = process.env.AUTO_DEMO_SEED === 'true'
  || (
    process.env.AUTO_DEMO_SEED !== 'false'
    && env.isProduction
    && env.appUrl.includes('caurlaides.pasakums.lv')
  );

module.exports = { env };
