const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

class CategoryService {
  constructor({ pool, categoryRepository, eventService, auditLogService }) {
    this.pool = pool;
    this.categoryRepository = categoryRepository;
    this.eventService = eventService;
    this.auditLogService = auditLogService;
  }

  async getCategoryPage(eventId, actorId, t) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, t);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');

    return {
      event,
      passCategories,
      wristbandCategories,
      canManage: MANAGEMENT_ROLES.includes(event.role),
    };
  }

  async createCategory(eventId, actorId, type, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.category.manageCategories'), 403);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const categoryId = await this.categoryRepository.create(connection, type, {
        eventId,
        userId: actorId,
        ...payload,
      });

      await this.auditLogService.record(
        {
          eventId,
          userId: actorId,
          entityType: `${type}_category`,
          entityId: categoryId,
          action: 'created',
          message: translate(DEFAULT_LOCALE, 'audit.message.categoryCreated', {
            type: translate(DEFAULT_LOCALE, `categoryType.${type}`),
            name: payload.name,
          }),
          afterState: payload,
          metadata: buildAuditMetadata('audit.message.categoryCreated', {
            type: tx(`categoryType.${type}`),
            name: payload.name,
          }),
        },
        connection,
      );

      await connection.commit();
      return this.categoryRepository.findById(type, categoryId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async updateCategory(eventId, categoryId, actorId, type, payload, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.category.manageCategories'), 403);
    }

    const existingCategory = await this.categoryRepository.findById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.category.notFound'), 404);
    }

    await this.categoryRepository.update(type, categoryId, {
      userId: actorId,
      ...payload,
    });

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_category`,
      entityId: categoryId,
      action: 'updated',
      message: translate(DEFAULT_LOCALE, 'audit.message.categoryUpdated', {
        type: translate(DEFAULT_LOCALE, `categoryType.${type}`),
        name: payload.name,
      }),
      beforeState: existingCategory,
      afterState: payload,
      metadata: buildAuditMetadata('audit.message.categoryUpdated', {
        type: tx(`categoryType.${type}`),
        name: payload.name,
      }),
    });
  }

  async deleteCategory(eventId, categoryId, actorId, type, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.category.manageCategories'), 403);
    }

    const existingCategory = await this.categoryRepository.findById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.category.notFound'), 404);
    }

    await this.categoryRepository.delete(type, categoryId, actorId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_category`,
      entityId: categoryId,
      action: 'deleted',
      message: translate(DEFAULT_LOCALE, 'audit.message.categoryDeleted', {
        type: translate(DEFAULT_LOCALE, `categoryType.${type}`),
        name: existingCategory.name,
      }),
      beforeState: existingCategory,
      metadata: buildAuditMetadata('audit.message.categoryDeleted', {
        type: tx(`categoryType.${type}`),
        name: existingCategory.name,
      }),
    });
  }

  async restoreCategory(eventId, categoryId, actorId, type, t) {
    const tx = resolveTranslate(t);
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId, tx);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError(tx('service.category.manageCategories'), 403);
    }

    const existingCategory = await this.categoryRepository.findAnyById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.category.notFound'), 404);
    }

    await this.categoryRepository.restore(type, categoryId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_category`,
      entityId: categoryId,
      action: 'restored',
      message: translate(DEFAULT_LOCALE, 'audit.message.categoryRestored', {
        type: translate(DEFAULT_LOCALE, `categoryType.${type}`),
        name: existingCategory.name,
      }),
      afterState: existingCategory,
      metadata: buildAuditMetadata('audit.message.categoryRestored', {
        type: tx(`categoryType.${type}`),
        name: existingCategory.name,
      }),
    });
  }
}

module.exports = { CategoryService };
