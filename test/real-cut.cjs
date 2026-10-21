// Costs nothing. Rebuilds the sprite sheets from clips already downloaded in the installed app, switches the
// realistic look on, and saves pictures of the pet in each pose for review.
// Usage: node test/real-cut.cjs <output folder> [--skip-cut]
const path = require('path'), fs = require('fs');
const {_electron} = require('playwright-core');
const out = process.argv[2];
if (!out) { console.error('Give an output folder.'); process.exit(1); }

(async () => {
  const root = path.join(__dirname, '..');
  fs.mkdirSync(out, {recursive: true});
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_OFFSCREEN: '1'}});
  const find = async name => { for (let i = 0; i < 60; i++) { const page = app.windows().find(w => w.url().includes(name)); if (page) return page; await new Promise(r => setTimeout(r, 250)); } throw new Error('no ' + name); };
  const overlay = await find('overlay.html');
  await overlay.waitForFunction(() => window.petDebug);
  const errors = []; overlay.on('pageerror', e => errors.push(e.message));
  if (!process.argv.includes('--skip-cut')) {
    await overlay.evaluate(() => window.petHost.call('panel:open', 'look'));
    const panel = await find('panel.html');
    panel.on('pageerror', e => errors.push(e.message));
    await panel.waitForFunction(() => window.panelDebug);
    const began = Date.now();
    const status = await panel.evaluate(async () => { const s = await window.petHost.call('real:status'); await panelDebug.cutClips(s.clips); return panelDebug.refreshReal(); });
    console.log('cut', status.sheets.join(','), 'in', Math.round((Date.now() - began) / 1000), 's | ready:', status.ready);
    console.log('progress:', await panel.evaluate(() => [...document.querySelectorAll('#real-progress li')].map(li => li.className + ':' + li.textContent).join(' | ')));
  }
  console.log('look:', JSON.stringify(await overlay.evaluate(() => window.petHost.call('real:use', true))));
  await overlay.waitForFunction(() => petDebug.snapshot().look === 'realistic', null, {timeout: 15000});
  const meta = JSON.parse(fs.readFileSync(path.join(await app.evaluate(({app}) => app.getPath('userData')), 'realistic', 'meta.json'), 'utf8'));
  console.log('anchor', JSON.stringify(meta.anchor));
  for (const [name, clip] of Object.entries(meta.clips)) console.log(name.padEnd(6), 'cell', clip.cellWidth + 'x' + clip.cellHeight, 'still', JSON.stringify(clip.still), 'chew', JSON.stringify(clip.chew), 'chewSeam', clip.chewJump, 'loop', JSON.stringify(clip.loop), 'seam', clip.loopJump, 'mouth', JSON.stringify(clip.mouth));
  // Crop the canvas around the pet and save it on a neutral backdrop.
  const shot = async name => {
    const url = await overlay.evaluate(() => {
      const s = petDebug.snapshot(), ratio = devicePixelRatio, stage = document.getElementById('stage');
      const w = 520 * ratio, h = 360 * ratio, canvas = Object.assign(document.createElement('canvas'), {width: w, height: h}), c = canvas.getContext('2d');
      c.fillStyle = '#e9e4da'; c.fillRect(0, 0, w, h); c.fillStyle = '#3d5a80'; c.fillRect(w / 2, 0, w / 2, h);
      c.drawImage(stage, Math.round(s.x * ratio - w / 2), stage.height - h, w, h, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    });
    fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  };
  const wait = ms => overlay.waitForTimeout(ms);
  const until = mode => overlay.waitForFunction(mode => { const s = petDebug.snapshot(); if (s.mode !== mode) petDebug.command(mode === 'idle' ? 'wake' : mode); return s.mode === mode; }, mode, {timeout: 15000, polling: 200});
  await until('sit'); await wait(2500); await shot('pose-sit');
  await until('sleep'); await wait(3000); await shot('pose-sleep');
  await until('loaf'); await wait(3000); await shot('pose-loaf');
  await overlay.evaluate(() => petDebug.command('jump'));
  await overlay.waitForFunction(() => petDebug.snapshot().mode === 'perform', null, {timeout: 15000});
  await wait(1700); await shot('pose-jump');
  await overlay.waitForFunction(() => petDebug.snapshot().mode !== 'perform', null, {timeout: 15000});
  await overlay.evaluate(() => petDebug.command('run', petDebug.snapshot().x > 800 ? 200 : 1400));
  await wait(2200); await shot('pose-run');
  await overlay.evaluate(() => { petDebug.setNeeds({food: 10}); petDebug.drop('kibble'); });
  await overlay.waitForFunction(() => petDebug.snapshot().mode === 'eat', null, {timeout: 30000});
  await wait(2600); await shot('pose-eat');
  console.log('eating at', JSON.stringify(await overlay.evaluate(() => { const s = petDebug.snapshot(); return {petX: s.x, items: s.items}; })));
  // Each other meal on its own, so the picture shows only the dish being used.
  for (const kind of ['water', 'treat']) {
    await overlay.waitForFunction(() => petDebug.snapshot().items.every(i => i.bites === 0) || petDebug.snapshot().items.length === 0, null, {timeout: 60000});
    await wait(3200);
    await overlay.evaluate(kind => { petDebug.setNeeds({water: 5, food: 50}); petDebug.drop(kind); }, kind);
    await overlay.waitForFunction(kind => petDebug.snapshot().items.some(i => i.kind === kind && i.bites < 4), kind, {timeout: 60000});
    await wait(700); await shot('pose-' + kind);
  }
  // Each ritual there is footage for, caught about halfway through. Clawing the wall includes the walk to the wall.
  await overlay.waitForFunction(() => petDebug.snapshot().items.every(i => i.bites === 0) || petDebug.snapshot().items.length === 0, null, {timeout: 60000});
  const style = await overlay.evaluate(() => { const s = petDebug.snapshot(); return {acts: s.acts, body: s.body, front: s.front, limits: s.limits, width: innerWidth}; });
  console.log('style', JSON.stringify(style));
  for (const act of [...style.acts.filter(act => act !== 'scratch'), ...style.acts.filter(act => act === 'scratch')]) { // the wall last: the rest are easier to judge in the open
    await overlay.evaluate(act => petDebug.command(act), act); // asked once: asking again would start the walk to the wall over
    await overlay.waitForFunction(act => { const s = petDebug.snapshot(); return s.mode === 'perform' && s.act === act; }, act, {timeout: 60000, polling: 100});
    await wait(act === 'roll' ? 2200 : 1700); await shot('act-' + act);
    const s = await overlay.evaluate(() => petDebug.snapshot());
    console.log(act.padEnd(8), 'at x', s.x, 'facing', s.facing);
    await overlay.waitForFunction(() => petDebug.snapshot().mode !== 'perform', null, {timeout: 30000});
  }
  const memory = await app.evaluate(({app}) => app.getAppMetrics().map(p => ({type: p.type, mb: Math.round(p.memory.workingSetSize / 1024)})));
  console.log('memory MB', JSON.stringify(memory), 'total', memory.reduce((sum, p) => sum + p.mb, 0));
  // The settings window, as the owner will see it.
  await overlay.evaluate(() => window.petHost.call('panel:open', 'look'));
  const page = await find('panel.html');
  await page.waitForFunction(() => window.panelDebug && panelDebug.preview().real, null, {timeout: 20000}).catch(() => console.log('(preview has no footage)'));
  await page.waitForTimeout(800);
  await page.screenshot({path: path.join(out, 'panel-look.png'), timeout: 8000}).catch(() => console.log('(no picture of the panel)'));
  console.log('preview', JSON.stringify(await page.evaluate(() => panelDebug.preview())), '| buttons:', await page.evaluate(() => [document.getElementById('real-make-reference').textContent, document.getElementById('real-make-clips').textContent].join(' | ')));
  console.log('errors', JSON.stringify(errors));
  await app.close();
})().catch(error => { console.error('FAILED:', String(error.stack || error).slice(0, 900)); process.exit(1); });
