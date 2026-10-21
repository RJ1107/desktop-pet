import test from 'node:test';
import assert from 'node:assert/strict';
import {keyOut, union, sheetLayout, screenExcess, dropSpecks, findMouth, fadeAtEdges} from '../src/shared/matte.js';
import {CLIPS, CLIP_NAMES, clipPrompt, referencePrompt, frameFor, activeRange, bestLoop, calmest, cycleParts, leaveSeconds, mealClip, clipSeconds, between} from '../src/shared/realistic.js';
import {createPet, step, command, limits} from '../src/renderer/pet/brain.js';
import {defaultNeeds, ITEMS} from '../src/shared/needs.js';

// A 60x40 frame: uneven green screen, a grey animal with soft edges, and a green eye inside it.
function frame() {
  const width = 60, height = 40, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, wobble = ((x * 7 + y * 13) % 9) - 4;
    let colour = [20 + wobble, 228 + wobble, 30 + wobble];           // screen, not exactly #00ff00
    const inside = x >= 20 && x < 40 && y >= 10 && y < 30;
    const edge = (x === 19 || x === 40) && y >= 10 && y < 30;        // fur half blended with the screen
    if (inside) colour = [130, 128, 126];
    if (edge) colour = [75, 178, 78];
    if (x >= 28 && x < 31 && y >= 15 && y < 18) colour = [120, 190, 110]; // a green iris, enclosed by fur: green, but far duller than the screen
    data.set([...colour, 255], i);
  }
  return {width, height, data};
}

test('the screen is removed, soft edges stay soft, and green inside the animal survives', () => {
  const {width, height, data} = frame();
  assert.ok(screenExcess(data, width, height) > 150);
  const box = keyOut(data, width, height);
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alpha(2, 2), 0); assert.equal(alpha(57, 37), 0); assert.equal(alpha(30, 5), 0);
  assert.equal(alpha(25, 20), 255);
  assert.equal(alpha(29, 16), 255, 'the green eye was keyed out');
  const edge = alpha(19, 20);
  assert.ok(edge > 30 && edge < 230, `edge alpha ${edge}`);
  const i = (20 * width + 19) * 4;
  assert.ok(data[i + 1] <= Math.max(data[i], data[i + 2]), 'the green cast was left on the fur edge');
  assert.deepEqual(box, {left: 20, top: 10, right: 40, bottom: 30}); // the box hugs the solid body; soft edges lie just outside it
});

test('an unevenly lit screen with a shadow is still removed, and dark fur is not eaten into', () => {
  const width = 80, height = 50, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const glow = 1 - Math.hypot(x - 40, y - 25) / 90;                  // brighter in the middle, dim at the corners
    let colour = [60 * glow + 20, 170 * glow + 40, 75 * glow + 22];
    if (y >= 38 && y < 42 && x >= 25 && x < 55) colour = [28, 92, 38]; // shadow on the floor under the animal
    if (x >= 30 && x < 50 && y >= 18 && y < 38) colour = [24, 30, 25]; // near-black fur with a slight green cast
    if (x >= 36 && x < 44 && y >= 30 && y < 34) colour = [70, 176, 86];  // screen seen through a gap the body encloses
    if (y === 0 || y === height - 1) colour = [0, 0, 0];               // the black line encoders leave along the edge
    data.set([...colour, 255], (y * width + x) * 4);
  }
  const box = keyOut(data, width, height);
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alpha(40, 0), 0); assert.equal(alpha(40, 49), 0); // the black edge lines go too
  assert.equal(alpha(1, 1), 0); assert.equal(alpha(40, 5), 0); assert.equal(alpha(75, 45), 0); assert.equal(alpha(10, 25), 0);
  assert.equal(alpha(40, 28), 255); assert.equal(alpha(31, 19), 255);
  assert.equal(alpha(40, 32), 0, 'screen inside an enclosed gap was left in');
  assert.ok(alpha(40, 40) < 128, `shadow alpha ${alpha(40, 40)}`); // at most a faint shadow, never a solid patch
  assert.deepEqual(box, {left: 30, top: 18, right: 50, bottom: 38});
});

test('a frame that is all screen yields nothing, and boxes combine', () => {
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([10, 240, 20, 255], i);
  assert.equal(keyOut(data, 20, 20), null);
  assert.deepEqual(union([null, {left: 5, top: 6, right: 9, bottom: 9}, {left: 2, top: 7, right: 8, bottom: 12}]), {left: 2, top: 6, right: 9, bottom: 12});
  assert.equal(union([null]), null);
});

