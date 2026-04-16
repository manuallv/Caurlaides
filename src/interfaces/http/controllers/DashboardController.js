function buildDashboardController({ eventService }) {
  return {
    async index(req, res) {
      const events = await eventService.listUserEvents(req.currentUser.id);

      const totals = events.reduce(
        (accumulator, event) => {
          accumulator.totalEvents += 1;

          if (event.status === 'active') {
            accumulator.activeEvents += 1;
          }

          accumulator.totalMembers += Number(event.member_count || 0);
          return accumulator;
        },
        { totalEvents: 0, activeEvents: 0, totalMembers: 0 },
      );

      res.render('dashboard/index', {
        pageTitle: req.t('nav.dashboard'),
        events,
        totals,
      });
    },
  };
}

module.exports = { buildDashboardController };
