(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const SLOT_RULES = { base: ['base'], update: ['update'], extra: ['update', 'dlc'] };

  const state = {
    slots: { base: null, update: null, extra: null }, // { file, kind, size, checking }
    gamesDir: '',
    addonsDir: '',
    running: false,
    lastOpen: null,
    lang: 'vi',
  };

  // ---- i18n ----
  const t = (key, params = {}) => {
    const dict = window.I18N[state.lang] || window.I18N.vi;
    const s = dict[key] ?? window.I18N.vi[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_m, k) => (params[k] ?? ''));
  };
  const slotShort = (slot) => t(`slot.${slot}.short`);
  const reasonText = (r) => {
    if (!r) return t('st.failed');
    if (typeof r === 'string') return r;
    const p = { ...(r.p || {}) };
    if (p.slot) p.slot = slotShort(p.slot);
    return t(r.key, p);
  };

  let statusFn = null; // re-evaluated when the language changes
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    if (statusFn) statusFn();
    renderAll();
  }
  function setLang(lang, persist = true) {
    if (!window.I18N[lang]) return;
    state.lang = lang;
    if (persist) window.api.setSettings({ lang });
    applyLang();
  }

  const fmtBytes = (n) => {
    if (n == null) return '?';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i >= 3 ? 2 : 0)} ${u[i]}`;
  };

  function slotValid(slot) {
    const s = state.slots[slot];
    return !!s && !s.checking && !!s.kind && SLOT_RULES[slot].includes(s.kind);
  }
  const hasDlc = () => Object.values(state.slots).some((s) => s && s.kind === 'dlc');

  function renderSlot(slot) {
    const el = $(`.slot[data-slot="${slot}"]`);
    const s = state.slots[slot];
    const badge = $('[data-badge]', el);
    const path = $('[data-path]', el);
    const clear = $('[data-clear]', el);
    path.classList.toggle('set', !!s);
    path.textContent = s ? s.file : t('slot.empty');
    path.title = s ? s.file : '';
    clear.hidden = !s || state.running;
    badge.className = 'badge';
    if (!s) badge.textContent = '';
    else if (s.checking) { badge.textContent = t('badge.checking'); badge.classList.add('wait'); }
    else if (!s.kind) { badge.textContent = t('badge.invalid'); badge.classList.add('bad'); }
    else if (!SLOT_RULES[slot].includes(s.kind)) {
      badge.textContent = t('badge.mismatch', { kind: t(`kind.${s.kind}`), slot: slotShort(slot) });
      badge.classList.add('bad');
    } else { badge.textContent = `✓ ${t(`kind.${s.kind}`)} · ${fmtBytes(s.size)}`; badge.classList.add('ok'); }
    $('.pick', el).disabled = state.running;
  }

  function renderDirs() {
    const g = $('#games-path'), a = $('#addons-path');
    g.textContent = state.gamesDir || t('dir.empty'); g.title = state.gamesDir; g.classList.toggle('set', !!state.gamesDir);
    a.textContent = state.addonsDir || t('dir.empty'); a.title = state.addonsDir; a.classList.toggle('set', !!state.addonsDir);
    $('#addons-row').hidden = !hasDlc();
    $('#pick-games').disabled = $('#pick-addons').disabled = state.running;
  }

  async function renderSpace() {
    const hint = $('#space-hint');
    hint.className = 'hint';
    if (!state.gamesDir) { hint.textContent = ''; return; }
    const free = await window.api.freeSpace(state.gamesDir);
    const need = Object.values(state.slots).reduce((a, s) => a + (s && s.kind ? s.size : 0), 0);
    if (free == null) { hint.textContent = ''; return; }
    hint.textContent = t('space.hint', { free: fmtBytes(free), need: need ? fmtBytes(need) : '—' });
    if (need && free < need * 1.2) { hint.classList.add('warn'); hint.textContent += t('space.warn'); }
  }

  function renderStart() {
    const any = Object.keys(state.slots).some((k) => state.slots[k]);
    const allValid = Object.keys(state.slots).every((k) => !state.slots[k] || slotValid(k));
    const dirsOk = !!state.gamesDir && (!hasDlc() || !!state.addonsDir);
    $('#start').disabled = state.running || !any || !allValid || !dirsOk;
  }

  function renderAll() {
    Object.keys(state.slots).forEach(renderSlot);
    renderDirs();
    renderStart();
    renderSpace();
  }

  async function setSlot(slot, file) {
    if (!file) return;
    state.slots[slot] = { file, kind: null, size: 0, checking: true };
    renderAll();
    const info = await window.api.checkPkg(file);
    // ignore stale answers if the user changed the slot meanwhile
    if (!state.slots[slot] || state.slots[slot].file !== file) return;
    state.slots[slot] = { file, kind: info.kind, size: info.size, checking: false };
    if (info.kind === 'dlc' && !state.addonsDir) autoAddons();
    renderAll();
  }

  function autoAddons() {
    if (!state.gamesDir) return;
    const parent = state.gamesDir.replace(/[\\/][^\\/]+[\\/]?$/, '');
    state.addonsDir = `${parent}\\addons`;
    window.api.setSettings({ addonsDir: state.addonsDir });
  }

  // ---- wiring ----
  document.querySelectorAll('.slot').forEach((el) => {
    const slot = el.dataset.slot;
    $('[data-pick]', el).addEventListener('click', async () => {
      const f = await window.api.pickPkg(t('dlg.pkg', { slot: slotShort(slot) }));
      if (f) setSlot(slot, f);
    });
    $('[data-clear]', el).addEventListener('click', () => { state.slots[slot] = null; renderAll(); });
    el.addEventListener('dragover', (e) => { if (!state.running) { e.preventDefault(); el.classList.add('drag'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('drag');
      if (state.running) return;
      const f = e.dataTransfer.files[0];
      if (f) setSlot(slot, window.api.pathForFile(f));
    });
  });
  // dropping outside a slot must not navigate the window to the file
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

  $('#pick-games').addEventListener('click', async () => {
    const d = await window.api.pickDir(t('dlg.games'), state.gamesDir || undefined);
    if (!d) return;
    state.gamesDir = d;
    window.api.setSettings({ gamesDir: d });
    renderAll();
  });
  $('#pick-addons').addEventListener('click', async () => {
    const d = await window.api.pickDir(t('dlg.addons'), state.addonsDir || undefined);
    if (!d) return;
    state.addonsDir = d;
    window.api.setSettings({ addonsDir: d });
    renderAll();
  });

  // ---- running ----
  const fill = $('#fill'), pct = $('#pct'), status = $('#status'), log = $('#log');
  let itemLabel = '';
  let lastBytes = null; // { bytes, speed }
  let lastFile = null;  // { n, m }

  function setStatus(fn, cls = '') {
    statusFn = fn;
    status.textContent = fn();
    status.className = `status ${cls}`;
  }
  const extractingStatus = () => {
    let s = t('st.extracting', { label: itemLabel });
    if (lastFile) s += t('st.files', lastFile);
    if (lastBytes) s += t('st.bytes', { bytes: fmtBytes(lastBytes.bytes), speed: fmtBytes(lastBytes.speed) });
    return s;
  };

  // The bar eases toward the real progress instead of jumping, so slow stretches
  // (one huge file) still look alive. It never runs ahead of the real value.
  let target = 0, shown = 0, ticker = null;
  function paint(p) {
    fill.style.width = `${(p * 100).toFixed(1)}%`;
    pct.textContent = `${Math.min(100, Math.floor(p * 100))}%`;
  }
  function resetBar() {
    clearInterval(ticker); ticker = null;
    target = shown = 0; paint(0);
  }
  function setTarget(v, snap = false) {
    target = Math.min(1, Math.max(target, v));
    if (snap) { shown = target; paint(shown); return; }
    if (!ticker) ticker = setInterval(() => {
      if (shown >= target) return;
      shown = Math.min(target, shown + Math.max((target - shown) * 0.15, 0.0008));
      paint(shown);
    }, 50);
  }

  $('#start').addEventListener('click', async () => {
    state.running = true;
    state.lastOpen = null;
    log.textContent = '';
    $('#log-wrap').hidden = false;
    $('#progress').hidden = false;
    fill.className = 'fill'; resetBar();
    lastBytes = null; lastFile = null;
    $('#open').hidden = true; $('#cancel').hidden = false; $('#cancel').disabled = false;
    setStatus(() => t('st.preparing'));
    renderAll();
    const slots = {};
    for (const k of Object.keys(state.slots)) slots[k] = state.slots[k] ? state.slots[k].file : null;
    const ok = await window.api.start({ gamesDir: state.gamesDir, addonsDir: state.addonsDir, slots });
    if (!ok) { state.running = false; setStatus(() => t('st.busy'), 'bad'); renderAll(); }
  });

  $('#cancel').addEventListener('click', async () => {
    $('#cancel').disabled = true;
    setStatus(() => t('st.cancelling'));
    await window.api.cancel();
  });

  $('#open').addEventListener('click', () => { if (state.lastOpen) window.api.openPath(state.lastOpen); });

  window.api.onEvent((ev) => {
    switch (ev.type) {
      case 'preview': { // used only to render documentation screenshots
        const { lang, ...rest } = ev.state;
        Object.assign(state, rest);
        if (lang) setLang(lang, false); else renderAll();
        break;
      }
      case 'item-start':
        $('#progress').hidden = false;
        $('#cancel').hidden = false;
        itemLabel = `(${ev.index + 1}/${ev.total}) ${ev.name}`;
        lastBytes = null; lastFile = null;
        setTarget(ev.overall || 0);
        setStatus(extractingStatus);
        break;
      case 'progress':
        setTarget(ev.overall);
        lastFile = { n: ev.n, m: ev.m };
        setStatus(extractingStatus);
        break;
      case 'bytes':
        lastBytes = { bytes: ev.bytes, speed: ev.speed };
        status.textContent = extractingStatus();
        break;
      case 'log':
        log.textContent += `${ev.line}\n`;
        log.scrollTop = log.scrollHeight;
        break;
      case 'item-done':
        break;
      case 'done': {
        state.running = false;
        $('#cancel').hidden = true;
        if (ev.ok) {
          setTarget(1, true); clearInterval(ticker); ticker = null; fill.classList.add('done');
          state.lastOpen = ev.openPath;
          $('#open').hidden = false;
          setStatus(() => t('st.done', { seconds: ev.seconds, path: ev.openPath }), 'ok');
        } else {
          clearInterval(ticker); ticker = null; fill.classList.add('fail');
          setStatus(() => (ev.name ? `${ev.name}: ` : '') + reasonText(ev.reason), ev.cancelled ? '' : 'bad');
          if (ev.tail) log.textContent += `${t('st.errTail')}\n${ev.tail.join('\n')}\n`;
        }
        renderAll();
        break;
      }
    }
  });

  (async () => {
    const s = await window.api.getSettings();
    state.gamesDir = s.gamesDir || '';
    state.addonsDir = s.addonsDir || '';
    state.lang = s.lang || ((navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en');
    applyLang();
  })();
})();
