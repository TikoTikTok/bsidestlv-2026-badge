// Generates assets/sprites.tiles.js and assets/sprites.objects.js.
// The art is still hand-placed - the Grid helper just guarantees every row
// comes out exactly `w` characters wide so the sheet can never go ragged.
import { writeFileSync } from 'node:fs';
import { Grid } from './grid.mjs';

// ---------------------------------------------------------------- tiles ----

const speckle = (g, coords, c) => g.dots(coords, c);

function caveFloor() {
  const g = new Grid(16, 16, 'W');
  // sparse - a floor is background, it must not fight the sprites on top of it
  speckle(g, [[3,2],[12,6],[6,11],[14,13]], 'V');
  speckle(g, [[13,5],[5,10]], 'X');
  // a couple of loose pebbles - no long seams, the field has to tile quietly
  g.blit([' V ', 'VXV', ' V '], 5, 6, ' ');
  g.blit([' V ', 'VXV', ' V '], 11, 12, ' ');
  g.blit(['VV', 'VX'], 2, 3, ' ');
  return g;
}

function crackedFloor() {
  const g = caveFloor();
  g.dots([[3,1],[4,2],[4,3],[5,4],[6,4],[6,5],[7,6],[7,7],[8,8],[8,9],[9,10],[9,11],[10,12],[11,13],[11,14]], 'U');
  g.dots([[6,6],[5,7],[4,8],[10,9],[11,10],[12,11]], 'U');
  g.dots([[3,2],[5,5],[8,10],[10,13]], 'V');
  return g;
}

function circuitFloor() {
  const g = new Grid(16, 16, 'V');
  g.hline(0, 3, 16, 'W').hline(0, 11, 16, 'W');
  g.vline(3, 0, 16, 'W').vline(11, 0, 16, 'W');
  g.dots([[3,3],[11,3],[3,11],[11,11]], 'K');
  g.dots([[7,3],[3,7],[11,7],[7,11]], 'X');
  g.dots([[6,6],[9,9],[6,9],[9,6]], 'W');
  return g;
}

function wallFace() {
  const g = new Grid(16, 16, 'W');
  g.rect(0, 0, 16, 3, 'X');          // lit cap
  g.rect(0, 12, 16, 4, 'V');         // shadowed base
  g.hline(0, 3, 16, 'U');
  g.hline(0, 7, 16, 'U');
  g.hline(0, 11, 16, 'U');
  g.hline(0, 15, 16, 'U');
  g.vline(5, 4, 3, 'U'); g.vline(13, 4, 3, 'U');
  g.vline(1, 8, 3, 'U'); g.vline(9, 8, 3, 'U');
  g.vline(5, 12, 3, 'U'); g.vline(13, 12, 3, 'U');
  g.dots([[2,5],[7,5],[11,9],[3,13],[10,13]], 'V');
  return g;
}

function wallTop() {
  const g = new Grid(16, 16, 'X');
  g.rect(0, 0, 16, 2, '3');
  g.hline(0, 15, 16, 'U');
  g.hline(0, 14, 16, 'W');
  g.dots([[2,4],[9,3],[13,7],[5,9],[11,11],[3,12]], '3');
  g.dots([[6,6],[12,4],[1,8],[14,10]], 'W');
  return g;
}

function voidTile() {
  const g = new Grid(16, 16, 'U');
  g.dots([[3,4],[11,2],[7,9],[13,12],[2,13],[9,6]], 'V');
  g.dots([[4,5],[12,3]], 'W');
  return g;
}

function pitTile() {
  const g = caveFloor();
  g.blit([
    '  UUUUUUUUUUUU  ',
    ' UVVVVVVVVVVVU  ',
    'UVVVVVVVVVVVVVU ',
    'UVVVUUUUUUUVVVU ',
    'UVVUUUUUUUUUVVU ',
    'UVUUUUUUUUUUUVU ',
    'UVUUUUUUUUUUUVU ',
    'UVUUUUUUUUUUUVU ',
    'UVVUUUUUUUUUVVU ',
    'UVVVUUUUUUUVVVU ',
    'UVVVVVVVVVVVVVU ',
    ' UVVVVVVVVVVVU  ',
    '  UUUUUUUUUUUU  ',
  ], 0, 2);
  return g;
}

