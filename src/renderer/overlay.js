import {drawPet, bounds} from './pet/rig.js';
import {loadRealistic} from './pet/real.js';
import {createPet, step, command, limits} from './pet/brain.js';
import {tick, consume, stroke, ITEMS, NEED_KEYS} from '../shared/needs.js';
import {toggleRecording} from './voice.js';
import {t, localize} from './i18n.js';

const host = window.petHost;
const $ = id => document.getElementById(id);
const stage = $('stage'), ctx = stage.getContext('2d');
localize();
let state = await host.call('state');
let traits = state.pet.traits, needs = {...state.pet.needs};
let width = 0, height = 0, ground = 0;
const pet = createPet(innerWidth * 0.7);
let real = null; // the realistic look, when it has been generated and switched on
// The footage is large, so it is loaded again only when it has actually changed (the stamp is 0 when there is none to use).
// If the footage is there but cannot be loaded (the app was busy starting, a sheet was being rewritten), the drawn
// stand-in is shown for now and the footage is tried again a few seconds later, instead of never.
let lookStamp = -1, loading = null, retry = null;
function loadLook() {
  loading ??= (async () => {
    const stamp = await host.call('real:stamp').catch(() => null);
    if (stamp === null || typeof stamp === 'object') { clearTimeout(retry); retry = setTimeout(loadLook, 5000); return; }
    if (stamp === lookStamp) return;
    const loaded = stamp ? await loadRealistic(host).catch(() => null) : null;
    if (stamp && !loaded) { host.call('debug:note', `footage did not load (stamp ${stamp}); trying again in 5 s`); clearTimeout(retry); retry = setTimeout(loadLook, 5000); return; }
    lookStamp = stamp; real = loaded; pet.style = real ? real.style(traits) : null;
    host.call('debug:note', `showing ${traits.name} as ${real ? 'realistic' : 'drawn stand-in'}`);
  })().finally(() => { loading = null; });
  return loading;
}
await loadLook();
const items = [], particles = [];
const cursor = {x: -1, y: -1, down: false, moved: 0, strokes: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, dwell: 0, onControl: false};
let solid = false, dragging = false, pressedOnPet = false, hovering = false, chatOpen = false, thoughtAt = 0, toggledAt = 0;

