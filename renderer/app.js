(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const SLOT_RULES = { base: ['base'], update: ['update'], extra: ['update', 'dlc'] };
  const KIND_LABEL = { base: 'Game gốc', update: 'Update / patch', dlc: 'DLC' };
  const SLOT_LABEL = { base: 'game gốc', update: 'update', extra: 'patch/DLC' };

  const state = {
    slots: { base: null, update: null, extra: null }, // { file, kind, size, checking }
    gamesDir: '',
    addonsDir: '',
    running: false,
    lastOpen: null,
  };

  const fmtBytes = (n) => {
    if (n == null) return '?';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i >= 3 ? 2 : 0)} ${u[i]}`;
  };
  const baseName = (p) => p.split(/[\\/]/).pop();

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
    path.textContent = s ? s.file : 'Chưa chọn (kéo thả file .pkg vào đây)';
    path.title = s ? s.file : '';
    clear.hidden = !s || state.running;
    badge.className = 'badge';
    if (!s) badge.textContent = '';
    else if (s.checking) { badge.textContent = 'Đang kiểm tra…'; badge.classList.add('wait'); }
    else if (!s.kind) { badge.textContent = 'Không phải PKG hợp lệ'; badge.classList.add('bad'); }
    else if (!SLOT_RULES[slot].includes(s.kind)) {
      badge.textContent = `Đây là ${KIND_LABEL[s.kind]}, không phải ${SLOT_LABEL[slot]}`;
      badge.classList.add('bad');
    } else { badge.textContent = `✓ ${KIND_LABEL[s.kind]} · ${fmtBytes(s.size)}`; badge.classList.add('ok'); }
    $('.pick', el).disabled = state.running;
  }

  function renderDirs() {
    const g = $('#games-path'), a = $('#addons-path');
    g.textContent = state.gamesDir || 'Chưa chọn'; g.title = state.gamesDir; g.classList.toggle('set', !!state.gamesDir);
    a.textContent = state.addonsDir || 'Chưa chọn'; a.title = state.addonsDir; a.classList.toggle('set', !!state.addonsDir);
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
    hint.textContent = `Còn trống ${fmtBytes(free)} trên ổ đích. Dung lượng sau giải nén thường lớn hơn file PKG (${need ? fmtBytes(need) : '—'}).`;
    if (need && free < need * 1.2) { hint.classList.add('warn'); hint.textContent += ' Có thể không đủ chỗ!'; }
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
      const f = await window.api.pickPkg(`Chọn file PKG (${SLOT_LABEL[slot]})`);
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

  $('#pick-games').addEventListener('click', async () => {
    const d = await window.api.pickDir('Chọn thư mục game của shadPS4', state.gamesDir || undefined);
    if (!d) return;
    state.gamesDir = d;
    window.api.setSettings({ gamesDir: d });
    renderAll();
  });
  $('#pick-addons').addEventListener('click', async () => {
    const d = await window.api.pickDir('Chọn thư mục addons của shadPS4', state.addonsDir || undefined);
    if (!d) return;
    state.addonsDir = d;
    window.api.setSettings({ addonsDir: d });
    renderAll();
  });

  // ---- running ----
  const fill = $('#fill'), pct = $('#pct'), status = $('#status'), log = $('#log');
  let itemLabel = '';
  let lastBytes = '';

  function setStatus(text, cls = '') { status.textContent = text; status.className = `status ${cls}`; }

  $('#start').addEventListener('click', async () => {
    state.running = true;
    state.lastOpen = null;
    log.textContent = '';
    $('#log-wrap').hidden = false;
    $('#progress').hidden = false;
    fill.className = 'fill'; fill.style.width = '0%'; pct.textContent = '0%';
    $('#open').hidden = true; $('#cancel').hidden = false; $('#cancel').disabled = false;
    setStatus('Đang chuẩn bị…');
    renderAll();
    const slots = {};
    for (const k of Object.keys(state.slots)) slots[k] = state.slots[k] ? state.slots[k].file : null;
    const ok = await window.api.start({ gamesDir: state.gamesDir, addonsDir: state.addonsDir, slots });
    if (!ok) { state.running = false; setStatus('Một tiến trình khác đang chạy.', 'bad'); renderAll(); }
  });

  $('#cancel').addEventListener('click', async () => {
    $('#cancel').disabled = true;
    setStatus('Đang hủy…');
    await window.api.cancel();
  });

  $('#open').addEventListener('click', () => { if (state.lastOpen) window.api.openPath(state.lastOpen); });

  window.api.onEvent((ev) => {
    switch (ev.type) {
      case 'preview': // used only to render documentation screenshots
        Object.assign(state, ev.state);
        renderAll();
        break;
      case 'item-start':
        $('#progress').hidden = false;
        $('#cancel').hidden = false;
        itemLabel = `(${ev.index + 1}/${ev.total}) ${ev.name}`;
        lastBytes = '';
        setStatus(`Đang giải nén ${itemLabel}`);
        break;
      case 'progress': {
        const p = Math.min(100, Math.floor(ev.overall * 100));
        fill.style.width = `${p}%`; pct.textContent = `${p}%`;
        setStatus(`Đang giải nén ${itemLabel} — file ${ev.n}/${ev.m}${lastBytes}`);
        break;
      }
      case 'bytes':
        lastBytes = ` — ${fmtBytes(ev.bytes)} đã ghi (${fmtBytes(ev.speed)}/s)`;
        break;
      case 'log':
        log.textContent += `${ev.line}\n`;
        log.scrollTop = log.scrollHeight;
        break;
      case 'item-done':
        break;
      case 'done':
        state.running = false;
        $('#cancel').hidden = true;
        if (ev.ok) {
          fill.style.width = '100%'; pct.textContent = '100%'; fill.classList.add('done');
          state.lastOpen = ev.openPath;
          $('#open').hidden = false;
          setStatus(`Xong sau ${ev.seconds}s. Đã mở thư mục: ${ev.openPath}`, 'ok');
        } else {
          fill.classList.add('fail');
          setStatus(ev.reason || 'Thất bại.', ev.cancelled ? '' : 'bad');
          if (ev.tail) log.textContent += `--- lỗi, các dòng cuối ---\n${ev.tail.join('\n')}\n`;
        }
        renderAll();
        break;
    }
  });

  (async () => {
    const s = await window.api.getSettings();
    state.gamesDir = s.gamesDir || '';
    state.addonsDir = s.addonsDir || '';
    renderAll();
  })();
})();
