// End-to-end check of the real app: adopt from photos, feed, drag, chat, remember, restart.
// The language model is a local stand-in, so no key and no network are needed.
// Usage: node test/app-check.cjs [folder for screenshots]
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), assert = require('assert');
const {_electron} = require('playwright-core');
const root = path.join(__dirname, '..');
const shots = process.argv[2];
const done = [];
const step = async (name, run) => { await run(); done.push(name); };

function fakeModel() {
  const server = http.createServer(async (req, res) => {
    const json = value => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(value)); };
    // Image and video generation: the picture and clip are made by the test page and handed back as if generated.
    if (req.method === 'GET' && req.url.includes('/files/clip')) { server.downloadAuth = req.headers.authorization; res.writeHead(200, {'Content-Type': 'video/webm'}); return res.end(Buffer.from(server.webm, 'base64')); }
    if (req.method === 'GET' && req.url.includes('/videos/')) return json({id: req.url.split('/').pop(), status: 'completed', unsigned_urls: [`http://127.0.0.1:${server.address().port}/files/clip.webm`]});
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body), last = request.messages?.at(-1)?.content;
    server.requests.push({url: req.url, auth: req.headers.authorization, system: request.messages?.[0]?.content, last, body: request});
    if (req.url.endsWith('/images')) return json({data: [{b64_json: server.png}]});
    if (req.url.endsWith('/videos')) { const id = 'job' + server.requests.length; return json({id, status: 'pending', polling_url: `/api/v1/videos/${id}`}); }
    const kinds = Array.isArray(last) ? last.map(part => part.type) : [];
    let content = 'Mrrp.';
    // A real model wraps its JSON in a code fence and leaves a trailing comma; the app must cope.
    if (kinds.includes('image_url')) content = 'Here you go:\n```json\n{"species":"cat","breed":"cow","weight":5.2,"base":"#3b3b40","secondary":"#f2efe9","belly":"#f2efe9","eye":"#e2b93b","pattern":"tuxedo","ears":"folded","tail":"fluffy","size":1.1,"fluff":0.7,"tufts":' + (/ear tips/.test(last[0].text) ? '0.9' : '0') + ',}\n```';
    else if (kinds.includes('input_audio')) content = '"Can you hear me"';
    else if (/can you hear me/i.test(last)) content = 'Loud and clear.';
    else if (/call yourself momo/i.test(last)) content = 'Momo it is. [[name: Momo]]';
    else if (/what are you called/i.test(last)) content = 'I am ' + (request.messages[0].content.match(/Your name is (\w+)/) || [])[1] + '.';
    else if (/my name is sam/i.test(last)) content = 'Nice to meet you, Sam. [[remember: Owner is called Sam]] [[do: jump]]';
    else if (/what is my name/i.test(last)) content = /Owner is called Sam/.test(request.messages[0].content) ? 'You are Sam, obviously.' : 'I have no idea.';
    res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({choices: [{message: {content}}]}));
  });
  server.requests = [];
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launch(data) {
  const app = await _electron.launch({executablePath: require(path.join(root, 'node_modules/electron')), args: [root, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], env: {...process.env, PET_DATA_DIR: data, PET_OFFSCREEN: '1'}});
  const find = async (name, wait = 10000) => {
    for (let waited = 0; waited < wait; waited += 200) {
      const page = app.windows().find(w => w.url().includes(name));
      if (page) return page;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  };
  return {app, find};
}

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-check-'));
  const model = await fakeModel();
  const errors = [];
  const watch = page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text())); };
  let {app, find} = await launch(data);
  let overlay = await find('overlay.html'), panel = await find('panel.html');
  watch(overlay); watch(panel);
  await overlay.waitForFunction(() => window.petDebug);
  await panel.waitForFunction(() => window.panelDebug);
  const snap = () => overlay.evaluate(() => petDebug.snapshot());
  // The overlay is off-screen during checks and is not composited, so save what its canvas holds rather than a screenshot.
  // Pictures of the settings window are a convenience for review; a window that is not being drawn must not fail the check.
  const picture = name => panel.screenshot({path: path.join(shots, name), timeout: 5000}).catch(() => console.log('(no picture: ' + name + ')'));
  const capture = async name => fs.writeFileSync(path.join(shots, name), Buffer.from((await overlay.evaluate(() => document.getElementById('stage').toDataURL())).split(',')[1], 'base64'));
  // The pet may be mid-jump or walking; ask it to sit until it actually is sitting still on the ground.
  const settle = () => overlay.waitForFunction(() => { const s = petDebug.snapshot(); if (s.mode !== 'sit') petDebug.command('sit'); return s.mode === 'sit' && s.alt === 0; }, null, {timeout: 10000, polling: 100});

  await step('first run opens the look panel with every label translated', async () => {
    assert.equal(await panel.locator('#look').isVisible(), true);
    assert.equal(await panel.evaluate(() => [...document.querySelectorAll('[data-t]')].filter(el => !el.textContent.trim()).length), 0);
    assert.ok((await panel.locator('#save-look').textContent()).length > 0);
  });

  await step('choosing a breed brings its usual colour and weight, and the owner\'s own weight and sex are kept', async () => {
    assert.ok(await panel.locator('#breed option').count() > 20);
    assert.equal(await panel.locator('#preview-note').isVisible(), true); // nothing generated yet, and the page says so
    await panel.locator('#breed').selectOption('british-blue');
    assert.deepEqual(await panel.evaluate(() => { const d = panelDebug.draft(); return [d.breed, d.base, d.weight]; }), ['british-blue', '#7e8794', 5.5]);
    assert.equal(await panel.locator('#base').inputValue(), '#7e8794'); assert.equal(await panel.locator('#weight').inputValue(), '5.5');
    await panel.locator('#sex').selectOption('female');
    await panel.locator('#weight').fill('4.2');
    await panel.locator('#breed').selectOption('black'); // the weight was typed by the owner, so the breed's usual one does not replace it
    const d = await panel.evaluate(() => panelDebug.draft());
    assert.deepEqual([d.breed, d.sex, d.weight, d.base], ['black', 'female', 4.2, '#1c1b1d']);
    assert.ok(d.size > 0.9 && d.size < 1, `size ${d.size}`); // how large it is drawn follows its weight
    assert.equal(await panel.locator('#pattern, #ears, #tail, #fluff, #tufts, #real-use').count(), 0); // the drawn pet's editor is gone
  });

  await step('photos set the coat colour locally', async () => {
    const base = await panel.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), {width: 400, height: 300});
      const c = canvas.getContext('2d');
      c.fillStyle = '#2f6b3a'; c.fillRect(0, 0, 400, 300);
      c.fillStyle = '#8d8f96'; c.beginPath(); c.ellipse(200, 150, 120, 90, 0, 0, 7); c.fill();
      await panelDebug.addPhotos([{name: 'grey-cat.png', url: canvas.toDataURL()}]);
      return panelDebug.draft().base;
    });
    const [r, g, b] = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
    assert.ok(Math.abs(r - 0x8d) < 12 && Math.abs(g - 0x8f) < 12 && Math.abs(b - 0x96) < 12, `expected grey, got ${base}`);
    assert.equal(await panel.locator('#look-note').isVisible(), true);
    assert.equal(await panel.locator('#thumbs img').count(), 1);
    assert.equal(await panel.locator('#ask-model').isVisible(), false); // no key yet
  });

  await step('a second and third photo are added, a fourth is refused, and one can be removed', async () => {
    const paint = colour => panel.evaluate(async colour => {
      const canvas = Object.assign(document.createElement('canvas'), {width: 200, height: 150});
      const c = canvas.getContext('2d'); c.fillStyle = '#2f6b3a'; c.fillRect(0, 0, 200, 150); c.fillStyle = colour; c.fillRect(60, 40, 80, 70);
      return panelDebug.addPhotos([{name: colour + '.png', url: canvas.toDataURL()}]);
    }, colour);
    assert.equal(await paint('#8d8f96'), 0); assert.equal(await paint('#8d8f96'), 0);
    assert.deepEqual(await panel.evaluate(() => panelDebug.photos()), ['grey-cat.png', '#8d8f96.png', '#8d8f96.png']);
    assert.equal(await paint('#ff0000'), 1); // did not fit
    assert.equal(await panel.locator('#thumbs img').count(), 3);
    await panel.locator('#thumbs figure button').last().click();
    await panel.waitForFunction(() => panelDebug.photos().length === 2 && document.querySelectorAll('#thumbs img').length === 2); // thumbnails redraw after re-reading
  });

  await step('settings save an encrypted key and the connection test gets a reply', async () => {
    await panel.locator('#tabs [data-tab=talk]').click();
    await panel.locator('#baseUrl').fill(`http://127.0.0.1:${model.address().port}/v1`);
    await panel.locator('#key').fill('test-key-123');
    await panel.locator('#speakAloud').uncheck(); // keep the test run silent
    await panel.locator('#hello').click();
    await panel.locator('#hello-reply').waitFor();
    assert.equal(await panel.locator('#hello-reply').textContent(), 'Mrrp.');
    assert.equal(await panel.locator('#key').inputValue(), '');
    assert.equal(model.requests[0].auth, 'Bearer test-key-123');
    assert.ok(!fs.readFileSync(path.join(data, 'pet.json'), 'utf8').includes('test-key-123'));
    assert.ok((await panel.locator('#personality-text').textContent()).includes('house cat'));
  });

  await step('the vision model describes the photos, and adopting updates the pet on the desktop', async () => {
    await panel.locator('#tabs [data-tab=look]').click();
    await panel.locator('#description').fill('Very long hair on the ear tips.');
    await panel.locator('#ask-model').click();
    await panel.waitForFunction(() => panelDebug.draft().pattern === 'tuxedo');
    assert.equal(await panel.locator('#breed').inputValue(), 'cow'); assert.equal(await panel.locator('#weight').inputValue(), '5.2');
    assert.equal(await panel.locator('#sex').inputValue(), 'female'); // what only the owner knows is not overwritten
    assert.equal(await panel.evaluate(() => panelDebug.draft().tufts), 0.9); // the owner's words reached the model and came back as a trait
    await panel.locator('#name').fill('Oreo');
    if (shots) await picture('panel-look.png');
    await panel.locator('#save-look').click();
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Oreo');
    assert.equal((await snap()).traits.pattern, 'tuxedo');
  });

  await step('the window lets clicks through except over the pet', async () => {
    await settle();
    const {x} = await snap();
    const y = await overlay.evaluate(() => innerHeight - 60);
    await overlay.mouse.move(40, 40); await overlay.waitForTimeout(150);
    assert.equal((await snap()).solid, false);
    // The person's real cursor also reaches the window once it stops ignoring the mouse, and can switch it back within
    // a few milliseconds. So count the times it turned solid instead of reading the state afterwards.
    const before = (await snap()).turnedSolid;
    await overlay.mouse.move(x, y);
    await overlay.waitForFunction(count => petDebug.snapshot().turnedSolid > count, before, {timeout: 4000});
    await overlay.mouse.down(); await overlay.mouse.up();
    assert.equal(await overlay.locator('#menu').isVisible(), true);
    assert.equal(await overlay.locator('#menu [data-act=hide], #menu [data-act=quit]').count(), 2);
    if (shots) await capture('overlay-menu.png');
  });

  await step('a hungry pet runs to the kibble from the menu and eats it', async () => {
    await overlay.evaluate(() => petDebug.setNeeds({food: 20}));
    await overlay.locator('#menu [data-act=kibble]').click();
    assert.deepEqual((await snap()).items.map(i => i.kind), ['kibble']);
    await overlay.waitForFunction(() => petDebug.snapshot().mode === 'eat', null, {timeout: 15000});
    if (shots) await capture('overlay-eating.png');
    await overlay.waitForFunction(() => petDebug.snapshot().items.every(i => i.bites === 0), null, {timeout: 15000});
    assert.ok((await snap()).needs.food > 45);
  });

  await step('the pet can be picked up and dropped', async () => {
    await settle();
    const {x} = await snap(), y = await overlay.evaluate(() => innerHeight - 60);
    await overlay.mouse.move(x, y); await overlay.mouse.down();
    await overlay.mouse.move(x - 150, y - 320, {steps: 8});
    const held = await snap();
    assert.equal(held.mode, 'held'); assert.ok(held.alt > 200);
    await overlay.mouse.up();
    await overlay.waitForFunction(() => petDebug.snapshot().alt === 0, null, {timeout: 5000});
  });

  await step('chatting shows the reply without tags, the pet acts, and the fact is remembered', async () => {
    await overlay.evaluate(() => petDebug.openChat());
    // The jump is over in under a second, possibly before the reply has finished typing out, so its height is
    // watched from the moment the message is sent.
    await overlay.evaluate(() => { window.__peak = 0; (function watch() { window.__peak = Math.max(window.__peak, petDebug.snapshot().alt); requestAnimationFrame(watch); })(); });
    await overlay.locator('#say-text').fill('My name is Sam');
    await overlay.locator('#say-text').press('Enter');
    await overlay.waitForFunction(() => document.getElementById('bubble-text').textContent === 'Nice to meet you, Sam.', null, {timeout: 10000});
    await overlay.waitForFunction(() => window.__peak > 10, null, {timeout: 5000}); // [[do: jump]]
    if (shots) { await overlay.waitForTimeout(700); await capture('overlay-chat.png'); }
    const asked = model.requests.at(-1);
    assert.match(asked.system, /You are Oreo, a cat/); assert.match(asked.system, /What you are: a 5\.2 kg female black-and-white tuxedo/); assert.match(asked.system, /Very long hair on the ear tips/); assert.match(asked.system, /ate a bowl of kibble/); assert.match(asked.system, /was picked up/);
    await panel.locator('#tabs [data-tab=memory]').click();
    await panel.locator('#memories li span', {hasText: 'Owner is called Sam'}).waitFor();
    // The chat box has its own close button.
    await overlay.locator('#chat-close').click();
    assert.equal(await overlay.locator('#chat').isVisible(), false); assert.equal((await snap()).chatOpen, false);
    if (shots) await picture('panel-memory.png');
  });

  await step('a voice recording is written down by the listening model and answered', async () => {
    await overlay.evaluate(() => petDebug.openChat());
    await overlay.locator('#mic').click(); // Chromium's stand-in microphone supplies the sound
    await overlay.locator('#mic.recording').waitFor();
    await overlay.waitForTimeout(1200);
    await overlay.locator('#mic').click();
    await overlay.waitForFunction(() => document.getElementById('bubble-text').textContent === 'Loud and clear.', null, {timeout: 15000});
    const heard = model.requests.find(r => Array.isArray(r.last) && r.last.some(part => part.type === 'input_audio'));
    const wav = Buffer.from(heard.last.find(part => part.type === 'input_audio').input_audio.data, 'base64');
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.readUInt32LE(24), 16000);
    assert.ok(wav.length > 16000, `only ${wav.length} bytes recorded`); // more than half a second of sound
  });

  await step('the realistic look is generated, cut out of its green screen and played on the desktop', async () => {
    Object.assign(model, await panel.evaluate(async () => {
      const canvas = Object.assign(document.createElement('canvas'), {width: 640, height: 360});
      const c = canvas.getContext('2d');
      const paint = t => { // a grey animal with a green eye, bobbing on a green screen
        c.fillStyle = '#12e02a'; c.fillRect(0, 0, 640, 360);
        c.fillStyle = '#8a8d94'; c.beginPath(); c.ellipse(320, 240 - Math.sin(t * 6) * 16, 110, 60, 0, 0, 7); c.fill();
        c.fillRect(240, 250, 22, 70); c.fillRect(380, 250, 22, 70);
        c.fillStyle = '#2fd44a'; c.beginPath(); c.arc(390, 228, 6, 0, 7); c.fill();
      };
      paint(0);
      const png = canvas.toDataURL('image/png').split(',')[1];
      const recorder = new MediaRecorder(canvas.captureStream(30), {mimeType: 'video/webm'}), chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start();
      const began = performance.now();
      await new Promise(resolve => { const tick = () => { const t = (performance.now() - began) / 1000; paint(t); t < 1.2 ? requestAnimationFrame(tick) : resolve(); }; tick(); });
      recorder.stop(); await stopped;
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return {png, webm: btoa(binary)};
    }));
    await panel.locator('#tabs [data-tab=look]').click();
    await panel.locator('#real-make-reference').click();
    await panel.locator('#real-reference').waitFor();
    const painted = model.requests.find(r => r.url.endsWith('/images')).body;
    assert.match(painted.prompt, /this exact cat/); assert.match(painted.prompt, /Very long hair on the ear tips/);
    assert.match(painted.prompt, /The owner says it is a 5\.2 kg female black-and-white tuxedo domestic shorthair cat/);
    assert.equal(painted.input_references.length, 2); // both chosen photos went along
    assert.match(await panel.locator('#real-make-clips').textContent(), /18.*2\.16/); // the button says how many and about how much
    await panel.locator('#real-make-clips').click();
    await panel.waitForFunction(() => panelDebug.made().ready && panelDebug.preview().real, null, {timeout: 420000})
      .catch(async error => { console.log('progress:', await panel.evaluate(() => [...document.querySelectorAll('#real-progress li')].map(li => li.textContent).join(' | ') + ' || ' + document.getElementById('real-status').textContent)); throw error; });
    const films = model.requests.filter(r => r.url.endsWith('/videos')).map(r => r.body);
    assert.equal(films.length, 18);
    assert.equal(model.downloadAuth, 'Bearer test-key-123'); // the service's own download address needs the key
    assert.deepEqual(films[0].frame_images.map(f => f.frame_type), ['first_frame', 'last_frame']);
    assert.ok(films[0].frame_images[0].image_url.url.startsWith('data:image/png;base64,'));
    assert.equal(await panel.locator('#real-progress li.done').count(), 18);
    assert.equal(await panel.locator('#real-make-clips').isDisabled(), true); // nothing left to film
    // The preview now plays the pet's own footage: every motion has a button, and the grey animal is what is drawn.
    const shown = await panel.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 400)); return panelDebug.preview(); });
    assert.equal(shown.poses.length, 18); assert.ok(shown.poses.includes('stretch') && shown.poses.includes('nuzzle'));
    assert.ok(shown.middle[3] > 200 && Math.abs(shown.middle[0] - shown.middle[2]) < 30 && shown.middle[0] > 90, `preview pixel ${shown.middle}`);
    assert.equal(await panel.locator('#preview-note').isVisible(), false);
    // Every button plays its own footage (the Roll button once played nothing).
    for (const pose of shown.poses) {
      await panel.locator(`#poses [data-pose=${pose}]`).click();
      await panel.waitForFunction(pose => panelDebug.preview().showing === pose, pose, {timeout: 3000}).catch(() => {});
      assert.equal(await panel.evaluate(() => panelDebug.preview().showing), pose, `the ${pose} button`);
    }
    if (shots) await picture('panel-realistic.png');
    await overlay.waitForFunction(() => petDebug.snapshot().look === 'realistic', null, {timeout: 10000}); // it is on the desktop without ticking anything
    // One motion can be filmed again by itself: the first click says what it will cost, the second does it.
    await panel.locator('#real-progress li[data-clip=stretch]').click();
    assert.match(await panel.locator('#real-progress li[data-clip=stretch]').textContent(), /0\.12/);
    assert.equal(model.requests.filter(r => r.url.endsWith('/videos')).length, 18); // nothing has been ordered yet
    await panel.locator('#real-progress li[data-clip=stretch]').click();
    await panel.waitForFunction(() => document.querySelectorAll('#real-progress li.done').length === 18 && !document.getElementById('real-make-clips').dataset.busy && document.getElementById('real-status').textContent, null, {timeout: 60000});
    const again = model.requests.filter(r => r.url.endsWith('/videos')).map(r => r.body);
    assert.equal(again.length, 19); assert.match(again[18].prompt, /play-bow stretch/);
    await settle();
    // What is drawn where the pet stands is the grey animal, with no green screen left around it.
    const seen = await overlay.evaluate(() => {
      const s = petDebug.snapshot(), ratio = devicePixelRatio, stage = document.getElementById('stage');
      const read = (x, y) => [...stage.getContext('2d').getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data];
      const strip = stage.getContext('2d').getImageData(0, Math.round((innerHeight - 200) * ratio), stage.width, Math.round(190 * ratio)).data;
      let green = 0, solid = 0;
      for (let i = 0; i < strip.length; i += 4) { if (strip[i + 3] > 200) { solid++; if (strip[i + 1] > 180 && strip[i] < 90 && strip[i + 2] < 90) green++; } }
      return {body: read(s.x, innerHeight - 8 - 70), far: read(s.x > 600 ? 100 : innerWidth - 100, innerHeight - 100), green, solid};
    });
    assert.ok(seen.body[3] > 200 && Math.abs(seen.body[0] - seen.body[2]) < 30 && seen.body[0] > 90, `body pixel ${seen.body}`);
    assert.equal(seen.far[3], 0);
    assert.ok(seen.solid > 2000 && seen.green < seen.solid * 0.02, `green ${seen.green} of ${seen.solid}`); // only the small eye is green
    if (shots) await capture('overlay-realistic.png');
    await overlay.evaluate(() => petDebug.command('jump'));
    await overlay.waitForFunction(() => petDebug.snapshot().mode === 'perform', null, {timeout: 5000}); // gets up from sitting first
    assert.equal((await snap()).alt, 0);
  });

  await step('an own food bowl is painted from a photo, cut out, and eaten from on the desktop; the plain one comes back on request', async () => {
    model.png = await panel.evaluate(() => { // what the image model hands back: a red bowl on a green screen
      const canvas = Object.assign(document.createElement('canvas'), {width: 640, height: 360}), c = canvas.getContext('2d');
      c.fillStyle = '#12e02a'; c.fillRect(0, 0, 640, 360);
      c.fillStyle = '#c8322a'; c.beginPath(); c.moveTo(220, 170); c.lineTo(420, 170); c.lineTo(390, 260); c.lineTo(250, 260); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(320, 170, 100, 22, 0, 0, 7); c.fill(); c.fillStyle = '#7a1c16'; c.beginPath(); c.ellipse(320, 170, 88, 16, 0, 0, 7); c.fill();
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const before = model.requests.filter(r => r.url.endsWith('/images')).length;
    await panel.locator('#bowls summary').click();
    await panel.evaluate(() => panelDebug.bowlPhotos('kibble', [document.getElementById('real-reference').src]));
    await panel.locator('.bowl[data-kind=kibble] [data-do=make]').click();
    await panel.waitForFunction(() => panelDebug.bowls().kibble, null, {timeout: 20000});
    const asked = model.requests.filter(r => r.url.endsWith('/images'));
    assert.equal(asked.length, before + 1);
    assert.match(asked.at(-1).body.prompt, /this exact pet food bowl/); assert.equal(asked.at(-1).body.input_references.length, 1);
    const shape = await panel.evaluate(() => panelDebug.bowls().kibble);
    assert.ok(shape.width > 150 && shape.width < 220 && shape.rim > 5 && shape.rim < 40, `bowl ${shape.width}x${shape.height}, rim ${shape.rim}`); // cut to the bowl, rim found near the top
    await overlay.waitForFunction(() => petDebug.snapshot().bowls.includes('kibble'), null, {timeout: 5000});
    await overlay.evaluate(() => { petDebug.setNeeds({food: 99}); petDebug.drop('kibble'); });
    await overlay.waitForTimeout(400);
    const front = await overlay.evaluate(() => {
      const bowl = petDebug.snapshot().items.find(i => i.kind === 'kibble'), ratio = devicePixelRatio, stage = document.getElementById('stage');
      return [...stage.getContext('2d').getImageData(Math.round(bowl.x * ratio), Math.round((innerHeight - 8 - 5) * ratio), 1, 1).data];
    });
    assert.ok(front[3] > 200 && front[0] > 150 && front[1] < 90, `bowl pixel ${front}`); // the red bowl, not the plain blue-and-red one's colours
    if (shots) await capture('overlay-own-bowl.png');
    await panel.locator('.bowl[data-kind=kibble] [data-do=reset]').click();
    await overlay.waitForFunction(() => !petDebug.snapshot().bowls.includes('kibble'), null, {timeout: 5000});
  });

  await step('a hand resting by its head gets a head-bunt, the cursor is a hand there, and the sides of the screen are solid', async () => {
    await settle();
    const {head} = await snap();
    await overlay.mouse.move(40, 40); await overlay.mouse.move(head[0], head[1], {steps: 4});
    await overlay.waitForFunction(() => petDebug.snapshot().hand === 'open', null, {timeout: 4000});
    assert.match((await snap()).cursor, /url\(/); // a drawn hand, not the arrow
    // The hand does not have to keep still: it wanders about inside the head area the whole time.
    const began = Date.now();
    for (let i = 0; i < 80 && !((await snap()).act === 'nuzzle' && ['rise', 'perform'].includes((await snap()).mode)); i++) {
      await overlay.mouse.move(head[0] + Math.sin(i) * 14, head[1] + Math.cos(i * 1.7) * 10); await overlay.waitForTimeout(60);
    }
    const rubbing = await snap();
    assert.equal(rubbing.act, 'nuzzle'); assert.ok(['rise', 'perform'].includes(rubbing.mode), `mode ${rubbing.mode} after ${Date.now() - began} ms`);
    assert.ok(Date.now() - began > 1800, 'it should take two seconds or so, not happen at once');
    await overlay.mouse.move(40, 40);
    await overlay.waitForFunction(() => petDebug.snapshot().mode !== 'perform' && petDebug.snapshot().mode !== 'rise', null, {timeout: 12000});
    // Sent far beyond the right side, it stops with its nose at the wall; asked to stretch there, it turns to where there is room.
    const width = await overlay.evaluate(() => innerWidth);
    await overlay.evaluate(() => petDebug.command('run', 99999));
    await overlay.waitForFunction(() => petDebug.snapshot().x === petDebug.snapshot().limits[1], null, {timeout: 30000, polling: 50});
    const atWall = await snap();
    assert.ok(atWall.x + atWall.body.ahead <= width + 1 && atWall.body.ahead > 60, `x ${atWall.x}, body ${JSON.stringify(atWall.body)}, width ${width}`);
    await overlay.waitForFunction(() => { if (petDebug.snapshot().mode !== 'perform') petDebug.command('stretch'); return petDebug.snapshot().mode === 'perform' && petDebug.snapshot().act === 'stretch'; }, null, {timeout: 8000, polling: 100});
    assert.ok((await snap()).x <= width - atWall.body.ahead + 1);
  });

  await step('the pet can be renamed by typing, by a memory, or in conversation, and answers to the new name', async () => {
    await panel.locator('#tabs [data-tab=look]').click();
    await panel.locator('#name').fill('Nori');                           // no button pressed: it saves as it is typed
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Nori', null, {timeout: 5000});
    await panel.locator('#tabs [data-tab=memory]').click();
    await panel.locator('#memory-text').fill('你叫Gigi');
    await panel.locator('#memory-add button').click();
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Gigi', null, {timeout: 5000});
    assert.equal(await panel.locator('#memories li span', {hasText: 'Gigi'}).count(), 0); // a rename, not a fact about the owner
    await overlay.evaluate(() => petDebug.send('What are you called?'));
    await overlay.waitForFunction(() => document.getElementById('bubble-text').textContent === 'I am Gigi.', null, {timeout: 10000});
    assert.match(model.requests.at(-1).system, /You used to be called Mochi, Oreo, Nori/);
    await overlay.evaluate(() => petDebug.send('Call yourself Momo from now on'));
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Momo', null, {timeout: 10000});
    await panel.locator('#tabs [data-tab=look]').click();
    await panel.waitForFunction(() => document.getElementById('name').value === 'Momo'); // the settings window follows
  });

  await step('a custom personality file is used on the next message', async () => {
    const file = path.join(data, 'grumpy.md');
    fs.writeFileSync(file, '# Personality\nYou are a grumpy old cat who complains about everything.\n');
    // The file dialog only fills in this setting, so the check sets it the same way.
    await panel.evaluate(file => window.petHost.call('settings:save', {settings: {personalityPath: file}}), file);
    await overlay.evaluate(() => petDebug.send('hello again'));
    await overlay.waitForFunction(() => document.getElementById('bubble-text').textContent === 'Mrrp.');
    assert.match(model.requests.at(-1).system, /grumpy old cat/);
    assert.doesNotMatch(model.requests.at(-1).system, /house cat/);
  });

  await step('a second pet can be added and brought out; each keeps its own look, name and memories', async () => {
    await panel.locator('#tabs [data-tab=look]').click();
    await panel.locator('#pets .pet-add').click();
    await panel.waitForFunction(() => window.panelDebug && document.querySelectorAll('#pets .pet-card').length === 2, null, {timeout: 10000});
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Mochi' && petDebug.snapshot().look === 'cartoon', null, {timeout: 10000});
    assert.equal((await overlay.evaluate(() => window.petHost.call('state'))).memories.length, 0); // a new pet knows nothing yet
    assert.equal(await panel.locator('#pets .pet-card.on b').textContent(), 'Mochi');
    await panel.locator('#pets button.pet-card', {hasText: 'Momo'}).click();
    await panel.waitForFunction(() => window.panelDebug && document.querySelector('#pets .pet-card.on b')?.textContent === 'Momo', null, {timeout: 10000});
    await overlay.waitForFunction(() => petDebug.snapshot().traits.name === 'Momo' && petDebug.snapshot().look === 'realistic', null, {timeout: 15000});
    assert.ok((await overlay.evaluate(() => window.petHost.call('state'))).memories.some(m => /Sam/.test(m.text)));
    // Removing takes two clicks; the pet on the desktop has no × at all.
    await panel.locator('#pets .pet-remove').click();
    assert.match(await panel.locator('#pets button.pet-card small').textContent(), /Mochi/);
    await panel.locator('#pets .pet-remove').click();
    await panel.waitForFunction(() => document.querySelectorAll('#pets .pet-card').length === 1, null, {timeout: 5000});
    assert.equal(await panel.locator('#pets .pet-remove').count(), 0);
  });

  await step('after a restart the pet, its look and its memory are still there', async () => {
    await app.close();
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'pet.json'), 'utf8'));
    assert.equal(saved.pet.traits.name, 'Momo'); assert.equal(saved.pet.adopted, true);
    assert.ok(!JSON.stringify(saved).includes('test-key-123'));
    ({app, find} = await launch(data));
    overlay = await find('overlay.html'); watch(overlay);
    await overlay.waitForFunction(() => window.petDebug);
    assert.equal(await find('panel.html', 1500), null); // already adopted: no setup window
    assert.equal((await snap()).traits.name, 'Momo'); assert.equal((await snap()).look, 'realistic');
    // The photos chosen before the restart are still there, without recolouring the saved look.
    await overlay.evaluate(() => window.petHost.call('panel:open', 'look'));
    const again = await find('panel.html'); watch(again);
    await again.waitForFunction(() => window.panelDebug && panelDebug.photos().length === 2 && document.querySelectorAll('#thumbs img').length === 2);
    assert.equal(await again.evaluate(() => panelDebug.draft().pattern), 'tuxedo');
    // Hiding from the pet's own menu takes it off the desktop but leaves the app running.
    await overlay.evaluate(() => window.petHost.call('overlay:hide'));
    assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('overlay.html')).isVisible()), false);
    await overlay.evaluate(() => petDebug.send('What is my name?'));
    await overlay.waitForFunction(() => document.getElementById('bubble-text').textContent === 'You are Sam, obviously.', null, {timeout: 10000});
  });

  await app.close(); model.close(); fs.rmSync(data, {recursive: true, force: true});
  assert.deepEqual(errors, []);
  console.log(done.map(name => 'ok  ' + name).join('\n'));
})().catch(error => { console.error('passed:\n' + done.join('\n') + '\n\nFAILED: ' + String(error.stack || error).slice(0, 1500)); process.exit(1); });