function pitFilled() {
  const g = pitTile();
  // a cube dropped in, sunk flush, top face still catching the light
  g.blit([
    ' UUUUUUUUUUUU ',
    'U333333333333U',
    'U3XXXXXXXXXX3U',
    'U3XXKXXXXKXX3U',
    'U3XXXXXXXXXX3U',
    'U3XXXXXKXXXX3U',
    'U3XXXXXXXXXX3U',
    'UWWWWWWWWWWWWU',
    ' UUUUUUUUUUUU ',
  ], 1, 4);
  return g;
}

function dataStream(phase) {
  const g = new Grid(16, 16, 'W');
  g.rect(0, 0, 16, 1, 'V');
  g.rect(0, 15, 16, 1, 'V');
  for (let y = 1; y < 15; y += 3) {
    const off = (phase * 3 + y * 2) % 16;
    for (let i = 0; i < 5; i++) g.set((off + i) % 16, y, '3');
    for (let i = 0; i < 3; i++) g.set((off + 8 + i) % 16, y + 1, 'X');
  }
  g.dots([[(2 + phase * 4) % 16, 4], [(11 + phase * 3) % 16, 10]], '4');
  return g;
}

function iceTile() {
  const g = new Grid(16, 16, '3');
  g.rect(0, 0, 16, 1, '4');
  g.rect(0, 15, 16, 1, 'X');
  g.blit([' 4    ', '  4   '], 2, 3, ' ');
  for (let i = 0; i < 6; i++) g.set(2 + i, 3 + Math.floor(i / 2), '4');
  for (let i = 0; i < 5; i++) g.set(9 + i, 9 + Math.floor(i / 3), '4');
  for (let i = 0; i < 4; i++) g.set(3 + i, 11, 'X');
  g.dots([[12,2],[13,3],[5,8],[6,9],[10,13]], '8');
  return g;
}

function conveyor(phase) {
  const g = new Grid(16, 16, 'V');
  g.hline(0, 0, 16, 'U'); g.hline(0, 15, 16, 'U');
  g.hline(0, 1, 16, 'W'); g.hline(0, 14, 16, 'W');
  for (let k = -1; k < 3; k++) {
    const x = k * 6 + phase * 3;
    for (let j = 0; j < 5; j++) {          // chevron pointing right
      g.set(x + j, 4 + j, 'X'); g.set(x + j, 12 - j, 'X');
      g.set(x + j + 1, 4 + j, '3'); g.set(x + j + 1, 12 - j, '3');
    }
    g.set(x + 5, 8, '3'); g.set(x + 6, 8, 'X');
  }
  return g;
}

function plate(pressed) {
  const g = caveFloor();
  if (pressed) {
    g.frame(3, 4, 10, 9, 'U').rect(4, 5, 8, 7, 'W').dots([[7,8],[8,8]], 'K');
  } else {
    g.frame(2, 3, 12, 11, 'U').rect(3, 4, 10, 9, 'X');
    g.hline(3, 4, 10, '3'); g.vline(3, 4, 9, '3');
    g.hline(3, 12, 10, 'W'); g.vline(12, 4, 9, 'W');
    g.rect(6, 7, 4, 3, 'K');
  }
  return g;
}

function gate(open) {
  const g = new Grid(16, 16, '.');
  g.rect(0, 0, 16, 2, 'V'); g.hline(0, 0, 16, 'U');
  if (open) {
    // bars retracted into the lintel; doorway below is walkable
    g.rect(0, 0, 16, 5, 'V');
    g.hline(0, 0, 16, 'U'); g.hline(0, 5, 16, 'U');
    for (const x of [2, 7, 12]) { g.rect(x, 1, 2, 4, '3'); g.vline(x, 1, 4, '4'); }
    g.vline(0, 0, 16, 'W'); g.vline(15, 0, 16, 'W');
    g.dots([[3,7],[12,10],[6,13]], 'W');
  } else {
    for (const x of [2, 7, 12]) { g.rect(x, 2, 2, 13, '3'); g.vline(x, 2, 13, '4'); g.vline(x + 1, 2, 13, 'X'); }
    g.hline(0, 8, 16, 'X'); g.hline(0, 9, 16, 'W');
    g.hline(0, 15, 16, 'U');
  }
  return g;
}

