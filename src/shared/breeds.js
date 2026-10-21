// Common breeds and coat types the owner can pick from. `look` is how the breed is described to the image model;
// base, pattern and fluff colour the simple stand-in that is shown until a realistic look has been generated;
// kg is a typical adult weight, offered as a starting point.
export const BREEDS = {
  cat: [
    {id: 'lihua', zh: '狸花猫', en: 'Chinese Li Hua (Dragon Li)', look: 'Chinese Li Hua (Dragon Li) cat with a short brown mackerel-tabby coat and bold black stripes', base: '#8a6f4d', pattern: 'tabby', kg: 4.5},
    {id: 'black', zh: '玄猫（纯黑）', en: 'Black cat', look: 'solid black domestic shorthair cat with a glossy jet-black coat', base: '#1c1b1d', pattern: 'solid', kg: 4.5},
    {id: 'orange', zh: '橘猫', en: 'Orange tabby', look: 'orange (ginger) tabby domestic shorthair cat', base: '#e39a4e', pattern: 'tabby', kg: 5.5},
    {id: 'calico', zh: '三花猫', en: 'Calico', look: 'calico domestic shorthair cat with white, orange and black patches', base: '#f2ece2', pattern: 'bicolor', kg: 4},
    {id: 'tortie', zh: '玳瑁猫', en: 'Tortoiseshell', look: 'tortoiseshell domestic shorthair cat with a mottled black and orange coat', base: '#4a3526', pattern: 'spots', kg: 4},
    {id: 'cow', zh: '奶牛猫', en: 'Tuxedo (black and white)', look: 'black-and-white tuxedo domestic shorthair cat', base: '#1f1f22', pattern: 'tuxedo', kg: 4.5},
    {id: 'white', zh: '白猫', en: 'White cat', look: 'pure white domestic shorthair cat', base: '#f5f2ec', pattern: 'solid', kg: 4},
    {id: 'british-blue', zh: '蓝猫（英国短毛猫）', en: 'British Shorthair (blue)', look: 'blue British Shorthair cat with a dense plush blue-grey coat, round face and stocky body', base: '#7e8794', pattern: 'solid', kg: 5.5},
    {id: 'golden', zh: '金渐层', en: 'British golden chinchilla', look: 'golden shaded British Shorthair cat with a warm golden coat tipped with black', base: '#d6a765', pattern: 'solid', kg: 5},
    {id: 'silver', zh: '银渐层', en: 'British silver shaded', look: 'silver shaded British Shorthair cat with a pale silver-white coat tipped with black', base: '#d9d9d6', pattern: 'solid', kg: 4.5},
    {id: 'american', zh: '美国短毛猫', en: 'American Shorthair', look: 'American Shorthair cat with a silver classic-tabby coat of swirling black markings', base: '#a9a9a6', pattern: 'tabby', kg: 5},
    {id: 'ragdoll', zh: '布偶猫', en: 'Ragdoll', look: 'Ragdoll cat with a long silky cream coat, darker face, ears, legs and tail, and blue eyes', base: '#efe6da', pattern: 'points', fluff: 0.9, kg: 6},
    {id: 'siamese', zh: '暹罗猫', en: 'Siamese', look: 'Siamese cat with a short cream coat, dark seal-brown face, ears, legs and tail, and blue eyes', base: '#e8d9c3', pattern: 'points', kg: 4},
    {id: 'maine', zh: '缅因猫', en: 'Maine Coon', look: 'Maine Coon cat: very large, with a long shaggy brown tabby coat, a ruff, a plumed tail and tufted ears', base: '#7a5a3c', pattern: 'tabby', fluff: 1, kg: 8},
    {id: 'persian', zh: '波斯猫', en: 'Persian', look: 'Persian cat with a very long thick coat and a flat face', base: '#f0ebe2', pattern: 'solid', fluff: 1, kg: 4.5},
    {id: 'exotic', zh: '加菲猫（异国短毛猫）', en: 'Exotic Shorthair', look: 'Exotic Shorthair cat with a flat face, round body and a short plush coat', base: '#e0a868', pattern: 'tabby', kg: 5},
    {id: 'fold', zh: '苏格兰折耳猫', en: 'Scottish Fold', look: 'Scottish Fold cat with small ears folded forward and a round face', base: '#9aa0a8', pattern: 'solid', ears: 'folded', kg: 4.5},
    {id: 'russian', zh: '俄罗斯蓝猫', en: 'Russian Blue', look: 'Russian Blue cat with a short silvery blue-grey coat, slender body and green eyes', base: '#7d8791', pattern: 'solid', kg: 4},
    {id: 'bengal', zh: '孟加拉豹猫', en: 'Bengal', look: 'Bengal cat with a golden coat covered in dark leopard-like rosettes', base: '#c9995a', pattern: 'spots', kg: 5},
    {id: 'norwegian', zh: '挪威森林猫', en: 'Norwegian Forest Cat', look: 'Norwegian Forest Cat with a long thick brown tabby coat, a ruff and a bushy tail', base: '#8b7355', pattern: 'tabby', fluff: 1, kg: 6.5},
    {id: 'siberian', zh: '西伯利亚猫', en: 'Siberian', look: 'Siberian cat with a long dense coat and a sturdy body', base: '#8f7a62', pattern: 'tabby', fluff: 0.9, kg: 6},
    {id: 'abyssinian', zh: '阿比西尼亚猫', en: 'Abyssinian', look: 'Abyssinian cat with a short ticked ruddy-brown coat, large ears and a slender body', base: '#c08552', pattern: 'solid', kg: 4},
    {id: 'devon', zh: '德文卷毛猫', en: 'Devon Rex', look: 'Devon Rex cat with a short wavy coat, very large ears and a slender body', base: '#b9b2a7', pattern: 'solid', kg: 3.5},
    {id: 'munchkin', zh: '曼基康矮脚猫', en: 'Munchkin', look: 'Munchkin cat with very short legs', base: '#d9b382', pattern: 'bicolor', kg: 3.5},
    {id: 'sphynx', zh: '斯芬克斯无毛猫', en: 'Sphynx', look: 'hairless Sphynx cat with wrinkled skin and very large ears', base: '#d9b8a3', pattern: 'solid', kg: 4},
    {id: 'other', zh: '其他 / 混血', en: 'Other or mixed', look: '', base: '#b9a48c', pattern: 'solid', kg: 4.5}
  ],
  dog: [
    {id: 'tugou', zh: '中华田园犬', en: 'Chinese rural dog', look: 'Chinese rural dog: medium-sized, short tan coat, upright ears and a curled tail', base: '#c99a5b', pattern: 'solid', kg: 15},
    {id: 'shiba', zh: '柴犬', en: 'Shiba Inu', look: 'Shiba Inu with a red-and-cream coat, upright ears and a curled tail', base: '#d58e4a', pattern: 'bicolor', kg: 9},
    {id: 'corgi', zh: '柯基', en: 'Corgi', look: 'Pembroke Welsh Corgi with short legs, a red-and-white coat and large upright ears', base: '#d99a56', pattern: 'bicolor', kg: 11},
    {id: 'golden', zh: '金毛寻回犬', en: 'Golden Retriever', look: 'Golden Retriever with a long golden coat', base: '#d9a85c', pattern: 'solid', fluff: 0.8, kg: 30},
    {id: 'labrador', zh: '拉布拉多', en: 'Labrador Retriever', look: 'Labrador Retriever with a short dense coat', base: '#e3c78f', pattern: 'solid', kg: 30},
    {id: 'husky', zh: '哈士奇', en: 'Siberian Husky', look: 'Siberian Husky with a grey-and-white coat, a white facial mask and upright ears', base: '#7b7f87', pattern: 'bicolor', kg: 22},
    {id: 'samoyed', zh: '萨摩耶', en: 'Samoyed', look: 'Samoyed with a thick fluffy pure white coat and a smiling face', base: '#f6f3ee', pattern: 'solid', fluff: 1, kg: 23},
    {id: 'poodle', zh: '泰迪 / 贵宾', en: 'Poodle (teddy cut)', look: 'toy Poodle with a curly coat in a teddy-bear cut', base: '#a9683a', pattern: 'solid', fluff: 0.9, kg: 4},
    {id: 'bichon', zh: '比熊', en: 'Bichon Frise', look: 'Bichon Frise with a fluffy curly white coat and a rounded head', base: '#f7f4ef', pattern: 'solid', fluff: 1, kg: 5},
    {id: 'pomeranian', zh: '博美', en: 'Pomeranian', look: 'Pomeranian with a very fluffy coat and a fox-like face', base: '#e2a35c', pattern: 'solid', fluff: 1, kg: 2.5},
    {id: 'frenchie', zh: '法国斗牛犬', en: 'French Bulldog', look: 'French Bulldog with a compact muscular body, a flat face and bat ears', base: '#c9b08a', pattern: 'solid', kg: 11},
    {id: 'border', zh: '边境牧羊犬', en: 'Border Collie', look: 'Border Collie with a black-and-white medium-long coat', base: '#232326', pattern: 'tuxedo', fluff: 0.7, kg: 18},
    {id: 'shepherd', zh: '德国牧羊犬', en: 'German Shepherd', look: 'German Shepherd with a black-and-tan coat and upright ears', base: '#a8763f', pattern: 'bicolor', kg: 32},
    {id: 'chihuahua', zh: '吉娃娃', en: 'Chihuahua', look: 'Chihuahua: tiny, with large upright ears', base: '#d7b27e', pattern: 'solid', kg: 2.2},
    {id: 'schnauzer', zh: '雪纳瑞', en: 'Miniature Schnauzer', look: 'Miniature Schnauzer with a wiry salt-and-pepper coat, a beard and bushy eyebrows', base: '#8d8f93', pattern: 'bicolor', kg: 7},
    {id: 'dachshund', zh: '腊肠犬', en: 'Dachshund', look: 'Dachshund with a long body, very short legs and long drooping ears', base: '#8a5230', pattern: 'solid', kg: 8},
    {id: 'other', zh: '其他 / 混血', en: 'Other or mixed', look: '', base: '#c9a06a', pattern: 'solid', kg: 12}
  ]
};
export const SEXES = ['female', 'male'];
const kind = species => species === 'dog' ? 'dog' : 'cat';
export const breedOf = (species, id) => BREEDS[kind(species)].find(breed => breed.id === id) ?? null;
export const usualWeight = (species, id) => breedOf(species, id)?.kg ?? (kind(species) === 'dog' ? 12 : 4.5);

