# Minesweeper at minesweeper.eoin.ai — Design Reference & Build Plan

> The source of truth for what is being built and why. Working rules for
> contributors and agents — invariants, module boundaries, commands — live in
> `CLAUDE.md` (mirrored as `AGENTS.md`). Progress against the milestones at the
> end of this document is tracked in `CHANGELOG.md`.

## TL;DR
- Build the engine in **pure TypeScript**, published to npm+JSR as an ESM-only package; do NOT use Rust/WASM (the WASM glue and cold-start cost buy nothing for 30x16 boards).
- Make **no-guess generation the default** for Beginner/Intermediate/Expert via seeded generate-and-test with a perturbation solver (Simon Tatham's proven approach), with a "Classic (guessing allowed)" toggle for purists.
- Ship a tiny monorepo (pnpm workspaces) with engine/solver/generator as one pure package, a DOM+CSS-grid renderer, code-synthesised Web Audio SFX, fast-check property tests, and Stryker mutation testing; host on Cloudflare Pages.

## Recommendation 1: Engine language — pure TypeScript

**Verdict: Pure TypeScript, published as an ESM npm package (mirrored to JSR). Reject Rust/WASM and the hybrid.**

Reasoning first. Minesweeper's compute is trivial at every real board size. Expert is 30x16 = 480 cells. Even the expensive part - the no-guess solver's global mine-count deduction - is bounded and runs in milliseconds in JS. There is no performance problem for WASM to solve. Against that non-benefit you pay real costs:

- **Bundle and cold-start.** A wasm-bindgen module ships a `.wasm` binary plus generated JS glue. The rustwasm docs are explicit that the raw compiler output "is by design larger than it needs to be" and must be run through wasm-bindgen + wasm-opt to strip it. Even a trivial Rust+wasm example lands around 30 KB uncompressed before you write any game logic. A hand-written TS engine for Minesweeper is a few KB min+gzip and has zero instantiation step. For a tiny static site, the WASM fetch+compile+instantiate on the critical path is pure downside.
- **Testing ergonomics.** The whole point of this project is property-based testing with fast-check and mutation testing with Stryker. Both are first-class in TS and awkward-to-impossible across the WASM boundary. Keeping the logic in TS means every invariant is directly testable with shrinking counterexamples.
- **Packaging/DX.** A pure TS package has a clean `exports` map, tree-shakes, ships `.d.ts` natively, and publishes to both npm and JSR without a wasm-pack build step or a binary artifact in the tarball.
- **Showcase value.** For a software-engineering academic, the impressive artifact is a beautifully typed, exhaustively property-tested, immutable core - not a Rust FFI shim. The elegance is legible to other engineers reading the repo.

**Trade-off accepted:** you forgo the "look, Rust/WASM" credential and any theoretical headroom for enormous custom boards (say 500x500 with a heavy CSP solver). If you ever want that flourish, the clean seam is the solver only: keep the `Solver` interface pure and, as a *later* optional package, provide a `@minesweeper/solver-wasm` that implements the same interface. Do not build it now. This is the hybrid done right - interface-first, WASM only if a benchmark ever justifies it, which for 30x16 it never will.

## Recommendation 2: No-guess generation — default on, per-difficulty, with a Classic toggle

**Verdict: No-guess ("logic-solvable, no flags needed") is the default for all three standard difficulties. Expose a "Classic (guessing allowed)" switch. For custom/huge boards, make no-guess opt-in because generation cost grows.**

Reasoning first. The single worst experience in Minesweeper is losing an otherwise-perfect game to a forced 50/50 guess. Modern well-regarded implementations (Simon Tatham's Mines, minesweeper.online's no-guess mode) treat guess-free boards as the standard of fairness. Most randomly generated Expert boards require at least one guess, so "just place mines randomly" is not good enough for a showcase.

How it's actually done, and what to build:

- **Generate-and-test with a real solver.** Place mines with seeded RNG (first-click-safe), run a deterministic solver that only makes *forced* deductions, accept the board iff the solver finishes with zero guesses, else reseed and retry.
- **Simon Tatham's refinement (adopt this).** Rather than throwing away every failed board, when the solver stalls, *perturb* mines in the still-covered region to create a fresh forced deduction at the frontier, then continue; solver and perturber take turns (his own words: "the solver and perturber taking turns on the grid"). Because perturbation isn't guaranteed safe, re-run the solver from scratch on the finished grid to confirm it's genuinely soluble; track whether each run needs *fewer* perturbations than the last - if it needs *more*, you're in a local optimum, so regenerate from scratch. Per Simon Tatham himself (Hachyderm, June 2026, on the 20th birthday of "Mines"): "This makes it possible to generate grids with a much higher density of mines than standard randomised Minesweeper, such as the example shown here with 99 mines in only a 16×16 grid... The ability to turn up the density by more than a factor of 2 was a very pleasant surprise." That is far past what pure rejection sampling can reach.
- **Solver strength = board quality.** The solver needs three tiers, mirroring Tatham's `minesolve`: (1) **single-point** logic (a set with mine-count 0 -> all clear; mine-count == cardinality -> all mines); (2) the **set/subset "1-2" adjacency rule** (overlap two constraint sets, and if one has more mines than the other by exactly its wing's cardinality, that wing is all mines and the other wing all clear; plus subset division); (3) a **bounded global mine-count deduction** as last resort. Tatham's code artificially caps the exponential global step at 10 sets ("Actually enumerating all 2^n possibilities will get a bit slow for large n, so I artificially cap this recursion at n=10"). Match this.
- **First-click contract.** Defer mine layout until the first click; force the clicked cell and its 8 neighbours mine-free (Tatham lists only candidate cells where `abs(i-y) > 1 || abs(j-x) > 1`) so the first click always opens a region, not a bare number. Solubility depends critically on the starting square, which is *why* layout must wait for the click.

