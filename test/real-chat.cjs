// SPENDS A LITTLE REAL CREDIT (a few short chat replies). Talks to the real chat model through the app,
// on a throwaway copy of the owner's data so the real pet's conversation and memory are left untouched.
// Usage: node test/real-chat.cjs --spend "message one" "message two" ...
const path = require('path'), fs = require('fs'), os = require('os');
const {_electron} = require('playwright-core');
const [flag, ...messages] = process.argv.slice(2);
if (flag !== '--spend' || !messages.length) { console.error('Refusing to run without --spend and at least one message.'); process.exit(1); }

(async () => {
  const root = path.join(__dirname, '..');
  const real = require('./data-dir.cjs')();
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-chat-'));
  // pet.json holds the encrypted key; "Local State" holds what the system needs to decrypt it for this user.
  for (const name of ['pet.json', 'Local State']) fs.copyFileSync(path.join(real, name), path.join(copy, name));
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root], env: {...process.env, PET_DATA_DIR: copy, PET_OFFSCREEN: '1'}});
  try {
    let page;
    for (let i = 0; i < 60 && !page; i++) { page = app.windows().find(w => w.url().includes('overlay.html')); if (!page) await new Promise(r => setTimeout(r, 250)); }
    await page.waitForFunction(() => window.petHost);
    const call = (name, value) => page.evaluate(([name, value]) => window.petHost.call(name, value), [name, value]);
    const state = await call('state');
    console.log('name at start:', state.pet.traits.name, '| key usable:', state.hasKey, '| model:', state.settings.chatModel, '| memories:', JSON.stringify(state.memories.map(m => m.text)));
    for (const message of messages) {
      const reply = await call('chat', message);
      console.log('\nYOU:', message, '\nPET:', reply.error ? 'ERROR ' + reply.error : reply.text, reply.renamed ? `\n     (renamed to ${reply.renamed})` : '', reply.remembered?.length ? `\n     (remembered ${JSON.stringify(reply.remembered)})` : '', reply.acts?.length ? `\n     (acts ${reply.acts})` : '');
    }
    console.log('\nname at end:', (await call('state')).pet.traits.name);
  } finally { await app.close(); fs.rmSync(copy, {recursive: true, force: true}); }
})().catch(error => { console.error('FAILED:', String(error.message || error).slice(0, 500)); process.exit(1); });