test('sprite sheets are laid out as a near-square grid that holds every frame', () => {
  const grid = sheetLayout(96, 300, 220);
  assert.ok(grid.columns * grid.rows >= 96);
  assert.ok(Math.abs(grid.width - grid.height) < 500, `${grid.width}x${grid.height}`);
  assert.ok(grid.width < 16000 && grid.height < 16000); // inside what a WebP image can hold
  assert.deepEqual(grid.cell(0), {x: 0, y: 0});
  assert.deepEqual(grid.cell(grid.columns), {x: 0, y: 220});
  assert.equal(sheetLayout(1, 10, 10).columns, 1);
});

test('prompts name the species, carry the owner\'s words, keep a dark coat dark, and pin the stage', () => {
  const still = referencePrompt({species: 'cat', description: 'very long tufts on the ear tips', photos: 3});
  for (const part of ['this exact cat', 'reference photos', 'very long tufts on the ear tips', '#00FF00', 'facing right', 'must stay just as dark']) assert.ok(still.includes(part), part);
  assert.ok(referencePrompt({species: 'dog'}).includes('a pet dog'));
  for (const name of CLIP_NAMES) {
    const prompt = clipPrompt(name, 'dog');
    assert.ok(prompt.includes('dog') && !prompt.includes('{animal}') && prompt.includes('no camera movement') && prompt.includes('#00FF00'), name);
  }
  assert.deepEqual(CLIP_NAMES.slice(0, 2), ['idle', 'walk']); // the standing clip is cut first; it fixes the ground line
});

test('the part of a clip worth repeating is found from where the outline changes', () => {
  //            standing  getting down      held pose        getting up   standing
  const motion = [0, 2,    10, 40, 80,      100, 98, 96, 99,  70, 30, 8,   1, 0];
  assert.deepEqual(activeRange(motion, 0.8), [4, 8]);
  assert.deepEqual(activeRange(motion, 0.45), [4, 9]);
  assert.deepEqual(activeRange([0, 0, 0], 0.8), [0, 2]); // nothing moved: use it all
});

test('loop points are the two frames that match in pose and in direction', () => {
  // A stride that repeats every 12 frames: the pose is the point on a circle, so a half stride later it is opposite.
  const pose = i => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)];
  const differ = (i, j) => Math.hypot(pose(i)[0] - pose(j)[0], pose(i)[1] - pose(j)[1]);
  const found = bestLoop(differ, 8, 60, 14);
  assert.equal((found.loop[1] - found.loop[0]) % 12, 0, `loop ${found.loop}`); // a whole number of strides
  assert.ok(found.loop[1] - found.loop[0] >= 14 && found.jump < 1e-9);
  assert.equal(bestLoop(differ, 0, 5, 14), null); // too short to hold a loop
});

test('the stillest stretch of a pose is found, so resting does not replay the settling', () => {
  // How much each frame differs from the next: lively while lying down (0-9), nearly still (10-25), lively getting up (26-35).
  const change = i => i < 10 || i >= 26 ? 5 : i >= 14 && i < 22 ? 0.1 : 1;
  const differ = (i, j) => j === i + 1 ? change(i) : 99;
  assert.deepEqual(calmest(differ, 4, 32, 8), [14, 22]);
  assert.deepEqual(calmest(differ, 14, 18, 8), [14, 18]); // a short pose is used whole
});

