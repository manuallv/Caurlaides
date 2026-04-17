const express = require('express');
const { pool } = require('../../../infrastructure/database/pool');
const { UserRepository } = require('../../../infrastructure/database/repositories/UserRepository');
const { EventRepository } = require('../../../infrastructure/database/repositories/EventRepository');
const { CategoryRepository } = require('../../../infrastructure/database/repositories/CategoryRepository');
const { AuditLogRepository } = require('../../../infrastructure/database/repositories/AuditLogRepository');
const { DashboardRepository } = require('../../../infrastructure/database/repositories/DashboardRepository');
const { RequestProfileRepository } = require('../../../infrastructure/database/repositories/RequestProfileRepository');
const { RequestRepository } = require('../../../infrastructure/database/repositories/RequestRepository');
const { SystemSettingsRepository } = require('../../../infrastructure/database/repositories/SystemSettingsRepository');
const { PasswordResetTokenRepository } = require('../../../infrastructure/database/repositories/PasswordResetTokenRepository');
const { AuthService } = require('../../../application/services/AuthService');
const { EventService } = require('../../../application/services/EventService');
const { CategoryService } = require('../../../application/services/CategoryService');
const { AuditLogService } = require('../../../application/services/AuditLogService');
const { AccessService } = require('../../../application/services/AccessService');
const { EmailService } = require('../../../application/services/EmailService');
const { SystemService } = require('../../../application/services/SystemService');
const { buildAuthController } = require('../controllers/AuthController');
const { buildDashboardController } = require('../controllers/DashboardController');
const { buildEventController } = require('../controllers/EventController');
const { buildAccessController } = require('../controllers/AccessController');
const { buildSystemController } = require('../controllers/SystemController');
const { buildAuthRoutes } = require('./auth-routes');
const { buildDashboardRoutes } = require('./dashboard-routes');
const { buildEventRoutes } = require('./event-routes');
const { buildExternalApiRoutes } = require('./external-api-routes');
const { buildPublicAccessRoutes } = require('./public-access-routes');
const { buildSystemRoutes } = require('./system-routes');
const { setLocale } = require('../middleware/locale');

function buildRouter() {
  const router = express.Router();

  const userRepository = new UserRepository(pool);
  const eventRepository = new EventRepository(pool);
  const categoryRepository = new CategoryRepository(pool);
  const auditLogRepository = new AuditLogRepository(pool);
  const dashboardRepository = new DashboardRepository(pool);
  const requestProfileRepository = new RequestProfileRepository(pool);
  const requestRepository = new RequestRepository(pool);
  const systemSettingsRepository = new SystemSettingsRepository(pool);
  const passwordResetTokenRepository = new PasswordResetTokenRepository(pool);

  const auditLogService = new AuditLogService(auditLogRepository);
  const emailService = new EmailService(systemSettingsRepository);
  const systemService = new SystemService({
    userRepository,
    eventRepository,
    requestProfileRepository,
    requestRepository,
    systemSettingsRepository,
    passwordResetTokenRepository,
    emailService,
  });
  const authService = new AuthService(userRepository);
  const eventService = new EventService({
    pool,
    eventRepository,
    userRepository,
    auditLogService,
    dashboardRepository,
  });
  const categoryService = new CategoryService({
    pool,
    categoryRepository,
    eventService,
    auditLogService,
  });
  const accessService = new AccessService({
    pool,
    categoryRepository,
    requestProfileRepository,
    requestRepository,
    eventService,
    auditLogService,
    systemService,
  });

  const authController = buildAuthController({ authService, systemService });
  const dashboardController = buildDashboardController({ eventService });
  const eventController = buildEventController({ eventService, auditLogService });
  const accessController = buildAccessController({ categoryService, accessService });
  const systemController = buildSystemController({ systemService });

  router.get('/language/:locale', setLocale);
  router.use(buildAuthRoutes({ authController }));
  router.use(buildDashboardRoutes({ dashboardController, accessController }));
  router.use(buildSystemRoutes({ systemController }));
  router.use(buildExternalApiRoutes({ accessController }));
  router.use(buildPublicAccessRoutes({ accessController }));
  router.use(buildEventRoutes({ eventController, accessController }));

  return router;
}

module.exports = { buildRouter };
