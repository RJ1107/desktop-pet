import {app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage, safeStorage, session, systemPreferences} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStore, DEFAULT_SETTINGS} from './store.js';
import {chat, describePhotos, transcribe, speak} from './llm.js';
import {createRealistic} from './realistic.js';
import {createBowls} from './bowls.js';
import {normalizeTraits} from '../shared/traits.js';
import {portrait} from '../shared/breeds.js';
import {NEED_KEYS} from '../shared/needs.js';
import {parseReply, addMemories, recall, trimHistory, nameFrom, cleanName} from '../shared/memory.js';
import {buildSystemPrompt} from '../shared/prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const preload = path.join(here, '..', 'preload.cjs');
// Tests point the app at a throwaway data folder.
if (process.env.PET_DATA_DIR) app.setPath('userData', process.env.PET_DATA_DIR);
// Windows stops drawing a window it believes is covered. Another always-on-top window must not freeze the pet
// or stall the settings window while it is cutting out video frames.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let store, realistic, bowls, overlay, panel, tray, saveTimer;
const events = []; // what just happened to the pet, for the model: [{text, at}]

const broadcast = (channel, payload) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload); };
const changed = () => broadcast('state:changed', store.view());
const command = payload => overlay?.webContents.send('command', payload);
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.save(), 2000); }

// The personality file is read on every message, so edits take effect on the next reply without a restart.
function readPersonality() {
  const custom = store.data.settings.personalityPath;
  if (custom) {
    try { return {path: custom, builtin: false, text: fs.readFileSync(custom, 'utf8').slice(0, 8000)}; }
    catch { /* the file was moved or deleted: fall back rather than leave the pet without a character */ }
  }
  const file = path.join(root, 'personalities', `${store.data.pet.traits.species}.md`);
  return {path: file, builtin: true, missing: Boolean(custom), text: fs.readFileSync(file, 'utf8')};
}

// Gives the pet a new name and remembers the old ones, so the model can be told who it used to be. Returns whether anything changed.
function rename(next) {
  const name = cleanName(next), pet = store.data.pet;
  if (!name || name === pet.traits.name) return false;
  pet.formerNames = [...new Set([...(pet.formerNames || []), pet.traits.name])].filter(old => old !== name).slice(-3);
  pet.traits.name = name;
  return true;
}

