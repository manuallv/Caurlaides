function buildDashboardController({ eventService }) {
  return {
    async index(req, res) {
      const events = await eventService.listUserEvents(req.currentUser.id);

      const totals = events.reduce(
        (accumulator, event) => {
          accumulator.totalEvents += 1;
          accumulator.totalPassRequests += Number(event.total_pass_requests || 0);
          accumulator.totalWristbandRequests += Number(event.total_wristband_requests || 0);
          accumulator.totalRequests += Number(event.total_pass_requests || 0) + Number(event.total_wristband_requests || 0);
          return accumulator;
        },
        {
          totalEvents: 0,
          totalPassRequests: 0,
          totalWristbandRequests: 0,
          totalRequests: 0,
        },
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
