/**
 * `@eoin/minesweeper-core` — the pure engine.
 *
 * Nothing here touches the DOM, the clock, or `Math.random`. Every board is a
 * deterministic function of `(seed, config)` and every game a deterministic
 * function of that board plus a move log.
 *
 * Modules land here as the milestones in `SPEC.md` complete:
 *   M1 board/game, M2 solver/generator, M3 replay.
 */

export {
  type CellIndex,
  type Coord,
  cellCount,
  contains,
  type Dimensions,
  isCellIndex,
  neighbours,
  neighbourTable,
  toCoord,
  toIndex,
} from './coord/index.js';

/** Bumped with any change to board generation or replay semantics. */
export const ENGINE_VERSION = 0;
