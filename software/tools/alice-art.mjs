// Alice, hand-drawn at 32x48 after the reference sheet.
//
// The figure is written as 16-wide LEFT HALVES and mirrored, so it can never
// lean; the bow is stamped on afterwards, because it is the one asymmetric part.
//
//   K outline navy   n navy (bow, shoes)
//   y hair   W hair light
//   s skin   S skin shadow   m mouth
//   b dress  B dress shadow  L dress light
//   a white  A white shadow
//   q eye white   e eye iris

export const ALICE_W = 32, ALICE_H = 48;

let row = 0;
/** Mirror a 16-wide left half into a full 32-wide row. */
const M = (...runs) => {
  const half = runs.map(([c, n]) => c.repeat(n)).join('');
  if (half.length !== ALICE_W / 2) throw new Error(`half row ${row} is ${half.length} wide: |${half}|`);
  row++;
  return half + [...half].reverse().join('');
};

const BASE = [
  // ---- hair crown --------------------------------------------------------
  M(['_',11],['K',5]),
  M(['_',8],['K',3],['y',5]),
  M(['_',6],['K',2],['y',8]),
  M(['_',5],['K',1],['y',4],['W',2],['y',4]),
  M(['_',4],['K',1],['y',3],['W',3],['y',5]),
  M(['_',3],['K',1],['y',3],['W',3],['y',6]),
  M(['_',3],['K',1],['y',3],['W',3],['y',6]),
  M(['_',2],['K',1],['y',3],['W',2],['y',8]),
  // ---- face: more hair framing it, eyes with a rim and a glint ---------
  M(['_',2],['K',1],['y',5],['W',1],['y',1],['s',6]),
  M(['_',2],['K',1],['y',6],['s',7]),
  M(['_',2],['K',1],['y',6],['s',1],['K',1],['q',1],['e',2],['s',2]),
  M(['_',2],['K',1],['y',6],['s',1],['K',1],['q',1],['e',2],['s',2]),
  M(['_',2],['K',1],['y',6],['s',1],['K',1],['e',3],['s',2]),
  M(['_',2],['K',1],['y',6],['s',7]),
  M(['_',2],['K',1],['y',6],['s',6],['m',1]),
  M(['_',2],['K',1],['y',6],['s',6],['S',1]),
  M(['_',2],['K',1],['y',7],['S',1],['s',5]),
  M(['_',2],['K',1],['y',8],['S',5]),
  // ---- neck and collar ---------------------------------------------------
  M(['_',2],['K',1],['y',8],['K',1],['s',4]),
  M(['_',2],['K',1],['y',8],['a',5]),
  M(['_',2],['K',1],['y',7],['a',6]),
  // ---- bodice, puff sleeves, apron bib -----------------------------------
  M(['_',2],['K',1],['y',3],['K',1],['b',5],['a',4]),
  M(['_',1],['K',1],['b',1],['L',2],['b',1],['K',1],['b',5],['a',4]),
  M(['_',1],['K',1],['b',1],['L',2],['b',2],['K',1],['b',4],['a',4]),
  M(['_',1],['K',1],['b',2],['L',1],['b',2],['K',1],['b',4],['a',4]),
  M(['_',1],['K',1],['b',1],['B',2],['b',1],['K',1],['b',5],['a',4]),
  // ---- arms --------------------------------------------------------------
  M(['_',1],['K',1],['s',2],['K',1],['b',7],['a',4]),
  M(['_',1],['K',1],['s',2],['K',1],['b',7],['a',4]),
  M(['_',1],['K',1],['s',2],['K',1],['b',7],['a',4]),
  M(['_',2],['K',1],['S',2],['K',1],['b',6],['a',4]),
  // ---- the skirt, flaring into a bell ----------------------------------
  M(['_',3],['K',1],['b',7],['a',5]),
  M(['_',2],['K',1],['b',8],['a',5]),
  M(['_',2],['K',1],['b',8],['a',5]),
  M(['_',1],['K',1],['b',9],['a',5]),
  M(['_',1],['K',1],['b',5],['L',1],['b',3],['a',5]),
  M(['K',1],['b',6],['L',1],['b',3],['a',5]),
  M(['K',1],['b',7],['L',1],['b',2],['a',5]),
  M(['K',1],['b',8],['B',1],['a',6]),
  M(['K',1],['B',9],['a',1],['A',1],['a',1],['A',1],['a',2]),   // checkered trim
  M(['_',1],['K',1],['n',8],['A',6]),                            // hem
  // ---- stockings ---------------------------------------------------------
  M(['_',10],['K',1],['a',3],['A',1],['_',1]),
  M(['_',10],['K',1],['a',3],['A',1],['_',1]),
  M(['_',10],['K',1],['a',3],['A',1],['_',1]),
  M(['_',10],['K',1],['a',3],['A',1],['_',1]),
  M(['_',10],['K',1],['A',4],['_',1]),
  // ---- shoes -------------------------------------------------------------
  M(['_',9],['K',1],['n',5],['_',1]),
  M(['_',9],['K',1],['n',5],['_',1]),
  M(['_',10],['K',6]),
];

// The bow, stamped over her right side. ' ' leaves the base pixel alone.
const BOW = [
  '  KKK  ',
  ' KnnnK ',
  'KnnnnnK',
  'KnNnnnK',
  'KnnnnnK',
  ' KnnnK ',
  '  KnK  ',
];

export const ALICE_FRONT = (() => {
  const grid = BASE.map(r => [...r]);
  BOW.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== ' ') grid[j + 1][i + 20] = ch;
  }));
  // headband: a navy band across the hair, under the bow
  for (let x = 6; x <= 25; x++) {
    const y = x < 12 ? 7 : x < 20 ? 6 : 7;
    if ('yW'.includes(grid[y][x])) grid[y][x] = 'n';
  }
  return grid.map(r => r.join('').replace(/_/g, '.'));
})();
