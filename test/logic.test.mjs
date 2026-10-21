import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {defaultNeeds, tick, applyOffline, consume, urge, wants, describe, ITEMS} from '../src/shared/needs.js';
import {bowlPrompt} from '../src/main/bowls.js';
import {normalizeTraits, defaultTraits, analyzePixels, traitsFromAnalyses, parseHex} from '../src/shared/traits.js';
import {parseReply, addMemories, recall, tokens, trimHistory, nameFrom, cleanName} from '../src/shared/memory.js';
import {buildSystemPrompt} from '../src/shared/prompt.js';
import {encodeWav} from '../src/shared/wav.js';
import {createStore} from '../src/main/store.js';
import {chat, describePhotos, transcribe, speak, looseJson} from '../src/main/llm.js';
import {createPet, step, command} from '../src/renderer/pet/brain.js';

test('needs drift, sleep restores energy, neglect sours the mood, and time away never starves the pet', () => {
  const start = defaultNeeds();
  const hour = tick(start, 60);
  assert.ok(hour.food < start.food && hour.water < hour.food && hour.energy < start.energy);
  assert.ok(tick({...start, energy: 20}, 10, {asleep: true}).energy > 55);
  assert.ok(tick({...start, food: 10}, 10).mood < start.mood);
  assert.deepEqual(tick({food: 0, water: 0, energy: 0, mood: 0}, 999), {food: 0, water: 0, energy: 0, mood: 0});
  const away = applyOffline(start, 60 * 24 * 30);
  assert.ok(away.food >= 15 && away.water >= 15 && away.energy >= 60 && away.mood >= 30);
  assert.equal(urge({...start, energy: 5}), 'sleep'); assert.equal(urge({...start, water: 10}), 'drink'); assert.equal(urge(start), null);
  assert.ok(consume(start, 'kibble').food > start.food); assert.ok(consume(start, 'treat').mood > start.mood);
  assert.throws(() => consume(start, 'pizza'), /Unknown item/);
  assert.equal(wants({...start, food: 99}, 'kibble'), false); assert.equal(wants({...start, food: 99}, 'treat'), true);
  assert.match(describe({food: 10, water: 10, energy: 10, mood: 10}), /very hungry.*very thirsty.*sleepy.*grumpy/);
});

test('traits are always drawable, whatever a model or an old save contains', () => {
  const messy = normalizeTraits({species: 'dragon', base: 'red', pattern: 'plaid', size: 99, fluff: -3, name: '   ', ears: null});
  assert.deepEqual(messy, {...defaultTraits('cat'), size: 1.3, fluff: 0});
  const dog = normalizeTraits({species: 'dog', base: '#ABCDEF', size: '1.2', name: '  Rex  '});
  assert.equal(dog.base, '#abcdef'); assert.equal(dog.size, 1.2); assert.equal(dog.name, 'Rex'); assert.equal(dog.ears, 'floppy');
});

function photo(width, height, paint) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([...paint(x, y), 255], (y * width + x) * 4);
  return analyzePixels(pixels, width, height);
}
test('coat colours are read from photos without a model', () => {
  const inside = (x, y) => (x - 50) ** 2 + (y - 50) ** 2 < 30 ** 2;
  const orange = photo(100, 100, (x, y) => inside(x, y) ? [226, 140, 60] : [40, 90, 40]);
  const one = traitsFromAnalyses([orange], 'cat');
  assert.equal(one.pattern, 'solid');
  const [r, g, b] = parseHex(one.base);
  assert.ok(r > 200 && g > 110 && g < 170 && b < 100, `expected orange, got ${one.base}`);
  // A black and white animal on a mid-grey floor is recognised as tuxedo, with black as the coat.
  const tuxedo = traitsFromAnalyses([photo(100, 100, (x, y) => inside(x, y) ? (x < 50 ? [20, 20, 22] : [245, 245, 240]) : [120, 130, 125])], 'cat');
  assert.equal(tuxedo.pattern, 'tuxedo'); assert.ok(parseHex(tuxedo.base)[0] < 60); assert.ok(parseHex(tuxedo.belly)[0] > 220);
  // A photo that is all background gives nothing rather than a guess.
  assert.equal(photo(60, 60, () => [90, 90, 90]), null);
  assert.equal(traitsFromAnalyses([null, null], 'dog'), null);
});

