import pg from 'pg';
import { TEST_DATABASE_URL } from './env.js';

/**
 * Direct connection to the isolated test database — used only to prove DB-level safeguards
 * (append-only triggers, immutable prescription versions). Refuses non-*_test databases.
 */
export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const name = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) throw new Error(`Refusing to connect to non-test database ${name}`);
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Runs a statement expected to be rejected by the database; returns the error message. */
export async function expectDbRejects(sql: string, params: unknown[] = []): Promise<string> {
  return withDb(async (c) => {
    try {
      await c.query(sql, params);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    throw new Error(`Expected the database to reject: ${sql}`);
  });
}
