/* HandText Pro — text parsing and page layout.
 * Pure functions (no DOM), so they run in the browser and in Node tests.
 *
 * Supported markup (one per line):
 *   # Heading 1        ## Heading 2
 *   - item / * item    bullet list
 *   1. item            numbered list
 *   [pagebreak]        start a new page
 * Everything else is a paragraph; blank lines are kept.
 */
(function (root) {
  'use strict';

  const PAGE_BREAK_RE = /^\s*\[pagebreak\]\s*$/i;
  const HEADING_SCALE = { 1: 1.3, 2: 1.15 };
  const LIST_INDENT_EM = 1.3; // hanging indent for list items, in ems

  function parse(text) {
    const blocks = [];
    const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    for (const raw of src.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (PAGE_BREAK_RE.test(line)) blocks.push({ type: 'pagebreak' });
      else if (!line.trim()) blocks.push({ type: 'blank' });
      else if ((m = line.match(/^\s*(#{1,2})\s+(.*)$/))) blocks.push({ type: 'heading', level: m[1].length, text: m[2] });
      else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) blocks.push({ type: 'list', marker: '•', text: m[1] });
      else if ((m = line.match(/^\s*(\d{1,3}[.)])\s+(.*)$/))) blocks.push({ type: 'list', marker: m[1], text: m[2] });
      else blocks.push({ type: 'para', text: line.trim() });
    }
    return blocks;
  }

  /**
   * Lay blocks out into pages of lines.
   * @param {Array} blocks         output of parse()
   * @param {Object} opt
   *   measure(text, sizeMm) -> width in mm
   *   fontSizeMm, lineSpacing (mm), wordSpacing (%), contentWidth (mm), linesPerPage, maxPages
   * @returns {{pages: Array<Array<Line>>, truncated: boolean}}
   *   Line = { scale, indent, marker, words:[{text,width}], spaceWidth, heading }
   */
  function layout(blocks, opt) {
    const { measure, fontSizeMm, contentWidth, linesPerPage } = opt;
    const maxPages = opt.maxPages || 50;
    const wsFactor = (opt.wordSpacing || 100) / 100;
    const pages = [[]];
    let truncated = false;

    const current = () => pages[pages.length - 1];
    const newPage = () => {
      if (pages.length >= maxPages) { truncated = true; return false; }
      pages.push([]);
      return true;
    };
    const pushLine = (line) => {
      if (truncated) return;
      if (current().length >= linesPerPage && !newPage()) return;
      current().push(line);
    };

    const spaceOf = (size) => {
      // Some handwriting fonts have tiny spaces; never go below ~0.33em.
      const natural = measure(' ', size);
      return Math.max(natural, size * 0.33) * wsFactor;
    };

    function wrap(text, size, width) {
      const space = spaceOf(size);
      const lines = [];
      let words = [];
      let used = 0;
      const flush = () => { lines.push(words); words = []; used = 0; };

      for (const word of text.split(/\s+/).filter(Boolean)) {
        let w = measure(word, size);
        if (w > width) {
          // Hard-break a word wider than the line.
          if (words.length) flush();
          let chunk = '';
          for (const ch of Array.from(word)) {
            if (chunk && measure(chunk + ch, size) > width) {
              lines.push([{ text: chunk, width: measure(chunk, size) }]);
              chunk = ch;
            } else chunk += ch;
          }
          words = [{ text: chunk, width: measure(chunk, size) }];
          used = words[0].width;
          continue;
        }
        const needed = words.length ? used + space + w : w;
        if (needed > width && words.length) flush();
        words.push({ text: word, width: w });
        used = words.length === 1 ? w : used + space + w;
      }
      if (words.length || !lines.length) flush();
      return { lines, space };
    }

    for (const b of blocks) {
      if (truncated) break;
      if (b.type === 'pagebreak') {
        if (current().length) newPage();
        continue;
      }
      if (b.type === 'blank') {
        // Don't start a page with blank lines created by overflow.
        if (current().length || pages.length === 1) pushLine({ scale: 1, indent: 0, words: [], spaceWidth: 0 });
        continue;
      }

      const scale = b.type === 'heading' ? HEADING_SCALE[b.level] : 1;
      const size = fontSizeMm * scale;
      const indent = b.type === 'list' ? fontSizeMm * LIST_INDENT_EM : 0;
      const { lines, space } = wrap(b.text, size, contentWidth - indent);

      // Keep a heading together with at least one following line.
      if (b.type === 'heading' && current().length >= linesPerPage - 1 && current().length) newPage();

      lines.forEach((words, i) => pushLine({
        scale,
        indent,
        marker: b.type === 'list' && i === 0 ? b.marker : null,
        heading: b.type === 'heading' ? b.level : 0,
        words,
        spaceWidth: space,
      }));
    }

    // Drop trailing empty pages (e.g. a page break at the very end).
    while (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
    return { pages, truncated };
  }

  function linesPerPage(pageH, margins, lineSpacing) {
    return Math.max(1, Math.floor((pageH - margins.top - margins.bottom) / lineSpacing));
  }

  const api = { parse, layout, linesPerPage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.HT = root.HT || {}).Layout = api;
})(typeof window !== 'undefined' ? window : globalThis);
