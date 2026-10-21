import {loadRealistic} from './pet/real.js';
import {normalizeTraits, defaultTraits, analyzePixels, traitsFromAnalyses} from '../shared/traits.js';
import {BREEDS, breedOf, usualWeight} from '../shared/breeds.js';
import {t, localize, language} from './i18n.js';
import {toggleRecording} from './voice.js';
import {buildSheet} from './sheets.js';
import {keyOut} from '../shared/matte.js';
import {CLIPS, CLIP_NAMES, COST} from '../shared/realistic.js';

const host = window.petHost;
const $ = id => document.getElementById(id);
let state = await host.call('state');
let draft = {...state.pet.traits};
let chosen = [];   // the photos as picked, up to three: {name, url}
let photos = [];   // downsized copies of them, for the vision and image models
localize();

/* Tabs */
function show(tab) {
  const name = ['look', 'talk', 'memory'].includes(tab) ? tab : 'look';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.id !== name;
  for (const button of document.querySelectorAll('#tabs button')) button.classList.toggle('on', button.dataset.tab === name);
  if (name === 'talk') loadPersonality();
}
$('tabs').addEventListener('click', e => e.target.dataset.tab && show(e.target.dataset.tab));
host.on('command', payload => payload.type === 'tab' && show(payload.tab));

/* My pets: the one on the desktop, the others, and room for more. Each keeps its own look and memories. */
let removing = null; // the pet whose × has been clicked once
async function drawPets() {
  const cards = await Promise.all((state.pets ?? []).map(async pet => {
    const card = Object.assign(document.createElement(pet.active ? 'div' : 'button'), {className: 'pet-card' + (pet.active ? ' on' : '')});
    card.dataset.id = pet.id;
    const picture = await host.call('pets:picture', pet.id);
    card.append(picture && !picture.error ? Object.assign(new Image(), {src: picture, alt: ''}) : Object.assign(document.createElement('span'), {className: 'pet-paw', textContent: '🐾'}));
    const words = document.createElement('span');
    words.append(Object.assign(document.createElement('b'), {textContent: pet.name || t('petsUnnamed')}),
      Object.assign(document.createElement('small'), {textContent: removing === pet.id ? t('petsRemoveConfirm', {name: pet.name}) : [t(pet.active ? 'petsOnDesktop' : 'petsSwitch'), pet.made ? '' : t('petsNotMade')].filter(Boolean).join(' · ')}));
    card.append(words);
    if (!pet.active) { const remove = Object.assign(document.createElement('span'), {className: 'pet-remove', textContent: '×', title: t('petsRemove')}); remove.dataset.remove = pet.id; card.append(remove); }
    return card;
  }));
  $('pets').replaceChildren(...cards, Object.assign(document.createElement('button'), {className: 'pet-add', textContent: t('petsAdd')}));
}
$('pets').addEventListener('click', async e => {
  const remove = e.target.dataset?.remove, card = e.target.closest('.pet-card'), add = e.target.closest('.pet-add');
  let result;
  if (remove) {
    if (removing !== remove) { removing = remove; return drawPets(); }
    removing = null; result = await host.call('pets:remove', remove);
    if (!result.error) { state = {...state, ...result}; return drawPets(); }
  } else if (add) result = await host.call('pets:add');
  else if (card && !card.classList.contains('on')) result = await host.call('pets:switch', card.dataset.id);
  else return;
  if (result.error) return status('look-status', result.error, true);
  location.reload(); // everything on this page belongs to the pet now on the desktop
});

