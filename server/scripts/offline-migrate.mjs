#!/usr/bin/env node
/**
 * Offline migration helper for restricted networks.
 *
 * The standard workflow is `npm run db:migrate` / `npm run db:deploy` (Prisma CLI). The Prisma CLI
 * downloads a native schema-engine binary on first use; in air-gapped or egress-restricted
 * environments that download can be blocked. This script uses Prisma's WebAssembly schema engine
 * (@prisma/schema-engine-wasm, same engine version as the CLI) through the pg driver adapter instead.
 *
 * Usage:
 *   node scripts/offline-migrate.mjs deploy            # apply pending migrations (like `migrate deploy`)
 *   node scripts/offline-migrate.mjs diff-init <name>  # write an initial migration from an empty DB
 *
 * `deploy` executes each migration.sql as one script over node-postgres and records it in Prisma's
 * own `_prisma_migrations` table (same checksum format), so the Prisma CLI treats them as applied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { SchemaEngine } from '@prisma/schema-engine-wasm';
import { PrismaPg } from '@prisma/adapter-pg';
import { bindMigrationAwareSqlAdapterFactory } from '@prisma/driver-adapter-utils';
import crypto from 'node:crypto';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: [path.join(root, '.env'), path.join(root, '..', '.env')], quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n');
  process.exit(1);
}

const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const filters = { externalTables: [], externalEnums: [] };

function loadMigrationList() {
  const lockPath = path.join(migrationsDir, 'migration_lock.toml');
  const dirs = fs.existsSync(migrationsDir)
    ? fs
        .readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  return {
    baseDir: migrationsDir,
    lockfile: {
      path: 'migration_lock.toml',
      content: fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : null,
    },
    shadowDbInitScript: '',
    migrationDirectories: dirs.map((name) => {
      const file = path.join(migrationsDir, name, 'migration.sql');
      return {
        path: name,
        migrationFile: {
          path: 'migration.sql',
          content: fs.existsSync(file)
            ? { tag: 'ok', value: fs.readFileSync(file, 'utf8') }
            : { tag: 'error', value: 'missing migration.sql' },
        },
      };
    }),
  };
}

const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

async function deploy() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(MIGRATIONS_TABLE_DDL);
    const { rows } = await client.query(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Set(rows.map((r) => r.migration_name));
    const pending = loadMigrationList().migrationDirectories.filter((d) => !applied.has(d.path));
    for (const dir of pending) {
      const sql = dir.migrationFile.content.value;
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)',
          [crypto.randomUUID(), checksum, dir.path],
        );
        await client.query('COMMIT');
        process.stdout.write(`Applied ${dir.path}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    if (pending.length === 0) process.stdout.write('No pending migrations.\n');
  } finally {
    await client.end();
  }
}

async function main() {
  const [command, name] = process.argv.slice(2);
  if (command === 'deploy') {
    await deploy();
    return;
  }
  const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg({ connectionString: url }));
  const engine = await SchemaEngine.new({ datamodels: undefined }, () => undefined, adapter);

  if (command === 'diff-init') {
    const res = await engine.diff({
      from: { tag: 'empty' },
      to: {
        tag: 'schemaDatamodel',
        files: [{ path: schemaPath, content: fs.readFileSync(schemaPath, 'utf8') }],
      },
      script: true,
      exitCode: null,
      filters,
    });
    const dir = path.join(migrationsDir, name ?? '0001_init');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'migration.sql'), res.stdout);
    fs.writeFileSync(
      path.join(migrationsDir, 'migration_lock.toml'),
      '# Please do not edit this file manually\n# It should be added in your version-control system (e.g., Git)\nprovider = "postgresql"\n',
    );
    process.stdout.write(`Wrote ${path.relative(root, dir)}/migration.sql\n`);
    return;
  }

  process.stderr.write('Usage: offline-migrate.mjs deploy | diff-init <name>\n');
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