test('standing swings, one-shots stop, resting stays still, grazing repeats one lick forwards, and walks repeat their matched stretch', () => {
  const clip = {frames: 96, fps: 24, still: [44, 56], chew: [30, 42], loop: [20, 68]};
  const run = (kind, seconds, options) => Array.from({length: Math.round(seconds * 24)}, (_, i) => frameFor(kind, clip, i / 24, options));
  const steps = list => list.slice(1).map((frame, i) => frame - list[i]);

  const swing = run('swing', 10);
  assert.ok(steps(swing).every(step => Math.abs(step) <= 1), 'standing skipped a frame'); // never a jump, in either direction
  assert.equal(Math.max(...swing), 95); assert.equal(swing[95 * 2], 0);
  assert.equal(frameFor('once', clip, 99), 95);

  // Resting: plays the settling once, then never leaves the still stretch, and moves a third as fast as the footage.
  const rest = run('rest', 60);
  assert.deepEqual(rest.slice(0, 45), Array.from({length: 45}, (_, i) => i));
  assert.ok(rest.slice(44).every(frame => frame >= 44 && frame <= 56));
  assert.ok(steps(rest.slice(44)).every(step => Math.abs(step) <= 1));
  assert.equal(steps(rest.slice(44, 44 + 24)).filter(step => step !== 0).length, 7); // 7 or 8 frame changes in a second instead of 24
  assert.equal(frameFor('rest', clip, 0, {leaving: true}), 56); assert.equal(frameFor('rest', clip, 9, {leaving: true}), 95);
  assert.equal(leaveSeconds('rest', clip), 39 / 24);

  // Grazing: lowers the head once, then the same 12 frames forwards, again and again; never backwards.
  const graze = run('graze', 6);
  assert.deepEqual(graze.slice(0, 31), Array.from({length: 31}, (_, i) => i));
  assert.deepEqual([...new Set(steps(graze.slice(30)))].sort((a, b) => a - b), [-11, 1]);
  assert.equal(frameFor('graze', clip, 0, {leaving: true}), 42); assert.equal(leaveSeconds('graze', clip), 53 / 24);

  assert.deepEqual(cycleParts(clip), {a: 20, b: 68, in: 20 / 24, loop: 2, out: 27 / 24});
  const walk = run('cycle', (20 + 48 * 3 + 28) / 24, {loops: 3});
  assert.deepEqual(steps(walk).filter(step => step !== 1), [-47, -47]); // two wraps for three repeats, each from frame 67 back to frame 20
  assert.equal(walk[0], 0); assert.equal(walk.at(-1), 95);
  // No repeats: it gets going, then goes straight to stopping. Frames 20 and 68 were chosen because they look alike, so that cut is a seam too.
  assert.deepEqual(steps(run('cycle', (20 + 28) / 24, {loops: 0})).filter(step => step !== 1), [49]);
  assert.equal(CLIPS.idle.kind, 'swing'); assert.equal(CLIPS.walk.kind, 'cycle'); assert.equal(CLIPS.sleep.kind, 'rest'); assert.equal(CLIPS.drink.kind, 'graze'); assert.equal(CLIPS.jump.kind, 'once');
});

test('dry food is chewed and water or treats are licked, with whichever footage exists', () => {
  const all = name => true, onlyEat = name => name === 'eat', none = () => false;
  assert.equal(mealClip('kibble', all), 'eat'); assert.equal(mealClip('water', all), 'drink'); assert.equal(mealClip('treat', all), 'drink');
  assert.equal(mealClip('water', onlyEat), 'eat'); assert.equal(mealClip('kibble', none), null);
});

const live = (seconds, pet, world, each) => { for (let t = 0; t < seconds; t += 1 / 60) { step(pet, 1 / 60, world); each?.(); } };
const footage = () => ({jump: 4, out: {sit: 1.2, sleep: 1.5, kibble: 1, water: 0.8, treat: 0.8}, walk: {in: 0.8, loop: 2, out: 1.1}, run: {in: 0.5, loop: 1, out: 0.9}, reach: {kibble: 90, water: 70, treat: 70}});

test('with the realistic look the pet jumps on the spot and finishes getting up before moving on', () => {
  const world = {width: 1600, items: [], cursor: null, needs: defaultNeeds(), size: 1, random: () => 0.1};
  const pet = createPet(400); pet.style = footage();
  command(pet, 'jump');
  assert.equal(pet.mode, 'perform'); assert.equal(pet.act, 'jump');
  live(1, pet, world); assert.equal(pet.alt, 0); assert.equal(pet.x, 400); // no physics: the clip carries the motion
  live(3.5, pet, world); assert.notEqual(pet.mode, 'perform');
  command(pet, 'sit'); live(0.5, pet, world); assert.equal(pet.mode, 'sit');
  command(pet, 'run', 900);
  assert.equal(pet.mode, 'rise'); assert.equal(pet.rising, 'sit');
  live(0.5, pet, world); assert.equal(pet.mode, 'rise'); assert.equal(pet.x, 400);
  live(1, pet, world); assert.equal(pet.mode, 'run'); assert.ok(pet.x > 400);
  // The drawn pet is unchanged: it still leaves the ground.
  const cartoon = createPet(400); command(cartoon, 'jump'); live(0.2, cartoon, world); assert.ok(cartoon.alt > 20);
});