function portal(phase) {
  const g = new Grid(16, 16, 'U');
  const rings = ['V', 'O', '3', 'O', 'V'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 7.6) { g.set(x, y, '.'); continue; }
    const a = Math.atan2(dy, dx);
    const swirl = (d * 1.6 - a * 1.2 + phase * 1.6 + 10) % rings.length;
    g.set(x, y, rings[Math.floor(swirl)]);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 7.5, dy = y - 7.5;
    if (Math.sqrt(dx * dx + dy * dy) > 6.9 && g.get(x, y) !== '.') g.set(x, y, 'U');
  }
  g.dots([[7,7],[8,7],[7,8],[8,8]], '8');
  return g;
}

function stairs() {
  const g = new Grid(16, 16, 'V');
  for (let s = 0; s < 4; s++) {
    const y = s * 4;
    g.rect(s, y, 16 - s * 2, 4, s % 2 ? 'W' : 'X');
    g.hline(s, y, 16 - s * 2, 'U');
  }
  g.hline(0, 15, 16, 'U');
  return g;
}

function bridge() {
  const g = new Grid(16, 16, 'V');
  for (let y = 1; y < 16; y += 3) { g.rect(0, y, 16, 2, 'W'); g.hline(0, y, 16, 'X'); }
  g.vline(1, 0, 16, 'U'); g.vline(14, 0, 16, 'U');
  return g;
}

// -------------------------------------------------------------- objects ----

// Isometric-ish block used for every pushable: top face light, left mid, right dark.
function block(faceGlyph, opts = {}) {
  const { top = '3', left = 'X', right = 'W', edge = '4' } = opts;
  const g = new Grid(16, 16, '.');
  g.frame(0, 0, 16, 16, 'U');
  g.rect(1, 1, 14, 14, left);
  // chamfered top-lit bevel
  g.hline(1, 1, 14, edge); g.hline(1, 2, 14, top);
  g.vline(1, 1, 14, edge); g.vline(2, 2, 12, top);
  // shaded right + bottom bevel
  g.vline(14, 1, 14, right); g.vline(13, 2, 13, right);
  g.hline(1, 14, 14, right); g.hline(2, 13, 12, right);
  g.dots([[1,14],[14,1]], 'U');
  if (faceGlyph) g.blit(faceGlyph, 4, 4, ' ');
  return g;
}

const GLYPH_CORE = [
  ' KKKK  ',
  'K    K ',
  'K KK K ',
  'K KK K ',
  'K    K ',
  ' KKKK  ',
];

function dataCube() {
  return block([
    '.UUUUUUU.',
    'UKUUUUUKU',
    'UUKUUUKUU',
    'UUUKKKUUU',
    'UUKUKUKUU',
    'UUUKKKUUU',
    'UUKUUUKUU',
    'UKUUUUUKU',
    '.UUUUUUU.',
  ]);
}

function crackedCube() {
  const g = block(null, { top: 'X', left: 'W', right: 'V', edge: '3' });
  g.dots([[4,6],[5,7],[5,8],[6,9],[7,9],[7,10],[8,11],[8,12]], 'U');
  g.dots([[6,6],[3,9],[4,10],[10,8],[9,7]], 'U');
  g.dots([[5,6],[6,10],[9,12]], 'V');
  return g;
}

function mirrorCube() {
  const g = block(null, { top: '8', left: '4', right: '3', edge: '8' });
  for (let i = 0; i < 9; i++) { g.set(3 + i, 12 - i, '8'); g.set(4 + i, 12 - i, '8'); }
  for (let i = 0; i < 5; i++) { g.set(3 + i, 8 - i, '3'); }
  return g;
}

function anchorCube() {
  const g = block(null, { top: 'G', left: 'F', right: 'U', edge: 'G' });
  g.blit([
    'UUUUUUUU',
    'UGGGGGGU',
    'UGUUUUGU',
    'UGUGGUGU',
    'UGUGGUGU',
    'UGUUUUGU',
    'UGGGGGGU',
    'UUUUUUUU',
  ], 4, 4, ' ');
  return g;
}

function keyToken() {
  const g = new Grid(16, 16, '.');
  g.blit([
    '   UUUU    ',
    '  UGGGGU   ',
    ' UGUUUUGU  ',
    ' UGU  UGU  ',
    ' UGUUUUGU  ',
    '  UGGGGU   ',
    '   UGGU    ',
    '   UGGU    ',
    '   UGGUUU  ',
    '   UGGGGU  ',
    '   UGGUUU  ',
    '   UGGU    ',
    '   UGGUU   ',
    '   UGGGU   ',
    '   UUUUU   ',
  ], 2, 1, ' ');
  g.dots([[6,3],[6,4]], '4');
  return g;
}

