#!/usr/bin/env node
/**
 * Guard + bootstrap for the isolated Playwright database.
 *  - Refuses to continue unless DATABASE_URL points at a database whose name ends in `_test`
 *    (the next steps TRUNCATE and reseed it — this must never hit the dev database).
 *  - Creates the database if it does not exist (the app role needs CREATEDB; otherwise run
 *    `su postgres -c "psql -c 'CREATE DATABASE careflow_test OWNER careflow;'"`).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[ensure-test-db] DATABASE_URL is not set');
  process.exit(1);
}
const parsed = new URL(url);
const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
if (!/_test$/.test(dbName)) {
  console.error(`[ensure-test-db] refusing to reseed "${dbName}": test database names must end with _test`);
  process.exit(1);
}
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
adminUrl.search = '';
const client = new pg.Client({ connectionString: adminUrl.toString() });
try {
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    console.log(`[ensure-test-db] created ${dbName}`);
  }
} catch (err) {
  console.error(`[ensure-test-db] could not verify/create ${dbName}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
