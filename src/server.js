const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const { env } = require('./config/env');
const { initializeSocket } = require('./infrastructure/realtime/socket');
const { pool } = require('./infrastructure/database/pool');

async function startServer() {
  await pool.query('SELECT 1');

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.appUrl,
      credentials: true,
    },
  });

  app.locals.io = io;
  initializeSocket(io);

  server.listen(env.port, () => {
    console.log(`Server listening on ${env.appUrl}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
