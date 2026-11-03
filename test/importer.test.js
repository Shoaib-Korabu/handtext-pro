// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { pdfLinesToMarkup, tidyMarkdown, segmentsToText } = require('../js/importer.js');

// Helper: a PDF line. y grows downward; x1 near 540 means "the line reached the right margin".
const L = (y, x0, x1, size, ...runs) => ({ y, x0, x1, size, runs: runs.map((r) => (typeof r === 'string' ? { text: r, bold: false } : r)) });
const B = (text) => ({ text, bold: true });

test('rebuilds headings, bold subheadings, bullets and wrapped lines', () => {
  const pages = [{
    lines: [
      L(70, 54, 430, 20, B('Assignment 3: Security')),
      L(105, 54, 512, 13, B('Question 1: Explain the importance of security and discuss major')),
      L(123, 54, 114, 13, B('challenges.')),
      L(144, 54, 214, 11, B('Importance of security:')),
      L(162, 54, 536, 10.5, '', ' ', B('Data Protection:'), ' ', 'Safeguards personal, medical and industrial data from'),
      L(177, 72, 171, 10.5, 'interception and theft.'),
      L(192, 54, 534, 10.5, '', ' ', B('Integrity:'), ' ', 'Keeps sensor readings and telemetry accurate during storage and'),
      L(207, 72, 150, 10.5, 'transit.'),
    ],
  }];
  assert.equal(pdfLinesToMarkup(pages), [
    '# Assignment 3: Security',
    '',
    '## Question 1: Explain the importance of security and discuss major challenges.',
    '### Importance of security:',
    '- **Data Protection:** Safeguards personal, medical and industrial data from interception and theft.',
    '- **Integrity:** Keeps sensor readings and telemetry accurate during storage and transit.',
  ].join('\n'));
});

test('keeps separate paragraphs apart and joins hyphenated words', () => {
  const pages = [{
    lines: [
      L(100, 54, 540, 11, 'This paragraph is long enough to reach the right margin and the next line contin-'),
      L(115, 54, 300, 11, 'ues it. It ends here.'),
      L(145, 54, 540, 11, 'A second paragraph begins after a gap and also runs right up to the right margin of'),
      L(160, 54, 200, 11, 'the page.'),
    ],
  }];
  assert.equal(pdfLinesToMarkup(pages), [
    'This paragraph is long enough to reach the right margin and the next line continues it. It ends here.',
    '',
    'A second paragraph begins after a gap and also runs right up to the right margin of the page.',
  ].join('\n'));
});

test('drops page numbers and running headers', () => {
  const page = (n) => ({
    lines: [
      L(30, 54, 200, 9, 'Course Notes 2026'),
      L(100, 54, 540, 11, `Body text on page ${n} that is long enough to reach the right-hand margin of the page.`),
      L(115, 54, 200, 11, 'End of body.'),
      L(780, 290, 300, 9, String(n)),
    ],
  });
  const md = pdfLinesToMarkup([page(1), page(2), page(3)]);
  assert.ok(!md.includes('Course Notes 2026'), md);
  assert.ok(!/^\d+$/m.test(md), md);
  assert.equal(md.split('\n').filter((l) => l.startsWith('Body text')).length, 3);
});

test('numbered items start new lines', () => {
  const pages = [{
    lines: [
      L(100, 54, 540, 11, '1. First item text that is long enough to reach the right-hand margin of this page'),
      L(115, 72, 200, 11, 'and wraps.'),
      L(130, 54, 200, 11, '2. Second item.'),
    ],
  }];
  assert.equal(pdfLinesToMarkup(pages), '1. First item text that is long enough to reach the right-hand margin of this page and wraps.\n2. Second item.');
});

test('segmentsToText keeps spaces outside bold markers', () => {
  assert.equal(segmentsToText([{ text: 'Key: ', bold: true }, { text: 'value', bold: false }], true), '**Key:** value');
  assert.equal(segmentsToText([{ text: 'a **b**', bold: false }], true), 'a b');
});

test('tidyMarkdown simplifies Markdown', () => {
  const md = '#### Deep\nSome __bold__, `code` and a [link](http://x).\n![img](a.png)\n| a | b |\n|---|:-:|\n| 1 | 2 |';
  assert.equal(tidyMarkdown(md), '### Deep\nSome **bold**, code and a link.\n\na | b\n1 | 2');
});
