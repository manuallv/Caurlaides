const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');

class CategoryService {
  constructor({ pool, categoryRepository, eventService, auditLogService }) {
    this.pool = pool;
    this.categoryRepository = categoryRepository;
    this.eventService = eventService;
    this.auditLogService = auditLogService;
  }

  async getCategoryPage(eventId, actorId) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId);
    const passCategories = await this.categoryRepository.listByEvent(eventId, 'pass');
    const wristbandCategories = await this.categoryRepository.listByEvent(eventId, 'wristband');

    return {
      event,
      passCategories,
      wristbandCategories,
      canManage: MANAGEMENT_ROLES.includes(event.role),
    };
  }

  async createCategory(eventId, actorId, type, payload) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError('Only owners and admins can manage categories.', 403);
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
          message: `Created ${type} category "${payload.name}".`,
          afterState: payload,
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

  async updateCategory(eventId, categoryId, actorId, type, payload) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError('Only owners and admins can manage categories.', 403);
    }

    const existingCategory = await this.categoryRepository.findById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError('Category not found.', 404);
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
      message: `Updated ${type} category "${payload.name}".`,
      beforeState: existingCategory,
      afterState: payload,
    });
  }

  async deleteCategory(eventId, categoryId, actorId, type) {
    const event = await this.eventService.getEventAccessOrFail(eventId, actorId);

    if (!MANAGEMENT_ROLES.includes(event.role)) {
      throw new AppError('Only owners and admins can manage categories.', 403);
    }

    const existingCategory = await this.categoryRepository.findById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError('Category not found.', 404);
    }

    await this.categoryRepository.delete(type, categoryId);

    await this.auditLogService.record({
      eventId,
      userId: actorId,
      entityType: `${type}_category`,
      entityId: categoryId,
      action: 'deleted',
      message: `Deleted ${type} category "${existingCategory.name}".`,
      beforeState: existingCategory,
    });
  }
}

module.exports = { CategoryService };
