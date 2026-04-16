const express = require('express');
const { pool } = require('../../../infrastructure/database/pool');
const { UserRepository } = require('../../../infrastructure/database/repositories/UserRepository');
const { EventRepository } = require('../../../infrastructure/database/repositories/EventRepository');
const { CategoryRepository } = require('../../../infrastructure/database/repositories/CategoryRepository');
const { AuditLogRepository } = require('../../../infrastructure/database/repositories/AuditLogRepository');
const { DashboardRepository } = require('../../../infrastructure/database/repositories/DashboardRepository');
const { RequestProfileRepository } = require('../../../infrastructure/database/repositories/RequestProfileRepository');
const { RequestRepository } = require('../../../infrastructure/database/repositories/RequestRepository');
const { AuthService } = require('../../../application/services/AuthService');
const { EventService } = require('../../../application/services/EventService');
const { CategoryService } = require('../../../application/services/CategoryService');
const { AuditLogService } = require('../../../application/services/AuditLogService');
const { AccessService } = require('../../../application/services/AccessService');
const { buildAuthController } = require('../controllers/AuthController');
const { buildDashboardController } = require('../controllers/DashboardController');
const { buildEventController } = require('../controllers/EventController');
const { buildAccessController } = require('../controllers/AccessController');
const { buildAuthRoutes } = require('./auth-routes');
const { buildDashboardRoutes } = require('./dashboard-routes');
const { buildEventRoutes } = require('./event-routes');
const { buildPublicAccessRoutes } = require('./public-access-routes');
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

  const auditLogService = new AuditLogService(auditLogRepository);
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
  });

  const authController = buildAuthController({ authService });
  const dashboardController = buildDashboardController({ eventService });
  const eventController = buildEventController({ eventService, auditLogService });
  const accessController = buildAccessController({ categoryService, accessService });

  router.get('/language/:locale', setLocale);
  router.use(buildAuthRoutes({ authController }));
  router.use(buildDashboardRoutes({ dashboardController }));
  router.use(buildPublicAccessRoutes({ accessController }));
  router.use(buildEventRoutes({ eventController, accessController }));

  return router;
}

module.exports = { buildRouter };
