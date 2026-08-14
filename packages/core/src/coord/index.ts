/**
 * Coordinate space.
 *
 * The board is a flat array; `CellIndex` is its address and `Coord` is the
 * human-facing (x, y). Both are just numbers at runtime, which is exactly why
 * they are branded: mixing an index with an x, or a width with a height, is the
 * classic Minesweeper off-by-one and the type system should refuse to compile it.
 */

/** A validated address into the flat cell array: `y * width + x`. */
export type CellIndex = number & { readonly __brand: 'CellIndex' };

/** Board extent in cells. */
export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** A cell position, origin top-left, x rightwards, y downwards. */
export interface Coord {
  readonly x: number;
  readonly y: number;
}

/**
 * The eight neighbour offsets in a stable, canonical order (row-major:
 * NW, N, NE, W, E, SW, S, SE). The order is part of the contract — chording and
 * cascade replay both depend on a deterministic neighbour sequence.
 */
const NEIGHBOUR_OFFSETS: readonly (readonly [dx: number, dy: number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Total cells on the board. */
export function cellCount(dims: Dimensions): number {
  return dims.width * dims.height;
}

/** Whether a coordinate lies on the board. */
export function contains(dims: Dimensions, coord: Coord): boolean {
  return (
    Number.isInteger(coord.x) &&
    Number.isInteger(coord.y) &&
    coord.x >= 0 &&
    coord.y >= 0 &&
    coord.x < dims.width &&
    coord.y < dims.height
  );
}

/** Whether a raw number is a valid index into this board. */
export function isCellIndex(dims: Dimensions, index: number): index is CellIndex {
  return Number.isInteger(index) && index >= 0 && index < cellCount(dims);
}

/**
 * Convert a coordinate to its flat index.
 *
 * @throws RangeError if the coordinate is off-board. Callers holding a
 * `CellIndex` never have to re-check bounds, which is the point of the brand.
 */
export function toIndex(dims: Dimensions, coord: Coord): CellIndex {
  if (!contains(dims, coord)) {
    throw new RangeError(
      `Coord (${coord.x}, ${coord.y}) is outside a ${dims.width}x${dims.height} board`,
    );
  }
  return (coord.y * dims.width + coord.x) as CellIndex;
}

/** Convert a flat index back to its coordinate. */
export function toCoord(dims: Dimensions, index: CellIndex): Coord {
  return { x: index % dims.width, y: Math.floor(index / dims.width) };
}

/**
 * The neighbours of a cell, in canonical order, clipped to the board.
 *
 * Interior cells have 8, edges 5, corners 3 — the clipping is the whole reason
 * neighbour lists are precomputed per config rather than derived from a fixed
 * offset table at reveal time.
 */
export function neighbours(dims: Dimensions, index: CellIndex): readonly CellIndex[] {
  const { x, y } = toCoord(dims, index);
  const result: CellIndex[] = [];
  for (const [dx, dy] of NEIGHBOUR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < dims.width && ny < dims.height) {
      result.push((ny * dims.width + nx) as CellIndex);
    }
  }
  return result;
}

/**
 * Precompute every cell's neighbour list once per board configuration.
 *
 * Indexed by `CellIndex`; the inner arrays are shared and must not be mutated.
 */
export function neighbourTable(dims: Dimensions): readonly (readonly CellIndex[])[] {
  const total = cellCount(dims);
  const table: (readonly CellIndex[])[] = new Array<readonly CellIndex[]>(total);
  for (let i = 0; i < total; i += 1) {
    table[i] = neighbours(dims, i as CellIndex);
  }
  return table;
}
