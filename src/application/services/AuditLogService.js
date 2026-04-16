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
}

module.exports = { AuditLogService };
