// Plays the realistic pet: cut-out frames from generated clips, chosen by what the pet is doing.
import {CLIPS, ACTS, HOLD_MODES, frameFor, seamBlend, between, leaveSeconds, cycleParts, mealClip, clipSeconds} from '../../shared/realistic.js';

const EVERYDAY = ['idle', 'walk', 'run', 'sit', 'loaf', 'sleep', 'eat', 'drink'];
const MARGIN = 10;
const LET_GO = 20000;        // milliseconds a ritual's sheet is kept after it was last drawn
const STANDING_HEIGHT = 150; // on-screen height of the standing animal at size 1, in CSS pixels
const CROSSFADE = 0.18;      // seconds over which one clip gives way to the next

export async function loadRealistic(host) {
  const pack = await host.call('real:load');
  if (!pack || pack.error) return null;
  const {clips, anchor} = pack.meta, urls = pack.sheets;
  const has = name => Boolean(urls[name] && clips[name]);
  if (!has('idle') || !anchor) return null;
  // A decoded sheet takes about 25 MB, so only the everyday ones stay in memory. A ritual's sheet is decoded when it
  // is first wanted and let go a while after it was last drawn.
  const sheets = {};
  const open = name => new Promise(resolve => {
    const entry = sheets[name] = {image: new Image(), ready: false, used: performance.now()};
    entry.image.onload = () => { entry.ready = true; resolve(); };
    entry.image.onerror = resolve;
    entry.image.src = urls[name];
  });
  await Promise.all(EVERYDAY.filter(has).map(open));
  if (!sheets.idle.ready) return null;
  function sheetOf(name) {
    if (!sheets[name]) open(name);
    sheets[name].used = performance.now();
    return sheets[name].ready ? sheets[name].image : null;
  }
  function tidy() { for (const name of Object.keys(sheets)) if (!EVERYDAY.includes(name) && performance.now() - sheets[name].used > LET_GO) delete sheets[name]; }
  const scale = traits => STANDING_HEIGHT * traits.size / anchor.height;
  let shown = {key: '', name: 'idle', since: 0, leaving: false}, before = null;

  // Dry food is chewed and water or treat paste is licked, each from its own footage when there is some.
  const posed = (mode, meal) => mode === 'eat' ? mealClip(meal ?? 'kibble', has) : has(mode) ? mode : null;
  function pick(pet) {
    if (pet.mode === 'rise') { const name = posed(pet.rising, pet.meal); if (name) return {name, leaving: true}; }
    if (pet.mode === 'perform' && has(pet.act)) return {name: pet.act};
    if (pet.mode === 'run') return {name: has('run') ? 'run' : has('walk') ? 'walk' : 'idle'};
    if (pet.mode === 'walk' && has('walk')) return {name: 'walk'};
    if (HOLD_MODES.includes(pet.mode)) { const name = posed(pet.mode, pet.meal); if (name) return {name}; }
    return {name: 'idle'};
  }
  function paint(ctx, name, frame, k, alpha, facing) {
    let image = sheetOf(name);
    if (!image) { name = 'idle'; frame = 0; image = sheets.idle.image; } // still decoding: every clip starts from this pose
    const clip = clips[name];
    ctx.globalAlpha = alpha;
    ctx.save(); ctx.scale(facing * (anchor.facing ?? 1), 1);
    ctx.drawImage(image, (frame % clip.columns) * clip.cellWidth, Math.floor(frame / clip.columns) * clip.cellHeight, clip.cellWidth, clip.cellHeight,
      (clip.left - anchor.centre) * k, (clip.top - anchor.ground) * k, clip.cellWidth * k, clip.cellHeight * k);
    ctx.restore();
  }
  // Walking and running follow the brain's own clock and plan, so the feet stop exactly when the pet arrives.
  function frameOf(state, pet) {
    const kind = CLIPS[state.name].kind;
    const time = kind === 'cycle' && pet.plan ? pet.clock : pet.t - state.since;
    return frameFor(kind, clips[state.name], time, {leaving: state.leaving, loops: pet.plan?.loops ?? 0, pace: CLIPS[state.name].pace});
  }
  const cycle = name => has(name) && clips[name].loop ? cycleParts(clips[name]) : null;

  return {
    has,
    seconds: name => has(name) ? clipSeconds(CLIPS[name].kind, clips[name], CLIPS[name].pace) : 0,
    showing: () => shown.name, // the clip on screen, for checks
    loaded: () => Object.keys(sheets),
    guest: name => Boolean(has(name) && clips[name].guest), // the footage brings its own hand
    size(traits) { const k = scale(traits); return {width: anchor.width * k, height: anchor.height * k}; },
    // What the brain needs to know about the footage, in seconds and on-screen pixels.
    style(traits) {
      const leave = name => name ? leaveSeconds(CLIPS[name].kind, clips[name], CLIPS[name].pace) : undefined;
      // How far in front of its centre, and how high off the ground, the mouth is in a clip.
      const reach = name => name && clips[name].mouth ? Math.max(10, (clips[name].mouth.x - anchor.centre) * scale(traits)) : undefined;
      const lift = name => name && clips[name].mouth ? Math.max(0, (anchor.ground - clips[name].mouth.y) * scale(traits)) : undefined;
      const meals = ['kibble', 'water', 'treat'];
      // How far the animal reaches in front of and behind its centre, over all the frames of these clips.
      const right = (anchor.facing ?? 1) > 0;
      const extent = names => { const list = names.filter(has).map(name => clips[name]), k = scale(traits);
        // (Each cell has a margin of about 12 pixels round the animal for wisps of fur; the solid body ends inside it.)
        const east = Math.max(...list.map(clip => clip.left + clip.cellWidth - MARGIN - anchor.centre)) * k, west = Math.max(...list.map(clip => anchor.centre - clip.left - MARGIN)) * k;
        return right ? {ahead: east, behind: west} : {ahead: west, behind: east}; };
      // A hand that reaches into a clip is not part of the animal, so such a clip is measured as if it were standing.
      const roomOf = name => extent(clips[name].guest ? ['idle'] : [name, 'idle']);
      return {
        jump: has('jump') ? clipSeconds('once', clips.jump) : 0,
        // Rituals there is footage for, and how long each lasts.
        acts: Object.fromEntries(ACTS.filter(has).map(name => [name, clipSeconds(CLIPS[name].kind, clips[name], CLIPS[name].pace)])),
        // How far ahead of its centre the paws are when it stands up against a wall, so they land on the side of the screen.
        front: has('scratch') ? roomOf('scratch').ahead : undefined,
        // The room its body takes up, so that it stops at the sides of the screen instead of walking half out of it,
        // and the room it takes while doing each thing: a stretch reaches much further forward than the animal stands.
        body: roomOf('idle'),
        room: {...Object.fromEntries(Object.keys(clips).filter(has).map(name => [name, roomOf(name)])), ...Object.fromEntries(meals.filter(kind => mealClip(kind, has)).map(kind => [kind, roomOf(mealClip(kind, has))]))},
        // Seconds to get back up, keyed by what the brain is leaving: a pose, or a kind of meal.
        out: {sit: leave(posed('sit')), loaf: leave(posed('loaf')), sleep: leave(posed('sleep')), ...Object.fromEntries(meals.map(kind => [kind, leave(mealClip(kind, has))]))},
        walk: cycle('walk'), run: cycle('run') ?? cycle('walk'),
        reach: Object.fromEntries(meals.map(kind => [kind, reach(mealClip(kind, has))])),
        lift: Object.fromEntries(meals.map(kind => [kind, lift(mealClip(kind, has))]))
      };
    },
    // Draws at the current origin: x is the animal's centre, y is the ground.
    draw(ctx, traits, pet) {
      const {name, leaving = false} = pick(pet);
      const key = `${name}/${leaving}/${pet.mode === 'perform' ? pet.acted : ''}`; // the same ritual twice running starts over
      if (key !== shown.key) {
        // Getting up continues the same footage, so it needs no fade; a different clip fades in as the last frame fades out.
        before = shown.name === name ? null : {name: shown.name, frame: frameOf(shown, pet), until: pet.t + CROSSFADE, facing: shown.facing ?? pet.facing};
        if (!has(before?.name)) before = null;
        shown = {key, name, since: pet.t, leaving, facing: pet.facing};
      } else if (pet.facing !== shown.facing) {
        // Turning round: there is no footage of it, so the way it faced fades out rather than the picture flipping at once.
        before = {name, frame: frameOf(shown, pet), until: pet.t + CROSSFADE, facing: shown.facing};
        shown.facing = pet.facing;
      }
      const k = scale(traits);
      tidy();
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      const fade = before && pet.t < before.until ? (before.until - pet.t) / CROSSFADE : 0;
      if (fade > 0) paint(ctx, before.name, before.frame, k, fade, before.facing);
      paint(ctx, name, frameOf(shown, pet), k, 1 - fade * fade, pet.facing);
      const kind = CLIPS[name].kind, time = kind === 'cycle' && pet.plan ? pet.clock : pet.t - shown.since;
      const over = seamBlend(kind, clips[name], time, {leaving, loops: pet.plan?.loops ?? 0});
      if (over) paint(ctx, name, over.frame, k, over.weight * (1 - fade), pet.facing);
      const next = between(kind, clips[name], time, CLIPS[name].pace);
      if (next) paint(ctx, name, next.frame, k, next.weight * (1 - fade), pet.facing);
      ctx.restore();
    }
  };
}
