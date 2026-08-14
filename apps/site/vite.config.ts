import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    // The whole-site budget from SPEC.md is < 50 kB gzipped JS; warn well before.
    chunkSizeWarningLimit: 150,
  },
  /*
   * The core's `exports` map has a `development` condition pointing at `src`,
   * which Vite selects automatically while serving and swaps for the built
   * `dist` entry in production builds. Dev gets instant HMR on engine edits;
   * `pnpm build` still exercises the published artifact.
   */
});
