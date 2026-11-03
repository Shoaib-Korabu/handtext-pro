/* HandText Pro — app: state, controls, upload, live preview and downloads. */
(function () {
  'use strict';
  const HT = window.HT;
  const { parse, layout, linesPerPage } = HT.Layout;

  const PRINT_K = 200 / 25.4;      // ~200 DPI for printing
  const EXPORT_K = { standard: 150 / 25.4, high: 300 / 25.4 };
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
    if (!HT.FONTS.some((f) => f.id === state.font)) state.font = HT.DEFAULTS.font;
    if (!HT.PAPERS.some((p) => p.id === state.paper)) state.paper = HT.DEFAULTS.paper;
    if (!HT.PAGE_SIZES.some((p) => p.id === state.pageSize)) state.pageSize = HT.DEFAULTS.pageSize;
    if (state.ink !== 'custom' && !HT.INKS.some((i) => i.id === state.ink)) state.ink = HT.DEFAULTS.ink;
    if (!/^#[0-9a-f]{6}$/i.test(state.customInk)) state.customInk = HT.DEFAULTS.customInk;
    if (!['off', 'first', 'all'].includes(state.headerOn)) state.headerOn = HT.DEFAULTS.headerOn;
    if (!['standard', 'high'].includes(state.quality)) state.quality = HT.DEFAULTS.quality;
    if (!['png', 'jpg'].includes(state.imageFormat)) state.imageFormat = HT.DEFAULTS.imageFormat;
    const clamp = (v, a, b, d) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
    state.fontSize = clamp(state.fontSize, 12, 36, HT.DEFAULTS.fontSize);
    state.lineSpacing = clamp(state.lineSpacing, 5, 14, HT.DEFAULTS.lineSpacing);
    state.wordSpacing = clamp(state.wordSpacing, 70, 180, HT.DEFAULTS.wordSpacing);
    for (const k of ['movement', 'variation', 'inkflow', 'texture']) state[k] = clamp(state[k], 0, 100, HT.DEFAULTS[k]);
    for (const side of ['top', 'right', 'bottom', 'left']) state.margins[side] = clamp(state.margins[side], 0, 80, HT.DEFAULTS.margins[side]);
  }

  const findFont = (id) => HT.FONTS.find((f) => f.id === id) || HT.FONTS[0];
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
    const font = findFont(state.font);
    await loadFont(font);
    const info = fontInfo.get(font.id);
    const { size, margins } = geometry();
    const fontSizeMm = (state.fontSize * 25.4) / 72 * info.norm;
    const lpp = linesPerPage(size.h, margins, state.lineSpacing);
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
      geo: { pageW: size.w, pageH: size.h, margins, lineSpacing: state.lineSpacing, fontSizeMm, linesPerPage: lpp, pageCount: result.pages.length },
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

  const exportJob = (p, k) => ({
    count: p.pages.length,
    size: p.size,
    renderTo: (i, canvas) => HT.Render.renderPage(canvas, p.pages[i], i, p.settings, { ...p.geo, k }, p.font, p.extrasFor(i)),
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
    return Math.min(7, Math.max(2.5, (css * dpr) / p.size.w));
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
      div.style.aspectRatio = `${plan.size.w} / ${plan.size.h}`;
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
    HT.Render.renderPage(canvas, plan.pages[i], i, plan.settings, { ...plan.geo, k: previewK }, plan.font, plan.extrasFor(i));
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
      name.textContent = `${font.label} \u00B7 ${font.style}`;
      b.append(sample, name);
      b.addEventListener('click', () => { state.font = font.id; syncUI(); scheduleRender(0); });
      box.appendChild(b);
    });
    // Load the chosen font first, then the rest for the picker samples.
    loadFont(findFont(state.font)).then(() => HT.FONTS.forEach(loadFont));
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
    for (const key of SWITCHES) $(key).checked = !!state[key];
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
    $('undoBtn').hidden = undoText === null;
    updateTextMeta();
    updateSummaries();
  }

  /** Short "current setting" text shown on each collapsed section header. */
  function updateSummaries() {
    const ink = state.ink === 'custom' ? 'custom ink' : (HT.INKS.find((i) => i.id === state.ink) || HT.INKS[0]).label.toLowerCase();
    $('sumHand').textContent = `${findFont(state.font).label} \u00B7 ${ink}${state.plainPen ? ' \u00B7 single pen' : ''}`;
    $('sumPaper').textContent = `${findPaper(state.paper).label.split(' \u2014 ')[0]} \u00B7 ${findSize(state.pageSize).label.split(' (')[0]}`;
    const preset = Object.keys(HT.PRESETS).find((n) => Object.keys(HT.PRESETS[n]).every((k) => state[k] === HT.PRESETS[n][k]));
    const extras = [state.letterShape && 'shapes', state.fatigue && 'tiredness'].filter(Boolean);
    $('sumReal').textContent = [preset ? preset[0].toUpperCase() + preset.slice(1) : 'Custom', ...extras].join(' \u00B7 ');
    const h = state.header;
    const filled = [h.name, h.roll, h.subject, h.date].filter((v) => v && v.trim()).length;
    $('sumDetails').textContent = state.headerOn === 'off' || !filled
      ? (state.pageNumbers ? 'page numbers' : 'off')
      : `${h.name.trim() || 'details'}${state.headerOn === 'all' ? ' \u00B7 every page' : ''}${state.pageNumbers ? ' \u00B7 page no.' : ''}`;
    $('sumText').textContent = state.text.trim() ? `${state.text.trim().split(/\s+/).length.toLocaleString()} words` : 'empty';
    $('sumDl').textContent = `${state.quality === 'high' ? '300' : '150'} DPI \u00B7 ${state.imageFormat.toUpperCase()}`;
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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        busy($('printBtn'), printPages);
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
    const name = await HT.Export.images(exportJob(p, k), state.imageFormat, docName, (m) => setStatus(m));
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
    bindUpload();
    document.body.dataset.view = 'edit';
    renderPreview();
  }

  init();
})();
