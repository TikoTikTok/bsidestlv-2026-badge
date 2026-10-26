// Alice in AI Land - the art of a room, shared by every page that draws one.
//
// The stages page (src/gallery.js) and the level maker (src/maker.js) draw
// the same rooms from the same assets: five 8-way walk cycles under
// assets/characters/, the item and tile sets. Nothing is drawn in code -
// this module loads the sheets, dresses a map in a theme and paints a state
// onto a canvas. The rules stay in src/puzzle.js and src/chase.js; this
// only looks at what they produce.

import { seenBy, hazardAt } from './chase.js';

export const TILE = 48;

export const WALK_CHARACTERS = [
  { id: 'alice2',   label: 'Alice' },
  { id: 'rabbit',   label: 'White Rabbit' },
  { id: 'hatter',   label: 'Mad Hatter' },
  { id: 'queen',    label: 'Red Queen' },
  { id: 'cheshire', label: 'Cheshire Cat' },
];

/** The cast a timed room may put on a loop: a character id and what the maker calls it. */
export const HAZARD_CAST = [
  { id: 'queen',    label: 'Red Queen',    sight: 3 },
  { id: 'cheshire', label: 'Cheshire Cat', sight: 0 },
  { id: 'rabbit',   label: 'White Rabbit', sight: 0 },
  { id: 'hatter',   label: 'Mad Hatter',   sight: 0 },
];

export const loadImage = async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
};

/** One character: manifest + every frame, keyed by direction. */
export async function loadCharacter({ id, label }) {
  const dir = `assets/characters/${id}`;
  const meta = await (await fetch(`${dir}/${id}.json`)).json();
  const images = {};
  await Promise.all(Object.entries(meta.directions).flatMap(([d, files]) =>
    files.map(async (file, i) => { (images[d] ||= [])[i] = await loadImage(`${dir}/${file}`); })));
  return { id, label, meta, images };
}

/** A folder of single-image assets plus its manifest (items, tiles). */
export async function loadSet(folder, manifestKey) {
  const meta = await (await fetch(`assets/${folder}/${folder}.json`)).json();
  const list = meta[manifestKey];
  const images = {};
  await Promise.all(list.map(async (it) => {
    images[it.name] = await loadImage(`assets/${folder}/${it.file}`);
  }));
  return { meta, list, images };
}

/** Everything a room needs: the cast, the items and the tiles, loaded once. */
export async function loadScene() {
  const [characters, items, tiles] = await Promise.all([
    Promise.all(WALK_CHARACTERS.map(loadCharacter)),
    loadSet('items', 'items'),
    loadSet('tiles', 'tiles'),
  ]);
  const byId = Object.fromEntries(characters.map(c => [c.id, c]));
  return { characters, items, tiles, byId };
}

// ----------------------------------------------------------------- themes ----
// A stage picks its look from a theme: each map character maps to a list of
// tiles, and which one a cell gets is a hash of its coordinates. Deterministic,
// so the room looks hand-dressed but never shuffles between frames.

const hash2 = (x, y) => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h ^ (h >>> 16));
};
const pick = (list, x, y) => list[hash2(x, y) % list.length];

export const THEMES = {
  // the tea party is a walled garden
  garden: {
    label: 'the garden',
    '#': ['hedge_daisies', 'hedge_wide', 'hedge_daisies', 'hedge_roses',
          'hedge_wide', 'hedge_daisies', 'pillar_rose', 'hedge_daisies'],
    '.': ['floor_grass_clover', 'floor_grass_roses', 'floor_grass_flowers',
          'floor_grass_clover', 'floor_grass_flowers', 'floor_dirt_patch'],
    A: ['floor_grass_clover'],
    O: ['floor_dirt_patch'],
    b: ['floor_checker_framed'],
    L: ['floor_dirt_cross'],
    G: ['floor_dirt_cross'],
    D: ['floor_carpet_heart'],
    gateClosed: 'hedge_post_left',
  },
  // the gauntlet is the Queen's hall
  hall: {
    label: "the Queen's hall",
    // mostly plain: a banner every few cells reads as decoration, a banner on
    // every cell reads as noise and stops the wall looking like a wall
    '#': ['wall_blue', 'wall_blue', 'wall_blue', 'wall_blue', 'wall_blue',
          'wall_blue', 'pillar_blue', 'wall_blue', 'wall_blue',
          'wall_blue_banner_white', 'wall_blue', 'wall_blue_banner_red'],
    '.': ['floor_marble_plain', 'floor_marble_veined', 'floor_marble_plain',
          'floor_marble_cracked'],
    A: ['floor_marble_plain'],
    O: ['floor_marble_veined'],
    b: ['floor_checker_blue'],
    L: ['floor_marble_heart'],
    G: ['floor_carpet_heart'],
    D: ['floor_carpet_heart'],
    gateClosed: 'hedge_rail',
  },
  // a third dressing for the community's rooms: gold and cobbles
  court: {
    label: 'the court',
    '#': ['wall_gold_banner_plain', 'wall_gold_banner_plain', 'wall_gold_banner_plain', 'wall_gold_heart',
          'wall_gold_banner_plain', 'wall_gold_medallion', 'wall_gold_banner_plain', 'wall_gold_pennant'],
    '.': ['floor_cobble', 'floor_cobble', 'floor_cobble_moss', 'floor_cobble', 'floor_cobble_cracked'],
    A: ['floor_cobble'],
    O: ['floor_cobble_moss'],
    b: ['floor_diamond_blue'],
    L: ['floor_carpet_red'],
    G: ['floor_carpet_red'],
    D: ['floor_carpet_red'],
    gateClosed: 'rail_roses_block',
  },
};

