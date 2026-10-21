// Turns green-screen frames into cut-outs. Pure functions over RGBA pixel arrays, so they run in a page or in a test.

// How much greener a pixel is than it is red or blue. A lit green screen scores high whether it is bright,
// dim or in shadow, which plain colour distance does not manage; fur and skin score near zero.
const excess = (data, i) => data[i + 1] - Math.max(data[i], data[i + 2]);

// Encoded video often has a line or two of black along its edges. Those rows are neither screen nor animal:
// measuring starts just inside them, and they are always cleared.
export const edgeInset = (width, height) => Math.max(2, Math.round(Math.min(width, height) * 0.012));

// The screen's own score, measured just inside the frame's edge. A low percentile is used so that the dimmer parts
// of an unevenly lit screen still count as screen.
export function screenExcess(data, width, height, inset = edgeInset(width, height)) {
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  for (let x = inset; x < width - inset; x += step) samples.push(excess(data, (inset * width + x) * 4), excess(data, ((height - 1 - inset) * width + x) * 4));
  for (let y = inset; y < height - inset; y += step) samples.push(excess(data, (y * width + inset) * 4), excess(data, (y * width + width - 1 - inset) * 4));
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length * 0.2)];
}

// Makes the background transparent, in place. Opacity follows how much screen colour is mixed into each pixel,
// so wisps of fur stay soft and the shadow under the paws stays as a faint shadow. Only screen-coloured pixels
// connected to the frame's edge are touched, so green eyes inside the animal survive. What remains loses its green cast.
// Returns the box around what is left: {left, top, right, bottom} (right and bottom exclusive), or null if nothing is.
export function keyOut(data, width, height) {
  const screen = screenExcess(data, width, height);
  if (screen < 25) return boxOf(data, width, height); // not a green screen: leave the frame alone rather than guess
  const floor = 10, full = Math.max(floor + 10, screen * 0.7);
  // 0 for the animal, 1 for pure screen.
  const amount = i => { const e = excess(data, i); return e <= floor ? 0 : e >= full ? 1 : (e - floor) / (full - floor); };
  const total = width * height;
  const seen = new Uint8Array(total), queue = new Int32Array(total);
  let head = 0, tail = 0;
  const visit = p => { if (!seen[p] && amount(p * 4) > 0) { seen[p] = 1; queue[tail++] = p; } };
  const inset = edgeInset(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x < inset || y < inset || x >= width - inset || y >= height - inset) { seen[y * width + x] = 1; data[(y * width + x) * 4 + 3] = 0; }
  }
  for (let x = inset; x < width - inset; x++) { visit(inset * width + x); visit((height - 1 - inset) * width + x); }
  for (let y = inset; y < height - inset; y++) { visit(y * width + inset); visit(y * width + width - 1 - inset); }
  while (head < tail) {
    const p = queue[head++], x = p % width, i = p * 4, screenShare = amount(i);
    const alpha = 1 - screenShare;
    data[i + 3] = alpha < 0.12 ? 0 : Math.round(data[i + 3] * alpha); // drop the faint haze an uneven screen would leave
    if (alpha > 0) { const limit = Math.max(data[i], data[i + 2]); if (data[i + 1] > limit) data[i + 1] = limit; }
    if (screenShare < 0.5) continue; // mostly animal: keep it soft, but do not spread through it into the body
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < total - width) visit(p + width);
  }
  // Screen showing through a gap the animal encloses, such as between a curled tail and the body, is not reachable
  // from the edge. It is unmistakably screen, though: stronger than any eye or grass-stained fur would be.
  for (let p = 0; p < total; p++) {
    if (seen[p]) continue;
    const e = excess(data, p * 4);
    if (e >= screen * 0.85) data[p * 4 + 3] = 0;
    // Half screen, half fur, deep in the coat: keep the pixel but take the green out, or it glints on a dark animal.
    else if (e >= screen * 0.5) data[p * 4 + 1] = Math.max(data[p * 4], data[p * 4 + 2]);
  }
  // The screen tints the fur next to it. Take the green cast off anything within two pixels of the outline;
  // deeper inside, colours are left alone so that green eyes stay green.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] === 0 || excess(data, i) <= 0) continue;
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[(ny * width + nx) * 4 + 3] < 128) { edge = true; break; }
    }
    if (edge) data[i + 1] = Math.max(data[i], data[i + 2]);
  }
  dropSpecks(data, width, height);
  const guest = fadeAtEdges(data, width, height);
  const box = boxOf(data, width, height);
  if (box && guest) box.guest = guest; // something besides the animal is in this frame, reaching in from 'left', 'right' or 'both'
  return box;
}

