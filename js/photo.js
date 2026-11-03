/* HandText Pro — Photo mode: the handwritten page photographed in a real-looking scene.
 *
 * Everything is generated in code at full output resolution (nothing is upscaled or
 * blurred, so wood grain, paper and writing stay crisp):
 *   - a desk/table surface: wooden planks with grain, fibres and seams, or a laminate table
 *   - the page with a small rotation, camera perspective and a gentle curve
 *   - scene details: spiral notebook (cover, page stack, punched holes, metal coil,
 *     tear-off perforation), exercise book (facing page, gutter, staples), stacked sheets
 *   - drop shadows, window light, vignette, warm white balance and fine sensor grain
 * The page is mapped onto the scene with many small triangles (affine pieces of a curved quad).
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  const SCENES = [
    { id: 'spiral-side', label: 'Spiral notebook (side coil) on a desk', bg: 'wood',      kind: 'spiral-side', light: [0.12, 0.08], cover: '#1f2f4f' },
    { id: 'desk',        label: 'Loose sheet on a wooden desk',          bg: 'wood',      kind: 'sheet',       light: [0.15, 0.1] },
    { id: 'spiral',      label: 'Spiral notebook (top coil), dark desk', bg: 'darkwood',  kind: 'spiral-top',  light: [0.85, 0.05], cover: '#7a1f24' },
    { id: 'exercise',    label: 'Exercise book, open',                   bg: 'lightwood', kind: 'book',        light: [0.2, 0.0] },
    { id: 'table',       label: 'Sheet on a white table (phone photo)',  bg: 'table',     kind: 'sheet',       light: [0.5, -0.1], phoneShadow: true },
  ];
  const PHOTO_ASPECT = 3 / 4; // portrait phone photo

  const BG = {
    wood:      { a: [118, 74, 40],  b: [190, 136, 86] },
    darkwood:  { a: [44, 27, 18],   b: [104, 68, 44] },
    lightwood: { a: [184, 146, 102], b: [232, 204, 160] },
    table:     { a: [222, 222, 218], b: [244, 244, 240] },
  };

  const range = (r, a, b) => a + (b - a) * r();

  // ---------- smooth noise ----------
  function lattice(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  function fbm(x, y, seed) {
    return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.03, y * 2.03, seed + 1) * 0.3 + vnoise(x * 4.1, y * 4.1, seed + 2) * 0.15;
  }

  /** Desk / table surface at full resolution (cached: the same for every page of a document). */
  const bgCache = new Map();
  function background(W, H, kind) {
    const key = `${kind}|${W}x${H}`;
    if (bgCache.has(key)) return bgCache.get(key);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const { a, b } = BG[kind] || BG.wood;
    const seed = kind.length * 97 + 13;
    const s = 1000 / W; // pattern units, independent of output size
    const wood = kind !== 'table';
    const plankH = 230;
    for (let y = 0, i = 0; y < H; y++) {
      const Y = y * s;
      const plank = Math.floor(Y / plankH);
      const inPlank = (Y - plank * plankH) / plankH;
      const tint = (lattice(plank, 3, seed) - 0.5) * 0.22;
      const rowWarp = plank * 17.3;
      for (let x = 0; x < W; x++, i += 4) {
        const X = x * s;
        let t;
        if (wood) {
          // growth rings bent by slow noise, fine fibres, colour per plank, dark seam between planks
          const bend = fbm(X * 0.0035 + rowWarp, Y * 0.012, seed) * 42;
          const rings = Math.sin((Y + bend) * 0.32 + plank * 3.1);
          const ring2 = Math.sin((Y + bend * 1.3) * 0.11 + plank);
          const fibre = vnoise(X * 0.06 + rowWarp, Y * 1.9, seed + 5) - 0.5;
          const pore = lattice(x, y, seed + 9) - 0.5;
          t = 0.52 + 0.13 * rings + 0.12 * ring2 + 0.2 * fibre + 0.05 * pore + tint;
          const edge = Math.min(inPlank, 1 - inPlank) * plankH;
          if (edge < 1.1) t *= 0.45 + 0.4 * (edge / 1.1); // seam
        } else {
          // matte laminate: very fine speckle and soft unevenness
          t = 0.62 + 0.16 * (fbm(X * 0.006, Y * 0.006, seed) - 0.5) + 0.07 * (lattice(x, y, seed) - 0.5);
        }
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        d[i] = a[0] + (b[0] - a[0]) * t;
        d[i + 1] = a[1] + (b[1] - a[1]) * t;
        d[i + 2] = a[2] + (b[2] - a[2]) * t;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (wood) {
      // a soft varnish sheen across the planks
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,240,220,0.10)'); g.addColorStop(0.5, 'rgba(255,240,220,0)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (bgCache.size > 3) bgCache.clear();
    bgCache.set(key, c);
    return c;
  }

  // ---------- image warping ----------
  function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
    // Grow the destination triangle by ~0.7px so neighbouring pieces overlap (no hairline seams).
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const grow = (p) => {
      const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / l) * 0.7, y: p.y + (dy / l) * 0.7 };
    };
    const e0 = grow(d0), e1 = grow(d1), e2 = grow(d2);
    const den = s0.x * (s2.y - s1.y) - s1.x * s2.y + s2.x * s1.y + (s1.x - s2.x) * s0.y;
    if (Math.abs(den) < 1e-9) return;
    const a = -(s0.y * (d2.x - d1.x) - s1.y * d2.x + s2.y * d1.x + (s1.y - s2.y) * d0.x) / den;
    const b = -(s0.y * (d2.y - d1.y) - s1.y * d2.y + s2.y * d1.y + (s1.y - s2.y) * d0.y) / den;
    const c = (s0.x * (d2.x - d1.x) - s1.x * d2.x + s2.x * d1.x + (s1.x - s2.x) * d0.x) / den;
    const d = (s0.x * (d2.y - d1.y) - s1.x * d2.y + s2.x * d1.y + (s1.x - s2.x) * d0.y) / den;
    const e = (s0.x * (s2.y * d1.x - s1.y * d2.x) + s0.y * (s1.x * d2.x - s2.x * d1.x) + (s2.x * s1.y - s1.x * s2.y) * d0.x) / den;
    const f = (s0.x * (s2.y * d1.y - s1.y * d2.y) + s0.y * (s1.x * d2.y - s2.x * d1.y) + (s2.x * s1.y - s1.x * s2.y) * d0.y) / den;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 2);
    const minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 2);
    const maxX = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 2);
    const maxY = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 2);
    if (maxX > minX && maxY > minY) ctx.drawImage(img, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  }

  /** Point on the (slightly curved) page surface for u,v in 0..1 (may go outside for details). */
  function surface(q, u, v, bulge) {
    const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
    const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
    const p = { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
    const uu = Math.min(1, Math.max(0, u)), vv = Math.min(1, Math.max(0, v));
    p.y += bulge * (Math.sin(Math.PI * uu) * 0.6 - Math.cos(Math.PI * vv) * 0.25);
    p.x += bulge * 0.35 * Math.sin(Math.PI * vv) * (uu - 0.5);
    return p;
  }

  function warp(ctx, img, q, bulge, n) {
    const N = n || 12;
    const P = [];
    for (let j = 0; j <= N; j++) {
      P.push([]);
      for (let i = 0; i <= N; i++) P[j].push(surface(q, i / N, j / N, bulge));
    }
    const sw = img.width, sh = img.height;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const s00 = { x: (i / N) * sw, y: (j / N) * sh }, s10 = { x: ((i + 1) / N) * sw, y: (j / N) * sh };
        const s01 = { x: (i / N) * sw, y: ((j + 1) / N) * sh }, s11 = { x: ((i + 1) / N) * sw, y: ((j + 1) / N) * sh };
        drawTri(ctx, img, s00, s10, s11, P[j][i], P[j][i + 1], P[j + 1][i + 1]);
        drawTri(ctx, img, s00, s11, s01, P[j][i], P[j + 1][i + 1], P[j + 1][i]);
      }
    }
  }

  function outline(ctx, q, bulge) {
    ctx.beginPath();
    const steps = 16;
    for (let t = 0; t <= steps; t++) { const p = surface(q, t / steps, 0, bulge); t ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    for (let t = 0; t <= steps; t++) { const p = surface(q, 1, t / steps, bulge); ctx.lineTo(p.x, p.y); }
    for (let t = steps; t >= 0; t--) { const p = surface(q, t / steps, 1, bulge); ctx.lineTo(p.x, p.y); }
    for (let t = steps; t >= 0; t--) { const p = surface(q, 0, t / steps, bulge); ctx.lineTo(p.x, p.y); }
    ctx.closePath();
  }

  /** Corners of a page of size pw×ph centred at (cx,cy), rotated, with camera perspective. */
  function quadFor(cx, cy, pw, ph, angle, persp) {
    const inset = pw * persp;
    const pts = [
      { x: -pw / 2 + inset, y: -ph / 2 }, { x: pw / 2 - inset, y: -ph / 2 },
      { x: pw / 2, y: ph / 2 }, { x: -pw / 2, y: ph / 2 },
    ];
    const c = Math.cos(angle), s = Math.sin(angle);
    return pts.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
  }

  function fillShadowed(ctx, q, bulge, fill, blur, ox, oy, alpha) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowBlur = blur; ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
    ctx.fillStyle = fill;
    outline(ctx, q, bulge);
    ctx.fill();
    ctx.restore();
  }

  /** Metal spiral coil, punched holes and tear-off perforation. side: 'left' | 'top'. */
  function drawCoil(ctx, q, bulge, pageMm, mm, side, angle) {
    const pitch = 8.47; // 3 loops per inch
    const along = side === 'left' ? pageMm.h : pageMm.w;
    const n = Math.floor((along - 10) / pitch);
    const start = (along - (n - 1) * pitch) / 2;
    const wire = Math.max(1.4, 1.05 * mm);
    const holeR = 2.1 * mm;
    const at = (a, b) => (side === 'left' ? surface(q, a / pageMm.w, b / pageMm.h, bulge) : surface(q, b / pageMm.w, a / pageMm.h, bulge));
    // tear-off perforation
    ctx.save();
    ctx.fillStyle = 'rgba(120,115,105,0.35)';
    for (let t = 2; t < along - 2; t += 1.1) {
      const p = at(13, t);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, 0.18 * mm), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (let k = 0; k < n; k++) {
      const c = start + k * pitch;
      const hole = at(5.2, c);
      // punched hole: you see the cover/desk through it, with a slight shaded rim
      ctx.save();
      const hg = ctx.createRadialGradient(hole.x - holeR * 0.3, hole.y - holeR * 0.3, holeR * 0.2, hole.x, hole.y, holeR);
      hg.addColorStop(0, '#2b2522'); hg.addColorStop(0.85, '#151210'); hg.addColorStop(1, 'rgba(90,80,70,0.9)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(hole.x, hole.y, holeR, holeR * 0.92, angle, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // the loop leaves the hole, curls over the edge of the sheet around the spine (a C shape seen
      // from above) and tucks back under the cover towards the next hole
      const from = at(5.0, c - 0.5);
      const cp1 = at(-2.6, c - 2.7);
      const cp2 = at(-7.6, c + 1.6);
      const to = at(-1.6, c + pitch * 0.46);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y);
      };
      ctx.save();
      ctx.lineCap = 'round';
      // contact shadow on the paper/cover
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = wire * 1.5;
      ctx.translate(0.9 * mm, 1.2 * mm);
      path(); ctx.stroke();
      ctx.translate(-0.9 * mm, -1.2 * mm);
      // wire: dark body, steel mid-tone, bright specular line
      ctx.strokeStyle = '#2f3237'; ctx.lineWidth = wire; path(); ctx.stroke();
      ctx.strokeStyle = '#8d939b'; ctx.lineWidth = wire * 0.66; path(); ctx.stroke();
      ctx.translate(-0.18 * wire, -0.22 * wire);
      ctx.strokeStyle = 'rgba(250,252,255,0.9)'; ctx.lineWidth = wire * 0.22; path(); ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Compose a photo of `page` (canvas) whose physical size is pageMm.
   * @returns canvas of W x (W / PHOTO_ASPECT)
   */
  function compose(page, pageMm, sceneId, W, seed) {
    const scene = SCENES.find((s) => s.id === sceneId) || SCENES[0];
    const H = Math.round(W / PHOTO_ASPECT);
    const rand = HT.Render.mulberry32(HT.Render.seedOf(seed || 1, SCENES.indexOf(scene), 9));
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. surface (sharp, full resolution)
    ctx.drawImage(background(W, H, scene.bg), 0, 0);

    // 2. where the page goes
    const aspect = pageMm.w / pageMm.h;
    const spiral = scene.kind === 'spiral-side' || scene.kind === 'spiral-top';
    let pw = W * (scene.kind === 'book' ? 0.78 : spiral ? 0.8 : 0.84);
    let ph = pw / aspect;
    const maxH = H * (spiral ? 0.84 : 0.86);
    if (ph > maxH) { ph = maxH; pw = ph * aspect; }
    const mm = pw / pageMm.w; // px per mm on the page
    const cx = W / 2 + (scene.kind === 'book' ? W * 0.07 : scene.kind === 'spiral-side' ? W * 0.03 : range(rand, -0.015, 0.015) * W);
    const cy = H / 2 + (scene.kind === 'spiral-top' ? H * 0.025 : range(rand, -0.01, 0.02) * H);
    const angle = (range(rand, -2, 2) * Math.PI) / 180;
    const persp = range(rand, 0.01, 0.025);
    const bulge = W * range(rand, 0.003, 0.007);
    const q = quadFor(cx, cy, pw, ph, angle, persp);
    const unit = W / 1000;

    // 3. what lies under the page
    if (spiral) {
      // hard cover, a little bigger than the pages, then the edges of the pages beneath
      const ext = scene.kind === 'spiral-side'
        ? quadFor(cx + 1.6 * mm, cy + 1.2 * mm, pw + 5.5 * mm, ph + 4 * mm, angle, persp)
        : quadFor(cx + 0.6 * mm, cy + 1.8 * mm, pw + 4 * mm, ph + 5.5 * mm, angle, persp);
      fillShadowed(ctx, ext, bulge * 0.5, scene.cover, 26 * unit, 7 * unit, 12 * unit, 0.42);
      ctx.save(); // cover board texture: faint linen lines
      outline(ctx, ext, bulge * 0.5); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let x = -H; x < W + H; x += 3 * unit) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.3, H); ctx.stroke(); }
      ctx.restore();
      for (let i = 4; i >= 1; i--) {
        const dx = (scene.kind === 'spiral-side' ? 0.45 : 0.2) * i * mm, dy = (scene.kind === 'spiral-side' ? 0.3 : 0.45) * i * mm;
        const sq = quadFor(cx + dx, cy + dy, pw, ph, angle, persp);
        ctx.save();
        ctx.fillStyle = i % 2 ? '#e9e5da' : '#f3f0e7';
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = Math.max(1, 0.15 * mm);
        outline(ctx, sq, bulge); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else if (scene.kind === 'book') {
      const leftW = pw * 0.2;
      const lq = quadFor(cx - pw / 2 - leftW / 2 + unit * 2, cy, leftW, ph, angle, 0);
      fillShadowed(ctx, lq, bulge * 0.5, '#f4f1e8', 28 * unit, 6 * unit, 12 * unit, 0.35);
      ctx.save();
      outline(ctx, lq, bulge * 0.5); ctx.clip();
      ctx.strokeStyle = 'rgba(90,140,200,0.4)'; ctx.lineWidth = Math.max(1, unit * 1.1);
      const step = ph / (pageMm.h / 8);
      for (let y = step * 2.5; y < ph; y += step) {
        const a = surface(lq, 0, y / ph, 0), b = surface(lq, 1, y / ph, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    } else {
      const sq = quadFor(cx + 2.5 * unit, cy + 3 * unit, pw, ph, angle + range(rand, -0.004, 0.006), persp);
      fillShadowed(ctx, sq, bulge, '#efebe1', 24 * unit, 8 * unit, 14 * unit, 0.3);
    }
    fillShadowed(ctx, q, bulge, '#f7f5ef', spiral ? 6 * unit : 30 * unit, spiral ? 1.5 * unit : 9 * unit, spiral ? 2 * unit : 16 * unit, spiral ? 0.25 : 0.38);

    // 4. the page itself (rendered at the size it appears, so it stays sharp)
    warp(ctx, page, q, bulge, 14);
    // a hairline highlight on the paper edge
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, 0.12 * mm);
    outline(ctx, q, bulge); ctx.stroke();
    ctx.restore();

    // 5. scene details on top of the page
    if (scene.kind === 'spiral-side') drawCoil(ctx, q, bulge, pageMm, mm, 'left', angle);
    if (scene.kind === 'spiral-top') drawCoil(ctx, q, bulge, pageMm, mm, 'top', angle);
    if (scene.kind === 'book') {
      const a = surface(q, 0, 0, bulge), b = surface(q, 0, 1, bulge);
      const nx = Math.cos(angle), ny = Math.sin(angle);
      const g = ctx.createLinearGradient(a.x, a.y, a.x + nx * pw * 0.09, a.y + ny * pw * 0.09);
      g.addColorStop(0, 'rgba(60,45,30,0.45)'); g.addColorStop(0.35, 'rgba(60,45,30,0.12)'); g.addColorStop(1, 'rgba(60,45,30,0)');
      ctx.save();
      outline(ctx, q, bulge); ctx.clip();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + nx * pw * 0.09, b.y + ny * pw * 0.09); ctx.lineTo(a.x + nx * pw * 0.09, a.y + ny * pw * 0.09);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      [0.3, 0.7].forEach((v) => {
        const s = surface(q, 0.008, v, bulge);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(angle + Math.PI / 2);
        const sg = ctx.createLinearGradient(0, -unit * 1.6, 0, unit * 1.6);
        sg.addColorStop(0, '#6b7078'); sg.addColorStop(0.5, '#e3e6ea'); sg.addColorStop(1, '#5d626a');
        ctx.fillStyle = sg;
        ctx.fillRect(-unit * 14, -unit * 1.4, unit * 28, unit * 2.8);
        ctx.restore();
      });
    }

    // 6. light: window light from one side, gentle vignette, phone shadow, warm white balance
    const [lx, ly] = scene.light;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const lg = ctx.createRadialGradient(W * lx, H * ly, 0, W * lx, H * ly, Math.hypot(W, H) * 0.95);
    lg.addColorStop(0, 'rgba(255,255,250,0.5)'); lg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    const vg = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,1)'); vg.addColorStop(1, 'rgba(165,155,142,1)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (scene.phoneShadow) {
      // the soft shadow of the phone/hand taking the photo (shadows are naturally soft)
      const pg = ctx.createRadialGradient(W * 0.95, H * 1.05, 0, W * 0.95, H * 1.05, W * 0.55);
      pg.addColorStop(0, 'rgba(80,80,92,0.55)'); pg.addColorStop(0.6, 'rgba(80,80,92,0.3)'); pg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply';
    }
    ctx.fillStyle = 'rgb(255,248,238)'; // warm indoor white balance
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 7. fine sensor grain (per pixel, crisp — never a blur)
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const n = (lattice(p, 7, 11) - 0.5) * 7;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  HT.Photo = { SCENES, PHOTO_ASPECT, compose };
})(typeof window !== 'undefined' ? window : globalThis);
