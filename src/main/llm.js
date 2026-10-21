import {normalizeTraits, PATTERNS, EARS, TAILS} from '../shared/traits.js';
import {BREEDS} from '../shared/breeds.js';

// Minimal client for OpenAI-compatible endpoints (OpenRouter by default). The key is passed per call and never logged.
function address(settings, route) {
  const base = settings.baseUrl.replace(/\/+$/, '');
  if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(base)) throw new Error('The API address must use https.');
  if (route.startsWith('/api/')) return new URL(route, base).href;
  if (/^https?:\/\//.test(route)) { if (new URL(route).origin !== new URL(base).origin) throw new Error('The service pointed to another site; the request was not sent.'); return route; }
  return base + route;
}
async function request(settings, key, route, {body, timeout = 60000} = {}) {
  if (!key) throw new Error('No API key is set. Add one in Settings to talk to your pet.');
  const url = address(settings, route);
  let response;
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeout),
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), Authorization: `Bearer ${key}`, 'X-Title': 'Desktop Pet'},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) { throw new Error(error.name === 'TimeoutError' ? 'The model took too long to answer.' : 'Could not reach the model service. Check your connection and the API address.'); }
  if (!response.ok) {
    const detail = await response.json().then(j => j?.error?.message ?? j?.error ?? j?.message, () => '');
    const hint = {401: 'The API key was rejected.', 402: 'The account has no credit left.', 404: 'That model was not found.', 429: 'Too many requests; try again in a moment.'}[response.status];
    // The service's own words go along: "too many requests" can mean a busy model as much as a busy account.
    // Never for a rejected key, and never anything key-like, should a service quote one back.
    const said = detail && response.status !== 401 && response.status !== 403
      ? String(typeof detail === 'string' ? detail : JSON.stringify(detail)).split(key).join('…').replace(/\b(sk|key)[-_][A-Za-z0-9_-]{6,}/gi, '…').slice(0, 200) : '';
    throw new Error(hint ? `${hint}${said ? ` (${said})` : ''}` : `The model service answered ${response.status}${said ? `: ${said}` : ''}.`);
  }
  return response;
}

async function complete(settings, key, model, messages, options = {}) {
  const response = await request(settings, key, '/chat/completions', {body: {model, messages, ...options}});
  const choice = (await response.json())?.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content) ? content.map(part => part.text || '').join('') : content;
  if (typeof text !== 'string' || !text.trim()) throw new Error(choice?.finish_reason === 'length' ? 'The model ran out of room before answering. Try a different model.' : 'The model returned an empty reply.');
  return text.trim();
}

export const chat = (settings, key, messages) => complete(settings, key, settings.chatModel, messages, {max_tokens: 400, temperature: 0.9});

// Pulls the first JSON object out of a model's answer, tolerating code fences, prose around it and trailing commas.
export function looseJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) { if (char === '\\') i++; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      const candidate = text.slice(start, i + 1);
      for (const attempt of [candidate, candidate.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(attempt); } catch { /* try the repaired form */ } }
      return null;
    }
  }
  return null;
}

// Asks a vision model what the animal in the photos looks like and returns drawable traits.
export async function describePhotos(settings, key, photos, species, description = '') {
  const ask = `These are ${photos.length} photo(s) of one pet ${species}. Describe it.${description ? `\nThe owner adds: "${description}". Trust the owner where the photos are unclear.` : ''}
Reply with one JSON object and nothing else, using exactly these keys:
- "species": "cat" or "dog"
- "breed": the closest of ${BREEDS[species === 'dog' ? 'dog' : 'cat'].map(breed => `"${breed.id}" (${breed.en})`).join(', ')}
- "weight": your estimate of its weight in kilograms, as a number
- "base": main coat colour as "#rrggbb"
- "secondary": marking colour as "#rrggbb"
- "belly": chest and belly colour as "#rrggbb"
- "eye": eye colour as "#rrggbb"
- "pattern": one of ${PATTERNS.map(p => `"${p}"`).join(', ')} (tabby = stripes, bicolor = coat plus white, tuxedo = black and white, points = dark face, ears, paws and tail)
- "ears": one of ${EARS.map(p => `"${p}"`).join(', ')}
- "tail": one of ${TAILS.map(p => `"${p}"`).join(', ')}
- "size": a number from 0.8 (small breed) to 1.3 (large breed)
- "fluff": a number from 0 (short coat) to 1 (long coat)
- "tufts": a number from 0 (none) to 1 (very long hairs growing from the ear tips)`;
  const content = [{type: 'text', text: ask}, ...photos.map(url => ({type: 'image_url', image_url: {url}}))];
  const reply = await complete(settings, key, settings.visionModel, [{role: 'user', content}], {max_tokens: 2000, temperature: 0.2, response_format: {type: 'json_object'}});
  const parsed = looseJson(reply);
  if (!parsed) throw new Error(`The vision model answered, but not in the form asked for. It said: "${reply.replace(/\s+/g, ' ').slice(0, 140)}"`);
  return normalizeTraits({...parsed, species: parsed.species === 'cat' || parsed.species === 'dog' ? parsed.species : species});
}