// Something that reaches in from outside the picture (a hand that comes to stroke the animal) would end in a hard
// straight cut at the frame's edge. Where solid pixels touch a side of the frame, everything near that side fades
// out towards it instead, so the arm trails off. Returns the side that was touched: 'left', 'right', 'both' or null.
export function fadeAtEdges(data, width, height, reach = Math.round(width * 0.16)) {
  const inset = edgeInset(width, height);
  const sides = [];
  for (const right of [false, true]) {
    const column = right ? width - 1 - inset : inset;
    let touching = 0;
    for (let y = inset; y < height - inset; y++) if (data[(y * width + column) * 4 + 3] >= 128) touching++;
    if (touching < 3) continue;
    sides.push(right ? 'right' : 'left');
    for (let y = 0; y < height; y++) for (let d = 0; d < reach; d++) {
      const i = (y * width + (right ? column - d : column + d)) * 4, t = d / reach;
      data[i + 3] = Math.round(data[i + 3] * t * t * (3 - 2 * t));
    }
  }
  return sides.length === 2 ? 'both' : sides[0] ?? null;
}

// Removes small solid islands that are not part of the animal: crumbs or droplets a video model invents on the floor,
// and stray patches of screen. Anything smaller than `share` of the largest solid shape goes.
export function dropSpecks(data, width, height, share = 0.02) {
  const total = width * height, label = new Int32Array(total), queue = new Int32Array(total), sizes = [0];
  for (let p = 0; p < total; p++) {
    if (label[p] || data[p * 4 + 3] < 128) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = p; label[p] = id;
    while (head < tail) {
      const q = queue[head++], x = q % width;
      for (const n of [x > 0 ? q - 1 : -1, x < width - 1 ? q + 1 : -1, q - width, q + width]) {
        if (n >= 0 && n < total && !label[n] && data[n * 4 + 3] >= 128) { label[n] = id; queue[tail++] = n; }
      }
    }
    sizes.push(tail);
  }
  const least = Math.max(...sizes) * share;
  for (let p = 0; p < total; p++) if (label[p] && sizes[label[p]] < least) data[p * 4 + 3] = 0;
  // Soft pixels that belonged to a removed speck have nothing solid beside them any more.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, alpha = data[p * 4 + 3];
    if (alpha === 0 || alpha >= 128) continue;
    let solid = false;
    for (let dy = -3; dy <= 3 && !solid; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && label[ny * width + nx] && sizes[label[ny * width + nx]] >= least) { solid = true; break; }
    }
    if (!solid) data[p * 4 + 3] = 0;
  }
}

// Where the mouth is while the animal eats or drinks from the ground, in a frame where it faces right.
// A visible tongue is the best evidence: the middle of the pink near the ground. Without one, the chin: the frontmost
// solid point that is almost touching the ground (higher up, the lowered forehead and ears reach further forward).
// `ground` is the row the paws stand on and `tall` the standing height, both in pixels. Returns {x, y, by} or null.
export function findMouth(data, width, height, {ground, tall, centre}) {
  let sumX = 0, sumY = 0, pink = 0;
  for (let y = Math.max(0, Math.round(ground - tall * 0.3)); y < Math.min(height, ground + 3); y++) for (let x = Math.round(centre); x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 135 && r - g > 40 && r - b > 12 && b > g - 10) { sumX += x; sumY += y; pink++; }
  }
  if (pink >= 8) return {x: sumX / pink, y: sumY / pink, by: 'tongue'};
  for (let x = width - 1; x >= Math.round(centre); x--) for (let y = Math.max(0, Math.round(ground - tall * 0.09)); y < Math.min(height, ground + 2); y++) {
    if (data[(y * width + x) * 4 + 3] >= 128) return {x: x - tall * 0.03, y: ground - tall * 0.03, by: 'chin'};
  }
  return null;
}

// The box around everything that is clearly there. Faint shadow does not stretch it.
function boxOf(data, width, height) {
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 128) continue;
    if (x < left) left = x; if (x >= right) right = x + 1;
    if (y < top) top = y; if (y >= bottom) bottom = y + 1;
  }
  return right > left ? {left, top, right, bottom} : null;
}

export function union(boxes) {
  const real = boxes.filter(Boolean);
  if (!real.length) return null;
  return {left: Math.min(...real.map(b => b.left)), top: Math.min(...real.map(b => b.top)), right: Math.max(...real.map(b => b.right)), bottom: Math.max(...real.map(b => b.bottom))};
}

// Where each frame goes on a sprite sheet: a grid of equal cells, close to square overall.
export function sheetLayout(frames, cellWidth, cellHeight) {
  const columns = Math.max(1, Math.min(frames, Math.round(Math.sqrt(frames * cellHeight / cellWidth))));
  const rows = Math.ceil(frames / columns);
  return {columns, rows, width: columns * cellWidth, height: rows * cellHeight, cell: index => ({x: (index % columns) * cellWidth, y: Math.floor(index / columns) * cellHeight})};
}
