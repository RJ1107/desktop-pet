// Turns one generated clip into a sprite sheet of cut-out frames, and measures how to play it. Runs in the settings window.
import {keyOut, union, sheetLayout, findMouth} from '../shared/matte.js';
import {activeRange, bestLoop, calmest} from '../shared/realistic.js';

const bytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0));
async function toBase64(blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Reads frames at `fps` from the clip. Files with a known length are stepped through exactly;
// streams without one (as recorders produce) are sampled while they play.
async function readFrames(video, context, width, height, fps) {
  const frames = [];
  const grab = () => { context.drawImage(video, 0, 0, width, height); frames.push(context.getImageData(0, 0, width, height)); };
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const count = Math.max(1, Math.floor(video.duration * fps));
    for (let i = 0; i < count; i++) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = () => reject(new Error('The clip could not be read.')); video.currentTime = Math.min(video.duration - 0.001, (i + 0.5) / fps); });
      grab();
    }
    return frames;
  }
  await new Promise((resolve, reject) => {
    let next = 0;
    const timer = setInterval(() => { if (video.currentTime >= next) { grab(); next = frames.length / fps; } }, 1000 / (fps * 3));
    video.onended = () => { clearInterval(timer); resolve(); };
    video.onerror = () => { clearInterval(timer); reject(new Error('The clip could not be read.')); };
    video.play().catch(error => { clearInterval(timer); reject(error); });
  });
  return frames;
}

// A coarse picture of a cut-out frame, for telling how alike two frames are: brightness where the animal is, white elsewhere.
function thumbnail(frame, width, height, columns = 64) {
  const step = width / columns, rows = Math.round(height / step), out = new Uint8Array(columns * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const i = (Math.min(height - 1, Math.floor((r + 0.5) * step)) * width + Math.min(width - 1, Math.floor((c + 0.5) * step))) * 4;
    out[r * columns + c] = frame.data[i + 3] > 127 ? (frame.data[i] * 3 + frame.data[i + 1] * 6 + frame.data[i + 2]) / 10 * 0.7 : 255;
  }
  return out;
}
const apart = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; };

