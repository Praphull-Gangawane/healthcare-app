import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: [path.join(serverRoot, '.env'), path.join(serverRoot, '..', '.env')], quiet: true });

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const int = (fallback: number) =>
  z.coerce.number().int().nonnegative().optional().transform((v) => v ?? fallback);

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: int(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_NAME: z.string().default('[APP_NAME]'),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: int(15),
  REFRESH_TOKEN_TTL_DAYS: int(7),
  COOKIE_SECURE: bool(isProd),
  LOGIN_RATE_LIMIT_MAX: int(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: int(60_000),
  API_RATE_LIMIT_MAX: int(1200),
  LOCKOUT_THRESHOLD: int(5),
  LOCKOUT_MINUTES: int(15),

  SMS_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_DLT_ENTITY_ID: z.string().optional(),

  WHATSAPP_PROVIDER: z.enum(['mock', 'cloud_api']).default('mock'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),

  EMAIL_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  EMAIL_API_URL: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('no-reply@example.test'),

  STORAGE_PROVIDER: z.enum(['local', 'mock', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z
    .string()
    .default('./var/storage')
    .transform((v) => (path.isAbsolute(v) ? v : path.resolve(serverRoot, '..', v))),
  STORAGE_BUCKET: z.string().optional(),
  UPLOAD_MAX_BYTES: int(10 * 1024 * 1024),
  DOWNLOAD_URL_TTL_SECONDS: int(300),
  SECURE_LINK_TTL_HOURS: int(72),

  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
  HEALTH_DATA_PROVIDER: z.enum(['mock']).default('mock'),
  TELECONSULT_PROVIDER: z.enum(['mock']).default('mock'),
  FHIR_PROVIDER: z.enum(['mock']).default('mock'),
  ABDM_PROVIDER: z.enum(['mock']).default('mock'),

  NOTIFICATION_MAX_ATTEMPTS: int(3),
  NOTIFICATION_RETRY_BASE_SECONDS: int(30),
  NOTIFICATION_WORKER_INTERVAL_MS: int(15_000),

  DEMO_MODE: bool(!isProd),
  ENABLE_TEST_ROUTES: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const env = parsed.data;

if (env.NODE_ENV === 'production' && env.ENABLE_TEST_ROUTES) {
  throw new Error('ENABLE_TEST_ROUTES must never be enabled in production');
}

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
} as const;

export type AppConfig = typeof config;