test('replies are cleaned of tags, and only known actions are accepted', () => {
  const reply = parseReply('Mrrp. Nice to meet you, Sam! [[remember: owner is called Sam]] [[do: jump]] [[do: explode]] [[ DO : Jump ]]');
  assert.equal(reply.text, 'Mrrp. Nice to meet you, Sam!');
  assert.deepEqual(reply.remember, ['owner is called Sam']); assert.deepEqual(reply.acts, ['jump']);
  assert.equal(parseReply('你好 [[remember: 主人叫小石]]。').text, '你好。');
  assert.equal(parseReply(undefined).text, '');
});

test('telling the pet its name is understood as a rename, in Chinese and English, and nothing else is', () => {
  for (const [said, name] of [['你叫Gigi', 'Gigi'], ['你的名字叫 Gigi。', 'Gigi'], ['以后你叫“小黑”', '小黑'], ['从现在起你就叫Momo！', 'Momo'], ['Your name is Gigi.', 'Gigi'], ["You're called Nori", 'Nori']]) assert.equal(nameFrom(said), name, said);
  for (const said of ['你叫什么名字', '你叫啥', '主人叫小石', '我叫小石', 'Owner is called Sam', '你是只猫', '']) assert.equal(nameFrom(said), null, said);
  assert.equal(cleanName('  “Gigi”。 '), 'Gigi'); assert.equal(cleanName('x'.repeat(40)).length, 24);
  // Only the explicit tag renames from a reply: a remembered fact may begin "你叫..." and mean the owner.
  const reply = parseReply('好呀，我以后就叫Gigi了。[[name: Gigi]] [[remember: 你叫小石]]');
  assert.equal(reply.name, 'Gigi'); assert.deepEqual(reply.remember, ['你叫小石']); assert.equal(reply.text, '好呀，我以后就叫Gigi了。');
  assert.equal(parseReply('Mrrp.').name, null);
});

test('memories deduplicate, stay bounded, and the relevant ones are recalled in any language', () => {
  let list = addMemories([], ['Owner is called Sam', 'Sam likes hiking'], 1000);
  list = addMemories(list, ['owner is called sam!', '主人下周五要去上海出差'], 2000);
  assert.equal(list.length, 3); assert.equal(list[0].seenAt, 2000);
  assert.equal(recall(list, 'do you remember my hiking trip', 1, 3000)[0].text, 'Sam likes hiking');
  assert.equal(recall(list, '我什么时候去上海', 1, 3000)[0].text, '主人下周五要去上海出差');
  assert.ok(tokens('去上海').has('上海'));
  let many = [];
  for (let i = 0; i < 230; i++) many = addMemories(many, [`fact number ${i}`], i);
  assert.equal(many.length, 200); assert.equal(many.at(-1).text, 'fact number 229'); assert.equal(many[0].text, 'fact number 30');
  assert.equal(trimHistory(Array.from({length: 50}, (_, i) => i)).length, 24);
});