function resize() {
  const ratio = devicePixelRatio || 1;
  width = innerWidth; height = innerHeight; ground = height - 8;
  stage.width = width * ratio; stage.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
addEventListener('resize', resize); resize();

const box = () => real ? real.size(traits) : bounds(traits);
const petTop = () => ground - pet.alt - box().height;
function overPet(x, y) {
  const b = box(), cx = pet.x + pet.facing * b.width * 0.08, cy = ground - pet.alt - b.height * 0.5;
  return ((x - cx) / (b.width * 0.56)) ** 2 + ((y - cy) / (b.height * 0.6)) ** 2 <= 1;
}
// Roughly where its head is: ahead of its centre, in the top part of its body. A hand resting there gets rubbed against.
function byHead(x, y) {
  const b = box();
  return Math.hypot(x - (pet.x + pet.facing * b.width * 0.34), y - (ground - pet.alt - b.height * 0.8)) < b.height * 0.5;
}
// The window ignores the mouse except over the pet and its controls, so the desktop underneath stays usable.
let turnedSolid = 0;
function setSolid(next) { if (next !== solid) { solid = next; toggledAt = performance.now(); if (next) turnedSolid++; host.call('overlay:ignore', !next); } }
// Over the pet the cursor is a hand, since that is what it stands for: one that strokes, and one that holds.
function hand(emoji, fallback) {
  const canvas = Object.assign(document.createElement('canvas'), {width: 64, height: 64}), c = canvas.getContext('2d');
  c.font = '50px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(emoji, 32, 35);
  return `image-set(url(${canvas.toDataURL()}) 2x) 16 16, ${fallback}`;
}
const HANDS = {open: hand('🖐️', 'grab'), hold: hand('✊', 'grabbing'), none: 'none'};
let shownHand = '';
function showHand(next) { if (next !== shownHand) { shownHand = next; stage.style.cursor = next ? HANDS[next] : ''; } }
const note = text => host.call('pet:event', text);
function burst(kind, count, x = pet.x, y = petTop() + 10) {
  for (let i = 0; i < count; i++) particles.push({kind, x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30, life: 1.6, age: 0});
}

/* Items */
function drop(kind) {
  const existing = items.find(item => item.kind === kind);
  if (existing) { Object.assign(existing, {bites: ITEMS[kind].bites, age: 0, offered: true, taken: 0}); command(pet, 'feed', existing); return; }
  const side = pet.x > width / 2 ? -1 : 1;
  const x = Math.max(60, Math.min(width - 60, pet.x + side * (170 + Math.random() * 120)));
  // offered: the owner just put this down, so the pet comes for it even when it is not hungry.
  const item = {kind, x, bites: ITEMS[kind].bites, age: 0, towards: -side, offered: true}; // towards: which way the pet will come from
  items.push(item);
  command(pet, 'feed', item);
}
// Fifteen pieces of kibble, three to a bite, scattered over the bottom of the bowl. The outer ones are eaten first.
const PELLETS = Array.from({length: 15}, (_, i) => { const turn = i * 2.39996, far = Math.sqrt((i + 0.5) / 15); return [Math.cos(turn) * far * 21, Math.sin(turn) * far * 4.6 - (1 - far) * 2, turn]; });

// A bowl is drawn in two layers: its inside and what is in it behind the pet, its near wall in front, so the muzzle
// goes down into the bowl. The rim sits just above where the mouth comes down in the footage.
function drawItem(item, layer) {
  const pop = Math.min(1, item.age * 5), kibble = item.kind === 'kibble';
  const mouthUp = pet.style?.lift?.[item.kind] ?? 6;
  ctx.save(); ctx.translate(item.x, ground); ctx.scale(pop, pop); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(60,40,20,.55)';
  if (item.kind === 'treat') {
    if (layer === 'back') {
      // A squeezed treat tube lying on the ground, pointing away from the pet, its paste at the item's centre.
      const full = item.bites / ITEMS.treat.bites;
      ctx.scale(Math.sign(pet.x - item.x) || 1, 1);
      ctx.beginPath(); ctx.roundRect(-50, -11, 42, 10, 4); ctx.fillStyle = '#fbe3a4'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-50, -11, 12, 10, 4); ctx.fillStyle = '#f29ca8'; ctx.fill(); ctx.stroke();
      if (full > 0) { ctx.beginPath(); ctx.ellipse(0, -(1.5 + mouthUp * 0.5 * full), 5 + 8 * full, 1.5 + mouthUp * 0.5 * full, 0, 0, 7); ctx.fillStyle = '#e9a27a'; ctx.fill(); ctx.stroke(); }
    }
    ctx.restore(); return;
  }
  if (bowls[item.kind]?.image) { drawOwnBowl(item, layer, bowls[item.kind]); ctx.restore(); return; }
  const rim = Math.max(12, Math.min(22, mouthUp + 6));
  if (layer === 'back') {
    ctx.beginPath(); ctx.ellipse(0, -rim, 30, 8, 0, 0, 7); ctx.fillStyle = kibble ? '#8a2b23' : '#245a92'; ctx.fill(); ctx.stroke();
    if (kibble) {
      ctx.lineWidth = 0.8;
      PELLETS.slice(0, item.bites * 3).forEach(([x, y, turn], i) => {
        ctx.beginPath(); ctx.ellipse(x, -rim + 1 + y, 4.2, 3.1, turn, 0, 7);
        ctx.fillStyle = ['#b9824c', '#a06a38', '#c4905a'][i % 3]; ctx.fill(); ctx.stroke();
      });
    } else if (item.bites > 0) {
      const level = 0.55 + 0.45 * item.bites / ITEMS.water.bites; // the water sinks as it is drunk
      ctx.beginPath(); ctx.ellipse(0, -rim + 1.5, 27 * level, 6.4 * level, 0, 0, 7); ctx.fillStyle = '#8fd0f4'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-7 * level, -rim, 9 * level, 1.6 * level, -0.1, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    }
  } else {
    // The near wall: from the front half of the rim down to the base.
    ctx.beginPath(); ctx.ellipse(0, -rim, 30, 8, 0, 0, Math.PI); ctx.lineTo(-21, 0); ctx.lineTo(21, 0); ctx.closePath();
    ctx.fillStyle = kibble ? '#de4f43' : '#4a8fd0'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -rim, 30, 8, 0, 0.25, Math.PI - 0.25); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
  }
  ctx.restore();
}

