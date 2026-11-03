/* HandText Pro — Photo mode: the handwritten page photographed in a real-looking scene.
 *
 * Everything is generated in code (no stock photos):
 *   - a desk/table surface (wood grain or plain table), slightly out of focus
 *   - the page placed with a small rotation and camera perspective, gently curved
 *   - scene details: stacked sheets, spiral rings and punched holes, exercise-book gutter
 *   - a soft drop shadow, window light, vignette, warm white balance and camera grain
 * Pages are warped onto the scene with many small triangles (affine pieces of a curved quad).
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});

  const SCENES = [
    { id: 'desk',     label: 'Loose sheet on a wooden desk',     bg: 'wood',      kind: 'sheet',  light: [0.15, 0.1] },
    { id: 'spiral',   label: 'Spiral notebook on a dark desk',   bg: 'darkwood',  kind: 'spiral', light: [0.85, 0.05] },
    { id: 'exercise', label: 'Exercise book, open',              bg: 'lightwood', kind: 'book',   light: [0.2, 0.0] },
    { id: 'table',    label: 'Sheet on a white table (phone photo)', bg: 'table', kind: 'sheet',  light: [0.5, -0.1], phoneShadow: true },
  ];
  const PHOTO_ASPECT = 3 / 4; // portrait phone photo

  const BG = {
    wood:      { a: [150, 102, 62],  b: [196, 145, 95] },
    darkwood:  { a: [62, 40, 28],    b: [110, 74, 50] },
    lightwood: { a: [196, 160, 118], b: [228, 200, 160] },
    table:     { a: [214, 214, 210], b: [236, 236, 232] },
  };

  const range = (r, a, b) => a + (b - a) * r();

  // Smooth value noise (smoothstep-interpolated random lattice), a few octaves.
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

  /** Desk / table surface, generated small then scaled up (which also blurs it like depth of field). */
  function background(W, H, kind, rand) {
    const w = Math.max(64, Math.round(W / 3)), h = Math.max(64, Math.round(H / 3));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const { a, b } = BG[kind] || BG.wood;
    const seed = Math.floor(rand() * 1000);
    const wood = kind !== 'table';
    const sc = 300 / w; // keep the grain the same size whatever the output resolution
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const X = x * sc, Y = y * sc;
        let t;
        if (wood) {
          // planks with grain running left to right: rings bent by slow noise, plus fine fibre streaks
          const warp = fbm(X * 0.004, Y * 0.02, seed) * 14;
          const rings = Math.sin(Y * 0.09 + warp);
          const streak = fbm(X * 0.02, Y * 0.6, seed + 7) - 0.5;
          const plank = Math.floor(Y / 95);
          t = 0.5 + 0.28 * rings + 0.3 * streak + 0.12 * (lattice(plank, 0, seed) - 0.5);
        } else {
          t = 0.55 + 0.3 * (fbm(X * 0.01, Y * 0.01, seed) - 0.5) + 0.12 * (fbm(X * 0.2, Y * 0.2, seed + 3) - 0.5);
        }
        t = Math.min(1, Math.max(0, t));
        img.data[i] = a[0] + (b[0] - a[0]) * t;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * t;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * t;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
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

  /** Point on the (slightly curved) page surface for u,v in 0..1. */
  function surface(q, u, v, bulge) {
    const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
    const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
    const p = { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
    // the sheet isn't perfectly flat: a gentle sag across and a lift at the edges
    p.y += bulge * (Math.sin(Math.PI * u) * 0.6 - Math.cos(Math.PI * v) * 0.25);
    p.x += bulge * 0.35 * Math.sin(Math.PI * v) * (u - 0.5);
    return p;
  }

  function warp(ctx, img, q, bulge, n) {
    const N = n || 10;
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
    ctx.imageSmoothingQuality = 'high';

    // 1. surface
    ctx.drawImage(background(W, H, scene.bg, rand), 0, 0, W, H);

    // 2. where the page goes
    const aspect = pageMm.w / pageMm.h;
    let pw = W * (scene.kind === 'book' ? 0.78 : 0.84);
    let ph = pw / aspect;
    if (ph > H * 0.86) { ph = H * 0.86; pw = ph * aspect; }
    const cx = W / 2 + (scene.kind === 'book' ? W * 0.07 : range(rand, -0.015, 0.015) * W);
    const cy = H / 2 + range(rand, -0.01, 0.02) * H;
    const angle = (range(rand, -2.2, 2.2) * Math.PI) / 180;
    const persp = range(rand, 0.012, 0.03);
    const bulge = W * range(rand, 0.004, 0.009);
    const q = quadFor(cx, cy, pw, ph, angle, persp);
    const unit = W / 1000; // scale for shadows/details

    // 3. things under the page: shadow, stacked sheets, the other half of the book
    if (scene.kind === 'book') {
      const leftW = pw * 0.2;
      const lq = quadFor(cx - pw / 2 - leftW / 2 + unit * 2, cy, leftW, ph, angle, 0);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 28 * unit; ctx.shadowOffsetX = 6 * unit; ctx.shadowOffsetY = 12 * unit;
      ctx.fillStyle = '#f4f1e8';
      outline(ctx, lq, bulge * 0.5); ctx.fill();
      ctx.restore();
      // faint lines on the facing page
      ctx.save();
      outline(ctx, lq, bulge * 0.5); ctx.clip();
      ctx.strokeStyle = 'rgba(90,140,200,0.35)'; ctx.lineWidth = Math.max(1, unit * 1.1);
      const step = ph / (pageMm.h / 8);
      for (let y = step * 2.5; y < ph; y += step) {
        const a = surface(lq, 0, y / ph, 0), b = surface(lq, 1, y / ph, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    } else {
      // a couple of sheets underneath, slightly out of line
      const sheets = scene.kind === 'spiral' ? 3 : 1;
      for (let i = sheets; i >= 1; i--) {
        const sq = quadFor(cx + i * unit * 2.5, cy + i * unit * 3, pw, ph, angle + range(rand, -0.004, 0.006), persp);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 24 * unit; ctx.shadowOffsetX = 8 * unit; ctx.shadowOffsetY = 14 * unit;
        ctx.fillStyle = i === 1 ? '#f2efe6' : '#ebe7dc';
        outline(ctx, sq, bulge); ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 30 * unit; ctx.shadowOffsetX = 9 * unit; ctx.shadowOffsetY = 16 * unit;
    ctx.fillStyle = '#f7f5ef';
    outline(ctx, q, bulge); ctx.fill();
    ctx.restore();

    // 4. the page itself
    warp(ctx, page, q, bulge, 12);

    // 5. scene details on top of the page
    if (scene.kind === 'spiral') {
      const n = Math.max(8, Math.round(pageMm.w / 8.5));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const hole = surface(q, u, 9 / pageMm.h, bulge);
        const r = unit * 6.2;
        // punched hole shows the desk underneath
        ctx.fillStyle = 'rgba(40,28,20,0.85)';
        ctx.beginPath(); ctx.ellipse(hole.x, hole.y, r, r * 1.05, angle, 0, Math.PI * 2); ctx.fill();
        // metal ring loops over the top edge
        const topP = surface(q, u, 0, bulge);
        const g = ctx.createLinearGradient(hole.x - r, 0, hole.x + r, 0);
        g.addColorStop(0, '#5f6670'); g.addColorStop(0.45, '#e6e9ee'); g.addColorStop(1, '#4b5058');
        ctx.strokeStyle = g;
        ctx.lineWidth = unit * 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hole.x - r * 0.2, hole.y);
        ctx.bezierCurveTo(hole.x - r * 0.8, hole.y - r * 3.2, topP.x + r * 0.6, topP.y - r * 3.4, hole.x + r * 0.5, hole.y - r * 0.1);
        ctx.stroke();
      }
    }
    if (scene.kind === 'book') {
      // gutter: the paper curves down into the binding
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
      // staples in the middle
      ctx.fillStyle = '#9aa0a8';
      [0.3, 0.7].forEach((v) => {
        const s = surface(q, 0.008, v, bulge);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(angle + Math.PI / 2);
        ctx.fillRect(-unit * 14, -unit * 1.3, unit * 28, unit * 2.6);
        ctx.restore();
      });
    }

    // 6. light: window light from one side, gentle vignette, phone shadow, warm white balance
    const [lx, ly] = scene.light;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const lg = ctx.createRadialGradient(W * lx, H * ly, 0, W * lx, H * ly, Math.hypot(W, H) * 0.95);
    lg.addColorStop(0, 'rgba(255,255,250,0.55)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    const vg = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,1)'); vg.addColorStop(1, 'rgba(150,140,128,1)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (scene.phoneShadow) {
      // the shadow of the phone/hand taking the photo
      ctx.filter = `blur(${Math.round(40 * unit)}px)`;
      ctx.fillStyle = 'rgba(70,70,80,0.55)';
      ctx.beginPath();
      ctx.ellipse(W * 0.92, H * 1.02, W * 0.38, H * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = 'none';
    }
    ctx.fillStyle = 'rgb(255,247,234)'; // warm indoor white balance
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 7. camera grain
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.12;
    const pat = ctx.createPattern(HT.Render.getNoise(), 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(Math.max(1, unit * 0.9)));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return out;
  }

  HT.Photo = { SCENES, PHOTO_ASPECT, compose };
})(typeof window !== 'undefined' ? window : globalThis);
