// The pet's four needs, each 0-100 where higher is better. Pure functions: no clock, no storage.
export const NEED_KEYS = ['food', 'water', 'energy', 'mood'];
const clamp = value => Math.max(0, Math.min(100, value));

export const defaultNeeds = () => ({food: 70, water: 70, energy: 80, mood: 70});

export const ITEMS = {
  kibble: {label: 'Kibble', bites: 5, effect: {food: 7}},
  treat: {label: 'Treat stick', bites: 4, effect: {food: 3, mood: 5}},
  water: {label: 'Water', bites: 5, effect: {water: 9}}
};

// Per-minute drift. Sleeping restores energy and slows everything else down.
export function tick(needs, minutes, {asleep = false} = {}) {
  const slow = asleep ? 0.4 : 1;
  const next = {
    food: needs.food - 0.9 * slow * minutes,
    water: needs.water - 1.2 * slow * minutes,
    energy: needs.energy + (asleep ? 4 : -0.5) * minutes,
    mood: needs.mood
  };
  // Mood sinks while hungry or thirsty and otherwise settles toward a content 65.
  const neglected = next.food < 25 || next.water < 25;
  next.mood += neglected ? -1.2 * minutes : Math.sign(65 - needs.mood) * Math.min(Math.abs(65 - needs.mood), 0.15 * minutes);
  return Object.fromEntries(NEED_KEYS.map(key => [key, clamp(next[key])]));
}

// Time passed while the app was closed. The pet gets hungry, but never starves while nobody could feed it.
export function applyOffline(needs, minutesAway) {
  const minutes = Math.max(0, Math.min(minutesAway, 8 * 60));
  const away = tick(needs, minutes, {asleep: true});
  return {food: Math.max(15, away.food), water: Math.max(15, away.water), energy: Math.max(60, away.energy), mood: Math.max(30, away.mood)};
}

export function consume(needs, item) {
  const effect = ITEMS[item]?.effect;
  if (!effect) throw new Error(`Unknown item: ${item}`);
  return Object.fromEntries(NEED_KEYS.map(key => [key, clamp(needs[key] + (effect[key] || 0))]));
}

export const stroke = needs => ({...needs, mood: clamp(needs.mood + 3)});

// What the pet would do next if left alone, most pressing first.
export function urge(needs) {
  if (needs.energy < 15) return 'sleep';
  if (needs.water < 30) return 'drink';
  if (needs.food < 30) return 'eat';
  return null;
}

// Does the pet want this item right now? Treats are always welcome.
export function wants(needs, item) {
  if (item === 'treat') return true;
  if (item === 'water') return needs.water < 85;
  return needs.food < 85;
}

// Plain words for the language model, so replies match what is on screen.
export function describe(needs) {
  const words = [];
  if (needs.food < 20) words.push('very hungry'); else if (needs.food < 45) words.push('a bit hungry'); else if (needs.food > 88) words.push('full');
  if (needs.water < 20) words.push('very thirsty'); else if (needs.water < 45) words.push('thirsty');
  if (needs.energy < 20) words.push('sleepy'); else if (needs.energy > 80) words.push('full of energy');
  if (needs.mood < 30) words.push('grumpy'); else if (needs.mood > 80) words.push('happy');
  return words.length ? words.join(', ') : 'content';
}