// The owner's own bowls, made from photos in the settings window: {kibble, water: {image, width, height, rim}}.
const bowls = {};
async function loadBowls(made) {
  const found = made ?? await host.call('bowl:load');
  for (const kind of ['kibble', 'water']) {
    if (!found?.[kind]) { delete bowls[kind]; continue; }
    const image = new Image(); image.src = found[kind].url; await image.decode().catch(() => {});
    bowls[kind] = {...found[kind], image};
  }
}
await loadBowls();
host.on('bowls:changed', loadBowls);
// A photographed bowl is drawn the same two ways as the plain one: all of it, and what is in it, behind the pet; then
// its near wall (below the middle of the rim) again in front, so the muzzle goes down into it.
function drawOwnBowl(item, layer, bowl) {
  const kibble = item.kind === 'kibble', s = Math.min(64 / bowl.width, 40 / bowl.height);
  const w = bowl.width * s, h = bowl.height * s, rim = bowl.rim * s, rx = w * 0.4, ry = Math.max(2.5, Math.min(rim * 0.85, w * 0.14));
  if (layer === 'back') {
    ctx.drawImage(bowl.image, -w / 2, -h, w, h);
    if (kibble) {
      ctx.lineWidth = 0.8;
      PELLETS.slice(0, item.bites * 3).forEach(([x, y, turn], i) => {
        ctx.beginPath(); ctx.ellipse(x * rx / 21, -h + rim + y * ry / 4.6, 4.2 * s * 0.9 + 1, 3.1 * s * 0.9 + 0.8, turn, 0, 7);
        ctx.fillStyle = ['#b9824c', '#a06a38', '#c4905a'][i % 3]; ctx.fill(); ctx.stroke();
      });
    } else if (item.bites > 0) {
      const level = 0.55 + 0.45 * item.bites / ITEMS.water.bites;
      ctx.beginPath(); ctx.ellipse(0, -h + rim + 1, rx * level, ry * level, 0, 0, 7); ctx.fillStyle = 'rgba(143,208,244,.9)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(-rx * 0.25 * level, -h + rim, rx * 0.3 * level, ry * 0.25 * level, -0.1, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    }
  } else ctx.drawImage(bowl.image, 0, bowl.rim, bowl.width, bowl.height - bowl.rim, -w / 2, -h + rim, w, h - rim);
}

/* Drawing */
// The thought bubble fades in and out and glides to the side the pet faces, instead of blinking and jumping across.
const thought = {alpha: 0, x: null, icon: null};
function bubbleIcon(dt) {
  const want = needs.food < 22 ? '🍖' : needs.water < 22 ? '💧' : needs.energy < 15 && pet.mode !== 'sleep' ? '💤' : null;
  const showing = want && !chatOpen && !hovering && pet.mode !== 'eat' && pet.t % 12 < 5; // five seconds in every twelve
  if (want) thought.icon = want;
  thought.alpha += ((showing ? 1 : 0) - thought.alpha) * Math.min(1, dt * 4);
  const target = pet.x + pet.facing * 34;
  thought.x = thought.x === null ? target : thought.x + (target - thought.x) * Math.min(1, dt * 5);
  if (thought.alpha < 0.02 || !thought.icon) return;
  const x = thought.x, y = petTop() - 6 - thought.alpha * 3, side = Math.sign(pet.x - x) || -pet.facing;
  ctx.globalAlpha = thought.alpha;
  ctx.beginPath(); ctx.arc(x, y - 16, 15, 0, 7); ctx.arc(x + 9 * side, y + 2, 4, 0, 7);
  ctx.fillStyle = 'rgba(255,253,248,.96)'; ctx.fill();
  ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(thought.icon, x, y - 15);
  ctx.globalAlpha = 1;
}
function draw(dt = 0) {
  ctx.clearRect(0, 0, width, height);
  for (const item of items) drawItem(item, 'back');
  const b = box(), lift = Math.min(1, pet.alt / 160);
  ctx.beginPath(); ctx.ellipse(pet.x, ground + 1, b.width * 0.36 * (1 - lift * 0.5), 5 * (1 - lift * 0.5), 0, 0, 7);
  ctx.fillStyle = `rgba(0,0,0,${0.22 * (1 - lift * 0.6)})`; ctx.fill();
  ctx.save(); ctx.translate(pet.x, ground - pet.alt);
  if (real) real.draw(ctx, traits, pet); else drawPet(ctx, traits, pet.pose);
  ctx.restore();
  for (const item of items) drawItem(item, 'front');

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.font = `${p.kind === 'zzz' ? 'bold 15px "Segoe UI", sans-serif' : '15px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'}`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#6d7fa8';
    ctx.fillText({heart: '❤️', zzz: 'z', crumb: '·', drip: '💧', star: '✨'}[p.kind], p.x, p.y);
  }
  ctx.globalAlpha = 1;

  bubbleIcon(dt);

  // While the cursor rests on the pet: its name, and each need as a small labelled bar.
  card.alpha += ((hovering && !dragging && $('menu').hidden && !chatOpen ? 1 : 0) - card.alpha) * Math.min(1, dt * 10);
  if (card.alpha > 0.02) {
    const w = 140, h = 56, x = Math.max(8, Math.min(width - w - 8, pet.x - w / 2)), y = petTop() - h - 10;
    ctx.globalAlpha = card.alpha;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fillStyle = 'rgba(34,26,18,.88)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '600 12.5px "Segoe UI", "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(traits.name, x + 11, y + 19);
    const colours = {food: '#f0a35c', water: '#6cb8ee', energy: '#f3d35c', mood: '#f08aa0'}, icons = {food: '🍖', water: '💧', energy: '⚡', mood: '💗'};
    NEED_KEYS.forEach((key, i) => {
      const cx = x + 11 + i * 31;
      ctx.font = '10px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; ctx.fillText(icons[key], cx, y + 37);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.roundRect(cx, y + 42, 26, 5, 2.5); ctx.fill();
      ctx.fillStyle = colours[key]; ctx.beginPath(); ctx.roundRect(cx, y + 42, Math.max(3, 26 * needs[key] / 100), 5, 2.5); ctx.fill();
      ctx.fillStyle = '#fff';
    });
    ctx.globalAlpha = 1;
  }
}
const card = {alpha: 0};