function createOverlay() {
  // Automated checks keep the window off-screen, away from the person's real cursor.
  const area = {...screen.getPrimaryDisplay().workArea, ...(process.env.PET_OFFSCREEN ? {x: -20000} : {})};
  overlay = new BrowserWindow({
    ...area, transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000',
    webPreferences: {preload, contextIsolation: true, sandbox: true, backgroundThrottling: false}
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Clicks fall through to whatever is underneath; the page turns this off while the cursor is over the pet.
  overlay.setIgnoreMouseEvents(true, {forward: true});
  if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
  overlay.loadFile(path.join(root, 'src', 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.on('closed', () => { overlay = null; });
}

function openPanel(tab = 'look') {
  if (panel) { panel.webContents.send('command', {type: 'tab', tab}); panel.show(); panel.focus(); return; }
  panel = new BrowserWindow({
    width: 900, height: 700, minWidth: 720, minHeight: 560, title: 'Desktop Pet', autoHideMenuBar: true, backgroundColor: '#fbf6ee',
    webPreferences: {preload, contextIsolation: true, sandbox: true, backgroundThrottling: false} // it cuts out video frames while unfocused
  });
  panel.loadFile(path.join(root, 'src', 'renderer', 'panel.html'), {hash: tab});
  panel.on('closed', () => { panel = null; });
}

// A paw print drawn straight into a bitmap, so the app ships without image files.
function pawIcon(size = 32) {
  const pixels = Buffer.alloc(size * size * 4);
  const pads = [[16, 21, 7.5, 6.2], [7.5, 13, 3.4, 4], [12.6, 8.2, 3.4, 4.2], [19.4, 8.2, 3.4, 4.2], [24.5, 13, 3.4, 4]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const inside = pads.some(([cx, cy, rx, ry]) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1);
    if (inside) pixels.set(process.platform === 'darwin' ? [0, 0, 0, 0xff] : [0x4a, 0x8f, 0xe8, 0xff], (y * size + x) * 4); // BGRA
  }
  // In the macOS menu bar the 32-pixel paw is shown at half size (sharp on Retina screens), in black, as a template
  // image that the system turns white on a dark menu bar.
  const image = nativeImage.createFromBitmap(pixels, {width: size, height: size, scaleFactor: process.platform === 'darwin' ? 2 : 1});
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}

// The tray menu is the way back after hiding the pet, so it speaks the system's language like the windows do.
function trayWords() {
  return app.getLocale().toLowerCase().startsWith('zh')
    ? {hide: '隐藏', show: '显示', kibble: '喂猫粮', treat: '喂猫条', water: '喂水', talk: '聊天', more: '形象、性格与设置…', quit: '退出'}
    : {hide: 'Hide', show: 'Show', kibble: 'Give kibble', treat: 'Give a treat stick', water: 'Give water', talk: 'Talk', more: 'Look, personality and settings…', quit: 'Quit'};
}

function buildTray() {
  const words = trayWords();
  tray = new Tray(pawIcon());
  const refresh = () => {
    tray.setToolTip(store.data.pet.traits.name);
    tray.setContextMenu(Menu.buildFromTemplate([
      {label: store.data.pet.traits.name, enabled: false},
      {type: 'separator'},
      {label: overlay?.isVisible() ? words.hide : words.show, click: () => { overlay.isVisible() ? overlay.hide() : overlay.showInactive(); refresh(); }},
      {label: words.kibble, click: () => command({type: 'drop', item: 'kibble'})},
      {label: words.treat, click: () => command({type: 'drop', item: 'treat'})},
      {label: words.water, click: () => command({type: 'drop', item: 'water'})},
      {label: words.talk, click: () => command({type: 'chat'})},
      {type: 'separator'},
      {label: words.more, click: () => openPanel('look')},
      {label: words.quit, click: () => app.quit()}
    ]));
  };
  refresh();
  tray.on('click', () => command({type: 'chat'}));
  return refresh;
}

const guard = handler => async (_event, ...args) => {
  try { return await handler(...args); }
  catch (error) { return {error: error.message || 'Something went wrong.'}; }
};

// The current pet's footage and bowls live in its own folder; opened at start and again after switching pets.
function openPetFiles() {
  realistic = createRealistic(store.folder(), {settings: () => store.data.settings, key: () => store.getKey(), progress: update => broadcast('real:progress', update)});
  bowls = createBowls(store.folder(), {settings: () => store.data.settings, key: () => store.getKey()});
}

function registerCalls(refreshTray) {
  const handle = (name, handler) => ipcMain.handle(name, guard(handler));
  handle('state', () => ({...store.view(), platform: process.platform}));
  handle('overlay:ignore', flag => { overlay?.setIgnoreMouseEvents(Boolean(flag), {forward: true}); });
  handle('overlay:focus', () => { overlay?.focus(); });
  handle('overlay:hide', () => { overlay?.hide(); refreshTray(); }); // the tray icon brings it back

  // The chosen photos are kept (already shrunk) so the realistic look can be made again without choosing them again.
  const photoFile = index => path.join(store.folder(), 'photos', `${index}.jpg`);
  handle('photos:keep', photos => {
    fs.mkdirSync(path.dirname(photoFile(0)), {recursive: true});
    for (let i = 0; i < 3; i++) fs.rmSync(photoFile(i), {force: true});
    (Array.isArray(photos) ? photos : []).slice(0, 3).forEach((url, i) => {
      const match = /^data:image\/jpeg;base64,(.+)$/.exec(String(url));
      if (match) fs.writeFileSync(photoFile(i), Buffer.from(match[1], 'base64'));
    });
  });
  handle('photos:kept', () => [0, 1, 2].filter(i => fs.existsSync(photoFile(i))).map(i => `data:image/jpeg;base64,${fs.readFileSync(photoFile(i)).toString('base64')}`));
  handle('panel:open', tab => openPanel(tab));
  handle('quit', () => app.quit());

  // A line from the desktop window into startup.log: what it showed, and why the footage did not load if it did not.
  handle('debug:note', text => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), `${new Date().toISOString()} overlay: ${String(text).slice(0, 300)}` + String.fromCharCode(10)); } catch {} });
  handle('pet:needs', needs => {
    for (const key of NEED_KEYS) if (Number.isFinite(needs?.[key])) store.data.pet.needs[key] = Math.max(0, Math.min(100, needs[key]));
    store.data.pet.lastSeen = Date.now();
    saveSoon();
  });
  handle('pet:event', text => { events.push({text: String(text).slice(0, 80), at: Date.now()}); while (events.length > 5) events.shift(); });

  handle('chat', async text => {
    const said = String(text ?? '').trim().slice(0, 2000);
    if (!said) throw new Error('Say something first.');
    const {settings, pet} = store.data;
    const recent = store.data.history.slice(-4).map(turn => turn.content).join(' ');
    const fresh = events.filter(e => Date.now() - e.at < 15 * 60000).map(e => e.text);
    const system = buildSystemPrompt({personality: readPersonality().text, traits: pet.traits, needs: pet.needs, memories: recall(store.data.memories, `${said} ${recent}`), events: fresh, description: pet.description || '', formerNames: pet.formerNames || [], bornAt: pet.bornAt});
    const raw = await chat(settings, store.getKey(), [{role: 'system', content: system}, ...trimHistory(store.data.history), {role: 'user', content: said}]);
    const reply = parseReply(raw);
    store.data.history = trimHistory([...store.data.history, {role: 'user', content: said}, {role: 'assistant', content: reply.text}], 40);
    if (reply.remember.length) store.data.memories = addMemories(store.data.memories, reply.remember);
    const renamed = reply.name ? rename(reply.name) : false;
    if (renamed) refreshTray();
    if (renamed || reply.remember.length) changed();
    saveSoon();
    return {text: reply.text, acts: reply.acts, remembered: reply.remember, renamed: renamed ? store.data.pet.traits.name : null};
  });
  handle('listen', async wav => ({text: await transcribe(store.data.settings, store.getKey(), String(wav))}));
  handle('speak', async text => ({audio: await speak(store.data.settings, store.getKey(), String(text))}));

  handle('photos:pick', async () => {
    const result = await dialog.showOpenDialog(panel, {title: 'Choose 1 to 3 photos of your pet', properties: ['openFile', 'multiSelections'], filters: [{name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'webp']}]});
    if (result.canceled) return {photos: []};
    const types = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'};
    return {
      skipped: Math.max(0, result.filePaths.length - 3),
      photos: result.filePaths.slice(0, 3).map(file => ({name: path.basename(file), url: `data:${types[path.extname(file).toLowerCase()]};base64,${fs.readFileSync(file).toString('base64')}`}))
    };
  });
  handle('traits:describe', async ({photos, species, description = ''}) => {
    if (!Array.isArray(photos) || photos.length < 1 || photos.length > 3) throw new Error('Choose one to three photos.');
    return {traits: await describePhotos(store.data.settings, store.getKey(), photos, species === 'dog' ? 'dog' : 'cat', String(description).slice(0, 600))};
  });
  handle('traits:save', ({traits, photos = 0, description}) => {
    if (traits?.name) rename(traits.name); // keeps the old name on record before the look is replaced
    store.data.pet.traits = normalizeTraits({...traits, name: store.data.pet.traits.name}, store.data.pet.traits);
    store.data.pet.photos = photos;
    if (typeof description === 'string') store.data.pet.description = description.trim().slice(0, 600);
    if (!store.data.pet.adopted) { store.data.pet.adopted = true; store.data.pet.bornAt = Date.now(); }
    store.save(); refreshTray(); changed();
    return store.view();
  });

  handle('settings:save', ({settings = {}, key}) => {
    const next = {...store.data.settings};
    for (const name of Object.keys(DEFAULT_SETTINGS)) {
      if (!(name in settings)) continue;
      next[name] = typeof DEFAULT_SETTINGS[name] === 'boolean' ? Boolean(settings[name]) : String(settings[name]).trim().slice(0, 300);
    }
    if (!next.baseUrl) next.baseUrl = DEFAULT_SETTINGS.baseUrl;
    store.data.settings = next;
    if (typeof key === 'string') store.setKey(key.trim()); else store.save();
    changed();
    return store.view();
  });
  handle('personality:read', () => readPersonality());
  handle('personality:pick', async () => {
    const result = await dialog.showOpenDialog(panel, {title: 'Choose a personality file', properties: ['openFile'], filters: [{name: 'Markdown', extensions: ['md', 'markdown', 'txt']}]});
    if (!result.canceled) { store.data.settings.personalityPath = result.filePaths[0]; store.save(); changed(); }
    return readPersonality();
  });
  handle('personality:reset', () => { store.data.settings.personalityPath = ''; store.save(); changed(); return readPersonality(); });

  const kind = species => species === 'dog' ? 'dog' : 'cat';
  handle('real:status', () => ({...realistic.status(), look: store.data.pet.look || 'cartoon'}));
  handle('real:reference', ({photos = [], description = '', species, traits}) => realistic.reference({photos: photos.slice(0, 3), description: String(description).slice(0, 600), species: kind(species),
    portrait: portrait(normalizeTraits({...(traits ?? store.data.pet.traits), species: kind(species)}, store.data.pet.traits))}));
  handle('real:stamp', () => store.data.pet.look === 'realistic' && realistic.status().ready ? `${store.data.active.id}:${realistic.stamp()}` : 0);

  // My pets: the one on the desktop and the others. Switching swaps the look, footage, photos, bowls and memories.
  const settle = () => { openPetFiles(); refreshTray(); changed(); broadcast('bowls:changed', bowls.load()); return store.view(); };
  const idle = () => { if (realistic.status().busy) throw new Error('A look is being made right now. Switch when it is done.'); };
  handle('pets:switch', id => { idle(); store.switchTo(String(id)); return settle(); });
  handle('pets:add', () => { idle(); store.addPet(); return settle(); });
  handle('pets:remove', id => {
    const folder = store.removePet(String(id)), home = app.getPath('userData');
    // The first pet's folder is the data folder itself: only its own subfolders go, never the folder.
    const targets = folder ? [path.join(home, folder)] : ['realistic', 'photos', 'bowls'].map(name => path.join(home, name));
    for (const target of targets) if (path.resolve(target).startsWith(path.resolve(home) + path.sep)) fs.rmSync(target, {recursive: true, force: true});
    changed();
    return store.view();
  });
  handle('pets:picture', id => {
    const kept = id === store.data.active.id ? store.data.active : store.data.shelf.find(pet => pet.id === id);
    const file = kept && path.join(app.getPath('userData'), kept.folder, 'realistic', 'reference.png');
    return file && fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : null;
  });
  handle('real:clips', ({names, species}) => realistic.clips({names, species: kind(species)}));
  handle('real:clip', name => ({video: realistic.clip(name)}));
  handle('real:sheet', sheet => realistic.saveSheet(sheet));
  handle('real:load', () => store.data.pet.look === 'realistic' ? realistic.load() : null);
  handle('bowl:make', ({kind, photos = [], description = ''}) => {
    if (!store.getKey()) throw new Error('Add an API key under “Talk & voice” first.');
    return bowls.make({kind, photos: photos.slice(0, 3), description: String(description).slice(0, 300)});
  });
  handle('bowl:save', bowl => { const result = bowls.save(bowl); broadcast('bowls:changed', result); return result; });
  handle('bowl:reset', kind => { const result = bowls.reset(kind); broadcast('bowls:changed', result); return result; });
  handle('bowl:load', () => bowls.load());
  handle('real:use', on => {
    store.data.pet.look = on && realistic.status().ready ? 'realistic' : 'cartoon';
    store.save(); changed();
    return {look: store.data.pet.look};
  });

  handle('memory:add', text => {
    // "你叫Gigi" typed as a memory is a rename; storing it as a fact about the owner is what kept the old name alive.
    if (nameFrom(text)) { if (rename(nameFrom(text))) refreshTray(); }
    else store.data.memories = addMemories(store.data.memories, [String(text).slice(0, 200)]);
    store.save(); changed();
  });
  handle('memory:delete', id => { store.data.memories = store.data.memories.filter(m => m.id !== id); store.save(); changed(); });
  handle('memory:clear', () => { store.data.memories = []; store.save(); changed(); });
  handle('history:clear', () => { store.data.history = []; store.save(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Starting the app again is how people look for a pet they cannot see: bring it back, and open its window.
  app.on('second-instance', () => { overlay?.showInactive(); openPanel('look'); });
  app.whenReady().then(() => {
    const canEncrypt = safeStorage.isEncryptionAvailable();
    store = createStore(app.getPath('userData'), canEncrypt ? {
      encrypt: plain => safeStorage.encryptString(plain).toString('base64'),
      decrypt: stored => safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } : {});
    // A line per start, so that "the wrong pet came up" can be traced to the data that was read.
    try {
      const log = path.join(app.getPath('userData'), 'startup.log'), old = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').slice(-40) : [];
      old.push(`${new Date().toISOString()} data=${app.getPath('userData')} file=${fs.existsSync(store.file)} pet=${store.data.pet.traits.name} look=${store.data.pet.look ?? '-'} active=${store.data.active.id} args=${JSON.stringify(process.argv.slice(1))} cwd=${process.cwd()}`);
      fs.writeFileSync(log, old.filter(Boolean).join('\n') + '\n');
    } catch {}
    // Memories saved before renaming was understood: "你叫Gigi" becomes the pet's name and leaves the list.
    const named = store.data.memories.filter(memory => nameFrom(memory.text));
    if (named.length) { rename(nameFrom(named.at(-1).text)); store.data.memories = store.data.memories.filter(memory => !nameFrom(memory.text)); store.save(); }
    openPetFiles();
    // Only the microphone is ever granted, and only to this app's own pages.
    const ours = contents => contents?.getURL().startsWith('file://');
    session.defaultSession.setPermissionRequestHandler((contents, permission, done) => done(permission === 'media' && ours(contents)));
    session.defaultSession.setPermissionCheckHandler((contents, permission) => permission === 'media' && ours(contents));
    if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => {});

    createOverlay();
    registerCalls(buildTray());
    if (!store.data.pet.adopted) openPanel('look');
    screen.on('display-metrics-changed', () => { if (!process.env.PET_OFFSCREEN) overlay?.setBounds(screen.getPrimaryDisplay().workArea); });
  });
  // The pet lives in the tray, so closing the settings window must not end the app.
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { clearTimeout(saveTimer); if (store) { store.data.pet.lastSeen = Date.now(); store.save(); } });
}