// Returns {webp, layout, first}: the sheet as base64 WebP, how its frames are laid out and should be played,
// and the box around the animal in the first frame.
export async function buildSheet(base64Video, {fps = 24, maxWidth = 512} = {}) {
  const url = URL.createObjectURL(new Blob([bytes(base64Video)]));
  const video = Object.assign(document.createElement('video'), {muted: true, playsInline: true, preload: 'auto', src: url});
  try {
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('The clip could not be opened.')); });
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale);
    const canvas = Object.assign(document.createElement('canvas'), {width, height});
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const frames = await readFrames(video, context, width, height, fps);
    const boxes = frames.map(frame => keyOut(frame.data, width, height));
    const all = union(boxes);
    if (!all) throw new Error('Only background was found in this clip.');

    // Where the action is, and where a repeat can join up without a visible jump.
    const thumbs = frames.map(frame => thumbnail(frame, width, height));
    const differ = (i, j) => apart(thumbs[i], thumbs[j]);
    const motion = thumbs.map(thumb => apart(thumb, thumbs[0]));
    const steps = thumbs.slice(1).map((_, i) => differ(i, i + 1)).sort((a, b) => a - b);
    const usualStep = steps[steps.length >> 1] || 1; // how much one ordinary frame differs from the next
    const hold = activeRange(motion, 0.8), active = activeRange(motion, 0.45);
    // A dark animal on the spot can differ so little from its standing pose that no active stretch stands out; then search the whole clip.
    const found = bestLoop(differ, active[0], active[1], Math.round(fps * 0.6)) ?? bestLoop(differ, Math.round(fps * 0.3), frames.length - 1 - Math.round(fps * 0.3), Math.round(fps * 0.6));
    // Inside the held pose: the stillest half second (for sitting and sleeping) and one matched lick or bite (for eating).
    const still = calmest(differ, hold[0], hold[1], Math.round(fps * 0.5));
    // The frame a held pose stops on: in the second half of that calm moment (paws long settled, head come up), the
    // one with the eyes most open, the later one on a tie. Eyes are counted as bright, coloured pixels in the front of
    // the head: a dark coat makes them stand out; on a light coat this only picks among nearly identical calm frames.
    const eyesOpen = index => {
      const box = boxes[index];
      if (!box) return 0;
      const data = frames[index].data, from = Math.round(box.left + (box.right - box.left) * 0.55);
      let count = 0;
      for (let y = box.top; y < box.top + (box.bottom - box.top) * 0.45; y++) for (let x = from; x < box.right; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        const high = Math.max(data[i], data[i + 1], data[i + 2]), low = Math.min(data[i], data[i + 1], data[i + 2]);
        if (high > 110 && high - low > 50) count++;
      }
      return count;
    };
    let awake = still[1], widest = -1;
    for (let index = Math.ceil((still[0] + still[1]) / 2); index <= still[1]; index++) { const open = eyesOpen(index); if (open >= widest) { widest = open; awake = index; } }
    const lick = bestLoop(differ, hold[0], hold[1], Math.round(fps * 0.3));
    // Where the mouth is over the frames that get repeated at a meal: the median of what each frame shows.
    const base = boxes[0] ?? all, standing = {ground: base.bottom, tall: base.bottom - base.top, centre: (base.left + base.right) / 2};
    const [chewFrom, chewTo] = lick?.loop ?? hold;
    const seen = frames.slice(chewFrom, chewTo + 1).map(frame => findMouth(frame.data, width, height, standing)).filter(Boolean);
    const tongues = seen.filter(point => point.by === 'tongue'), points = tongues.length >= 3 ? tongues : seen;
    const middleOf = values => values.sort((a, b) => a - b)[values.length >> 1];
    const mouth = points.length ? {x: Math.round(middleOf(points.map(p => p.x))), y: Math.round(middleOf(points.map(p => p.y))), by: points[0].by} : null;

    // The box hugs the solid body; leave room around it for wisps of fur, whiskers and the shadow under the paws.
    const room = 12;
    const box = {left: Math.max(0, all.left - room), top: Math.max(0, all.top - room), right: Math.min(width, all.right + room), bottom: Math.min(height, all.bottom + room)};
    // An arm that fades out towards the edge of the frame is faint there, and must not be cut off where it turns faint.
    const sides = boxes.map(box => box?.guest).filter(Boolean);
    if (sides.some(side => side !== 'right')) box.left = 0;
    if (sides.some(side => side !== 'left')) box.right = width;
    const cellWidth = box.right - box.left, cellHeight = box.bottom - box.top;
    const grid = sheetLayout(frames.length, cellWidth, cellHeight);
    const sheet = Object.assign(document.createElement('canvas'), {width: grid.width, height: grid.height});
    const paint = sheet.getContext('2d');
    frames.forEach((frame, index) => {
      context.putImageData(frame, 0, 0);
      const cell = grid.cell(index);
      paint.drawImage(canvas, box.left, box.top, cellWidth, cellHeight, cell.x, cell.y, cellWidth, cellHeight);
    });
    const blob = await new Promise(resolve => sheet.toBlob(resolve, 'image/webp', 0.9));
    return {
      webp: await toBase64(blob), first: boxes[0],
      layout: {
        frames: frames.length, fps, columns: grid.columns, cellWidth, cellHeight, left: box.left, top: box.top, sourceWidth: width, sourceHeight: height,
        hold, still, awake, chew: lick?.loop ?? hold, chewJump: lick ? Math.round(lick.jump / usualStep * 100) / 100 : null, loop: found?.loop ?? null,
        // 1 means the repeat joins as smoothly as any two neighbouring frames; larger means a visible jump.
        loopJump: found ? Math.round(found.jump / usualStep * 100) / 100 : null,
        mouth,
        guest: sides.length > 0 // a hand reaches into this clip
      }
    };
  } finally { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); }
}
