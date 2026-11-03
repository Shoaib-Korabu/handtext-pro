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
  /**
   * s.output decides what goes on the page:
   *   'digital' — full paper look (colour, ruling, texture) for screens / online submission
   *   'white'   — ruling + ink on pure white: for printing on plain white paper
   *   'ink'     — ink only: for printing onto real ruled notebook paper
   * opts.noFill draws only the ruling (used by Print check to draw real notebook paper).
   */
  function drawPaper(ctx, s, geo, opts) {
    const { k, pageW, pageH, margins, lineSpacing } = geo;
    const paper = HT.PAPERS.find((p) => p.id === s.paper) || HT.PAPERS[0];
    const W = pageW * k, H = pageH * k;
    const output = s.output || 'digital';

    if (!(opts && opts.noFill)) {
      ctx.fillStyle = output === 'digital' ? paper.bg : '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
    if (output === 'ink') return; // the real paper already has its lines

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
      case 'wide':
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

    // Texture: grain + soft blotches, multiplied onto the paper (screen output only —
    // printed, it would come out as grey smudges on real paper).
    const amount = output === 'digital' ? s.texture / 100 * (paper.id === 'cardstock' ? 1.4 : 1) : 0;
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

  // ---------- letter shape variation ----------
  // Each letter is drawn once into a small canvas and then gently warped: rows are
  // shifted and stretched, columns are raised and squashed, all along smooth curves.
  // That bends loops, tails and bowls so the same letter really changes shape.
  // A handful of variants per letter are cached and picked at random.
  const SHAPE_VARIANTS = 6;
  const spriteCache = new Map();
  let scratch = null;

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  function glyphSprite(ch, fontCss, px, bold, boldWidth, rgb, variant, amount) {
    const key = `${fontCss}|${ch}|${bold ? 1 : 0}|${rgb}|${variant}|${amount.toFixed(2)}`;
    let spr = spriteCache.get(key);
    if (spr !== undefined) return spr;
    if (!scratch) scratch = document.createElement('canvas').getContext('2d');
    // Small letters are built at 2x and scaled down, which keeps the warped strokes crisp.
    const ss = px < 90 ? 2 : 1;
    const fontSS = ss === 1 ? fontCss : fontCss.replace(/^[\d.]+px/, `${px * ss}px`);
    px *= ss;
    boldWidth *= ss;
    scratch.font = fontSS;
    const m = scratch.measureText(ch);
    const left = Math.ceil(m.actualBoundingBoxLeft || 0);
    const right = Math.ceil(m.actualBoundingBoxRight || 0);
    const asc = Math.ceil(m.actualBoundingBoxAscent || 0);
    const desc = Math.ceil(m.actualBoundingBoxDescent || 0);
    if (left + right <= 0 || asc + desc <= 0) { spriteCache.set(key, null); return null; }
    const pad = Math.ceil(px * 0.14 + boldWidth + 2);
    const w = left + right + pad * 2;
    const h = asc + desc + pad * 2;

    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const s = src.getContext('2d');
    s.font = fontSS;
    s.fillStyle = rgb;
    s.strokeStyle = rgb;
    s.lineJoin = 'round';
    s.textBaseline = 'alphabetic';
    s.fillText(ch, pad + left, pad + asc);
    if (bold) { s.lineWidth = boldWidth; s.strokeText(ch, pad + left, pad + asc); }

    const r = mulberry32(seedOf(hashStr(ch), variant, 7919));
    const amp = amount * px * 0.05;
    // pass 1: each row slides sideways and gets a little wider or narrower
    const mid = h / 2;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext('2d');
    const f1 = range(r, 0.6, 1.4), p1 = r() * 6.28, shear = range(r, -1, 1);
    const f3 = range(r, 0.5, 1.2), p3 = r() * 6.28, bulge = amount * 0.09;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const dx = amp * (Math.sin(6.283 * v * f1 + p1) * 0.7 + shear * (v - 0.5) * 0.8);
      const sx = 1 + bulge * Math.sin(6.283 * v * f3 + p3);
      t.drawImage(src, 0, y, w, 1, w / 2 - (w / 2) * sx + dx, y, w * sx, 1);
    }
    // pass 2: each column rises or sinks and gets a little taller or shorter (around the baseline)
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const o = out.getContext('2d');
    const f2 = range(r, 0.5, 1.3), p2 = r() * 6.28;
    const f4 = range(r, 0.4, 1.0), p4 = r() * 6.28, stretch = amount * 0.08;
    const base = pad + asc;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const dy = amp * 0.75 * Math.sin(6.283 * u * f2 + p2);
      const sy = 1 + stretch * Math.sin(6.283 * u * f4 + p4);
      o.drawImage(tmp, x, 0, 1, h, x, base - base * sy + dy, 1, h * sy);
    }
    // Resampling softens edges; firm the ink back up so warped letters match normal ones.
    const img = o.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (a) d[i] = Math.min(255, Math.round(255 * Math.pow(a / 255, 0.7)));
    }
    o.putImageData(img, 0, 0);
    spr = { canvas: out, ox: (pad + left) / ss, oy: (pad + asc) / ss, w: w / ss, h: h / ss };
    if (spriteCache.size > 5000) spriteCache.clear();
    spriteCache.set(key, spr);
    return spr;
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x1b3a9e;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** Letter positions (mm, from the word's start) and widths; super/subscripts are smaller. */
  function charLayout(ctx, fontCss, word, k, scriptScale) {
    const chars = Array.from(word.text);
    const xs = [], ws = [];
    if (!word.script) {
      const pw = prefixWidths(ctx, fontCss, word.text);
      chars.forEach((_, i) => xs.push(pw.x[i] / k));
      chars.forEach((_, i) => ws.push((i < chars.length - 1 ? xs[i + 1] : word.width) - xs[i]));
    } else {
      let x = 0;
      chars.forEach((ch, i) => {
        const w = (ctx.measureText(ch).width / k) * (word.script[i] ? scriptScale : 1);
        xs.push(x); ws.push(w); x += w;
      });
    }
    return { chars, x: xs, w: ws };
  }

  function hashId(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  /** A slightly wobbly pen line through points given in mm. */
  function penPath(ctx, pts, k, rand, wob) {
    ctx.beginPath();
    pts.forEach(([px, py], i) => {
      const jx = i && i < pts.length - 1 ? range(rand, -wob, wob) : 0;
      const jy = i && i < pts.length - 1 ? range(rand, -wob, wob) : 0;
      if (i === 0) ctx.moveTo((px + jx) * k, (py + jy) * k); else ctx.lineTo((px + jx) * k, (py + jy) * k);
    });
    ctx.stroke();
  }

  const HIGHLIGHT = { hl: '#ffe14d', 'hl-green': '#83e68f', 'hl-pink': '#ff94cc', 'hl-blue': '#86cdff' };

  /** Hand-drawn marks: highlights, underlines, circles, boxes, strike-through, crosses. */
  function drawMark(ctx, r, id, o) {
    const { k, sizeMm: s, yAt, mv } = o;
    const rand = mulberry32(seedOf(...o.seed, hashId(id)));
    const x0 = r.x0, x1 = r.x1, mid = (x0 + x1) / 2;
    const base = yAt(mid);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = o.rgb;
    ctx.lineWidth = Math.max(0.2, s * 0.045) * k;
    ctx.globalAlpha = 0.9;
    const wob = s * 0.025 * (0.6 + mv);
    const line = (y0, y1, n = 10, xa = x0, xb = x1) => {
      const pts = [];
      for (let t = 0; t <= n; t++) pts.push([xa + (xb - xa) * (t / n), y0 + (y1 - y0) * (t / n)]);
      penPath(ctx, pts, k, rand, wob);
    };
    switch (r.tag) {
      case 'hl': case 'hl-green': case 'hl-pink': case 'hl-blue': {
        // A chisel highlighter: a translucent band, a bit uneven, drawn in two passes.
        ctx.fillStyle = HIGHLIGHT[r.tag];
        const top = -s * 0.62, bot = s * 0.14;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass ? 0.22 : 0.42;
          const dy = range(rand, -s * 0.05, s * 0.05);
          const a = x0 - range(rand, 0.4, 1.0), b = x1 + range(rand, 0.4, 1.0);
          ctx.beginPath();
          ctx.moveTo(a * k, (yAt(a) + top + dy + range(rand, -0.2, 0.2)) * k);
          ctx.lineTo(b * k, (yAt(b) + top + dy + range(rand, -0.3, 0.3)) * k);
          ctx.lineTo((b + range(rand, -0.3, 0.3)) * k, (yAt(b) + bot + dy) * k);
          ctx.lineTo((a + range(rand, -0.3, 0.3)) * k, (yAt(a) + bot + dy) * k);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'u': line(yAt(x0) + s * 0.14, yAt(x1) + s * 0.14 + range(rand, -0.2, 0.3)); break;
      case 'uu':
        line(yAt(x0) + s * 0.12, yAt(x1) + s * 0.12);
        line(yAt(x0) + s * 0.26, yAt(x1) + s * 0.24, 10, x0 + 0.3, x1 - 0.2);
        break;
      case 'wavy': {
        const pts = [];
        const wl = s * 0.42, n = Math.max(6, Math.ceil(((x1 - x0) / wl) * 6));
        for (let t = 0; t <= n; t++) {
          const px = x0 + (x1 - x0) * (t / n);
          pts.push([px, yAt(px) + s * 0.17 + Math.sin((px - x0) / wl * 6.283) * s * 0.06]);
        }
        penPath(ctx, pts, k, rand, wob * 0.3);
        break;
      }
      case 'strike': line(yAt(x0) - s * 0.27, yAt(x1) - s * 0.3, 8, x0 - 0.4, x1 + 0.4); break;
      case 'cross':
        // "Mark with X": two firm diagonal strokes across the word(s).
        ctx.lineWidth *= 1.15;
        line(base - s * 0.9, base + s * 0.25, 6, x0 - 0.5, x1 + 0.5);
        line(base + s * 0.22, base - s * 0.86, 6, x0 - 0.4, x1 + 0.6);
        break;
      case 'circle': {
        const rx = (x1 - x0) / 2 + s * 0.38, ry = s * 0.62, cy = base - s * 0.28;
        const a0 = range(rand, -2.6, -1.8), turn = 6.283 * range(rand, 1.04, 1.12);
        const pts = [];
        for (let t = 0; t <= 36; t++) {
          const a = a0 + turn * (t / 36);
          const grow = 1 + 0.06 * (t / 36) + range(rand, -0.015, 0.015);
          pts.push([mid + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow]);
        }
        penPath(ctx, pts, k, rand, wob * 0.2);
        break;
      }
      case 'box': {
        const l = x0 - s * 0.28, rr = x1 + s * 0.28, t = base - s * 0.85, b = base + s * 0.28, ov = s * 0.12;
        line(t, t + range(rand, -0.2, 0.2), 6, l - ov, rr + ov * 0.5);
        line(t - ov * 0.5, b + ov, 4, rr, rr + range(rand, -0.2, 0.2));
        line(b, b + range(rand, -0.2, 0.2), 6, rr + ov * 0.6, l - ov * 0.4);
        line(b + ov * 0.4, t - ov, 4, l, l + range(rand, -0.2, 0.2));
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  /** Hand-ruled table grid for one line slot. */
  function drawTableGrid(ctx, t, o) {
    const { k, left, top, bottom, rgb, mv, tableSeed, nextSame } = o;
    const total = t.cols.reduce((a, c) => a + c.w, 0);
    ctx.save();
    ctx.strokeStyle = rgb;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.18, 0.22) * k;
    ctx.globalAlpha = 0.85;
    const colX = (ci) => {
      const r = mulberry32(seedOf(tableSeed, ci, 41));
      return left + (ci < t.cols.length ? t.cols[ci].x : total) + range(r, -0.35, 0.35) * (0.4 + mv);
    };
    const rnd = mulberry32(seedOf(tableSeed, Math.round(top * 10), 43));
    const hline = (y) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push([colX(0) + (colX(t.cols.length) - colX(0)) * (i / 12), y + range(rnd, -0.15, 0.15) * (0.3 + mv)]);
      penPath(ctx, pts, k, rnd, 0.05);
    };
    if (t.rowStart) hline(top);
    if (t.rowEnd && (t.last || !nextSame)) hline(bottom);
    for (let ci = 0; ci <= t.cols.length; ci++) {
      const xx = colX(ci);
      penPath(ctx, [[xx, top], [xx + range(rnd, -0.08, 0.08), (top + bottom) / 2], [xx, bottom]], k, rnd, 0);
    }
    ctx.restore();
  }

  /**
   * Draw one line of handwriting.
   * o: { ctx, k, font, sizeMm, baseY, startX, leftRef, seed:[...], mv, vr, fl, pencil, rgb }
   * line: { words:[{text,width,bold}], spaceWidth, marker, heading }
   * Returns the x (mm) where the line ended.
   */
  function drawLine(line, o) {
    const { ctx, k, sizeMm, fl, pencil } = o;
    // Tiredness: further down the page the hand moves faster and gets looser —
    // bigger wobble, more lean, taller letters and slightly lighter ink.
    const tired = o.fatigue || 0;
    const mv = Math.min(1.7, o.mv * (1 + 0.7 * tired) + 0.35 * tired);
    const vr = o.vr * (1 + 0.8 * tired) + 0.3 * tired * (o.font.cursive ? 0.35 : 1);
    const lean = -0.09 * tired;
    const tall = 1 + 0.08 * tired;
    const shapeAmt = Math.round((o.shape || 0) * (1 + 0.5 * tired) * 20) / 20 * (o.font.cursive ? 0.45 : 1);
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

    const glyph = (ch, xMm, yMm, rnd, bold, gs = 1) => {
      const rot = range(rnd, -0.06, 0.06) * vr;
      const sc = (1 + range(rnd, -0.07, 0.07) * vr) * gs;
      const skew = range(rnd, -0.08, 0.08) * vr;
      const dy = range(rnd, -0.22, 0.22) * vr;
      // Inkflow: pressure rises and falls smoothly along the line, plus a little noise per stroke.
      const pressure = 0.5 + 0.5 * Math.sin(xMm * 0.09 + pressPhase);
      const alpha = (1 - fl * (0.32 * (1 - pressure) + 0.1 * rnd())) * (1 - 0.1 * tired);
      const spr = shapeAmt > 0 ? glyphSprite(ch, fontCss, px, bold, boldWidth, o.rgb, Math.floor(rnd() * SHAPE_VARIANTS), shapeAmt) : undefined;
      if (spr === null) return; // nothing visible to draw
      ctx.save();
      ctx.translate(xMm * k, (yMm + dy) * k);
      ctx.transform(sc, 0, skew + lean, sc * tall * (1 + range(rnd, -0.04, 0.04) * vr), 0, 0);
      ctx.rotate(rot);
      ctx.globalAlpha = Math.max(0.35, Math.min(1, bold ? alpha + 0.12 : alpha));
      if (spr) {
        // Warped letter (already includes the bold stroke).
        ctx.drawImage(spr.canvas, -spr.ox, -spr.oy, spr.w, spr.h);
        if (fl > 0 && !pencil && !bold) {
          const extra = Math.max(0, (pressure - 0.55) / 0.45);
          if (extra > 0.05) {
            ctx.globalAlpha *= 0.15 * fl * extra;
            ctx.drawImage(spr.canvas, -spr.ox + 0.035 * k, -spr.oy + 0.02 * k, spr.w, spr.h);
          }
        }
        ctx.restore();
        return;
      }
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

    // Work out where every letter goes first, so highlights can sit underneath the writing.
    const SCRIPT = 0.65;
    const runs = new Map(); // mark id -> { tag, x0, x1 }
    let x = o.startX;
    const placed = line.words.map((word, wi) => {
      const wrand = mulberry32(seedOf(...o.seed, wi + 1000));
      const wordDy = range(wrand, -0.25, 0.25) * mv;
      const cl = charLayout(ctx, fontCss, word, k, SCRIPT);
      if (word.marks) {
        cl.chars.forEach((ch, ci) => {
          const id = word.marks[ci];
          if (!id) return;
          const r = runs.get(id) || { tag: id.split('#')[0], x0: Infinity, x1: -Infinity };
          r.x0 = Math.min(r.x0, x + cl.x[ci]);
          r.x1 = Math.max(r.x1, x + cl.x[ci] + cl.w[ci]);
          runs.set(id, r);
        });
      }
      const item = { word, wrand, wordDy, x0: x, cl };
      x += word.width + line.spaceWidth * (1 + range(wrand, -0.28, 0.28) * mv);
      return item;
    });
    const endX = line.words.length ? x - line.spaceWidth : x;

    runs.forEach((r, id) => { if (r.tag.startsWith('hl')) drawMark(ctx, r, id, { ...o, sizeMm, yAt, mv }); });

    for (const { word, wrand, wordDy, x0, cl } of placed) {
      cl.chars.forEach((ch, ci) => {
        const gx = x0 + cl.x[ci];
        const sc = word.script ? word.script[ci] : 0;
        const gy = yAt(gx) + wordDy + (sc === 1 ? -sizeMm * 0.36 : sc === -1 ? sizeMm * 0.16 : 0);
        const bold = Array.isArray(word.bold) ? !!word.bold[ci] : !!word.bold;
        glyph(ch, gx, gy, wrand, bold, sc ? SCRIPT : 1);
      });
    }

    runs.forEach((r, id) => { if (!r.tag.startsWith('hl')) drawMark(ctx, r, id, { ...o, sizeMm, yAt, mv }); });

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
      shape: s.letterShape ? 0.35 + 0.65 * (s.variation / 100) : 0,
    };
    const lpp = Math.max(2, geo.linesPerPage || page.length || 2);
    const docT = geo.pageCount > 1 ? pageIndex / (geo.pageCount - 1) : 0;

    const step = geo.lineStep || 1; // write on every 1st, 2nd or 3rd ruled line
    page.forEach((line, i) => {
      const rand = mulberry32(seedOf(pageIndex, i, 3));
      const drift = Math.sin(pageIndex * 1.7 + i * 0.33) * 1.1 * base.mv; // the hand drifts down the page
      const fatigue = s.fatigue ? Math.min(1, 0.8 * Math.pow(i / (lpp - 1), 1.4) + 0.2 * docT) : 0;
      const baseY = margins.top + (i + 1) * lineSpacing * step - lineSpacing * 0.2;
      if (line.table) {
        const t = line.table;
        const top = margins.top + i * lineSpacing * step, bottom = top + lineSpacing * step;
        const next = page[i + 1];
        drawTableGrid(ctx, t, { k, left: margins.left, top, bottom, rgb: base.rgb, mv: base.mv, tableSeed: seedOf(pageIndex, t.id), nextSame: !!(next && next.table && next.table.id === t.id) });
        t.cells.forEach((words, ci) => {
          if (!words.length) return;
          drawLine({ words, spaceWidth: line.spaceWidth, marker: null, heading: 0 }, {
            ...base,
            sizeMm: geo.fontSizeMm,
            baseY,
            startX: margins.left + t.cols[ci].x + t.pad + range(rand, -0.2, 0.4) * base.mv,
            seed: [pageIndex, i, ci + 50],
            fatigue,
          });
        });
        return;
      }
      if (!line.words.length && !line.marker) return;
      drawLine(line, {
        ...base,
        sizeMm: geo.fontSizeMm * line.scale,
        baseY,
        startX: margins.left + line.indent + drift + range(rand, -0.6, 1.4) * base.mv,
        markerX: margins.left + drift,
        seed: [pageIndex, i],
        fatigue,
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
    const transparent = !!(extras && extras.transparent); // PNG with only the writing
    if (transparent) ctx.clearRect(0, 0, W, H);
    else drawPaper(ctx, s, geo);

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
    ctx.globalCompositeOperation = transparent ? 'source-over' : 'multiply';
    ctx.drawImage(inkCanvas, 0, 0);
    ctx.restore();
  }

  /** Free the shared ink layer (e.g. after a big export). */
  function releaseMemory() { if (inkCanvas) { inkCanvas.width = 1; inkCanvas.height = 1; } }

  HT.Render = { renderPage, drawPaper, releaseMemory, mulberry32, seedOf, getNoise };
})(typeof window !== 'undefined' ? window : globalThis);