// Speech to text through a model that accepts audio. Input is a base64 WAV recording.
export function transcribe(settings, key, wavBase64) {
  const content = [
    {type: 'text', text: 'Write down exactly what is said in this recording, in the language spoken. Reply with the words only. If nothing is said, reply with an empty line.'},
    {type: 'input_audio', input_audio: {data: wavBase64, format: 'wav'}}
  ];
  return complete(settings, key, settings.listenModel, [{role: 'user', content}], {max_tokens: 1000, temperature: 0}).then(text => text.replace(/^["“]|["”]$/g, ''));
}

// Text to speech through the service. Returns base64 MP3.
export async function speak(settings, key, text) {
  const response = await request(settings, key, '/audio/speech', {body: {model: settings.voiceModel, voice: settings.voiceName, input: text.slice(0, 600), response_format: 'mp3'}});
  if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('The speech service did not return audio.');
  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

// One generated picture from a prompt and reference photos (data URLs). Returns PNG or JPEG bytes.
export async function generateImage(settings, key, prompt, references = []) {
  const response = await request(settings, key, '/images', {timeout: 240000, body: {
    model: settings.imageModel, prompt, n: 1, aspect_ratio: '16:9',
    input_references: references.map(url => ({type: 'image_url', image_url: {url}}))
  }});
  const image = (await response.json())?.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, 'base64');
  if (image?.url) return Buffer.from(await (await fetch(image.url, {signal: AbortSignal.timeout(120000)})).arrayBuffer());
  throw new Error('The image model returned no picture.');
}

// Starts an image-to-video job that begins and ends on the same frame, so the clip loops and joins any other clip cleanly.
export async function startVideo(settings, key, {prompt, frame, seconds}) {
  const still = {type: 'image_url', image_url: {url: frame}};
  const response = await request(settings, key, '/videos', {body: {
    model: settings.videoModel, prompt, duration: seconds, resolution: '720p', aspect_ratio: '16:9', generate_audio: false,
    frame_images: [{...still, frame_type: 'first_frame'}, {...still, frame_type: 'last_frame'}]
  }});
  const job = await response.json();
  if (!job?.id) throw new Error('The video service did not start a job.');
  return job;
}

// Checks a job once. Returns {status} while it runs, {status: 'completed', video: Buffer} when done; throws if it failed.
export async function checkVideo(settings, key, job) {
  const current = await (await request(settings, key, job.polling_url || `/videos/${job.id}`)).json();
  if (['failed', 'cancelled', 'expired'].includes(current.status)) throw new Error(`Video generation ${current.status}${current.error ? `: ${String(current.error?.message ?? current.error).slice(0, 200)}` : ''}.`);
  if (current.status !== 'completed') return {status: current.status || 'pending'};
  // The service's own download addresses need the key; anything hosted elsewhere must never be sent it.
  const link = current.unsigned_urls?.[0] || `/videos/${current.id || job.id}/content?index=0`;
  const ours = !/^https?:/.test(link) || new URL(link).origin === new URL(settings.baseUrl).origin;
  const download = ours ? await request(settings, key, link, {timeout: 180000}) : await fetch(link, {signal: AbortSignal.timeout(180000)});
  if (!download.ok) throw new Error(`The finished video could not be downloaded (${download.status}).`);
  return {status: 'completed', video: Buffer.from(await download.arrayBuffer()), cost: current.usage?.cost ?? null};
}