/* Look, step 1: who it is */
const fields = ['name', 'species', 'breed', 'sex', 'weight', 'base', 'eye'];
function fillLook() {
  $('breed').innerHTML = `<option value="">${t('breedNone')}</option>` + BREEDS[draft.species].map(breed => `<option value="${breed.id}">${language === 'zh' ? breed.zh : breed.en}</option>`).join('');
  for (const field of fields) $(field).value = draft[field];
  showColours();
  if (!fillLook.described) { $('description').value = state.pet.description || ''; fillLook.described = true; }
  $('save-look').textContent = t(state.pet.adopted ? 'saveLook' : 'adopt');
}
for (const field of fields) $(field).addEventListener('input', () => {
  const value = $(field).value;
  if (field === 'species' && value !== draft.species) {
    draft = normalizeTraits({...defaultTraits(value), name: draft.name, sex: draft.sex}); fillLook(); // another kind of animal: its breeds and usual weight
  } else if (field === 'breed') {
    // A breed brings its usual colour, and its usual weight unless the owner has already typed their pet's own.
    const breed = breedOf(draft.species, value), untouched = draft.weight === usualWeight(draft.species, draft.breed);
    draft = normalizeTraits({...draft, breed: value, ...(breed ? {base: breed.base, pattern: breed.pattern, fluff: breed.fluff ?? 0.3, ...(breed.ears ? {ears: breed.ears} : {}), ...(untouched ? {weight: breed.kg} : {})} : {})}, draft);
    fillLook();
  } else draft = normalizeTraits({...draft, [field]: value}, draft);
  showColours();
  $('look-status').textContent = '';
  saveSoon();
});

// The colour pickers show their value as well, so a colour can be read off and told apart from a near one.
function showColours() { $('base-hex').textContent = $('base').value; $('eye-hex').textContent = $('eye').value; }
// The window's header names the pet on the desktop.
function showCurrent() { $('current').textContent = state.pet?.traits?.name ? `${state.pet.traits.name} · ${t('petsOnDesktop')}` : ''; }