/* Loop */
let last = performance.now(), saveIn = 20, zzzIn = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const asleep = pet.mode === 'sleep';
  needs = tick(needs, dt / 60, {asleep});
  // A hand kept by its head for a couple of seconds gets a head-bunt: it turns to it and rubs its forehead against it.
  // It makes no difference whether the hand keeps still or moves about, so long as it stays by the head; nor what the
  // pet was doing, unless it is asleep, eating, in the air, or already rubbing.
  const attended = cursor.x >= 0 && !cursor.down && !dragging && $('menu').hidden && byHead(cursor.x, cursor.y);
  const busy = ['sleep', 'eat', 'held', 'fall'].includes(pet.mode) || pet.alt > 0 || pet.item || (pet.mode === 'perform' && pet.act === 'nuzzle');
  cursor.dwell = attended && !busy ? cursor.dwell + dt : 0;
  // The pet can also walk under a cursor that is not moving, so what is under the cursor is worked out every frame.
  if (cursor.x >= 0 && !dragging) { hovering = overPet(cursor.x, cursor.y); setSolid(hovering || attended || cursor.onControl); }
  if (cursor.dwell > 2.2) {
    cursor.dwell = 0; needs = stroke(needs); burst('heart', 3); note('rubbed its head against your hand');
    command(pet, 'nuzzle', Math.sign(cursor.x - pet.x) || pet.facing);
  }
  // Footage of a head-bunt that brings its own hand stands in for the cursor while it plays.
  const shotHand = pet.mode === 'perform' && real?.guest(pet.act);
  showHand(dragging ? 'hold' : shotHand ? 'none' : cursor.x >= 0 && (hovering || byHead(cursor.x, cursor.y)) ? 'open' : '');
  const b = box();
  for (const event of step(pet, dt, {width, items, cursor: cursor.x >= 0 ? cursor : null, attended, needs, size: traits.size, body: real ? null : {ahead: b.width / 2, behind: b.width / 2}, random: Math.random})) {
    if (event.type === 'bite') {
      needs = consume(needs, event.item.kind);
      burst(event.item.kind === 'water' ? 'drip' : 'crumb', 2, event.item.x, ground - 26);
    } else if (event.type === 'finished') {
      note({kibble: 'ate a bowl of kibble', treat: 'licked up a treat stick', water: 'drank a bowl of water'}[event.item.kind]);
      burst('heart', event.item.kind === 'treat' ? 4 : 2);
      setTimeout(() => { const i = items.indexOf(event.item); if (i >= 0 && items[i].bites <= 0) items.splice(i, 1); }, 2500);
    }
  }
  for (const item of items) item.age += dt;
  // Food nobody is eating is cleared away after a while instead of sitting on the desktop for ever.
  for (let i = items.length - 1; i >= 0; i--) if (items[i].bites > 0 && items[i].age > 75 && pet.item !== items[i]) items.splice(i, 1);
  if (asleep && (zzzIn -= dt) <= 0) { zzzIn = 1.1; particles.push({kind: 'zzz', x: pet.x + pet.facing * 40, y: petTop() + 30, vx: 8 * pet.facing, vy: -22, life: 2.2, age: 0}); }
  for (const p of particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].age >= particles[i].life) particles.splice(i, 1);
  if ((saveIn -= dt) <= 0) { saveIn = 20; host.call('pet:needs', needs); }
  placePanels();
  draw(dt);
  requestAnimationFrame(frame);
}

