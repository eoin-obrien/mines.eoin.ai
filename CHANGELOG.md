# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); milestones (M0–M7) are
defined in `SPEC.md`.

## [Unreleased]

### Added — M0, repo scaffold

- pnpm workspace with `packages/core` (`@eoin/minesweeper-core`) and `apps/site`.
- Strict TypeScript 7 configuration (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ESM/nodenext).
- Biome for lint + format; Vitest + fast-check with env-tunable property runs;
  Stryker mutation testing; size-limit bundle budget (core ≤ 10 kB gzipped).
- `src/coord`: branded `CellIndex`/`Coord`, index↔coord conversion, neighbour
  math and precomputed neighbour tables, with property tests including
  neighbour symmetry (catalogue #15) against a naive oracle.
- CI workflow (lint, typecheck, test, build, size on Node 20/22/24) and a
  nightly workflow (Stryker + 1000-run property tests).
- `SPEC.md` (design reference, split out of `CLAUDE.md`), rewritten `CLAUDE.md`
  working rules, `AGENTS.md` mirror, README, placeholder site for Cloudflare
  Pages.

### Known gaps

- Stryker's `typescript` checker is disabled: Stryker 9.6 uses TypeScript's
  legacy JS API, removed in TypeScript 7. Re-enable when upstream supports it.
- Lighthouse CI is deferred to M4, when there is a UI worth measuring.
