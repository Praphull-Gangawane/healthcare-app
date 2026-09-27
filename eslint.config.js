// ESLint flat config for the npm workspaces (server, client, tests).
// Type-aware linting is intentionally not enabled (fast, no tsconfig project wiring needed).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    'server/src/generated/**',
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
    'var/**',
    'server/var/**',
    'demo/*.html',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  // Baseline for every JS/TS file.
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },

  // React client: browser globals + hooks rules.
  {
    files: ['client/**/*.{ts,tsx,js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: { ...reactHooks.configs['recommended-latest'].rules },
  },

  // CLI scripts, seed, tests and tool configs may write to the console.
  {
    files: ['server/scripts/**', 'server/prisma/**', 'tests/**', '**/*.config.{js,mjs,cjs,ts}', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
