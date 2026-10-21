// What a pet looks like. The renderer draws entirely from this object, so a look can come from
// photo analysis, a vision model, or the owner's own choices, and always animates the same way.
import {breedOf, usualWeight, sizeFor, SEXES} from './breeds.js';

export const SPECIES = ['cat', 'dog'];
export const PATTERNS = ['solid', 'tabby', 'bicolor', 'tuxedo', 'spots', 'points'];
export const EARS = ['pointed', 'floppy', 'folded'];
export const TAILS = ['long', 'fluffy', 'short', 'curled'];

const DEFAULTS = {
  cat: {species: 'cat', name: 'Mochi', base: '#e8a35c', secondary: '#b9692b', belly: '#fff3e2', eye: '#7fb069', pattern: 'tabby', ears: 'pointed', tail: 'long', size: 1, fluff: 0.3, tufts: 0, breed: '', sex: '', weight: 4.5},
  dog: {species: 'dog', name: 'Biscuit', base: '#d9a066', secondary: '#f6ead8', belly: '#f6ead8', eye: '#5a3a22', pattern: 'bicolor', ears: 'floppy', tail: 'curled', size: 1.1, fluff: 0.4, tufts: 0, breed: '', sex: '', weight: 12}
};
export const defaultTraits = (species = 'cat') => ({...DEFAULTS[species === 'dog' ? 'dog' : 'cat']});

const hex = value => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : null;
const pick = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const range = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Number(value))) : fallback;

// Accepts anything (a model's JSON, an old save, a form) and returns a complete, drawable set of traits.
export function normalizeTraits(input = {}, fallback) {
  const species = pick(input.species, SPECIES, fallback?.species || 'cat');
  const base = {...defaultTraits(species), ...(fallback?.species === species ? fallback : {})};
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 24) : base.name;
  // Who it is: breed, sex and weight. A weight, when given, decides how large it is drawn.
  const breed = breedOf(species, input.breed) ? input.breed : input.breed === '' ? '' : breedOf(species, base.breed) ? base.breed : '';
  const weighed = input.weight !== undefined && input.weight !== '' && Number.isFinite(Number(input.weight));
  const weight = Math.round(range(weighed ? input.weight : NaN, 0.5, 90, base.weight ?? usualWeight(species, breed)) * 10) / 10;
  return {
    species, name, breed, sex: pick(input.sex, SEXES, input.sex === '' ? '' : base.sex ?? ''), weight,
    base: hex(input.base) || base.base,
    secondary: hex(input.secondary) || base.secondary,
    belly: hex(input.belly) || base.belly,
    eye: hex(input.eye) || base.eye,
    pattern: pick(input.pattern, PATTERNS, base.pattern),
    ears: pick(input.ears, EARS, base.ears),
    tail: pick(input.tail, TAILS, base.tail),
    size: weighed ? sizeFor(species, weight) : range(input.size, 0.8, 1.3, base.size),
    fluff: range(input.fluff, 0, 1, base.fluff),
    tufts: range(input.tufts, 0, 1, base.tufts) // long hairs at the ear tips
  };
}

const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
export const parseHex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));

// Estimates coat colours from one photo's RGBA pixels, with no model and no network.
// The pet is assumed to fill the middle of the frame: the border estimates the background,
// and whatever in the centre differs from it is treated as coat.
export function analyzePixels(rgba, width, height) {
  const at = (x, y) => { const i = (y * width + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };
  const border = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 60));
  for (let x = 0; x < width; x += step) border.push(at(x, 0), at(x, height - 1));
  for (let y = 0; y < height; y += step) border.push(at(0, y), at(width - 1, y));
  const background = border.reduce((sum, c) => sum.map((v, i) => v + c[i] / border.length), [0, 0, 0]);

  const buckets = new Map();
  let total = 0;
  for (let y = Math.floor(height * 0.2); y < height * 0.8; y += step) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x += step) {
      const colour = at(x, y);
      if (distance(colour, background) < 46) continue;
      const key = colour.map(v => v >> 5).join(',');
      const bucket = buckets.get(key) || {sum: [0, 0, 0], count: 0};
      bucket.sum = bucket.sum.map((v, i) => v + colour[i]); bucket.count++;
      buckets.set(key, bucket); total++;
    }
  }
  if (total < 20) return null; // nothing stands out from the background
  const ranked = [...buckets.values()].map(b => ({colour: b.sum.map(v => v / b.count), share: b.count / total})).sort((a, b) => b.share - a.share);
  // Merge near-identical buckets so one coat colour is not counted as several.
  const groups = [];
  for (const entry of ranked) {
    const near = groups.find(g => distance(g.colour, entry.colour) < 60);
    if (near) { near.colour = mix(near.colour, entry.colour, entry.share / (near.share + entry.share)); near.share += entry.share; }
    else groups.push({...entry});
  }
  groups.sort((a, b) => b.share - a.share);
  const [first, second] = groups;
  return {base: first.colour, secondary: second?.colour || null, secondaryShare: second?.share || 0, coverage: total};
}

// Combines the analysis of 1-3 photos into traits. Shape (ears, tail) cannot be read from colour alone and is left to the caller.
export function traitsFromAnalyses(analyses, species) {
  const usable = analyses.filter(Boolean);
  if (!usable.length) return null;
  const weight = usable.reduce((sum, a) => sum + a.coverage, 0);
  const base = usable.reduce((sum, a) => sum.map((v, i) => v + a.base[i] * a.coverage / weight), [0, 0, 0]);
  const strongest = usable.filter(a => a.secondary).sort((a, b) => b.secondaryShare - a.secondaryShare)[0];
  const share = strongest?.secondaryShare || 0;
  const secondary = strongest ? strongest.secondary : mix(base, [0, 0, 0], 0.35);
  const light = c => (c[0] + c[1] + c[2]) / 3;
  let pattern = 'solid';
  if (share > 0.22) pattern = light(secondary) > 200 || light(base) > 200 ? (Math.min(light(base), light(secondary)) < 70 ? 'tuxedo' : 'bicolor') : (species === 'dog' ? 'spots' : 'tabby');
  else if (share > 0.08) pattern = species === 'dog' ? 'spots' : 'tabby';
  // Keep the darker, more saturated colour as the coat and a light one as the belly.
  const coat = pattern === 'tuxedo' || pattern === 'bicolor' ? (light(base) < light(secondary) ? base : secondary) : base;
  const other = coat === base ? secondary : base;
  return {species, base: toHex(coat), secondary: toHex(other), belly: toHex(light(other) > 170 ? other : mix(coat, [255, 255, 255], 0.75)), pattern};
}
