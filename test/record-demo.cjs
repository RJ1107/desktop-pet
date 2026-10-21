// Costs nothing. Records a demo of the pet on the desktop, on a throwaway copy of the owner's data: the real footage,
// filmed by a camera that follows the pet across a plain backdrop (never the person's real desktop), with captions.
// Writes demo.webm; turn it into MP4 and an animated preview with FFmpeg afterwards.
// Usage: node test/record-demo.cjs <output folder>
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
const dataDir = require('./data-dir.cjs');
const out = process.argv[2];
if (!out) { console.error('Give an output folder.'); process.exit(1); }

// What happens, in order: [caption, line under it, what to do, seconds to film it].
const SCENES = [
  ['桌面宠物 · Desktop Pet', '用自家宠物的照片生成的写实桌面宠物  ·  A realistic desktop pet made from photos of your own', null, 4],
  ['自己在桌面上走来走去', 'It wanders about your desktop', pet => pet.command('run', pet.snapshot().x > 900 ? 520 : 1180), 5],
  ['喂猫粮：一粒一粒吃掉', 'Feed it, and it eats from the bowl', pet => { pet.setNeeds({food: 8}); pet.drop('kibble'); }, 9],
  ['手放在它头边，它会蹭你', 'Rest your hand by its head', pet => pet.command('nuzzle', 1), 5],
  ['摸久了，翻肚皮', 'Pet it long enough and it rolls over', pet => pet.command('roll'), 6.5],
  ['走到屏幕边，扒着墙伸懒腰', 'At the side of the screen, it stretches up the wall', async pet => { pet.command('run', innerWidth - 200); for (let i = 0; i < 60 && ['run', 'rise'].includes(pet.snapshot().mode); i++) await new Promise(r => setTimeout(r, 100)); pet.command('scratch'); }, 8.5],
  ['开源 · Windows / macOS', 'Open source · bring your own API key and make one of your own pet', pet => pet.command('sleep'), 6]
];

(async () => {
  const root = path.join(__dirname, '..'), real = dataDir();
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-demo-'));
  for (const name of ['pet.json', 'Local State']) if (fs.existsSync(path.join(real, name))) fs.copyFileSync(path.join(real, name), path.join(copy, name));
  for (const dir of ['realistic', 'photos', 'bowls']) if (fs.existsSync(path.join(real, dir))) fs.cpSync(path.join(real, dir), path.join(copy, dir), {recursive: true});
  fs.mkdirSync(out, {recursive: true});
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: copy, PET_OFFSCREEN: '1'}});
  try {
    let overlay;
    for (let i = 0; i < 80 && !overlay; i++) { overlay = app.windows().find(w => w.url().includes('overlay.html')); if (!overlay) await new Promise(r => setTimeout(r, 250)); }
    await overlay.waitForFunction(() => window.petDebug && petDebug.snapshot().look === 'realistic', null, {timeout: 30000});
    // A content, well-fed pet, standing a little left of centre, before the camera rolls.
    await overlay.evaluate(() => { petDebug.setNeeds({food: 90, water: 90, energy: 90, mood: 80}); petDebug.command('wake'); petDebug.command('run', 640); });
    await overlay.waitForFunction(() => Math.abs(petDebug.snapshot().x - 640) < 4 && petDebug.snapshot().mode === 'idle', null, {timeout: 30000, polling: 100});
    await overlay.evaluate(() => {
      const stage = document.getElementById('stage'), ratio = devicePixelRatio, W = 1280, H = 720, VIEW = 900, FLOOR = 0.82;
      const film = Object.assign(document.createElement('canvas'), {width: W, height: H}), c = film.getContext('2d');
      const sky = c.createLinearGradient(0, 0, 0, H * FLOOR); sky.addColorStop(0, '#f7f1e7'); sky.addColorStop(1, '#eee3d2');
      const floor = c.createLinearGradient(0, H * FLOOR, 0, H); floor.addColorStop(0, '#dccdb6'); floor.addColorStop(1, '#cdbb9f');
      const state = window.__film = {caption: '', line: '', since: 0, camera: null, chunks: []};
      const scale = W / VIEW, groundY = innerHeight - 8;
      const font = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif';
      (function paint(now) {
        const s = petDebug.snapshot();
        const target = Math.max(VIEW / 2, Math.min(innerWidth - VIEW / 2, s.x));
        state.camera = state.camera === null ? target : state.camera + (target - state.camera) * 0.06;
        c.fillStyle = sky; c.fillRect(0, 0, W, H * FLOOR); c.fillStyle = floor; c.fillRect(0, H * FLOOR, W, H * (1 - FLOOR));
        const top = groundY - H * FLOOR / scale, height = H / scale;
        c.drawImage(stage, (state.camera - VIEW / 2) * ratio, top * ratio, VIEW * ratio, height * ratio, 0, 0, W, H);
        // The caption fades in at the top left; a small name tag sits at the bottom right.
        const fade = Math.min(1, (now - state.since) / 400);
        if (state.caption) {
          c.globalAlpha = fade; c.fillStyle = 'rgba(58,44,30,.92)'; c.font = `700 46px ${font}`; c.textBaseline = 'alphabetic';
          c.fillText(state.caption, 64, 108);
          c.fillStyle = 'rgba(120,94,66,.95)'; c.font = `500 24px ${font}`; c.fillText(state.line, 66, 150);
          c.globalAlpha = 1;
        }
        c.fillStyle = 'rgba(90,70,50,.55)'; c.font = `600 18px ${font}`; c.textAlign = 'right'; c.fillText('Desktop Pet · github.com/RJ1107/desktop-pet', W - 36, H - 28); c.textAlign = 'left';
        requestAnimationFrame(paint);
      })(performance.now());
      const recorder = new MediaRecorder(film.captureStream(30), {mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 9e6});
      recorder.ondataavailable = event => state.chunks.push(event.data);
      state.stopped = new Promise(resolve => { recorder.onstop = resolve; });
      state.recorder = recorder; recorder.start(1000);
    });
    for (const [caption, line, act, seconds] of SCENES) {
      await overlay.evaluate(([caption, line]) => Object.assign(window.__film, {caption, line, since: performance.now()}), [caption, line]);
      if (act) await overlay.evaluate(`(${act.toString()})(window.petDebug)`);
      await overlay.waitForTimeout(seconds * 1000);
      console.log('filmed:', caption, '| pet', JSON.stringify(await overlay.evaluate(() => { const s = petDebug.snapshot(); return {mode: s.mode, act: s.act, x: s.x}; })));
    }
    const video = await overlay.evaluate(async () => {
      const state = window.__film; state.recorder.stop(); await state.stopped;
      const bytes = new Uint8Array(await new Blob(state.chunks, {type: 'video/webm'}).arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    });
    fs.writeFileSync(path.join(out, 'demo.webm'), Buffer.from(video, 'base64'));
    console.log('saved', path.join(out, 'demo.webm'), Math.round(video.length * 0.75 / 1e6 * 10) / 10, 'MB');
  } finally { await app.close(); fs.rmSync(copy, {recursive: true, force: true}); }
})().catch(error => { console.error('FAILED:', String(error.stack || error).slice(0, 700)); process.exit(1); });
