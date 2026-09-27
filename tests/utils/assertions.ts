import { expect } from '@playwright/test';
import type { ApiResponse } from './api.js';

/** Recursively asserts that no stack traces / internal file paths leak in a response body. */
export function assertNoInternals(value: unknown, path = '$'): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    expect(value, `${path} looks like a stack trace`).not.toMatch(/\n\s+at .+:\d+:\d+|node_modules\/|\/src\/.+\.ts:\d+/);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoInternals(v, `${path}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      expect(k, `${path} must not expose "${k}"`).not.toMatch(/^(stack|stackTrace|sql|query)$/i);
      assertNoInternals(v, `${path}.${k}`);
    }
  }
}

/** Asserts a success envelope `{ success: true, data }` with the given status and returns `data`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function expectOk<T = any>(res: ApiResponse, status = 200): T {
  expect(res.status, `${res.method} ${res.url} → ${res.status}: ${res.text.slice(0, 500)}`).toBe(status);
  expect(res.body?.success, 'success flag').toBe(true);
  assertNoInternals(res.body);
  return res.body.data as T;
}

/** Asserts an error envelope `{ success: false, error: { code, message } }` and returns the error. */
export function expectError(res: ApiResponse, status: number, code?: string) {
  expect(res.status, `${res.method} ${res.url} → ${res.status}: ${res.text.slice(0, 500)}`).toBe(status);
  expect(res.body?.success).toBe(false);
  expect(typeof res.body?.error?.code).toBe('string');
  expect(typeof res.body?.error?.message).toBe('string');
  expect(res.body.error.message.length).toBeGreaterThan(0);
  if (code) expect(res.body.error.code).toBe(code);
  assertNoInternals(res.body);
  return res.body.error as { code: string; message: string; details?: unknown; requestId?: string };
}
