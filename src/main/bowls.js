import fs from 'node:fs';
import path from 'node:path';
import {generateImage} from './llm.js';

// The owner's own food and water bowls, made from their photos. Files live beside pet.json:
//   bowls/KIND.png    the bowl cut out of its green screen, cropped to it
//   bowls/bowls.json  for each kind, the picture's size and the row where the rim's middle runs
export const BOWL_KINDS = ['kibble', 'water'];
const NAMES = {kibble: 'food bowl', water: 'water bowl'};

export function bowlPrompt({kind, description = '', photos = 0}) {
  const what = NAMES[kind] ?? 'bowl';
  return [
    photos
      ? `Create a photorealistic product photograph of this exact pet ${what}: the same shape, size, colours, material and pattern as in the reference photo${photos > 1 ? 's' : ''}.`
      : `Create a photorealistic product photograph of a pet ${what}.`,
    description.trim() ? `The owner describes it like this: "${description.trim()}".` : '',
    'The bowl is empty and stands on its own.',
    'It is seen from the side and slightly from above, so that the opening shows as a narrow oval at the top and the outside wall below it.',
    'It is centred and fills about half the width of the picture, with empty space all round it.',
    'Background: one flat, uniform, pure green chroma-key screen (#00FF00) filling the entire frame. No shadow, no floor line, no props, no text, no food.',
    'Soft, even studio lighting.'
  ].filter(Boolean).join('\n');
}

export function createBowls(directory, {settings, key}) {
  const home = path.join(directory, 'bowls');
  const file = name => path.join(home, name);
  const readShapes = () => { try { return JSON.parse(fs.readFileSync(file('bowls.json'), 'utf8')); } catch { return {}; } };
  const check = kind => { if (!BOWL_KINDS.includes(kind)) throw new Error('Unknown bowl.'); };

  // Paints the bowl on a green screen and hands the picture back; the settings window cuts it out and saves it.
  async function make({kind, photos = [], description = ''}) {
    check(kind);
    const image = await generateImage(settings(), key(), bowlPrompt({kind, description, photos: photos.length}), photos.slice(0, 3));
    return {picture: `data:image/png;base64,${Buffer.from(image).toString('base64')}`};
  }
  function save({kind, png, shape}) {
    check(kind);
    if (!/^data:image\/png;base64,/.test(png ?? '') || !(shape?.width > 0 && shape?.height > 0)) throw new Error('Nothing to save.');
    fs.mkdirSync(home, {recursive: true});
    fs.writeFileSync(file(`${kind}.png`), Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(file('bowls.json'), JSON.stringify({...readShapes(), [kind]: {width: shape.width, height: shape.height, rim: shape.rim}}, null, 2));
    return load();
  }
  function reset(kind) {
    check(kind);
    fs.rmSync(file(`${kind}.png`), {force: true});
    const shapes = readShapes(); delete shapes[kind];
    if (fs.existsSync(home)) fs.writeFileSync(file('bowls.json'), JSON.stringify(shapes, null, 2));
    return load();
  }
  // {kibble: {url, width, height, rim}, water: ...} for the bowls the owner has made.
  function load() {
    const shapes = readShapes(), out = {};
    for (const kind of BOWL_KINDS) {
      if (shapes[kind] && fs.existsSync(file(`${kind}.png`))) out[kind] = {...shapes[kind], url: `data:image/png;base64,${fs.readFileSync(file(`${kind}.png`)).toString('base64')}`};
    }
    return out;
  }
  return {make, save, reset, load};
}