test('a realistic walk is whole footage: it starts still, never goes backwards, and ends exactly on the spot as the clip ends', () => {
  const world = {width: 3000, items: [], cursor: null, needs: defaultNeeds(), size: 1, random: () => 0.1};
  const pet = createPet(500); pet.style = footage();
  command(pet, 'run', 1400);
  const plan = pet.plan;
  assert.ok(plan.loops >= 1 && Number.isInteger(plan.loops));
  assert.equal(plan.total, 0.5 + plan.loops * 1 + 0.9);
  assert.ok(plan.speed > 200 / 1.7 && plan.speed < 200 * 1.7, `speed ${plan.speed}`);
  live(0.15, pet, world); assert.equal(pet.x, 500); // gathering itself: the footage has not started moving yet
  let last = pet.x, backwards = false;
  live(plan.total - 0.15 + 0.05, pet, world, () => { if (pet.x < last - 1e-6) backwards = true; last = pet.x; });
  assert.equal(backwards, false);
  assert.equal(pet.x, 1400); assert.equal(pet.plan, null); assert.equal(pet.mode, 'idle');
  // A short hop needs no repeat at all: the clip plays once, slower.
  command(pet, 'run', 1430); assert.equal(pet.plan.loops, 0);
});

test('the pet stops with its muzzle over the food, from either side', () => {
  for (const [from, bowlAt, expected, facing] of [[300, 900, 810, 1], [1500, 900, 990, -1]]) {
    const bowl = {kind: 'kibble', x: bowlAt, bites: ITEMS.kibble.bites};
    const world = {width: 2000, items: [bowl], cursor: null, needs: {...defaultNeeds(), food: 10}, size: 1, random: () => 0.1};
    const pet = createPet(from); pet.style = footage(); pet.left = 0;
    let ateAt = null, faced = null;
    for (let t = 0; t < 30 && ateAt === null; t += 1 / 60) for (const event of step(pet, 1 / 60, world)) if (event.type === 'bite') { ateAt = pet.x; faced = pet.facing; }
    assert.equal(ateAt, expected); assert.equal(faced, facing);
  }
});

test('food the owner puts down is always visited: a full pet takes two bites, a sleeping one gets up first, and leftovers are not begged for again', () => {
  for (const realistic of [false, true]) {
    const full = {...defaultNeeds(), food: 99, water: 99};
    const bowl = {kind: 'kibble', x: 900, bites: ITEMS.kibble.bites, offered: true};
    const world = {width: 2000, items: [bowl], cursor: null, needs: full, size: 1, random: () => 0.5};
    const pet = createPet(300); if (realistic) pet.style = footage();
    command(pet, 'sleep'); live(2, pet, world); assert.equal(pet.mode, 'sleep');
    command(pet, 'feed', bowl);
    assert.equal(pet.mode, realistic ? 'rise' : 'run'); // real footage finishes waking up before it sets off
    let bites = 0;
    for (let t = 0; t < 40; t += 1 / 60) for (const event of step(pet, 1 / 60, world)) if (event.type === 'bite') bites++;
    assert.equal(bites, 2, `realistic ${realistic}`); assert.equal(bowl.bites, ITEMS.kibble.bites - 2); assert.equal(bowl.offered, false);
    // It does not come back for the rest while still full.
    for (let t = 0; t < 60; t += 1 / 60) for (const event of step(pet, 1 / 60, world)) if (event.type === 'bite') bites++;
    assert.equal(bites, 2);
  }
});

test('a nap lasts, and water is drunk with the muzzle over the bowl at the lapping clip\'s reach', () => {
  const world = {width: 2000, items: [], cursor: null, needs: {...defaultNeeds(), energy: 100}, size: 1, random: () => 0.5};
  const pet = createPet(300); pet.style = footage();
  command(pet, 'sleep'); live(60, pet, world); assert.equal(pet.mode, 'sleep'); // still asleep a minute later, even fully rested
  const water = {kind: 'water', x: 1000, bites: 5, offered: true};
  world.items.push(water); command(pet, 'feed', water);
  let ateAt = null;
  for (let t = 0; t < 40 && ateAt === null; t += 1 / 60) for (const event of step(pet, 1 / 60, world)) if (event.type === 'bite') ateAt = pet.x;
  assert.equal(ateAt, 930); assert.equal(pet.meal, 'water');
});

