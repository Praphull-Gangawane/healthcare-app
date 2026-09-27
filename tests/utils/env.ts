/** Runtime configuration for the test suite (all overridable through environment variables). */
export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4100';
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5174';
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://careflow:careflow_dev@localhost:5432/careflow_test';
/** Password of every seeded demo account (matches SEED_DEMO_PASSWORD used when seeding). */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Demo@12345';
export const TZ = 'Asia/Kolkata';