function chest() {
  const g = new Grid(16, 16, '.');
  g.frame(1, 4, 14, 11, 'U');
  g.rect(2, 5, 12, 9, 'W');
  g.rect(2, 5, 12, 4, 'X');
  g.hline(2, 5, 12, '3');
  g.hline(2, 9, 12, 'U');
  g.vline(7, 5, 9, 'G'); g.vline(8, 5, 9, 'F');
  g.rect(6, 8, 4, 4, 'U'); g.rect(7, 9, 2, 2, 'G');
  g.dots([[3,6],[12,6]], '4');
  return g;
}

function sign() {
  const g = new Grid(16, 16, '.');
  g.frame(2, 2, 12, 9, 'U');
  g.rect(3, 3, 10, 7, 'X');
  g.hline(3, 3, 10, '3');
  g.hline(4, 5, 8, '4'); g.hline(4, 7, 6, '4'); g.hline(4, 9, 7, '4');
  g.rect(7, 11, 2, 4, 'W'); g.vline(7, 11, 4, 'U'); g.vline(9, 11, 4, 'U');
  g.hline(6, 15, 4, 'U');
  return g;
}

function torch(phase) {
  const g = new Grid(16, 16, '.');
  g.rect(6, 9, 4, 6, 'V'); g.frame(6, 9, 4, 7, 'U');
  g.hline(6, 10, 4, 'W');
  const flame = phase === 0 ? [
    '  S   ',
    ' SGS  ',
    ' SGGS ',
    'SGG4GS',
    'SG444S',
    ' S4G4S',
    '  SSS ',
  ] : [
    '   S  ',
    '  SGS ',
    ' SGGS ',
    'SG4GGS',
    'S444GS',
    'S4G4S ',
    ' SSS  ',
  ];
  g.blit(flame, 5, 2, ' ');
  return g;
}

function shard(phase) {
  const g = new Grid(16, 16, '.');
  const y = phase;                       // bob: 0,1,2 px
  g.blit([
    '  UUUU  ',
    ' UK4448 ',
    'UKK44448',
    'UKK44448',
    'UKKK4448',
    ' UKK444U',
    '  UK44U ',
    '   UUU  ',
  ], 4, 2 + y, ' ');
  g.dots([[3, 4 + y], [12, 8 + y]], '8');
  g.blit(['  VVVV  ', ' VVVVVV '], 4, 13, ' ');   // shadow on the ground
  return g;
}

function clock() {
  const g = new Grid(16, 16, '.');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 8.5);
    if (d <= 6.4) g.set(x, y, d > 5.4 ? 'F' : '4');
    if (d > 6.4 && d <= 7.2) g.set(x, y, 'U');
  }
  g.vline(7, 4, 5, 'U'); g.hline(8, 8, 4, 'U');
  g.dots([[7,3],[8,3],[7,14],[8,14],[2,8],[13,8]], 'F');
  g.rect(6, 0, 4, 2, 'G'); g.frame(6, 0, 4, 3, 'U');
  return g;
}

function lever(on) {
  const g = new Grid(16, 16, '.');
  g.rect(4, 11, 8, 4, 'W'); g.frame(4, 11, 8, 5, 'U');
  g.hline(5, 12, 6, 'X');
  const dir = on ? 1 : -1;
  for (let i = 0; i < 7; i++) g.set(7 + dir * Math.round(i * 0.8), 11 - i, '4');
  for (let i = 0; i < 7; i++) g.set(8 + dir * Math.round(i * 0.8), 11 - i, 'U');
  const kx = 7 + dir * 5, ky = 4;
  g.rect(kx - 1, ky - 1, 3, 3, on ? 'K' : 'C');
  g.frame(kx - 2, ky - 2, 5, 5, 'U');
  return g;
}

function terminal() {
  const g = new Grid(16, 16, '.');
  g.frame(1, 1, 14, 14, 'U');
  g.rect(2, 2, 12, 12, 'V');
  g.rect(3, 3, 10, 7, 'U');
  g.rect(4, 4, 8, 5, 'W');
  g.hline(4, 5, 5, 'K'); g.hline(4, 7, 7, 'K'); g.hline(4, 6, 3, '3');
  g.rect(3, 11, 10, 2, 'W');
  g.dots([[4,11],[6,11],[8,11]], 'K');
  g.dots([[10,12],[12,12]], 'C');
  return g;
}