// A solid black "animal" on a clear frame: body, lowered head reaching forward, and whatever the test adds.
function scene(extra = () => null) {
  const width = 120, height = 80, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let colour = null;
    if (x >= 20 && x < 70 && y >= 30 && y < 60) colour = [15, 15, 15];           // body
    if (x >= 30 && x < 36 && y >= 60 && y < 70) colour = [15, 15, 15];           // a leg down to the ground (row 69)
    if (x >= 70 && x < 96 && y >= 40 && y < 58) colour = [15, 15, 15];           // forehead and ears, pushed forward but well off the ground
    if (x >= 70 && x < 86 && y >= 58 && y < 68) colour = [15, 15, 15];           // muzzle, down near the ground
    colour = extra(x, y) ?? colour;
    if (colour) data.set([...colour, 255], (y * width + x) * 4);
  }
  return {width, height, data, standing: {ground: 70, tall: 40, centre: 45}};
}

test('specks that are not part of the animal are removed, with their soft edges', () => {
  const {width, height, data} = scene((x, y) => x >= 100 && x < 103 && y >= 66 && y < 69 ? [200, 120, 40] : null); // a crumb the video model drew
  data.set([200, 120, 40, 60], (67 * width + 104) * 4);                                                             // and its soft edge
  dropSpecks(data, width, height);
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(alpha(101, 67), 0); assert.equal(alpha(104, 67), 0);
  assert.equal(alpha(40, 40), 255); assert.equal(alpha(32, 65), 255); assert.equal(alpha(80, 62), 255);
});

test('the mouth is found at the chin near the ground, not at the forehead, and at the tongue when one shows', () => {
  const plain = scene();
  const chin = findMouth(plain.data, plain.width, plain.height, plain.standing);
  assert.equal(chin.by, 'chin');
  assert.ok(chin.x > 80 && chin.x < 86, `chin at ${chin.x}`); // the forehead reaches x = 95, but only the muzzle is near the ground
  const licking = scene((x, y) => x >= 86 && x < 90 && y >= 66 && y < 70 ? [228, 130, 150] : null);
  const tongue = findMouth(licking.data, licking.width, licking.height, licking.standing);
  assert.equal(tongue.by, 'tongue'); assert.equal(tongue.x, 87.5); assert.equal(tongue.y, 67.5);
  // A pink inner ear high on the head is not mistaken for a tongue.
  const ear = scene((x, y) => x >= 88 && x < 92 && y >= 42 && y < 46 ? [228, 130, 150] : null);
  assert.equal(findMouth(ear.data, ear.width, ear.height, ear.standing).by, 'chin');
  assert.equal(findMouth(new Uint8ClampedArray(120 * 80 * 4), 120, 80, plain.standing), null);
});

test('a click nudges a resting pet: a sleeper wakes, a sitter gets up and walks off, and it never walks off the screen', () => {
  for (const realistic of [false, true]) {
    const world = {width: 1200, items: [], cursor: null, needs: defaultNeeds(), size: 1, random: () => 0.5};
    const pet = createPet(600); if (realistic) pet.style = footage();
    command(pet, 'sleep'); live(3, pet, world); assert.equal(pet.mode, 'sleep');
    command(pet, 'nudge', 0.7);
    live(2, pet, world); assert.notEqual(pet.mode, 'sleep'); assert.equal(pet.x, 600); // awake, standing where it slept
    command(pet, 'sit'); live(1, pet, world); assert.equal(pet.mode, 'sit');
    command(pet, 'nudge', 0.7);
    let farthest = 0; // it may wander back afterwards, so note how far it got
    live(12, pet, world, () => { farthest = Math.max(farthest, Math.abs(pet.x - 600)); });
    assert.ok(farthest > 100, `only got ${farthest} away`);
    // Nudged at the edge of the screen, it turns back inside rather than aiming beyond it.
    pet.x = 1150; command(pet, 'sit'); live(1.5, pet, world); command(pet, 'nudge', 0.9);
    live(15, pet, world); assert.ok(pet.x <= 1165 && pet.x >= 35);
  }
});

