/* HandText Pro — app: state, controls, upload, live preview and downloads. */
(function () {
  'use strict';
  const HT = window.HT;
  const { parse, layout, linesPerPage } = HT.Layout;

  const PRINT_K = 200 / 25.4;      // ~200 DPI for printing
  const EXPORT_K = { standard: 150 / 25.4, high: 300 / 25.4, ultra: 400 / 25.4 };
  const PHOTO_MM = { w: 210, h: 280 }; // photo pages are 3:4, printed/exported at A4 width
  const STORAGE_KEY = 'handtext-pro:v1';
  // Fonts differ a lot in how big they look at the same size. Each is scaled so the
  // average of its x-height and cap height is 56% of the font size.
  const TARGET_VISUAL_SIZE = 0.56;

  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;

  // ---------------- state ----------------
  const state = clone(HT.DEFAULTS);
  state.text = HT.SAMPLE_TEXT;
  let docName = 'handwritten-notes';
  let undoText = null;

  const storage = {
    load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } },
    save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } },
  };

  function restore() {
    const saved = storage.load();
    if (!saved || typeof saved !== 'object') return;
    for (const key of Object.keys(HT.DEFAULTS)) {
      if (!(key in saved)) continue;
      const def = HT.DEFAULTS[key];
      if (def && typeof def === 'object') {
        if (!saved[key] || typeof saved[key] !== 'object') continue;
        for (const sub of Object.keys(def)) {
          if (typeof saved[key][sub] === typeof def[sub]) state[key][sub] = saved[key][sub];
        }
      } else if (typeof saved[key] === typeof def) {
        state[key] = saved[key];
      }
    }
    // Ignore values that no longer exist (e.g. a removed font) or are out of range.
    if (!HT.FONTS.some((f) => f.id === state.font) && !/^user-/.test(state.font)) state.font = HT.DEFAULTS.font;
    if (!HT.PAPERS.some((p) => p.id === state.paper)) state.paper = HT.DEFAULTS.paper;
    if (!HT.PAGE_SIZES.some((p) => p.id === state.pageSize)) state.pageSize = HT.DEFAULTS.pageSize;
    if (state.ink !== 'custom' && !HT.INKS.some((i) => i.id === state.ink)) state.ink = HT.DEFAULTS.ink;
    if (!/^#[0-9a-f]{6}$/i.test(state.customInk)) state.customInk = HT.DEFAULTS.customInk;
    if (!['off', 'first', 'all'].includes(state.headerOn)) state.headerOn = HT.DEFAULTS.headerOn;
    if (!['standard', 'high', 'ultra'].includes(state.quality)) state.quality = HT.DEFAULTS.quality;
    if (!['digital', 'white', 'ink'].includes(state.output)) state.output = HT.DEFAULTS.output;
    const sd = HT.DEFAULTS.sim;
    const validIds = { printer: HT.PrintSim.PRINTERS, paper: HT.PrintSim.PAPERS, sheet: HT.PrintSim.SHEETS, scaling: HT.PrintSim.SCALINGS };
    for (const [key, list] of Object.entries(validIds)) if (!list.some((x) => x.id === state.sim[key])) state.sim[key] = sd[key];
    if (!['fit', 'actual', '200'].includes(state.sim.zoom)) state.sim.zoom = sd.zoom;
    if (!['png', 'jpg', 'png-clear'].includes(state.imageFormat)) state.imageFormat = HT.DEFAULTS.imageFormat;
    if (!['print', 'photo'].includes(state.mode)) state.mode = HT.DEFAULTS.mode;
    if (!HT.Photo.SCENES.some((x) => x.id === state.scene)) state.scene = HT.DEFAULTS.scene;
    const clamp = (v, a, b, d) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
    state.fontSize = clamp(state.fontSize, 12, 36, HT.DEFAULTS.fontSize);
    state.lineSpacing = clamp(state.lineSpacing, 5, 14, HT.DEFAULTS.lineSpacing);
    state.wordSpacing = clamp(state.wordSpacing, 70, 180, HT.DEFAULTS.wordSpacing);
    state.lineStep = [1, 2, 3].includes(state.lineStep) ? state.lineStep : 1;
    for (const k of ['movement', 'variation', 'inkflow', 'texture']) state[k] = clamp(state[k], 0, 100, HT.DEFAULTS[k]);
    for (const side of ['top', 'right', 'bottom', 'left']) state.margins[side] = clamp(state.margins[side], 0, 80, HT.DEFAULTS.margins[side]);
  }

  const findFont = (id) => allFonts().find((f) => f.id === id) || HT.FONTS[0];
  const findPaper = (id) => HT.PAPERS.find((p) => p.id === id) || HT.PAPERS[0];
  const findSize = (id) => HT.PAGE_SIZES.find((p) => p.id === id) || HT.PAGE_SIZES[0];
  const inkColor = () => (state.ink === 'custom' ? state.customInk : (HT.INKS.find((i) => i.id === state.ink) || HT.INKS[0]).color);

  function setStatus(msg, isError) {
    const el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  // ---------------- fonts ----------------
  const fontInfo = new Map(); // id -> { family, norm, ok, ready }
  const familyOf = (font) => `HTP ${font.id}`;

  function loadFont(font) {
    if (fontInfo.has(font.id)) return fontInfo.get(font.id).ready;
    const info = { family: familyOf(font), norm: 1, ok: false };
    info.ready = new FontFace(info.family, `url(fonts/${font.id}.woff2) format("woff2")`)
      .load()
      .then((face) => {
        document.fonts.add(face);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `100px "${info.family}"`;
        const xh = ctx.measureText('x').actualBoundingBoxAscent / 100;
        const cap = ctx.measureText('H').actualBoundingBoxAscent / 100;
        const visual = (xh + cap) / 2;
        if (visual > 0.2) info.norm = Math.min(1.6, Math.max(0.65, TARGET_VISUAL_SIZE / visual));
        info.ok = true;
      })
      .catch(() => { info.ok = false; });
    fontInfo.set(font.id, info);
    return info.ready;
  }

  // Width measurement for layout, in mm, cached per font + text.
  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  function measurerFor(family) {
    return (text, sizeMm) => {
      const key = family + '\u0000' + text;
      let w100 = widthCache.get(key);
      if (w100 === undefined) {
        measureCtx.font = `100px "${family}", "Comic Sans MS", cursive`;
        w100 = measureCtx.measureText(text).width;
        if (widthCache.size > 80000) widthCache.clear();
        widthCache.set(key, w100);
      }
      return (w100 / 100) * sizeMm;
    };
  }

  // ---------------- layout ----------------
  function geometry() {
    const size = findSize(state.pageSize);
    const m = { ...state.margins };
    // Keep at least 30 mm of writing width and room for 2 lines.
    const maxSide = (size.w - 30) / 2;
    m.left = Math.min(Math.max(0, m.left), maxSide);
    m.right = Math.min(Math.max(0, m.right), maxSide);
    m.top = Math.min(Math.max(0, m.top), size.h / 2 - state.lineSpacing);
    m.bottom = Math.min(Math.max(0, m.bottom), size.h / 2 - state.lineSpacing);
    return { size, margins: m };
  }

  async function computePlan() {
    if (/^user-/.test(state.font)) await userFontsReady;
    const font = findFont(state.font);
    await loadFont(font);
    const info = fontInfo.get(font.id);
    const { size, margins } = geometry();
    const fontSizeMm = (state.fontSize * 25.4) / 72 * info.norm;
    const lpp = linesPerPage(size.h, margins, state.lineSpacing, state.lineStep);
    const result = layout(parse(state.text), {
      measure: measurerFor(info.family),
      fontSizeMm,
      wordSpacing: state.wordSpacing,
      contentWidth: size.w - margins.left - margins.right,
      linesPerPage: lpp,
      maxPages: HT.MAX_PAGES,
      plain: state.plainPen,
    });
    const settings = { ...clone(state), inkColor: inkColor() };
    delete settings.text;
    const header = state.headerOn !== 'off' ? { ...state.header } : null;
    const headerOn = state.headerOn;
    const pageNumbers = state.pageNumbers;
    return {
      ...result,
      size,
      outSize: state.mode === 'photo' ? PHOTO_MM : size, // what a finished page measures
      geo: { pageW: size.w, pageH: size.h, margins, lineSpacing: state.lineSpacing, fontSizeMm, linesPerPage: lpp, pageCount: result.pages.length, lineStep: state.lineStep },
      font: { family: info.family, cursive: !!font.cursive },
      fontOk: info.ok,
      fontLabel: font.label,
      settings,
      extrasFor: (i) => ({
        header: header && (headerOn === 'all' || i === 0) ? header : null,
        pageNumber: pageNumbers,
      }),
      // Everything except a page's own lines that affects how a page looks.
      key: JSON.stringify([settings, size, margins, fontSizeMm, info.family, lpp, result.pages.length]),
    };
  }

  /** Draw finished page i (a flat page, or a photo of it in Photo mode) at k px/mm. */
  function renderOutput(p, i, canvas, k, opts) {
    if (p.settings.mode !== 'photo') {
      HT.Render.renderPage(canvas, p.pages[i], i, p.settings, { ...p.geo, k }, p.font, { ...p.extrasFor(i), ...(opts || {}) });
      return;
    }
    const W = Math.round(PHOTO_MM.w * k);
    const page = document.createElement('canvas');
    const pk = (W * 0.9) / p.size.w; // page drawn at about the size it appears in the photo
    HT.Render.renderPage(page, p.pages[i], i, { ...p.settings, output: 'digital' }, { ...p.geo, k: pk }, p.font, p.extrasFor(i));
    const photo = HT.Photo.compose(page, p.size, p.settings.scene, W, i + 1);
    page.width = page.height = 1;
    canvas.width = photo.width; canvas.height = photo.height;
    canvas.getContext('2d').drawImage(photo, 0, 0);
    photo.width = photo.height = 1;
  }

  const exportJob = (p, k, opts) => ({
    count: p.pages.length,
    size: p.outSize,
    renderTo: (i, canvas) => renderOutput(p, i, canvas, k, opts),
  });

  // ---------------- preview (lazy: only pages near the screen are drawn) ----------------
  let plan = null;
  let previewK = 5;
  const nearScreen = new Set();

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = +e.target.dataset.index;
        if (e.isIntersecting) { nearScreen.add(i); drawPreviewPage(i); } else nearScreen.delete(i);
      }
    }, { rootMargin: '1500px 0px' })
    : null;
  // Free the memory of pages far off screen when the document is long.
  const farIo = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      if (!plan || plan.pages.length <= 12) return;
      for (const e of entries) {
        if (!e.isIntersecting) {
          const c = e.target.querySelector('canvas');
          c.width = c.height = 0;
          c.dataset.sig = '';
          e.target.classList.add('loading');
        }
      }
    }, { rootMargin: '5000px 0px' })
    : null;

  function computePreviewK(p) {
    const wrap = $('pages');
    const css = Math.min(760, wrap.clientWidth || Math.max(320, window.innerWidth - 40));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return Math.min(7, Math.max(2.5, (css * dpr) / p.outSize.w));
  }

  function ensurePageEls(count) {
    const wrap = $('pages');
    while (wrap.children.length < count) {
      const div = document.createElement('div');
      div.className = 'page loading';
      div.dataset.index = String(wrap.children.length);
      const c = document.createElement('canvas');
      c.setAttribute('role', 'img');
      const no = document.createElement('span');
      no.className = 'pno';
      div.append(c, no);
      wrap.appendChild(div);
      if (io) io.observe(div);
      if (farIo) farIo.observe(div);
    }
    while (wrap.children.length > count) {
      const last = wrap.lastChild;
      if (io) io.unobserve(last);
      if (farIo) farIo.unobserve(last);
      nearScreen.delete(+last.dataset.index);
      last.remove();
    }
    [...wrap.children].forEach((div, i) => {
      div.style.aspectRatio = `${plan.outSize.w} / ${plan.outSize.h}`;
      div.querySelector('.pno').textContent = `Page ${i + 1} of ${count}`;
      div.querySelector('canvas').setAttribute('aria-label', `Handwritten page ${i + 1} of ${count}`);
    });
  }

  function drawPreviewPage(i) {
    if (!plan || i >= plan.pages.length) return;
    const div = $('pages').children[i];
    if (!div) return;
    const canvas = div.querySelector('canvas');
    const sig = `${plan.key}|${previewK}|${i}|${JSON.stringify(plan.pages[i])}|${JSON.stringify(plan.extrasFor(i))}`;
    if (canvas.dataset.sig === sig) return;
    renderOutput(plan, i, canvas, previewK);
    canvas.dataset.sig = sig;
    div.classList.remove('loading');
  }

  let renderSeq = 0;
  async function renderPreview() {
    const seq = ++renderSeq;
    const next = await computePlan();
    if (seq !== renderSeq) return null; // superseded by a newer render
    plan = next;
    previewK = Math.round(computePreviewK(plan) * 4) / 4;
    ensurePageEls(plan.pages.length);
    if (!io) plan.pages.forEach((_, i) => drawPreviewPage(i));
    else nearScreen.forEach((i) => drawPreviewPage(i));

    const n = plan.pages.length;
    $('pageInfo').textContent = `${n} ${n === 1 ? 'page' : 'pages'} \u00B7 ${plan.size.label}`;
    $('tabCount').textContent = `(${n})`;
    $('print-page-size').textContent = `@page { size: ${plan.size.w}mm ${plan.size.h}mm; margin: 0; }`;
    document.documentElement.style.setProperty('--print-w', `${plan.size.w}mm`);
    document.documentElement.style.setProperty('--print-h', `${plan.size.h}mm`);
    if (plan.truncated) setStatus(`Only the first ${HT.MAX_PAGES} pages fit. Split very long text into several documents.`, true);
    else if (!plan.fontOk) setStatus(`Couldn't load ${plan.fontLabel}; showing a fallback font.`, true);
    else if (/^(Only the first|Couldn't load)/.test($('status').textContent)) setStatus('');
    if (simMode && simDoc.kind === 'pages') scheduleSim();
    return plan;
  }

  function updateTextMeta() {
    const t = state.text.trim();
    const words = t ? t.split(/\s+/).length : 0;
    $('textMeta').textContent = `${words.toLocaleString()} words \u00B7 ${state.text.length.toLocaleString()} characters`;
  }

  let timer = null;
  function scheduleRender(delay = 140) {
    clearTimeout(timer);
    timer = setTimeout(() => { renderPreview(); storage.save(); updateSummaries(); }, delay);
  }

  // ---------------- controls ----------------
  // ---------------- picker windows ----------------
  const plainSample = () => {
    const first = state.text.split('\n').map((l) => HT.Layout.stripMarks(l).replace(/[{}=~$|*_-]+/g, ' ').replace(/\b(hl|circle|box|u|uu|wavy|strike|cross)(-\w+)?:/g, '').trim()).find((l) => l.length > 3);
    return (first || 'The quick brown fox jumps over the lazy dog').slice(0, 48);
  };
  const favs = () => new Set((state.favFonts || '').split(',').filter(Boolean));

  function openFontPicker() {
    allFonts().forEach(loadFont);
    let query = '';
    let group = 'all';
    const sample = plainSample();
    const styles = ['all', 'fav', ...new Set(allFonts().map((f) => f.style))];
    HT.Modal.open({
      title: 'Choose handwriting',
      subtitle: `${allFonts().length} handwritings. Tap one to compare, then Apply. Star \u2605 your favourites.`,
      items: allFonts().slice().sort((x, y) => (favs().has(y.id) ? 1 : 0) - (favs().has(x.id) ? 1 : 0)),
      value: state.font,
      gridClass: 'grid-fonts',
      label: (f) => (f && f.label ? `Selected: ${f.label}` : ''),
      filter: (f) => (group === 'all' || (group === 'fav' ? favs().has(f.id) : f.style === group))
        && (!query || `${f.label} ${f.style}`.toLowerCase().includes(query)),
      tools: (el, api) => {
        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Search handwriting\u2026';
        search.className = 'modal-search';
        search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); api.refresh(); });
        const chips = document.createElement('div');
        chips.className = 'chips';
        styles.forEach((st) => {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = 'chip';
          c.textContent = st === 'all' ? 'All' : st === 'fav' ? '\u2605 Favourites' : st;
          c.setAttribute('aria-pressed', String(st === group));
          c.addEventListener('click', () => { group = st; chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); api.refresh(); });
          chips.appendChild(c);
        });
        el.append(search, chips);
      },
      render: (f, el) => {
        const star = document.createElement('span');
        star.className = 'star';
        star.setAttribute('role', 'button');
        star.setAttribute('aria-label', `Favourite ${f.label}`);
        const paint = () => { const on = favs().has(f.id); star.textContent = on ? '\u2605' : '\u2606'; star.classList.toggle('on', on); };
        paint();
        star.addEventListener('click', (e) => {
          e.stopPropagation();
          const set = favs();
          if (set.has(f.id)) set.delete(f.id); else set.add(f.id);
          state.favFonts = [...set].join(',');
          storage.save();
          paint();
        });
        const s = document.createElement('span');
        s.className = 'pick-sample';
        s.style.fontFamily = `"${familyOf(f)}", cursive`;
        s.style.color = inkColor();
        s.textContent = sample;
        const n = document.createElement('span');
        n.className = 'pick-name';
        n.textContent = `${f.label} \u00B7 ${f.style}`;
        el.append(star, s, n);
      },
      onApply: (id) => { state.font = id; syncUI(); scheduleRender(0); },
    });
  }

  function openInkPicker() {
    let custom = state.customInk;
    const items = [...HT.INKS, { id: 'custom', label: 'Custom colour', color: custom }];
    HT.Modal.open({
      title: 'Choose ink',
      subtitle: 'The colour of your pen. Tap one, then Apply.',
      items,
      value: state.ink,
      gridClass: 'grid-swatches',
      label: (i) => (i && i.label ? `Selected: ${i.label}` : ''),
      render: (ink, el) => {
        const dot = document.createElement('span');
        dot.className = 'pick-dot';
        dot.style.background = ink.id === 'custom' ? custom : ink.color;
        const w = document.createElement('span');
        w.className = 'pick-sample small';
        w.style.fontFamily = `"${familyOf(findFont(state.font))}", cursive`;
        w.style.color = ink.id === 'custom' ? custom : ink.color;
        w.textContent = 'Handwritten notes';
        const n = document.createElement('span');
        n.className = 'pick-name';
        n.textContent = ink.label;
        el.append(dot, w, n);
        if (ink.id === 'custom') {
          const input = document.createElement('input');
          input.type = 'color';
          input.value = custom;
          input.className = 'pick-color';
          input.setAttribute('aria-label', 'Custom ink colour');
          input.addEventListener('input', () => { custom = input.value; dot.style.background = custom; w.style.color = custom; });
          input.addEventListener('click', (e) => e.stopPropagation());
          el.appendChild(input);
        }
      },
      onApply: (id) => { state.ink = id; if (id === 'custom') state.customInk = custom; syncUI(); scheduleRender(0); },
    });
  }

  /** Small picture of a paper style for the picker. */
  function paperThumb(canvas, paperId, w, h) {
    // Show the top-left corner of the sheet, zoomed in, so the ruling is clearly visible.
    const p = findPaper(paperId);
    const viewMm = 70;
    const k = w / viewMm;
    canvas.width = w; canvas.height = h;
    HT.Render.drawPaper(canvas.getContext('2d'), { ...state, paper: paperId, output: 'digital', texture: Math.min(40, state.texture) },
      { k, pageW: viewMm, pageH: (h / w) * viewMm, margins: { ...state.margins, left: Math.min(state.margins.left, 24), top: Math.min(state.margins.top, 16) }, lineSpacing: p.lineSpacing });
  }

  let sceneThumbCache = { key: '', urls: {} };
  async function sceneThumbs(paperId) {
    const key = `${paperId}|${state.font}|${state.ink}|${state.customInk}|${plan ? plan.key : ''}`;
    if (sceneThumbCache.key === key) return sceneThumbCache.urls;
    const p = plan || (await computePlan());
    const page = document.createElement('canvas');
    const k = 240 * 0.9 / p.size.w;
    HT.Render.renderPage(page, p.pages[0], 0, { ...p.settings, paper: paperId, output: 'digital' }, { ...p.geo, k }, p.font, p.extrasFor(0));
    const urls = {};
    for (const sc of HT.Photo.SCENES) {
      const c = HT.Photo.compose(page, p.size, sc.id, 240, 1);
      urls[sc.id] = c.toDataURL('image/jpeg', 0.85);
      c.width = c.height = 1;
    }
    sceneThumbCache = { key, urls };
    return urls;
  }

  function openPaperPicker() {
    const value = { mode: state.mode, paper: state.paper, scene: state.scene };
    HT.Modal.open({
      title: 'Paper & photo',
      subtitle: 'Print gives a flat page for printing or sharing. Photo shows your page photographed in a real scene.',
      label: () => `Selected: ${findPaper(value.paper).label.split(' \u2014 ')[0]}${value.mode === 'photo' ? ` \u00B7 photo: ${HT.Photo.SCENES.find((x) => x.id === value.scene).label}` : ''}`,
      body: (el, api) => {
        api.value = value;
        const seg = document.createElement('div');
        seg.className = 'segmented';
        const build = () => {
          el.querySelectorAll('.pick-section').forEach((n) => n.remove());
          // paper grid
          const sec = document.createElement('section');
          sec.className = 'pick-section';
          sec.innerHTML = '<h3>Paper</h3>';
          const grid = document.createElement('div');
          grid.className = 'pick-grid grid-thumbs';
          HT.PAPERS.forEach((pp) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pick';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(pp.id === value.paper));
            const c = document.createElement('canvas');
            c.className = 'pick-thumb';
            paperThumb(c, pp.id, 120, 170);
            const n = document.createElement('span');
            n.className = 'pick-name';
            n.textContent = pp.label.split(' \u2014 ')[0];
            b.append(c, n);
            b.addEventListener('click', () => { value.paper = pp.id; api.value = value; grid.querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-checked', String(x === b))); if (value.mode === 'photo') build(); });
            b.addEventListener('dblclick', () => { value.paper = pp.id; api.apply(); });
            grid.appendChild(b);
          });
          sec.appendChild(grid);
          el.appendChild(sec);
          if (value.mode !== 'photo') return;
          // scene grid
          const ss = document.createElement('section');
          ss.className = 'pick-section';
          ss.innerHTML = '<h3>Photo scene</h3>';
          const sg = document.createElement('div');
          sg.className = 'pick-grid grid-scenes';
          HT.Photo.SCENES.forEach((sc) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pick';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', String(sc.id === value.scene));
            const img = document.createElement('img');
            img.className = 'pick-scene';
            img.alt = '';
            const n = document.createElement('span');
            n.className = 'pick-name';
            n.textContent = sc.label;
            b.append(img, n);
            b.addEventListener('click', () => { value.scene = sc.id; api.value = value; sg.querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-checked', String(x === b))); });
            b.addEventListener('dblclick', () => { value.scene = sc.id; api.apply(); });
            sg.appendChild(b);
          });
          ss.appendChild(sg);
          el.appendChild(ss);
          sceneThumbs(value.paper).then((urls) => { sg.querySelectorAll('img').forEach((img, i) => { img.src = urls[HT.Photo.SCENES[i].id]; }); });
        };
        [['print', '\uD83D\uDCC4 Print (flat page)'], ['photo', '\uD83D\uDCF7 Photo (realistic scene)']].forEach(([m, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.setAttribute('aria-selected', String(value.mode === m));
          b.addEventListener('click', () => { value.mode = m; api.value = value; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b))); build(); });
          seg.appendChild(b);
        });
        el.appendChild(seg);
        build();
      },
      onApply: (v) => {
        if (v.paper !== state.paper) state.lineSpacing = findPaper(v.paper).lineSpacing; // each paper has its own ruling
        state.paper = v.paper;
        state.mode = v.mode;
        state.scene = v.scene;
        syncUI();
        scheduleRender(0);
      },
    });
  }

  function openSizePicker() {
    HT.Modal.open({
      title: 'Page size',
      subtitle: 'The size of the paper. Margins are adjusted to suit it.',
      items: HT.PAGE_SIZES,
      value: state.pageSize,
      gridClass: 'grid-sizes',
      label: (s) => (s && s.label ? `Selected: ${s.label}` : ''),
      render: (sz, el) => {
        const box = document.createElement('span');
        box.className = 'pick-page';
        box.style.width = `${sz.w / 3.2}px`;
        box.style.height = `${sz.h / 3.2}px`;
        const n = document.createElement('span');
        n.className = 'pick-name';
        n.textContent = sz.label;
        el.append(box, n);
      },
      onApply: (id) => {
        state.pageSize = id;
        if (id === 'note') Object.assign(state.margins, { top: 14, right: 8, bottom: 8, left: 12 });
        else if (id === 'a5') Object.assign(state.margins, { top: 20, right: 12, bottom: 12, left: 22 });
        else Object.assign(state.margins, HT.DEFAULTS.margins);
        syncUI();
        scheduleRender(0);
      },
    });
  }

  function openShortcuts() {
    HT.Modal.open({
      title: 'Keyboard shortcuts',
      body: (el) => {
        const rows = [
          ['Ctrl/\u2318 + Enter', 'Download PDF'], ['Ctrl/\u2318 + P', 'Print'], ['Ctrl/\u2318 + S', 'Save in this browser'],
          ['Ctrl/\u2318 + O', 'Upload a file'], ['\u2190 / \u2192', 'Previous / next page (outside the text box)'],
          ['Esc', 'Close a window'], ['?', 'Show these shortcuts'],
        ];
        const t = document.createElement('table');
        t.className = 'shortcuts';
        rows.forEach(([k, v]) => { const tr = t.insertRow(); tr.insertCell().innerHTML = `<kbd>${k}</kbd>`; tr.insertCell().textContent = v; });
        el.appendChild(t);
      },
    });
  }

  /** Refresh the picker buttons so they show the current choice. */
  function updatePickerButtons() {
    const f = findFont(state.font);
    const fv = $('pickFontValue');
    fv.textContent = f.label;
    fv.style.fontFamily = `"${familyOf(f)}", cursive`;
    const inkLabel = state.ink === 'custom' ? 'Custom' : (HT.INKS.find((i) => i.id === state.ink) || HT.INKS[0]).label;
    $('pickInkSwatch').style.background = inkColor();
    $('pickInkValue').textContent = inkLabel;
    paperThumb($('pickPaperThumb'), state.paper, 36, 48);
    $('pickPaperValue').textContent = `${findPaper(state.paper).label.split(' \u2014 ')[0]}${state.mode === 'photo' ? ' \u00B7 \uD83D\uDCF7 Photo' : ''}`;
    $('pickSizeValue').textContent = findSize(state.pageSize).label;
  }

  // ---------------- your own handwriting font ----------------
  const customFonts = [];
  const allFonts = () => [...HT.FONTS, ...customFonts];
  const idb = {
    open() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('no IndexedDB')); return; }
        const r = indexedDB.open('handtext-pro', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('fonts', { keyPath: 'id' });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async all() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const q = db.transaction('fonts').objectStore('fonts').getAll();
        q.onsuccess = () => resolve(q.result || []);
        q.onerror = () => reject(q.error);
      });
    },
    async put(rec) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('fonts', 'readwrite');
        t.objectStore('fonts').put(rec);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
  };

  async function registerUserFont(rec) {
    const font = { id: rec.id, label: rec.name, style: 'Your font', user: true };
    const info = { family: familyOf(font), norm: 1, ok: false };
    info.ready = new FontFace(info.family, rec.data).load().then((face) => {
      document.fonts.add(face);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `100px "${info.family}"`;
      const visual = (ctx.measureText('x').actualBoundingBoxAscent + ctx.measureText('H').actualBoundingBoxAscent) / 200;
      if (visual > 0.2) info.norm = Math.min(1.6, Math.max(0.65, TARGET_VISUAL_SIZE / visual));
      info.ok = true;
    });
    fontInfo.set(font.id, info);
    await info.ready;
    if (!customFonts.some((f) => f.id === font.id)) customFonts.push(font);
    return font;
  }

  const userFontsReady = (async () => {
    try { for (const rec of await idb.all()) await registerUserFont(rec).catch(() => {}); } catch { /* no storage: fine */ }
  })();

  async function uploadFont(file) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { setStatus('Choose a font file: .ttf, .otf, .woff or .woff2 (a photo of handwriting won\u2019t work).', true); return; }
    if (file.size > 15 * 1024 * 1024) { setStatus('That font file is over 15 MB.', true); return; }
    try {
      const data = await file.arrayBuffer();
      const rec = { id: `user-${Date.now().toString(36)}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), data };
      const font = await registerUserFont(rec);
      try { await idb.put(rec); } catch { /* saved for this session only */ }
      state.font = font.id;
      syncUI();
      scheduleRender(0);
      setStatus(`Added your font \u201C${font.label}\u201D. It's saved in this browser and listed under \u201CYour font\u201D.`);
    } catch {
      setStatus("That file couldn't be used as a font.", true);
    }
  }

  // ---------------- marks toolbar & paste ----------------
  function wrapSelection(kind) {
    const ta = $('text');
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e);
    let before, after, placeholder;
    if (kind === 'bold') { before = '**'; after = '**'; placeholder = 'bold words'; }
    else if (kind === 'math') { before = '$'; after = '$'; placeholder = 'x^2 + y^2'; }
    else if (kind === 'table') {
      // A table goes on its own lines, after the line the cursor is on.
      const nl = ta.value.indexOf('\n', e);
      const at = nl === -1 ? ta.value.length : nl;
      const lineHasText = ta.value.slice(ta.value.lastIndexOf('\n', at - 1) + 1, at).trim().length > 0;
      const tpl = `${lineHasText ? '\n' : ''}| Heading 1 | Heading 2 |\n|---|---|\n| Cell | Cell |\n| Cell | Cell |${nl === -1 ? '\n' : ''}`;
      ta.setRangeText(tpl, at, at, 'end');
      afterEdit(ta);
      return;
    } else { before = `{${kind}:`; after = '}'; placeholder = 'words'; }
    const inner = sel || placeholder;
    ta.setRangeText(before + inner + after, s, e, 'end');
    if (!sel) { ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + inner.length; }
    afterEdit(ta);
  }

  function afterEdit(ta) {
    ta.focus();
    state.text = ta.value;
    updateTextMeta();
    scheduleRender(0);
  }

  function handlePaste(e) {
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    if (!html || !/<(h[1-6]|li|strong|b|table|tr)\b/i.test(html)) return; // plain text: let the browser paste it
    let md;
    try { md = HT.Import.htmlToMarkup(html).text; } catch { return; }
    if (!md.trim()) return;
    e.preventDefault();
    const ta = $('text');
    undoText = ta.value;
    ta.setRangeText(md, ta.selectionStart, ta.selectionEnd, 'end');
    afterEdit(ta);
    $('undoBtn').hidden = false;
    setStatus('Pasted with headings, lists, bold and tables kept. Press Undo to undo.');
  }

    const RANGES = {
    fontSize:    (v) => `${v} pt`,
    wordSpacing: (v) => `${v}%`,
    lineSpacing: (v) => `${(+v).toFixed(1)} mm`,
    movement:    (v) => `${v}`,
    variation:   (v) => `${v}`,
    inkflow:     (v) => `${v}`,
    texture:     (v) => `${v}`,
  };
  const MARGIN_INPUTS = { mTop: 'top', mBottom: 'bottom', mLeft: 'left', mRight: 'right' };
  const HEADER_INPUTS = { hName: 'name', hRoll: 'roll', hSubject: 'subject', hDate: 'date' };
  // On/off switches — each id matches a boolean in state.
  const SWITCHES = ['autoDownload', 'plainPen', 'pageNumbers', 'letterShape', 'fatigue'];

  function syncUI() {
    if ($('text').value !== state.text) $('text').value = state.text;
    for (const [id, fmt] of Object.entries(RANGES)) {
      $(id).value = state[id];
      $(id + 'Out').textContent = fmt(state[id]);
    }
    for (const [id, side] of Object.entries(MARGIN_INPUTS)) {
      if (document.activeElement !== $(id)) $(id).value = Math.round(state.margins[side] * 10) / 10;
    }
    for (const [id, key] of Object.entries(HEADER_INPUTS)) {
      if ($(id).value !== state.header[key]) $(id).value = state.header[key];
    }
    $('headerOn').value = state.headerOn;
    $('output').value = state.output;
    $('outputHelp').textContent = OUTPUT_HELP[state.output] || '';
    for (const key of SWITCHES) $(key).checked = !!state[key];
    $('lineStep').value = String(state.lineStep);
    $('quality').value = state.quality;
    $('imageFormat').value = state.imageFormat;
    $('customInk').value = state.customInk;
    updatePickerButtons();
    document.querySelectorAll('[data-preset]').forEach((b) => {
      const p = HT.PRESETS[b.dataset.preset];
      b.setAttribute('aria-pressed', String(Object.keys(p).every((k) => state[k] === p[k])));
    });
    $('undoBtn').hidden = undoText === null;
    updateTextMeta();
    updateSummaries();
  }

  /** Short "current setting" text shown on each collapsed section header. */
  function updateSummaries() {
    const ink = state.ink === 'custom' ? 'custom ink' : (HT.INKS.find((i) => i.id === state.ink) || HT.INKS[0]).label.toLowerCase();
    $('sumHand').textContent = `${findFont(state.font).label} \u00B7 ${ink}${state.plainPen ? ' \u00B7 single pen' : ''}`;
    const outLabel = { digital: 'for screen', white: 'for white paper', ink: 'writing only' }[state.output] || '';
    $('sumPaper').textContent = `${findPaper(state.paper).label.split(' \u2014 ')[0]} \u00B7 ${findSize(state.pageSize).label.split(' (')[0]} \u00B7 ${outLabel}`;
    const preset = Object.keys(HT.PRESETS).find((n) => Object.keys(HT.PRESETS[n]).every((k) => state[k] === HT.PRESETS[n][k]));
    const extras = [state.letterShape && 'shapes', state.fatigue && 'tiredness'].filter(Boolean);
    $('sumReal').textContent = [preset ? preset[0].toUpperCase() + preset.slice(1) : 'Custom', ...extras].join(' \u00B7 ');
    const h = state.header;
    const filled = [h.name, h.roll, h.subject, h.date].filter((v) => v && v.trim()).length;
    $('sumDetails').textContent = state.headerOn === 'off' || !filled
      ? (state.pageNumbers ? 'page numbers' : 'off')
      : `${h.name.trim() || 'details'}${state.headerOn === 'all' ? ' \u00B7 every page' : ''}${state.pageNumbers ? ' \u00B7 page no.' : ''}`;
    $('sumText').textContent = state.text.trim() ? `${state.text.trim().split(/\s+/).length.toLocaleString()} words` : 'empty';
    $('sumDl').textContent = `${{ standard: '150 DPI', high: '300 DPI', ultra: '4K' }[state.quality]} \u00B7 ${{ jpg: 'JPG', png: 'PNG', 'png-clear': 'clear PNG' }[state.imageFormat]}`;
  }

  function bindControls() {
    $('text').addEventListener('input', (e) => { state.text = e.target.value; updateTextMeta(); scheduleRender(); });

    for (const id of Object.keys(RANGES)) {
      $(id).addEventListener('input', (e) => {
        state[id] = +e.target.value;
        $(id + 'Out').textContent = RANGES[id](state[id]);
        if (['movement', 'variation', 'inkflow', 'texture'].includes(id)) syncUI();
        scheduleRender();
      });
    }
    for (const [id, side] of Object.entries(MARGIN_INPUTS)) {
      $(id).addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) { state.margins[side] = Math.max(0, Math.min(80, v)); scheduleRender(); }
      });
      $(id).addEventListener('blur', () => syncUI());
    }
    for (const [id, key] of Object.entries(HEADER_INPUTS)) {
      $(id).addEventListener('input', (e) => {
        state.header[key] = e.target.value.slice(0, 80);
        // Typing details while they're switched off would do nothing — switch them on.
        if (state.headerOn === 'off' && e.target.value.trim()) { state.headerOn = 'first'; $('headerOn').value = 'first'; }
        scheduleRender();
      });
    }
    $('todayBtn').addEventListener('click', () => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      state.header.date = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
      if (state.headerOn === 'off') state.headerOn = 'first';
      syncUI();
      scheduleRender(0);
    });
    $('headerOn').addEventListener('change', (e) => { state.headerOn = e.target.value; scheduleRender(0); });
    for (const key of SWITCHES) {
      $(key).addEventListener('change', (e) => {
        state[key] = e.target.checked;
        updateSummaries();
        if (key === 'autoDownload') storage.save();
        else scheduleRender(0);
      });
    }

    $('pickFont').addEventListener('click', openFontPicker);
    $('pickInk').addEventListener('click', openInkPicker);
    $('pickPaper').addEventListener('click', openPaperPicker);
    $('pickSize').addEventListener('click', openSizePicker);
    $('lineStep').addEventListener('change', (e) => { state.lineStep = +e.target.value; scheduleRender(0); });
    document.querySelectorAll('[data-wrap]').forEach((b) => b.addEventListener('click', () => wrapSelection(b.dataset.wrap)));
    $('text').addEventListener('paste', handlePaste);
    $('fontUploadBtn').addEventListener('click', () => $('fontFile').click());
    $('fontFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) uploadFont(f); });
    $('quality').addEventListener('change', (e) => { state.quality = e.target.value; storage.save(); updateSummaries(); });
    $('imageFormat').addEventListener('change', (e) => { state.imageFormat = e.target.value; storage.save(); updateSummaries(); });

    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      Object.assign(state, HT.PRESETS[b.dataset.preset]);
      syncUI();
      scheduleRender(0);
    }));

    // Text toolbar
    $('breakBtn').addEventListener('click', () => {
      const ta = $('text');
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const before = ta.value.slice(0, start);
      const insert = (before && !before.endsWith('\n') ? '\n' : '') + HT.PAGE_BREAK + '\n';
      ta.setRangeText(insert, start, end, 'end');
      ta.focus();
      state.text = ta.value;
      updateTextMeta();
      scheduleRender(0);
    });
    $('sampleBtn').addEventListener('click', () => replaceText(HT.SAMPLE_TEXT, 'handwritten-notes'));
    $('stripBtn').addEventListener('click', () => {
      const cleaned = HT.Layout.stripMarks(state.text);
      if (cleaned === state.text) { setStatus('There are no ** or # marks to remove.'); return; }
      replaceText(cleaned, docName);
      setStatus('Removed the ** and # marks. Press Undo to bring them back.');
    });
    $('clearBtn').addEventListener('click', () => { replaceText('', 'handwritten-notes'); $('text').focus(); });
    $('undoBtn').addEventListener('click', () => {
      if (undoText === null) return;
      state.text = undoText;
      undoText = null;
      docName = 'handwritten-notes';
      syncUI();
      scheduleRender(0);
      setStatus('Restored your previous text.');
    });

    // Downloads
    $('pdfBtn').addEventListener('click', () => busy($('pdfBtn'), downloadPdf));
    $('imgBtn').addEventListener('click', () => busy($('imgBtn'), downloadImages));
    $('printBtn').addEventListener('click', () => busy($('printBtn'), printPages));
    window.addEventListener('keydown', (e) => {
      if (HT.Modal.isOpen()) return;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      const key = e.key.toLowerCase();
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if (mod && !e.shiftKey && key === 'p') { e.preventDefault(); busy($('printBtn'), printPages); }
      else if (mod && key === 'enter') { e.preventDefault(); busy($('pdfBtn'), downloadPdf); }
      else if (mod && key === 's') { e.preventDefault(); storage.save(); setStatus('Saved in this browser.'); }
      else if (mod && key === 'o') { e.preventDefault(); $('importFile').click(); }
      else if (!typing && !mod && e.key === '?') { e.preventDefault(); openShortcuts(); }
      else if (!typing && !mod && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        if (simMode) { $(e.key === 'ArrowRight' ? 'simNext' : 'simPrev').click(); return; }
        const pages = [...$('pages').children];
        if (!pages.length) return;
        const y = window.innerHeight * 0.3;
        let idx = pages.findIndex((p) => p.getBoundingClientRect().bottom > y);
        if (idx < 0) idx = pages.length - 1;
        idx = Math.max(0, Math.min(pages.length - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)));
        pages[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Mobile tabs
    $('tabEdit').addEventListener('click', () => switchView('edit'));
    $('tabPreview').addEventListener('click', () => switchView('preview'));

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!plan) return;
        const k = Math.round(computePreviewK(plan) * 4) / 4;
        if (Math.abs(k - previewK) > 0.5) renderPreview();
      }, 300);
    });
  }

  /** Replace the text, keeping the old text so the user can undo. */
  function replaceText(text, name) {
    if (state.text.trim() && state.text !== text) undoText = state.text;
    state.text = text;
    docName = name || 'handwritten-notes';
    syncUI();
    scheduleRender(0);
  }

  function switchView(view) {
    document.body.dataset.view = view;
    $('tabEdit').setAttribute('aria-selected', String(view === 'edit'));
    $('tabPreview').setAttribute('aria-selected', String(view === 'preview'));
    if (view === 'preview') {
      window.scrollTo({ top: 0 });
      renderPreview(); // the preview may have been hidden; recompute its size
    }
  }

  // ---------------- upload ----------------
  let importing = false;

  function bindUpload() {
    const dz = $('dropzone');
    const input = $('importFile');
    dz.addEventListener('click', () => { if (!importing) input.click(); });
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!importing) input.click(); }
    });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (file) handleFile(file);
    });

    // Drag and drop anywhere on the page.
    const overlay = $('dragOverlay');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      overlay.hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) overlay.hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.hidden = true;
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  async function handleFile(file) {
    if (importing) return;
    importing = true;
    const dz = $('dropzone');
    dz.classList.add('busy');
    dz.setAttribute('aria-busy', 'true');
    setStatus(`Reading ${file.name}\u2026`);
    try {
      const res = await HT.Import.importFile(file, (m) => setStatus(m));
      replaceText(res.text, `${HT.Export.safeName(file.name)}-handwritten`);
      clearTimeout(timer);
      const p = (await renderPreview()) || plan;
      storage.save();
      if (isNarrow()) switchView('preview');
      const n = p ? p.pages.length : 0;
      const summary = `${file.name} \u2192 ${n} handwritten ${n === 1 ? 'page' : 'pages'}.${res.note ? ' ' + res.note : ''}`;
      if (state.autoDownload) {
        await busy($('pdfBtn'), downloadPdf);
        if (!$('status').classList.contains('error')) setStatus(`${summary} PDF downloaded \u2014 ready to print.`);
      } else {
        setStatus(`${summary} Check the preview, then Download PDF or Print.`);
      }
    } catch (err) {
      setStatus(err && err.message ? err.message : `Couldn't read ${file.name}.`, true);
    } finally {
      importing = false;
      dz.classList.remove('busy');
      dz.removeAttribute('aria-busy');
    }
  }

  // ---------------- downloads ----------------
  const EXPORT_BUTTONS = ['pdfBtn', 'imgBtn', 'printBtn'];
  let exporting = false;

  async function busy(button, fn) {
    if (exporting) return;
    exporting = true;
    const label = button.textContent;
    EXPORT_BUTTONS.forEach((id) => { $(id).disabled = true; });
    button.textContent = 'Preparing\u2026';
    try {
      await fn();
    } catch (err) {
      console.error(err);
      setStatus(`Something went wrong: ${err && err.message ? err.message : err}. Try Standard quality, or fewer pages.`, true);
    } finally {
      EXPORT_BUTTONS.forEach((id) => { $(id).disabled = false; });
      button.textContent = label;
      HT.Render.releaseMemory();
      exporting = false;
    }
  }

  async function freshPlan() {
    clearTimeout(timer);
    const p = await renderPreview();
    storage.save();
    return p || plan;
  }

  async function downloadPdf() {
    const p = await freshPlan();
    const k = EXPORT_K[state.quality] || EXPORT_K.high;
    const name = await HT.Export.pdf(exportJob(p, k), docName, (m) => setStatus(m));
    setStatus(`Saved ${name} (${p.pages.length} ${p.pages.length === 1 ? 'page' : 'pages'}).`);
  }

  async function downloadImages() {
    const p = await freshPlan();
    const k = EXPORT_K[state.quality] || EXPORT_K.high;
    const clear = state.imageFormat === 'png-clear' && state.mode !== 'photo';
    const name = await HT.Export.images(exportJob(p, k, clear ? { transparent: true } : null), clear ? 'png' : state.imageFormat === 'png-clear' ? 'png' : state.imageFormat, docName, (m) => setStatus(m));
    setStatus(`Saved ${name}.`);
  }

  async function printPages() {
    const p = await freshPlan();
    const urls = await HT.Export.pageUrls(exportJob(p, PRINT_K), (m) => setStatus(m));
    const area = $('printArea');
    area.textContent = '';
    const imgs = urls.map((u, i) => {
      const img = new Image();
      img.alt = `Page ${i + 1}`;
      img.src = u;
      area.appendChild(img);
      return img;
    });
    await Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())));
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      area.textContent = '';
      urls.forEach((u) => URL.revokeObjectURL(u));
      document.body.classList.remove('print-images');
      window.removeEventListener('afterprint', cleanup);
    };
    document.body.classList.add('print-images');
    window.addEventListener('afterprint', cleanup);
    setStatus('');
    window.print();
    // Some mobile browsers return from print() immediately and never fire afterprint.
    setTimeout(cleanup, 120000);
  }

  // ---------------- print check (simulated print) ----------------
  const PS = HT.PrintSim;
  const OUTPUT_HELP = {
    digital: 'Best for uploading or submitting online. If you print this, the paper colour and texture come out as a grey tint with a white frame.',
    white: 'Clean ruled lines and writing on pure white \u2014 no grey tint when printed. Print on plain white paper.',
    ink: 'Only the writing is printed. Put ruled notebook paper in the printer, and match Line spacing and the Top margin to your paper so words sit on its lines.',
  };
  const simDoc = { kind: 'pages', name: '', pdf: null, image: null };
  let simMode = false;
  let simPage = 0;
  let simSeq = 0;
  let simTimer = null;

  function fillSimSelect(id, items) {
    const sel = $(id);
    items.forEach((it) => { const o = document.createElement('option'); o.value = it.id; o.textContent = it.label; sel.appendChild(o); });
  }

  function simCount() {
    if (simDoc.kind === 'pdf') return simDoc.pdf.numPages;
    if (simDoc.kind === 'image') return 1;
    return plan ? plan.pages.length : 0;
  }

  function sheetFor(srcMm) {
    const sh = PS.SHEETS.find((s) => s.id === state.sim.sheet) || PS.SHEETS[0];
    if (sh.w) return { w: sh.w, h: sh.h, label: sh.label.split(' (')[0] };
    // "Same as document": snap to a standard paper size when it's close, else use the page's own size.
    const match = PS.SHEETS.find((s) => s.w && Math.abs(s.w - srcMm.w) < 3 && Math.abs(s.h - srcMm.h) < 3);
    return match ? { w: match.w, h: match.h, label: match.label.split(' (')[0] } : { w: srcMm.w, h: srcMm.h, label: 'custom' };
  }

  async function simSource(i, dpi) {
    const k = dpi / 25.4;
    const canvas = document.createElement('canvas');
    if (simDoc.kind === 'pdf') {
      const page = await simDoc.pdf.getPage(i + 1);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: dpi / 72 });
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: c, viewport: vp }).promise;
      return { canvas, mm: { w: (v1.width / 72) * 25.4, h: (v1.height / 72) * 25.4 } };
    }
    if (simDoc.kind === 'image') {
      // A photo has no physical size; print shops fit it to the sheet.
      const img = simDoc.image;
      const sheet = sheetFor({ w: 210, h: 297 });
      const s = Math.min(sheet.w / img.width, sheet.h / img.height);
      const mm = { w: img.width * s, h: img.height * s };
      canvas.width = Math.round(mm.w * k); canvas.height = Math.round(mm.h * k);
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
      c.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { canvas, mm, sheetHint: sheet };
    }
    const p = plan;
    renderOutput(p, i, canvas, k);
    return { canvas, mm: { w: p.outSize.w, h: p.outSize.h } };
  }

  function simOptions() {
    return {
      ...state.sim,
      ruling: plan ? { settings: plan.settings, margins: plan.geo.margins, lineSpacing: plan.geo.lineSpacing } : null,
    };
  }

  async function simulatePage(i, dpi) {
    const src = await simSource(i, dpi);
    const sheet = src.sheetHint || sheetFor(src.mm);
    const res = PS.simulate(src.canvas, src.mm, sheet, simOptions(), dpi);
    src.canvas.width = src.canvas.height = 1;
    return { ...res, sheet, srcMm: src.mm };
  }

  function scheduleSim(delay = 200) {
    if (!simMode) return;
    clearTimeout(simTimer);
    simTimer = setTimeout(renderSim, delay);
  }

  function simAdvice(cut) {
    const box = $('simAdvice');
    box.textContent = '';
    const add = (msg, actions) => {
      const p = document.createElement('span');
      p.textContent = msg;
      box.appendChild(p);
      (actions || []).forEach(([label, fn]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', fn);
        box.appendChild(b);
      });
    };
    if (simDoc.kind === 'pages') {
      if (state.output === 'digital') {
        add('These pages have a coloured paper background and texture, made for screens. On a printer that turns into a grey tint, and the edge the printer can\u2019t reach stays white.', [
          ['Print on plain white paper', () => setOutput('white')],
          ['Print onto notebook paper', () => setOutput('ink')],
        ]);
      } else if (state.output === 'ink' && state.sim.paper !== 'ruled') {
        add('You\u2019re printing the writing only, so put ruled notebook paper in the printer.', [
          ['Show it on ruled paper', () => { state.sim.paper = 'ruled'; syncSimUI(); scheduleSim(0); storage.save(); }],
        ]);
      } else if (plan) {
        const m = plan.geo.margins;
        const reach = (+state.sim.margin || 0) + (+state.sim.padding || 0);
        if (state.sim.scaling === 'actual' && Math.min(m.left, m.right, m.top, m.bottom) < reach) {
          add(`Some of your page margin is narrower than the printer margin (${reach.toFixed(1)} mm), so writing near the edge could be cut off.`, [
            ['Use Fit to printable area', () => { state.sim.scaling = 'fit'; syncSimUI(); scheduleSim(0); storage.save(); }],
          ]);
        }
      }
    } else if (cut > 0.3 && state.sim.scaling === 'actual') {
      add('Part of this document\u2019s edge falls where the printer can\u2019t print.', [
        ['Use Fit to printable area', () => { state.sim.scaling = 'fit'; syncSimUI(); scheduleSim(0); storage.save(); }],
      ]);
    }
    box.hidden = !box.childNodes.length;
  }

  function setOutput(v) {
    state.output = v;
    syncUI();
    scheduleRender(0);
    storage.save();
  }

  async function renderSim() {
    if (!simMode) return;
    const seq = ++simSeq;
    if (simDoc.kind === 'pages' && !plan) await renderPreview();
    const count = simCount();
    if (!count) return;
    simPage = Math.max(0, Math.min(count - 1, simPage));
    const zoom = state.sim.zoom;
    const dpi = zoom === '200' ? 260 : zoom === 'actual' ? 200 : Math.min(170, Math.round(110 * Math.min(2, window.devicePixelRatio || 1)));
    const sheetEl = $('simSheetEl');
    sheetEl.classList.add('busy');
    await new Promise((r) => setTimeout(r, 20));
    try {
      const res = await simulatePage(simPage, dpi);
      if (seq !== simSeq) { res.canvas.width = res.canvas.height = 1; return; }
      const cv = $('simCanvas');
      cv.width = res.canvas.width; cv.height = res.canvas.height;
      cv.getContext('2d').drawImage(res.canvas, 0, 0);
      res.canvas.width = res.canvas.height = 1;

      const { sheet, placement: pl } = res;
      if (zoom === 'fit') { sheetEl.style.width = `min(100%, calc((85vh - 56px) * ${sheet.w / sheet.h}))`; }
      else sheetEl.style.width = `${sheet.w * (zoom === '200' ? 2 : 1)}mm`;
      sheetEl.style.aspectRatio = `${sheet.w} / ${sheet.h}`;
      const area = $('simArea');
      area.hidden = !state.sim.showArea;
      area.style.left = `${(pl.printable.x / sheet.w) * 100}%`;
      area.style.top = `${(pl.printable.y / sheet.h) * 100}%`;
      area.style.width = `${(pl.printable.w / sheet.w) * 100}%`;
      area.style.height = `${(pl.printable.h / sheet.h) * 100}%`;

      const info = PS.describe(res.srcMm, sheet, state.sim);
      const printer = PS.PRINTERS.find((p) => p.id === state.sim.printer) || PS.PRINTERS[0];
      $('simSummary').textContent = `${printer.color ? 'Colour' : 'Black & white'} print on ${sheet.label} paper. ${info.text}`;
      $('simPageInfo').textContent = `Page ${simPage + 1} of ${count}`;
      $('simPrev').disabled = simPage === 0;
      $('simNext').disabled = simPage >= count - 1;
      simAdvice(info.cut);
    } catch (err) {
      console.error(err);
      setStatus(`Print check failed: ${err.message || err}`, true);
    } finally {
      if (seq === simSeq) sheetEl.classList.remove('busy');
    }
  }

  function syncSimUI() {
    const s = state.sim;
    $('simSource').value = simDoc.kind === 'pages' ? 'pages' : 'file';
    $('simPrinter').value = s.printer;
    $('simPaper').value = s.paper;
    $('simSheet').value = s.sheet;
    $('simScaling').value = s.scaling;
    $('simScaleField').hidden = s.scaling !== 'custom';
    if (document.activeElement !== $('simScale')) $('simScale').value = s.scale;
    if (document.activeElement !== $('simMargin')) $('simMargin').value = s.margin;
    if (document.activeElement !== $('simPadding')) $('simPadding').value = s.padding;
    $('simDensity').value = s.density;
    $('simDensityOut').textContent = `${s.density}%`;
    $('simShowArea').checked = s.showArea;
    $('simZoom').value = s.zoom;
    if (simDoc.kind !== 'pages') $('simSource').options[1].textContent = simDoc.name;
    else $('simSource').options[1].textContent = 'Another PDF or image\u2026';
  }

  function setMode(mode) {
    simMode = mode === 'sim';
    document.body.dataset.mode = simMode ? 'sim' : 'pages';
    $('modePages').setAttribute('aria-selected', String(!simMode));
    $('modeSim').setAttribute('aria-selected', String(simMode));
    $('simPanel').hidden = !simMode;
    if (simMode) { syncSimUI(); renderSim(); }
  }

  async function openSimFile(file) {
    const name = file.name || 'file';
    const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
    const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
    if (!isPdf && !isImg) { setStatus('Print check can open PDFs and images (JPG, PNG).', true); syncSimUI(); return; }
    setStatus(`Opening ${name}\u2026`);
    try {
      if (simDoc.pdf) { simDoc.pdf.destroy(); simDoc.pdf = null; }
      if (isPdf) {
        const pdfjs = await HT.Import.loadPdfJs();
        simDoc.pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
        simDoc.kind = 'pdf';
      } else {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await img.decode();
        simDoc.image = img;
        simDoc.kind = 'image';
      }
      simDoc.name = name;
      simPage = 0;
      setStatus(`Print check: ${name}`);
      syncSimUI();
      renderSim();
    } catch (err) {
      setStatus(err && err.name === 'PasswordException' ? 'That PDF is password-protected.' : `Couldn't open ${name}.`, true);
      syncSimUI();
    }
  }

  function bindSim() {
    fillSimSelect('simPrinter', PS.PRINTERS);
    fillSimSelect('simPaper', PS.PAPERS);
    fillSimSelect('simSheet', PS.SHEETS);
    fillSimSelect('simScaling', PS.SCALINGS);
    $('modePages').addEventListener('click', () => setMode('pages'));
    $('modeSim').addEventListener('click', () => setMode('sim'));
    $('simSource').addEventListener('change', (e) => {
      if (e.target.value === 'file') $('simFile').click();
      else {
        simDoc.kind = 'pages'; simDoc.name = ''; simPage = 0;
        if (simDoc.pdf) { simDoc.pdf.destroy(); simDoc.pdf = null; }
        simDoc.image = null;
        setStatus('');
        syncSimUI(); renderSim();
      }
    });
    $('simFile').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) openSimFile(f); else syncSimUI();
    });
    const bindSel = (id, key) => $(id).addEventListener('change', (e) => { state.sim[key] = e.target.value; syncSimUI(); scheduleSim(0); storage.save(); });
    bindSel('simPrinter', 'printer');
    bindSel('simPaper', 'paper');
    bindSel('simSheet', 'sheet');
    bindSel('simScaling', 'scaling');
    bindSel('simZoom', 'zoom');
    const bindNum = (id, key, lo, hi) => $(id).addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) { state.sim[key] = Math.min(hi, Math.max(lo, v)); scheduleSim(); storage.save(); }
    });
    bindNum('simScale', 'scale', 10, 400);
    bindNum('simMargin', 'margin', 0, 30);
    bindNum('simPadding', 'padding', 0, 50);
    $('simDensity').addEventListener('input', (e) => { state.sim.density = +e.target.value; $('simDensityOut').textContent = `${state.sim.density}%`; scheduleSim(); storage.save(); });
    $('simShowArea').addEventListener('change', (e) => { state.sim.showArea = e.target.checked; $('simArea').hidden = !e.target.checked; storage.save(); });
    $('simPrev').addEventListener('click', () => { simPage--; renderSim(); });
    $('simNext').addEventListener('click', () => { simPage++; renderSim(); });
    $('simSavePng').addEventListener('click', () => busy($('simSavePng'), async () => {
      const res = await simulatePage(simPage, 200);
      const blob = await new Promise((r) => res.canvas.toBlob(r, 'image/png'));
      res.canvas.width = res.canvas.height = 1;
      HT.Export.saveBlob(blob, `print-check-page-${simPage + 1}.png`);
      setStatus(`Saved print-check-page-${simPage + 1}.png`);
    }));
    $('simSavePdf').addEventListener('click', () => busy($('simSavePdf'), async () => {
      const first = await simSource(0, 20);
      const sheet = first.sheetHint || sheetFor(first.mm);
      first.canvas.width = first.canvas.height = 1;
      const job = {
        count: simCount(),
        size: { w: sheet.w, h: sheet.h },
        renderTo: async (i, canvas) => {
          const res = await simulatePage(i, 200);
          canvas.width = res.canvas.width; canvas.height = res.canvas.height;
          canvas.getContext('2d').drawImage(res.canvas, 0, 0);
          res.canvas.width = res.canvas.height = 1;
        },
      };
      const base = simDoc.kind === 'pages' ? docName : HT.Export.safeName(simDoc.name);
      const name = await HT.Export.pdf(job, `${base}-print-check`, (m) => setStatus(m));
      setStatus(`Saved ${name} \u2014 this is how the printout will look.`);
    }));
    $('output').addEventListener('change', (e) => setOutput(e.target.value));
  }

  // ---------------- start ----------------
  function init() {
    $('version').textContent = `v${HT.VERSION.replace(/\.0$/, '')}`;
    restore();
    HT.Modal.init();
    loadFont(findFont(state.font)).then(() => HT.FONTS.forEach(loadFont));
    userFontsReady.then(() => { syncUI(); if (findFont(state.font).user) scheduleRender(0); });
    syncUI();
    bindControls();
    bindUpload();
    bindSim();
    document.body.dataset.view = 'edit';
    document.body.dataset.mode = 'pages';
    renderPreview();
  }

  init();
})();
