// SPENDS REAL CREDIT. Drives the installed app with the owner's saved key to try the realistic look for real.
// Usage: node test/real-probe.cjs --spend <output folder> <step> [clip names...]
//   step "reference [description]"  about $0.05   step "clips idle walk"  about $0.12 per clip
//   step "describe"  a fraction of a cent: asks the vision model to read the reference picture
const path = require('path'), fs = require('fs');
const {_electron} = require('playwright-core');
const [flag, out, action, ...rest] = process.argv.slice(2);
if (flag !== '--spend' || !out || !action) { console.error('Refusing to run without --spend <folder> <step>.'); process.exit(1); }

(async () => {
  const root = path.join(__dirname, '..');
  fs.mkdirSync(out, {recursive: true});
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_OFFSCREEN: '1'}});
  let page;
  for (let i = 0; i < 60 && !page; i++) { page = app.windows().find(w => w.url().includes('overlay.html')); if (!page) await new Promise(r => setTimeout(r, 250)); }
  await page.waitForFunction(() => window.petHost);
  const call = (name, value) => page.evaluate(([name, value]) => window.petHost.call(name, value), [name, value]);
  const state = await call('state');
  console.log('key saved:', state.hasKey, '| image model:', state.settings.imageModel, '| video model:', state.settings.videoModel, '| vision model:', state.settings.visionModel);
  if (!state.hasKey) throw new Error('No key is saved in the app.');
  const began = Date.now();
  try {
    if (action === 'reference') {
      // Uses the photos the owner chose (kept by the app) and their own description unless one is given here.
      const photos = await call('photos:kept');
      const description = rest.join(' ') || state.pet.description || '';
      console.log('photos:', photos.length, '| description:', JSON.stringify(description), '| species:', state.pet.traits.species);
      const result = await call('real:reference', {photos, description, species: state.pet.traits.species});
      if (result.error) throw new Error(result.error);
      fs.writeFileSync(path.join(out, 'reference.png'), Buffer.from(result.reference.split(',')[1], 'base64'));
      console.log('reference saved');
    } else if (action === 'clips') {
      const result = await call('real:clips', {names: rest, species: state.pet.traits.species});
      if (result.error) throw new Error(result.error);
      console.log('clips on disk:', result.clips.join(','), '| failed:', JSON.stringify(result.failed));
      for (const name of rest) { const clip = await call('real:clip', name); if (clip.video) fs.writeFileSync(path.join(out, name + '.mp4'), Buffer.from(clip.video, 'base64')); }
    } else if (action === 'describe') {
      const status = await call('real:status');
      const result = await call('traits:describe', {photos: [status.reference], species: 'cat', description: rest.join(' ')});
      console.log(JSON.stringify(result));
    } else throw new Error('Unknown step.');
  } finally {
    console.log('seconds:', Math.round((Date.now() - began) / 1000));
    await app.close();
  }
})().catch(error => { console.error('FAILED:', String(error.message || error).slice(0, 600)); process.exit(1); });
