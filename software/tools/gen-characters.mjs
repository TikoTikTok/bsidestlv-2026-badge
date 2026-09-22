// Alice in AI Land - characters, 32x32.
//
// Each character is drawn as a MATERIAL MASK from shapes (ellipses, tapers,
// polys); tools/shade.mjs then lights it. Tuning a sprite means moving a number,
// not repainting 1024 pixels by hand.
import { writeFileSync } from 'node:fs';
import { Grid } from './grid.mjs';
import { shade, mats, flats, emit } from './shade.mjs';
import { ALICE_FRONT, ALICE_W, ALICE_H } from './alice-art.mjs';

const W = 32, H = 40, CX = 15.5;

// mask letters -> material ramps (lowercase of each is that ramp forced to shadow)
const SPEC = {
  ...mats({
    H: 'hair', F: 'skin', D: 'dress', A: 'apron', L: 'white', S: 'shoe',
    K: 'shoe', G: 'gold', R: 'red', P: 'purple', N: 'green', U: 'auburn',
    E: 'ember', I: 'ice', B: 'white',
  }),
  ...flats({
    z: 'u',   // ink: lashes, pupils, line work
    w: '8',   // eye white
    '^': 'a', // skin outline: nose, brow
    '*': '3', // blue iris
    '%': 'C', // red: lips, rabbit eyes
    '&': 'K', // green glow: Cheshire eyes, circuitry
    '@': 'G', // gold highlight
    '~': 'O', // arcane glow
  }),
  // forced tones, for streaks and hems the auto-light cannot know about
  '1': { ramp: 'hair', tone: 3 },
  '2': { ramp: 'dress', tone: 3 },
  '3': { ramp: 'dress', tone: 1 },
  '4': { ramp: 'apron', tone: 1 },
  '5': { ramp: 'skin', tone: 3 },
};

/** eye: lash line, white, iris, pupil - the reference's whole face trick */
function eye(g, x, y, { iris = '*', wide = 3 } = {}) {
  g.rect(x, y, wide, 1, 'z');
  g.rect(x, y + 1, wide, 2, 'w');
  g.rect(x + 1, y + 1, 1, 2, iris);
  g.set(x + 1, y + 2, 'z');
  return g;
}

// --------------------------------------------------------------- Alice ----
// Hand-drawn in tools/alice-art.mjs, 32x48, after alice-reference.png.
// Art characters map straight onto CHAR_COLORS in the palette.

const ART = { K:'#', n:'$', N:'%', y:'&', W:'*', s:'-', S:'/', m:':',
              b:';', B:'<', L:'>', a:'?', A:'@', q:'[', e:']' };

const translate = (rows) => rows.map(r => [...r].map(ch => ART[ch] ?? ch).join(''));

/** Walk frames: the skirt hides the legs, so the feet do the work. */
function aliceStep(rows, phase) {
  const g = rows.map(r => [...r]);
  const legTop = 40;
  if (phase !== 0) {
    const [near, far] = phase === 1 ? [0, 1] : [1, 0];
    for (let y = legTop; y < ALICE_H; y++) g[y] = Array(ALICE_W).fill('.');
    const paint = (x0, x1, y0, y1, ch) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
    };
    // forward leg, planted
    paint(11 + near, 14 + near, legTop, 44, 'a');
    paint(10 + near, 10 + near, legTop, 44, 'K');
    paint(15 + near, 15 + near, legTop, 44, 'A');
    paint(10 + near, 15 + near, 45, 46, 'n');
    paint(10 + near, 15 + near, 47, 47, 'K');
    // trailing leg, lifted a pixel
    paint(17 + far, 20 + far, legTop, 43, 'a');
    paint(16 + far, 16 + far, legTop, 43, 'K');
    paint(21 + far, 21 + far, legTop, 43, 'A');
    paint(16 + far, 21 + far, 44, 45, 'n');
    paint(16 + far, 21 + far, 46, 46, 'K');
  }
  return g.map(r => r.join(''));
}

