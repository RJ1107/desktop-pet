import fs from 'node:fs';
import path from 'node:path';
import {generateImage, startVideo, checkVideo} from './llm.js';
import {CLIP_NAMES, CORE_CLIPS, CLIP_SECONDS, clipPrompt, referencePrompt} from '../shared/realistic.js';

// Files for the realistic look live beside pet.json:
//   realistic/reference.png   the still every clip starts and ends on
//   realistic/clips/NAME.mp4  the generated footage, kept so sheets can be rebuilt without paying again
//   realistic/sheets/NAME.webp and realistic/meta.json   cut-out frames the overlay plays
export function createRealistic(directory, {settings, key, progress}) {
  const home = path.join(directory, 'realistic');
  const file = (...parts) => path.join(home, ...parts);
  const dataUrl = (name, type) => fs.existsSync(file(name)) ? `data:${type};base64,${fs.readFileSync(file(name)).toString('base64')}` : null;
  const readMeta = () => { try { return JSON.parse(fs.readFileSync(file('meta.json'), 'utf8')); } catch { return null; } };
  // Jobs already paid for, by clip name. If a download fails, the same job is fetched again instead of buying a new one.
  const readJobs = () => { try { return JSON.parse(fs.readFileSync(file('jobs.json'), 'utf8')); } catch { return {}; } };
  const writeJobs = jobs => fs.writeFileSync(file('jobs.json'), JSON.stringify(jobs, null, 2));
  let busy = false;

  function status() {
    const meta = readMeta();
    return {
      busy, reference: dataUrl('reference.png', 'image/png'),
      clips: CLIP_NAMES.filter(name => fs.existsSync(file('clips', `${name}.mp4`))),
      sheets: meta ? Object.keys(meta.clips).filter(name => fs.existsSync(file('sheets', `${name}.webp`))) : [],
      ready: Boolean(meta) && CORE_CLIPS.every(name => fs.existsSync(file('sheets', `${name}.webp`)))
    };
  }

  async function reference({photos = [], description = '', species, portrait = ''}) {
    if (busy) throw new Error('A generation is already running.');
    busy = true;
    try {
      const image = await generateImage(settings(), key(), referencePrompt({species, description, photos: photos.length, portrait}), photos);
      fs.mkdirSync(home, {recursive: true});
      fs.writeFileSync(file('reference.png'), image);
      // A new reference makes earlier clips a different animal; remove them so they are not mixed in.
      for (const folder of ['clips', 'sheets']) fs.rmSync(file(folder), {recursive: true, force: true});
      for (const name of ['meta.json', 'jobs.json']) fs.rmSync(file(name), {force: true});
    } finally { busy = false; }
    return status(); // read after the work is over, so it does not report itself as busy
  }

  // Generates the named clips together and waits for all of them. One failed clip does not stop the others.
  async function clips({names = CLIP_NAMES, species}) {
    if (busy) throw new Error('A generation is already running.');
    const frame = dataUrl('reference.png', 'image/png');
    if (!frame) throw new Error('Create the reference picture first.');
    busy = true;
    fs.mkdirSync(file('clips'), {recursive: true});
    const failed = {};
    try {
      await Promise.all(names.filter(name => CLIP_NAMES.includes(name)).map(async name => {
        try {
          progress({name, status: 'starting'});
          const day = 24 * 60 * 60 * 1000;
          let job = readJobs()[name];
          if (!job || Date.now() - job.at > day) {
            job = {...await startVideo(settings(), key(), {prompt: clipPrompt(name, species), frame, seconds: CLIP_SECONDS}), at: Date.now()};
            writeJobs({...readJobs(), [name]: {id: job.id, polling_url: job.polling_url, at: job.at}});
          }
          for (let waited = 0; ; waited += 10) {
            if (waited > 15 * 60) throw new Error('The video took more than 15 minutes.');
            await new Promise(resolve => setTimeout(resolve, waited ? 10000 : 3000));
            const result = await checkVideo(settings(), key(), job);
            progress({name, status: result.status, waited});
            if (result.status !== 'completed') continue;
            fs.writeFileSync(file('clips', `${name}.mp4`), result.video);
            const jobs = readJobs(); delete jobs[name]; writeJobs(jobs); // used up: asking again films a new take
            progress({name, status: 'downloaded'});
            return;
          }
        } catch (error) { failed[name] = error.message; progress({name, status: 'failed', error: error.message}); }
      }));
    } finally { busy = false; }
    return {...status(), failed};
  }

  const clip = name => CLIP_NAMES.includes(name) && fs.existsSync(file('clips', `${name}.mp4`)) ? fs.readFileSync(file('clips', `${name}.mp4`)).toString('base64') : null;

  // The panel cuts the background out of a clip and hands back a sprite sheet with its layout.
  function saveSheet({name, webp, layout, anchor}) {
    if (!CLIP_NAMES.includes(name)) throw new Error('Unknown clip.');
    fs.mkdirSync(file('sheets'), {recursive: true});
    fs.writeFileSync(file('sheets', `${name}.webp`), Buffer.from(webp, 'base64'));
    const meta = readMeta() || {clips: {}, anchor: null};
    meta.clips[name] = layout;
    if (anchor) meta.anchor = anchor;
    fs.writeFileSync(file('meta.json'), JSON.stringify(meta, null, 2));
    return status();
  }

  // Everything the overlay needs to play the realistic pet, or null if it has not been made.
  function load() {
    const meta = readMeta();
    if (!meta?.anchor || !status().ready) return null;
    const sheets = {};
    for (const name of Object.keys(meta.clips)) { const url = dataUrl(path.join('sheets', `${name}.webp`), 'image/webp'); if (url) sheets[name] = url; }
    return {meta, sheets};
  }

  // Changes whenever the cut-out frames change, so the overlay knows when to load them again.
  const stamp = () => { try { return fs.statSync(file('meta.json')).mtimeMs; } catch { return 0; } };

  return {status, reference, clips, clip, saveSheet, load, stamp};
}
