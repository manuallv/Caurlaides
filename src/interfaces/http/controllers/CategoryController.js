const { emitEventUpdate } = require('../../../infrastructure/realtime/socket');

function normalizeCategoryPayload(body) {
  return {
    name: body.name,
    description: body.description || null,
    quota: body.quota ? Number(body.quota) : null,
    isActive: body.isActive === 'on' ? 1 : 0,
    sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
  };
}

function buildCategoryController({ categoryService }) {
  return {
    async showIndex(req, res) {
      const data = await categoryService.getCategoryPage(req.params.eventId, req.currentUser.id);

      return res.render('events/categories', {
        pageTitle: `${data.event.name} categories`,
        activeEvent: data.event,
        passCategories: data.passCategories,
        wristbandCategories: data.wristbandCategories,
        canManage: data.canManage,
      });
    },

    async create(req, res) {
      await categoryService.createCategory(
        req.params.eventId,
        req.currentUser.id,
        req.body.type,
        normalizeCategoryPayload(req.body),
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', `${req.body.type === 'pass' ? 'Pass' : 'Wristband'} category created.`);
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },

    async update(req, res) {
      await categoryService.updateCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        req.params.type,
        normalizeCategoryPayload(req.body),
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', 'Category updated.');
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },

    async destroy(req, res) {
      await categoryService.deleteCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        req.params.type,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', 'Category deleted.');
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },
  };
}

module.exports = { buildCategoryController };
