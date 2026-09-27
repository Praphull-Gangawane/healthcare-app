import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { ok } from './lib/http.js';
import { requestContext } from './middleware/context.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { authenticate, requirePermission } from './middleware/auth.js';
import { providerStatus } from './providers/index.js';
import { authRouter } from './routes/auth.routes.js';
import { patientsRouter } from './routes/patients.routes.js';
import { directoryRouter } from './routes/directory.routes.js';
import { appointmentsRouter } from './routes/appointments.routes.js';
import { queueRouter } from './routes/queue.routes.js';
import { encountersRouter, prescriptionsRouter, vitalsRouter } from './routes/clinical.routes.js';
import { investigationsRouter } from './routes/investigations.routes.js';
import { documentsRouter } from './routes/documents.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { auditRouter, dashboardRouter, healthRouter, interopRouter, privacyRouter, reportsRouter, teleRouter } from './routes/misc.routes.js';
import { testRouter } from './routes/test.routes.js';
import { metrics, metricsMiddleware } from './lib/metrics.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.isProduction ? 1 : false);

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cors({ origin: config.corsOrigins, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Access-Reason', 'X-Auth-Mode', 'Authorization', 'X-Request-Id'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, customProps: () => ({}), autoLogging: { ignore: (req) => req.url === '/api/health' }, serializers: { req: (req: { method: string; url: string }): { method: string; url: string } => ({ method: req.method, url: req.url.split('?')[0] ?? '' }), res: (res: { statusCode: number }): { statusCode: number } => ({ statusCode: res.statusCode }) } }));
  app.use(metricsMiddleware);
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
  app.get('/api/health/ready', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    ok(res, { status: 'ready', database: 'ok', providers: providerStatus(), demoMode: config.DEMO_MODE, appName: config.APP_NAME });
  });
  // Operational metrics are not public: staff with operational-report permission only.
  app.get('/api/health/metrics', authenticate, requirePermission('report:operational'), (_req, res) => ok(res, metrics.snapshot()));
  app.get('/api/config', (_req, res) => ok(res, { appName: config.APP_NAME, demoMode: config.DEMO_MODE, currency: 'INR', timezone: 'Asia/Kolkata', emergencyNumber: '112' }));

  app.use('/api/auth', authRouter);
  app.use('/api/directory', directoryRouter);
  app.use('/api/doctors', directoryRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/queue', queueRouter);
  app.use('/api/encounters', encountersRouter);
  app.use('/api/vitals', vitalsRouter);
  app.use('/api/prescriptions', prescriptionsRouter);
  app.use('/api/investigations', investigationsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/health-data', healthRouter);
  app.use('/api/teleconsultation', teleRouter);
  app.use('/api/dashboards', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/privacy', privacyRouter);
  app.use('/api/interop', interopRouter);
  app.use('/api/admin', adminRouter);
  if (config.ENABLE_TEST_ROUTES) app.use('/api/test', testRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