test('the prompt carries personality, current needs, recent events and memories', () => {
  const prompt = buildSystemPrompt({personality: 'You are aloof.', traits: {name: 'Mochi', species: 'cat'}, needs: {food: 10, water: 80, energy: 80, mood: 60}, memories: [{text: 'Owner is called Sam'}], events: ['was petted'], bornAt: 0, now: 3 * 86400000});
  for (const part of ['You are Mochi, a cat', 'You are aloof.', 'very hungry', '3 days ago', 'was petted', '- Owner is called Sam', '[[remember:', 'jump, run, sit']) assert.ok(prompt.includes(part), part);
  assert.match(buildSystemPrompt({personality: 'x', traits: {name: 'A', species: 'dog'}, needs: defaultNeeds()}), /Nothing yet/);
  const renamed = buildSystemPrompt({personality: 'x', traits: {name: 'Gigi', species: 'cat'}, needs: defaultNeeds(), formerNames: ['Mochi']});
  assert.match(renamed, /You are Gigi, a cat/); assert.match(renamed, /Your name is Gigi\. You used to be called Mochi/); assert.match(renamed, /\[\[name: TheNewName\]\]/);
  assert.doesNotMatch(buildSystemPrompt({personality: 'x', traits: {name: 'A', species: 'dog'}, needs: defaultNeeds()}), /used to be called/);
});

test('the store keeps the key encrypted, hides it from windows, and survives a damaged file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-store-'));
  try {
    const crypto = {encrypt: plain => Buffer.from(plain).reverse().toString('base64'), decrypt: stored => Buffer.from(stored, 'base64').reverse().toString()};
    const store = createStore(directory, crypto);
    store.setKey('sk-test-secret');
    const onDisk = fs.readFileSync(store.file, 'utf8');
    assert.ok(!onDisk.includes('sk-test-secret')); assert.ok(!JSON.stringify(store.view()).includes('sk-test-secret'));
    assert.equal(store.view().hasKey, true); assert.equal(createStore(directory, crypto).getKey(), 'sk-test-secret');
    assert.throws(() => createStore(directory).setKey('plain'), /cannot encrypt/);
    store.data.pet.needs.food = 50; store.data.pet.lastSeen = Date.now() - 3 * 3600000; store.save();
    assert.ok(createStore(directory, crypto).data.pet.needs.food < 50);
    fs.writeFileSync(store.file, '{ not json');
    assert.equal(createStore(directory, crypto).data.pet.traits.species, 'cat'); assert.ok(fs.existsSync(store.file + '.unreadable'));
  } finally { fs.rmSync(directory, {recursive: true, force: true}); }
});

test('the model client talks to an OpenAI-compatible server and explains failures without leaking the key', async () => {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = {url: req.url, auth: req.headers.authorization, body: JSON.parse(body)}; seen.push(request);
    if (request.auth !== 'Bearer good-key') { res.writeHead(401, {'Content-Type': 'application/json'}); return res.end('{"error":{"message":"bad key good-key"}}'); }
    if (req.url.endsWith('/audio/speech')) { res.writeHead(200, {'Content-Type': 'audio/mpeg'}); return res.end(Buffer.from('ID3fake')); }
    const first = request.body.messages.at(-1).content;
    const kinds = Array.isArray(first) ? first.map(part => part.type) : [];
    const content = kinds.includes('image_url') ? 'Sure: {"species":"dog","base":"#112233","pattern":"spots","ears":"floppy","tail":"curled","size":1.2,"fluff":2}'
      : kinds.includes('input_audio') ? '"hello pet"' : 'Mrrp! [[do: jump]]';
    res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({choices: [{message: {content}}]}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const settings = {baseUrl: `http://127.0.0.1:${server.address().port}/v1/`, chatModel: 'chat-m', visionModel: 'vision-m', listenModel: 'listen-m', voiceModel: 'voice-m', voiceName: 'lily'};
  try {
    assert.equal(await chat(settings, 'good-key', [{role: 'user', content: 'hi'}]), 'Mrrp! [[do: jump]]');
    assert.equal(seen[0].url, '/v1/chat/completions'); assert.equal(seen[0].body.model, 'chat-m');
    const traits = await describePhotos(settings, 'good-key', ['data:image/jpeg;base64,AAAA'], 'cat');
    assert.equal(traits.species, 'dog'); assert.equal(traits.base, '#112233'); assert.equal(traits.fluff, 1); assert.equal(seen[1].body.model, 'vision-m');
    assert.equal(await transcribe(settings, 'good-key', 'UklGRg=='), 'hello pet'); assert.equal(seen[2].body.messages[0].content[1].input_audio.format, 'wav');
    assert.equal(Buffer.from(await speak(settings, 'good-key', 'hi'), 'base64').toString(), 'ID3fake'); assert.equal(seen[3].body.voice, 'lily');
    await assert.rejects(chat(settings, 'wrong', []), error => /key was rejected/.test(error.message) && !error.message.includes('wrong') && !error.message.includes('good-key'));
    await assert.rejects(chat(settings, '', []), /No API key/);
    await assert.rejects(chat({...settings, baseUrl: 'http://example.com/v1'}, 'good-key', []), /must use https/);
    await assert.rejects(chat({...settings, baseUrl: 'http://127.0.0.1:9/v1'}, 'good-key', []), /Could not reach/);
  } finally { server.close(); }
});

test('JSON is found inside whatever a model wraps around it', () => {
  assert.deepEqual(looseJson('```json\n{"a": 1, "b": {"c": "}"},}\n```'), {a: 1, b: {c: '}'}});
  assert.deepEqual(looseJson('Sure! {"pattern":"tabby"} Hope that helps.'), {pattern: 'tabby'});
  assert.equal(looseJson('{"cut": "off'), null); assert.equal(looseJson('no braces here'), null);
});

test('recordings are encoded as 16-bit mono WAV', () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
  const view = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF'); assert.equal(wav.length, 44 + 8);
  assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getInt16(46, true), 32767); assert.equal(view.getInt16(50, true), 32767);
});

