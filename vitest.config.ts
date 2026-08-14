import { defineConfig } from 'vitest/config';

/**
 * Single root runner for the whole workspace.
 *
 * Property-test intensity is env-driven so the same suite serves both gates:
 * every push runs at 100 runs, the nightly job runs at 1000+ (see
 * `.github/workflows/nightly.yml`). Failing seeds are printed by fast-check
 * itself, which is what makes a CI failure reproducible locally.
 */
export default defineConfig({
  test: {
    include: ['{packages,apps}/*/src/**/*.{test,spec}.ts'],
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    globals: false,
    reporters: process.env['CI'] === undefined ? ['default'] : ['default', 'junit'],
    outputFile: { junit: 'reports/junit.xml' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts'],
      // Only the package barrel is excluded — `src/<module>/index.ts` files are
      // the modules themselves and must be covered.
      exclude: ['**/*.test.ts', '**/*.spec.ts', 'packages/*/src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
