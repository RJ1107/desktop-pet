// What the pet does from moment to moment. No drawing and no clock: step() advances by dt seconds,
// so behaviour can be tested by running it faster than real time.
import {restPose} from './rig.js';
import {urge, wants} from '../../shared/needs.js';
import {ACTS, HOLD_MODES as HOLDS} from '../../shared/realistic.js';

const WALK = 55, RUN = 200, GRAVITY = 1500, JUMP = 520, MARGIN = 70, PUSH = 500;
const approach = (value, target, rate, dt) => value + (target - value) * Math.min(1, rate * dt);

export function createPet(x) {
  return {x, alt: 0, vx: 0, vy: 0, facing: 1, mode: 'idle', left: 1.5, goal: null, item: null, biteIn: 0, t: 0, blinkIn: 2, spin: 0, joy: 0, size: 1, pose: restPose(),
    // Set while the realistic look is playing. style describes the footage: {jump: seconds, out: {sit, sleep, eat: seconds},
    // walk and run: {in, loop, out: seconds}, reach: pixels from the pet's centre to its muzzle, per kind of meal}.
    // acts: {stretch, scratch, groom, ...: seconds} for footage played once on the spot; front: pixels from the pet's
    // centre to its paws when it stands up against the side of the screen.
    // body: {ahead, behind} pixels from its centre to its nose and to the end of its tail (style.body when there is footage).
    style: null, body: null, rising: null, then: null, act: null, acted: 0, next: null, wall: 0, strokes: 0, plan: null, clock: 0, meal: null, room: null};
}

function decide(pet, world) {
  const {needs, random} = world;
  // Food the owner has just put down is always worth a visit; food left from earlier only when hungry or thirsty.
  const food = world.items.filter(item => item.bites > 0 && (item.offered || wants(needs, item.kind))).sort((a, b) => Math.abs(a.x - pet.x) - Math.abs(b.x - pet.x))[0];
  if (food) return go(pet, 'run', spotBy(pet, food), food);
  const acts = pet.style?.acts, lazy = needs.mood < 30 || needs.energy < 35;
  if (urge(needs) === 'sleep') {
    const nap = () => set(pet, 'sleep', 60 + random() * 60);
    return acts?.yawn && random() < 0.6 && perform(pet, 'yawn', nap) ? undefined : nap(); // a tired cat often yawns first
  }
  if (random() < 0.06) return set(pet, 'sleep', 40 + random() * 50); // an occasional nap
  // With footage to hand, part of an idle pet's day is small rituals: washing, yawning, a stretch, a swipe at the cursor.
  if (acts && random() < 0.3) {
    const near = world.cursor && Math.abs(world.cursor.x - pet.x) < 260 * pet.size;
    const hungry = urge(needs) === 'eat' || urge(needs) === 'drink';
    // A soft mew now and then; the wide-mouthed meow is kept for when it is really hungry or thirsty.
    const starving = needs.food < 22 || needs.water < 22;
    const weights = {groom: 3, yawn: needs.energy < 50 ? 2 : 1, stretch: 1, scratch: lazy ? 0 : 1, roll: needs.mood > 60 ? 1.5 : 0, play: lazy ? 0 : near ? 4 : 1, mew: hungry ? 2.5 : 1.5, meow: starving ? 6 : 0};
    const options = Object.entries(weights).filter(([name, weight]) => acts[name] && weight > 0);
    let pick = random() * options.reduce((sum, [, weight]) => sum + weight, 0);
    const name = options.find(([, weight]) => (pick -= weight) < 0)?.[0];
    if (name === 'play' && near) pet.facing = Math.sign(world.cursor.x - pet.x) || pet.facing;
    if (name === 'scratch' ? toWall(pet, nearerWall(pet)) : name && perform(pet, name)) return;
  }
  const roll = random();
  const spot = () => MARGIN + random() * (world.width - MARGIN * 2);
  if (roll < 0.28) return set(pet, 'idle', 1.5 + random() * 3);
  if (roll < 0.58) return go(pet, 'walk', spot());
  if (roll < (lazy ? 0.9 : 0.72)) {
    // Sitting up, or (with footage for it) settled into a loaf with its paws tucked under, which lasts longer.
    return canLoaf(pet) && random() < 0.45 ? set(pet, 'loaf', 18 + random() * 25) : set(pet, 'sit', 8 + random() * 12);
  }
  if (roll < 0.82 && !lazy) return go(pet, 'run', spot());
  // (It used to jump now and then of its own accord; the owner found that jarring. It jumps when asked.)
  if (roll < 0.9 && !lazy) return set(pet, 'idle', 2 + random() * 2);
  if (world.cursor && !lazy) return go(pet, 'walk', world.cursor.x);
  return set(pet, 'idle', 2);
}