function live(seconds, pet, world, each) { for (let t = 0; t < seconds; t += 1 / 60) for (const event of step(pet, 1 / 60, world)) each?.(event); }
test('the pet runs to food, eats until the bowl is empty, and obeys commands', () => {
  let seed = 7; const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let needs = {...defaultNeeds(), food: 20};
  const bowl = {kind: 'kibble', x: 900, bites: ITEMS.kibble.bites};
  const world = {width: 1600, items: [bowl], cursor: null, get needs() { return needs; }, size: 1, random};
  const pet = createPet(200); pet.left = 0;
  const seen = [];
  let ateAt = null; // the pet wanders off once the bowl is empty, so note where it stood while eating
  live(12, pet, world, event => { seen.push(event.type); if (event.type === 'bite') { ateAt ??= pet.x; needs = consume(needs, event.item.kind); } });
  assert.equal(bowl.bites, 0); assert.equal(seen.filter(type => type === 'bite').length, 5); assert.ok(seen.includes('finished'));
  assert.ok(needs.food > 50); assert.ok(Math.abs(ateAt - 900) < 60, `ate at ${ateAt}`);
  world.items.length = 0;
  command(pet, 'jump'); live(0.2, pet, world); assert.ok(pet.alt > 20);
  live(2, pet, world); assert.equal(pet.alt, 0);
  command(pet, 'sleep'); live(1, pet, world); assert.equal(pet.mode, 'sleep'); assert.equal(pet.pose.eyes, 'closed'); assert.ok(pet.pose.lie > 0.9);
  command(pet, 'hold'); pet.x = 5000; pet.alt = 300; live(0.5, pet, world); assert.equal(pet.mode, 'held'); assert.equal(pet.alt, 300);
  command(pet, 'release'); live(3, pet, world); assert.equal(pet.alt, 0); assert.ok(pet.x <= 1600);
  // Left alone for ten minutes, it stays on screen and on the ground between jumps.
  live(600, pet, world); assert.ok(pet.x >= 0 && pet.x <= 1600 && pet.alt >= 0 && Number.isFinite(pet.x));
});

