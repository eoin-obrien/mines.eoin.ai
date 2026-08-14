/**
 * Consumer smoke test for the built core, run on the oldest Node version the
 * package claims to support. It imports `dist` directly — no bundler, no
 * transpile, no test runner — so it fails if the published ESM output uses
 * anything that runtime lacks.
 */
import assert from 'node:assert/strict';
import {
  cellCount,
  ENGINE_VERSION,
  neighbourTable,
  toIndex,
} from '../../packages/core/dist/index.js';

const dims = { width: 30, height: 16 };
const table = neighbourTable(dims);

assert.equal(cellCount(dims), 480);
assert.equal(table.length, 480);
assert.equal(table[toIndex(dims, { x: 0, y: 0 })].length, 3);
assert.equal(table[toIndex(dims, { x: 29, y: 8 })].length, 5);
assert.equal(table[toIndex(dims, { x: 5, y: 5 })].length, 8);
assert.equal(typeof ENGINE_VERSION, 'number');

console.log(`ok — core imports and runs on ${process.version}`);