// How large the pet is drawn for its weight: 0.8 for the lightest, 1.3 for the heaviest of its kind.
export function sizeFor(species, kg) {
  const [light, heavy] = kind(species) === 'dog' ? [2, 40] : [2, 10];
  const share = Math.max(0, Math.min(1, (Number(kg) - light) / (heavy - light)));
  return Math.round((0.8 + 0.5 * share) * 100) / 100;
}

// A plain word for a colour, so a model is told "black" as well as "#1c1b1d".
export function colourWord(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(String(hex).slice(i, i + 2), 16));
  const high = Math.max(r, g, b), low = Math.min(r, g, b), light = (high + low) / 2, spread = high - low;
  if (spread < 28) return light < 50 ? 'black' : light < 95 ? 'dark grey' : light < 165 ? 'grey' : light < 225 ? 'light grey' : 'white';
  if (b > r && spread < 60) return light < 120 ? 'dark blue-grey' : 'blue-grey';
  if (r >= g && g >= b) {
    if (light < 60) return 'dark brown';
    if (light > 205) return 'cream';
    const warm = (r - g) / spread; // 0 = yellow, 1 = red
    return light < 115 ? 'brown' : warm > 0.55 ? 'orange' : spread < 75 ? 'tan' : 'golden';
  }
  return light < 90 ? 'dark' : 'pale';
}

// One English phrase saying what this animal is, for the image model and for the pet's own sense of itself.
export function portrait(traits, {hex = true} = {}) {
  const species = kind(traits.species), breed = breedOf(species, traits.breed);
  const parts = [];
  if (Number(traits.weight) > 0) parts.push(`${Math.round(traits.weight * 10) / 10} kg`);
  if (SEXES.includes(traits.sex)) parts.push(traits.sex);
  parts.push(breed?.look || species);
  let text = `a ${parts.join(' ')}`.replace(/^a ([aeio])/i, 'an $1');
  if (/^#[0-9a-f]{6}$/i.test(traits.base ?? '')) text += `; the main colour of its coat is ${colourWord(traits.base)}${hex ? ` (${traits.base})` : ''}`;
  if (hex && /^#[0-9a-f]{6}$/i.test(traits.eye ?? '')) text += `, and its eyes are ${traits.eye}`;
  return text;
}