test('a rolling clip is played once at a changing pace: unhurried going down and while it lies there, quick through the turn', () => {
  const clip = {frames: 96, fps: 24, hold: [30, 70]};
  assert.equal(clipSeconds('once', clip), 4);
  const seconds = clipSeconds('linger', clip), frames = [];
  assert.ok(seconds > 5 && seconds < 6.5, `takes ${seconds}s`);
  for (let i = 0; i < seconds * 24; i++) frames.push(frameFor('linger', clip, (i + 0.5) / 24));
  assert.equal(frames[0], 0); assert.ok(frames.at(-1) >= 94);
  assert.ok(frames.every((frame, i) => i === 0 || (frame >= frames[i - 1] && frame - frames[i - 1] <= 2))); // once through: never back, never a jump
  const shown = (from, to) => frames.filter(frame => frame >= from && frame < to).length / 24;             // seconds spent on those frames
  assert.ok(shown(40, 60) > 1.1 && shown(40, 60) < 1.6, `in the pose ${shown(40, 60)}s`); // slower than filmed, but not so slow that it stutters
  assert.ok(shown(30, 40) < 0.4 && shown(60, 70) < 0.4);             // the turns either side are quick
  assert.ok(shown(0, 30) > 1.7 && shown(70, 96) > 1.5);              // going down and getting up are unhurried
  // Slowed footage is smoothed: the next frame is laid over by the fraction reached.
  const mid = between('linger', clip, 2.5);
  assert.equal(mid.frame, frameFor('linger', clip, 2.5) + 1); assert.ok(mid.weight > 0 && mid.weight < 1);
  assert.equal(between('linger', clip, 0.5), null); // not while it goes down: there the frames differ too much to lay over
  assert.equal(between('once', clip, 1), null);
});

test('a resting pose can be settled into slowly, and stretches take their own unhurried pace', () => {
  const clip = {frames: 96, fps: 24, still: [40, 52], hold: [30, 70]};
  assert.equal(frameFor('rest', clip, 1, {}), 24);                               // as filmed
  assert.equal(frameFor('rest', clip, 1, {pace: {settle: 0.5}}), 12);            // at half speed: the paws go under one at a time
  assert.equal(frameFor('rest', clip, 40 / 24 / 0.5 - 0.01, {pace: {settle: 0.5}}), 39);
  for (let t = 3.4; t < 30; t += 0.37) { const frame = frameFor('rest', clip, t, {pace: {settle: 0.5}}); assert.ok(frame >= 40 && frame <= 52, `frame ${frame} at ${t}`); }
  // Held still: once settled it shows one frame and nothing else until it gets up.
  for (let t = 52 / 24 + 0.01; t < 30; t += 0.41) assert.equal(frameFor('rest', clip, t, {pace: {still: true}}), 52);
  assert.equal(frameFor('rest', clip, 1, {pace: {still: true}}), 24); // settling in at the speed it was filmed
  assert.equal(frameFor('rest', clip, 0.5, {leaving: true, pace: {still: true}}), 64);
  // With a measured most-open-eyed frame, that is the one held, and getting up starts from it.
  const awake = {...clip, awake: 44};
  for (let t = 44 / 24 + 0.01; t < 30; t += 0.53) assert.equal(frameFor('rest', awake, t, {pace: {still: true}}), 44);
  assert.equal(frameFor('rest', awake, 0.5, {leaving: true, pace: {still: true}}), 56);
  assert.equal(leaveSeconds('rest', awake, {still: true}), (95 - 44) / 24); assert.equal(leaveSeconds('rest', awake), (95 - 52) / 24);
  // A stretch: nowhere faster than filmed, slowest at its deepest, and longer than the four seconds of footage.
  const pace = CLIPS.stretch.pace, seconds = clipSeconds(CLIPS.stretch.kind, clip, pace);
  assert.equal(CLIPS.stretch.kind, 'linger'); assert.equal(CLIPS.scratch.kind, 'linger');
  assert.ok(Math.max(pace.ends, pace.turn, pace.pose) <= 1 && pace.pose < pace.ends);
  assert.ok(seconds > 5 && seconds < 8, `stretch takes ${seconds}s`);
  assert.ok(seconds < clipSeconds('linger', clip) + 2);
});

test('an arm that reaches in from the side of the frame fades out towards that side instead of ending in a straight cut', () => {
  const width = 200, height = 100, data = new Uint8ClampedArray(width * height * 4);
  const fill = (x0, x1, y0, y1, colour) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...colour, 255], (y * width + x) * 4); };
  fill(40, 90, 40, 80, [30, 30, 30]);          // the animal, in the middle
  assert.equal(fadeAtEdges(data, width, height), null); assert.equal(data[(60 * width + 60) * 4 + 3], 255);
  fill(90, 200, 50, 60, [220, 170, 150]);       // an arm from the right edge to the animal
  assert.equal(fadeAtEdges(data, width, height), 'right');
  const alpha = x => data[(55 * width + x) * 4 + 3];
  assert.equal(alpha(100), 255); assert.ok(alpha(180) > 0 && alpha(180) < 255); assert.ok(alpha(196) < 10);
  assert.ok(alpha(175) > alpha(185) && alpha(185) > alpha(192));
  assert.equal(data[(60 * width + 60) * 4 + 3], 255); // the animal is untouched
});

