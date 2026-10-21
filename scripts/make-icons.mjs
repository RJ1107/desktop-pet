// Draws the app icon (an orange paw on a dark rounded tile) into build/icon.png (1024 px, for macOS) and
// build/icon.ico (16 to 256 px, for Windows), the files the installer builder takes the app's icon from.
// Usage: node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'build');

// RGBA rows, top to bottom. The tile fills about 82% of the canvas, as macOS icons leave a margin round the shape.
function picture(size, margin = 0.09) {
  const pixels = Buffer.alloc(size * size * 4), sub = 4;
  const pads = [[0.5, 0.64, 0.21, 0.17], [0.25, 0.42, 0.1, 0.12], [0.41, 0.28, 0.1, 0.125], [0.59, 0.28, 0.1, 0.125], [0.75, 0.42, 0.1, 0.12]];
  const inTile = (x, y) => { const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r); return Math.hypot(x - cx, y - cy) <= r; };
  const inPaw = (x, y) => pads.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let tile = 0, paw = 0;
    for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
      const u = ((x + (sx + 0.5) / sub) / size - margin) / (1 - 2 * margin), v = ((y + (sy + 0.5) / sub) / size - margin) / (1 - 2 * margin);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && inTile(u, v)) { tile++; if (inPaw(u, v)) paw++; }
    }
    const cover = tile / (sub * sub), mix = tile ? paw / tile : 0;
    pixels.set([0x2a + (0xf0 - 0x2a) * mix, 0x21 + (0xa0 - 0x21) * mix, 0x1b + (0x58 - 0x1b) * mix, Math.round(cover * 255)], (y * size + x) * 4);
  }
  return pixels;
}

const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(size, margin) {
  const rgba = picture(size, margin), rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { rows[y * (size * 4 + 1)] = 0; rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const chunk = (type, data) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, tail]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6; // 8-bit RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
// An .ico whose images are PNGs, which every Windows since Vista reads.
function ico(sizes) {
  const images = sizes.map(size => ({size, data: png(size, 0)}));
  const directory = Buffer.alloc(6 + 16 * images.length);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(images.length, 4);
  let offset = directory.length;
  images.forEach((image, i) => {
    const at = 6 + i * 16;
    directory[at] = image.size % 256; directory[at + 1] = image.size % 256;
    directory.writeUInt16LE(1, at + 4); directory.writeUInt16LE(32, at + 6); directory.writeUInt32LE(image.data.length, at + 8); directory.writeUInt32LE(offset, at + 12);
    offset += image.data.length;
  });
  return Buffer.concat([directory, ...images.map(image => image.data)]);
}

fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'icon.png'), png(1024));
fs.writeFileSync(path.join(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('wrote build/icon.png and build/icon.ico');
