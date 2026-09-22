// Flat chibi style: one tone per material, no shading, chunky shapes,
// black bar eyes. Every pixel of the figure is hand-placed.
import { Grid } from './grid.mjs';

// material -> a single palette character (see assets/palette.js)
export const FLAT = {
  H: 'g',   // hair, gold
  F: 'c',   // skin
  D: 'o',   // dress blue
  A: '8',   // apron white
  z: 'u',   // ink: eyes, bow, shoes
  R: 'C',   // red
  N: 'K',   // green
  P: 'O',   // arcane
  U: 'k',   // auburn
  G: 'G',   // gold metal
  W: '7',   // bone white
  S: 'v',   // dark
  b: 'n',   // dress shadow, used sparingly for a hem
};

export const ALICE_FRONT = [
  '........................',
  '.........zzzzzz.........',
  '........zzzzzzzz........',
  '......HHzzzzzzzzHH......',
  '.....HHHHHHHHHHHHHH.....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHFFFFFFHHHHH....',
  '....HHHHHFFFFFFHHHHH....',
  '....HHHHHzzFFzzHHHHH....',
  '....HHHHHzzFFzzHHHHH....',
  '....HHHHHzzFFzzHHHHH....',
  '....HHHHHFFFFFFHHHHH....',
  '....HHHHHFFFFFFHHHHH....',
  '....HHHHHHFFFFHHHHHH....',
  '....HHHHHH.FF.HHHHHH....',
  '....HHHHHDDAADDHHHHH....',
  '....HHHHDDDAADDDHHHH....',
  '...HHHHDDDDAADDDDHHHH...',
  '...HHHHDDDDAADDDDHHHH...',
  '....HHFDDDDAADDDDFHH....',
  '.....FDDDDDAADDDDDF.....',
  '....DDDDDDDAADDDDDDD....',
  '...DDDDDDDAAAADDDDDDD...',
  '..DDDDDDDAAAAAADDDDDDD..',
  '..DDDDDDAAAAAAAADDDDDD..',
  '.DDDDDDDAAAAAAAADDDDDDD.',
  '.bDDDDDDAAAAAAAADDDDDDb.',
  '...bbbbbAAAAAAAAbbbbb...',
  '........AAAAAAAA........',
  '..........AA.AA.........',
  '.........zzz.zzz........',
  '........................',
];

export const ALICE_BACK = [
  '........................',
  '.........zzzzzz.........',
  '........zzzzzzzz........',
  '......HHzzzzzzzzHH......',
  '.....HHHHHHHHHHHHHH.....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '....HHHHHHHHHHHHHHHH....',
  '...HHHHHHHHHHHHHHHHHH...',
  '...HHHFHHHHHHHHHHHFHH...',
  '....HHFHHHHAAHHHHHFHH...',
  '.....FHHHHAAAAHHHHHF....',
  '....DDDHHHAAAAHHHDDDD...',
  '...DDDDDDHAAAAHDDDDDDD..',
  '..DDDDDDDAAAAAADDDDDDD..',
  '..DDDDDDAAAAAAAADDDDDD..',
  '.DDDDDDDAAAAAAAADDDDDDD.',
  '.bDDDDDDAAAAAAAADDDDDDb.',
  '...bbbbbAAAAAAAAbbbbb...',
  '........AAAAAAAA........',
  '..........AA.AA.........',
  '.........zzz.zzz........',
  '........................',
];

export const ALICE_SIDE = [
  '........................',
  '........zzzzzz..........',
  '.......zzzzzzzz.........',
  '.....HHzzzzzzzzHH.......',
  '....HHHHHHHHHHHHHH......',
  '...HHHHHHHHHHHHHHHH.....',
  '...HHHHHHHHFFFFFFH......',
  '...HHHHHHHFFFFFFFF......',
  '...HHHHHHHFzzFFFFF......',
  '...HHHHHHHFzzFFFFF......',
  '...HHHHHHHFFFFFFFF......',
  '...HHHHHHHFFFFFFFF......',
  '...HHHHHHHHFFFFFF.......',
  '...HHHHHHHHHFFFF........',
  '...HHHHHHHHH.FF.........',
  '...HHHHHHHHDDAAD........',
  '...HHHHHHHDDDAADD.......',
  '...HHHHHHDDDDAADDD......',
  '...HHHHHHDDDDAADDDF.....',
  '....HHHHHDDDDAADDDF.....',
  '.....HHHHDDDDAADDDF.....',
  '.....HHHDDDDDAADDDD.....',
  '....DDDDDDDDAAAADDDD....',
  '...DDDDDDDDAAAAAADDDD...',
  '...DDDDDDDAAAAAAADDDD...',
  '...DDDDDDDAAAAAAADDDD...',
  '...bDDDDDDAAAAAAADDDb...',
  '....bbbbbbAAAAAAAbbb....',
  '.........AAAAAAAA.......',
  '..........AA.AA.........',
  '.........zzz.zzz........',
  '........................',
];

/** Walk frame: lift one foot, shift the other. */
export function walk(rows) {
  const g = new Grid(24, 32);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') g.set(x, y, ch); }));
  // clear the legs and redraw them staggered
  for (let y = 29; y <= 31; y++) for (let x = 0; x < 24; x++) g.set(x, y, '.');
  g.rect(10, 29, 2, 2, 'A');       // forward leg
  g.rect(13, 29, 2, 1, 'A');       // trailing leg
  g.rect(9, 31, 3, 1, 'z');
  g.rect(13, 30, 3, 1, 'z');
  return g.rows();
}