const canLoaf = pet => pet.style?.out?.loaf !== undefined;
// Where to stand so that the muzzle, not the middle of the body, is over the food.
const spotBy = (pet, item) => item.x - (pet.style?.reach?.[item.kind] ?? 30) * Math.sign(item.x - pet.x || 1);

// With the realistic look, getting up is footage too: let it finish before the pet does the next thing.
function rise(pet, mode, then) {
  if (!pet.style || !HOLDS.includes(pet.mode) || pet.mode === mode) return false;
  pet.rising = pet.mode; pet.then = then; pet.mode = 'rise'; pet.left = pet.style.out[pet.rising === 'eat' ? pet.meal : pet.rising] ?? 1; pet.goal = null; pet.item = null; pet.vx = 0;
  return true;
}
function set(pet, mode, seconds) {
  if (rise(pet, mode, () => set(pet, mode, seconds))) return;
  pet.mode = mode; pet.left = seconds; pet.goal = null; pet.item = null; pet.vx = 0; pet.plan = null; pet.next = null; pet.wall = 0;
}
// A piece of footage played once on the spot: a jump, a stretch, a yawn, a wash. `next` runs when it is over.
// Returns false when the look has no such footage, so the caller can do something else.
function perform(pet, act, next = null) {
  const seconds = act === 'jump' ? pet.style?.jump : pet.style?.acts?.[act];
  if (!seconds) return false;
  if (rise(pet, 'perform', () => perform(pet, act, next))) return true;
  // A ritual needs room: if this one would reach through a wall the way the pet faces, it turns the other way.
  const need = pet.style.room?.[act], fits = facing => !need || !pet.room || (pet.x + facing * need.ahead <= pet.room + 1 && pet.x + facing * need.ahead >= -1);
  if (!fits(pet.facing) && fits(-pet.facing)) pet.facing = -pet.facing;
  pet.mode = 'perform'; pet.act = act; pet.acted++; pet.left = seconds; pet.goal = null; pet.item = null; pet.vx = 0; pet.plan = null; pet.next = next; pet.wall = 0;
  return true;
}
// The pet is solid and the sides of the screen are walls: neither its nose nor its tail may pass them.
// Returns the least and greatest x its centre may have while it faces the given way.
// With footage, the room it takes depends on what it is doing (style.room, keyed by clip or by kind of meal).
const doing = pet => pet.wall ? 'scratch' : pet.mode === 'perform' ? pet.act : pet.mode === 'eat' ? pet.meal : pet.mode === 'rise' ? (pet.rising === 'eat' ? pet.meal : pet.rising) : pet.mode;
const body = (pet, what = doing(pet)) => pet.style?.room?.[what] || pet.style?.body || pet.body || {ahead: MARGIN * 0.5, behind: MARGIN * 0.5};
export function limits(pet, facing = pet.facing, what = doing(pet)) {
  const {ahead, behind} = body(pet, what), room = pet.room ?? Infinity;
  const [low, high] = facing > 0 ? [behind, room - ahead] : [ahead, room - behind];
  return low <= high ? [low, high] : [room / 2, room / 2];
}
// How far from a wall it stands to rear up against it: its paws' reach, and never nearer than its nose allows.
const front = pet => Math.max(pet.style?.front ?? 0, body(pet, 'idle').ahead);
const nearerWall = pet => pet.x < (pet.room ?? 0) / 2 ? -1 : 1;
// -1 or 1 when the pet is close enough to that side to notice it, otherwise 0.
const besideWall = pet => pet.x < front(pet) + 70 * pet.size ? -1 : pet.x > pet.room - front(pet) - 70 * pet.size ? 1 : 0;
// Stroll up to a side of the screen (-1 left, 1 right) and rake the claws down it.
function toWall(pet, side) {
  if (!pet.style?.acts?.scratch) return false;
  go(pet, 'walk', side < 0 ? front(pet) : pet.room - front(pet), null, side);
  return true;
}
// A cat that has just woken often stretches: where it lay, or after strolling to a side of the screen. Often, not always.
// Or it washes, more often than at other times. A quarter of the time it does none of these.
function wake(pet, roll) {
  if (roll < 0.25 && perform(pet, 'stretch')) return;
  if (roll >= 0.25 && roll < 0.45 && toWall(pet, roll < 0.4 ? nearerWall(pet) : -nearerWall(pet))) return;
  if (roll >= 0.45 && roll < 0.75 && perform(pet, 'groom')) return;
  set(pet, 'idle', 2.5);
}
// Finding itself by a side of the screen (it walked there, or was put down there), it sometimes claws the wall or the floor.
function byWall(pet, roll) {
  const side = besideWall(pet);
  if (!side || !pet.style?.acts || roll >= 0.45) return false;
  if (roll < 0.3 && toWall(pet, side)) return true;
  pet.facing = side;
  return perform(pet, 'stretch');
}
// A walk made of real footage: get going, repeat the matched stretch a whole number of times, come to a stop.
// The speed is set so that the pet covers exactly the distance in exactly that time, and arrives standing still.
function route(pet, mode, x) {
  const part = pet.style?.[mode];
  const distance = Math.abs(x - pet.x);
  if (!part || !(part.loop > 0) || distance < 2) return null;
  const usual = (mode === 'run' ? RUN : WALK) * pet.size, ramps = 0.3 * (part.in + part.out);
  let loops = Math.max(0, Math.round((distance / usual - ramps) / part.loop));
  if (distance / (ramps + loops * part.loop) > usual * 1.6) loops++;
  return {loops, speed: distance / (ramps + loops * part.loop), in: part.in, out: part.out, total: part.in + loops * part.loop + part.out, sign: Math.sign(x - pet.x) || 1};
}
function go(pet, mode, x, item = null, wall = 0) {
  if (rise(pet, mode, () => go(pet, mode, x, item, wall))) return;
  const [low, high] = limits(pet, Math.sign(x - pet.x) || pet.facing, mode); // the room a walking or running body takes
  pet.mode = mode; pet.goal = Math.max(low, Math.min(high, x)); pet.item = item; pet.clock = 0; pet.next = null; pet.wall = wall;
  pet.plan = route(pet, mode, pet.goal);
  pet.left = pet.plan ? pet.plan.total + 1 : 20;
}
function jump(pet) {
  if (rise(pet, 'jump', () => jump(pet))) return;
  pet.plan = null;
  // A realistic jump is a whole clip played on the spot; the drawn pet is thrown into the air instead.
  if (perform(pet, 'jump')) return;
  pet.mode = 'jump'; pet.vy = JUMP; pet.vx = pet.facing * 90; pet.left = 5;
}
function arrive(pet, world) {
  const wall = pet.wall;
  pet.x = pet.goal; pet.plan = null; pet.wall = 0;
  if (pet.item && pet.item.bites > 0) { pet.facing = Math.sign(pet.item.x - pet.x) || 1; pet.mode = 'eat'; pet.meal = pet.item.kind; pet.left = 30; pet.biteIn = pet.style ? 1.4 : 0.6; }
  else if (wall) { pet.facing = wall; if (!perform(pet, 'scratch')) set(pet, 'idle', 1); } // it came here to claw this wall
  else if (!(pet.style?.acts && besideWall(pet) && byWall(pet, world.random()))) set(pet, 'idle', 1);
}