/* Pointer */
function placePanels() {
  const b = box();
  for (const el of [$('menu'), $('chat')]) {
    if (el.hidden) continue;
    const rect = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(width - rect.width - 8, pet.x - rect.width / 2));
    const y = Math.max(8, ground - pet.alt - b.height - rect.height - 14);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
}
function closeMenu() { $('menu').hidden = true; }
function openMenu() { closeChat(); $('nap-label').textContent = t(pet.mode === 'sleep' ? 'wake' : 'nap'); $('menu').hidden = false; placePanels(); }

addEventListener('mousemove', e => {
  const dx = e.clientX - cursor.lastX, dy = e.clientY - cursor.lastY;
  cursor.vx = dx * 60; cursor.vy = dy * 60; cursor.lastX = cursor.x = e.clientX; cursor.lastY = cursor.y = e.clientY;
  hovering = overPet(e.clientX, e.clientY);
  const atHead = byHead(e.clientX, e.clientY), near = hovering || atHead;
  cursor.onControl = Boolean(e.target.closest?.('.solid'));
  if (pressedOnPet && !dragging && (cursor.moved += Math.hypot(dx, dy)) > 6) { dragging = true; closeMenu(); command(pet, 'hold'); note('was picked up'); }
  if (dragging) { const [low, high] = limits(pet); pet.x = Math.max(low, Math.min(high, e.clientX)); pet.alt = Math.max(0, ground - e.clientY - box().height * 0.55); } // the walls hold even in the hand
  else if (hovering && !atHead && !cursor.down && (cursor.strokes += Math.hypot(dx, dy)) > 260) { // rubbing the cursor back and forth counts as petting
    cursor.strokes = 0; needs = stroke(needs); command(pet, 'stroke'); burst('heart', 2); note('was petted');
  }
  if (!hovering) cursor.strokes = 0;
  setSolid(dragging || near || cursor.onControl);
});
addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  cursor.down = true; cursor.moved = 0;
  if (overPet(e.clientX, e.clientY) && !e.target.closest('.solid')) pressedOnPet = true;
  else if (!e.target.closest('.solid')) { closeMenu(); closeChat(); }
});
addEventListener('mouseup', e => {
  cursor.down = false;
  if (dragging) { dragging = false; command(pet, 'release', {vx: Math.max(-600, Math.min(600, cursor.vx)), vy: Math.max(0, Math.min(500, -cursor.vy))}); }
  else if (pressedOnPet && e.button === 0) {
    // A click on a resting pet is a nudge: it wakes or gets up. Otherwise a click opens the menu (a right-click always does).
    if (['sleep', 'sit', 'loaf'].includes(pet.mode)) { closeMenu(); note(pet.mode === 'sleep' ? 'was woken by a click' : 'was nudged to get up'); command(pet, 'nudge', Math.random()); }
    else $('menu').hidden ? openMenu() : closeMenu();
  }
  pressedOnPet = false;
});
addEventListener('dblclick', e => { if (overPet(e.clientX, e.clientY)) openChat(); });
addEventListener('contextmenu', e => { e.preventDefault(); if (overPet(e.clientX, e.clientY)) openMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeChat(); } });
// Switching click-through on or off makes the system report the mouse as leaving, so this must not change click-through
// itself: the next mouse movement decides. It only stops the pet tracking a cursor that has gone.
// A leave reported right after such a switch is that false one: the cursor has not gone anywhere, and a hand resting
// by the pet's head must go on counting as there.
document.addEventListener('mouseleave', () => { if (performance.now() - toggledAt > 250) cursor.x = -1; });

