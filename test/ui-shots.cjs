// Costs nothing. Takes pictures of every screen for review, on a throwaway copy of the owner's data:
// the three settings tabs, and the pet's menu, chat and hover card on a plain backdrop.
// Usage: node test/ui-shots.cjs <output folder>
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
const out = process.argv[2];
if (!out) { console.error('Give an output folder.'); process.exit(1); }

(async () => {
  const root = path.join(__dirname, '..'), real = require('./data-dir.cjs')();
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-ui-'));
  for (const name of ['pet.json', 'Local State']) fs.copyFileSync(path.join(real, name), path.join(copy, name));
  for (const dir of ['realistic', 'photos', 'bowls']) if (fs.existsSync(path.join(real, dir))) fs.cpSync(path.join(real, dir), path.join(copy, dir), {recursive: true});
  fs.mkdirSync(out, {recursive: true});
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: copy, PET_OFFSCREEN: '1'}});
  const find = async name => { for (let i = 0; i < 80; i++) { const page = app.windows().find(w => w.url().includes(name)); if (page) return page; await new Promise(r => setTimeout(r, 250)); } throw new Error('no ' + name); };
  try {
    const overlay = await find('overlay.html');
    await overlay.waitForFunction(() => window.petDebug && petDebug.snapshot().look === 'realistic', null, {timeout: 30000});
    await overlay.evaluate(() => window.petHost.call('panel:open', 'look'));
    const panel = await find('panel.html');
    await panel.waitForFunction(() => window.panelDebug && document.querySelectorAll('#pets .pet-card').length);
    await panel.setViewportSize({width: 1180, height: 820});
    await panel.waitForTimeout(1200);
    await panel.screenshot({path: path.join(out, 'look.png')});
    await panel.screenshot({path: path.join(out, 'look-full.png'), fullPage: true, timeout: 15000}).catch(() => console.log('(no full picture of the look tab)'));
    for (const tab of ['talk', 'memory']) { await panel.locator(`#tabs [data-tab=${tab}]`).click(); await panel.waitForTimeout(500); await panel.screenshot({path: path.join(out, tab + '.png'), fullPage: true, timeout: 15000}).catch(() => panel.screenshot({path: path.join(out, tab + '.png'), timeout: 15000})).catch(e => console.log(`(no picture of ${tab})`)); }
    // The overlay window is off-screen and not composited, so its menu, chat and hover card are copied into a page of their own.
    const settle = () => overlay.waitForFunction(() => { const s = petDebug.snapshot(); if (s.mode !== 'sit') petDebug.command('sit'); return s.mode === 'sit'; }, null, {timeout: 15000, polling: 200});
    await settle();
    const {x} = await overlay.evaluate(() => petDebug.snapshot());
    await overlay.mouse.move(x, await overlay.evaluate(() => innerHeight - 60));
    await overlay.waitForTimeout(400);
    const grab = async name => {
      const url = await overlay.evaluate(() => {
        const s = petDebug.snapshot(), ratio = devicePixelRatio, stage = document.getElementById('stage');
        const w = 640 * ratio, h = 460 * ratio, canvas = Object.assign(document.createElement('canvas'), {width: w, height: h}), c = canvas.getContext('2d');
        c.fillStyle = '#5b6b7d'; c.fillRect(0, 0, w, h);
        c.drawImage(stage, Math.round(s.x * ratio - w / 2), stage.height - h, w, h, 0, 0, w, h);
        return canvas.toDataURL('image/png');
      });
      fs.writeFileSync(path.join(out, name + '-canvas.png'), Buffer.from(url.split(',')[1], 'base64'));
    };
    await grab('hover');
    // DOM parts: opened, then rendered by Chromium's own screenshot of the element.
    await overlay.evaluate(() => { document.getElementById('menu').hidden = false; });
    await overlay.locator('#menu').screenshot({path: path.join(out, 'menu.png')}).catch(e => console.log('(menu picture failed: ' + e.message.split('\n')[0] + ')'));
    await overlay.evaluate(() => { document.getElementById('menu').hidden = true; petDebug.openChat(); });
    await overlay.evaluate(() => { document.getElementById('bubble').hidden = false; document.getElementById('bubble-text').textContent = '喵～今天也要陪你一起工作哦。'; });
    await overlay.locator('#chat').screenshot({path: path.join(out, 'chat.png')}).catch(e => console.log('(chat picture failed: ' + e.message.split('\n')[0] + ')'));
    console.log('saved to', out);
  } finally { await app.close(); fs.rmSync(copy, {recursive: true, force: true}); }
})().catch(error => { console.error('FAILED:', String(error.stack || error).slice(0, 600)); process.exit(1); });
