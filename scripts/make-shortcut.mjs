// Puts a shortcut to the pet on the desktop, so it starts with a double-click: a .lnk with a paw icon on Windows,
// a .command file on macOS (Finder runs it in Terminal, which starts the pet and closes again).
// Usage: node scripts/make-shortcut.mjs [shortcut name]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.platform === 'darwin') {
  const electron = createRequire(import.meta.url)(path.join(root, 'node_modules', 'electron'));
  const file = path.join(process.env.HOME, 'Desktop', `${(process.argv[2] || '桌面宠物').replace(/[\\/:*?"<>|]/g, '')}.command`);
  const sh = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(file, `#!/bin/bash\n# Starts the desktop pet, then closes this Terminal window.\ncd ${sh(root)}\nnohup ${sh(electron)} . >/dev/null 2>&1 &\nosascript -e 'tell application "Terminal" to close (every window whose name contains ".command")' >/dev/null 2>&1 &\nexit 0\n`);
  fs.chmodSync(file, 0o755);
  console.log('Shortcut created:', file);
  process.exit(0);
}
if (process.platform !== 'win32') { console.error('Shortcuts are made for Windows and macOS. Elsewhere, start the pet with npm start.'); process.exit(1); }

// One square picture of the icon: an orange paw on a dark rounded tile, as bottom-up BGRA rows for an .ico file.
function picture(size) {
  const pixels = Buffer.alloc(size * size * 4), sub = 4;
  const pads = [[0.5, 0.64, 0.21, 0.17], [0.25, 0.42, 0.1, 0.12], [0.41, 0.28, 0.1, 0.125], [0.59, 0.28, 0.1, 0.125], [0.75, 0.42, 0.1, 0.12]];
  const inTile = (x, y) => { const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r); return Math.hypot(x - cx, y - cy) <= r; };
  const inPaw = (x, y) => pads.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let tile = 0, paw = 0;
    for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) { // sample each pixel 16 times for smooth edges
      const u = (x + (sx + 0.5) / sub) / size, v = (y + (sy + 0.5) / sub) / size;
      if (inTile(u, v)) { tile++; if (inPaw(u, v)) paw++; }
    }
    const cover = tile / (sub * sub), mix = tile ? paw / tile : 0;
    const colour = [0x2a + (0xf0 - 0x2a) * mix, 0x21 + (0xa0 - 0x21) * mix, 0x1b + (0x58 - 0x1b) * mix]; // RGB
    pixels.set([colour[2], colour[1], colour[0], Math.round(cover * 255)], ((size - 1 - y) * size + x) * 4);
  }
  return pixels;
}
function icon(sizes) {
  const images = sizes.map(size => {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8); header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
    const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size); // transparency comes from the alpha channel
    return {size, data: Buffer.concat([header, picture(size), mask])};
  });
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

const iconFile = path.join(root, 'assets', 'paw.ico');
fs.mkdirSync(path.dirname(iconFile), {recursive: true});
fs.writeFileSync(iconFile, icon([16, 32, 48, 256]));

const electron = createRequire(import.meta.url)(path.join(root, 'node_modules', 'electron')); // path to electron.exe
const name = (process.argv[2] || '桌面宠物').replace(/[\\/:*?"<>|]/g, '');
const quote = value => `'${String(value).replace(/'/g, "''")}'`;
const script = [
  "$desktop = [Environment]::GetFolderPath('Desktop')",
  `$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop ${quote(name + '.lnk')}))`,
  `$link.TargetPath = ${quote(electron)}`,
  `$link.Arguments = ${quote(`"${root}"`)}`,
  `$link.WorkingDirectory = ${quote(root)}`,
  `$link.IconLocation = ${quote(iconFile)}`,
  "$link.Description = 'Desktop Pet'",
  '$link.Save()',
  'Write-Output $link.FullName'
].join('; ');
// Passed as UTF-16 so a non-English shortcut name survives whatever code page the console uses.
const made = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {encoding: 'utf8'}).trim();
console.log('Shortcut created:', made || name);
