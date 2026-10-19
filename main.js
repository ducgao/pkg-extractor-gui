const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXE_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'pkg_extractor')
  : path.join(__dirname, 'vendor', 'pkg_extractor');
const EXE = path.join(EXE_DIR, 'pkg_extractor.exe');

// pkg_extractor --check-type exit codes
const KIND_BY_CODE = { 101: 'base', 102: 'update', 103: 'dlc' };
// which kinds each slot accepts
const SLOT_RULES = { base: ['base'], update: ['update'], extra: ['update', 'dlc'] };
const SLOT_ORDER = ['base', 'update', 'extra'];

let win = null;
let current = null; // running job: { child, cancelled }

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { /* non-fatal */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 760,
    height: 780,
    minWidth: 620,
    minHeight: 640,
    backgroundColor: '#14161a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.argv.includes('--self-test')) win.webContents.once('did-finish-load', () => selfTest());
  if (process.argv.includes('--e2e')) win.webContents.once('did-finish-load', () => e2e());
}

function checkType(file) {
  return new Promise((resolve) => {
    execFile(EXE, [file, '--check-type'], { cwd: EXE_DIR, encoding: 'utf8', timeout: 30000, windowsHide: true },
      (err, stdout) => {
        const code = err ? err.code : 0;
        const kind = KIND_BY_CODE[code] || null;
        let size = 0;
        try { size = fs.statSync(file).size; } catch { /* ignore */ }
        resolve({ file, code, kind, size, detail: String(stdout || '').trim().split(/\r?\n/).pop() });
      });
  });
}

function freeBytes(dir) {
  try {
    let probe = dir;
    while (!fs.existsSync(probe)) {
      const up = path.dirname(probe);
      if (up === probe) return null;
      probe = up;
    }
    const s = fs.statfsSync(probe);
    return Number(s.bavail) * Number(s.bsize);
  } catch { return null; }
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else { try { total += fs.statSync(p).size; } catch { /* file in flux */ } }
    }
  }
  return total;
}

// The extractor prints paths with Rust/C++-style escaping: "C:\\Users\\x"
const unescapePath = (s) => s.replace(/\\\\/g, '\\');

function runExtract(job, item, onLine) {
  return new Promise((resolve) => {
    const child = spawn(EXE, [item.file, item.destRoot], { cwd: EXE_DIR, windowsHide: true });
    current.child = child;
    const state = { n: 0, m: 0, sawEnd: false, dest: null, tail: [] };
    let buf = '';
    const feed = (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.search(/\r?\n/)) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(buf.indexOf('\n', i) + 1);
        handle(line);
      }
    };
    const handle = (line) => {
      if (!line.trim()) return;
      state.tail.push(line);
      if (state.tail.length > 8) state.tail.shift();
      let m;
      if ((m = line.match(/^Extracting file (\d+) of (\d+)/))) { state.n = +m[1]; state.m = +m[2]; }
      else if ((m = line.match(/^Extracting pkg to "(.*)"\s*$/))) state.dest = unescapePath(m[1]);
      else if (/^THE END/.test(line)) state.sawEnd = true;
      onLine(line, state);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => resolve({ ok: false, reason: `Không chạy được pkg_extractor: ${e.message}`, state }));
    child.on('close', (code) => {
      if (buf) handle(buf);
      // The extractor returns 0 even on failure, so verify via its own output.
      const complete = state.sawEnd && state.m > 0 && state.n === state.m;
      if (current.cancelled) resolve({ ok: false, cancelled: true, state });
      else if (code !== 0) resolve({ ok: false, reason: `pkg_extractor thoát với mã ${code}.`, state });
      else if (!complete) resolve({ ok: false, reason: 'Giải nén không hoàn tất (thiếu file hoặc không thấy dòng kết thúc).', state });
      else resolve({ ok: true, state });
    });
  });
}

