/* HandText Pro — floating picker windows.
 *
 * HT.Modal.open({
 *   title, subtitle,
 *   items: [{ id, ... }], value,              // single choice from a grid of options
 *   gridClass,                                 // 'grid-fonts' | 'grid-swatches' | 'grid-thumbs'
 *   render(item, el), label(item),             // draw an option; text for the footer
 *   filter(item) -> bool,                      // optional, re-run with api.refresh()
 *   tools(el, api),                            // optional controls above the grid (search, tabs…)
 *   body(el, api),                             // OR a fully custom body
 *   onApply(value),                            // called with the chosen value when Apply is pressed
 * })
 * Nothing changes until Apply. Esc / Cancel / ✕ / clicking outside closes without changes.
 */
(function (root) {
  'use strict';
  const HT = (root.HT = root.HT || {});
  const $ = (id) => document.getElementById(id);

  let current = null;
  let lastFocus = null;

  function close(applied) {
    if (!current) return;
    const cfg = current;
    current = null;
    $('modal').hidden = true;
    document.body.classList.remove('modal-open');
    $('modalBody').textContent = '';
    $('modalTools').textContent = '';
    if (applied && cfg.onApply) cfg.onApply(cfg.value);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function open(cfg) {
    if (current) close(false);
    current = { ...cfg };
    lastFocus = document.activeElement;
    $('modalTitle').textContent = cfg.title || '';
    $('modalSub').textContent = cfg.subtitle || '';
    $('modalSub').hidden = !cfg.subtitle;
    const body = $('modalBody');
    const tools = $('modalTools');
    body.textContent = '';
    tools.textContent = '';
    body.className = 'modal-body';
    const api = {
      get value() { return current && current.value; },
      set value(v) { if (current) { current.value = v; updateChoice(); } },
      refresh: () => renderGrid(),
      apply: () => close(true),
      body,
    };

    function updateChoice() {
      if (!current) return;
      const item = current.items && current.items.find((it) => it.id === current.value);
      $('modalChoice').textContent = current.label ? current.label(item || current.value) || '' : '';
      body.querySelectorAll('[data-pick]').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.pick === String(current.value))));
    }

    function renderGrid() {
      if (!current || !current.items) return;
      body.textContent = '';
      const grid = document.createElement('div');
      grid.className = `pick-grid ${current.gridClass || ''}`;
      grid.setAttribute('role', 'radiogroup');
      const shown = current.items.filter((it) => !current.filter || current.filter(it));
      if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'muted pick-empty';
        empty.textContent = 'Nothing matches. Try a different search.';
        body.appendChild(empty);
        return;
      }
      shown.forEach((item) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pick';
        el.dataset.pick = String(item.id);
        el.setAttribute('role', 'radio');
        current.render(item, el);
        el.addEventListener('click', () => { current.value = item.id; updateChoice(); });
        el.addEventListener('dblclick', () => { current.value = item.id; close(true); });
        grid.appendChild(el);
      });
      body.appendChild(grid);
      updateChoice();
    }

    if (cfg.tools) cfg.tools(tools, api);
    tools.hidden = !tools.childNodes.length;
    if (cfg.body) { cfg.body(body, api); updateChoice(); }
    else renderGrid();

    $('modal').hidden = false;
    document.body.classList.add('modal-open');
    // Focus the selected option (or the first control) for keyboard users.
    setTimeout(() => {
      const sel = body.querySelector('[aria-checked="true"]') || tools.querySelector('input, button, select') || $('modalApply');
      if (sel) { sel.focus({ preventScroll: true }); if (sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' }); }
    }, 30);
  }

  function init() {
    $('modalApply').addEventListener('click', () => close(true));
    $('modalCancel').addEventListener('click', () => close(false));
    $('modalClose').addEventListener('click', () => close(false));
    $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) close(false); });
    document.addEventListener('keydown', (e) => {
      if (!current) return;
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') {
        // keep focus inside the window
        const f = [...$('modal').querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  HT.Modal = { open, close: () => close(false), isOpen: () => !!current, init };
})(typeof window !== 'undefined' ? window : globalThis);
