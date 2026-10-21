// SPENDS A LITTLE REAL CREDIT (one picture, about $0.05). Makes a bowl with the real image model, on a throwaway copy of
// the owner's data, so the real pet keeps its own bowls. Saves the painted picture and the pet eating from the bowl.
// Usage: node test/real-bowl.cjs --spend <output folder> kibble|water "a few words" [photo files...]
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
const [flag, out, kind, words = '', ...files] = process.argv.slice(2);
if (flag !== '--spend' || !out || !['kibble', 'water'].includes(kind)) { console.error('Refusing to run without --spend <folder> kibble|water.'); process.exit(1); }

(async () => {
  const root = path.join(__dirname, '..');
  const real = require('./data-dir.cjs')();
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-bowl-'));
  // pet.json holds the encrypted key; "Local State" holds what the system needs to decrypt it for this user.
  for (const name of ['pet.json', 'Local State']) fs.copyFileSync(path.join(real, name), path.join(copy, name));
  fs.cpSync(path.join(real, 'realistic'), path.join(copy, 'realistic'), {recursive: true});
  fs.mkdirSync(out, {recursive: true});
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: copy, PET_OFFSCREEN: '1'}});
  const find = async name => { for (let i = 0; i < 80; i++) { const page = app.windows().find(w => w.url().includes(name)); if (page) return page; await new Promise(r => setTimeout(r, 250)); } throw new Error('no ' + name); };
  try {
    const overlay = await find('overlay.html');
    await overlay.waitForFunction(() => window.petDebug);
    await overlay.evaluate(() => window.petHost.call('panel:open', 'look'));
    const panel = await find('panel.html');
    await panel.waitForFunction(() => window.panelDebug);
    const photos = files.map(file => `data:image/${/png$/i.test(file) ? 'png' : 'jpeg'};base64,${fs.readFileSync(file).toString('base64')}`);
    if (photos.length) await panel.evaluate(([kind, photos]) => panelDebug.bowlPhotos(kind, photos), [kind, photos]);
    await panel.locator('#bowls summary').click();
    await panel.locator(`.bowl[data-kind=${kind}] .bowl-words`).fill(words);
    const began = Date.now();
    await panel.locator(`.bowl[data-kind=${kind}] [data-do=make]`).click();
    // Wait for the bowl, reporting each change of the status line, so a failure says what went wrong.
    let said = '';
    for (let waited = 0; waited < 300 && !(await panel.evaluate(kind => panelDebug.bowls()[kind], kind)); waited += 2) {
      const now = await panel.locator('#bowl-status').textContent();
      if (now !== said) { console.log(`[${waited}s] ${now}`); said = now; }
      if (waited > 4 && !/正在|Painting/.test(now) && now) break;
      await panel.waitForTimeout(2000);
    }
    console.log('status:', await panel.locator('#bowl-status').textContent(), '| seconds:', Math.round((Date.now() - began) / 1000));
    const made = await panel.evaluate(kind => panelDebug.bowls()[kind], kind);
    if (!made) throw new Error('no bowl was made');
    console.log('bowl', made.width + 'x' + made.height, 'rim at', made.rim);
    fs.writeFileSync(path.join(out, `bowl-${kind}.png`), Buffer.from(made.url.split(',')[1], 'base64'));
    await overlay.waitForFunction(kind => petDebug.snapshot().bowls.includes(kind), kind, {timeout: 10000});
    await overlay.evaluate(kind => { petDebug.setNeeds({food: 10, water: 10}); petDebug.drop(kind); }, kind);
    await overlay.waitForFunction(() => petDebug.snapshot().mode === 'eat', null, {timeout: 40000});
    await overlay.waitForTimeout(2500);
    const url = await overlay.evaluate(() => {
      const s = petDebug.snapshot(), ratio = devicePixelRatio, stage = document.getElementById('stage');
      const w = 520 * ratio, h = 300 * ratio, canvas = Object.assign(document.createElement('canvas'), {width: w, height: h}), c = canvas.getContext('2d');
      c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h);
      c.drawImage(stage, Math.round(s.x * ratio - w / 2), stage.height - h, w, h, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(out, `eating-${kind}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('saved pictures to', out);
  } finally { await app.close(); fs.rmSync(copy, {recursive: true, force: true}); }
})().catch(error => { console.error('FAILED:', String(error.message || error).slice(0, 500)); process.exit(1); });