function heart() {
  const g = new Grid(16, 16, '.');
  g.blit([
    ' UU  UU ',
    'UCCUUCCU',
    'UCDCCDCU',
    'UCCCCCCU',
    ' UCCCCU ',
    '  UCCU  ',
    '   UU   ',
  ], 4, 4, ' ');
  g.set(6, 5, '8'); g.set(6, 6, '8');
  return g;
}

function exitDoor() {
  const g = new Grid(16, 16, '.');
  g.frame(2, 1, 12, 15, 'U');
  g.rect(3, 2, 10, 13, 'W');
  g.rect(4, 4, 8, 11, 'O');
  for (let y = 4; y < 15; y++) for (let x = 4; x < 12; x++) if ((x + y) % 4 === 0) g.set(x, y, '3');
  g.hline(3, 2, 10, '3'); g.hline(3, 3, 10, 'X');
  g.dots([[7,8],[8,8],[7,9],[8,9]], '8');
  return g;
}

function spawnMark() {
  const g = caveFloor();
  g.frame(3, 3, 10, 10, 'K');
  g.frame(4, 4, 8, 8, 'U');
  g.blit([' K  K ', 'KKKKKK', ' K  K '], 5, 6, ' ');
  return g;
}

// ---------------------------------------------------------------- emit ----

const fmt = (rows) => rows.map(r => `        '${r}',`).join('\n');
const entry = (id, e) =>
`  ${id}: {
    label: ${JSON.stringify(e.label)},
    blurb: ${JSON.stringify(e.blurb)},
    w: 16, h: 16,${e.anim ? `\n    anim: ${JSON.stringify(e.anim)},` : ''}${e.tags ? `\n    tags: ${JSON.stringify(e.tags)},` : ''}
    frames: [
${e.frames.map(f => `      [\n${fmt(f.rows())}\n      ],`).join('\n')}
    ],
  },`;

const TILES = {
  floor_stone:  { label: 'Cave Floor',        blurb: 'Default walkable stone of the Deep Cache caves.', tags: ['walk'], frames: [caveFloor()] },
  floor_cracked:{ label: 'Cracked Floor',     blurb: 'Collapses into a pit the second time it is stepped on.', tags: ['walk','hazard'], frames: [crackedFloor()] },
  floor_circuit:{ label: 'Circuit Floor',     blurb: 'Powered plating. Carries a signal from plates to gates.', tags: ['walk','wired'], frames: [circuitFloor()] },
  wall_face:    { label: 'Cave Wall',         blurb: 'Solid. Blocks Alice and cubes alike.', tags: ['solid'], frames: [wallFace()] },
  wall_top:     { label: 'Wall Top',          blurb: 'Cap tile drawn above a wall face.', tags: ['solid'], frames: [wallTop()] },
  void:         { label: 'Void',              blurb: 'Out of bounds. Nothing renders past this.', tags: ['solid'], frames: [voidTile()] },
  pit:          { label: 'Null Pit',          blurb: 'Fall in and the stage resets. Push a cube in to bridge it.', tags: ['hazard'], frames: [pitTile()] },
  pit_filled:   { label: 'Filled Pit',        blurb: 'A cube sunk into a pit - now a walkable bridge.', tags: ['walk'], frames: [pitFilled()] },
  data_stream:  { label: 'Data Stream',       blurb: 'Flowing data. Carries loose cubes downstream.', tags: ['hazard','anim'], anim: { flow: [0,1,2] }, frames: [dataStream(0), dataStream(1), dataStream(2)] },
  ice:          { label: 'Gradient Slide',    blurb: 'Zero friction - everything keeps sliding until it hits something.', tags: ['walk','slide'], frames: [iceTile()] },
  conveyor:     { label: 'Conveyor',          blurb: 'Pushes whatever stands on it one tile per beat. Rotate for direction.', tags: ['walk','anim'], anim: { run: [0,1] }, frames: [conveyor(0), conveyor(1)] },
  plate_up:     { label: 'Pressure Plate',    blurb: 'Waiting for a cube or a foot.', tags: ['walk','wired'], frames: [plate(false)] },
  plate_down:   { label: 'Plate Pressed',     blurb: 'Held down. Its gate is open while this stays lit.', tags: ['walk','wired'], frames: [plate(true)] },
  gate_closed:  { label: 'Gate (closed)',     blurb: 'Bars down. Wired to one or more plates.', tags: ['solid','wired'], frames: [gate(false)] },
  gate_open:    { label: 'Gate (open)',       blurb: 'Bars retracted into the frame.', tags: ['walk','wired'], frames: [gate(true)] },
  portal:       { label: 'Portal',            blurb: 'Stage exit. Opens when the stage goal is met.', tags: ['goal','anim'], anim: { spin: [0,1,2,3] }, frames: [portal(0), portal(1), portal(2), portal(3)] },
  stairs:       { label: 'Stairs',            blurb: 'Connects cave levels.', tags: ['walk'], frames: [stairs()] },
  bridge:       { label: 'Bridge',            blurb: 'Plank run over a stream or void.', tags: ['walk'], frames: [bridge()] },
  spawn:        { label: 'Spawn Mark',        blurb: 'Editor-only marker for where Alice starts.', tags: ['meta'], frames: [spawnMark()] },
};

