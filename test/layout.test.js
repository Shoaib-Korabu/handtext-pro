// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, layout, linesPerPage } = require('../js/layout.js');

// Fake measurement: each character is half the font size wide (1 mm at the 2 mm test size).
const measure = (text, size) => text.length * size * 0.5;
const base = { measure, fontSizeMm: 2, lineSpacing: 8, wordSpacing: 100, contentWidth: 40, linesPerPage: 5 };

test('parse recognises headings, lists, page breaks and blanks', () => {
  const blocks = parse('# Title\n## Sub\n- a\n* b\n2. c\n\n[pagebreak]\nplain');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'heading', 'list', 'list', 'list', 'blank', 'pagebreak', 'para']);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].marker, '•');
  assert.equal(blocks[4].marker, '2.');
});

test('parse normalises Windows line endings and tabs', () => {
  const blocks = parse('a\r\nb\tc');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].text, 'b    c');
});

test('words wrap to the content width', () => {
  // each char = 1 mm, space >= 0.66 mm, width 40 mm
  const { pages } = layout(parse('aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd'), base);
  const lines = pages[0];
  assert.ok(lines.length >= 2, 'text should wrap');
  for (const line of lines) {
    const used = line.words.reduce((s, w) => s + w.width, 0) + line.spaceWidth * (line.words.length - 1);
    assert.ok(used <= base.contentWidth + 1e-9, `line too wide: ${used}`);
  }
});

test('a word longer than the line is broken', () => {
  const { pages } = layout(parse('x'.repeat(100)), base);
  const total = pages[0].reduce((n, l) => n + l.words.map((w) => w.text).join('').length, 0);
  assert.equal(total, 100);
  assert.ok(pages[0].length >= 3);
});

test('text flows onto new pages', () => {
  const text = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
  const { pages } = layout(parse(text), base);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].length, 5);
  assert.equal(pages[2].length, 2);
});

test('[pagebreak] starts a new page and a trailing break adds no empty page', () => {
  const { pages } = layout(parse('one\n[pagebreak]\ntwo\n[pagebreak]\n'), base);
  assert.equal(pages.length, 2);
  assert.equal(pages[1][0].words[0].text, 'two');
});

test('a heading is not left alone at the bottom of a page', () => {
  const text = 'a\nb\nc\nd\n# Heading\nbody';
  const { pages } = layout(parse(text), base);
  assert.equal(pages[0].length, 4);
  assert.equal(pages[1][0].heading, 1);
});

test('list items get a marker on the first line only and a hanging indent', () => {
  const { pages } = layout(parse('- ' + 'word '.repeat(20)), base);
  const [first, second] = pages[0];
  assert.equal(first.marker, '•');
  assert.equal(second.marker, null);
  assert.ok(first.indent > 0 && first.indent === second.indent);
});

test('page count is capped', () => {
  const text = Array.from({ length: 100 }, () => 'x').join('\n');
  const r = layout(parse(text), { ...base, maxPages: 3 });
  assert.equal(r.pages.length, 3);
  assert.equal(r.truncated, true);
});

test('linesPerPage uses the space between top and bottom margins', () => {
  assert.equal(linesPerPage(297, { top: 25, bottom: 15 }, 8), 32);
  assert.equal(linesPerPage(50, { top: 25, bottom: 25 }, 8), 1);
});