/* Preview: the pet's own footage, one motion at a time */
const stage = $('preview').getContext('2d');
let real = null, shownPose = 'idle', poseSince = 0, performed = 0;
function markPose() { for (const button of $('poses').querySelectorAll('[data-pose]')) button.classList.toggle('on', button.dataset.pose === shownPose); }
// The motions in four rows: getting about, resting, meals, and the little things.
const POSE_GROUPS = [['poseEveryday', ['idle', 'walk', 'run', 'jump']], ['poseRest', ['sit', 'loaf', 'sleep']], ['poseMeal', ['eat', 'drink']], ['poseLittle', ['stretch', 'scratch', 'groom', 'mew', 'meow', 'yawn', 'roll', 'nuzzle', 'play']]];
$('poses').addEventListener('click', e => { if (e.target.dataset.pose) { shownPose = e.target.dataset.pose; poseSince = performance.now() / 1000; performed++; markPose(); } });
async function loadPreview() {
  real = await loadRealistic(host);
  const names = real ? CLIP_NAMES.filter(real.has) : [];
  $('poses').replaceChildren(...POSE_GROUPS.map(([label, group]) => {
    const row = Object.assign(document.createElement('div'), {className: 'pose-group'});
    row.append(Object.assign(document.createElement('em'), {textContent: t(label)}), ...group.filter(name => names.includes(name)).map(name => {
      const button = Object.assign(document.createElement('button'), {textContent: t('clip_' + name)}); button.dataset.pose = name; return button;
    }));
    return row;
  }).filter(row => row.children.length > 1));
  if (!names.includes(shownPose)) shownPose = 'idle';
  $('preview-note').hidden = Boolean(real);
  $('look-summary').textContent = real ? t('lookSummary', {n: names.length}) : '';
  markPose();
}
function animate(now) {
  const time = now / 1000;
  stage.clearRect(0, 0, 640, 460);
  if (real) {
    const kind = CLIPS[shownPose].kind, meal = shownPose === 'drink', once = kind === 'once' || kind === 'linger';
    // A motion that plays once is shown again after a short pause.
    if (once && time - poseSince > real.seconds(shownPose) + 0.8) { poseSince = time; performed++; }
    const pet = {t: time, clock: time - poseSince, facing: 1, rising: null, meal: meal ? 'water' : 'kibble', act: shownPose, acted: performed,
      mode: once ? 'perform' : meal ? 'eat' : shownPose, plan: kind === 'cycle' ? {loops: 1e6} : null};
    stage.beginPath(); stage.ellipse(320, 421, 150, 9, 0, 0, 7); stage.fillStyle = 'rgba(0,0,0,.13)'; stage.fill();
    stage.save(); stage.translate(320, 420); stage.scale(1.5, 1.5); real.draw(stage, {...draft, size: 1}, pet); stage.restore();
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* Look, step 2: photos and the owner's own words */
function note(key) { $('look-note').hidden = !key; if (key) $('look-note').textContent = t(key); }
// Shrinks a photo so analysis is quick and uploads stay small. Returns its pixels and a JPEG copy.
function shrink(url, largest) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, largest / Math.max(image.width, image.height));
      const canvas = Object.assign(document.createElement('canvas'), {width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale))});
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height)});
    };
    image.onerror = () => reject(new Error('unreadable photo'));
    image.src = url;
  });
}
// Picking again adds to the photos already chosen. Returns how many did not fit.
async function addPhotos(added) {
  const room = 3 - chosen.length;
  chosen = [...chosen, ...added.slice(0, room)];
  await readPhotos();
  return Math.max(0, added.length - room);
}
// `fresh` is false when photos kept from last time are being shown again: the colour already saved must not be changed.
async function readPhotos(fresh = true) {
  photos = [];
  const analyses = [], figures = [];
  for (const photo of [...chosen]) {
    try {
      const small = await shrink(photo.url, 160);
      analyses.push(analyzePixels(small.pixels.data, small.pixels.width, small.pixels.height));
      photos.push((await shrink(photo.url, 1024)).canvas.toDataURL('image/jpeg', 0.88));
      const figure = document.createElement('figure');
      const remove = Object.assign(document.createElement('button'), {type: 'button', textContent: '×', title: t('removePhoto')});
      remove.addEventListener('click', () => { chosen = chosen.filter(other => other !== photo); readPhotos(); });
      figure.append(Object.assign(new Image(), {src: photo.url, alt: photo.name}), remove);
      figures.push(figure);
    } catch { chosen = chosen.filter(other => other !== photo); } // a file that is not really an image is dropped
  }
  $('thumbs').replaceChildren(...figures);
  if (fresh) {
    const found = traitsFromAnalyses(analyses, draft.species);
    if (found) { draft = normalizeTraits({...draft, ...found}, draft); fillLook(); saveSoon(); }
    note(!chosen.length ? null : found ? 'fromLocal' : 'noSubject');
    host.call('photos:keep', photos);
  }
  $('ask-model').hidden = !state.hasKey || !photos.length;
}
$('choose').addEventListener('click', async () => {
  if (chosen.length >= 3) { status('look-status', t('photosFull'), true); return; }
  const result = await host.call('photos:pick');
  if (result.error || !result.photos.length) return;
  const left = await addPhotos(result.photos);
  status('look-status', left || result.skipped ? t('photosSkipped') : '');
});
$('describe-mic').addEventListener('click', () => toggleRecording($('describe-mic'), {
  onStart: () => status('look-status', t('listening')),
  onText: text => { $('description').value = [$('description').value.trim(), text].filter(Boolean).join(' '); status('look-status', t('heard')); saveSoon(); },
  onProblem: message => status('look-status', message, true)
}));
$('ask-model').addEventListener('click', async () => {
  $('ask-model').disabled = true; $('ask-model').textContent = t('asking');
  const result = await host.call('traits:describe', {photos, species: draft.species, description: $('description').value});
  $('ask-model').disabled = false; $('ask-model').textContent = t('askModel');
  if (result.error) return status('look-status', result.error, true);
  draft = normalizeTraits({...result.traits, name: draft.name, sex: draft.sex}, draft); fillLook(); note('fromModel');
  status('look-status', ''); saveSoon();
});
// Everything here is saved as it is edited: a name typed here used to be lost unless the button was pressed.
let saving;
async function saveLook() {
  clearTimeout(saving);
  const result = await host.call('traits:save', {traits: draft, photos: photos.length, description: $('description').value});
  if (result.error) { status('look-status', result.error, true); return; }
  state = {...state, ...result};
  $('save-look').textContent = t('saveLook');
  status('look-status', t('saved'));
}
const saveSoon = () => { clearTimeout(saving); saving = setTimeout(saveLook, 700); };
$('save-look').addEventListener('click', saveLook);
$('description').addEventListener('input', saveSoon);

