// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/printsim.js');
const { placement, describe } = globalThis.HT.PrintSim;

const A4 = { w: 210, h: 297 };

test('actual size keeps 100% and the printer margin cuts the edge', () => {
  const p = placement(A4, A4, { scaling: 'actual', margin: 4.2, padding: 0 });
  assert.equal(p.scale, 1);
  assert.deepEqual(p.page, { x: 0, y: 0, w: 210, h: 297 });
  assert.ok(Math.abs(describe(A4, A4, { scaling: 'actual', margin: 4.2 }).cut - 4.2) < 1e-9);
});

test('fit to printable area shrinks the page inside the margins', () => {
  const p = placement(A4, A4, { scaling: 'fit', margin: 4.2, padding: 0 });
  assert.ok(p.scale < 1 && p.scale > 0.95);
  assert.ok(p.page.x >= 4.2 - 1e-9 && p.page.y >= 4.2 - 1e-9);
  assert.ok(describe(A4, A4, { scaling: 'fit', margin: 4.2 }).cut < 0.01);
});

test('extra white border shrinks a fitted page further', () => {
  const a = placement(A4, A4, { scaling: 'fit', margin: 4.2, padding: 0 });
  const b = placement(A4, A4, { scaling: 'fit', margin: 4.2, padding: 10 });
  assert.ok(b.scale < a.scale);
});

test('custom scale is clamped and centred', () => {
  const p = placement(A4, A4, { scaling: 'custom', scale: 50, margin: 0 });
  assert.equal(p.scale, 0.5);
  assert.equal(p.page.x, 52.5);
  assert.equal(placement(A4, A4, { scaling: 'custom', scale: 9999, margin: 0 }).scale, 4);
});

test('a Letter PDF on A4 paper is reported as a size mismatch', () => {
  const letter = { w: 215.9, h: 279.4 };
  assert.match(describe(letter, A4, { scaling: 'actual', margin: 4.2 }).text, /different sizes/);
});
