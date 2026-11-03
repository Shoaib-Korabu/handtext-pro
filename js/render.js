/* HandText Pro — drawing: paper backgrounds and the handwriting realism engine.
 *
 * Every page is drawn in two layers:
 *   1. paper  — background colour, ruling and texture
 *   2. ink    — the letters, drawn one glyph at a time with small random changes,
 *               then given pen grain and blended onto the paper with "multiply"
 *               so the paper texture shows through the ink like real ink.
 * Randomness is seeded, so the same text always produces the same page.
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  // ---------- seeded randomness ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedOf = (...parts) => parts.reduce((h, p) => Math.imul(h ^ (p + 0x9e3779b9), 2654435761) >>> 0, 2166136261);
  const range = (rand, a, b) => a + (b - a) * rand();

  // ---------- noise texture (shared, generated once) ----------
  let noiseCanvas = null;
  function getNoise() {
    if (noiseCanvas) return noiseCanvas;
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rand = mulberry32(1234);
    // two octaves: fine grain + soft blotches
    const coarse = new Float32Array(17 * 17).map(() => rand());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (x / 16) | 0, gy = (y / 16) | 0, fx = (x % 16) / 16, fy = (y % 16) / 16;
        const c00 = coarse[gy * 17 + gx], c10 = coarse[gy * 17 + gx + 1];
        const c01 = coarse[(gy + 1) * 17 + gx], c11 = coarse[(gy + 1) * 17 + gx + 1];
        const soft = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
        const v = 0.55 * rand() + 0.45 * soft;
        const g = Math.round(255 - v * 70);
        const i = (y * size + x) * 4;
        img.data[i] = g; img.data[i + 1] = g - 2; img.data[i + 2] = g - 6; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    noiseCanvas = c;
    return c;
  }

  // ---------- paper ----------
  function drawPaper(ctx, s, geo) {
    const { k, pageW, pageH, margins, lineSpacing } = geo;
    const paper = HT.PAPERS.find((p) => p.id === s.paper) || HT.PAPERS[0];
    const W = pageW * k, H = pageH * k;

    ctx.fillStyle = paper.bg;
    ctx.fillRect(0, 0, W, H);

    const hLine = (y, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * k;
      ctx.beginPath();
      ctx.moveTo(0, y * k);
      ctx.lineTo(W, y * k);
      ctx.stroke();
    };
    const vLine = (x, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * k;
      ctx.beginPath();
      ctx.moveTo(x * k, 0);
      ctx.lineTo(x * k, H);
      ctx.stroke();
    };

    const rules = (color, width) => {
      // One rule under every writing line, continuing to the bottom of the sheet.
      for (let y = margins.top + lineSpacing; y <= pageH - 4; y += lineSpacing) hLine(y, color, width);
    };
    const marginX = Math.max(6, margins.left - 4);

    switch (paper.id) {
      case 'notebook':
        rules('rgba(80, 140, 205, 0.55)', 0.22);
        hLine(margins.top, 'rgba(215, 70, 80, 0.45)', 0.25);
        vLine(marginX, 'rgba(215, 70, 80, 0.6)', 0.3);
        break;
      case 'college':
        rules('rgba(90, 150, 210, 0.5)', 0.18);
        vLine(marginX, 'rgba(215, 70, 80, 0.55)', 0.25);
        break;
      case 'legal':
        rules('rgba(90, 130, 175, 0.5)', 0.22);
        vLine(marginX - 1.4, 'rgba(205, 60, 60, 0.6)', 0.25);
        vLine(marginX, 'rgba(205, 60, 60, 0.6)', 0.25);
        break;
      case 'grid': {
        ctx.strokeStyle = 'rgba(90, 150, 210, 0.28)';
        ctx.lineWidth = 0.15 * k;
        ctx.beginPath();
        for (let x = 0; x <= pageW; x += 5) { ctx.moveTo(x * k, 0); ctx.lineTo(x * k, H); }
        for (let y = 0; y <= pageH; y += 5) { ctx.moveTo(0, y * k); ctx.lineTo(W, y * k); }
        ctx.stroke();
        break;
      }
      case 'dots': {
        ctx.fillStyle = 'rgba(70, 80, 100, 0.35)';
        const r = 0.28 * k;
        for (let x = 5; x < pageW; x += 5) {
          for (let y = 5; y < pageH; y += 5) {
            ctx.beginPath();
            ctx.arc(x * k, y * k, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      default: break; // plain, cardstock
    }

    // Texture: grain + soft blotches, multiplied onto the paper.
    const amount = s.texture / 100 * (paper.id === 'cardstock' ? 1.4 : 1);
    if (amount > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.min(0.55, amount * 0.42);
      const pattern = ctx.createPattern(getNoise(), 'repeat');
      const scale = Math.max(1, k / 6);
      pattern.setTransform && pattern.setTransform(new DOMMatrix().scale(scale, scale));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, W, H);
      // gentle uneven lighting toward the edges
      ctx.globalAlpha = Math.min(0.25, amount * 0.18);
      const g = ctx.createRadialGradient(W * 0.45, H * 0.4, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(150,135,110,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ---------- ink ----------
  const measureCache = new Map();
  function prefixWidths(ctx, fontKey, word) {
    const key = fontKey + '\u0000' + word;
    let v = measureCache.get(key);
    if (!v) {
      const chars = Array.from(word);
      v = { chars, x: [] };
      let prefix = '';
      for (const ch of chars) { v.x.push(ctx.measureText(prefix).width); prefix += ch; }
      if (measureCache.size > 20000) measureCache.clear();
      measureCache.set(key, v);
    }
    return v;
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x1b3a9e;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * Draw one line of handwriting.
   * o: { ctx, k, font, sizeMm, baseY, startX, leftRef, seed:[...], mv, vr, fl, pencil, rgb }
   * line: { words:[{text,width,bold}], spaceWidth, marker, heading }
   * Returns the x (mm) where the line ended.
   */
  function drawLine(line, o) {
    const { ctx, k, sizeMm, mv, vr, fl, pencil } = o;
    const rand = mulberry32(seedOf(...o.seed, 17));
    const px = sizeMm * k;
    const fontCss = `${px}px "${o.font.family}", "Comic Sans MS", cursive`;
    ctx.font = fontCss;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = o.rgb;
    ctx.strokeStyle = o.rgb;
    ctx.lineJoin = 'round';

    // Natural movement: the line slopes and its baseline wobbles a little.
    const slope = range(rand, -1, 1) * 0.008 * mv;
    const wobAmp = 0.35 * mv;
    const wobFreq = range(rand, 0.025, 0.06);
    const wobPhase = rand() * 6.28;
    const pressPhase = rand() * 6.28;
    const yAt = (x) => o.baseY + slope * (x - o.leftRef) + wobAmp * Math.sin(x * wobFreq * 6.28 / 6 + wobPhase);
    const boldWidth = Math.max(0.12, sizeMm * 0.038) * k;

    const glyph = (ch, xMm, yMm, rnd, bold) => {
      const rot = range(rnd, -0.06, 0.06) * vr;
      const sc = 1 + range(rnd, -0.07, 0.07) * vr;
      const skew = range(rnd, -0.08, 0.08) * vr;
      const dy = range(rnd, -0.22, 0.22) * vr;
      // Inkflow: pressure rises and falls smoothly along the line, plus a little noise per stroke.
      const pressure = 0.5 + 0.5 * Math.sin(xMm * 0.09 + pressPhase);
      const alpha = 1 - fl * (0.32 * (1 - pressure) + 0.1 * rnd());
      ctx.save();
      ctx.translate(xMm * k, (yMm + dy) * k);
      ctx.transform(sc, 0, skew, sc * (1 + range(rnd, -0.04, 0.04) * vr), 0, 0);
      ctx.rotate(rot);
      ctx.globalAlpha = Math.max(0.35, Math.min(1, bold ? alpha + 0.12 : alpha));
      ctx.fillText(ch, 0, 0);
      if (bold) {
        // Bold = pressing harder and going over the letter again.
        ctx.lineWidth = boldWidth;
        ctx.strokeText(ch, 0, 0);
      } else if (fl > 0 && !pencil) {
        // Pressing a little harder leaves a slightly fuller stroke. It fades in and out
        // smoothly along the line so it never looks like a different pen.
        const extra = Math.max(0, (pressure - 0.55) / 0.45);
        if (extra > 0.05) {
          ctx.globalAlpha *= 0.15 * fl * extra;
          ctx.fillText(ch, 0.035 * k, 0.02 * k);
        }
      }
      ctx.restore();
    };

    // List marker sits in the hanging indent.
    if (line.marker) {
      const mrand = mulberry32(seedOf(...o.seed, 99));
      const mx = o.markerX + range(mrand, -0.3, 0.5) * mv;
      if (line.marker === '\u2022') {
        // A hand-made dot reads better than most fonts' tiny bullet glyph.
        const rad = sizeMm * range(mrand, 0.075, 0.095);
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.ellipse((mx + 1.4) * k, (yAt(mx) - sizeMm * 0.2) * k, rad * k, rad * 0.85 * k, mrand() * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const pw = prefixWidths(ctx, fontCss, line.marker);
        pw.chars.forEach((ch, ci) => glyph(ch, mx + pw.x[ci] / k, yAt(mx), mrand, false));
      }
    }

    let x = o.startX;
    line.words.forEach((word, wi) => {
      const wrand = mulberry32(seedOf(...o.seed, wi + 1000));
      const wordDy = range(wrand, -0.25, 0.25) * mv;
      const pw = prefixWidths(ctx, fontCss, word.text);
      pw.chars.forEach((ch, ci) => {
        const gx = x + pw.x[ci] / k;
        const bold = Array.isArray(word.bold) ? !!word.bold[ci] : !!word.bold;
        glyph(ch, gx, yAt(gx) + wordDy, wrand, bold);
      });
      x += word.width + line.spaceWidth * (1 + range(wrand, -0.28, 0.28) * mv);
    });
    const endX = line.words.length ? x - line.spaceWidth : x;

    // Hand-drawn underline for main headings.
    if (line.heading === 1 && line.words.length) {
      const urand = mulberry32(seedOf(...o.seed, 555));
      const x0 = o.startX - 0.5, x1 = endX + 1;
      ctx.save();
      ctx.lineWidth = Math.max(0.25, sizeMm * 0.045) * k;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const steps = 12;
      for (let t = 0; t <= steps; t++) {
        const ux = x0 + (x1 - x0) * (t / steps);
        const uy = yAt(ux) + sizeMm * 0.11 + range(urand, -0.15, 0.15) * (0.3 + mv) + (t / steps) * range(urand, -0.2, 0.4) * mv;
        if (t === 0) ctx.moveTo(ux * k, uy * k); else ctx.lineTo(ux * k, uy * k);
      }
      ctx.stroke();
      ctx.restore();
    }
    return endX;
  }

  /** Build a simple one-line "line" object from plain text, measured with ctx. */
  function textLine(ctx, text, sizeMm, k, family) {
    ctx.font = `${sizeMm * k}px "${family}", "Comic Sans MS", cursive`;
    const words = String(text).split(/\s+/).filter(Boolean).map((w) => ({ text: w, width: ctx.measureText(w).width / k, bold: false }));
    const spaceWidth = Math.max(ctx.measureText(' ').width / k, sizeMm * 0.33);
    const width = words.reduce((n, w) => n + w.width, 0) + spaceWidth * Math.max(0, words.length - 1);
    return { words, spaceWidth, width, marker: null, heading: 0 };
  }

  function drawInk(ctx, page, pageIndex, s, geo, font, extras) {
    const { k, margins, lineSpacing } = geo;
    const base = {
      ctx, k, font,
      mv: s.movement / 100,
      vr: (s.variation / 100) * (font.cursive ? 0.35 : 1),
      fl: s.inkflow / 100,
      pencil: s.ink === 'pencil',
      rgb: (() => { const [r, g, b] = hexToRgb(s.inkColor); return `rgb(${r}, ${g}, ${b})`; })(),
      leftRef: margins.left,
    };

    page.forEach((line, i) => {
      if (!line.words.length && !line.marker) return;
      const rand = mulberry32(seedOf(pageIndex, i, 3));
      const drift = Math.sin(pageIndex * 1.7 + i * 0.33) * 1.1 * base.mv; // the hand drifts down the page
      drawLine(line, {
        ...base,
        sizeMm: geo.fontSizeMm * line.scale,
        baseY: margins.top + (i + 1) * lineSpacing - lineSpacing * 0.2,
        startX: margins.left + line.indent + drift + range(rand, -0.6, 1.4) * base.mv,
        markerX: margins.left + drift,
        seed: [pageIndex, i],
      });
    });

    if (extras && extras.header) drawHeader(extras.header, pageIndex, geo, base);
    if (extras && extras.pageNumber) {
      const size = geo.fontSizeMm * 0.85;
      const tl = textLine(ctx, `Page ${pageIndex + 1}`, size, k, font.family);
      const y = geo.pageH - Math.max(3.5, Math.min(margins.bottom * 0.45, 10));
      drawLine(tl, { ...base, sizeMm: size, baseY: y, startX: geo.pageW - margins.right - tl.width, seed: [pageIndex, 9001] });
    }
  }

  /** Name / roll no. / subject / date written in the top margin. */
  function drawHeader(h, pageIndex, geo, base) {
    const { ctx, k, font } = base;
    const { margins, lineSpacing, pageW } = geo;
    const fields = [['Name', h.name], ['Roll No.', h.roll], ['Subject', h.subject]].filter(([, v]) => v && v.trim());
    const date = h.date && h.date.trim() ? `Date: ${h.date.trim()}` : '';
    if (!fields.length && !date) return;

    const avail = pageW - margins.left - margins.right;
    const gap = 6;
    let size = geo.fontSizeMm * 0.92;
    const build = (sz) => ({
      parts: fields.map(([label, v]) => textLine(ctx, `${label}: ${v.trim()}`, sz, k, font.family)),
      date: date ? textLine(ctx, date, sz, k, font.family) : null,
    });
    let b = build(size);
    const widthOf = (parts) => parts.reduce((n, p) => n + p.width, 0) + gap * Math.max(0, parts.length - 1);
    const oneLine = () => widthOf(b.parts) + (b.date ? b.date.width + gap : 0) <= avail;

    const y2 = Math.max(lineSpacing * 0.75, margins.top - lineSpacing * 0.3); // just above the first ruled line
    const y1 = y2 - lineSpacing * 0.95;
    let rows;
    if (oneLine()) rows = [{ parts: b.parts, date: b.date, y: y2 }];
    else if (y1 >= size * 0.9 && b.parts.length > 1) {
      // Two rows: name + roll no. on top, subject + date below.
      const top = b.parts.slice(0, Math.ceil(b.parts.length / 2));
      const bottom = b.parts.slice(top.length);
      rows = [{ parts: top, date: null, y: y1 }, { parts: bottom, date: b.date, y: y2 }];
    } else {
      // Not enough room: shrink to fit one line.
      const total = widthOf(b.parts) + (b.date ? b.date.width + gap : 0);
      size *= Math.max(0.55, avail / total);
      b = build(size);
      rows = [{ parts: b.parts, date: b.date, y: y2 }];
    }

    rows.forEach((row, ri) => {
      let x = margins.left;
      row.parts.forEach((p, pi) => {
        drawLine(p, { ...base, sizeMm: size, baseY: row.y, startX: x, seed: [pageIndex, 8000 + ri * 10 + pi] });
        x += p.width + gap;
      });
      if (row.date) {
        drawLine(row.date, { ...base, sizeMm: size, baseY: row.y, startX: pageW - margins.right - row.date.width, seed: [pageIndex, 8100 + ri] });
      }
    });
  }

  /**
   * Render one page onto `canvas`.
   * geo: { k (px per mm), pageW, pageH, margins, lineSpacing, fontSizeMm }
   * font: { family, cursive }
   */
  let inkCanvas = null;
  function renderPage(canvas, page, pageIndex, s, geo, font, extras) {
    const W = Math.round(geo.pageW * geo.k), H = Math.round(geo.pageH * geo.k);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawPaper(ctx, s, geo);

    // One shared ink layer, resized as needed, so we don't allocate a canvas per page.
    if (!inkCanvas) inkCanvas = document.createElement('canvas');
    if (inkCanvas.width !== W || inkCanvas.height !== H) { inkCanvas.width = W; inkCanvas.height = H; }
    const ink = inkCanvas.getContext('2d');
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalAlpha = 1;
    ink.globalCompositeOperation = 'source-over';
    ink.clearRect(0, 0, W, H);
    drawInk(ink, page, pageIndex, s, geo, font, extras);

    // Pen grain: rub a little ink away using the noise texture.
    const grain = (s.inkflow / 100) * (s.ink === 'pencil' ? 1.3 : 1);
    if (grain > 0) {
      ink.save();
      ink.globalCompositeOperation = 'destination-out';
      ink.globalAlpha = Math.min(0.6, grain * 0.3);
      const pat = ink.createPattern(getNoise(), 'repeat');
      const sc = Math.max(0.5, geo.k / 12);
      if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(sc, sc).rotateSelf(0, 0, 17));
      ink.fillStyle = pat;
      ink.fillRect(0, 0, W, H);
      ink.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(inkCanvas, 0, 0);
    ctx.restore();
  }

  /** Free the shared ink layer (e.g. after a big export). */
  function releaseMemory() { if (inkCanvas) { inkCanvas.width = 1; inkCanvas.height = 1; } }

  HT.Render = { renderPage, releaseMemory, mulberry32, seedOf };
})(typeof window !== 'undefined' ? window : globalThis);
