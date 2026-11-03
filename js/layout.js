/* HandText Pro — text parsing and page layout.
 * Pure functions (no DOM), so they run in the browser and in Node tests.
 *
 * Supported markup (one per line):
 *   # Heading 1     ## Heading 2     ### Heading 3 (bold line)
 *   - item / * item / • item          bullet list
 *   1. item / 1) item                 numbered list
 *   a | b | c   or   | a | b |        table rows (drawn as a hand-ruled table)
 *   [pagebreak]                       start a new page
 * Inline, anywhere in a line:
 *   **bold**   ==highlight==   ~~strike~~   $x^2 + H_2O$ (maths)
 *   {circle:words} {box:..} {u:..} {uu:..} {wavy:..} {strike:..} {cross:..}
 *   {hl:..} {hl-green:..} {hl-pink:..} {hl-blue:..}
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
      else if (tableCells(line)) {
        const cells = tableCells(line);
        const last = blocks[blocks.length - 1];
        if (cells === 'rule') { if (last && last.type === 'table') continue; blocks.push({ type: 'para', text: line.trim() }); continue; }
        if (last && last.type === 'table') last.rows.push(cells);
        else blocks.push({ type: 'table', rows: [cells] });
      }
      else if ((m = line.match(/^\s*(#{1,3})\s+(.*)$/))) blocks.push({ type: 'heading', level: m[1].length, text: m[2].replace(/\*\*/g, '') });
      else if ((m = line.match(BULLET_RE))) blocks.push({ type: 'list', marker: '\u2022', text: m[1] });
      else if ((m = line.match(/^\s*(\d{1,3}[.)])\s+(.*)$/))) blocks.push({ type: 'list', marker: m[1], text: m[2] });
      else blocks.push({ type: 'para', text: line.trim() });
    }
    return blocks;
  }

  // ---------- inline formatting ----------
  // {tag:text} marks drawn by hand around/under/over words (also ==highlight== and ~~strike~~)
  const MARKS = ['hl', 'hl-green', 'hl-pink', 'hl-blue', 'u', 'uu', 'wavy', 'circle', 'box', 'strike', 'cross'];
  const SCRIPT_SCALE = 0.65;

  // $maths$ → characters, with ^superscripts and _subscripts.
  const MATH_SYMBOLS = {
    alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', Gamma: '\u0393', delta: '\u03B4', Delta: '\u0394', epsilon: '\u03B5',
    varepsilon: '\u03B5', zeta: '\u03B6', eta: '\u03B7', theta: '\u03B8', Theta: '\u0398', lambda: '\u03BB', Lambda: '\u039B',
    mu: '\u03BC', nu: '\u03BD', xi: '\u03BE', pi: '\u03C0', Pi: '\u03A0', rho: '\u03C1', sigma: '\u03C3', Sigma: '\u03A3',
    tau: '\u03C4', phi: '\u03C6', varphi: '\u03C6', Phi: '\u03A6', chi: '\u03C7', psi: '\u03C8', Psi: '\u03A8', omega: '\u03C9', Omega: '\u03A9',
    times: '\u00D7', cdot: '\u00B7', div: '\u00F7', pm: '\u00B1', mp: '\u2213', le: '\u2264', leq: '\u2264', ge: '\u2265', geq: '\u2265',
    ne: '\u2260', neq: '\u2260', approx: '\u2248', equiv: '\u2261', infty: '\u221E', to: '\u2192', rightarrow: '\u2192', leftarrow: '\u2190',
    Rightarrow: '\u21D2', iff: '\u21D4', sum: '\u03A3', prod: '\u03A0', int: '\u222B', partial: '\u2202', nabla: '\u2207',
    degree: '\u00B0', circ: '\u00B0', angle: '\u2220', perp: '\u22A5', parallel: '\u2225', in: '\u2208', notin: '\u2209',
    subset: '\u2282', cup: '\u222A', cap: '\u2229', forall: '\u2200', exists: '\u2203', therefore: '\u2234', because: '\u2235',
    ldots: '...', cdots: '\u00B7\u00B7\u00B7', prime: '\u2032', percent: '%', '%': '%', '$': '$', '{': '{', '}': '}', '_': '_', '#': '#', '&': '&',
  };

  function mathChars(src, out, script, attrs) {
    let i = 0;
    const group = () => {
      // Read {group} or a single character / \command after ^ _ \sqrt etc.
      while (src[i] === ' ') i++;
      if (src[i] === '{') {
        let depth = 0, j = i;
        for (; j < src.length; j++) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}' && --depth === 0) break;
        }
        const g = src.slice(i + 1, j);
        i = j + 1;
        return g;
      }
      if (src[i] === '\\') {
        const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
        i += m ? m[0].length : 1;
        return m ? m[0] : '';
      }
      return src[i++] || '';
    };
    const emit = (text, s) => { for (const ch of Array.from(text)) out.push({ ...attrs, ch, s }); };
    while (i < src.length) {
      const c = src[i];
      if (c === '^' || c === '_') {
        i++;
        const g = group();
        mathChars(g, out, c === '^' ? 1 : -1, attrs);
      } else if (c === '\\') {
        const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
        const name = m ? m[1] : '';
        i += m ? m[0].length : 1;
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const a = group(), b = group();
          const wrapSide = (t) => (/^[\w.]+$/.test(t) ? t : `(${t})`);
          mathChars(`${wrapSide(a)}/${wrapSide(b)}`, out, script, attrs);
        } else if (name === 'sqrt') {
          const a = group();
          emit('\u221A', script);
          mathChars(/^\w$/.test(a) ? a : `(${a})`, out, script, attrs);
        } else if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'operatorname') {
          emit(group(), script);
        } else if (name === 'left' || name === 'right' || name === 'displaystyle') {
          /* sizing commands: ignore */
        } else if (name === ',' || name === ';' || name === ' ' || name === 'quad' || name === 'qquad') {
          emit(' ', 0);
        } else if (MATH_SYMBOLS[name] !== undefined) {
          emit(MATH_SYMBOLS[name], script);
        } else if (/^(sin|cos|tan|log|ln|lim|max|min|exp|sec|csc|cot)$/.test(name)) {
          emit(name, script);
        } else emit(name, script);
      } else if (c === '{' || c === '}') {
        i++;
      } else {
        emit(c, script);
        i++;
      }
    }
    return out;
  }

  /** Turn a line of text into characters with attributes: b (bold), m (mark id), s (script +1/-1). */
  function inlineChars(text, allBold, plain) {
    const src = String(text);
    const out = [];
    let bold = false;
    let markSeq = 0;
    const stack = []; // open mark ids
    const closers = []; // what closes each open mark: '}' | '==' | '~~'
    const curMark = () => (stack.length ? stack[stack.length - 1] : null);
    // Find the closing index of ** pairs up front so an unmatched one stays literal.
    const boldIdx = [];
    for (let i = src.indexOf('**'); i !== -1; i = src.indexOf('**', i + 2)) boldIdx.push(i);
    const lastUnmatched = boldIdx.length % 2 === 1 ? boldIdx[boldIdx.length - 1] : -1;
    const push = (ch, s) => out.push({ ch, b: (bold || !!allBold) && !plain, m: curMark(), s: s || 0 });

    const top = () => closers[closers.length - 1];
    let i = 0;
    while (i < src.length) {
      // **bold**
      if (src.startsWith('**', i) && i !== lastUnmatched) { bold = !bold; i += 2; continue; }
      // {tag:marked words}
      if (src[i] === '{') {
        const m = /^\{([a-z-]+):/.exec(src.slice(i));
        if (m && MARKS.includes(m[1]) && src.indexOf('}', i) !== -1) {
          stack.push(`${m[1]}#${++markSeq}`);
          closers.push('}');
          i += m[0].length;
          continue;
        }
      }
      if (src[i] === '}' && top() === '}') { stack.pop(); closers.pop(); i++; continue; }
      // ==highlight== and ~~strike~~
      const two = src.slice(i, i + 2);
      if (two === '==' || two === '~~') {
        if (top() === two) { stack.pop(); closers.pop(); i += 2; continue; }
        if (src.indexOf(two, i + 2) > i + 2) {
          stack.push(`${two === '==' ? 'hl' : 'strike'}#${++markSeq}`);
          closers.push(two);
          i += 2;
          continue;
        }
        push(src[i]); push(src[i + 1]); i += 2;
        continue;
      }
      // $maths$ (not "$5 and $10")
      if (src[i] === '$' && src[i + 1] && src[i + 1] !== ' ') {
        let j = i + 1;
        while (j < src.length && !(src[j] === '$' && src[j - 1] !== '\\')) j++;
        if (j < src.length && src[j - 1] !== ' ' && !/\d/.test(src[j + 1] || '')) {
          mathChars(src.slice(i + 1, j), out, 0, { b: (bold || !!allBold) && !plain, m: curMark() });
          i = j + 1;
          continue;
        }
      }
      if (src[i] === '\\' && src[i + 1] === '$') { push('$'); i += 2; continue; }
      const ch = String.fromCodePoint(src.codePointAt(i));
      push(ch);
      i += ch.length;
    }
    return out;
  }

  /**
   * Split a line of text into words.
   * Each word is { text, bold, marks, script }:
   *   bold   false | true | boolean[] (per character)
   *   marks  null | (string|null)[] per character — mark id like "circle#3"
   *   script null | number[] per character — 1 superscript, -1 subscript
   */
  function inlineWords(text, allBold, plain) {
    const chars = inlineChars(text, allBold, plain);
    const words = [];
    let cur = null;
    for (const c of chars) {
      if (/\s/.test(c.ch)) { if (cur) { words.push(cur); cur = null; } continue; }
      if (!cur) cur = [];
      cur.push(c);
    }
    if (cur) words.push(cur);
    return words.map(makeWord);
  }

  function makeWord(cs) {
    const b = cs.map((c) => !!c.b);
    const m = cs.map((c) => c.m || null);
    const s = cs.map((c) => c.s || 0);
    return {
      text: cs.map((c) => c.ch).join(''),
      bold: b.every(Boolean) ? true : b.some(Boolean) ? b : false,
      marks: m.some(Boolean) ? m : null,
      script: s.some(Boolean) ? s : null,
    };
  }

  /** Characters of a word back into attribute records (for hard-breaking long words). */
  function wordChars(word) {
    return Array.from(word.text).map((ch, i) => ({
      ch,
      b: Array.isArray(word.bold) ? word.bold[i] : word.bold,
      m: word.marks ? word.marks[i] : null,
      s: word.script ? word.script[i] : 0,
    }));
  }

  /** Width of a word in mm; super/subscript characters are smaller. */
  function wordWidth(word, size, measure) {
    if (!word.script) return measure(word.text, size);
    return Array.from(word.text).reduce((w, ch, i) => w + measure(ch, size) * (word.script[i] ? SCRIPT_SCALE : 1), 0);
  }

  // ---------- tables ----------
  const TABLE_RULE_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
  function tableCells(line) {
    if (TABLE_RULE_RE.test(line)) return 'rule';
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) return t.slice(1, -1).split('|').map((c) => c.trim());
    if (/\s\|\s/.test(t)) return t.split(/\s\|\s/).map((c) => c.trim());
    return null;
  }

  /**
   * Lay blocks out into pages of lines.
   * @param {Array} blocks         output of parse()
   * @param {Object} opt
   *   measure(text, sizeMm) -> width in mm
   *   fontSizeMm, wordSpacing (%), contentWidth (mm), linesPerPage, maxPages,
   *   plain (true = one pen: no bold, headings same size as text, no underline)
   * @returns {{pages: Array<Array<Line>>, truncated: boolean}}
   *   Line = { scale, indent, marker, heading, words:[{text,width,bold}], spaceWidth }
   */
  function layout(blocks, opt) {
    const { measure, fontSizeMm, contentWidth, linesPerPage } = opt;
    const plain = !!opt.plain; // single pen: same size and weight for everything
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
        const w = wordWidth(word, size, measure);
        if (w > width) {
          // Hard-break a word wider than the line, keeping its formatting in step.
          if (line.length) flush();
          let chunk = [];
          const piece = () => { const pw = makeWord(chunk); pw.width = wordWidth(pw, size, measure); return pw; };
          for (const c of wordChars(word)) {
            if (chunk.length && wordWidth(makeWord([...chunk, c]), size, measure) > width) {
              lines.push([piece()]);
              chunk = [];
            }
            chunk.push(c);
          }
          line = [piece()];
          used = line[0].width;
          continue;
        }
        const needed = line.length ? used + space + w : w;
        if (needed > width && line.length) flush();
        line.push({ ...word, width: w });
        used = line.length === 1 ? w : used + space + w;
      }
      if (line.length || !lines.length) flush();
      return { lines, space };
    }

    // Tables: columns sized to their content, cells wrapped, rows kept on one page.
    const CELL_PAD = Math.max(1.2, fontSizeMm * 0.35);
    let tableSeq = 0;
    function layoutTable(rows) {
      const id = ++tableSeq;
      const ncol = Math.max(...rows.map((r) => r.length));
      const cellWords = rows.map((r, ri) => Array.from({ length: ncol }, (_, ci) =>
        inlineWords(r[ci] || '', ri === 0 && !plain && rows.length > 1, plain)));
      const space = spaceOf(fontSizeMm);
      const natural = Array(ncol).fill(0);
      const minimum = Array(ncol).fill(0);
      cellWords.forEach((r) => r.forEach((ws, ci) => {
        const widths = ws.map((w) => wordWidth(w, fontSizeMm, measure));
        const full = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, ws.length - 1);
        natural[ci] = Math.max(natural[ci], full + CELL_PAD * 2 + fontSizeMm * 0.3); // room for the hand's wobble
        minimum[ci] = Math.max(minimum[ci], Math.min(Math.max(0, ...widths), contentWidth / ncol) + CELL_PAD * 2, 10);
      }));
      let widths = natural.slice();
      const total = widths.reduce((a, b) => a + b, 0);
      if (total > contentWidth) {
        const minTotal = minimum.reduce((a, b) => a + b, 0);
        if (minTotal >= contentWidth) widths = minimum.map((m) => (m / minTotal) * contentWidth);
        else {
          const extra = contentWidth - minTotal;
          const want = natural.map((n, i) => n - minimum[i]);
          const wantTotal = want.reduce((a, b) => a + b, 0) || 1;
          widths = minimum.map((m, i) => m + (want[i] / wantTotal) * extra);
        }
      }
      const cols = [];
      widths.reduce((x, w) => { cols.push({ x, w }); return x + w; }, 0);

      rows.forEach((_, ri) => {
        const cellLines = cellWords[ri].map((ws, ci) => wrap(ws, fontSizeMm, cols[ci].w - CELL_PAD * 2).lines);
        const n = Math.max(1, ...cellLines.map((l) => l.length));
        if (current().length && current().length + n > linesPerPage && n <= linesPerPage) newPage();
        for (let li = 0; li < n; li++) {
          pushLine({
            scale: 1, indent: 0, heading: 0, marker: null, words: [], spaceWidth: space,
            table: {
              id, cols, pad: CELL_PAD,
              cells: cellLines.map((l) => l[li] || []),
              rowStart: li === 0, rowEnd: li === n - 1,
              first: ri === 0, last: ri === rows.length - 1,
            },
          });
        }
      });
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
      if (b.type === 'table') { layoutTable(b.rows); continue; }

      const heading = b.type === 'heading' ? b.level : 0;
      const scale = heading && !plain ? HEADING_SCALE[heading] : 1;
      const size = fontSizeMm * scale;
      const indent = b.type === 'list' ? fontSizeMm * LIST_INDENT_EM : 0;
      const words = inlineWords(b.text, heading === 3, plain);
      const { lines, space } = wrap(words, size, contentWidth - indent);

      // Keep a heading together with at least one following line.
      if (heading && current().length && current().length + lines.length + 1 > linesPerPage && lines.length < linesPerPage) {
        newPage();
      }
      lines.forEach((ws, i) => pushLine({
        scale,
        indent,
        marker: b.type === 'list' && i === 0 ? b.marker : null,
        heading: plain ? 0 : heading,
        words: ws,
        spaceWidth: space,
      }));
    }

    // Drop trailing empty pages (e.g. a page break at the very end).
    while (pages.length > 1 && !pages[pages.length - 1].length) pages.pop();
    return { pages, truncated };
  }

  /** Remove formatting marks (**bold**, # headings) but keep lists, numbering and page breaks. */
  function stripMarks(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^(\s*)#{1,6}\s+/, '$1').replace(/\*\*/g, ''))
      .join('\n');
  }

  /** How many lines of writing fit; `step` = write on every 1st, 2nd or 3rd ruled line. */
  function linesPerPage(pageH, margins, lineSpacing, step) {
    return Math.max(1, Math.floor((pageH - margins.top - margins.bottom) / (lineSpacing * (step || 1))));
  }

  const api = { parse, layout, linesPerPage, inlineWords, stripMarks, wordWidth, MARKS, SCRIPT_SCALE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.HT = root.HT || {}).Layout = api;
})(typeof window !== 'undefined' ? window : globalThis);
