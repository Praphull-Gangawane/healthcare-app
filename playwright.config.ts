import fs from 'node:fs';
import os from 'node:os';
import { chromium, defineConfig, devices, type LaunchOptions } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * Projects
 *   api              — HTTP-level tests (tests/api/**) using the `request` fixture. No browser.
 *   desktop-chromium — UI specs (tests/specs/**) at a desktop viewport.
 *   mobile-chromium  — UI specs on a Pixel 7 profile.
 *   tablet           — UI specs at an iPad-like viewport (Chromium engine).
 *
 * Servers (started automatically, reused locally when already running):
 *   API    http://localhost:4100 against the ISOLATED database `careflow_test` (migrated + reseeded
 *          on every start). Never the dev DB / port 4000.
 *   Client http://localhost:5174 (Vite dev server proxying /api → the test API). Started only when a
 *          UI project is selected (or PW_START_CLIENT=1).
 *
 * Environment overrides
 *   API_BASE_URL       default http://localhost:4100
 *   E2E_BASE_URL       default http://localhost:5174 (the client test server; 5173 is the dev server)
 *   TEST_DATABASE_URL  default postgresql://careflow:careflow_dev@localhost:5432/careflow_test
 *   PW_WORKERS         worker count (default: CPU count capped at 4 locally, 2 in CI)
 *   PW_CHROMIUM_PATH   explicit Chromium executable. If unset (and not CI) and the Chromium build
 *                      expected by this @playwright/test version is not installed, falls back to
 *                      /opt/pw-browsers/chromium when that file exists (pre-provisioned sandboxes).
 */

const CI = !!process.env.CI;
const API_PORT = Number(process.env.API_PORT ?? 4100);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5174);
const API_BASE_URL = process.env.API_BASE_URL ?? `http://localhost:${API_PORT}`;
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${CLIENT_PORT}`;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://careflow:careflow_dev@localhost:5432/careflow_test';

// Expose to test code (worker processes inherit the env of the runner).
process.env.API_BASE_URL = API_BASE_URL;
process.env.E2E_BASE_URL = E2E_BASE_URL;
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

function chromiumLaunchOptions(): LaunchOptions {
  const explicit = process.env.PW_CHROMIUM_PATH;
  if (explicit) return { executablePath: explicit };
  if (CI) return {};
  let expected: string;
  try {
    expected = chromium.executablePath();
  } catch {
    expected = '';
  }
  const fallback = '/opt/pw-browsers/chromium';
  if ((!expected || !fs.existsSync(expected)) && fs.existsSync(fallback)) return { executablePath: fallback };
  return {};
}

/** Which projects did the CLI ask for? (`--project=api`, `--project api`) */
function requestedProjects(): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a.startsWith('--project=')) out.push(a.slice('--project='.length));
    else if (a === '--project' && argv[i + 1]) out.push(argv[i + 1] as string);
  }
  return out;
}
const projectsRequested = requestedProjects();
const needsClient = process.env.PW_START_CLIENT === '1' || projectsRequested.length === 0 || projectsRequested.some((p) => p !== 'api');

const launchOptions = chromiumLaunchOptions();

const apiServerEnv: Record<string, string> = {
  DATABASE_URL: TEST_DATABASE_URL,
  PORT: String(API_PORT),
  NODE_ENV: 'test',
  ENABLE_TEST_ROUTES: 'true',
  DEMO_MODE: 'true',
  LOG_LEVEL: process.env.API_LOG_LEVEL ?? 'warn',
  // Login limiter keys on ip+email, so every account has its own budget; tests reuse cached tokens
  // per worker and the rate-limit spec uses a fresh email.
  LOGIN_RATE_LIMIT_MAX: '100',
  LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  // All test traffic comes from one IP; the general API limiter is not what is under test.
  API_RATE_LIMIT_MAX: '1000000',
  LOCKOUT_THRESHOLD: '5',
  APP_BASE_URL: `http://localhost:${CLIENT_PORT}`,
  CORS_ORIGINS: `http://localhost:${CLIENT_PORT}`,
  COOKIE_SECURE: 'false',
  STORAGE_PROVIDER: 'local',
  STORAGE_LOCAL_DIR: './var/storage-test',
  UPLOAD_MAX_BYTES: String(2 * 1024 * 1024),
  NOTIFICATION_WORKER_INTERVAL_MS: '0',
  NOTIFICATION_MAX_ATTEMPTS: '3',
  SEED_DEMO_PASSWORD: process.env.E2E_PASSWORD ?? 'Demo@12345',
};

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Default: one worker per CPU (max 4) — the API, Vite and browsers share the same machine.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : CI ? 2 : Math.max(1, Math.min(4, os.cpus().length)),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      testMatch: '**/*.spec.ts',
      use: { baseURL: API_BASE_URL, trace: 'retain-on-failure', screenshot: 'off', video: 'off' },
    },
    {
      name: 'desktop-chromium',
      testDir: './tests/specs',
      use: { ...devices['Desktop Chrome'], baseURL: E2E_BASE_URL, viewport: { width: 1440, height: 900 }, launchOptions },
    },
    {
      name: 'mobile-chromium',
      testDir: './tests/specs',
      use: { ...devices['Pixel 7'], baseURL: E2E_BASE_URL, launchOptions },
    },
    {
      name: 'tablet',
      testDir: './tests/specs',
      // iPad-class viewport rendered with Chromium (WebKit is not provisioned in this environment).
      use: { ...devices['iPad Pro 11'], defaultBrowserType: 'chromium', baseURL: E2E_BASE_URL, launchOptions },
    },
  ],
  webServer: [
    {
      name: 'api',
      command:
        'node tests/scripts/ensure-test-db.mjs && node server/scripts/offline-migrate.mjs deploy && cd server && npx tsx prisma/seed.ts && npx tsx src/index.ts',
      url: `${API_BASE_URL}/api/health/ready`,
      env: apiServerEnv,
      reuseExistingServer: !CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    ...(needsClient
      ? [
          {
            name: 'client',
            command: `npm run dev -w client -- --port ${CLIENT_PORT} --strictPort`,
            url: E2E_BASE_URL,
            env: { VITE_API_PROXY_TARGET: API_BASE_URL },
            reuseExistingServer: !CI,
            timeout: 120_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
  ],
});
