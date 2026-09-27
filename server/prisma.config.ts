import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Single .env at the repository root (see .env.example); server/.env may override for local work.
loadEnv({ path: ['.env', '../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
