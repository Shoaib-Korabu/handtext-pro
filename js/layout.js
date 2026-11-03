/* HandText Pro — text parsing and page layout.
 * Pure functions (no DOM), so they run in the browser and in Node tests.
 *
 * Supported markup (one per line):
 *   # Heading 1     ## Heading 2     ### Heading 3 (bold line)
 *   - item / * item / • item          bullet list
 *   1. item / 1) item                 numbered list
 *   **bold words** anywhere in a line
 *   [pagebreak]                       start a new page
 * Everything else is a paragraph; blank lines are kept.
 */
(function (root) {
  'use strict';

  const PAGE_BREAK_RE = /^\s*\[pagebreak\]\s*$/i;
  const HEADING_SCALE = { 1: 1.3, 2: 1.15, 3: 1.04 };
  const LIST_INDENT_EM = 1.3; // hanging indent for list items, in ems
  // Bullet characters people paste from Word/PDF, including Symbol/Wingdings private-use glyphs.
  const BULLET_RE = /^\s*[-*\u2022\u25CF\u25E6\u25CB\u25AA\u25A0\u25A1\u25BA\u25B6\u27A2\u27A4\u2713\u2714\u00B7\uF0A7\uF0B7\uF076\uF0D8\uF0FC\uF06E\uF0A8]\s+(.*)$/;

  function parse(text) {
    const blocks = [];
    const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    for (const raw of src.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (PAGE_BREAK_RE.test(line)) blocks.push({ type: 'pagebreak' });
      else if (!line.trim()) blocks.push({ type: 'blank' });
      else if ((m = line.match(/^\s*(#{1,3})\s+(.*)$/))) blocks.push({ type: 'heading', level: m[1].length, text: m[2].replace(/\*\*/g, '') });
      else if ((m = line.match(BULLET_RE))) blocks.push({ type: 'list', marker: '\u2022', text: m[1] });
      else if ((m = line.match(/^\s*(\d{1,3}[.)])\s+(.*)$/))) blocks.push({ type: 'list', marker: m[1], text: m[2] });
      else blocks.push({ type: 'para', text: line.trim() });
    }
    return blocks;
  }

  /**
   * Split a line of text into words, reading **bold** markers.
   * Each word is { text, bold } where bold is false, true, or an array of
   * booleans (one per character) when only part of the word is bold.
   * An unmatched trailing ** is kept as literal text.
   */
  function inlineWords(text, allBold) {
    const parts = String(text).split('**');
    const markers = parts.length - 1;
    const chars = [];
    let bold = false;
    parts.forEach((part, i) => {
      for (const ch of Array.from(part)) chars.push([ch, bold || !!allBold]);
      if (i < parts.length - 1) {
        if (markers % 2 === 1 && i === parts.length - 2) { chars.push(['*', bold || !!allBold], ['*', bold || !!allBold]); }
        else bold = !bold;
      }
    });
    const words = [];
    let cur = null;
    for (const [ch, b] of chars) {
      if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } continue; }
      if (!cur) cur = { chars: [], mask: [] };
      cur.chars.push(ch);
      cur.mask.push(b);
    }
    if (cur) words.push(cur);
    return words.map((w) => ({
      text: w.chars.join(''),
      bold: w.mask.every(Boolean) ? true : w.mask.some(Boolean) ? w.mask : false,
    }));
  }

  /**
   * Lay blocks out into pages of lines.
   * @param {Array} blocks         output of parse()
   * @param {Object} opt
   *   measure(text, sizeMm) -> width in mm
   *   fontSizeMm, wordSpacing (%), contentWidth (mm), linesPerPage, maxPages
   * @returns {{pages: Array<Array<Line>>, truncated: boolean}}
   *   Line = { scale, indent, marker, heading, words:[{text,width,bold}], spaceWidth }
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

    function wrap(words, size, width) {
      const space = spaceOf(size);
      const lines = [];
      let line = [];
      let used = 0;
      const flush = () => { lines.push(line); line = []; used = 0; };

      for (const word of words) {
        const w = measure(word.text, size);
        if (w > width) {
          // Hard-break a word wider than the line, keeping its bold mask in step.
          if (line.length) flush();
          const chars = Array.from(word.text);
          const maskAt = (i) => (Array.isArray(word.bold) ? word.bold[i] : word.bold);
          let chunk = [];
          let mask = [];
          const piece = () => {
            const text = chunk.join('');
            const b = mask.every(Boolean) ? true : mask.some(Boolean) ? mask.slice() : false;
            return { text, width: measure(text, size), bold: b };
          };
          chars.forEach((ch, i) => {
            if (chunk.length && measure(chunk.join('') + ch, size) > width) {
              lines.push([piece()]);
              chunk = []; mask = [];
            }
            chunk.push(ch);
            mask.push(!!maskAt(i));
          });
          line = [piece()];
          used = line[0].width;
          continue;
        }
        const needed = line.length ? used + space + w : w;
        if (needed > width && line.length) flush();
        line.push({ text: word.text, width: w, bold: word.bold });
        used = line.length === 1 ? w : used + space + w;
      }
      if (line.length || !lines.length) flush();
      return { lines, space };
    }

    for (const b of blocks) {
      if (truncated) break;
      if (b.type === 'pagebreak') {
        if (current().length) newPage();
        continue;
      }
      if (b.type === 'blank') {
        // Blank lines at the very top of an overflow page would look like a mistake; skip them.
        if (current().length || pages.length === 1) pushLine({ scale: 1, indent: 0, heading: 0, marker: null, words: [], spaceWidth: 0 });
        continue;
      }

      const heading = b.type === 'heading' ? b.level : 0;
      const scale = heading ? HEADING_SCALE[heading] : 1;
      const size = fontSizeMm * scale;
      const indent = b.type === 'list' ? fontSizeMm * LIST_INDENT_EM : 0;
      const words = inlineWords(b.text, heading === 3);
      const { lines, space } = wrap(words, size, contentWidth - indent);

      // Keep a heading together with at least one following line.
      if (heading && current().length && current().length + lines.length + 1 > linesPerPage && lines.length < linesPerPage) {
        newPage();
      }
      lines.forEach((ws, i) => pushLine({
        scale,
        indent,
        marker: b.type === 'list' && i === 0 ? b.marker : null,
        heading,
        words: ws,
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

  const api = { parse, layout, linesPerPage, inlineWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.HT = root.HT || {}).Layout = api;
})(typeof window !== 'undefined' ? window : globalThis);