/** Small eye stamp reused by the rest of the cast. */
function aliceEye(g, x, y) {
  g.rect(x, y, 2, 1, 'z');
  g.rect(x, y + 1, 2, 2, '*');
  g.set(x, y + 1, 'w');
}

// -------------------------------------------------------- White Rabbit ----

function rabbit(step, { side = false } = {}) {
  const g = new Grid(W, H);
  const cx = side ? 18 : 19;
  const lift = step === 1 ? 1 : 0;

  g.ellipse(cx - 4.5, 6, 2.4, 6.5, 'A');               // ears
  g.ellipse(cx + 4.5, 6, 2.4, 6.5, 'A');
  g.ellipse(cx - 4.5, 6, 1.1, 4.5, '%');
  g.ellipse(cx + 4.5, 6, 1.1, 4.5, '%');

  g.taper(cx, 20, 34, 14, 12, 'A');                    // body
  g.ellipse(cx - 8, 24, 2.6, 4.5, 'A');                // arms
  g.ellipse(cx + 8, 24, 2.6, 4.5, 'A');
  g.taper(cx, 20, 33, 11, 10, 'D');                    // waistcoat
  g.ellipse(cx, 20, 5.5, 1.4, 'A');                    // collar
  for (const y of [23, 26, 29]) g.set(cx, y, '@');     // buttons
  g.ellipse(cx + 8.5, 29, 2.6, 2.6, 'G');              // pocket watch
  g.ellipse(cx + 8.5, 29, 1.2, 1.2, '@');
  g.line(cx + 3, 26, cx + 7, 28, 'G', 1);              // chain

  g.ellipse(cx - 4.5, 36 + lift, 4.5, 2.6, 'A');       // feet
  g.ellipse(cx + 4.5, 36 - lift, 4.5, 2.6, 'A');
  g.ellipse(cx - 4.5, 44, 5, 3, 'A');
  g.ellipse(cx + 4.5, 44, 5, 3, 'A');

  g.ellipse(cx, 14, 8, 7, 'A');                        // head
  g.ellipse(cx, 17, 4.5, 3, 't');                      // muzzle
  if (side) {
    aliceEye(g, cx + 2, 12);
    g.ellipse(cx + 6, 17, 1.8, 1.3, '%');
  } else {
    g.rect(cx - 5, 12, 3, 1, 'z'); g.rect(cx - 5, 13, 3, 2, '%');
    g.rect(cx + 3, 12, 3, 1, 'z'); g.rect(cx + 3, 13, 3, 2, '%');
    g.set(cx - 5, 13, 'w'); g.set(cx + 3, 13, 'w');
    g.ellipse(cx, 17, 1.8, 1.3, '%');                  // nose
    g.line(cx, 18, cx, 19, 'z', 1);
    g.line(cx - 8, 18, cx - 5, 17, 'a', 1);            // whiskers
    g.line(cx + 5, 17, cx + 8, 18, 'a', 1);
  }
  return g;
}

// ------------------------------------------------------------ Red Queen ----

