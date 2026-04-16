document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('[data-mobile-menu-toggle]');
  const menuPanel = document.querySelector('[data-mobile-menu]');

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  const eventRoom = document.body.dataset.eventRoom;

  if (window.io && eventRoom) {
    const socket = window.io();
    socket.emit('event:join', eventRoom);

    socket.on('dashboard:refresh', () => {
      window.location.reload();
    });
  }
});