/* Look, step 3: the realistic look */
const clipState = {}; // clip name -> {kind: '' | 'done' | 'failed', text}
let made = {sheets: [], reference: null}, confirming = false;
let refilming = null; // the motion whose chip has been clicked once
function drawClips() {
  $('real-progress').replaceChildren(...CLIP_NAMES.filter(name => clipState[name]).map(name => {
    const chip = Object.assign(document.createElement('li'), {className: clipState[name].kind, textContent: refilming === name ? t('refilmConfirm', {name: t('clip_' + name), cost: COST.clip.toFixed(2)}) : `${t('clip_' + name)} · ${clipState[name].text}`});
    chip.dataset.clip = name;
    return chip;
  }));
  $('real-hint').hidden = !made.sheets.length;
}
// A motion that came out badly can be filmed again by itself: click its chip, then click again to confirm the cost.
$('real-progress').addEventListener('click', async e => {
  const name = e.target.dataset?.clip;
  if (!name || !made.sheets.includes(name) || $('real-make-clips').dataset.busy) return;
  if (refilming !== name) { refilming = name; return drawClips(); }
  refilming = null;
  await film([name]);
});
const missing = () => CLIP_NAMES.filter(name => !made.sheets.includes(name));
// The two buttons say what they will do and roughly what it will cost.
function labelSteps(busy = false) {
  confirming = false;
  $('real-make-reference').textContent = t(made.reference ? 'realRedoReference' : 'realMakeReference', {cost: COST.reference.toFixed(2)});
  const lacking = missing();
  $('real-make-clips').textContent = lacking.length ? t('filmMissing', {n: lacking.length, cost: (lacking.length * COST.clip).toFixed(2)}) : t('filmNone', {n: CLIP_NAMES.length});
  $('real-make-clips').disabled = busy || !made.reference || !lacking.length;
}
async function refreshReal(next) {
  const real = next || await host.call('real:status');
  if (real.error) return status('real-status', real.error, true);
  made = real;
  $('real-reference').hidden = !real.reference;
  if (real.reference) $('real-reference').src = real.reference;
  for (const name of real.sheets) clipState[name] = {kind: 'done', text: t('st_done')};
  labelSteps(real.busy); drawClips();
  return real;
}
host.on('real:progress', update => {
  clipState[update.name] = update.status === 'failed' ? {kind: 'failed', text: update.error} : {kind: '', text: t('st_' + update.status)};
  drawClips();
});
$('real-make-reference').addEventListener('click', async () => {
  if (!state.hasKey) return status('real-status', t('realNeedKey'), true);
  // A new picture is a different animal to the video model, so the motions already filmed are thrown away: ask first.
  if (made.sheets.length && !confirming) { confirming = true; $('real-make-reference').textContent = t('realRedoConfirm', {n: made.sheets.length}); return; }
  await saveLook();
  $('real-make-reference').disabled = true; status('real-status', t('realPainting'));
  const result = await host.call('real:reference', {photos, description: $('description').value, species: draft.species, traits: draft});
  $('real-make-reference').disabled = false;
  if (result.error) { labelSteps(); return status('real-status', result.error, true); }
  for (const name of CLIP_NAMES) delete clipState[name];
  status('real-status', ''); await refreshReal(result); loadPreview();
});
// Cuts the background out of each downloaded clip. The standing clip goes first: it fixes where the ground and centre are.
async function cutClips(names) {
  status('real-status', t('realCutting'));
  for (const name of CLIP_NAMES.filter(name => names.includes(name))) {
    clipState[name] = {kind: '', text: t('st_cutting')}; drawClips();
    try {
      const {video} = await host.call('real:clip', name);
      const sheet = await buildSheet(video);
      const box = sheet.first;
      const anchor = name === 'idle' && box ? {centre: (box.left + box.right) / 2, ground: box.bottom, width: box.right - box.left, height: box.bottom - box.top} : undefined;
      const saved = await host.call('real:sheet', {name, webp: sheet.webp, layout: sheet.layout, anchor});
      if (saved.error) throw new Error(saved.error);
      clipState[name] = {kind: 'done', text: t('st_done')};
    } catch (error) { clipState[name] = {kind: 'failed', text: error.message}; }
    drawClips();
  }
}
async function film(names) {
  if (!state.hasKey) return status('real-status', t('realNeedKey'), true);
  labelSteps(true); status('real-status', t('realFilming')); $('real-make-clips').dataset.busy = '1';
  const result = await host.call('real:clips', {names, species: draft.species});
  delete $('real-make-clips').dataset.busy;
  if (result.error) { labelSteps(); return status('real-status', result.error, true); }
  await cutClips(result.clips.filter(name => !result.failed[name] && names.includes(name)));
  const real = await refreshReal();
  if (real.ready) await host.call('real:use', true); // it goes onto the desktop as soon as it can stand and walk
  await loadPreview();
  status('real-status', t(Object.keys(result.failed).length || !real.ready ? 'realPartly' : 'realReady'), !real.ready);
}
/* Look, extra: the owner's own bowls. Kept folded away: the pet itself matters more. */
const bowlPhotos = {kibble: [], water: []};
let madeBowls = {};
// Cuts a painted bowl out of its green screen. Returns the cropped picture and where the middle of its rim runs,
// which is the widest row near the top (the opening is an oval seen from a little above).
async function cutBowl(url) {
  const image = new Image(); image.src = url; await image.decode();
  const scale = Math.min(1, 512 / image.width), width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const canvas = Object.assign(document.createElement('canvas'), {width, height}), c = canvas.getContext('2d', {willReadFrequently: true});
  c.drawImage(image, 0, 0, width, height);
  const pixels = c.getImageData(0, 0, width, height), box = keyOut(pixels.data, width, height);
  if (!box || box.right - box.left < 12) return null;
  c.putImageData(pixels, 0, 0);
  const crop = {width: box.right - box.left, height: box.bottom - box.top};
  let widest = 0, rim = 0;
  for (let y = 0; y < Math.ceil(crop.height * 0.6); y++) {
    let left = -1, right = -1;
    for (let x = 0; x < crop.width; x++) if (pixels.data[((box.top + y) * width + box.left + x) * 4 + 3] >= 128) { if (left < 0) left = x; right = x; }
    if (right - left > widest * 1.01) { widest = right - left; rim = y; }
  }
  const out = Object.assign(document.createElement('canvas'), crop);
  out.getContext('2d').drawImage(canvas, box.left, box.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return {png: out.toDataURL('image/png'), shape: {...crop, rim}};
}
function drawBowls() {
  for (const row of document.querySelectorAll('.bowl')) {
    const kind = row.dataset.kind, made = madeBowls[kind];
    row.querySelector('[data-do=make]').textContent = t(made ? 'bowlRemake' : 'bowlMake', {cost: COST.reference.toFixed(2)});
    row.querySelector('[data-do=reset]').hidden = !made;
    const shown = row.querySelector('.bowl-made'); shown.hidden = !made; if (made) shown.src = made.url;
    row.querySelector('.bowl-thumbs').replaceChildren(...bowlPhotos[kind].map((url, i) => {
      const thumb = Object.assign(new Image(), {src: url, title: t('bowlRemovePhoto')});
      thumb.addEventListener('click', () => { bowlPhotos[kind].splice(i, 1); drawBowls(); });
      return thumb;
    }));
  }
}
async function makeBowl(kind, words) {
  if (!bowlPhotos[kind].length && !words.trim()) return status('bowl-status', t('bowlNeedSomething'), true);
  if (!state.hasKey) return status('bowl-status', t('realNeedKey'), true);
  status('bowl-status', t('bowlPainting'));
  const painted = await host.call('bowl:make', {kind, photos: bowlPhotos[kind], description: words});
  if (painted.error) return status('bowl-status', painted.error, true);
  const cut = await cutBowl(painted.picture);
  if (!cut) return status('bowl-status', t('bowlNothing'), true);
  const saved = await host.call('bowl:save', {kind, ...cut});
  if (saved.error) return status('bowl-status', saved.error, true);
  madeBowls = saved; drawBowls(); status('bowl-status', t('bowlDone'));
}
$('bowls').addEventListener('click', async e => {
  const button = e.target.closest('button[data-do]'), row = e.target.closest('.bowl');
  if (!button || !row) return;
  const kind = row.dataset.kind;
  if (button.dataset.do === 'pick') {
    const result = await host.call('photos:pick');
    if (result.error || !result.photos?.length) return;
    for (const photo of result.photos) if (bowlPhotos[kind].length < 3) bowlPhotos[kind].push((await shrink(photo.url, 1024)).canvas.toDataURL('image/jpeg', 0.88));
    drawBowls();
  } else if (button.dataset.do === 'make') {
    button.disabled = true; await makeBowl(kind, row.querySelector('.bowl-words').value); button.disabled = false;
  } else if (button.dataset.do === 'reset') { madeBowls = await host.call('bowl:reset', kind); drawBowls(); }
});
host.call('bowl:load').then(found => { if (!found?.error) { madeBowls = found; drawBowls(); } });

// Only what is missing is filmed, so trying again after a partial failure does not pay twice.
$('real-make-clips').addEventListener('click', () => film(missing()));

/* Talk */
const settingFields = ['baseUrl', 'chatModel', 'visionModel', 'listenModel', 'imageModel', 'videoModel', 'voiceEngine', 'voiceModel', 'voiceName'];
function fillTalk() {
  for (const field of settingFields) $(field).value = state.settings[field];
  $('speakAloud').checked = state.settings.speakAloud;
  $('key').value = '';
  $('key-state').textContent = t(state.hasKey ? 'keySaved' : 'keyNone');
  $('remove-key').hidden = !state.hasKey;
  for (const el of document.querySelectorAll('.service')) el.hidden = $('voiceEngine').value !== 'service';
}
$('voiceEngine').addEventListener('change', () => { for (const el of document.querySelectorAll('.service')) el.hidden = $('voiceEngine').value !== 'service'; });
function status(id, text, bad = false) { $(id).textContent = text; $(id).className = bad ? 'status bad' : 'status'; }
async function saveSettings(key) {
  const settings = Object.fromEntries(settingFields.map(field => [field, $(field).value]));
  settings.speakAloud = $('speakAloud').checked;
  const typed = $('key').value.trim();
  const result = await host.call('settings:save', {settings, key: key ?? (typed || undefined)});
  if (result.error) { status('talk-status', result.error, true); return false; }
  state = {...state, ...result}; fillTalk(); status('talk-status', t('saved'));
  $('ask-model').hidden = !state.hasKey || !photos.length;
  return true;
}
$('save-settings').addEventListener('click', () => saveSettings());
$('remove-key').addEventListener('click', () => saveSettings(''));
$('hello').addEventListener('click', async () => {
  if (!await saveSettings()) return;
  $('hello').disabled = true; status('talk-status', t('testing')); $('hello-reply').hidden = true;
  const reply = await host.call('chat', language === 'zh' ? '你好呀！' : 'Hello there!');
  $('hello').disabled = false;
  if (reply.error) return status('talk-status', reply.error, true);
  status('talk-status', ''); $('hello-reply').hidden = false; $('hello-reply').textContent = reply.text;
});
async function loadPersonality(result) {
  const personality = result || await host.call('personality:read');
  $('personality-source').textContent = personality.builtin ? (personality.missing ? t('missingFile') : t('builtIn')) : personality.path;
  $('personality-text').textContent = personality.text;
  $('reset-personality').hidden = personality.builtin && !personality.missing;
}
$('pick-personality').addEventListener('click', async () => loadPersonality(await host.call('personality:pick')));
$('reset-personality').addEventListener('click', async () => loadPersonality(await host.call('personality:reset')));

/* Memory */
function fillMemory() {
  const list = [...state.memories].reverse();
  $('memory-count').textContent = list.length || '';
  $('memories').replaceChildren(...(list.length ? list.map(memory => {
    const item = document.createElement('li');
    const text = Object.assign(document.createElement('span'), {textContent: memory.text});
    const when = Object.assign(document.createElement('time'), {textContent: new Date(memory.createdAt).toLocaleDateString()});
    const forget = Object.assign(document.createElement('button'), {className: 'quiet danger', textContent: t('forget')});
    forget.addEventListener('click', () => host.call('memory:delete', memory.id));
    item.append(text, when, forget);
    return item;
  }) : [Object.assign(document.createElement('li'), {className: 'empty', textContent: t('memoryEmpty')})]));
  $('forget-all').hidden = !list.length;
}
$('memory-add').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('memory-text').value.trim();
  if (!text) return;
  $('memory-text').value = '';
  await host.call('memory:add', text);
});
$('forget-all').addEventListener('click', () => host.call('memory:clear'));
$('clear-chat').addEventListener('click', async () => { await host.call('history:clear'); status('memory-status', t('cleared')); });

