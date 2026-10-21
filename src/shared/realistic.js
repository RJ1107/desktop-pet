// The realistic look: what to ask the image and video models for, and how each clip is played back.
// Every clip starts and ends on the same reference still, so whole clips follow one another without a jump.

export const CLIP_SECONDS = 4;
// Roughly what the default models charge, in US dollars, so the settings window can say what a click will cost.
export const COST = {reference: 0.05, clip: 0.12};

// How each clip is played:
// 'swing'  forward then backward, for ever (standing: no seam at all)
// 'once'   straight through
// 'cycle'  gets going, repeats a matched stretch of its middle as often as asked, then stops (walking, running)
// 'rest'   settles into a pose, then stays in the calmest moment of it with only slow breathing, until told to leave.
//          `pace.settle` changes the speed of settling in; with `pace.still` it settles straight into the calm frame
//          where its eyes are most open (clip.awake) and holds it, not moving at all (a loaf: tucked in once, done)
// 'graze'  lowers the head, then repeats one matched lick or bite, forwards, until told to leave
// 'linger' straight through, once, at a changing pace, slowest in the middle of its pose (rolling over, stretching).
//          `pace` gives the speeds: {ends, turn, pose}
export const CLIPS = {
  idle: {kind: 'swing', prompt: 'The {animal} stands in the same spot, breathing gently. It blinks, its ears twitch and its tail sways slowly.'},
  walk: {kind: 'cycle', prompt: 'The {animal} walks forward in place at a relaxed, steady pace, as if on a treadmill: its legs step in an even, repeating walk cycle while its body stays in the centre of the frame.'},
  jump: {kind: 'once', prompt: 'The {animal} crouches, jumps straight up into the air, lands softly on all four paws in exactly the same spot, and stands as before.'},
  sit: {kind: 'rest', prompt: 'The {animal} sits down on its haunches within the first second, then stays sitting almost perfectly still, only breathing, looking ahead. At the very end it stands back up.'},
  sleep: {kind: 'rest', prompt: 'The {animal} lies down and curls up within the first second, closes its eyes, then sleeps almost perfectly still, only its side rising and falling slowly as it breathes. At the very end it wakes and stands back up.'},
  loaf: {kind: 'rest', pace: {settle: 0.65, still: true}, prompt: 'The {animal} lies down on its belly within the first second, its front legs reaching forward under its chin. Then, in one single slow movement taking about a second, it bends both front paws inward at the wrist and tucks them under the front of its chest, just below its chin, so that the folded paws rest on the floor beneath its head: the "loaf" pose, its body compact like a loaf of bread, head up, eyes open, calm and relaxed. It tucks its paws only once and then does not move them again; it stays completely still. At the very end it stands back up exactly as before.'},
  eat: {kind: 'graze', prompt: 'The {animal} lowers its head straight down to the ground just in front of its front paws and eats dry food from the ground: it picks up a bite, lifts its muzzle slightly and chews, then goes down for the next bite, again and again in a steady rhythm. At the very end it raises its head and stands as before.'},
  drink: {kind: 'graze', prompt: 'The {animal} lowers its head straight down to the ground just in front of its front paws and laps with its tongue: the pink tongue darts out, touches the surface, and pulls back into the mouth, again and again in a quick, steady rhythm, clearly visible from the side. At the very end it raises its head and stands as before.'},
  run: {kind: 'cycle', prompt: 'The {animal} runs in place at a fast, steady gallop, as if on a treadmill: its legs stretch and gather in an even, repeating running cycle while its body stays in the centre of the frame.'},
  // Small rituals, each played once on the spot.
  stretch: {kind: 'linger', pace: {ends: 0.8, turn: 0.8, pose: 0.6}, prompt: 'The {animal} does a play-bow stretch. Its two hind legs, the back legs nearest its tail, stay standing straight and close together under its hips the whole time: they never step, never move, and are never stretched out backward. Only its two front legs, the legs under its chest nearest its head, move: they walk forward along the floor one after the other, left, right, left, right, until both front legs lie stretched out flat on the floor far in front of its face, side by side. Then its chest sinks down close to the floor while its rump stays high, its back forming a gentle curve, and it holds that long stretch. Then it walks its front legs back in and stands exactly as before.'},
  scratch: {kind: 'linger', pace: {ends: 0.8, turn: 0.8, pose: 0.6}, prompt: 'A tall vertical wall stands directly in front of the {animal}, almost touching its nose. The wall is painted exactly the same flat chroma-key green as the background and is lit the same way, so it cannot be seen: no edge, no shading, no shadow on it. Slowly and without hurry, the {animal} reaches up the wall: one front paw onto it, then the other a little higher, climbing paw over paw, while it steps its hind paws in until they are right at the foot of the wall. It ends up standing straight up on its hind legs with its chest and belly against the wall, its body vertical, both front paws side by side and parallel, high above its head. There it holds one long, deep stretch, up on its toes, its back curving slightly backward and its head tipped back. Then it slowly walks its paws back down the wall, steps back, lowers itself gently onto all four paws and stands exactly as before.'},
  groom: {kind: 'once', prompt: 'The {animal} sits down, lifts one front paw to its mouth and licks it, then rubs that paw over its face and ear; it licks and rubs again a few times, washing itself. Then it stands back up exactly as before.'},
  mew: {kind: 'once', prompt: 'The {animal} stays standing, glances toward the camera and gives two short, soft mews: its mouth opens only a little each time, barely showing its teeth, its face relaxed. Then it looks ahead again and stands exactly as before.'},
  meow: {kind: 'once', prompt: 'The {animal} stays standing, turns its head toward the camera and calls out twice, its mouth opening wide each time so the teeth and pink tongue show, ears forward. Then it turns its head back and stands exactly as before.'},
  yawn: {kind: 'once', prompt: 'The {animal} stays standing and gives one huge, slow yawn: the mouth opens very wide, the tongue curls, the eyes squeeze shut and the ears tip back. Then it closes its mouth, licks its lips once, blinks and stands exactly as before.'},
  roll: {kind: 'linger', prompt: 'The {animal} flops down onto its side and rolls onto its back, showing its belly with its paws in the air, and wriggles happily from side to side for a moment. Then it rolls back over and stands up exactly as before.'},
  nuzzle: {kind: 'once', prompt: 'A human hand reaches in from the edge of the frame that the {animal} is facing, at the height of its head, and stays just in front of its face. The {animal} stays standing, lifts its head and pushes its forehead and cheek against the hand, rubbing against it affectionately back and forth several times with half-closed eyes, leaning into it, tail raised. Then the hand withdraws out of the frame and the {animal} stands exactly as before. The hand and forearm are the only thing in the picture besides the {animal}.'},
  play: {kind: 'once', prompt: 'The {animal} spots something in the air just in front of its face, sits back on its haunches and bats at it playfully with one front paw and then the other, several quick swipes, eyes wide. Then it puts its paws down and stands exactly as before.'}
};
export const CLIP_NAMES = Object.keys(CLIPS);
// The rituals above: footage the pet plays once where it stands, whenever the moment suits.
export const ACTS = ['stretch', 'scratch', 'groom', 'mew', 'meow', 'yawn', 'roll', 'nuzzle', 'play'];
// What the look cannot do without: the realistic pet can be switched on once these are cut.
export const CORE_CLIPS = ['idle', 'walk'];
// Brain modes whose footage has a way in and a way out.
export const HOLD_MODES = ['sit', 'loaf', 'sleep', 'eat'];
// Which clip shows the pet at a meal: dry food is chewed, water and treat paste are licked.
export const mealClip = (kind, has) => {
  const wanted = kind === 'kibble' ? ['eat', 'drink'] : ['drink', 'eat'];
  return wanted.find(has) ?? null;
};

