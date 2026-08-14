import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type CellIndex,
  cellCount,
  contains,
  type Dimensions,
  isCellIndex,
  neighbours,
  neighbourTable,
  toCoord,
  toIndex,
} from './index.js';

/** Boards from degenerate (1x1) up to a little past Expert. */
const dimensions: fc.Arbitrary<Dimensions> = fc.record({
  width: fc.integer({ min: 1, max: 40 }),
  height: fc.integer({ min: 1, max: 40 }),
});

/** A board paired with a guaranteed-valid index into it. */
const boardAndIndex: fc.Arbitrary<{ dims: Dimensions; index: CellIndex }> = dimensions.chain(
  (dims) =>
    fc
      .integer({ min: 0, max: cellCount(dims) - 1 })
      .map((index) => ({ dims, index: index as CellIndex })),
);

/**
 * Naive oracle: an O(n) scan of the whole board asking "is this cell adjacent?".
 * Obviously correct, obviously slow — the shape every reference model in this
 * repo takes.
 */
function naiveNeighbours(dims: Dimensions, index: CellIndex): CellIndex[] {
  const { x, y } = toCoord(dims, index);
  const found: CellIndex[] = [];
  for (let cy = 0; cy < dims.height; cy += 1) {
    for (let cx = 0; cx < dims.width; cx += 1) {
      const isSelf = cx === x && cy === y;
      const adjacent = Math.abs(cx - x) <= 1 && Math.abs(cy - y) <= 1;
      if (adjacent && !isSelf) found.push(toIndex(dims, { x: cx, y: cy }));
    }
  }
  return found;
}

describe('index <-> coord', () => {
  it('round-trips every index', () => {
    fc.assert(
      fc.property(boardAndIndex, ({ dims, index }) => {
        expect(toIndex(dims, toCoord(dims, index))).toBe(index);
      }),
    );
  });

  it('round-trips every on-board coord', () => {
    fc.assert(
      fc.property(
        dimensions.chain((dims) =>
          fc.record({
            dims: fc.constant(dims),
            coord: fc.record({
              x: fc.integer({ min: 0, max: dims.width - 1 }),
              y: fc.integer({ min: 0, max: dims.height - 1 }),
            }),
          }),
        ),
        ({ dims, coord }) => {
          expect(toCoord(dims, toIndex(dims, coord))).toEqual(coord);
        },
      ),
    );
  });

  it('is a bijection onto [0, width*height)', () => {
    fc.assert(
      fc.property(dimensions, (dims) => {
        const seen = new Set<number>();
        for (let y = 0; y < dims.height; y += 1) {
          for (let x = 0; x < dims.width; x += 1) seen.add(toIndex(dims, { x, y }));
        }
        expect(seen.size).toBe(cellCount(dims));
        expect(Math.max(...seen)).toBe(cellCount(dims) - 1);
      }),
    );
  });

  it('rejects off-board coords', () => {
    const dims: Dimensions = { width: 3, height: 2 };
    expect(() => toIndex(dims, { x: 3, y: 0 })).toThrow(RangeError);
    expect(() => toIndex(dims, { x: 0, y: 2 })).toThrow(RangeError);
    expect(() => toIndex(dims, { x: -1, y: 0 })).toThrow(RangeError);
    expect(() => toIndex(dims, { x: 0.5, y: 0 })).toThrow(RangeError);
    expect(contains(dims, { x: 2, y: 1 })).toBe(true);
    expect(isCellIndex(dims, 6)).toBe(false);
    expect(isCellIndex(dims, 5)).toBe(true);
    expect(isCellIndex(dims, -1)).toBe(false);
    expect(isCellIndex(dims, 1.5)).toBe(false);
  });
});

describe('neighbours', () => {
  it('agrees with the naive oracle, order included', () => {
    fc.assert(
      fc.property(boardAndIndex, ({ dims, index }) => {
        expect(neighbours(dims, index)).toEqual(naiveNeighbours(dims, index));
      }),
    );
  });

  // Property 15: neighbour symmetry.
  it('is symmetric: a is a neighbour of b iff b is a neighbour of a', () => {
    fc.assert(
      fc.property(dimensions, (dims) => {
        const table = neighbourTable(dims);
        // One assertion, not width*height*8 of them: `expect` is the slow part.
        const asymmetric: [CellIndex, CellIndex][] = [];
        for (let i = 0; i < table.length; i += 1) {
          for (const n of table[i] ?? []) {
            if (!(table[n] ?? []).includes(i as CellIndex)) asymmetric.push([i as CellIndex, n]);
          }
        }
        expect(asymmetric).toEqual([]);
      }),
      { numRuns: 25 },
    );
  });

  it('never includes the cell itself and stays on the board', () => {
    fc.assert(
      fc.property(boardAndIndex, ({ dims, index }) => {
        const list = neighbours(dims, index);
        expect(list).not.toContain(index);
        expect(new Set(list).size).toBe(list.length);
        for (const n of list) expect(isCellIndex(dims, n)).toBe(true);
      }),
    );
  });

  it('has 3 at a corner, 5 on an edge, 8 in the interior', () => {
    const dims: Dimensions = { width: 5, height: 4 };
    expect(neighbours(dims, toIndex(dims, { x: 0, y: 0 })).length).toBe(3);
    expect(neighbours(dims, toIndex(dims, { x: 4, y: 3 })).length).toBe(3);
    expect(neighbours(dims, toIndex(dims, { x: 2, y: 0 })).length).toBe(5);
    expect(neighbours(dims, toIndex(dims, { x: 0, y: 2 })).length).toBe(5);
    expect(neighbours(dims, toIndex(dims, { x: 2, y: 2 })).length).toBe(8);
  });

  it('precomputes one list per cell', () => {
    const dims: Dimensions = { width: 6, height: 3 };
    const table = neighbourTable(dims);
    expect(table.length).toBe(cellCount(dims));
    for (let i = 0; i < table.length; i += 1) {
      expect(table[i]).toEqual(neighbours(dims, i as CellIndex));
    }
  });
});