function queen(step) {
  const g = new Grid(W, H);
  const cx = 19;
  const beat = step === 1 ? 1 : 0;

  g.taper(cx, 20, 40, 14, 34, 'R', 1.5);               // gown, wider than Alice's
  g.taper(cx, 40, 44, 34, 28, 'R');
  g.taper(cx, 43, 44, 29, 28, 'r');
  g.taper(cx, 14, 20, 15, 12, 'R');                    // bodice
  g.ellipse(cx - 8, 16, 3.5, 3, 'R');                  // sleeves
  g.ellipse(cx + 8, 16, 3.5, 3, 'R');
  g.taper(cx - 8.5, 18, 26, 2.6, 2, 'F');              // arms
  g.taper(cx + 8.5, 18, 26, 2.6, 2, 'F');
  g.ellipse(cx, 13.5, 6, 2, 'A');                      // ruff

  g.ellipse(cx, 7, 8, 7.5, 'K');                       // black hair
  g.ellipse(cx, 8.5, 5, 5.5, 'F');                     // face
  g.ellipse(cx, 4, 7, 3, 'K');
  g.taper(cx - 7, 8, 20, 3.5, 2.5, 'K');
  g.taper(cx + 7, 8, 20, 3.5, 2.5, 'K');
  aliceEye(g, cx - 5, 9); aliceEye(g, cx + 2, 9);
  g.rect(cx - 1, 13, 3, 1, 'f');                       // mouth

  for (let i = 0; i < 3; i++) {                        // crown
    const x = cx - 6 + i * 5;
    g.poly([[x, 1], [x + 2.5, -3], [x + 5, 1]], 'G');
  }
  g.rect(cx - 6, 0, 13, 3, 'G');
  g.set(cx - 4, -1, '@'); g.set(cx + 4, -1, '@');

  const hy = 24 + beat;                                // heart emblem
  g.ellipse(cx - 2, hy, 2.2, 2, 'A');
  g.ellipse(cx + 2, hy, 2.2, 2, 'A');
  g.poly([[cx - 4, hy + 1], [cx, hy + 5], [cx + 4, hy + 1]], 'A');
  return g;
}

// ----------------------------------------------------------- Mad Hatter ----

function hatter(step) {
  const g = new Grid(W, H);
  const cx = 19;
  const tip = step === 1 ? 1 : 0;

  g.rect(cx - 6 + tip, 0, 13, 10, 'S');                // hat crown
  g.rect(cx - 6 + tip, 6, 13, 3, 'R');                 // band
  g.rect(cx - 1 + tip, 5, 5, 4, 'A');                  // 10/6 ticket
  g.rect(cx - 12, 10, 25, 3, 'S');                     // brim
  g.rect(cx - 13, 11, 27, 1, 's');

  g.ellipse(cx, 17, 6, 6, 'F');                        // face
  g.ellipse(cx - 6.5, 16, 2.4, 3.5, 'U');              // ginger tufts
  g.ellipse(cx + 6.5, 16, 2.4, 3.5, 'U');
  aliceEye(g, cx - 5, 15); aliceEye(g, cx + 2, 15);
  g.rect(cx - 2, 20, 5, 1, 'z');                       // grin

  g.taper(cx, 24, 36, 17, 15, 'D');                    // coat
  g.taper(cx, 24, 35, 7, 7, 'G');                      // waistcoat
  g.poly([[cx - 4, 23], [cx, 25.5], [cx + 4, 23]], 'N');   // bowtie
  g.poly([[cx - 4, 26], [cx, 23.5], [cx + 4, 26]], 'N');
  g.ellipse(cx - 9, 27, 3, 3.5, 'D');                  // sleeves
  g.ellipse(cx + 9, 27, 3, 3.5, 'D');
  g.taper(cx - 9, 30, 34, 2.6, 2, 'F');
  g.taper(cx + 9, 30, 34, 2.6, 2, 'F');
  g.rect(cx - 6, 36, 5, 6, 'S'); g.rect(cx + 2, 36, 5, 6, 'S');   // trousers
  g.rect(cx - 7, 42, 6, 4, 'S'); g.rect(cx + 2, 42, 6, 4, 'S');   // shoes
  return g;
}

// ------------------------------------------------------ Cheshire Daemon ----