const STAGE = 'The camera is locked off: no camera movement, no zoom, no cuts. Side view. The background stays a flat, uniform, pure green chroma-key screen (#00FF00) with no floor line, no shadows and no other objects. The animal stays the same size and entirely inside the frame. Photorealistic, natural motion, detailed fur. The final frame matches the first frame.';

export const clipPrompt = (name, species) => `${CLIPS[name].prompt.replaceAll('{animal}', species)} ${STAGE}`;

// `portrait` is the owner's own account of the animal (breed, sex, weight, colour), as written by breeds.js.
export function referencePrompt({species, description = '', photos = 0, portrait = ''}) {
  const who = photos
    ? `Create a photorealistic full-body photograph of this exact ${species}: the same animal as in the reference photo${photos > 1 ? 's' : ''}, with the same coat colours, coat length, markings, face, eye colour and proportions. Match how dark its coat is: a black or very dark coat must stay just as dark, not lightened or turned brown by the lighting.${portrait ? ` The owner says it is ${portrait}. Where that and the photos differ, follow the photos.` : ''}`
    : portrait ? `Create a photorealistic full-body photograph of ${portrait}. Its build should suit that weight.` : `Create a photorealistic full-body photograph of a pet ${species}.`;
  return [
    who,
    description.trim() ? `The owner describes it like this, and these details must be clearly visible: "${description.trim()}".` : '',
    `The ${species} stands on all four legs in a relaxed, natural pose, seen exactly from the side and facing right, head turned slightly toward the camera.`,
    'Its whole body, tail and paws are inside the frame. It is centred horizontally and stands in the lower half of the picture, filling about a third of the width, with plenty of empty space above it and at both sides.',
    'Background: one flat, uniform, pure green chroma-key screen (#00FF00) filling the entire frame. No floor line, no shadow under the animal, no props, no text.',
    'Soft, even studio lighting. Sharp focus, with individual strands of fur visible.'
  ].filter(Boolean).join('\n');
}

