const { emitEventUpdate } = require('../../../infrastructure/realtime/socket');

function normalizeCategoryPayload(body) {
  return {
    name: body.name,
    description: body.description || null,
    quota: body.quota ? Number(body.quota) : null,
    isActive: body.isActive === 'on' ? 1 : 0,
    sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
    entryWindows: body.entryWindows || [],
  };
}

function buildCategoryController({ categoryService }) {
  return {
    async showIndex(req, res) {
      const data = await categoryService.getCategoryPage(req.params.eventId, req.currentUser.id, req.t);

      return res.render('events/categories', {
        pageTitle: `${data.event.name} · ${req.t('nav.categories')}`,
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
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash(
        'success',
        req.body.type === 'pass'
          ? req.t('flash.passCategoryCreated')
          : req.t('flash.wristbandCategoryCreated'),
      );
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },

    async update(req, res) {
      await categoryService.updateCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        req.params.type,
        normalizeCategoryPayload(req.body),
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.categoryUpdated'));
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },

    async destroy(req, res) {
      await categoryService.deleteCategory(
        req.params.eventId,
        req.params.categoryId,
        req.currentUser.id,
        req.params.type,
        req.t,
      );

      emitEventUpdate(req.app.locals.io, req.params.eventId, 'dashboard:refresh', {
        eventId: req.params.eventId,
      });
      req.flash('success', req.t('flash.categoryDeleted'));
      return res.redirect(`/events/${req.params.eventId}/categories`);
    },
  };
}

module.exports = { buildCategoryController };