// Things the owner or a chat reply can ask for.
export function command(pet, type, value) {
  if (type === 'hold') { pet.mode = 'held'; pet.vx = pet.vy = 0; pet.item = null; pet.rising = pet.then = pet.plan = pet.next = null; pet.wall = 0; return; }
  if (type === 'release') { pet.mode = 'fall'; pet.left = 0; pet.vx = value?.vx ?? 0; pet.vy = Math.max(0, value?.vy ?? 0); return; }
  if (type === 'stroke') {
    pet.strokes = pet.joy > 0 ? pet.strokes + 1 : 1; pet.joy = 1.6;
    if (pet.mode === 'sleep') return;
    // Petted for a while, a realistic pet rolls over to show its belly; the drawn one beams.
    if (pet.style) { if (pet.strokes >= 3 && pet.alt === 0 && ['idle', 'sit', 'loaf'].includes(pet.mode) && perform(pet, 'roll')) pet.strokes = 0; return; }
    if (pet.alt === 0 && !['eat', 'held', 'run'].includes(pet.mode)) set(pet, 'happy', 1.6);
    return;
  }
  if (pet.mode === 'held' || pet.alt > 0) return; // nothing else applies in mid-air
  // A click on a resting pet: a sleeper wakes (and may stretch); a sitter gets up and strolls a little way off.
  if (type === 'nudge') { if (pet.mode === 'sleep') wake(pet, value); else if (pet.mode === 'sit' || pet.mode === 'loaf') go(pet, 'walk', pet.x + (value < 0.5 ? -1 : 1) * (120 + value * 140)); return; }
  if (type === 'scratch') { if (!toWall(pet, nearerWall(pet))) set(pet, 'happy', 1.2); }
  else if (ACTS.includes(type)) { // value: which way to face first (towards the hand it rubs against, say)
    if (value === 1 || value === -1) pet.facing = value;
    if (!perform(pet, type)) set(pet, 'happy', 1.6); // a look without that footage just looks pleased
  }
  else if (type === 'jump') jump(pet);
  else if (type === 'sit') set(pet, 'sit', 8);
  else if (type === 'loaf') set(pet, canLoaf(pet) ? 'loaf' : 'sit', 20);
  else if (type === 'sleep') set(pet, 'sleep', 90);
  else if (type === 'feed') go(pet, 'run', spotBy(pet, value), value); // the owner put food down: come now, whatever it was doing
  else if (type === 'wake') set(pet, 'idle', 1);
  else if (type === 'spin') { set(pet, 'spin', 1.2); pet.spin = 0; }
  else if (type === 'run') go(pet, 'run', value ?? (pet.x < 400 ? pet.x + 500 : pet.x - 500));
  else if (type === 'come') go(pet, 'run', value ?? pet.x);
}