// Generated footage never puts the action in the same place twice, so the parts worth repeating are measured, not assumed.
// `motion` holds, per frame, how far the picture is from the first frame (0 = the standing pose). Returns the longest
// run of frames around the peak that stays above `share` of it, as [first, last].
export function activeRange(motion, share) {
  const peak = Math.max(...motion);
  if (!(peak > 0)) return [0, motion.length - 1];
  let first = motion.indexOf(peak), last = first;
  while (first > 0 && motion[first - 1] >= peak * share) first--;
  while (last < motion.length - 1 && motion[last + 1] >= peak * share) last++;
  return [first, last];
}

// Finds the two frames inside [from, to] that look most alike, at least `least` frames apart, so that jumping from
// the later one back to the earlier one is invisible. The frames that follow each must match too, or the pose would
// agree while the legs were moving opposite ways. `differ(i, j)` returns how different two frames look.
// Returns {loop: [a, b], jump} where jump is the size of the seam, or null if the range is too short.
export function bestLoop(differ, from, to, least) {
  let best = null;
  for (let a = from; a + least <= to - 1; a++) for (let b = a + least; b <= to - 1; b++) {
    const jump = (differ(a, b) + differ(a + 1, b + 1)) / 2;
    if (!best || jump < best.jump) best = {loop: [a, b], jump};
  }
  return best;
}

// Finds the stillest stretch of `length` frames inside [from, to]: the moment after the animal has finished settling
// and before it starts to get up. Returns [first, last].
export function calmest(differ, from, to, length) {
  const span = Math.min(length, to - from);
  let best = null;
  for (let start = from; start + span <= to; start++) {
    let change = 0;
    for (let i = start; i < start + span; i++) change += differ(i, i + 1);
    if (!best || change < best.change) best = {change, range: [start, start + span]};
  }
  return best ? best.range : [from, to];
}

// A cycle clip in seconds: getting going, one repeat of the matched stretch, and coming to a stop.
export function cycleParts(clip) {
  const last = clip.frames - 1;
  const [a, b] = clip.loop ?? [Math.floor(last * 0.3), Math.floor(last * 0.7)];
  return {a, b, in: a / clip.fps, loop: (b - a) / clip.fps, out: (last - b) / clip.fps};
}

// A 'linger' clip is played once at a changing pace. For a roll, the way a cat really rolls over: slowly while it
// lowers itself and its paws take its weight (ends), quickly through the turn, very slowly while it lies there (pose),
// and the same on the way back up. Returns the stretches as [up to this frame, speed].
const ROLL_PACE = {ends: 0.65, turn: 1.25, pose: 0.65};
function paces(clip, pace = ROLL_PACE) {
  const last = clip.frames - 1, [start, end] = clip.hold ?? [Math.floor(last * 0.35), Math.floor(last * 0.7)], quarter = Math.floor((end - start) / 4);
  return [[start, pace.ends], [start + quarter, pace.turn], [end - quarter, pace.pose], [end, pace.turn], [last, pace.ends]];
}
// Where in such a clip a moment falls: the frame number with a fraction, and the speed there.
function paced(clip, time, pace) {
  let frame = 0, left = time * clip.fps;
  for (const [until, speed] of paces(clip, pace)) {
    const needs = (until - frame) / speed;
    if (left < needs) return {at: frame + left * speed, speed, inPose: until === paces(clip, pace)[2][0]};
    left -= needs; frame = until;
  }
  return {at: clip.frames - 1, speed: 1, inPose: false};
}
// Slowed footage shows fewer new pictures a second, so in the slow middle of the pose the next frame is laid over the
// current one by the fraction reached. (Not elsewhere: where the animal moves a lot between frames, two at once look
// doubled.) Returns {frame, weight} or null.
export function between(kind, clip, time, pace) {
  if (kind !== 'linger') return null;
  const {at, speed, inPose} = paced(clip, time, pace), frame = Math.floor(at);
  return inPose && speed < 1 && frame < clip.frames - 1 && at > frame ? {frame: frame + 1, weight: at - frame} : null;
}
// How long a clip takes when played once, start to finish.
export const clipSeconds = (kind, clip, pace) => kind !== 'linger' ? clip.frames / clip.fps
  : paces(clip, pace).reduce(([from, sum], [until, speed]) => [until, sum + (until - from) / speed], [0, 0])[1] / clip.fps;

