# @eoin/minesweeper-core

The pure Minesweeper engine behind [minesweeper.eoin.ai](https://minesweeper.eoin.ai).
Immutable, dependency-free, ESM-only, and deliberately platform-free: no DOM, no
clock, no `Math.random`.

> **Pre-release (M0).** Only the coordinate module is published so far. The
> board, reducer, solver, no-guess generator and replay codec land over M1–M3;
> see `SPEC.md` in the repository.

## Install

```bash
pnpm add @eoin/minesweeper-core
```

## Today

```ts
import { neighbourTable, toIndex, type Dimensions } from '@eoin/minesweeper-core';

const dims: Dimensions = { width: 30, height: 16 };
const table = neighbourTable(dims); // one canonical-order neighbour list per cell
const corner = table[toIndex(dims, { x: 0, y: 0 })]; // 3 neighbours
```

`CellIndex` is a branded number: you get one from `toIndex` (which throws on an
off-board coordinate) and can then index the board without re-checking bounds.

## Design contract

- `(seed, config)` determines a board; `(seed, config, moves)` determines a game.
- `reduce(state, cmd)` returns new state and never mutates its input.
- Boards default to **no-guess**: solvable by forced deduction alone, verified by
  a bounded solver at generation time.

MIT © Eoin O'Brien
