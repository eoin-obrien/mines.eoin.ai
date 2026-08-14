import fc from 'fast-check';

/**
 * Property-test intensity, one knob for the whole workspace.
 *
 * 100 runs on every push; the nightly job sets `MINES_PROP_RUNS=1000` for the
 * expensive invariants (notably #12, no-guess solvability). `verbose` makes
 * fast-check print the shrunk counterexample *and* its seed, so a CI failure is
 * reproducible with `MINES_PROP_SEED=<seed> pnpm test`.
 */
const runs = Number.parseInt(process.env['MINES_PROP_RUNS'] ?? '', 10);
const seed = Number.parseInt(process.env['MINES_PROP_SEED'] ?? '', 10);

fc.configureGlobal({
  numRuns: Number.isNaN(runs) ? 100 : runs,
  verbose: fc.VerbosityLevel.Verbose,
  ...(Number.isNaN(seed) ? {} : { seed }),
});
