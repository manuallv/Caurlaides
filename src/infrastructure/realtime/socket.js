function initializeSocket(io) {
  io.on('connection', (socket) => {
    socket.on('event:join', (eventId) => {
      if (!eventId) {
        return;
      }

      socket.join(`event:${eventId}`);
    });

    socket.on('event:leave', (eventId) => {
      if (!eventId) {
        return;
      }

      socket.leave(`event:${eventId}`);
    });
  });
}

function emitEventUpdate(io, eventId, type, payload = {}) {
  if (!io || !eventId) {
    return;
  }

  io.to(`event:${eventId}`).emit(type, payload);
}

module.exports = {
  emitEventUpdate,
  initializeSocket,
};
