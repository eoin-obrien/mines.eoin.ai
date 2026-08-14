# CLAUDE.md — working rules for this repo

`SPEC.md` is the source of truth for *what* is being built and *why*. This file is
the short list of rules for *how* to change it. When the two disagree, `SPEC.md`
wins on design and this file wins on process.

## The one-line version

A pure, immutable, dependency-free Minesweeper engine in TypeScript, with no-guess
board generation, deterministic seeds and replay. **The property tests are the
contract.** Mutation score, not line coverage, is the evidence they mean anything.

## Hard rules

1. **No third-party game logic.** No Minesweeper engine, solver, generator, RNG,
   audio or sprite library. Algorithms may be *read* and cited (Tatham's
   perturbation generator, bryc's sfc32); code is written here.
2. **The core is pure.** `packages/core` must not import a DOM type, read the
   clock, or call `Math.random`. Its tsconfig has `lib: es2022` and `types: []`
   so any of those is a compile error. Time and randomness enter as arguments:
   a `Seed` and an explicit timestamp.
3. **Determinism is a contract, not a nicety.** `(seed, config)` fully determines
   a board; `(seed, config, moves)` fully determines a game. Anything that would
   make the same inputs produce different output — retry counts, `Date.now()`,
   iteration order over a `Set` — is a bug even when nothing visibly breaks.
4. **Immutability.** `reduce(state, cmd)` returns new state and never mutates its
   argument. Public types are `readonly` throughout.
5. **Exhaustiveness.** Switch on discriminated-union tags with a `never` check in
   `default`, so a new `Command` or `GameStatus` fails to compile until handled.
6. **ESM only.** No CJS build, no `require`. `verbatimModuleSyntax` is on, so use
   `import type` for type-only imports and `.js` extensions in relative imports.
7. **A bug report is a seed plus a move log.** Before fixing, reproduce with a
   failing property (fast-check prints the seed; `MINES_PROP_SEED=<seed> pnpm test`
   replays it). The regression test lands with the fix.

## Module boundaries

```
packages/core   @eoin/minesweeper-core — pure engine
  src/rng         seeded PRNG (sfc32) + string hashing        [M2]
  src/coord       branded CellIndex/Coord, neighbour math     [done]
  src/board       immutable board, typed arrays               [M1]
  src/game        state machine + reducer                     [M1]
  src/solver      tiered deterministic solver                 [M2]
  src/generator   seeded no-guess generate-test-perturb       [M2]
  src/replay      move-log codec, deterministic replay        [M3]
  src/index.ts    curated public API — the only barrel
apps/site       @eoin/minesweeper-site — the deployed page
```

Renderer (`@eoin/minesweeper-dom`) and audio (`@eoin/minesweeper-audio`) land as
separate packages at M4/M5. Dependencies point one way: site → dom/audio → core.
Nothing depends on the site.

## Invariants (the property catalogue)

The full table lives in `SPEC.md`. Every engine change must leave these true, and
a change that makes one testable should bring its test with it:

purity of `reduce` · mine count constant · first click safe and always a zero ·
cascade covers exactly the connected zero-region and its border · win iff every
non-mine cell is revealed · loss iff a mine is revealed · flags never affect the
outcome · chording ≡ the equivalent manual reveals · replay is bit-identical ·
generation is deterministic per seed · no-guess boards solve with zero guesses ·
adjacency counts match the mine set · reveal is idempotent · neighbours are
symmetric.

## Commands

```bash
pnpm verify         # lint + typecheck + test + build — run this before saying "done"
pnpm test           # vitest, 100 property runs
pnpm test:watch
pnpm test:coverage  # v8 coverage, thresholds enforced at 90%
pnpm test:heavy     # 1000 property runs (what nightly CI does)
pnpm mutate         # Stryker; break threshold 80, target 90+
pnpm size           # bundle budget (core ≤ 10 kB gzipped)
pnpm dev            # vite dev server for apps/site
pnpm format         # biome check --write
```

## Toolchain notes worth knowing before you trip over them

- **TypeScript 7** (the native compiler) is deliberate. It has no legacy JS API,
  which is why `stryker.config.json` keeps tsconfig files out of the Stryker
  sandbox and leaves the `typescript` checker off — re-enable both when Stryker
  supports the TS7 API.
- **`noUncheckedIndexedAccess` is on.** `cells[i]` is `Cell | undefined`. Handle
  it; `!` is banned by the linter for a reason.
- **`noPropertyAccessFromIndexSignature` is on**, so `process.env['CI']`, not
  `process.env.CI`. Biome's `useLiteralKeys` is off to avoid fighting it.
- **Biome** does lint *and* format. `pnpm lint` fails on unformatted code.
- **The core's `exports` map has a `development` condition** pointing at `src`.
  Vite picks it in dev (instant HMR on engine edits) and the built `dist` entry
  in production, so `pnpm build` exercises the real published artifact.

## Milestones

M0 scaffold ✅ · M1 pure core · M2 solver + generator · M3 replay + codec ·
M4 DOM renderer · M5 audio + polish · M6 daily challenge · M7 showcase.
Exit criteria for each are in `SPEC.md`. Work test-first, one milestone per PR.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool.
When in doubt, invoke the skill.

- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