test('a bowl is painted from the owner photos or words, empty, on a green screen, seen a little from above', () => {
  const fromPhotos = bowlPrompt({kind: 'water', photos: 2, description: 'blue glass'});
  assert.match(fromPhotos, /this exact pet water bowl/); assert.match(fromPhotos, /reference photos/); assert.match(fromPhotos, /"blue glass"/);
  assert.match(fromPhotos, /empty/); assert.match(fromPhotos, /green chroma-key/); assert.match(fromPhotos, /slightly from above/);
  const fromWords = bowlPrompt({kind: 'kibble', description: 'pink ceramic'});
  assert.match(fromWords, /a pet food bowl/); assert.doesNotMatch(fromWords, /reference photo/);
});

test('a busy or exhausted service says why, without quoting anything key-like', async () => {
  const http = await import('node:http');
  const server = http.createServer((req, res) => { res.writeHead(429, {'Content-Type': 'application/json'}); res.end('{"error":{"message":"You exceeded your current quota for sk-test-abcdef123456"}}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(chat({baseUrl: `http://127.0.0.1:${server.address().port}/v1/`, chatModel: 'm'}, 'k-123', []),
      error => /Too many requests/.test(error.message) && /exceeded your current quota/.test(error.message) && !/sk-test/.test(error.message));
  } finally { server.close(); }
});

test('several pets: one on the desktop, the others kept with their own memories and folders', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pets-'));
  try {
    // A save from before there could be several pets.
    fs.writeFileSync(path.join(dir, 'pet.json'), JSON.stringify({pet: {traits: {name: 'Gigi', species: 'cat'}, needs: {food: 50}, adopted: true, lastSeen: Date.now()}, memories: [{id: 1, text: 'Owner likes tea'}], history: []}));
    const store = createStore(dir);
    assert.deepEqual(store.pets().map(p => [p.name, p.active]), [['Gigi', true]]);
    assert.equal(store.folder(), path.join(dir, '')); // the first pet's files stay where they were
    const gigi = store.data.active.id;
    store.addPet();
    assert.equal(store.data.pet.traits.name, 'Mochi'); assert.equal(store.data.pet.adopted, false); assert.deepEqual(store.data.memories, []);
    assert.ok(store.folder().startsWith(path.join(dir, 'pets')));
    assert.deepEqual(store.pets().map(p => [p.name, p.active]), [['Mochi', true], ['Gigi', false]]);
    const mochi = store.data.active.id;
    assert.throws(() => store.removePet(mochi), /cannot be removed/);
    store.switchTo(gigi);
    assert.equal(store.data.pet.traits.name, 'Gigi'); assert.equal(store.data.memories[0].text, 'Owner likes tea');
    // Saved and opened again, it is still Gigi on the desktop.
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')).active.id, gigi);
    assert.equal(createStore(dir).data.pet.traits.name, 'Gigi');
    assert.equal(store.removePet(mochi), path.join('pets', mochi));
    assert.deepEqual(store.pets().map(p => p.name), ['Gigi']);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the pet file is copied to a dated backup once a day, and only the last fourteen days are kept', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-backup-'));
  try {
    const store = createStore(dir);
    store.save(); // the first save: nothing to back up yet
    assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
    store.data.pet.traits.name = 'Gigi'; store.save();
    const today = `pet-${new Date().toISOString().slice(0, 10)}.json`;
    assert.deepEqual(fs.readdirSync(path.join(dir, 'backups')), [today]);
    store.save(); store.save(); // later saves the same day leave that copy alone
    assert.deepEqual(fs.readdirSync(path.join(dir, 'backups')), [today]);
    // Twenty older copies, and today's not yet made: after the next save, the fourteen newest remain.
    fs.rmSync(path.join(dir, 'backups', today));
    for (let day = 1; day <= 20; day++) fs.writeFileSync(path.join(dir, 'backups', `pet-2020-01-${String(day).padStart(2, '0')}.json`), '{}');
    store.save();
    const kept = fs.readdirSync(path.join(dir, 'backups')).sort();
    assert.equal(kept.length, 14); assert.equal(kept.at(-1), today); assert.equal(kept[0], 'pet-2020-01-08.json');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