const rituals = () => ({...footage(), acts: {stretch: 4, scratch: 4, groom: 4, yawn: 4, roll: 4, nuzzle: 4}, front: 130, body: {ahead: 110, behind: 120}});
const calm = (random = () => 0.9) => ({width: 1600, items: [], cursor: null, needs: defaultNeeds(), size: 1, random});

test('a woken cat sometimes stretches where it lay, sometimes walks to a side of the screen to claw it, and sometimes neither', () => {
  const napping = at => { const pet = createPet(at); pet.style = rituals(); const world = calm(); live(0.1, pet, world); command(pet, 'sleep'); live(2, pet, world); return [pet, world]; };
  let [pet, world] = napping(500);
  command(pet, 'nudge', 0.1); assert.equal(pet.mode, 'rise');           // it gets up first: that is footage too
  live(2, pet, world); assert.equal(pet.mode, 'perform'); assert.equal(pet.act, 'stretch'); assert.equal(pet.x, 500);
  [pet, world] = napping(500);
  command(pet, 'nudge', 0.3); live(2, pet, world); assert.equal(pet.mode, 'walk'); assert.equal(pet.goal, 130); // the nearer wall, paws' reach away
  live(25, pet, world, () => {}); assert.equal(pet.act, 'scratch'); assert.equal(pet.x, 130); assert.equal(pet.facing, -1);
  [pet, world] = napping(1300);
  command(pet, 'nudge', 0.3); live(25, pet, world); assert.equal(pet.act, 'scratch'); assert.equal(pet.x, 1470); assert.equal(pet.facing, 1);
  [pet, world] = napping(500);
  command(pet, 'nudge', 0.6); live(2, pet, world); assert.equal(pet.act, 'groom'); assert.equal(pet.x, 500);       // or it has a wash
  [pet, world] = napping(500);
  command(pet, 'nudge', 0.8); live(2, pet, world); assert.equal(pet.mode, 'idle'); assert.equal(pet.act, null); // a quarter of the time it just gets up
  // A nap that ends by itself goes the same way, by the same odds.
  [pet, world] = napping(500); world.random = () => 0.1; pet.left = 0;
  live(2, pet, world); assert.equal(pet.act, 'stretch');
  // The drawn pet has no such footage: it simply wakes.
  const drawn = createPet(500), plain = calm(); command(drawn, 'sleep'); live(1, drawn, plain); command(drawn, 'nudge', 0.1);
  assert.equal(drawn.mode, 'idle');
});

test('the sides of the screen are walls: nose and tail stay inside when it runs at them, is put down by them, or turns round', () => {
  const pet = createPet(800); pet.style = rituals(); const world = calm();
  let worst = 0;
  const watch = () => { const nose = pet.x + pet.facing * 110, tail = pet.x - pet.facing * 120; worst = Math.max(worst, -Math.min(nose, tail), Math.max(nose, tail) - 1600); };
  live(0.1, pet, world);
  command(pet, 'run', 5000); assert.equal(pet.goal, 1490);
  live(12, pet, world, watch); assert.ok(pet.x <= 1490);
  command(pet, 'run', -5000); assert.equal(pet.goal, 110);   // facing left now, so it is the nose that meets the left wall
  live(14, pet, world, watch);
  assert.ok(worst <= 10, `stuck out ${worst}px`);             // only while turning on the spot, and eased back within a few frames
  // In the hand it cannot be carried through a wall either: the overlay asks for these limits while dragging.
  assert.deepEqual(limits(pet, 1), [120, 1490]); assert.deepEqual(limits(pet, -1), [110, 1480]);
  // Put down beside a wall, it may walk up to it and claw it (here the dice say yes).
  world.random = () => 0.1;
  command(pet, 'hold'); pet.x = 1450; pet.alt = 200; pet.facing = 1; command(pet, 'release');
  let clawedAt = null;
  live(8, pet, world, () => { if (pet.mode === 'perform' && pet.act === 'scratch') clawedAt ??= [pet.x, pet.facing]; });
  assert.deepEqual(clawedAt, [1470, 1]);
  // The same drop when the dice say no: nothing special.
  const other = createPet(800); other.style = rituals(); const quiet = calm(() => 0.95);
  live(0.1, other, quiet); command(other, 'hold'); other.x = 1450; other.alt = 200; command(other, 'release');
  live(3, other, quiet); assert.notEqual(other.mode, 'perform');
});

