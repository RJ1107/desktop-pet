// Renders every pose for several looks on one sheet, so the drawing can be reviewed at a glance. Usage: node test/poses.cjs out.png
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
(async () => {
  const root = path.join(__dirname, '..');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-poses-'));
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: data, PET_OFFSCREEN: '1'}});
  let overlay;
  for (let i = 0; i < 40 && !overlay; i++) { overlay = app.windows().find(w => w.url().endsWith('overlay.html')); if (!overlay) await new Promise(r => setTimeout(r, 250)); }
  await overlay.waitForFunction(() => window.petDebug);
  const url = await overlay.evaluate(async () => {
    const {drawPet, restPose} = await import('./pet/rig.js');
    const {normalizeTraits} = await import('../shared/traits.js');
    const looks = [
      {species: 'cat', pattern: 'tabby'},
      {species: 'cat', pattern: 'tuxedo', base: '#2a2a2e', secondary: '#f4f1ea', belly: '#f4f1ea', eye: '#e0b93a', ears: 'folded', tail: 'fluffy', fluff: 0.8},
      {species: 'cat', pattern: 'points', base: '#eadbc4', secondary: '#5b4234', belly: '#f5ecdd', eye: '#5aa3e0', tail: 'long'},
      {species: 'dog', pattern: 'bicolor'},
      {species: 'dog', pattern: 'spots', base: '#f3efe8', secondary: '#33302c', belly: '#ffffff', ears: 'floppy', tail: 'long', size: 1.2},
      {species: 'dog', pattern: 'solid', base: '#8a5a33', secondary: '#5d3b20', belly: '#b98958', ears: 'pointed', tail: 'short', size: 0.9, fluff: 1}
    ].map(look => normalizeTraits(look));
    const poses = {
      stand: {}, walk: {stride: 0.55, gait: 1.2}, run: {stride: 1, gait: 2.4}, jump: {reach: 1, tilt: -0.3},
      sit: {sit: 1}, sleep: {lie: 1, eyes: 'closed'}, eat: {head: 1, mouth: 0.8}, drink: {head: 1, tongue: 0.9}, happy: {eyes: 'happy', sit: 0.4, tail: 1}, left: {facing: -1, stride: 0.55, gait: 4}
    };
    const names = Object.keys(poses), cell = [190, 150];
    const canvas = document.createElement('canvas'); canvas.width = names.length * cell[0]; canvas.height = looks.length * cell[1] + 24;
    const c = canvas.getContext('2d');
    c.fillStyle = '#7d98b3'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#fff'; c.font = '13px sans-serif'; c.textAlign = 'center';
    names.forEach((name, i) => c.fillText(name, i * cell[0] + cell[0] / 2, 16));
    looks.forEach((traits, row) => names.forEach((name, col) => {
      c.save(); c.translate(col * cell[0] + cell[0] / 2 - 10, 24 + (row + 1) * cell[1] - 14 - (name === 'jump' ? 26 : 0));
      drawPet(c, traits, {...restPose(), ...poses[name]}); c.restore();
    }));
    return canvas.toDataURL('image/png');
  });
  fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
  await app.close(); fs.rmSync(data, {recursive: true, force: true});
  console.log('wrote', process.argv[2]);
})().catch(e => { console.error(String(e.stack || e).slice(0, 900)); process.exit(1); });
