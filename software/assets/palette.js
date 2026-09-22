// Alice in AI Land - master palette.
//
// Built as RAMPS, not loose colours. Every material owns four tones:
//   0 = outline (the silhouette edge - a dark version of the material, never black)
//   1 = shadow
//   2 = base
//   3 = light   (light comes from the upper left, always)
//
// That is the rule the reference art follows: figures are outlined in their own
// colour, so nothing reads as a sticker pasted onto the screen.

export const RAMPS = {
  skin:     ['#7a4227', '#c07f52', '#f0bd93', '#ffdcbb'],
  hair:     ['#8a5510', '#d19a22', '#f7cf44', '#ffeda0'],   // Alice blonde
  auburn:   ['#5a2a12', '#8f4a1e', '#c4722f', '#e39a55'],   // Hatter / rabbit trim
  dress:    ['#0b2044', '#15407c', '#2a72bd', '#5aa8e6'],   // Alice blue, dark end
  apron:    ['#5d7392', '#a9bdd4', '#e6f0fa', '#ffffff'],
  shoe:     ['#05070d', '#161c2b', '#2c3547', '#4c5770'],
  red:      ['#6e1020', '#ad2038', '#e04158', '#f58c9d'],
  gold:     ['#6e440d', '#b07a18', '#eab534', '#ffdd80'],
  green:    ['#0d4f3c', '#1d8a68', '#3fd6a3', '#95f2d2'],
  purple:   ['#3c1866', '#6b2ba0', '#a94fd0', '#d9a0ef'],
  ember:    ['#6e3308', '#bb5a0f', '#f08c3a', '#ffc27a'],
  stone:    ['#0a1426', '#16294a', '#2a4c85', '#4a7fd4'],   // the world itself
  ice:      ['#1c4a7a', '#3a7fc0', '#74b6ef', '#c8e8ff'],
  white:    ['#5a6a80', '#9fb0c4', '#dde8f2', '#ffffff'],
  void:     ['#000000', '#04070e', '#0b1020', '#131b30'],
};

// One character per tone. Generated sprites store these characters.
export const RAMP_KEYS = {
  skin:   ['a','b','c','d'],
  hair:   ['e','f','g','h'],
  auburn: ['i','j','k','l'],
  dress:  ['m','n','o','p'],
  apron:  ['q','r','s','t'],
  shoe:   ['u','v','w','x'],
  red:    ['A','B','C','D'],
  gold:   ['E','F','G','H'],
  green:  ['I','J','K','L'],
  purple: ['M','N','O','P'],
  ember:  ['Q','R','S','T'],
  stone:  ['U','V','W','X'],
  ice:    ['1','2','3','4'],
  white:  ['5','6','7','8'],
  void:   ['9','_','+','='],
};

export const PALETTE = { '.': null };
for (const [ramp, keys] of Object.entries(RAMP_KEYS))
  keys.forEach((k, i) => { PALETTE[k] = RAMPS[ramp][i]; });


// Character palette (the hand-drawn sprites). Deliberately separate from the
// world ramps above: these are the colours the reference sheet uses, and the
// characters are painted tone by tone rather than auto-shaded.
export const CHAR_COLORS = {
  '#': '#12233d',   // outline navy - every character is outlined in this
  '$': '#1d3c6e',   // navy: bow, headband, shoes
  '%': '#3a6aa8',   // navy light
  '&': '#f0c33c',   // hair
  '*': '#ffe58e',   // hair light
  '-': '#f8d5ad',   // skin
  '/': '#d8a273',   // skin shadow
  ':': '#c2705a',   // mouth
  ';': '#2f77bd',   // dress blue
  '<': '#1d4f8f',   // dress shadow
  '>': '#69aee4',   // dress light
  '?': '#ffffff',   // white: apron, stockings
  '@': '#c7d7e8',   // white shadow
  '[': '#ffffff',   // eye white
  ']': '#1d5ba8',   // eye iris
};
Object.assign(PALETTE, CHAR_COLORS);

// '0' is the old ink key, still used by the card and boss generators.
PALETTE['0'] = RAMPS.stone[0];
PALETTE['y'] = RAMPS.gold[2];   // old gold key, used by the boss generator

export const PALETTE_ORDER = Object.keys(RAMP_KEYS);
export const PALETTE_NAMES = {
  skin: 'skin', hair: 'blonde hair', auburn: 'auburn', dress: 'Alice blue',
  apron: 'apron white', shoe: 'boot black', red: 'queen red', gold: 'gold',
  green: 'signal', purple: 'arcane', ember: 'ember', stone: 'cave stone',
  ice: 'ice / data', white: 'bone white', void: 'void',
};

// Palette swaps: remap a whole ramp onto another ramp's tones.
export const RECOLORS = {
  none: {},
  hearts:   ramp('dress', 'red'),
  spades:   ramp('dress', 'void'),
  clubs:    ramp('dress', 'green'),
  diamonds: ramp('dress', 'gold'),
  corrupt:  { ...ramp('dress', 'purple'), ...ramp('hair', 'green') },
  ghost:    { ...ramp('dress', 'ice'), ...ramp('skin', 'white'), ...ramp('hair', 'white') },
};

function ramp(from, to) {
  const out = {};
  RAMP_KEYS[from].forEach((k, i) => { out[k] = RAMPS[to][i]; });
  return out;
}
