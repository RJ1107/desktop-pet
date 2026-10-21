// Draws the pet from its traits and a pose. Origin is the point on the ground between the paws; up is negative y.
// Nothing here knows about time or behaviour: the same traits and pose always give the same picture.
import {parseHex, mix} from '../../shared/traits.js';

const css = colour => `rgb(${colour.map(v => Math.round(v)).join(',')})`;
const shade = (hex, amount) => css(mix(parseHex(hex), amount < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(amount)));
const lerp = (a, b, t) => a + (b - a) * t;

export const restPose = () => ({facing: 1, gait: 0, stride: 0, reach: 0, sit: 0, lie: 0, head: 0, tilt: 0, squash: 1, blink: 0, eyes: 'open', mouth: 0, tongue: 0, tail: 0, ear: 0, breathe: 0});

// Size of the drawing in pixels at scale 1, used for hit testing and for placing bubbles.
export function bounds(traits) {
  const dog = traits.species === 'dog';
  return {width: (dog ? 150 : 132) * traits.size, height: (dog ? 112 : 100) * traits.size};
}

function blob(ctx, x, y, rx, ry, rotation = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); }
function paint(ctx, fill, outline) { ctx.fillStyle = fill; ctx.fill(); if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = 1.6; ctx.stroke(); } }
// Small deterministic generator so a pet's spots stay where they are from frame to frame.
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function drawPet(ctx, traits, pose) {
  const dog = traits.species === 'dog';
  const fluff = traits.fluff * 4;
  const rx = (dog ? 38 : 34) + fluff, ry = (dog ? 23 : 21) + fluff * 0.7, legLength = dog ? 26 : 22, headRadius = (dog ? 19 : 20) + fluff * 0.6;
  const coat = traits.base, marks = traits.secondary, belly = traits.belly;
  const outline = shade(coat, -0.45);
  const socks = traits.pattern === 'bicolor' || traits.pattern === 'tuxedo';
  const pointed = traits.pattern === 'points';
  const legColour = pointed ? marks : coat;

  ctx.save();
  ctx.scale(traits.size * pose.facing * pose.squash, traits.size / pose.squash);
  ctx.rotate(pose.tilt * pose.facing);
  ctx.lineJoin = ctx.lineCap = 'round';

  // Lying lowers the whole body onto the ground; sitting drops the rear and raises the chest.
  const breath = Math.sin(pose.breathe) * 0.8;
  const cy = -(legLength + ry - 4) + pose.lie * (legLength - 5);
  const angle = -0.5 * pose.sit;
  const pivot = {x: -rx * 0.55, y: cy + ry * 0.6 + pose.sit * (legLength - 6)};
  const place = (x, y) => {
    const dx = x - pivot.x, dy = y + pose.sit * (legLength - 6) - pivot.y;
    return {x: pivot.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: pivot.y + dx * Math.sin(angle) + dy * Math.cos(angle)};
  };

  // Tail, behind everything.
  const root = place(-rx * 0.9, cy - ry * 0.15);
  const wag = pose.tail, low = pose.lie;
  ctx.beginPath(); ctx.moveTo(root.x, root.y);
  if (traits.tail === 'short') ctx.lineTo(root.x - 11, root.y - 7 + wag * 3);
  else if (traits.tail === 'curled') ctx.bezierCurveTo(root.x - 17, root.y - 10, root.x - 15 + wag * 3, root.y - 33, root.x + 3 + wag * 5, root.y - 27);
  else ctx.bezierCurveTo(root.x - 20, root.y - lerp(6, -6, low), root.x - 27 + wag * 6, root.y - lerp(34, -2, low), root.x - 13 + wag * 12, root.y - lerp(45, 3, low));
  const tailWidth = (traits.tail === 'fluffy' ? 15 : 8.5) + fluff;
  ctx.strokeStyle = outline; ctx.lineWidth = tailWidth + 3; ctx.stroke();
  ctx.strokeStyle = pointed ? marks : coat; ctx.lineWidth = tailWidth; ctx.stroke();
  if (traits.pattern === 'tabby' && traits.tail !== 'short') { ctx.setLineDash([3, 9]); ctx.strokeStyle = marks; ctx.stroke(); ctx.setLineDash([]); }

  // Legs. Far legs are drawn first and darker; each swings from its hip and reaches the ground when standing.
  const hips = {front: place(rx * 0.55, cy + ry * 0.45), back: place(-rx * 0.55, cy + ry * 0.45)};
  function leg(which, phase, far) {
    const hip = hips[which];
    const x = hip.x + (far ? 5 : 0);
    const colour = far ? shade(legColour, -0.2) : legColour;
    if (pose.lie > 0.6) { // tucked under: only a paw shows
      blob(ctx, x + (which === 'front' ? 9 : -4), -4, 9, 5); paint(ctx, socks ? belly : colour, outline); return;
    }
    if (which === 'back' && pose.sit > 0.5) { // folded haunch
      if (!far) { blob(ctx, hip.x + 4, -12, 15, 13); paint(ctx, coat, outline); }
      blob(ctx, hip.x + 15, -4, 9, 5); paint(ctx, socks ? belly : colour, outline); return;
    }
    const swing = Math.sin(pose.gait + phase) * 0.62 * pose.stride + (which === 'front' ? 0.75 : -0.75) * pose.reach;
    const length = -hip.y * (1 - 0.2 * pose.stride * Math.max(0, Math.cos(pose.gait + phase))) * (1 - 0.15 * pose.reach);
    const foot = {x: x + Math.sin(swing) * length, y: hip.y + Math.cos(swing) * length};
    ctx.beginPath(); ctx.moveTo(x, hip.y); ctx.lineTo(foot.x, foot.y - 4);
    ctx.strokeStyle = outline; ctx.lineWidth = 13; ctx.stroke();
    ctx.strokeStyle = colour; ctx.lineWidth = 10; ctx.stroke();
    blob(ctx, foot.x + 2, foot.y - 4, 7.5, 4.5); paint(ctx, socks ? belly : colour, outline);
  }
  leg('back', 0, true); leg('front', Math.PI, true);

  // Body, with its markings clipped inside it.
  ctx.save();
  ctx.translate(pivot.x, pivot.y); ctx.rotate(angle); ctx.translate(-pivot.x, -pivot.y + pose.sit * (legLength - 6));
  blob(ctx, 0, cy, rx, ry + breath); paint(ctx, coat, outline);
  ctx.save(); ctx.clip();
  blob(ctx, 5, cy + ry * 0.72, rx * 0.8, ry * 0.5); ctx.fillStyle = belly; ctx.globalAlpha = socks ? 1 : 0.55; ctx.fill(); ctx.globalAlpha = 1;
  if (socks) { blob(ctx, rx * 0.72, cy + 4, rx * 0.42, ry * 0.95); ctx.fillStyle = belly; ctx.fill(); }
  if (traits.pattern === 'tabby') {
    ctx.strokeStyle = marks; ctx.lineWidth = 4.5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * rx * 0.3 - 4, cy - ry - 2); ctx.quadraticCurveTo(i * rx * 0.3 + 5, cy - ry * 0.4, i * rx * 0.3 - 2, cy + 1); ctx.stroke(); }
  }
  if (traits.pattern === 'spots') {
    const random = seeded(parseHex(coat).reduce((a, b) => a + b, 7));
    ctx.fillStyle = marks;
    for (let i = 0; i < 7; i++) { blob(ctx, (random() * 2 - 1) * rx * 0.75, cy + (random() * 1.5 - 1) * ry * 0.7, 4 + random() * 7, 3.5 + random() * 5, random() * 3); ctx.fill(); }
  }
  ctx.restore(); ctx.restore();

  leg('back', Math.PI, false); leg('front', 0, false);

  // Head. It dips toward the ground to eat or drink, and rests low when lying down.
  const shoulder = place(rx * 0.72, cy - ry * 0.55);
  const head = {
    x: lerp(shoulder.x + 9, shoulder.x + 17, pose.head) + pose.lie * 4,
    y: lerp(lerp(shoulder.y - 11, -headRadius * 0.9, pose.head), -headRadius * 0.82, pose.lie * 0.85)
  };
  ctx.beginPath(); ctx.moveTo(shoulder.x - 4, shoulder.y + 8); ctx.lineTo(head.x - 3, head.y + 3);
  ctx.strokeStyle = outline; ctx.lineWidth = 25; ctx.stroke(); ctx.strokeStyle = coat; ctx.lineWidth = 22; ctx.stroke();

  ctx.translate(head.x, head.y);
  ctx.rotate(pose.head * 0.35);
  const r = headRadius;
  for (const side of [-1, 1]) { // ears
    ctx.save(); ctx.scale(side, 1); ctx.rotate(pose.ear * 0.12 * side);
    const earColour = pointed ? marks : coat;
    if (traits.ears === 'floppy') {
      blob(ctx, r * 0.86, -r * 0.1, r * 0.36, r * 0.72, 0.25); paint(ctx, shade(earColour, -0.12), outline);
    } else {
      const tip = traits.ears === 'folded' ? [r * 0.78, -r * 1.0] : [r * 0.88, -r * 1.48];
      ctx.beginPath(); ctx.moveTo(r * 0.28, -r * 0.82); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(r * 0.96, -r * 0.34); ctx.closePath(); paint(ctx, earColour, outline);
      if (traits.tufts > 0.05) { // wisps of long hair off the ear tip
        ctx.strokeStyle = shade(earColour, 0.55); ctx.lineWidth = 1.3;
        for (const lean of [-0.5, -0.15, 0.2, 0.55]) { ctx.beginPath(); ctx.moveTo(tip[0] - 1, tip[1] + 2); ctx.quadraticCurveTo(tip[0] + lean * r * 0.3, tip[1] - r * 0.3 * traits.tufts, tip[0] + lean * r * 0.75 * traits.tufts, tip[1] - r * (0.35 + 0.55 * traits.tufts)); ctx.stroke(); }
      }
      if (traits.ears === 'pointed') { ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.84); ctx.lineTo(r * 0.82, -r * 1.24); ctx.lineTo(r * 0.86, -r * 0.6); ctx.closePath(); ctx.fillStyle = '#f4b6b0'; ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(r * 0.36, -r * 0.84); ctx.lineTo(r * 0.92, -r * 0.5); ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.stroke(); }
    }
    ctx.restore();
  }
  blob(ctx, 0, 0, r * 1.08, r * 0.96); paint(ctx, coat, outline);
  ctx.save(); ctx.clip();
  if (pointed) { blob(ctx, 0, r * 0.22, r * 0.7, r * 0.66); ctx.fillStyle = marks; ctx.fill(); }
  if (socks || dog) { blob(ctx, 0, r * 0.52, r * (dog ? 0.62 : 0.56), r * 0.52); ctx.fillStyle = socks ? belly : shade(coat, 0.35); ctx.fill(); }
  if (socks) { ctx.beginPath(); ctx.moveTo(-r * 0.14, -r); ctx.lineTo(r * 0.14, -r); ctx.lineTo(r * 0.3, r * 0.2); ctx.lineTo(-r * 0.3, r * 0.2); ctx.closePath(); ctx.fillStyle = belly; ctx.fill(); }
  if (traits.pattern === 'tabby') {
    ctx.strokeStyle = marks; ctx.lineWidth = 2.6;
    for (const x of [-0.24, 0, 0.24]) { ctx.beginPath(); ctx.moveTo(x * r, -r * 0.95); ctx.lineTo(x * r * 0.8, -r * 0.5); ctx.stroke(); }
  }
  ctx.restore();

  // Face.
  const eyeY = -r * 0.1, eyeX = r * 0.42, open = Math.max(0.08, 1 - pose.blink);
  for (const side of [-1, 1]) {
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 2;
    if (pose.eyes === 'closed') { ctx.beginPath(); ctx.arc(side * eyeX, eyeY - 1, r * 0.17, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); continue; }
    if (pose.eyes === 'happy') { ctx.beginPath(); ctx.arc(side * eyeX, eyeY + 2, r * 0.17, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); continue; }
    blob(ctx, side * eyeX, eyeY, r * 0.2, r * 0.22 * open); ctx.fillStyle = dog ? '#2b2118' : traits.eye; ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
    if (dog) { blob(ctx, side * eyeX, eyeY, r * 0.13, r * 0.14 * open); ctx.fillStyle = traits.eye; ctx.fill(); }
    blob(ctx, side * eyeX, eyeY, r * (dog ? 0.08 : 0.07), r * (dog ? 0.09 : 0.17) * open); ctx.fillStyle = '#17120d'; ctx.fill();
    blob(ctx, side * eyeX + r * 0.06, eyeY - r * 0.07, r * 0.045, r * 0.045 * open); ctx.fillStyle = '#fff'; ctx.fill();
  }
  const noseY = r * 0.34;
  if (dog) { blob(ctx, 0, noseY, r * 0.2, r * 0.14); ctx.fillStyle = '#241a14'; ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-r * 0.11, noseY - 2); ctx.lineTo(r * 0.11, noseY - 2); ctx.lineTo(0, noseY + r * 0.1); ctx.closePath(); ctx.fillStyle = '#e58f8f'; ctx.fill(); }
  const gape = pose.mouth * r * 0.2;
  if (gape > 0.5) { blob(ctx, 0, noseY + r * 0.26 + gape * 0.4, r * 0.17, gape); ctx.fillStyle = '#5c2a2a'; ctx.fill(); }
  if (pose.tongue > 0.05) { blob(ctx, 0, noseY + r * 0.32 + pose.tongue * r * 0.2, r * 0.12, r * 0.1 + pose.tongue * r * 0.16); ctx.fillStyle = '#f08a9b'; ctx.fill(); }
  ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, noseY + r * 0.1); ctx.quadraticCurveTo(side * r * 0.12, noseY + r * 0.3, side * r * 0.26, noseY + r * 0.18); ctx.stroke(); }
  if (!dog) {
    ctx.strokeStyle = shade(coat, 0.75); ctx.globalAlpha = 0.9; ctx.lineWidth = 1;
    for (const side of [-1, 1]) for (const lift of [-0.08, 0.03, 0.14]) { ctx.beginPath(); ctx.moveTo(side * r * 0.5, noseY + r * 0.1); ctx.lineTo(side * r * 1.35, noseY + r * lift * 3); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
