class AuditLogService {
  constructor(auditLogRepository) {
    this.auditLogRepository = auditLogRepository;
  }

  async record(payload, connection = null) {
    return this.auditLogRepository.create(connection, payload);
  }

  async listByEvent(eventId, limit = 20) {
    return this.auditLogRepository.listByEvent(eventId, limit);
  }

  async listByEntity(entityType, entityId, limit = 100) {
    return this.auditLogRepository.listByEntity(entityType, entityId, limit);
  }

  async findById(auditId) {
    return this.auditLogRepository.findById(auditId);
  }
}

module.exports = { AuditLogService };
