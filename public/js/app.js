document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('[data-mobile-sidebar]');
  const sidebarToggles = document.querySelectorAll('[data-mobile-sidebar-toggle]');
  const sidebarClosers = document.querySelectorAll('[data-mobile-sidebar-close], [data-mobile-sidebar-overlay]');
  const menuButton = document.querySelector('[data-mobile-menu-toggle]');
  const menuPanel = document.querySelector('[data-mobile-menu]');

  const closeSidebar = () => {
    if (!sidebar) {
      return;
    }

    sidebar.classList.remove('is-open');
    document.body.classList.remove('is-sidebar-open');
  };

  const openSidebar = () => {
    if (!sidebar) {
      return;
    }

    sidebar.classList.add('is-open');
    document.body.classList.add('is-sidebar-open');
  };

  sidebarToggles.forEach((toggle) => {
    toggle.addEventListener('click', openSidebar);
  });

  sidebarClosers.forEach((closer) => {
    closer.addEventListener('click', closeSidebar);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeSidebar();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });

  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden');
    });
  }

  const eventRoom = document.body.dataset.eventRoom;

  if (window.io && eventRoom) {
    const socket = window.io();
    let isRefreshing = false;

    const refreshLiveSections = async () => {
      const currentSections = [...document.querySelectorAll('[data-live-section]')];

      if (!currentSections.length) {
        window.location.reload();
        return;
      }

      const response = await fetch(window.location.href, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error(`Live refresh failed with status ${response.status}`);
      }

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      let replacedSections = 0;

      currentSections.forEach((section) => {
        const sectionName = section.dataset.liveSection;
        const nextSection = nextDocument.querySelector(`[data-live-section="${sectionName}"]`);

        if (!nextSection) {
          return;
        }

        section.replaceWith(nextSection);
        replacedSections += 1;
      });

      if (!replacedSections) {
        window.location.reload();
      }
    };

    socket.emit('event:join', eventRoom);

    socket.on('dashboard:refresh', async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;

      try {
        await refreshLiveSections();
      } catch (error) {
        window.location.reload();
      } finally {
        isRefreshing = false;
      }
    });

    window.addEventListener('beforeunload', () => {
      socket.emit('event:leave', eventRoom);
    });
  }
});
