// Long-term memory and reply parsing. Pure functions over plain arrays, so they can be tested without a model.
export const ACTIONS = ['jump', 'run', 'sit', 'sleep', 'spin', 'come', 'loaf', 'stretch', 'scratch', 'groom', 'mew', 'meow', 'yawn', 'roll', 'nuzzle', 'play'];
const MAX_MEMORIES = 200;

// Owners often tell the pet its name the way they would tell it a fact: "你叫Gigi", "your name is Gigi".
// That is a rename, not something to file under what it knows about its owner. Returns the name, or null.
export function nameFrom(text) {
  const match = String(text ?? '').trim().match(/^(?:(?:从现在起|以后|今后)?你(?:的名字)?(?:就)?(?:叫做|叫|名字是)|your name is|you are called|you're called|call yourself)\s*[:：]?\s*["“”'‘’「]?([^"“”'‘’」。.!！，,;；\s]{1,24})/i);
  // "你叫什么名字" is a question, not a name.
  return match && !/^(什么|啥|谁|what|who)/i.test(match[1]) ? match[1] : null;
}
export const cleanName = value => String(value ?? '').trim().replace(/^["“”'‘’「]+|["“”'‘’」。.!！]+$/g, '').slice(0, 24);

// The model writes [[remember: ...]], [[do: ...]] and [[name: ...]] inside a reply. They are stripped before the owner sees it.
export function parseReply(raw) {
  const remember = [], acts = [];
  let name = null;
  const text = String(raw ?? '').replace(/\[\[\s*(remember|do|name)\s*:\s*([^\]]*?)\s*\]\]/gi, (_, kind, value) => {
    if (kind.toLowerCase() === 'name') name = cleanName(value) || name;
    else if (kind.toLowerCase() === 'remember') { if (value) remember.push(value.slice(0, 200)); }
    else if (ACTIONS.includes(value.toLowerCase())) acts.push(value.toLowerCase());
    return '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?。，！？])/g, '$1').trim();
  return {text, remember, acts: [...new Set(acts)], name};
}

const normalize = text => text.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
// Words for Latin text, single characters and pairs for Chinese, Japanese and Korean, which have no spaces.
export function tokens(text) {
  const out = new Set();
  const lower = String(text).toLowerCase();
  for (const word of lower.match(/[a-z0-9]{2,}/g) || []) out.add(word);
  const cjk = lower.match(/[぀-ヿ㐀-鿿가-힯]/g) || [];
  cjk.forEach((char, i) => { out.add(char); if (cjk[i + 1]) out.add(char + cjk[i + 1]); });
  return out;
}

export function addMemories(list, facts, now = Date.now()) {
  const next = [...list];
  for (const fact of facts) {
    const key = normalize(fact);
    if (!key) continue;
    const existing = next.find(m => normalize(m.text) === key);
    if (existing) existing.seenAt = now;
    else next.push({id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, text: fact.trim(), createdAt: now, seenAt: now});
  }
  // Oldest unused memories go first when the store is full.
  return next.sort((a, b) => b.seenAt - a.seenAt).slice(0, MAX_MEMORIES).sort((a, b) => a.createdAt - b.createdAt);
}

// Picks the memories worth putting in front of the model: those sharing words with what was just said, then the newest.
export function recall(list, query, limit = 8, now = Date.now()) {
  const wanted = tokens(query);
  const day = 24 * 60 * 60 * 1000;
  return list.map(memory => {
    let overlap = 0;
    for (const token of tokens(memory.text)) if (wanted.has(token)) overlap++;
    const recency = 1 / (1 + (now - memory.seenAt) / (7 * day));
    return {memory, score: overlap * 2 + recency};
  }).sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.memory);
}

// Keeps the conversation short enough to send every time. Turns are {role, content}.
export const trimHistory = (history, max = 24) => history.slice(-max);