async function runJob(payload, emit) {
  const send = emit || ((type, data = {}) => { if (win && !win.isDestroyed()) win.webContents.send('job-event', { type, ...data }); });
  const { gamesDir, addonsDir, slots } = payload;

  // Re-validate everything in the main process; don't trust the renderer.
  const items = [];
  for (const slot of SLOT_ORDER) {
    const file = slots[slot];
    if (!file) continue;
    const info = await checkType(file);
    if (!info.kind || !SLOT_RULES[slot].includes(info.kind)) {
      return send('done', { ok: false, reason: `File "${path.basename(file)}" không hợp lệ cho mục ${slot}.` });
    }
    items.push({ slot, file, kind: info.kind, size: info.size, destRoot: info.kind === 'dlc' ? addonsDir : gamesDir });
  }
  if (!items.length) return send('done', { ok: false, reason: 'Chưa chọn file nào.' });
  if (!gamesDir) return send('done', { ok: false, reason: 'Chưa chọn thư mục game.' });
  if (items.some((i) => i.kind === 'dlc') && !addonsDir) return send('done', { ok: false, reason: 'Có DLC nhưng chưa chọn thư mục addons.' });

  for (const dir of new Set(items.map((i) => i.destRoot))) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { return send('done', { ok: false, reason: `Không tạo được thư mục "${dir}": ${e.message}` }); }
  }

  const totalWeight = items.reduce((a, i) => a + i.size, 0) || 1;
  let doneWeight = 0;
  let openPath = null;
  let basePath = null;
  current = { child: null, cancelled: false };
  const started = Date.now();

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    send('item-start', { index: idx, total: items.length, slot: item.slot, name: path.basename(item.file) });

    let poll = null;
    const result = await runExtract(payload, item, (line, st) => {
      if (st.dest && !poll) {
        const dest = st.dest;
        let last = 0, lastT = Date.now();
        poll = setInterval(() => {
          const bytes = dirSize(dest);
          const now = Date.now();
          const speed = (bytes - last) / Math.max(1, (now - lastT) / 1000);
          last = bytes; lastT = now;
          send('bytes', { bytes, speed });
        }, 2000);
      }
      const frac = st.m ? st.n / st.m : 0;
      send('progress', { overall: (doneWeight + item.size * frac) / totalWeight, n: st.n, m: st.m });
      if (!/^Extracting file/.test(line)) send('log', { line });
    });
    if (poll) clearInterval(poll);

    if (result.cancelled) { current = null; return send('done', { ok: false, cancelled: true, reason: 'Đã hủy.' }); }
    if (!result.ok) {
      current = null;
      return send('done', { ok: false, reason: `${path.basename(item.file)}: ${result.reason}`, tail: result.state.tail });
    }
    doneWeight += item.size;
    if (result.state.dest) {
      openPath = item.kind === 'dlc' ? (openPath || result.state.dest) : result.state.dest;
      if (item.kind === 'base') basePath = result.state.dest;
    }
    send('item-done', { index: idx, dest: result.state.dest });
  }

  current = null;
  const finalPath = basePath || openPath || gamesDir;
  send('done', { ok: true, openPath: finalPath, seconds: Math.round((Date.now() - started) / 1000) });
  if (!emit) shell.openPath(finalPath);
}

ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:set', (_e, s) => { saveSettings({ ...loadSettings(), ...s }); });
ipcMain.handle('pkg:check', (_e, file) => checkType(file));
ipcMain.handle('dialog:pkg', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: [{ name: 'PS4 PKG', extensions: ['pkg'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:dir', async (_e, title, defaultPath) => {
  const r = await dialog.showOpenDialog(win, { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('fs:free', (_e, dir) => freeBytes(dir));
ipcMain.handle('shell:open', (_e, p) => shell.openPath(p));
ipcMain.handle('job:start', (_e, payload) => {
  if (current) return false;
  runJob(payload).catch((e) => { current = null; if (win) win.webContents.send('job-event', { type: 'done', ok: false, reason: String(e && e.message || e) }); });
  return true;
});
ipcMain.handle('job:cancel', () => {
  if (!current || !current.child) return false;
  current.cancelled = true;
  // kill the whole tree so no orphan keeps writing to disk
  spawn('taskkill', ['/pid', String(current.child.pid), '/T', '/F'], { windowsHide: true });
  return true;
});

// Headless end-to-end check: E2E_JSON = { payload, cancelAfterMs? }, events are appended to E2E_LOG.
async function e2e() {
  const { payload, cancelAfterMs } = JSON.parse(process.env.E2E_JSON);
  const log = (o) => fs.appendFileSync(process.env.E2E_LOG, `${JSON.stringify(o)}\n`);
  let lastP = -1;
  await new Promise((resolve) => {
    runJob(payload, (type, data = {}) => {
      if (type === 'progress') { const p = Math.floor(data.overall * 100 / 10); if (p === lastP) return; lastP = p; }
      if (type === 'log') return;
      log({ type, ...data });
      if (type === 'done') resolve();
    });
    if (cancelAfterMs) setTimeout(() => {
      if (current && current.child) {
        current.cancelled = true;
        spawn('taskkill', ['/pid', String(current.child.pid), '/T', '/F'], { windowsHide: true });
      }
    }, cancelAfterMs);
  });
  app.quit();
}

// Headless UI check: renders the window and saves a screenshot.
async function selfTest() {
  const out = process.env.SELFTEST_PNG;
  await new Promise((r) => setTimeout(r, 600));
  if (process.env.SELFTEST_EVENTS) {
    for (const ev of JSON.parse(process.env.SELFTEST_EVENTS)) win.webContents.send('job-event', ev);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (out) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(out, img.toPNG());
  }
  app.quit();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
