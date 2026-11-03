/* HandText Pro — app: state, controls, live preview and downloads. */
(function () {
  'use strict';
  const HT = window.HT;
  const { parse, layout, linesPerPage } = HT.Layout;

  const PREVIEW_K = 5.5;            // px per mm in the on-screen preview (~140 DPI)
  const PRINT_K = 8;                // ~200 DPI when printing
  const EXPORT_K = { standard: 150 / 25.4, high: 300 / 25.4 };
  const STORAGE_KEY = 'handtext-pro:v1';
  // Fonts differ a lot in how big they look at the same size. Each is scaled so the
  // average of its x-height and cap height is 56% of the font size.
  const TARGET_VISUAL_SIZE = 0.56;

  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------------- state ----------------
  const state = clone(HT.DEFAULTS);
  state.text = HT.SAMPLE_TEXT;

  const storage = {
    load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } },
    save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* unavailable */ } },
  };

  function restore() {
    const saved = storage.load();
    if (!saved || typeof saved !== 'object') return;
    for (const key of Object.keys(HT.DEFAULTS)) {
      if (!(key in saved)) continue;
      if (key === 'margins' && saved.margins && typeof saved.margins === 'object') {
        for (const side of ['top', 'right', 'bottom', 'left']) {
          if (Number.isFinite(saved.margins[side])) state.margins[side] = saved.margins[side];
        }
      } else if (typeof saved[key] === typeof HT.DEFAULTS[key]) {
        state[key] = saved[key];
      }
    }
    if (typeof saved.text === 'string') state.text = saved.text;
  }

  const findFont = (id) => HT.FONTS.find((f) => f.id === id) || HT.FONTS[0];
  const findPaper = (id) => HT.PAPERS.find((p) => p.id === id) || HT.PAPERS[0];
  const findSize = (id) => HT.PAGE_SIZES.find((p) => p.id === id) || HT.PAGE_SIZES[0];
  const inkColor = () => (state.ink === 'custom' ? state.customInk : (HT.INKS.find((i) => i.id === state.ink) || HT.INKS[0]).color);

  function setStatus(msg) { $('status').textContent = msg; }

  // ---------------- fonts ----------------
  const fontInfo = new Map(); // id -> { family, norm, ready: Promise }
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
        if (widthCache.size > 50000) widthCache.clear();
        widthCache.set(key, w100);
      }
      return (w100 / 100) * sizeMm;
    };
  }

  // ---------------- layout + render ----------------
  function geometry() {
    const size = findSize(state.pageSize);
    const m = { ...state.margins };
    // Keep at least 30 mm of writing width and 2 lines of height.
    const maxSide = (size.w - 30) / 2;
    m.left = Math.min(Math.max(0, m.left), maxSide);
    m.right = Math.min(Math.max(0, m.right), maxSide);
    m.top = Math.min(Math.max(0, m.top), size.h / 2 - state.lineSpacing);
    m.bottom = Math.min(Math.max(0, m.bottom), size.h / 2 - state.lineSpacing);
    return { size, margins: m };
  }

  async function computePages() {
    const font = findFont(state.font);
    await loadFont(font);
    const info = fontInfo.get(font.id);
    const { size, margins } = geometry();
    const fontSizeMm = (state.fontSize * 25.4) / 72 * info.norm;
    const lpp = linesPerPage(size.h, margins, state.lineSpacing);
    const result = layout(parse(state.text), {
      measure: measurerFor(info.family),
      fontSizeMm,
      lineSpacing: state.lineSpacing,
      wordSpacing: state.wordSpacing,
      contentWidth: size.w - margins.left - margins.right,
      linesPerPage: lpp,
      maxPages: HT.MAX_PAGES,
    });
    const geo = { pageW: size.w, pageH: size.h, margins, lineSpacing: state.lineSpacing, fontSizeMm };
    const fontArg = { family: info.family, cursive: !!font.cursive };
    const settings = { ...state, inkColor: inkColor() };
    return { ...result, geo, fontArg, settings, size, fontOk: info.ok, fontLabel: font.label };
  }

  function drawInto(canvases, plan, k) {
    plan.pages.forEach((page, i) => {
      HT.Render.renderPage(canvases[i], page, i, plan.settings, { ...plan.geo, k }, plan.fontArg);
    });
  }

  function ensurePageEls(count) {
    const wrap = $('pages');
    while (wrap.children.length < count) {
      const div = document.createElement('div');
      div.className = 'page';
      const c = document.createElement('canvas');
      c.setAttribute('role', 'img');
      const no = document.createElement('span');
      no.className = 'pno';
      div.append(c, no);
      wrap.appendChild(div);
    }
    while (wrap.children.length > count) wrap.lastChild.remove();
    return [...wrap.children].map((div, i) => {
      div.querySelector('.pno').textContent = `Page ${i + 1} of ${count}`;
      const c = div.querySelector('canvas');
      c.setAttribute('aria-label', `Handwritten page ${i + 1} of ${count}`);
      return c;
    });
  }

  let renderSeq = 0;
  async function renderPreview() {
    const seq = ++renderSeq;
    const plan = await computePages();
    if (seq !== renderSeq) return null; // superseded by a newer render
    const canvases = ensurePageEls(plan.pages.length);
    drawInto(canvases, plan, PREVIEW_K);

    const n = plan.pages.length;
    $('pageInfo').textContent = `${n} ${n === 1 ? 'page' : 'pages'} · ${plan.size.label}`;
    if (plan.truncated) setStatus(`Only the first ${HT.MAX_PAGES} pages are shown. Split very long text into several documents.`);
    else if (!plan.fontOk) setStatus(`Couldn't load ${plan.fontLabel}; showing a fallback font.`);
    else if (/^(Only the first|Couldn't load)/.test($('status').textContent)) setStatus('');
    return plan;
  }

  function updateTextMeta() {
    const t = state.text.trim();
    const words = t ? t.split(/\s+/).length : 0;
    $('textMeta').textContent = `${words} words · ${state.text.length} characters`;
  }

  let timer = null;
  function scheduleRender(delay = 140) {
    clearTimeout(timer);
    timer = setTimeout(() => { renderPreview(); storage.save(); }, delay);
  }

  // ---------------- controls ----------------
  function buildFontPicker() {
    const box = $('fonts');
    HT.FONTS.forEach((font) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'font-opt';
      b.dataset.font = font.id;
      b.setAttribute('role', 'radio');
      const sample = document.createElement('span');
      sample.className = 'sample';
      sample.textContent = 'Handwritten';
      sample.style.fontFamily = `"${familyOf(font)}", cursive`;
      const name = document.createElement('span');
      name.className = 'fname';
      name.textContent = `${font.label} · ${font.style}`;
      b.append(sample, name);
      b.addEventListener('click', () => { state.font = font.id; syncUI(); scheduleRender(0); });
      box.appendChild(b);
      loadFont(font);
    });
  }

  function buildInks() {
    const box = $('inks');
    const custom = box.querySelector('.custom');
    HT.INKS.forEach((ink) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.ink = ink.id;
      b.title = ink.label;
      b.style.background = ink.color;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `${ink.label} ink`);
      b.addEventListener('click', () => { state.ink = ink.id; syncUI(); scheduleRender(0); });
      box.insertBefore(b, custom);
    });
    custom.dataset.ink = 'custom';
    custom.setAttribute('role', 'radio');
    $('customInk').addEventListener('input', (e) => { state.ink = 'custom'; state.customInk = e.target.value; syncUI(); scheduleRender(); });
  }

  function fillSelect(sel, items) {
    items.forEach((it) => {
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = it.label;
      sel.appendChild(o);
    });
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

  function syncUI() {
    $('text').value !== state.text && ($('text').value = state.text);
    for (const [id, fmt] of Object.entries(RANGES)) {
      $(id).value = state[id];
      $(id + 'Out').textContent = fmt(state[id]);
    }
    for (const [id, side] of Object.entries(MARGIN_INPUTS)) $(id).value = state.margins[side];
    $('paper').value = state.paper;
    $('pageSize').value = state.pageSize;
    $('quality').value = state.quality;
    $('imageFormat').value = state.imageFormat;
    $('customInk').value = state.customInk;
    document.querySelectorAll('.font-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.font === state.font)));
    document.querySelectorAll('#inks [data-ink]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ink === state.ink)));
    document.querySelectorAll('[data-preset]').forEach((b) => {
      const p = HT.PRESETS[b.dataset.preset];
      b.setAttribute('aria-pressed', String(Object.keys(p).every((k) => state[k] === p[k])));
    });
    updateTextMeta();
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
    }

    $('paper').addEventListener('change', (e) => {
      state.paper = e.target.value;
      state.lineSpacing = findPaper(state.paper).lineSpacing; // each paper has its own ruling
      syncUI();
      scheduleRender(0);
    });
    $('pageSize').addEventListener('change', (e) => {
      state.pageSize = e.target.value;
      if (state.pageSize === 'note') Object.assign(state.margins, { top: 14, right: 8, bottom: 8, left: 12 });
      else if (state.pageSize === 'a5') Object.assign(state.margins, { top: 20, right: 12, bottom: 12, left: 22 });
      else Object.assign(state.margins, HT.DEFAULTS.margins);
      syncUI();
      scheduleRender(0);
    });
    $('quality').addEventListener('change', (e) => { state.quality = e.target.value; storage.save(); });
    $('imageFormat').addEventListener('change', (e) => { state.imageFormat = e.target.value; storage.save(); });

    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      Object.assign(state, HT.PRESETS[b.dataset.preset]);
      syncUI();
      scheduleRender(0);
    }));

    // Text toolbar
    $('breakBtn').addEventListener('click', () => {
      const ta = $('text');
      const pos = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, pos);
      const insert = (before && !before.endsWith('\n') ? '\n' : '') + HT.PAGE_BREAK + '\n';
      ta.setRangeText(insert, pos, ta.selectionEnd ?? pos, 'end');
      ta.focus();
      state.text = ta.value;
      updateTextMeta();
      scheduleRender(0);
    });
    $('sampleBtn').addEventListener('click', () => { state.text = HT.SAMPLE_TEXT; syncUI(); scheduleRender(0); });
    $('clearBtn').addEventListener('click', () => { state.text = ''; syncUI(); $('text').focus(); scheduleRender(0); });
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { setStatus('That file is over 2 MB. Please import a smaller text file.'); return; }
      try {
        state.text = (await file.text()).replace(/\u0000/g, '');
        syncUI();
        scheduleRender(0);
        setStatus(`Imported ${file.name}.`);
      } catch {
        setStatus(`Couldn't read ${file.name}.`);
      }
    });

    // Downloads
    $('pdfBtn').addEventListener('click', () => busy($('pdfBtn'), async () => {
      const { plan, canvases } = await renderForExport();
      const name = await HT.Export.pdf(canvases, plan.size, 'handwritten-notes');
      setStatus(`Saved ${name} (${canvases.length} ${canvases.length === 1 ? 'page' : 'pages'}).`);
    }));
    $('imgBtn').addEventListener('click', () => busy($('imgBtn'), async () => {
      const { canvases } = await renderForExport();
      const name = await HT.Export.images(canvases, state.imageFormat, 'handwritten-notes');
      setStatus(`Saved ${name}.`);
    }));
    $('printBtn').addEventListener('click', () => busy($('printBtn'), printPages));
  }

  async function busy(button, fn) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Preparing…';
    setStatus('');
    try { await fn(); } catch (err) {
      console.error(err);
      setStatus(`Something went wrong: ${err.message || err}. Please try again.`);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function renderForExport() {
    const plan = await computePages();
    const k = EXPORT_K[state.quality] || EXPORT_K.high;
    const canvases = plan.pages.map(() => document.createElement('canvas'));
    // Let the "Preparing…" label paint before the heavy work.
    await new Promise((r) => setTimeout(r, 30));
    drawInto(canvases, plan, k);
    return { plan, canvases };
  }

  async function printPages() {
    const plan = await renderPreview();
    if (!plan) return;
    const { w, h } = plan.size;
    $('print-page-size').textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
    document.documentElement.style.setProperty('--print-w', `${w}mm`);
    document.documentElement.style.setProperty('--print-h', `${h}mm`);
    // Sharper canvases for the printer, then back to preview resolution.
    drawInto([...$('pages').querySelectorAll('canvas')], plan, PRINT_K);
    await new Promise((r) => setTimeout(r, 50));
    window.print();
    renderPreview();
  }

  // ---------------- start ----------------
  function init() {
    $('version').textContent = `v${HT.VERSION.replace(/\.0$/, '')}`;
    restore();
    fillSelect($('paper'), HT.PAPERS);
    fillSelect($('pageSize'), HT.PAGE_SIZES);
    buildFontPicker();
    buildInks();
    syncUI();
    bindControls();
    renderPreview();
  }

  init();
})();
