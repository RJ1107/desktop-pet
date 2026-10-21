import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultNeeds, applyOffline} from '../shared/needs.js';
import {defaultTraits, normalizeTraits} from '../shared/traits.js';

export const DEFAULT_SETTINGS = {
  baseUrl: 'https://openrouter.ai/api/v1',
  chatModel: 'anthropic/claude-haiku-5.5',
  visionModel: 'google/gemini-3.8-flash',
  listenModel: 'google/gemini-3.8-flash',
  speakAloud: true,
  voiceEngine: 'system',            // 'system' uses the computer's own voices; 'service' calls the speech endpoint
  voiceModel: 'elevenlabs/eleven-turbo-v2.5',
  voiceName: 'lily',
  personalityPath: '',              // empty means the built-in personality for the species
  imageModel: 'google/gemini-nano-banana-2.1',
  videoModel: 'google/veo-3.1-lite'
};

// One JSON file in the app's data folder. The API key is kept separately and only ever in encrypted form.
// Several pets can be kept. The one on the desktop lives in data.pet, data.memories and data.history; the others wait
// on data.shelf with their own memories and conversation. Each pet's files (footage, photos, bowls) are in its own
// folder: data.active.folder, relative to the data folder. The first pet's folder is the data folder itself, so pets
// made before there could be several keep their files where they were.
export function createStore(directory, {encrypt, decrypt} = {}) {
  const file = path.join(directory, 'pet.json');
  let data = {settings: {...DEFAULT_SETTINGS}, pet: null, memories: [], history: [], key: ''};
  if (fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      data = {...data, ...saved, settings: {...DEFAULT_SETTINGS, ...saved.settings}};
    } catch { fs.copyFileSync(file, file + '.unreadable'); } // keep the damaged file for the owner instead of overwriting it
  }
  const now = Date.now();
  const fresh = () => ({traits: defaultTraits('cat'), needs: defaultNeeds(), bornAt: Date.now(), lastSeen: Date.now(), adopted: false, photos: 0, description: ''});
  // A pet coming back onto the desktop (at start, or switched to) has got hungrier while it was away.
  const wake = pet => ({...pet, traits: normalizeTraits(pet.traits), needs: applyOffline({...defaultNeeds(), ...pet.needs}, (Date.now() - (pet.lastSeen || Date.now())) / 60000)});
  data.pet = data.pet ? wake(data.pet) : fresh();
  if (!data.active?.id) data.active = {id: `pet-${data.pet.bornAt || now}`, folder: ''};
  if (!Array.isArray(data.shelf)) data.shelf = [];

  // Once a day, before the first save of the day, the file as it was is copied to backups/pet-YYYY-MM-DD.json.
  // The last fourteen are kept, so a pet lost to a bad save or a slip of the hand can be brought back.
  function backUp() {
    if (!fs.existsSync(file)) return;
    const folder = path.join(directory, 'backups'), today = path.join(folder, `pet-${new Date().toISOString().slice(0, 10)}.json`);
    if (fs.existsSync(today)) return;
    fs.mkdirSync(folder, {recursive: true});
    fs.copyFileSync(file, today);
    const old = fs.readdirSync(folder).filter(name => /^pet-\d{4}-\d\d-\d\d\.json$/.test(name)).sort().slice(0, -14);
    for (const name of old) fs.rmSync(path.join(folder, name), {force: true});
  }
  function save() {
    fs.mkdirSync(directory, {recursive: true});
    try { backUp(); } catch {} // a backup that cannot be made must not stop the pet being saved
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, file);
  }
  // made: whether its realistic look has been generated; until then it is a drawn stand-in.
  const card = (id, pet, active) => ({id, active, name: pet.traits?.name ?? '', species: pet.traits?.species ?? 'cat', adopted: Boolean(pet.adopted), made: pet.look === 'realistic'});
  const pets = () => [card(data.active.id, data.pet, true), ...data.shelf.map(kept => card(kept.id, kept.pet, false))];
  function shelve() {
    data.shelf.push({id: data.active.id, folder: data.active.folder, pet: {...data.pet, lastSeen: Date.now()}, memories: data.memories, history: data.history});
  }
  // Puts the pet on the desktop away and brings another out.
  function switchTo(id) {
    if (id === data.active.id) return;
    const index = data.shelf.findIndex(kept => kept.id === id);
    if (index < 0) throw new Error('There is no such pet.');
    const [next] = data.shelf.splice(index, 1);
    shelve();
    data.active = {id: next.id, folder: next.folder};
    data.pet = wake(next.pet); data.memories = next.memories ?? []; data.history = next.history ?? [];
    save();
  }
  // A new pet, straight onto the desktop, with a folder of its own. Returns its id. Until its look is made it is a
  // plain grey stand-in called "New pet": the usual orange Mochi looked as if the pet that was there had changed.
  function addPet({name = 'New pet'} = {}) {
    shelve();
    const id = `pet-${randomUUID().slice(0, 8)}`; // (two made in the same millisecond must still differ)
    data.active = {id, folder: path.join('pets', id)};
    data.pet = fresh(); data.memories = []; data.history = [];
    data.pet.traits = normalizeTraits({...data.pet.traits, name, base: '#9a9aa0', secondary: '#7c7c82', belly: '#d9d9dc', pattern: 'solid'});
    save();
    return id;
  }
  // Forgets a pet that is not on the desktop. Returns its folder, for the caller to clear.
  function removePet(id) {
    const index = data.shelf.findIndex(kept => kept.id === id);
    if (index < 0) throw new Error(id === data.active.id ? 'The pet on the desktop cannot be removed. Switch to another one first.' : 'There is no such pet.');
    const [gone] = data.shelf.splice(index, 1);
    save();
    return gone.folder;
  }
  return {
    file, data, save, pets, switchTo, addPet, removePet,
    folder: () => path.join(directory, data.active.folder),
    hasKey: () => Boolean(data.key),
    getKey() { try { return data.key && decrypt ? decrypt(data.key) : ''; } catch { return ''; } },
    setKey(plain) {
      if (!plain) data.key = '';
      else if (!encrypt) throw new Error('This computer cannot encrypt the key, so it was not saved.');
      else data.key = encrypt(plain);
      save();
    },
    // What windows are allowed to see: everything except the key itself.
    view: () => ({settings: data.settings, pet: data.pet, memories: data.memories, hasKey: Boolean(data.key), activeId: data.active.id, pets: pets()})
  };
}
