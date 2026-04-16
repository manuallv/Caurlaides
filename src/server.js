const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const { env } = require('./config/env');
const { initializeSocket } = require('./infrastructure/realtime/socket');
const { pool } = require('./infrastructure/database/pool');
const { runMigrations } = require('./infrastructure/database/run-migrations');
const { seedDemoData } = require('../scripts/seed-demo');

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.appUrl,
      credentials: true,
    },
  });

  app.locals.io = io;
  app.locals.databaseReady = false;
  initializeSocket(io);

  try {
    await pool.query('SELECT 1');
    const appliedMigrations = await runMigrations(pool);

    if (appliedMigrations.length) {
      console.log(`Applied database migrations: ${appliedMigrations.join(', ')}`);
    }

    if (env.autoDemoSeed) {
      try {
        const seedResult = await seedDemoData({
          closePool: false,
          runDbMigrations: false,
          logger: console,
        });

        if (seedResult.created) {
          console.log(
            `Demo seed ready for ${seedResult.eventName}. Owner login: ${seedResult.ownerEmail} / ${seedResult.password}`,
          );
        } else {
          console.log(`Demo seed already present for ${seedResult.eventName}.`);
        }
      } catch (seedError) {
        console.warn('Demo seed failed during startup:', seedError.message);
      }
    }

    app.locals.databaseReady = true;
  } catch (error) {
    // Allow the app to boot so deployment can complete even before
    // production database credentials are configured. Database-backed
    // routes will still require valid connection settings later.
    console.warn('Database connection check failed during startup:', error.message);
  }

  server.listen(env.port, () => {
    console.log(`Server listening on ${env.appUrl}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