$('menu').addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (!act) return;
  closeMenu();
  if (ITEMS[act]) drop(act);
  else if (act === 'chat') openChat();
  else if (act === 'nap') command(pet, pet.mode === 'sleep' ? 'wake' : 'sleep');
  else if (act === 'settings') host.call('panel:open', 'look');
  else if (act === 'hide') host.call('overlay:hide');
  else if (act === 'quit') host.call('quit');
});

/* Talking */
let typing, speaking;
function say(text, {thinking = false, problem = false, action = null} = {}) {
  clearInterval(typing);
  $('bubble').hidden = false;
  $('bubble').className = thinking ? 'thinking' : problem ? 'problem' : '';
  $('bubble-action').hidden = !action;
  if (action) { $('bubble-action').textContent = action.label; $('bubble-action').onclick = action.run; }
  if (thinking || problem) { $('bubble-text').textContent = text; return; }
  let shown = 0; // the reply appears a few characters at a time, like speech
  const characters = [...text];
  $('bubble-text').textContent = '';
  typing = setInterval(() => { shown += 2; $('bubble-text').textContent = characters.slice(0, shown).join(''); if (shown >= characters.length) clearInterval(typing); }, 30);
}
function openChat() {
  closeMenu(); chatOpen = true; $('chat').hidden = false; placePanels(); setSolid(true);
  host.call('overlay:focus').then(() => $('say-text').focus());
  if (pet.mode === 'sleep') command(pet, 'wake');
}
function closeChat() { if (!chatOpen) return; chatOpen = false; $('chat').hidden = true; $('bubble').hidden = true; stopSpeaking(); }
function stopSpeaking() { speechSynthesis.cancel(); speaking?.pause(); speaking = null; }

