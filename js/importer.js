/* HandText Pro — turn uploaded documents into HandText markup.
 *
 *   PDF   → pdf.js text extraction, then lines are rebuilt into headings,
 *           bullets and paragraphs using font size, bold and position.
 *   DOCX  → mammoth.js converts to HTML, which is walked into markup.
 *   HTML  → walked into markup the same way.
 *   TXT / MD → used as-is (light Markdown tidy-up).
 *
 * The heavy libraries are only downloaded when a file of that type is opened.
 * `pdfLinesToMarkup` and `tidyMarkdown` are pure and unit-tested in Node.
 */
(function (root) {
  'use strict';

  const MAX_PDF_PAGES = 200;
  const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };

  function cleanText(s) {
    return String(s)
      .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c])
      .replace(/[\u00A0\u2007\u202F\u2002\u2003\u2009]/g, ' ')
      .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '');
  }

  const BULLETS = '\u2022\u25CF\u25E6\u25CB\u25AA\u25A0\u25A1\u25BA\u25B6\u27A2\u27A4\u2713\u2714\u00B7\u2023\u2043\u2013\u2014-*'; // bullets, arrows, ticks, dashes
  const isBulletChar = (ch) => BULLETS.includes(ch) || (ch >= '\uF000' && ch <= '\uF0FF');
  const NUMBERED_RE = /^\(?(\d{1,3}|[a-zA-Z]|[ivxIVX]{1,5})[.)]\s+/;
  const PAGE_NO_RE = /^(page\s*)?[-\u2013]?\s*\d{1,4}\s*[-\u2013]?(\s*(of|\/)\s*\d{1,4})?$/i;

  function median(values) {
    if (!values.length) return 0;
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  function percentile(values, p) {
    if (!values.length) return 0;
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
  }

  /** Wrap bold segments in ** markers, keeping surrounding spaces outside them. */
  function segmentsToText(segs, boldAllowed) {
    const merged = [];
    for (const s of segs) {
      if (!s.text) continue;
      const last = merged[merged.length - 1];
      const isSpace = !s.text.trim();
      if (last && (last.bold === s.bold || isSpace)) last.text += s.text;
      else merged.push({ text: s.text, bold: s.bold });
    }
    return merged.map((s) => {
      const text = s.text.replace(/\*\*/g, '');
      if (!boldAllowed || !s.bold) return text;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      return m[2] ? `${m[1]}**${m[2]}**${m[3]}` : text;
    }).join('').replace(/\s+/g, ' ').trim();
  }

  /**
   * Rebuild document structure from positioned PDF lines.
   * @param {Array} pages  [{ lines: [{ runs:[{text,bold}], x0, x1, y, size }] }]
   *                       y grows downward within a page (top = 0).
   * @returns {string} markup
   */
  function pdfLinesToMarkup(pages) {
    // 1. Drop page numbers and running headers/footers.
    const edgeCounts = new Map();
    pages.forEach((p) => {
      const edges = [p.lines[0], p.lines[p.lines.length - 1]].filter(Boolean);
      new Set(edges.map((l) => lineText(l).trim().toLowerCase())).forEach((t) => edgeCounts.set(t, (edgeCounts.get(t) || 0) + 1));
    });
    const repeated = (t) => pages.length >= 3 && (edgeCounts.get(t) || 0) >= Math.max(3, pages.length * 0.6);

    const lines = [];
    pages.forEach((p, pi) => p.lines.forEach((l, li) => {
      const t = lineText(l).trim();
      if (!t) return;
      const atEdge = li === 0 || li === p.lines.length - 1;
      if (atEdge && (PAGE_NO_RE.test(t) || repeated(t.toLowerCase()))) return;
      lines.push({ ...l, page: pi });
    }));
    if (!lines.length) return '';

    // 2. Measure the body text: most common size, left and right edges.
    const sizeWeight = new Map();
    lines.forEach((l) => {
      const k = Math.round(l.size * 2) / 2;
      sizeWeight.set(k, (sizeWeight.get(k) || 0) + lineText(l).length);
    });
    const body = [...sizeWeight.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bodyLines = lines.filter((l) => Math.abs(l.size - body) < 1);
    const right = percentile(bodyLines.map((l) => l.x1), 0.9);
    const left = percentile(bodyLines.map((l) => l.x0), 0.1);
    const width = Math.max(1, right - left);
    const pitch = median(bodyLines.slice(1).map((l, i) => (l.page === bodyLines[i].page ? l.y - bodyLines[i].y : 0)).filter((d) => d > 0)) || body * 1.4;

    // 3. Classify each line.
    const info = lines.map((l) => {
      const runs = l.runs.map((r) => ({ ...r }));
      // Leading bullet glyph (often its own run in a Symbol font).
      let bullet = false;
      const first = runs.find((r) => r.text.trim());
      if (first) {
        const t = first.text.replace(/^\s+/, '');
        const ch = Array.from(t)[0];
        const rest = t.slice(ch.length);
        if (isBulletChar(ch) && (rest === '' || /^\s/.test(rest)) && (rest.trim() || runs.indexOf(first) < runs.length - 1)) {
          bullet = true;
          first.text = rest;
        }
      }
      const text = segmentsToText(runs, false);
      const chars = runs.reduce((n, r) => n + r.text.replace(/\s/g, '').length, 0);
      const boldChars = runs.reduce((n, r) => n + (r.bold ? r.text.replace(/\s/g, '').length : 0), 0);
      const boldFrac = chars ? boldChars / chars : 0;
      let level = 0;
      if (!bullet) {
        if (l.size >= body * 1.45) level = 1;
        else if (l.size >= body * 1.12) level = 2;
        else if (boldFrac > 0.9 && text.length <= 150) level = 3;
      }
      return { l, runs, text, bullet, numbered: !bullet && !level && NUMBERED_RE.test(text), level };
    });

    // 4. Join wrapped lines back into blocks.
    const blocks = [];
    let block = null;
    let prev = null;
    for (const cur of info) {
      if (!cur.text) continue;
      const l = cur.l;
      let join = false;
      if (block && prev && !cur.bullet && !cur.numbered && cur.level === block.level) {
        const p = prev.l;
        const prevFull = p.x1 >= right - Math.max(width * 0.12, body * 3);
        const samePage = p.page === l.page;
        const closeBelow = !samePage || (l.y - p.y > 0 && l.y - p.y < Math.max(pitch, l.size) * 1.6);
        const notIndentedMore = l.x0 <= p.x0 + l.size * 1.5 || block.bullet || block.numbered;
        const listCont = (block.bullet || block.numbered) ? l.x0 > block.x0 + l.size * 0.5 : true;
        join = prevFull && closeBelow && notIndentedMore && listCont;
      }
      if (join) {
        const last = block.segs[block.segs.length - 1];
        const lastText = last ? last.text.replace(/\s+$/, '') : '';
        // Re-join words hyphenated across a line break ("infor-" + "mation").
        if (/[a-z]-$/.test(lastText) && /^[a-z]/.test(cur.text)) last.text = lastText.slice(0, -1);
        else block.segs.push({ text: ' ', bold: false });
        block.segs.push(...cur.runs);
      } else {
        const gap = prev && prev.l.page === l.page ? l.y - prev.l.y : 0;
        block = {
          level: cur.level, bullet: cur.bullet, numbered: cur.numbered, x0: l.x0,
          segs: cur.runs.slice(), gapBefore: gap > Math.max(pitch, l.size) * 1.75,
        };
        blocks.push(block);
      }
      prev = cur;
    }

    // 5. Write markup.
    const out = [];
    blocks.forEach((b, i) => {
      const text = segmentsToText(b.segs, b.level === 0);
      if (!text) return;
      const prevB = blocks[i - 1];
      if (out.length && (b.level === 1 || b.level === 2)) out.push('');
      else if (out.length && b.gapBefore && !b.level && !b.bullet && !b.numbered && prevB && !prevB.level && !prevB.bullet) out.push('');
      if (b.level) out.push(`${'#'.repeat(b.level)} ${text}`);
      else if (b.bullet) out.push(`- ${text}`);
      else out.push(text);
    });
    return collapseBlank(out.join('\n'));
  }

  function lineText(l) { return l.runs.map((r) => r.text).join(''); }

  function collapseBlank(s) {
    return s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Light Markdown → HandText markup: deeper headings, __bold__, table rules, images. */
  function tidyMarkdown(text) {
    return collapseBlank(String(text)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => {
        if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-')) return line.includes('|') ? null : ''; // table rule / hr
        let m;
        if ((m = /^\s*#{4,6}\s+(.*)$/.exec(line))) return `### ${m[1]}`;
        if (/^\s*\|.*\|\s*$/.test(line)) return line.trim().replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/).join(' | ');
        return line
          .replace(/!\[[^\]]*\]\([^)]*\)/g, '')             // images
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')           // links \u2192 text
          .replace(/__([^_]+)__/g, '**$1**')
          .replace(/`([^`]+)`/g, '$1');
      })
      .filter((l) => l !== null)
      .join('\n'));
  }

  // ------------------------------------------------------------------ browser side
  const scriptCache = new Map();
  function loadScript(src) {
    if (!scriptCache.has(src)) {
      scriptCache.set(src, new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { scriptCache.delete(src); reject(new Error(`Couldn't load ${src.split('/').pop()}. Check your connection and try again.`)); };
        document.head.appendChild(s);
      }));
    }
    return scriptCache.get(src);
  }

  const BOLD_FONT_RE = /bold|black|heavy|semibold|demibold|demi|extrabold|ultrabold|[-,]bd\b|\bbd$/i;

  async function readPdfPages(file, onProgress) {
    await loadScript('vendor/pdfjs/pdf.min.js');
    const pdfjs = root.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password and try again.');
      throw new Error("This file doesn't look like a valid PDF.");
    }
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages = [];
    let chars = 0;
    for (let n = 1; n <= count; n++) {
      onProgress && onProgress(`Reading PDF page ${n} of ${count}\u2026`);
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      await page.getOperatorList(); // makes font names available
      const tc = await page.getTextContent();
      const runs = [];
      for (const it of tc.items) {
        if (typeof it.str !== 'string' || it.str === '') continue;
        const t = it.transform;
        const size = Math.hypot(t[2], t[3]) || it.height || 10;
        if (Math.abs(t[1]) > size * 0.05) continue; // skip rotated text
        let bold = false;
        try {
          const font = page.commonObjs.get(it.fontName);
          bold = !!(font && (font.bold || BOLD_FONT_RE.test(font.name || '')));
        } catch { /* font not resolved \u2014 treat as regular */ }
        const text = cleanText(it.str);
        chars += text.trim().length;
        runs.push({ text, bold, size, x: t[4], y: vp.height - t[5], w: text.trim() ? it.width : 0 });
      }
      pages.push({ lines: groupIntoLines(runs) });
      page.cleanup();
    }
    await doc.destroy();
    if (chars < 20) {
      throw new Error("This PDF has no selectable text (it's probably a scan or photo). Upload the original Word/Docs file instead, or copy-paste the text.");
    }
    const note = doc.numPages > count ? `Only the first ${count} of ${doc.numPages} PDF pages were imported.` : '';
    return { pages, note };
  }

  async function readPdf(file, onProgress) {
    const { pages, note } = await readPdfPages(file, onProgress);
    return { text: pdfLinesToMarkup(pages), note };
  }

  function groupIntoLines(runs) {
    const sorted = runs.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const r of sorted) {
      const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(l.size, r.size) * 0.35);
      if (line) { line.items.push(r); line.size = Math.max(line.size, r.text.trim() ? r.size : 0); }
      else lines.push({ y: r.y, size: r.text.trim() ? r.size : 0, items: [r] });
    }
    return lines
      .filter((l) => l.items.some((r) => r.text.trim()))
      .sort((a, b) => a.y - b.y)
      .map((l) => {
        const items = l.items.sort((a, b) => a.x - b.x);
        const out = [];
        let end = null;
        for (const r of items) {
          if (!r.text.trim()) { out.push({ text: ' ', bold: r.bold }); continue; }
          const prevText = out.length ? out[out.length - 1].text : '';
          if (end !== null && r.x - end > r.size * 0.15 && !/\s$/.test(prevText) && !/^\s/.test(r.text)) out.push({ text: ' ', bold: false });
          out.push({ text: r.text, bold: r.bold });
          end = r.x + r.w;
        }
        const solid = items.filter((r) => r.text.trim());
        // Line size = size of most of its characters (ignores a big drop-cap or tiny footnote mark).
        const weights = new Map();
        solid.forEach((r) => weights.set(r.size, (weights.get(r.size) || 0) + r.text.length));
        const size = [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0];
        return {
          runs: out,
          x0: Math.min(...solid.map((r) => r.x)),
          x1: Math.max(...solid.map((r) => r.x + r.w)),
          y: l.y,
          size,
        };
      });
  }

  /** Walk HTML (from mammoth or an .html file) into markup. */
  function htmlToMarkup(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, template, head').forEach((n) => n.remove());
    const out = [];
    let images = doc.querySelectorAll('img').length;
    const push = (line) => out.push(line);
    const blankBefore = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
    const tidy = (s) => s.replace(/[ \t\u00A0]+/g, ' ').replace(/ *\n */g, '\n').trim();
    const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'HR', 'FIGURE', 'DL', 'DT', 'DD']);

    function inline(node) {
      let s = '';
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) s += cleanText(c.nodeValue).replace(/\s+/g, ' ');
        else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === 'BR') s += '\n';
          else if (tag === 'UL' || tag === 'OL' || tag === 'TABLE') { /* handled as blocks */ }
          else if (tag === 'STRONG' || tag === 'B') {
            const inner = inline(c).replace(/\*\*/g, '');
            const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
            s += m[2] ? `${m[1]}**${m[2]}**${m[3]}` : inner;
          } else s += inline(c);
        }
      });
      return s;
    }

    function paragraph(el) {
      const text = tidy(inline(el));
      if (!text) { push(''); return; }
      for (const line of text.split('\n')) {
        if (!line.trim()) { push(''); continue; }
        if (/^\*\*[^*]+\*\*:?$/.test(line) && line.length <= 150) push(`### ${line.replace(/\*\*/g, '')}`);
        else push(line);
      }
    }

    function list(el) {
      const ordered = el.tagName === 'OL';
      let n = parseInt(el.getAttribute('start') || '1', 10) || 1;
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue;
        const own = tidy(inline(li)).replace(/\n+/g, ' ');
        if (own) push(ordered ? `${n}. ${own}` : `- ${own}`);
        n++;
        li.querySelectorAll(':scope > ul, :scope > ol').forEach(list);
      }
    }

    function walk(parent) {
      parent.childNodes.forEach((node) => {
        if (node.nodeType === 3) {
          const t = tidy(cleanText(node.nodeValue));
          if (t) push(t);
          return;
        }
        if (node.nodeType !== 1) return;
        const tag = node.tagName;
        const text = () => tidy(inline(node)).replace(/\*\*/g, '').replace(/\n+/g, ' ');
        if (/^H[1-6]$/.test(tag)) {
          // A Word "Title" is the top heading; real headings then move down one level.
          let level = Math.min(3, +tag[1] + (titled ? 1 : 0));
          if (node.classList.contains('doc-title')) level = 1;
          else if (node.classList.contains('doc-subtitle')) level = 2;
          if (level <= 2) blankBefore();
          const t = text();
          if (t) push(`${'#'.repeat(level)} ${t}`);
          return;
        }
        switch (tag) {
          case 'UL': case 'OL': list(node); break;
          case 'TABLE':
            node.querySelectorAll('tr').forEach((tr) => {
              const cells = [...tr.children].map((td) => tidy(inline(td)).replace(/\n+/g, ' ')).filter(Boolean);
              if (cells.length) push(cells.join(' | '));
            });
            push('');
            break;
          case 'HR': push(''); break;
          case 'IMG': break;
          default:
            if ([...node.children].some((c) => BLOCKS.has(c.tagName))) walk(node);
            else if (BLOCKS.has(tag) || node.parentNode === doc.body) paragraph(node);
            else { const t = tidy(inline(node)); if (t) push(t); }
        }
      });
    }

    const titled = !!doc.querySelector('h1.doc-title');
    walk(doc.body);
    return { text: collapseBlank(out.join('\n')), images };
  }

  async function readDocx(file, onProgress) {
    onProgress && onProgress('Reading Word document\u2026');
    await loadScript('vendor/mammoth.browser.min.js');
    const mammoth = root.mammoth;
    let result;
    try {
      result = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        {
          styleMap: [
            "p[style-name='Title'] => h1.doc-title:fresh",
            "p[style-name='Subtitle'] => h2.doc-subtitle:fresh",
          ],
          // Don't embed images — we can't draw them yet; just count them.
          convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
        },
      );
    } catch {
      throw new Error("Couldn't read this Word file. Make sure it's a .docx (not an old .doc) and not password-protected.");
    }
    const { text, images } = htmlToMarkup(result.value);
    return { text, note: images ? `${images} image${images === 1 ? ' was' : 's were'} skipped (images aren't supported yet).` : '' };
  }

  /**
   * Import any supported file.
   * @returns {Promise<{text: string, note: string, kind: string}>}
   */
  async function importFile(file, onProgress) {
    const name = (file.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const type = file.type || '';
    if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB. Please upload a smaller file.');

    let res;
    let kind;
    if (ext === 'pdf' || type === 'application/pdf') { kind = 'PDF'; res = await readPdf(file, onProgress); }
    else if (ext === 'docx' || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { kind = 'Word'; res = await readDocx(file, onProgress); }
    else if (ext === 'doc') throw new Error('Old .doc files aren\'t supported. In Word, use File \u2192 Save As \u2192 .docx, then upload that.');
    else if (['pptx', 'ppt', 'xlsx', 'xls', 'odt', 'pages', 'rtf'].includes(ext)) throw new Error(`.${ext} files aren't supported yet. Save it as PDF or .docx and upload that.`);
    else if (/^image\//.test(type) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) throw new Error("Photos and scans can't be read yet. Upload a PDF, Word or text file instead.");
    else if (ext === 'html' || ext === 'htm' || type === 'text/html') { kind = 'web page'; const r = htmlToMarkup(await file.text()); res = { text: r.text, note: '' }; }
    else if (['txt', 'md', 'markdown', 'text', ''].includes(ext) || type.startsWith('text/')) { kind = 'text'; res = { text: tidyMarkdown(await file.text()), note: '' }; }
    else throw new Error(`.${ext} files aren't supported. Upload a PDF, Word (.docx), .txt or .md file.`);

    const text = res.text.replace(/\u0000/g, '');
    if (!text.trim()) throw new Error("Couldn't find any text in that file.");
    return { text, note: res.note || '', kind };
  }

  /** Load pdf.js on demand and return it (used by Print check to open any PDF). */
  async function loadPdfJs() {
    await loadScript('vendor/pdfjs/pdf.min.js');
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    return root.pdfjsLib;
  }

  const api = { importFile, loadPdfJs, readPdfPages, pdfLinesToMarkup, tidyMarkdown, htmlToMarkup, segmentsToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.HT = root.HT || {}).Import = api;
})(typeof window !== 'undefined' ? window : globalThis);
