/* HandText Pro — Print check: shows how a page will really look once printed.
 *
 * It models what happens at a print shop:
 *   - the printer can't print the outer few millimetres of the sheet (unprintable margin)
 *   - "Actual size" cuts that edge off; "Fit to printable area" shrinks the page instead
 *   - black & white printers turn every colour into grey toner (light tints become speckle)
 *   - toner/ink spreads a little (dot gain) and sits on real paper with its own colour and fibres
 * Everything happens in the browser on a canvas. Works for the handwritten pages
 * and for any PDF or image you open.
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  const PRINTERS = [
    { id: 'bw-laser',     label: 'Black & white laser (most print shops)', color: false, gain: 1.28, speckle: 0.9, blur: 0.42 },
    { id: 'color-laser',  label: 'Colour laser',                             color: true,  gain: 1.12, speckle: 0.6, blur: 0.38, sat: 0.9 },
    { id: 'color-inkjet', label: 'Colour inkjet',                            color: true,  gain: 1.18, speckle: 0.15, blur: 0.65, sat: 0.86 },
    { id: 'bw-inkjet',    label: 'Black & white inkjet',                     color: false, gain: 1.2,  speckle: 0.2, blur: 0.6 },
  ];
  const PAPERS = [
    { id: 'white',    label: 'Plain white copier paper (70\u201375 GSM)', base: [249, 249, 246], fibre: 7 },
    { id: 'bright',   label: 'Bright white paper (80+ GSM)',         base: [253, 253, 252], fibre: 3 },
    { id: 'recycled', label: 'Recycled / off-white paper',           base: [241, 237, 226], fibre: 12 },
    { id: 'ruled',    label: 'Ruled notebook / assignment paper',    base: [251, 250, 245], fibre: 6, ruled: true },
  ];
  const SHEETS = [
    { id: 'auto',   label: 'Same as document' },
    { id: 'a4',     label: 'A4 (210 \u00D7 297 mm)',     w: 210,   h: 297 },
    { id: 'letter', label: 'Letter (8.5 \u00D7 11 in)',  w: 215.9, h: 279.4 },
    { id: 'legal',  label: 'Legal (8.5 \u00D7 14 in)',   w: 215.9, h: 355.6 },
    { id: 'a5',     label: 'A5 (148 \u00D7 210 mm)',     w: 148,   h: 210 },
  ];
  const SCALINGS = [
    { id: 'actual', label: 'Actual size (100%)' },
    { id: 'fit',    label: 'Fit to printable area' },
    { id: 'custom', label: 'Custom scale' },
  ];

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /** Where the page lands on the sheet, in mm. */
  function placement(srcMm, sheetMm, o) {
    const m = clamp(+o.margin || 0, 0, 30);
    const pad = clamp(+o.padding || 0, 0, 50);
    const inner = { x: m + pad, y: m + pad, w: Math.max(10, sheetMm.w - 2 * (m + pad)), h: Math.max(10, sheetMm.h - 2 * (m + pad)) };
    let s = 1;
    if (o.scaling === 'fit') s = Math.min(inner.w / srcMm.w, inner.h / srcMm.h);
    else if (o.scaling === 'custom') s = clamp(+o.scale || 100, 10, 400) / 100;
    const w = srcMm.w * s, h = srcMm.h * s;
    return {
      scale: s,
      printable: { x: m, y: m, w: sheetMm.w - 2 * m, h: sheetMm.h - 2 * m },
      inner,
      page: { x: (sheetMm.w - w) / 2, y: (sheetMm.h - h) / 2, w, h },
    };
  }

  /** Plain-English summary of what the printer will do. */
  function describe(srcMm, sheetMm, o) {
    const p = placement(srcMm, sheetMm, o);
    const pct = Math.round(p.scale * 1000) / 10;
    const cutL = Math.max(0, p.inner.x - p.page.x), cutT = Math.max(0, p.inner.y - p.page.y);
    const cutR = Math.max(0, p.page.x + p.page.w - (p.inner.x + p.inner.w));
    const cutB = Math.max(0, p.page.y + p.page.h - (p.inner.y + p.inner.h));
    const cut = Math.max(cutL, cutT, cutR, cutB);
    const parts = [];
    parts.push(pct === 100 ? 'Printed at 100% (actual size).' : `Printed at ${pct}% of the original size.`);
    if (cut > 0.3) parts.push(`About ${cut.toFixed(1)} mm of the page edge is cut off and comes out as a white border.`);
    else {
      const border = Math.min(p.page.x, p.page.y);
      if (border > 0.5) parts.push(`Nothing is cut off; there is a white border of about ${border.toFixed(1)} mm.`);
    }
    if (Math.abs(srcMm.w - sheetMm.w) > 2 || Math.abs(srcMm.h - sheetMm.h) > 2) parts.push('The page and the sheet are different sizes.');
    return { text: parts.join(' '), cut, placement: p };
  }

  // Fast deterministic per-pixel noise (0..1).
  function hash2(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  let mottleData = null; // 256x256 soft noise, reused
  function mottle() {
    if (mottleData) return mottleData;
    const c = HT.Render.getNoise();
    mottleData = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return mottleData;
  }

  /**
   * Simulate printing `src` (a canvas or image) of physical size srcMm onto a sheet.
   * o: { printer, paper, scaling, scale, margin, padding, density, ruling }
   * ruling (optional): { settings, margins, lineSpacing } to draw real notebook lines on the paper.
   * Returns a new canvas at `dpi`.
   */
  function simulate(src, srcMm, sheetMm, o, dpi) {
    const printer = PRINTERS.find((p) => p.id === o.printer) || PRINTERS[0];
    const paper = PAPERS.find((p) => p.id === o.paper) || PAPERS[0];
    const k = dpi / 25.4;
    const W = Math.round(sheetMm.w * k), H = Math.round(sheetMm.h * k);
    const pl = placement(srcMm, sheetMm, o);

    // 1. What the printer is asked to print: the page, clipped to where it physically can print.
    const job = document.createElement('canvas');
    job.width = W; job.height = H;
    const jc = job.getContext('2d');
    jc.fillStyle = '#fff';
    jc.fillRect(0, 0, W, H);
    jc.save();
    jc.beginPath();
    jc.rect(pl.inner.x * k, pl.inner.y * k, pl.inner.w * k, pl.inner.h * k);
    jc.clip();
    jc.imageSmoothingQuality = 'high';
    jc.drawImage(src, pl.page.x * k, pl.page.y * k, pl.page.w * k, pl.page.h * k);
    jc.restore();

    // Toner/ink spreads slightly into the paper.
    const blur = printer.blur * (dpi / 300);
    let jobData;
    if (blur > 0.2 && 'filter' in jc) {
      const spread = document.createElement('canvas');
      spread.width = W; spread.height = H;
      const sc = spread.getContext('2d');
      sc.filter = `blur(${blur.toFixed(2)}px)`;
      sc.drawImage(job, 0, 0);
      jobData = sc.getImageData(0, 0, W, H).data;
      spread.width = spread.height = 1;
    } else {
      jobData = jc.getImageData(0, 0, W, H).data;
    }
    job.width = job.height = 1;

    // 2. The sheet of paper (with its own printed lines, if it is notebook paper).
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.fillStyle = `rgb(${paper.base.join(',')})`;
    oc.fillRect(0, 0, W, H);
    if (paper.ruled && o.ruling && HT.Render.drawPaper) {
      HT.Render.drawPaper(oc, { ...o.ruling.settings, output: 'white', texture: 0 },
        { k, pageW: sheetMm.w, pageH: sheetMm.h, margins: o.ruling.margins, lineSpacing: o.ruling.lineSpacing }, { noFill: true });
    }
    const img = oc.getImageData(0, 0, W, H);
    const d = img.data;
    const mot = mottle();
    const motScale = Math.max(1, dpi / 40);
    const density = clamp((+o.density || 100) / 100, 0.4, 1.6);
    const sat = printer.sat || 1;
    const toner = [26, 26, 28];

    // 3. Lay toner/ink on the paper, pixel by pixel.
    for (let y = 0, i = 0; y < H; y++) {
      const my = ((y / motScale) | 0) & 255;
      for (let x = 0; x < W; x++, i += 4) {
        // paper: fibres + soft mottling
        const mv = mot[((my << 8) + (((x / motScale) | 0) & 255)) * 4] / 255; // ~0.72..1
        const fib = (hash2(x, y) - 0.5) * paper.fibre + (mv - 0.86) * paper.fibre * 1.6;
        const pr = d[i] + fib, pg = d[i + 1] + fib, pb = d[i + 2] + fib;

        const r = jobData[i], g = jobData[i + 1], b = jobData[i + 2];
        if (r > 252 && g > 252 && b > 252) { // nothing printed here
          d[i] = pr; d[i + 1] = pg; d[i + 2] = pb;
          continue;
        }
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (!printer.color) {
          let dk = Math.max(0, (1 - lum - 0.012) / 0.988);
          dk = 1 - Math.pow(1 - dk, printer.gain); // dot gain darkens mid-tones
          dk *= density;
          // Light tints are printed as scattered dots, so they look speckled.
          if (dk < 0.45) dk *= 1 + (hash2(x + 7, y + 3) - 0.5) * 1.3 * printer.speckle;
          dk = clamp(dk, 0, 1);
          d[i] = pr * (1 - dk) + toner[0] * dk;
          d[i + 1] = pg * (1 - dk) + toner[1] * dk;
          d[i + 2] = pb * (1 - dk) + toner[2] * dk;
        } else {
          const gy = lum * 255;
          let cr = gy + (r - gy) * sat, cg = gy + (g - gy) * sat, cb = gy + (b - gy) * sat;
          // ink spread + density: push colours a little darker
          const k2 = density * (printer.gain);
          cr = 255 - (255 - cr) * k2; cg = 255 - (255 - cg) * k2; cb = 255 - (255 - cb) * k2;
          const light = (cr + cg + cb) / 765;
          if (light > 0.55) {
            const t = 1 + (hash2(x + 11, y + 5) - 0.5) * 0.5 * printer.speckle;
            cr = 255 - (255 - cr) * t; cg = 255 - (255 - cg) * t; cb = 255 - (255 - cb) * t;
          }
          d[i] = pr * clamp(cr, 0, 255) / 255;
          d[i + 1] = pg * clamp(cg, 0, 255) / 255;
          d[i + 2] = pb * clamp(cb, 0, 255) / 255;
        }
      }
    }
    oc.putImageData(img, 0, 0);
    return { canvas: out, placement: pl };
  }

  HT.PrintSim = { PRINTERS, PAPERS, SHEETS, SCALINGS, placement, describe, simulate };
})(typeof window !== 'undefined' ? window : globalThis);