/** The theme a stage names (`theme: 'hall'`), else the one its kind implies. */
export const themeOf = (stage) => THEMES[stage?.theme] ?? (stage?.hazards?.length || stage?.tickMs ? THEMES.hall : THEMES.garden);

/**
 * Every cell gets a floor first, then whatever stands on it. Some wall pieces -
 * pillars, posts, rails - are narrower than a cell, and without a floor beneath
 * them the gap is just background showing through.
 */
export function drawCell(ctx, scene, theme, ch, x, y, size = TILE) {
  const px = x * size, py = y * size;
  const floorList = theme[ch] && ch !== '#' ? theme[ch] : theme['.'];
  ctx.drawImage(scene.tiles.images[pick(floorList, x, y)], px, py, size, size);
  if (ch === '#') ctx.drawImage(scene.tiles.images[pick(theme['#'], x, y)], px, py, size, size);
}

/**
 * Paint a room: the map dressed in `theme`, the gate, levers, buttons and the
 * door as the state leaves them, the rocks, the cast of a timed room on their
 * loops (and what a watcher sees this tick), and Alice. `state` is a state of
 * src/puzzle.js or src/chase.js; a timed map carries `hazards` and `period`.
 *
 *   now        the clock the walk cycles step to
 *   facing     the way Alice looks (N S W E)
 *   walking    true while her feet should move
 *   beatMs     one walk frame, in ms
 *   dead       draws Alice faded
 *   onlyRows   paint the first n rows only (the landing page's unveiling)
 */
export function drawRoom(ctx, scene, map, state, theme, {
  now = 0, facing = 'S', walking = false, beatMs = 320, dead = false, onlyRows = Infinity, size = TILE,
} = {}) {
  const { byId, items, tiles } = scene;
  ctx.imageSmoothingEnabled = false;
  const allHeld = state.rocks.every(r => map.buttons.has(r));
  const rows = Math.min(map.h, onlyRows);

  for (let y = 0; y < rows; y++) for (let x = 0; x < map.w; x++) {
    const i = y * map.w + x;
    const ch = map.rows[y][x];
    const px = x * size, py = y * size;
    drawCell(ctx, scene, theme, ch, x, y, size);
    if (map.gates.has(i) && !state.lever) ctx.drawImage(tiles.images[theme.gateClosed], px, py, size, size);
    if (map.levers.has(i)) ctx.drawImage(tiles.images[state.lever ? 'lever_down' : 'lever_up'], px, py, size, size);
    if (map.buttons.has(i)) ctx.drawImage(tiles.images[state.rocks.includes(i) ? 'button_heart_down' : 'button_heart_up'], px, py, size, size);
    if (i === map.door) ctx.drawImage(tiles.images[allHeld ? 'door_heart_open' : 'door_heart_closed'], px, py, size, size);
  }
  if (rows < map.h) return;

  // what a watcher can see this tick - the rule is invisible otherwise
  const hazards = map.hazards ?? [];
  const phase = state.phase ?? 0;
  for (const hz of hazards) {
    if (!hz.sight) continue;
    for (let i = 0; i < map.w * map.h; i++) {
      if (!seenBy(map, hz, phase, i)) continue;
      ctx.fillStyle = 'rgba(226, 64, 84, .22)';
      ctx.fillRect((i % map.w) * size, ((i / map.w) | 0) * size, size, size);
    }
  }

  for (const rock of state.rocks)
    ctx.drawImage(items.images.rock_pair, (rock % map.w) * size, ((rock / map.w) | 0) * size, size, size);

  // the cast, facing the way they are walking
  for (const hz of hazards) {
    const character = byId[hz.character ?? hz.id];
    if (!character || !hz.cells?.length) continue;
    const cell = hazardAt(map, hz, phase);
    const ahead = hazardAt(map, hz, phase + 1);
    const dx = Math.sign((ahead % map.w) - (cell % map.w));
    const dy = Math.sign(((ahead / map.w) | 0) - ((cell / map.w) | 0));
    const dir = dy < 0 ? 'N' : dy > 0 ? 'S' : dx > 0 ? 'E' : 'W';
    const cyc = character.meta.cycle ?? [0, 1, 0, 2];
    const img = character.images[dir][cyc[Math.floor(now / beatMs) % cyc.length]];
    ctx.drawImage(img, (cell % map.w) * size, ((cell / map.w) | 0) * size, size, size);
  }

  const alice = byId.alice2;
  const cyc = alice.meta.cycle ?? [0, 1, 0, 2];
  const frame = alice.images[facing][cyc[walking ? Math.floor(now / beatMs) % cyc.length : 0]];
  ctx.globalAlpha = dead ? 0.35 : 1;
  ctx.drawImage(frame, (state.alice % map.w) * size, ((state.alice / map.w) | 0) * size, size, size);
  ctx.globalAlpha = 1;
}