const OBJECTS = {
  cube:        { label: 'Data Cube',       blurb: 'The boulder. Push only - never pull, never push two at once.', tags: ['push'], frames: [dataCube()] },
  cube_cracked:{ label: 'Cracked Cube',    blurb: 'Survives exactly one push, then shatters.', tags: ['push'], frames: [crackedCube()] },
  cube_mirror: { label: 'Mirror Cube',     blurb: 'Reflects beams. Pushes like a normal cube.', tags: ['push'], frames: [mirrorCube()] },
  cube_anchor: { label: 'Anchor Cube',     blurb: 'Too heavy to push alone. Needs the Dormouse.', tags: ['push'], frames: [anchorCube()] },
  key:         { label: 'Key Token',       blurb: 'Opens one locked gate, then is spent.', tags: ['item'], frames: [keyToken()] },
  chest:       { label: 'Cache Chest',     blurb: 'Holds a key, a shard, or a very bad idea.', tags: ['item'], frames: [chest()] },
  sign:        { label: 'Sign',            blurb: 'Tutorial text, riddles, and the Hatter’s bad advice.', tags: ['prop'], frames: [sign()] },
  torch:       { label: 'Torch',           blurb: 'Lights a radius in dark stages.', tags: ['prop','anim'], anim: { burn: [0,1] }, frames: [torch(0), torch(1)] },
  shard:       { label: 'Logic Shard',     blurb: 'Optional collectible. Three per stage.', tags: ['item','anim'], anim: { float: [0,1,2] }, frames: [shard(0), shard(1), shard(2)] },
  clock:       { label: 'Pocket Watch',    blurb: 'Rewinds your last three moves. The Rabbit wants it back.', tags: ['item'], frames: [clock()] },
  lever_off:   { label: 'Lever (off)',     blurb: 'Toggles gates. Unlike plates, it stays where you put it.', tags: ['wired'], frames: [lever(false)] },
  lever_on:    { label: 'Lever (on)',      blurb: 'Thrown. Stays thrown.', tags: ['wired'], frames: [lever(true)] },
  terminal:    { label: 'Oracle Terminal', blurb: 'Ask it a question. It answers plausibly, not truthfully.', tags: ['prop'], frames: [terminal()] },
  heart:       { label: 'Heart',           blurb: 'One unit of patience. The Queen takes them back.', tags: ['item'], frames: [heart()] },
  door_exit:   { label: 'Exit Door',       blurb: 'Leads to the next stage once the portal is charged.', tags: ['goal'], frames: [exitDoor()] },
};

const header = (name, desc) =>
`// Alice in AI Land - ${desc}
// GENERATED by tools/gen-world.mjs - edit the generator, not this file.

export const ${name} = {
`;

writeFileSync(new URL('../assets/sprites.tiles.js', import.meta.url),
  header('TILES', 'terrain tiles (16x16)') + Object.entries(TILES).map(([k, v]) => entry(k, v)).join('\n') + '\n};\n');
writeFileSync(new URL('../assets/sprites.objects.js', import.meta.url),
  header('OBJECTS', 'interactive objects (16x16)') + Object.entries(OBJECTS).map(([k, v]) => entry(k, v)).join('\n') + '\n};\n');

console.log(`tiles: ${Object.keys(TILES).length}, objects: ${Object.keys(OBJECTS).length}`);