function cheshire(fade) {
  const g = new Grid(W, H);
  const cx = 19;
  const gone = fade === 1;

  if (!gone) {
    g.ellipse(cx, 34, 10, 7, 'P');                     // crouched body
    g.line(cx + 9, 33, cx + 15, 25, 'P', 3);           // tail
    g.ellipse(cx + 15, 24, 2, 2.6, 'P');
    for (let i = 0; i < 3; i++) g.line(cx + 10 + i, 31 - i * 2, cx + 12 + i, 29 - i * 2, 'p', 1);
    g.ellipse(cx - 6, 40, 3.5, 2, 'P'); g.ellipse(cx + 6, 40, 3.5, 2, 'P');
  }

  g.poly([[cx - 9, 14], [cx - 6, 2], [cx - 1, 14]], 'P');    // ears
  g.poly([[cx + 9, 14], [cx + 6, 2], [cx + 1, 14]], 'P');
  g.poly([[cx - 7, 12], [cx - 5.5, 5], [cx - 4, 12]], '~');
  g.poly([[cx + 7, 12], [cx + 5.5, 5], [cx + 4, 12]], '~');
  g.ellipse(cx, 16, 10, 8, 'P');                       // head

  for (let i = 0; i < 3; i++) {                        // stripes
    const y = 10 + i * 3;
    g.line(cx - 11, y, cx - 6, y, 'p', 2);
    g.line(cx + 6, y, cx + 11, y, 'p', 2);
  }

  if (gone) {                                          // dissolve, coarse
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (g.get(x, y) !== '.' && (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0) g.set(x, y, '.');
  }

  g.ellipse(cx - 5, 15, 3, 2.8, 'w');                  // eyes survive
  g.ellipse(cx + 5, 15, 3, 2.8, 'w');
  g.ellipse(cx - 5, 15, 1.2, 2.2, '&');
  g.ellipse(cx + 5, 15, 1.2, 2.2, '&');
  g.set(cx - 5, 15, 'z'); g.set(cx + 5, 15, 'z');

  g.ellipse(cx, 21, 8, 3.5, 'A');                      // the grin
  g.line(cx - 8, 20, cx + 8, 20, 'z', 1);
  for (let x = cx - 6; x <= cx + 6; x += 4) g.line(x, 21, x, 23, 'z', 1);
  return g;
}

// -------------------------------------------------------- Caterpillar -----

function caterpillar(step) {
  const g = new Grid(W, H);
  const cx = 19;
  const puff = step === 1;

  g.ellipse(cx, 38, 17, 7, 'R');                       // mushroom cap
  g.rect(cx - 4, 43, 8, 5, 'A');                       // stem
  for (const [x, y] of [[cx - 11, 37], [cx, 34], [cx + 10, 37], [cx - 5, 41], [cx + 6, 41]])
    g.ellipse(x, y, 2.2, 1.6, 'A');                    // spots

  const seg = [[cx - 9, 29], [cx - 5, 25], [cx, 22], [cx + 5, 20], [cx + 9, 23]];
  seg.forEach(([x, y], i) => {
    g.ellipse(x, y, 4.2 - i * 0.2, 4 - i * 0.2, 'N');
    g.ellipse(x, y + 2, 3, 1.2, 'n');
  });
  g.ellipse(cx - 9, 13, 6.5, 6, 'N');                  // head reared up
  g.line(cx - 13, 4, cx - 12, 8, 'N', 1);              // antennae
  g.line(cx - 5, 4, cx - 6, 8, 'N', 1);
  g.set(cx - 13, 3, '&'); g.set(cx - 5, 3, '&');
  g.rect(cx - 12, 11, 2, 1, 'z'); g.rect(cx - 12, 12, 2, 2, 'w');
  g.rect(cx - 7, 11, 2, 1, 'z'); g.rect(cx - 7, 12, 2, 2, 'w');
  g.set(cx - 11, 13, 'z'); g.set(cx - 6, 13, 'z');
  g.rect(cx - 10, 16, 3, 1, 'z');                      // mouth

  g.line(cx - 2, 15, cx + 9, 10, 'P', 2);              // hookah
  g.ellipse(cx + 11, 9, 3, 3, 'P');
  if (puff) { g.ellipse(cx + 14, 4, 2.4, 2, '~'); g.ellipse(cx + 17, 1, 1.6, 1.4, '~'); }
  else { g.ellipse(cx + 15, 3, 2, 1.8, '~'); }
  return g;
}

// ---------------------------------------------------------- Dormouse ------

function dormouse(step) {
  const g = new Grid(W, H);
  const cx = 19;
  g.line(cx + 8, 42, cx + 16, 36, 'U', 3);             // tail
  g.ellipse(cx, 36, 12, 8, 'U');                       // curled body
  g.ellipse(cx - 8, 29, 3.5, 3.5, 'U');                // ears
  g.ellipse(cx + 8, 29, 3.5, 3.5, 'U');
  g.ellipse(cx - 8, 29, 1.8, 1.8, '%');
  g.ellipse(cx + 8, 29, 1.8, 1.8, '%');
  g.ellipse(cx, 34, 8, 6, 'u');                        // face
  g.line(cx - 6, 33, cx - 2, 33, 'z', 1);              // closed eyes
  g.line(cx + 2, 33, cx + 6, 33, 'z', 1);
  g.ellipse(cx, 37, 2, 1.4, '%');
  g.line(cx - 11, 38, cx - 6, 37, 'a', 1);
  g.line(cx + 6, 37, cx + 11, 38, 'a', 1);

  const zs = step === 1 ? [[cx + 6, 6], [cx + 12, 1]] : [[cx + 7, 9], [cx + 13, 4]];
  for (const [x, y] of zs) {                           // sleep Zs
    g.line(x, y, x + 4, y, 'A', 1);
    g.line(x + 4, y, x, y + 4, 'A', 1);
    g.line(x, y + 4, x + 4, y + 4, 'A', 1);
  }
  return g;
}

const CHARACTERS = {
  alice: {
    label: 'Alice',
    blurb: 'The prompt. Curious, stubborn, pushes things she should not push.',
    w: ALICE_W, h: ALICE_H, pre: true,
    anim: { idle: [0], down: [1, 0, 2, 0] },
    frames: [
      translate(aliceStep(ALICE_FRONT, 0)),
      translate(aliceStep(ALICE_FRONT, 1)),
      translate(aliceStep(ALICE_FRONT, 2)),
    ],
  },
  rabbit: {
    label: 'The White Rabbit',
    blurb: 'Latency incarnate. Always late, always one tile ahead of you.',
    w: W, h: H,
    anim: { down: [0, 1], side: [2, 3] },
    flip: { left: 'side', right: 'side' },
    frames: [rabbit(0), rabbit(1), rabbit(0, { side: true }), rabbit(1, { side: true })],
  },
  queen: {
    label: 'The Red Queen',
    blurb: 'Rules by decree. Off with your head, off with your context window.',
    w: W, h: H,
    anim: { down: [0, 1] },
    frames: [queen(0), queen(1)],
  },
  hatter: {
    label: 'The Mad Hatter',
    blurb: 'Prompt engineer. Sells you a hat that is also a jailbreak.',
    w: W, h: H,
    anim: { down: [0, 1] },
    frames: [hatter(0), hatter(1)],
  },
  cheshire: {
    label: 'The Cheshire Daemon',
    blurb: 'Runs in the background. Only the grin is guaranteed to be there.',
    w: W, h: H,
    anim: { idle: [0, 1] },
    frames: [cheshire(0), cheshire(1)],
  },
  caterpillar: {
    label: 'The Caterpillar',
    blurb: 'Sits on a mushroom asking "who are you?" until your identity degrades.',
    w: W, h: H,
    anim: { idle: [0, 1] },
    frames: [caterpillar(0), caterpillar(1)],
  },
  dormouse: {
    label: 'The Dormouse',
    blurb: 'An agent stuck in an idle loop. Wake it and it pushes cubes for you.',
    w: W, h: H,
    anim: { idle: [0, 1] },
    frames: [dormouse(0), dormouse(1)],
  },
};

const out = `// Alice in AI Land - characters.
// GENERATED by tools/gen-characters.mjs - edit the generator, not this file.

export const CHARACTERS = {
${Object.entries(CHARACTERS).map(([id, c]) =>
  emit(id, { ...c, frames: c.pre ? c.frames : c.frames.map(g => shade(g, SPEC)) })).join('\n')}
};
`;
writeFileSync(new URL('../legacy/assets/sprites.characters.js', import.meta.url), out);
console.log(`characters: ${Object.keys(CHARACTERS).length}`);
