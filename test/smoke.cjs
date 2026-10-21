// Launches the real app with Playwright and reports what the overlay is doing. Usage: node test/smoke.cjs [screenshot.png]
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
(async () => {
  const root = path.join(__dirname, '..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-smoke-'));
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: data, PET_OFFSCREEN: '1'}});
  const errors = [];
  let overlay;
  for (let i = 0; i < 40 && !overlay; i++) { overlay = app.windows().find(w => w.url().endsWith('overlay.html')); if (!overlay) await new Promise(r => setTimeout(r, 250)); }
  overlay.on('pageerror', e => errors.push(e.message)); overlay.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await overlay.waitForFunction(() => window.petDebug);
  await overlay.waitForTimeout(1500);
  console.log(JSON.stringify(await overlay.evaluate(() => ({...petDebug.snapshot(), size: [innerWidth, innerHeight]}))));
  if (process.argv[2]) await overlay.screenshot({path: process.argv[2], omitBackground: true});
  console.log('errors', JSON.stringify(errors));
  await app.close(); fs.rmSync(data, {recursive: true, force: true});
})().catch(e => { console.error(String(e.stack || e).slice(0, 900)); process.exit(1); });
