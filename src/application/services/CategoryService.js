const dayjs = require('dayjs');
const { AppError } = require('../../shared/errors/AppError');
const { MANAGEMENT_ROLES } = require('../../shared/constants/event-roles');
const { DEFAULT_LOCALE, buildAuditMetadata, translate } = require('../../shared/i18n');

function resolveTranslate(t) {
  return typeof t === 'function' ? t : (key, params) => translate(DEFAULT_LOCALE, key, params);
}

function normalizeEntryWindowsInput(input) {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (typeof input === 'object') {
    return Object.values(input);
  }

  return [];
}

function sanitizePassEntryWindowsPayload(input, t) {
  const tx = resolveTranslate(t);
  const entryWindows = normalizeEntryWindowsInput(input);

  return entryWindows.reduce((sanitized, rawWindow, index) => {
    const startAtRaw = String(rawWindow?.startAt || rawWindow?.start_at || '').trim();
    const endAtRaw = String(rawWindow?.endAt || rawWindow?.end_at || '').trim();

    if (!startAtRaw && !endAtRaw) {
      return sanitized;
    }

    if (!startAtRaw || !endAtRaw) {
      throw new AppError(tx('validation.accessType.entryWindowIncomplete'), 422);
    }

    const startAt = dayjs(startAtRaw);
    const endAt = dayjs(endAtRaw);

    if (!startAt.isValid() || !endAt.isValid()) {
      throw new AppError(tx('validation.accessType.entryWindowInvalid'), 422);
    }

    if (!endAt.isAfter(startAt)) {
      throw new AppError(tx('validation.accessType.entryWindowOrder'), 422);
    }

    sanitized.push({
      startAt: startAt.format('YYYY-MM-DD HH:mm:ss'),
      endAt: endAt.format('YYYY-MM-DD HH:mm:ss'),
      sortOrder: index,
    });

    return sanitized;
  }, []);
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

    const entryWindows = type === 'pass' ? sanitizePassEntryWindowsPayload(payload.entryWindows, tx) : [];
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const categoryId = await this.categoryRepository.create(connection, type, {
        eventId,
        userId: actorId,
        ...payload,
      });

      if (type === 'pass') {
        await this.categoryRepository.replacePassEntryWindows(connection, categoryId, entryWindows);
      }

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
          afterState: {
            ...payload,
            entryWindows,
          },
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

    const entryWindows = type === 'pass' ? sanitizePassEntryWindowsPayload(payload.entryWindows, tx) : [];
    const existingCategory = await this.categoryRepository.findById(type, categoryId);

    if (!existingCategory || Number(existingCategory.event_id) !== Number(eventId)) {
      throw new AppError(tx('service.category.notFound'), 404);
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();
      await this.categoryRepository.updateWithConnection(connection, type, categoryId, {
        userId: actorId,
        ...payload,
      });

      if (type === 'pass') {
        await this.categoryRepository.replacePassEntryWindows(connection, categoryId, entryWindows);
      }

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
        afterState: {
          ...payload,
          entryWindows,
        },
        metadata: buildAuditMetadata('audit.message.categoryUpdated', {
          type: tx(`categoryType.${type}`),
          name: payload.name,
        }),
      }, connection);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
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