test('a hand by its head gets a head-bunt, long petting gets a roll, and a tired cat yawns before it sleeps', () => {
  const pet = createPet(600); pet.style = rituals(); const world = calm();
  live(0.1, pet, world);
  command(pet, 'nuzzle', -1); assert.equal(pet.mode, 'perform'); assert.equal(pet.act, 'nuzzle'); assert.equal(pet.facing, -1);
  live(4.2, pet, world); assert.notEqual(pet.mode, 'perform');
  // While the hand rests there it stays put instead of wandering off.
  command(pet, 'wake'); world.attended = true; live(20, pet, world); assert.equal(pet.mode, 'idle'); world.attended = false;
  for (let i = 0; i < 2; i++) command(pet, 'stroke'); assert.equal(pet.mode, 'idle');
  command(pet, 'stroke'); assert.equal(pet.act, 'roll'); assert.equal(pet.mode, 'perform');
  // The same footage twice running is counted as two performances, so the picture starts over.
  const count = pet.acted; live(4.2, pet, world); command(pet, 'roll'); assert.equal(pet.acted, count + 1);
  // The drawn pet has none of this footage: it looks pleased instead.
  const drawn = createPet(600); live(0.1, drawn, world); command(drawn, 'nuzzle', 1); assert.equal(drawn.mode, 'happy');
  // A sit often ends in a wash; and a ritual that would reach through the wall it faces is done facing the other way.
  const sitter = createPet(600); sitter.style = rituals(); const dice = calm(() => 0.3);
  live(0.1, sitter, dice); command(sitter, 'sit'); live(10, sitter, dice, () => { if (sitter.mode === 'perform') sitter.seen = sitter.act; });
  assert.equal(sitter.seen, 'groom');
  const cornered = createPet(1480); cornered.style = {...rituals(), room: {stretch: {ahead: 200, behind: 120}}};
  live(0.1, cornered, world); cornered.facing = 1; command(cornered, 'stretch');
  assert.equal(cornered.mode, 'perform'); assert.equal(cornered.facing, -1);
  // With footage for it, some rests are a loaf with the paws tucked under; a click or a hand gets it up like a sit.
  const loafer = createPet(600); loafer.style = {...rituals(), out: {...rituals().out, loaf: 1.3}};
  live(0.1, loafer, world); command(loafer, 'loaf'); assert.equal(loafer.mode, 'loaf');
  live(5, loafer, world); assert.equal(loafer.mode, 'loaf');
  command(loafer, 'nuzzle', 1); assert.equal(loafer.mode, 'rise'); assert.equal(loafer.rising, 'loaf');
  live(1.5, loafer, world); assert.equal(loafer.act, 'nuzzle');
  const noLoaf = createPet(600); live(0.1, noLoaf, world); command(noLoaf, 'loaf'); assert.equal(noLoaf.mode, 'sit');
  // A hand by its head stops a stroll, but not a run to its food.
  const stroller = createPet(300); stroller.style = rituals(); const street = calm();
  live(0.1, stroller, street); command(stroller, 'come', 1200); live(1.5, stroller, street); assert.equal(stroller.mode, 'run');
  street.attended = true; live(0.1, stroller, street); assert.equal(stroller.mode, 'idle'); street.attended = false;
  const bowl = {kind: 'kibble', x: 1200, bites: 5, offered: true};
  street.items.push(bowl); command(stroller, 'feed', bowl); live(1, stroller, street);
  street.attended = true; live(0.5, stroller, street); assert.equal(stroller.mode, 'run'); street.attended = false;
  // Tired out: a yawn first (when the dice allow), then sleep.
  const tired = createPet(600); tired.style = rituals(); tired.left = 0;
  const night = {...calm(() => 0.2), needs: {...defaultNeeds(), energy: 5}};
  live(0.1, tired, night); assert.equal(tired.act, 'yawn');
  live(6, tired, night); assert.equal(tired.mode, 'sleep');
});
