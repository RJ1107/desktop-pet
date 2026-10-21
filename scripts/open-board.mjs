// Starts this project's live board if it is not running (it stops when the computer restarts), then opens it in the
// default browser. With --shortcut, puts a "看板" shortcut on the Windows desktop that does the same with a double-click.
// Usage: node scripts/open-board.mjs [--shortcut]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync, spawn} from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manage = path.join(root, '.agent-workboard', 'manage.mjs');

// A board icon: three columns of cards on a dark tile, as an .ico with the sizes Windows asks for.
function picture(size) {
  const pixels = Buffer.alloc(size * size * 4), sub = 4;
  const cards = [[0.16, 0.24, 0.24, 0.17], [0.16, 0.45, 0.24, 0.17], [0.38, 0.24, 0.24, 0.17], [0.6, 0.24, 0.24, 0.17], [0.6, 0.45, 0.24, 0.17], [0.6, 0.66, 0.24, 0.17]];
  const inTile = (x, y) => { const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r); return Math.hypot(x - cx, y - cy) <= r; };
  const inCard = (x, y) => cards.find(([cx, cy, w, h]) => x >= cx && x <= cx + w && y >= cy && y <= cy + h);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let tile = 0, card = 0, done = 0;
    for (let sy = 0; sy < sub; sy++) for (let sx = 0; sx < sub; sx++) {
      const u = (x + (sx + 0.5) / sub) / size, v = (y + (sy + 0.5) / sub) / size, hit = inTile(u, v) && inCard(u, v);
      if (inTile(u, v)) { tile++; if (hit) { card++; if (hit[0] > 0.5) done++; } }
    }
    const cover = tile / (sub * sub), mix = tile ? card / tile : 0, green = card ? done / card : 0;
    const face = [0x5c + (0x3d - 0x5c) * green, 0xc8 + (0xe0 - 0xc8) * green, 0xff + (0x9a - 0xff) * green]; // blue cards, green in the Done column
    const colour = [0x10 + (face[0] - 0x10) * mix, 0x16 + (face[1] - 0x16) * mix, 0x22 + (face[2] - 0x22) * mix];
    pixels.set([colour[2], colour[1], colour[0], Math.round(cover * 255)], ((size - 1 - y) * size + x) * 4);
  }
  return pixels;
}
function icon(sizes) {
  const images = sizes.map(size => {
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4); header.writeInt32LE(size * 2, 8); header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
    return {size, data: Buffer.concat([header, picture(size), Buffer.alloc(Math.ceil(size / 32) * 4 * size)])};
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

if (process.argv.includes('--shortcut') && process.platform === 'darwin') {
  const file = path.join(process.env.HOME, 'Desktop', '看板.command'), sh = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(file, `#!/bin/bash\n# Starts this project's live board if needed and opens it in the browser.\ncd ${sh(root)}\n${sh(process.execPath)} scripts/open-board.mjs\nexit 0\n`);
  fs.chmodSync(file, 0o755);
  console.log('Shortcut created:', file);
} else if (process.argv.includes('--shortcut')) {
  if (process.platform !== 'win32') { console.error('The shortcut is for Windows and macOS. Elsewhere run: node scripts/open-board.mjs'); process.exit(1); }
  const iconFile = path.join(root, 'assets', 'board.ico');
  fs.mkdirSync(path.dirname(iconFile), {recursive: true});
  fs.writeFileSync(iconFile, icon([16, 32, 48, 256]));
  const quote = value => `'${String(value).replace(/'/g, "''")}'`;
  const script = [
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    `$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop ${quote('看板.lnk')}))`,
    `$link.TargetPath = ${quote(process.execPath)}`,
    `$link.Arguments = ${quote(`"${fileURLToPath(import.meta.url)}"`)}`,
    `$link.WorkingDirectory = ${quote(root)}`,
    `$link.IconLocation = ${quote(iconFile)}`,
    '$link.WindowStyle = 7', // minimised: only the browser shows
    "$link.Description = 'Open the desktop pet live board'",
    '$link.Save()',
    'Write-Output $link.FullName'
  ].join('; ');
  const made = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {encoding: 'utf8'}).trim();
  console.log('Shortcut created:', made.split(/\r?\n/).pop());
} else {
  // start() reuses the viewer when it is already running, and finds another port when 4318 belongs to a different board.
  const {start} = await import(pathToFileURL(manage).href);
  const board = await start();
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', board.url]] : process.platform === 'darwin' ? ['open', [board.url]] : ['xdg-open', [board.url]];
  spawn(opener[0], opener[1], {detached: true, stdio: 'ignore', windowsHide: true}).unref();
  console.log(board.url);
}
