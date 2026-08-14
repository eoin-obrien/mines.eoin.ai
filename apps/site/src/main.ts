import { cellCount, type Dimensions, ENGINE_VERSION, neighbourTable } from '@eoin/minesweeper-core';

/**
 * M0 placeholder. Its only job is to prove the wiring end to end: the site
 * imports the workspace core, the core's coordinate math runs in a browser, and
 * Cloudflare Pages has something real to deploy. The playable board arrives with
 * the DOM renderer in M4.
 */

const dims: Dimensions = { width: 9, height: 9 };
const table = neighbourTable(dims);

const grid = document.querySelector<HTMLElement>('#grid');
const meta = document.querySelector<HTMLElement>('#meta');

if (grid) {
  grid.style.setProperty('--cols', String(dims.width));
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < cellCount(dims); i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    // Corners and edges have fewer neighbours — a visible sanity check that the
    // engine's clipping is correct, dressed up as a border.
    if ((table[i]?.length ?? 8) < 8) cell.dataset['revealed'] = '';
    fragment.append(cell);
  }
  grid.append(fragment);
}

if (meta) {
  meta.textContent = `engine v${ENGINE_VERSION} · ${cellCount(dims)} cells`;
}
