// Alice in AI Land - single import point for every sprite.
import { CHARACTERS } from './sprites.characters.js';
import { CARDS } from './sprites.cards.js';
import { TILES } from './sprites.tiles.js';
import { OBJECTS } from './sprites.objects.js';
import { BOSSES } from './sprites.bosses.js';

export const GROUPS = [
  { id: 'characters', label: 'Characters', note: '16x16, multi-frame, palette-swappable', set: CHARACTERS },
  { id: 'cards',      label: 'Card Soldiers', note: 'One body, four suits - same pixels, swapped ink', set: CARDS },
  { id: 'bosses',     label: 'Bosses',     note: '32x32 encounter sprites',               set: BOSSES },
  { id: 'tiles',      label: 'Tiles',      note: '16x16 terrain, tileable edge to edge',  set: TILES },
  { id: 'objects',    label: 'Objects',    note: '16x16 pushables, pickups, machinery',   set: OBJECTS },
];

export const SPRITES = Object.assign({}, CHARACTERS, CARDS, BOSSES, TILES, OBJECTS);
export { CHARACTERS, CARDS, TILES, OBJECTS, BOSSES };