**Determinism reconciliation.** A daily/shareable board must be reproducible from a seed, but naive rejection sampling breaks the "seed -> board" contract because the number of retries varies. Fix it by making the *entire search* deterministic: derive a master seed, then generate candidate k from `hash(masterSeed, k)` for k = 0,1,2,...; the accepted board is "the first k whose candidate is no-guess solvable." Given identical solver code, every client computes the identical board. The seed contract is `(seed, config)` -> deterministic search -> unique board. First-click safety is baked into generation (the 3x3 safe zone is part of the seeded layout), so it never conflicts with the seed. (Note Tatham's own UI subtlety: he encodes the first-click point in the game ID because opening the area, pressing Undo, then clicking a *different* square is not guaranteed soluble.)

**NP-completeness, practically.** Kaye (2000, *Mathematical Intelligencer* 22(2):9-15) proved the Minesweeper *consistency* problem NP-complete by reduction from circuit-SAT; Scott, Stege & van Rooij (2011) frame inference as co-NP-complete. Practically this means: (a) a perfect general solver is exponential in the worst case, so you deliberately use a *bounded* solver and accept only boards it can finish - the hardness works *for* you as a difficulty filter; (b) cap the global-deduction step (n=10 like Tatham) and cap total retries with a time budget; (c) never try to prove a board unsolvable, only that your bounded solver *can* solve it. Dempsey & Guinn (2020) show a complexity phase transition above ~20% mine density, which is exactly Expert (99/480 = 20.6%) - so keep a generation timeout and a fallback.

## Engine architecture

The engine is one pure, immutable, dependency-free package. No third-party game logic. Overengineered on purpose, for beauty.

### Module boundaries (one package, clear internal seams)

```
@eoin/minesweeper-core
  /rng        seeded PRNG (sfc32) + hashing
  /coord      branded coordinate/index types, neighbour math
  /board      immutable board representation, typed arrays
  /game       state machine + reducer (Ready->Playing->Won/Lost)
  /solver     tiered deterministic solver (Solver interface)
  /generator  seeded no-guess generate-test-perturb
  /replay     move log codec, deterministic replay/verify
  index.ts    curated public API
```

Renderer and audio are *separate* packages (`@eoin/minesweeper-dom`, `@eoin/minesweeper-audio`) so the core never imports a DOM type.

### Core types (discriminated unions, branded nominal types, exhaustiveness)

```ts
// Branded nominal types stop you mixing indices and coordinates.
type CellIndex = number & { readonly __brand: 'CellIndex' };
type Seed = string & { readonly __brand: 'Seed' };

interface Config {
  readonly width: number;
  readonly height: number;
  readonly mines: number;
  readonly mode: 'no-guess' | 'classic';
  readonly seed: Seed;
}

// Cell state as a discriminated union rather than boolean soup.
type Cell =
  | { readonly kind: 'hidden'; readonly flag: 'none' | 'flag' | 'question' }
  | { readonly kind: 'revealed'; readonly adjacent: 0|1|2|3|4|5|6|7|8 }
  | { readonly kind: 'exploded' };

type GameStatus =
  | { readonly tag: 'ready' }
  | { readonly tag: 'playing'; readonly startedAt: number }
  | { readonly tag: 'won';  readonly at: number }
  | { readonly tag: 'lost'; readonly at: number; readonly mine: CellIndex };

interface GameState {
  readonly config: Config;
  readonly status: GameStatus;
  readonly cells: readonly Cell[];         // length = width*height
  readonly mines: ReadonlySet<CellIndex>;  // resolved after first click
  readonly moves: readonly Move[];         // canonical move log
}

// Commands drive the reducer; nothing mutates.
type Command =
  | { readonly type: 'reveal'; readonly at: CellIndex }
  | { readonly type: 'flag';   readonly at: CellIndex }
  | { readonly type: 'chord';  readonly at: CellIndex }
  | { readonly type: 'restart' };

declare function reduce(state: GameState, cmd: Command): GameState;
```

Use a `switch` on the union tag with a `never` exhaustiveness check in the `default` branch so adding a new command or status is a compile error until handled.

### PRNG choice: sfc32

**Verdict: sfc32.** Per bryc's PRNGs.md (github.com/bryc/code): "jsf32 and sfc32 are probably the best options for JavaScript, as they optimize well in JS engines and pass randomness tests well." sfc32's author Chris Doty-Humphrey (creator of the PractRand test suite) describes it as combining "very fast speed, good statistical properties, small size, and... guaranteed minimum cycle length." It uses a 128-bit state and only 32-bit ops (no BigInt). xoshiro128** is comparable speed but has documented weakness in the low bits (fails linear-complexity/binary-rank tests); prefer sfc32. PCG32 and SplitMix64 are excellent but PCG's nicest forms want 64-bit math (BigInt, slower in JS); SplitMix64 is ideal as a *seeder*, not the main stream. Use a string hash (e.g. a small MurmurHash3/xmur3 or FNV) to expand the seed string into sfc32's four 32-bit words. Never `Math.random`: it's unseedable, so it kills determinism, replay, and the daily challenge.

Cross-implementation reproducibility: sfc32 is a handful of shifts/adds, trivially portable to any language, so a future Rust solver or a leaderboard verifier can reproduce identical boards.

### Board representation

- Store `adjacent` counts and a mine bitset in **typed arrays** (`Uint8Array` for counts/state, or a `Uint32Array` bitboard for mines) for cache-friendliness and cheap structural cloning. For 480 cells this is about memory-model elegance more than speed.
- **Precompute neighbours** once per config into a flat offset table; edge/corner cells have fewer neighbours (5 and 3), so store per-cell neighbour lists or guard with bounds checks. Index math: `idx = y*width + x`.
- **Cascade** (revealing a 0-cell) is an iterative BFS/flood-fill using an explicit stack/queue - never recursion, to avoid stack blowout on large custom boards. Reveal a cell; if `adjacent === 0`, push all hidden non-flagged neighbours.
- **Chording**: on a revealed number cell whose flagged-neighbour count equals its number, reveal all non-flagged neighbours (which may trigger cascades or a loss). Define chording as exactly equivalent to the sequence of manual reveals - a property worth testing.

### Event sourcing / replay

The move log `readonly Move[]` (each move = command + timestamp delta) plus `(seed, config)` is a complete, canonical description of a game. `replay(seed, config, moves)` re-runs the reducer and must produce byte-identical final state. This gives you: shareable replays now, and client-side-verifiable leaderboard submissions later (a server could re-run the log against the deterministic engine to confirm a claimed time without trusting the client) - even though there's no backend today. It also makes debugging trivial: any bug report is a seed+log.

### Packaging

- **ESM-only.** 2026 is past the point of needing CJS for a browser-first library; Node 20+ can import ESM from CJS anyway. One format, smaller matrix.
- **`exports` map** with subpath exports per module for tree-shaking; `types` via bundled `.d.ts` with declaration maps.
- **Publish to npm and JSR.** JSR gives first-class TS, provenance, and auto-generated docs; npm gives reach. Publishing both is a nice showcase of modern practice.
- **SemVer**, `sideEffects: false`, `type: "module"`.

## Testing strategy

Test runner: **Vitest** - fast, ESM-native, great fast-check integration, built-in v8 coverage, snapshot support. (`node:test` is viable and dependency-light but Vitest's watch/UI/coverage ergonomics win for a showcase; Jest is heavier and ESM-awkward.)

Coverage: use **v8 coverage** for speed; treat line coverage as a floor (aim high, ~95%+, easy for a pure core) but rely on **mutation score** as the real signal.

### Property catalogue (fast-check)

| # | Property / invariant | Formal statement |
|---|---|---|
| 1 | Reveal purity | `reduce` returns a new object; ∀ s,c: `s` is deep-unchanged after `reduce(s,c)` (no prior-state mutation). |
| 2 | Mine-count invariant | ∀ reachable s: `|s.mines| === config.mines`. |
| 3 | First click safe | ∀ seed,cfg: first reveal r ⇒ `r ∉ mines ∧ cell(r).adjacent === 0`. |
| 4 | Cascade correctness | Revealing propagates through exactly the connected zero-region and its numbered border; no cell beyond the border is revealed. |
| 5 | Cascade only via zeros | ∀ revealed c with adjacent>0: c was clicked or is on the border of a revealed zero; never an interior jump. |
| 6 | Win iff all safe revealed | `status=won ⇔ ∀ non-mine cell: kind=revealed`. |
| 7 | Loss iff mine revealed | `status=lost ⇔ ∃ reveal of c ∈ mines`. |
| 8 | Flags never affect outcome | Flagging/unflagging never changes which cells are mines or the win/loss condition (flags are advisory). |
| 9 | Chording equivalence | `chord(c)` result === applying manual reveals to c's non-flagged neighbours in canonical order. |
| 10 | Replay determinism | ∀ seed,cfg,moves: `replay(...) === replay(...)` and equals the live-played final state. |
| 11 | Seeded generation determinism | ∀ seed,cfg: `generate(seed,cfg) === generate(seed,cfg)` bit-for-bit. |
| 12 | No-guess solvability | ∀ board from no-guess generator: solver solves to completion with 0 guesses. |
| 13 | Adjacent-count correctness | ∀ non-mine c: `c.adjacent === |neighbours(c) ∩ mines|`. |
| 14 | Idempotent reveal | Revealing an already-revealed cell is a no-op. |
| 15 | Neighbour symmetry | `a ∈ neighbours(b) ⇔ b ∈ neighbours(a)`. |

### Model-based / stateful testing

Use `fc.commands` / `fc.modelRun` with a **naive reference model** as oracle: a dead-simple, obviously-correct object-grid implementation (no typed arrays, recursion-based flood fill, O(n²) neighbour scans). Generate random sequences of reveal/flag/chord commands and assert the optimised engine and the reference model agree on observable state after every command. fast-check's command shrinking (`replayPath`) shrinks failing sequences to a minimal reproducer. Per fast-check's docs, the model "should not be a carbon copy of the system but a simplified representation of it" - the naive grid fits exactly.

### Metamorphic testing

- Permuting the order of flag operations that don't trigger reveals must not change the final revealed set.
- Two seeds producing the same mine layout must produce identical play under identical move logs.
- Revealing region R then S = revealing S then R, when neither contains the other's mines.

### Mutation testing (Stryker)

Configure `@stryker-mutator/core` with the Vitest runner and the TypeScript checker. `mutate: ['src/**/*.ts', '!src/**/*.test.ts']`, `coverageAnalysis: 'perTest'`, `incremental: true`. Thresholds `{ high: 90, low: 80, break: 80 }` - a pure algorithmic core with strong property tests should clear a high bar; a break threshold around 80 is realistic and honest (the common community default is `break: 50`, so 80 is a deliberately strong statement). Run Stryker on a schedule (nightly) and on release, not every push, because it's slow. Mutation testing is the proof your property tests have teeth: it kills the "100% coverage but asserts nothing" failure mode.

### Other

- **Snapshot/golden tests** for rendered board -> ASCII/structured serialisation (deterministic given seed).
- **Fuzz the move-log parser** (the base64url replay codec): round-trip property `decode(encode(x)) === x` plus feed random bytes and assert it never throws uncaught (only returns typed errors).
- **numRuns tuning**: fast unit + property runs at `numRuns: 100` on every push; a nightly job runs heavy properties (esp. #12 no-guess) at `numRuns: 1000+`. Always log the failing seed for CI reproducibility.
- **Formal-methods flourish** (fits the crypto/EasyCrypt/Rocq background): exhaustive small-board model checking. For all boards up to, say, 5x5 with k mines, enumerate every layout and every reasonable play and machine-check invariants 2/3/6/7/13 exhaustively. It's a finite state space and makes a beautiful docs section. Optionally sketch the reducer's core invariant in Rocq as a genuine "overengineered for beauty" touch.

## Daily seeded challenge

- **Deterministic daily seed.** `seed = "eoin-mines-" + UTCDate("YYYY-MM-DD") + ":" + difficulty`. Hash to sfc32 words. Every client worldwide computes the same board, no server. The board itself comes from the deterministic no-guess search (Recommendation 2).
- **Timezone/rollover.** Use **UTC** for the canonical daily board (everyone plays the identical puzzle at the same wall-clock moment of rollover) and state "resets at 00:00 UTC" plainly in the UI with a live countdown. Wordle rolls at *local* midnight which fragments the shared puzzle across timezones (players in New York, London and LA are on different puzzles at the same instant); UTC keeps it globally identical, which is the better property for a no-backend shareable challenge. Note the classic client-side caveat: changing device timezone/date can reveal a future board, which is fine to accept for a for-fun daily.
- **Wordle-style share string.** Spoiler-free: difficulty, time, whether a guess was needed, and a small emoji summary. Example: `Mines Daily 2026-08-13 · Expert · 1:42 · no guesses 💣⬛🟩🟩`. Keep the grid abstract (not the actual solution) to avoid spoilers. This mirrors Wordle's proven "humblebrag without spoiler" format (🟩🟨⬛) that drove its virality.
- **Replay/URL encoding.** Encode `(version, seed, config, moves)` as a compact binary buffer (varint deltas for move timestamps, cell indices packed to `ceil(log2(w*h))` bits) then **base64url**. Budget: a full Expert game is a few hundred moves; varint-packed this is well under a typical URL length. Add a short integrity check - a truncated hash (e.g. first 4 bytes of a hash over the payload) - so a corrupted/edited share string is detected on decode. This is craft, not security.
- **Anti-cheat realism.** State it plainly: a pure client-side daily cannot prevent cheating (users can read the board in memory or replay tomorrow's seed). Lightweight, honest measures: client-side replay verification (the share string must decode to a valid, winning move log for that day's seed), and hashing the log so casual tampering shows up. Real anti-cheat needs a server re-running the log - which the deterministic engine already makes possible if you ever add one.
- **Local persistence.** Store streaks/stats in `localStorage` (small, synchronous, sufficient); use IndexedDB only if you later store full replays. Version the schema (`{ v: 1, ... }`) and write forward-only migrations keyed on `v`.

## Frontend, aesthetic & interaction design

### Rendering: DOM + CSS grid

**Verdict: DOM with CSS Grid, one element per cell.** For 30x16 = 480 cells (and even a few thousand for custom boards) the DOM is fast, and you get accessibility, focus, and hit-testing for free. Canvas 2D is only worth it beyond several thousand cells; WebGL is overkill. If you ever support huge boards, switch that one renderer package to Canvas behind the same interface. For pixel-art crispness on any raster assets use `image-rendering: pixelated`, integer scale factors, and handle `devicePixelRatio` (MDN warns non-integer DPR is exactly where `pixelated` gets uneven, so prefer integer scaling; for a Canvas fallback, size the backing store to `logicalSize * devicePixelRatio` and set `ctx.imageSmoothingEnabled = false`).

### 8-bit aesthetic

- Author **your own** sprites/CSS so nothing is imported. Palettes are just lists of hex values and are safe to *reference as inspiration*, but confirm licensing before shipping any downloaded asset. Lospec palettes to draw from: **Sweetie 16** (by GrafxKid), **Endesga 32** (by Endesga), **Apollo** (46 colours, by AdamCYounis). Hardware palettes (NES 54-colour PPU, Game Boy DMG 4-green, PICO-8 16) are fine as colour references. Note: a *palette* (a set of colours) isn't copyrightable the way an *asset* is - so re-typing hex values into your own theme object is clean; downloading someone's sprite sheet is not. Generate sprites yourself in Aseprite or as pure CSS.
- Use limited palettes, tasteful dithering for gradients, and treat CRT/scanline effects as an *optional* toggle (respect `prefers-reduced-motion`); default off for legibility.

### Pixel fonts (all SIL OFL, safe for commercial/redistribution)

- **Departure Mono** (Helena Zhang, OFL) - monospaced, crisp at 11px multiples; ideal for the timer/counter and a lo-fi techy vibe.
- **Press Start 2P** (CodeMan38, OFL, on Google Fonts) - classic arcade look, best at 8/16px multiples; use sparingly for headings (it's wide).
- **Silkscreen** and **Pixelify Sans** (both OFL on Google Fonts) as alternatives. Daniel Linssen's m5x7/m6x11 are free but check his stated terms before shipping. Self-host the OFL fonts and include the licence file.

### Colour theme system

- CSS custom properties as the single source of truth; a theme is **one data object** mapping semantic tokens (`--cell-hidden`, `--cell-revealed`, `--n1`...`--n8`, `--mine`, `--flag`, `--bg`) to palette hex values. Switching palette = swapping the object and setting CSS vars on `:root`.
- Honour `prefers-color-scheme` for a default light/dark, but let the user override.
- Enforce **WCAG contrast** for number-on-cell (aim AA, 4.5:1 for the small digits) and provide a **colour-blind-safe** number palette (the classic MS 1-8 colours are not CB-safe; ship an alternative ramp and never encode meaning in colour alone - the digit itself carries it).

### Interaction design

- Left-click reveal; right-click cycles flag/(optional question)/none; **chording** via both-mouse-buttons and middle-click on a satisfied number.
- **Touch**: tap to reveal, long-press to flag, plus an explicit flag-mode toggle button (thumb-friendly); light **haptics** (`navigator.vibrate`) on flag/explosion where supported.
- **Keyboard-only play**: a roving-tabindex cursor over the grid, arrow keys to move, Enter/Space to reveal, F to flag, C to chord. This doubles as the accessibility story.
- **First-click-always-safe** contract as above; no undo (deliberate - Minesweeper's tension depends on commitment; a "new game from this seed" is the honest alternative). Document the deliberate absence.
- **Cascade animation**: stagger reveals along the flood-fill distance with a short ease-out (~15-25ms per ring), capped so large cascades still feel instant; disable under `prefers-reduced-motion`. Micro-interactions: a tiny scale/press on reveal, a flag plant bounce, a screen-shake on loss (motion-gated).

### Accessibility

- Board as an ARIA **grid** (`role="grid"` > `role="row"` > `role="gridcell"`), each cell with an `aria-label` describing state ("hidden", "flagged", "3 mines adjacent"). Arrow-key navigation must reach the browser (screen readers expect grids to handle arrows directly).
- Mine counter and timer in an `aria-live` region (`role="status"`, polite) so screen readers announce changes without spamming; use `aria-atomic="true"` so the whole status is read on change. Do not make the fast-ticking timer assertive.
- `prefers-reduced-motion` disables cascade/shake. Focus management: keep a visible focus ring; return focus sensibly after New Game.
- Prior art: chrisjshull/minesweeper uses divs+ARIA (it found a plain `<table>` broke inner-cell layout and Safari semantics) and background-colour rather than text-colour for readability - reasonable precedents.

### Sound: code-synthesised Web Audio

- Generate all SFX in code with the **Web Audio API** - `OscillatorNode` (square/triangle/sawtooth) plus a noise buffer for explosions, shaped with `GainNode` ADSR via `setValueAtTime`/`linearRampToValueAtTime`. No sample files, no library, dependency-free and tiny. Square/pulse for reveals and UI blips, triangle for softer tones, filtered noise burst for the mine. (For an authentic chiptune texture, note the base Web Audio API gives you sine/square/triangle/sawtooth out of the box; a true pulse-width wave, as on the NES/Game Boy, needs a custom `PeriodicWave` - a nice small flourish.)
- Respect the **autoplay policy**: create/resume the `AudioContext` on the first user gesture. Provide a mute toggle persisted to localStorage.
- Avoid Tone.js and chiptune libraries given the "no third-party code" preference - the raw API is a few dozen lines and more impressive in a showcase.

### Provocative minimalism

Aim for one bold idea executed cleanly: a single-screen, keyboard-and-touch-native board with a monospaced pixel HUD, a palette switcher that visibly re-skins the whole board, a physical-feeling cascade, and a spoiler-free daily share. Simon Tatham's Mines is the functional gold standard (no-guess, first-click-safe); your differentiation is aesthetic craft, theming, sound, and the visible engineering (a docs page that shows the solver and the property tests running).

## gstack & development process

**What gstack is:** `github.com/garrytan/gstack` is Garry Tan's (YC president) personal **Claude Code** configuration - a collection of 23 opinionated slash-command "skills" that role-play a startup team (CEO, Designer, Eng Manager, Release Manager, Doc Engineer, QA). Per Augment Code (Molisha Shah, June 8 2026) the 23 skills cover "planning, design, engineering review, QA, security, and release into a structured sprint workflow that runs across 10 AI coding agents"; the repo had crossed 108K GitHub stars and 16.1K forks within weeks (at v1.57.6.0, 313 commits, 81 contributors), MIT-licensed, TypeScript/Bun. It runs commands like `/office-hours`, `/autoplan`, `/plan`, `/review`, `/ship`. It is **not** a frontend framework or a build stack - it prescribes an *AI-assisted workflow and process*, not React/Next/Tailwind choices. So there's nothing to "reconcile" with the decoupled-engine requirement: gstack governs *how you drive the agents*, and your architecture decisions stand independently.

**gbrain** (which Eoin explored before) is Tan's related "agent brain" repo; gstack is the workflow layer on top, and a recent gstack release even added a `/sync-gbrain` skill.

**How to apply it here:**
- Keep the **engine specification as the source of truth** - this document, checked into the repo as `SPEC.md`, is exactly the artifact gstack's spec-driven commands want.
- Add **`CLAUDE.md`** (and an `AGENTS.md` mirror for other runtimes) at repo root stating: the invariants from the property catalogue, the "no third-party game logic" rule, the module boundaries, the ESM-only/strict-TS constraints, and "the property tests are the contract."
- Decompose work with the phased plan below as gstack tasks; use its `/review` and QA roles to enforce the mutation-score and bundle-size gates.
- If you don't want the full gstack ceremony, the fallback is plain spec-driven development: `SPEC.md` + `CLAUDE.md` + small, test-first PRs, each closing one milestone. This is the safer default given gstack's fast churn.

## Build, CI & deployment

- **Monorepo:** **pnpm workspaces**, nothing heavier. Three packages (core, dom, audio) plus the site app don't need Turborepo/Nx; pnpm's workspace protocol + a few root scripts is the lightest elegant option. Add Turborepo only if build caching ever hurts.
- **Library build:** **tsdown** (Rolldown-based, the actively-maintained successor to tsup) for the packages; **Vite** for the site app. tsdown gives fast ESM builds, `.d.ts`, and workspace mode, and migration from tsup is near-frictionless. (tsup remains the safe incumbent with ~6M weekly downloads but is less actively maintained in 2026; Evan You has signalled tsdown as the long-term path as Vite moves to Rolldown.)
- **TS config:** `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`+`declarationMap`, `module: nodenext`. `noUncheckedIndexedAccess` is essential for a typed-array board (every `cells[i]` is correctly `Cell | undefined`); `verbatimModuleSyntax` forces `import type`/`export type` for predictable ESM output.
- **Lint/format:** **Biome** - one fast Rust tool for lint+format, minimal config, elegant. (oxlint is faster still but younger; ESLint flat config is fine but heavier. Biome is the sweet spot.)
- **CI (GitHub Actions, self-hosted runners):** matrix on Node LTS; on every push run typecheck + Biome + unit/property tests (`numRuns: 100`) + `size-limit` bundle budget; nightly run Stryker mutation + heavy property runs (`numRuns: 1000+`) + Lighthouse CI. Pin/seed property tests and print the seed on failure for reproducibility. Preview deploys per PR. (Self-hosted runners make the nightly Stryker/Lighthouse jobs cheap to run at length.)
- **Hosting:** **Cloudflare Pages** for `minesweeper.eoin.ai` - unlimited bandwidth on the free tier, global edge, per-PR previews, free auto-SSL. (Vercel's free Hobby tier is non-commercial-only and metered; GitHub Pages prohibits some commercial use and lacks per-PR previews.) Note Cloudflare is steering new projects toward "Workers with Static Assets," which has parity for static/SPA hosting - either is fine here. DNS: add a `CNAME` for `minesweeper` -> the Pages project (or, if eoin.ai already uses Cloudflare nameservers, adding the custom domain in the Pages project wires it automatically), then SSL issues automatically.
- **Performance budget:** target < 50 KB gzipped JS for the whole site (engine is a few KB), first-load LCP well under 1s, CLS ~0. Make it a **PWA** (manifest + service worker) so the daily challenge works offline - a natural fit for a purely client-side game.
- **Docs as showcase:** a crafted README (what/why/screenshot/quick start), a live demo, and a docs page that *explains the solver*, *renders the property catalogue*, and ideally embeds a live "watch the generator reject-and-retry" visualiser and the mutation-score badge. For other engineers, the impressive parts are: immutable typed core, the property+mutation testing rigor, deterministic replay, and the honest no-guess generator writeup.

## Phased implementation plan

- **M0 - Repo scaffold.** pnpm workspaces, strict tsconfig, Biome, Vitest, `SPEC.md`+`CLAUDE.md`, CI skeleton, Cloudflare Pages hooked to a placeholder. *Exit:* CI green on an empty package.
- **M1 - Pure core.** Types, sfc32 RNG, board/neighbour precompute, reducer state machine, cascade BFS, chording. Property tests 1-9,13-15 + the naive reference model. *Exit:* model-based tests pass; mutation score > 80 on core.
- **M2 - Solver + generator.** Tiered solver (single-point, subset, bounded global n=10), classic random generator, then no-guess generate-test-perturb with deterministic seeded search. Property tests 11,12. *Exit:* no-guess Expert boards generate within the time budget and always solve with 0 guesses.
- **M3 - Replay + codec.** Move log, `replay`, base64url binary codec with integrity check, fuzz tests. Property 10. *Exit:* round-trip + replay-determinism properties pass.
- **M4 - DOM renderer.** CSS-grid board, theme system + palette switcher, reveal/flag/chord, cascade animation, keyboard cursor, mobile long-press/flag-mode. *Exit:* Lighthouse a11y > 95; full keyboard play.
- **M5 - Audio + polish.** Web Audio SFX, mute, haptics, reduced-motion, CRT toggle. *Exit:* no-dependency audio verified; bundle within budget.
- **M6 - Daily challenge.** UTC seed, countdown, share string, localStorage stats/streaks with versioned schema. *Exit:* two clients compute identical daily board; share strings verify.
- **M7 - Showcase.** README, docs site (solver explainer, property catalogue, generator visualiser), npm+JSR publish, PWA/offline, mutation+Lighthouse CI badges. *Exit:* published; site live at minesweeper.eoin.ai.

## Key references and prior art

- **No-guess generation:** Simon Tatham, "Writing a soluble-grid generator for Mines" (chiark.greenend.org.uk/~sgtatham/quasiblog/mines-solver/); `mines.c` source (github.com/ghewgill/puzzles/blob/master/mines.c); his Hachyderm posts (hachyderm.io/@simontatham) on the 99-in-16x16 result and game-ID first-click encoding. minesweeperblast.com's generation writeup (rejection sampling, constructive, solver-guided; ~5-15% Expert solvable estimate).
- **Solvers:** David Becerra, "Algorithmic Approaches to Playing Minesweeper" (Harvard, 2015) - NSP/DSSP/CSP; Sean Barrett, "Minesweeper: Advanced Tactics" (nothings.org/games/minesweeper/) - global probability; Robert Massaioli, "Solving Minesweeper with Matrices" (Gaussian elimination over the frontier); davidz-repo/Minesweeper-AI-Solver.
- **Complexity:** Kaye (2000) "Minesweeper is NP-complete," *Math. Intelligencer* 22(2):9-15; Scott, Stege & van Rooij (2011) "Minesweeper May Not Be NP-Complete but Is Hard Nonetheless"; Dempsey & Guinn (2020) phase-transition; Louf (2025) arXiv:2506.01634.
- **PRNG:** bryc's PRNGs.md (github.com/bryc/code); prng.di.unimi.it (Vigna/Blackman xoshiro); ts-seedrandom, rand-seed (JS implementations).
- **Testing:** fast-check.dev (property + model-based `fc.commands`); stryker-mutator.io (mutation config, thresholds); Vitest.
- **Frontend:** MDN "Crisp pixel art look with image-rendering"; Lospec palettes (Sweetie 16, Endesga 32, Apollo); fonts Departure Mono, Press Start 2P, Silkscreen, Pixelify Sans (all SIL OFL); MDN ARIA live-region and grid-role docs; chrisjshull/minesweeper (accessible reference).
- **Process/build:** github.com/garrytan/gstack (+ Augment Code review); tsdown.dev; Total TypeScript tsconfig cheat sheet; Cloudflare Pages.

## Caveats

- The "% of random Expert boards solvable without guessing" figure is not cleanly established in peer-reviewed literature; commercial sources cite roughly 5-15% but treat as indicative. The academic phase-transition results (Dempsey & Guinn 2020; Louf 2025) support that Expert density sits near the hard region, which is why the perturbation generator matters.
- Win-rate numbers for probability solvers must not be confused with no-guess *solvability*. For calibration, reported Expert (30x16, 99 mines) *win rates with guessing* include 38.6±0.3% (gamescomputersplay/minesweeper-solver), 38.7% (Buffet et al. 2013, "OH" solver), and 41% classic / 54.3% modern-open-start (DavidNHill's JSMinesweeper).
- gstack is evolving fast (version and skill count changed repeatedly through 2026 - 23 skills at 108K+ stars as of June 2026); verify the current skill set at the repo before wiring it into CI.
- Non-integer `devicePixelRatio` can make `image-rendering: pixelated` uneven; prefer integer scaling and test on real devices.
- Font/palette licences: OFL fonts named here are safe to self-host with the licence file; always re-verify before shipping, and never import third-party *assets* (sprite sheets) given the no-third-party-code preference.
- Simon Tatham's Mines has a known subtlety: opening the safe area, undoing, then clicking a *different* first square is not guaranteed soluble - a reason your engine bakes the first-click point into the seed and offers no undo.

