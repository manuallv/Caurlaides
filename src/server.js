const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const { env } = require('./config/env');
const { initializeSocket } = require('./infrastructure/realtime/socket');
const { pool } = require('./infrastructure/database/pool');
const { runMigrations } = require('./infrastructure/database/run-migrations');

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