const REST_SLOWDOWN = 3; // a resting animal breathes far slower than the footage's few seconds allow

// Which frame of a clip shows a given moment. `clip` is the stored layout; `time` is seconds since the clip began;
// `leaving` is true while a rest or graze clip is being left; `loops` is how many times a cycle repeats its middle.
export function frameFor(kind, clip, time, {leaving = false, loops = 0, pace} = {}) {
  const last = clip.frames - 1, at = Math.floor(time * clip.fps);
  const clamp = frame => Math.max(0, Math.min(last, frame));
  if (kind === 'swing') { const step = at % (last * 2); return step <= last ? step : last * 2 - step; }
  if (kind === 'once') return clamp(at);
  if (kind === 'linger') return Math.floor(paced(clip, time, pace).at);
  if (kind === 'rest') {
    const [start, end] = clip.still ?? [Math.floor(last * 0.45), Math.floor(last * 0.6)];
    const settle = pace?.settle ?? 1, moment = time * clip.fps, held = pace?.still ? clip.awake ?? end : null;
    // Held still: settling in carries on up to the held frame, and getting up carries on from it.
    if (held !== null) return leaving ? clamp(held + at) : Math.min(held, Math.floor(moment * settle));
    if (leaving) return clamp(end + at);
    const arrives = start / settle;
    if (moment < arrives) return Math.floor(moment * settle);
    // Stay inside the still stretch, drifting slowly up and back so the chest rises and falls and nothing else happens.
    const span = Math.max(1, end - start), swing = Math.floor((moment - arrives) / REST_SLOWDOWN) % (span * 2);
    return start + (swing < span ? swing : span * 2 - swing);
  }
  if (kind === 'graze') {
    const [start, end] = clip.chew ?? [Math.floor(last * 0.35), Math.floor(last * 0.6)];
    if (leaving) return clamp(end + at);
    return at < start ? at : start + (at - start) % Math.max(1, end - start); // the same lick or bite, forwards each time
  }
  const {a, b} = cycleParts(clip), span = b - a;
  if (at < a) return at;
  const repeated = at - a;
  return repeated < loops * span ? a + repeated % span : clamp(b + repeated - loops * span);
}

// Just before a repeated stretch wraps round, the frames that led into it are laid over the picture, growing stronger,
// so the motion carries across the seam instead of snapping. Returns {frame, weight} or null.
const BLEND = 3;
export function seamBlend(kind, clip, time, {leaving = false, loops = 0} = {}) {
  if (leaving || (kind !== 'graze' && kind !== 'cycle')) return null;
  const at = Math.floor(time * clip.fps);
  const [start, end] = kind === 'graze' ? clip.chew ?? [0, 0] : [cycleParts(clip).a, cycleParts(clip).b];
  const span = end - start;
  if (span <= BLEND || at < start || (kind === 'cycle' && at - start >= loops * span)) return null;
  const left = span - (at - start) % span; // frames until the wrap
  return left <= BLEND && start - left >= 0 ? {frame: start - left, weight: 1 - left / (BLEND + 1)} : null;
}

// How long leaving a rest or graze clip takes, in seconds: from the end of its repeated part to the last frame.
export function leaveSeconds(kind, clip, pace) {
  const last = clip.frames - 1;
  const end = kind === 'rest' && pace?.still && clip.awake !== undefined ? clip.awake : (kind === 'rest' ? clip.still : clip.chew)?.[1] ?? Math.floor(last * 0.6);
  return (last - end) / clip.fps;
}
