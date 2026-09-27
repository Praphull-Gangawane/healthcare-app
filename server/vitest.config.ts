import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover pure domain logic only. Modules transitively import config/env.js, which
 * validates DATABASE_URL and AUTH_SECRET at import time, so safe dummy values are provided here.
 * Constructing the Prisma client does not open a connection until a query runs, and unit tests
 * never run queries.
 */
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/unit_tests_never_connect',
      AUTH_SECRET: 'unit-test-secret-unit-test-secret-0123456789',
      APP_NAME: 'CareTest',
      APP_BASE_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      UPLOAD_MAX_BYTES: '1048576',
      STORAGE_PROVIDER: 'mock',
      NOTIFICATION_WORKER_INTERVAL_MS: '0',
    },
  },
});