// Advances the pet. Returns what happened: [{type: 'bite' | 'finished' | 'land', item}].
export function step(pet, dt, world) {
  const happened = [];
  pet.size = world.size ?? 1; pet.room = world.width; pet.body = world.body ?? null;
  // While a hand rests by its head it stays where it is instead of wandering off.
  // On its way somewhere (not to food, not to a wall it means to claw), it stops for the hand.
  if (world.attended && ['idle', 'sit', 'loaf'].includes(pet.mode)) pet.left = Math.max(pet.left, 0.3);
  else if (world.attended && (pet.mode === 'walk' || pet.mode === 'run') && !pet.item && !pet.wall && pet.alt === 0) set(pet, 'idle', 0.5);
  pet.t += dt; pet.left -= dt; pet.joy = Math.max(0, pet.joy - dt);
  let stride = 0, reach = 0, sit = 0, lie = 0, head = 0, tilt = 0, mouth = 0, tongue = 0, eyes = 'open', wagSpeed = 2.2, wagSize = 0.5;

  if (pet.mode === 'held') {
    tilt = Math.sin(pet.t * 5) * 0.12; stride = 0.35; reach = 0.1; wagSize = 0.2;
    pet.pose.gait += dt * 9;
  } else if (pet.alt > 0 || pet.vy > 0) { // in the air: jumping or dropped
    pet.vy -= GRAVITY * dt; pet.alt += pet.vy * dt; pet.x += pet.vx * dt;
    reach = 1; tilt = Math.max(-0.5, Math.min(0.5, -pet.vy / 1400));
    if (pet.alt <= 0) {
      pet.alt = 0; pet.vy = 0; pet.vx = 0; pet.pose.squash = 1.25; happened.push({type: 'land'}); set(pet, 'idle', 0.6);
      if (pet.style?.acts && besideWall(pet)) { const roll = world.random(); pet.next = () => byWall(pet, roll) || set(pet, 'idle', 1); } // put down by a wall
    }
  } else if ((pet.mode === 'walk' || pet.mode === 'run') && pet.plan) {
    const plan = pet.plan;
    pet.clock += dt;
    // Speed follows the footage: nothing while it gathers itself, full speed through the repeats, easing off as it stops.
    const starting = plan.in > 0 && pet.clock < plan.in ? Math.max(0, (pet.clock - 0.4 * plan.in) / (0.6 * plan.in)) : 1;
    const ending = pet.clock - (plan.total - plan.out);
    const stopping = plan.out > 0 && ending > 0 ? Math.max(0, 1 - ending / (0.6 * plan.out)) : 1;
    pet.facing = plan.sign; pet.x += plan.sign * plan.speed * Math.min(starting, stopping) * dt;
    pet.x = plan.sign > 0 ? Math.min(pet.goal, pet.x) : Math.max(pet.goal, pet.x); // rounding must never carry it past the spot
    if (pet.clock >= plan.total) arrive(pet, world);
  } else if (pet.mode === 'walk' || pet.mode === 'run') {
    const speed = (pet.mode === 'run' ? RUN : WALK) * pet.size;
    const gap = pet.goal - pet.x;
    if (Math.abs(gap) <= speed * dt + 1) arrive(pet, world);
    else {
      pet.facing = Math.sign(gap); pet.x += pet.facing * speed * dt;
      pet.pose.gait += dt * (pet.mode === 'run' ? 15 : 8.5);
      stride = pet.mode === 'run' ? 1 : 0.55; wagSize = 0.25;
    }
  } else if (pet.mode === 'eat') {
    const drinking = pet.item?.kind === 'water';
    head = 0.9 + Math.sin(pet.t * 9) * 0.1;
    if (drinking) tongue = Math.abs(Math.sin(pet.t * 11)); else mouth = Math.abs(Math.sin(pet.t * 9));
    wagSpeed = 6; wagSize = 0.7;
    pet.biteIn -= dt;
    if (!pet.item || pet.item.bites <= 0) set(pet, 'happy', 1.2);
    else if (pet.biteIn <= 0) {
      pet.item.bites--; pet.biteIn = 0.9;
      happened.push({type: 'bite', item: pet.item});
      // Stop when the bowl is empty, or when a full pet has had enough.
      const item = pet.item;
      item.taken = (item.taken || 0) + 1;
      if (item.bites <= 0) { happened.push({type: 'finished', item}); set(pet, 'happy', 1.4); }
      // A full pet stops, but food it was offered gets a polite couple of bites first.
      else if (!wants(world.needs, item.kind) && (!item.offered || item.taken >= 2)) { item.offered = false; set(pet, 'sit', 3); }
    }
  } else if (pet.mode === 'sit' || pet.mode === 'loaf') { sit = 1; wagSize = 0.35; }
  else if (pet.mode === 'sleep') {
    lie = 1; eyes = 'closed'; wagSize = 0; // sleeps until the nap is over or the owner wakes it
  } else if (pet.mode === 'happy') { eyes = 'happy'; wagSpeed = 12; wagSize = 1; sit = 0.4; }
  else if (pet.mode === 'spin') { pet.spin += dt; if (Math.floor(pet.spin / 0.15) % 2) pet.facing *= -1; pet.pose.gait += dt * 16; stride = 0.7; eyes = 'happy'; }

  if (pet.joy > 0 && eyes === 'open') { eyes = 'happy'; wagSpeed = 12; wagSize = 1; }
  // A little past a wall (it has just turned round beside it), it is eased back in rather than jumping back;
  // far past it (the screen shrank), it is simply put back.
  if (pet.mode !== 'held') {
    const [low, high] = limits(pet), gap = Math.max(low, Math.min(high, pet.x)) - pet.x;
    pet.x += Math.abs(gap) > 60 ? gap : Math.max(-PUSH * dt, Math.min(PUSH * dt, gap));
  }
  if (pet.mode === 'rise' && pet.left <= 0) { const then = pet.then; pet.rising = pet.then = null; pet.mode = 'idle'; pet.left = 0.2; then?.(); }
  if (pet.left <= 0 && pet.alt === 0 && pet.mode !== 'held') {
    const next = pet.next; pet.next = null;
    if (pet.mode === 'sleep') wake(pet, world.random());                                       // the nap is over
    else if (pet.mode === 'fall' && byWall(pet, pet.style?.acts ? world.random() : 1)) {}      // set down on the ground by a wall
    else if (next) next();
    else if (pet.mode === 'sit' && pet.style?.acts?.groom && world.random() < 0.4 && perform(pet, 'groom')) {} // a sit often ends in a wash
    else decide(pet, world);
  }

  pet.blinkIn -= dt;
  if (pet.blinkIn < -0.14) pet.blinkIn = 2 + world.random() * 3.5;
  const pose = pet.pose;
  pose.facing = pet.facing; pose.eyes = eyes;
  pose.stride = approach(pose.stride, stride, 10, dt); pose.reach = approach(pose.reach, reach, 12, dt);
  pose.sit = approach(pose.sit, sit, 6, dt); pose.lie = approach(pose.lie, lie, 4, dt);
  pose.head = approach(pose.head, head, 9, dt); pose.tilt = approach(pose.tilt, tilt, 10, dt);
  pose.squash = approach(pose.squash, 1, 9, dt);
  pose.mouth = mouth; pose.tongue = tongue;
  pose.blink = pet.blinkIn < 0 ? 1 : 0;
  pose.tail = Math.sin(pet.t * wagSpeed) * wagSize;
  pose.ear = Math.sin(pet.t * 0.7) > 0.96 ? 1 : 0;
  pose.breathe += dt * (lie ? 1.6 : 2.6);
  return happened;
}