async function aloud(text) {
  stopSpeaking();
  if (!state.settings.speakAloud || !text) return;
  if (state.settings.voiceEngine === 'service') {
    const result = await host.call('speak', text);
    if (result.audio) { speaking = new Audio('data:audio/mpeg;base64,' + result.audio); speaking.play().catch(() => {}); return; }
  }
  // The computer's own voices: free, offline, and a fallback when the speech service fails.
  const line = new SpeechSynthesisUtterance(text);
  const wanted = /[㐀-鿿]/.test(text) ? 'zh' : /[぀-ヿ]/.test(text) ? 'ja' : 'en';
  line.voice = speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith(wanted)) || null;
  line.pitch = traits.species === 'cat' ? 1.5 : 1.2; line.rate = 1.05;
  speechSynthesis.speak(line);
}

async function send(text) {
  const said = text.trim();
  if (!said) return;
  $('say-text').value = '';
  command(pet, 'sit'); say('', {thinking: true});
  const reply = await host.call('chat', said);
  if (reply.error) {
    const needsKey = /API key/.test(reply.error);
    return say(reply.error, {problem: true, action: needsKey ? {label: t('openSettings'), run: () => host.call('panel:open', 'talk')} : null});
  }
  say(reply.text);
  if (reply.remembered.length) burst('star', 3);
  for (const act of reply.acts) command(pet, act, act === 'come' && cursor.x >= 0 ? cursor.x : undefined);
  if (!reply.acts.length && real?.has('mew')) command(pet, 'mew'); // it answers out loud, in its own way
  aloud(reply.text);
}
$('say').addEventListener('submit', e => { e.preventDefault(); send($('say-text').value); });
$('chat-close').addEventListener('click', closeChat);

/* Voice in: the words are written down by the listening model, then sent like typed text. */
$('mic').addEventListener('click', () => toggleRecording($('mic'), {
  onStart: stopSpeaking,
  onBusy: () => say('', {thinking: true}),
  onText: send,
  onProblem: message => say(message, {problem: true})
}));

host.on('command', payload => {
  if (payload.type === 'drop') drop(payload.item);
  else if (payload.type === 'chat') openChat();
});
host.on('state:changed', next => {
  if (next.activeId && state.activeId && next.activeId !== state.activeId) { // another pet came out: its own needs, a clean floor
    needs = {...next.pet.needs}; items.length = 0; command(pet, 'wake');
  }
  state = {...state, ...next}; traits = next.pet.traits;
  if (real) pet.style = real.style(traits); // size changes how far the muzzle reaches
  loadLook();
});
addEventListener('beforeunload', () => host.call('pet:needs', needs));

// A small surface for automated checks: read what the pet is doing and trigger the same actions the owner can.
window.petDebug = {
  snapshot: () => ({bowls: Object.keys(bowls), head: [Math.round(pet.x + pet.facing * box().width * 0.34), Math.round(ground - pet.alt - box().height * 0.8)], body: pet.style?.body ?? null, wall: pet.wall, mode: pet.mode, act: pet.act, facing: pet.facing, limits: limits(pet).map(Math.round), front: Math.round(pet.style?.front ?? 0), acts: Object.keys(pet.style?.acts ?? {}), hand: shownHand, cursor: getComputedStyle(stage).cursor.slice(0, 24), x: Math.round(pet.x), alt: Math.round(pet.alt), needs: {...needs}, items: items.map(i => ({kind: i.kind, bites: i.bites, x: Math.round(i.x)})), solid, turnedSolid, chatOpen, traits, look: real ? 'realistic' : 'cartoon'}),
  drop, command: (type, value) => command(pet, type, value), setNeeds: value => { needs = {...needs, ...value}; }, openChat, send
};
requestAnimationFrame(frame);