host.on('state:changed', next => {
  const species = state.pet.traits.species;
  state = {...state, ...next};
  showCurrent();
  if ((next.pets ?? []).map(pet => pet.name).join() !== $('pets').dataset.names) { $('pets').dataset.names = (next.pets ?? []).map(pet => pet.name).join(); drawPets(); }
  fillMemory();
  // Renamed from a conversation or a memory: show it here too, unless the owner is typing a name right now.
  if (next.pet.traits.name !== draft.name && document.activeElement !== $('name')) { draft = {...draft, name: next.pet.traits.name}; $('name').value = draft.name; }
  $('key-state').textContent = t(state.hasKey ? 'keySaved' : 'keyNone');
  if (next.pet.traits.species !== species && !$('talk').hidden) loadPersonality();
});

fillLook(); fillTalk(); fillMemory(); refreshReal(); loadPreview(); drawPets(); showCurrent();
const kept = await host.call('photos:kept');
if (Array.isArray(kept) && kept.length) { chosen = kept.map((url, i) => ({name: `photo ${i + 1}`, url})); await readPhotos(false); }
show(location.hash.slice(1));
// For automated checks: feed photos without the file dialog, and read the draft look.
window.panelDebug = {cutClips, refreshReal, loadPreview, addPhotos, bowls: () => ({...madeBowls}), bowlPhotos: (kind, urls) => { bowlPhotos[kind] = urls.slice(0, 3); drawBowls(); }, photos: () => chosen.map(photo => photo.name), draft: () => ({...draft}), show,
  made: () => ({sheets: [...made.sheets], ready: Boolean(made.ready)}),
  // What the preview is showing: which motions it offers, and the colour in the middle of the animal.
  preview: () => ({real: Boolean(real), showing: real?.showing() ?? null, poses: [...$('poses').querySelectorAll('[data-pose]')].map(button => button.dataset.pose), pose: shownPose, middle: [...stage.getImageData(320, 330, 1, 1).data]})};
