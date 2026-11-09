// Alice in AI Land - the White Rabbit's guide: how an assistant builds a
// first room WITH a person, one step at a time, written down as data.
//
// An assistant on the bridge (software/tools/maker-server.mjs) says hello,
// the page pops the welcome banner (maker.html #guideDialog, the cards are
// GUIDE_MODES), the person picks a way, and from then on the assistant asks
// the guide what to do next and does exactly that:
//
//   Follow the White Rabbit   step by step; the person holds the brush, the
//                             assistant coaches, and takes over a step on
//                             request ("do it for me"). Rides on the page's
//                             own guided build "rabbit" (src/tutor.js), so
//                             the coach line and the checklist show the
//                             same steps the assistant narrates.
//   Drink Me                  the fast lane: four questions (a name, a size,
//                             a flavour, a dressing), then the assistant
//                             generates, proves and plays the room with the
//                             person, who turns the knobs until it is theirs.
//   Eat Me                    the one-bite starter: a name, one of three
//                             starters, a dressing, the solution played, a
//                             link. For a first time.
//
// Each step tells the assistant what to SAY, WHY (the idea behind the step,
// one paragraph), what to ASK (one question, a few options - option buttons
// where the platform has them, a numbered list where it does not, and the
// person may always answer in their own words), what to DO on the board (the
// bridge's ops, with concrete arguments worked out from the room that is on
// the board right now), what HELP is (what to do when the person asks for a
// shortcut), and when the step is DONE. The steps are written for a small
// model: guideText() renders one as a plain block of instructions a weak
// assistant can follow line by line, and the bridge can run a step's ops
// itself (POST /__maker/guide { run: true }). The same step goes to the page
// as a card - the line, the why, the board, what the assistant does, the
// buttons, Do it for me - so a person watching the page in the assistant's
// own browser pane follows the whole walk there.
//
// Pure: no DOM, no fetch. The bridge serves it (GET /__maker/guide), the
// MCP server offers it (maker_guide), the page draws the banner from
// GUIDE_MODES, and verify-maker.mjs proves every op a step names is one the
// page has and every placeholder resolves. PLATFORMS is what the invitation
// and the docs say about each assistant's own controls and its own browser
// (where the page opens first); BROWSER_FIRST is that rule in a sentence.
//
//   guide.js exports GUIDE_MODES, guideStep, guideText, applyAnswer, PLATFORMS (and more below):
//   const ctx = { vars: { name: 'The Rose Walk' }, level, report, tutorial, assistant: 'Claude' };
//   const step = guideStep('fast', 4, ctx);          // say / ask / do / help / done, concrete
//   const text = guideText('fast', 4, ctx);          // the same as instructions for a small model
//   const { vars, then } = applyAnswer(step, 'Harder', ctx.vars);   // what the answer does

import { MAKER_TUTORIALS } from './tutor.js';
import { STARTERS } from './level.js';

// ------------------------------------------------------------------ the ways ----

/** The three cards on the welcome banner, in this order. `tutorial` names the page's guided build the way rides on. */
export const GUIDE_MODES = [
  {
    id: 'tutorial', icon: '🐇', title: 'Follow the White Rabbit', kicker: 'step by step',
    blurb: 'You hold the brush. Your assistant walks beside you one small step at a time, says why, cheers, and takes over any step you hand it - just say "do it for me".',
    time: 'about fifteen minutes', tutorial: 'rabbit',
  },
  {
    id: 'fast', icon: '🧪', title: 'Drink Me', kicker: 'the fast lane',
    blurb: 'Four quick questions - a name, a size, a flavour, a dressing - and your assistant paints the room with you, proves it, plays it and hands you a link. Change your mind as often as you like.',
    time: 'about five minutes',
  },
  {
    id: 'basic', icon: '🍰', title: 'Eat Me', kicker: 'the one-bite starter',
    blurb: 'The simplest first room there is: name it, pick one of three starters and a dressing, watch Alice solve it, keep the link. Nothing to learn yet; the Rabbit can wait.',
    time: 'two minutes',
  },
];
export const GUIDE_IDS = GUIDE_MODES.map(m => m.id);
export const modeById = (id) => GUIDE_MODES.find(m => m.id === id) ?? null;

/** How the assistant behaves, whatever the step. Rendered at the top of the first step and as one line after. */
export const GUIDE_RULES = [
  'One step at a time: read the step, do what it says, call the guide again. Never do several steps at once or skip ahead.',
  'Say first, then ask. Every step opens with a line to the person - in your own chat AND on the page (maker_say / op say), so they see you wherever they are looking.',
  'One question at a time, with options. Use your option buttons if you have them (Claude Code: AskUserQuestion, which always offers "Other" for their own words); otherwise list the options numbered and wait. The person may always answer in their own words.',
  'Short and warm: two or three sentences a message, plain words, and a cheer for every step they finish ("The wall stands!"). No lectures - the WHY line is there for when they ask.',
  'Their hands, their room. On "Follow the White Rabbit" they do the step and you coach; take over only when they ask (help, shortcut, do it for me) - then run HELP, say what you did, and hand the brush back.',
  'Never leave them in silence: when something takes a while (a Check, a deploy), say so before and after.',
  'They may be typing on the page\'s chat instead of yours: read it (maker_read_chat / GET /__maker/inbox) before you ask again.',
  'Pass every answer back to the guide (maker_guide {"answer": "...", "at": <the step>}): it decides what happens next and turns the knobs for you.',
  'Every step is on the page too, as a card in the assistant panel - the line, the why, what you are doing, the question as buttons, Do it for me - and the banner is theirs. When the page is open in a browser pane they can see (yours), that is where they follow: keep your own chat to a line a step and never make them read a thing twice. They may answer there instead of answering you: when your own dialog comes back, call maker_guide before anything else - if it says the step has moved (or the way is already picked), go with what they chose on the page and do not ask again.',
  'If something fails, say what the page said in one plain line and offer the next thing to try. No blame, no jargon.',
  'When unsure, call maker_guide with no arguments and do exactly what its text says.',
];

// --------------------------------------------------------------- the platforms ----
// What each assistant has for the three things the guide needs: a way onto
// the bridge, a way to ask a question with options, a way to run the maker.
// The configuration files named here are in the repository, never published.

export const PLATFORMS = [
  { id: 'claude', name: 'Claude Code', connect: '.mcp.json at the repository root registers the server alice-maker: open the clone in Claude Code and the maker_* tools are there (by hand: claude mcp add alice-maker -- node software/tools/maker-mcp.mjs).',
    ask: 'AskUserQuestion: one question, two to four options with a one-line description each; the person always has "Other" to type their own words - that is where a name or a blurb comes from.',
    browser: 'The built-in browser pane of the Claude desktop app (the Code tab): preview_start { url: "http://localhost:8080/maker.html" } or navigate opens the page beside your chat, where the person sees and answers every step. Claude in Chrome (the extension) when they asked for Chrome. In a bare terminal, with no pane: their default browser.',
    run: 'Start `npm run maker -- --no-open` in the background, or call maker_open; then open the page in your own browser pane first (see browser). Only with none, `npm run maker` or maker_open { browser: true } opens it in the person\'s default browser.', buttons: true },
  { id: 'codex', name: 'Codex (OpenAI)', connect: '.codex/config.toml in the clone registers alice-maker under [mcp_servers] (by hand: codex mcp add alice-maker -- node software/tools/maker-mcp.mjs).',
    ask: 'No option buttons: write the options as a numbered list, one question per message, and wait for the reply (a number or words).',
    browser: 'Codex\'s own browser when the app offers one, opened at http://localhost:8080/maker.html; else the person\'s default browser (`npm run maker` without --no-open, or maker_open { browser: true }).',
    run: 'Start `npm run maker -- --no-open` in the background, or call maker_open; then open the page in your own browser first (see browser), the person\'s default browser only when you have none.', buttons: false },
  { id: 'cursor', name: 'Cursor', connect: '.cursor/mcp.json in the clone; Cursor asks once to enable the server, then the maker_* tools are in the agent.',
    ask: 'A numbered list in the chat; Cursor shows no option buttons.',
    browser: 'Cursor\'s built-in browser tab when the agent has it, else the Simple Browser (the command "Simple Browser: Show", then the address); the person\'s default browser last.',
    run: 'Start `npm run maker -- --no-open` in a terminal, or call maker_open; then open the page in the editor\'s browser first (see browser).', buttons: false },
  { id: 'copilot', name: 'GitHub Copilot (VS Code agent mode, Copilot CLI)', connect: '.vscode/mcp.json in the clone (VS Code shows a Start button on the server); the Copilot CLI takes `/mcp add` with command node and args software/tools/maker-mcp.mjs.',
    ask: 'Use the question tool when agent mode offers one; otherwise a numbered list.',
    browser: 'VS Code\'s Simple Browser ("Simple Browser: Show", then the address) beside the chat; the Copilot CLI has none: the person\'s default browser.',
    run: 'Start `npm run maker -- --no-open` in a terminal, or call maker_open; then open the page in the Simple Browser first (see browser).', buttons: false },
  { id: 'gemini', name: 'Gemini CLI, Jules, Antigravity (Google)', connect: '.gemini/settings.json in the clone registers alice-maker under mcpServers.',
    ask: 'A numbered list in the chat.',
    browser: 'Antigravity has a browser of its own: open the page there. Gemini CLI and Jules have none: the person\'s default browser (maker_open { browser: true }).',
    run: 'Start `npm run maker -- --no-open` in the background, or call maker_open; then open the page in your own browser first when you have one (see browser).', buttons: false },
  { id: 'hermes', name: 'Hermes Agent', connect: 'Add alice-maker to mcp_servers in your config.yaml (command node, args [software/tools/maker-mcp.mjs], env MAKER_URL), or use the HTTP bridge with curl.',
    ask: 'A numbered list; Hermes can also hold the whole conversation on the page (maker_say / maker_read_chat).',
    browser: 'Hermes\'s browser tool when one is configured, at http://localhost:8080/maker.html; else the person\'s default browser.',
    run: 'Start `npm run maker -- --no-open` in the background, or call maker_open; then open the page in your browser tool first (see browser).', buttons: false },
  { id: 'grok', name: 'Grok (xAI)', connect: 'No MCP client in the chat: with a shell tool, use the HTTP bridge (curl); without one, the person runs the maker and relays what the page says.',
    ask: 'A numbered list.', browser: 'None of your own: the person opens the page (`npm run maker` opens it in their browser).', run: 'Ask the person to run `npm run maker` if you cannot.', buttons: false },
  { id: 'chatgpt', name: 'ChatGPT and other web chats without a shell', connect: 'Cannot reach the bridge: ask the person to open the page\'s assistant panel and relay, or to use Codex / an agent with a shell instead.',
    ask: 'A numbered list.', browser: 'None of your own: the person opens the page (`npm run maker` opens it in their browser).', run: 'Ask the person to run `npm run maker`.', buttons: false },
  { id: 'any', name: 'Anything with a shell', connect: 'curl against http://localhost:8080/__maker/: POST /hello, GET /guide, POST /guide, POST /rpc, GET /inbox.',
    ask: 'A numbered list.', browser: 'Your browser tool when you have one, at http://localhost:8080/maker.html; the person\'s default browser otherwise (`npm run maker` without --no-open opens it).',
    run: '`npm run maker -- --no-open` in the background, then the page in your own browser first (see browser); `npm run maker` opens the person\'s.', buttons: false },
];
export const platformById = (id) => PLATFORMS.find(p => p.id === id) ?? PLATFORMS.at(-1);
/** Where the page opens, in one sentence: the invitation, the MCP server's instructions and the guide's board line all say it. */
export const BROWSER_FIRST = 'Open the page in your own browser pane first - the one the person sees beside your chat, where every step of the guide is then shown with its explanation and its buttons - and only when you have no browser of your own, in their default browser.';

// -------------------------------------------------------------------- helpers ----

/** Fill {name}-style placeholders from vars; an unknown one is left as a visible gap, never thrown. */
export function fill(text, vars = {}) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null || vars[k] === '' ? `<${k}?>` : String(vars[k])));
}
/** "11x8", "11 by 8", "11×8" -> { width, height }, or null. */
export function parseSize(text) {
  const m = /(\d{1,2})\s*(?:x|×|by|\*)\s*(\d{1,2})/i.exec(String(text ?? ''));
  if (!m) return null;
  const width = Math.max(5, Math.min(24, +m[1])), height = Math.max(5, Math.min(24, +m[2]));
  return { width, height };
}
const slug = (s) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
const dims = (level) => (level?.rows ? { w: Math.max(...level.rows.map(r => r.length)), h: level.rows.length } : null);
const at = (level, x, y) => level.rows[y]?.[x] ?? '#';
const floorCells = (level) => { const out = []; const d = dims(level); if (!d) return out; for (let y = 1; y < d.h - 1; y++) for (let x = 1; x < d.w - 1; x++) if (at(level, x, y) === '.') out.push([x, y]); return out; };
const count = (level, ch) => (level?.rows ?? []).join('').split(ch).length - 1;
const centre = (level) => { const d = dims(level); return d ? [d.w / 2, d.h / 2] : [0, 0]; };
const nearest = (cells, [cx, cy]) => cells.slice().sort((a, b) => ((a[0] - cx) ** 2 + (a[1] - cy) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2))[0] ?? null;
const unit = (report) => (report?.kind === 'chase' ? 'ticks' : 'moves');
/** The room on the board in one line, for the top of every step. */
export function boardLine(ctx = {}) {
  const { level, lint, report, tutorial } = ctx;
  if (!level) return `Board: nothing reported yet - is the page open? ${BROWSER_FIRST} The page: ${ctx.url ?? 'http://localhost:8080'}/maker.html (Claude Code: the built-in browser pane, preview_start { url } or navigate; Cursor / VS Code: the Simple Browser; a browser tool: navigate to it; none: maker_open { browser: true }, or npm run maker without --no-open). maker_status says whether a page has attached.`;
  const d = dims(level);
  const bits = [`"${level.name ?? 'untitled'}"`, d ? `${d.w}x${d.h}` : level.range ? `a ${level.range} level` : ''];
  bits.push(Array.isArray(lint) ? (lint.length ? `lint: ${lint[0]}` : 'lint ok') : '');
  bits.push(report?.ok ? `checked: par ${report.par} ${unit(report)}` : report?.problems?.length ? `check failed: ${report.problems[0]}` : 'not checked yet');
  if (tutorial?.id) bits.push(`page tutorial "${tutorial.id}" at ${tutorial.at} of ${tutorial.of}${tutorial.step ? ` (${tutorial.step})` : ''}`);
  return `Board: ${bits.filter(Boolean).join(' · ')}`;
}

// ------------------------------------------------------------------- the plans ----
// A plan is the ops that do a step for the person, worked out from the room
// on the board. Each returns [{ op, args }] (or [] with a note when there is
// nothing to do yet). `patch` sets fields on the room; the rest are the
// page's own ops (src/maker.js `ops`).

/** The fast lane's three recipes: what the dice are rolled with for each flavour. */
export const FLAVOURS = {
  garden: { rocks: 2, gate: false, timed: false, cast: 0, minPar: 14 },
  gate: { rocks: 2, gate: true, timed: false, cast: 0, minPar: 16 },
  chase: { rocks: 1, gate: false, timed: true, cast: 1, minPar: 12 },
};
const recipe = (v) => FLAVOURS[v.flavour] ?? FLAVOURS.garden;

const PLANS = {
  blank: () => [{ op: 'load', args: { id: 'blank' } }],
  name: ({ vars }) => [{ op: 'patch', args: { name: vars.name && !/untitled/i.test(vars.name) ? vars.name : NAMES[(vars.roll ?? 0) % NAMES.length] } }],   // no name given: lend one
  wall: ({ level }) => {
    const d = dims(level); if (!d) return [];
    const x = Math.floor(d.w / 2);
    const cells = [];
    for (let y = 1; y < d.h - 1 && cells.length < 3; y++) if (at(level, x, y) === '.') cells.push([x, y, '#']);
    return cells.length ? [{ op: 'paint', args: { cells } }] : [];
  },
  rock: ({ level }) => {
    if (!dims(level)) return [];
    const open = floorCells(level).filter(([x, y]) => at(level, x - 1, y) === '.' && at(level, x + 1, y) === '.' && (at(level, x, y - 1) === '.' || at(level, x, y + 1) === '.'));
    const c = nearest(open, centre(level));
    return c ? [{ op: 'paint', args: { cells: [[c[0], c[1], 'O']] } }] : [];
  },
  button: ({ level }) => {
    const d = dims(level); if (!d) return [];
    const rocks = []; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (at(level, x, y) === 'O') rocks.push([x, y]);
    const r = rocks[0];
    if (r) {
      // along the rock's row, away from the nearer wall, with only floor between
      for (const dx of [1, -1]) {
        let x = r[0] + dx, last = null;
        while (at(level, x, r[1]) === '.') { last = [x, r[1]]; x += dx; }
        if (last && Math.abs(last[0] - r[0]) >= 2) return [{ op: 'paint', args: { cells: [[last[0], last[1], 'b']] } }];
      }
    }
    const c = nearest(floorCells(level), centre(level));
    return c ? [{ op: 'paint', args: { cells: [[c[0], c[1], 'b']] } }] : [];
  },
  formed: ({ level }) => {
    if (!dims(level)) return [];
    const rocks = count(level, 'O'), buttons = count(level, 'b');
    const free = floorCells(level);
    const cells = [];
    if (count(level, 'A') === 0 && free.length) cells.push([...free.shift(), 'A']);
    if (count(level, 'D') === 0 && free.length) cells.push([...free.pop(), 'D']);
    for (let i = rocks; i < buttons && free.length; i++) { const c = nearest(free, centre(level)); free.splice(free.indexOf(c), 1); cells.push([c[0], c[1], 'O']); }
    for (let i = buttons; i < rocks && free.length; i++) { const c = free.pop(); cells.push([c[0], c[1], 'b']); }
    return cells.length ? [{ op: 'paint', args: { cells } }] : [];
  },
  check: () => [{ op: 'check', args: {} }],
  play: () => [{ op: 'play', args: {} }],
  move: ({ report }) => (report?.ok && report.moves?.length ? [{ op: 'moves', args: { moves: [report.moves[0]] } }] : [{ op: 'check', args: {} }, { op: 'moves', args: { moves: ['<the first move Check returned>'] } }]),
  win: ({ report }) => (report?.ok && report.moves?.length ? [{ op: 'play', args: {} }, { op: 'moves', args: { moves: report.moves } }] : [{ op: 'check', args: {} }, { op: 'play', args: {} }, { op: 'moves', args: { moves: ['<the moves Check returned>'] } }]),
  blurb: ({ vars }) => [{ op: 'patch', args: { blurb: vars.blurb } }],
  // the link where the room plays, at the fork's published page when the bridge knows it (anyone opens that one; a checkout's address only its owner)
  export: ({ page }) => [{ op: 'share', args: { where: 'play', ...(page ? { at: 'site', site: page } : {}) } }],
  // the fast lane
  paint: ({ vars }) => {
    const size = { width: vars.width ?? 11, height: vars.height ?? 8 };
    const big = size.width * size.height >= 150;
    const base = recipe(vars);
    const rocks = Math.max(1, Math.min(5, (vars.rocks ?? base.rocks) + (big ? 1 : 0)));
    const gen = { ...size, rocks, gate: base.gate, timed: base.timed, cast: base.cast, minPar: vars.minPar ?? base.minPar, walls: 0.12 };
    if (vars.seed !== undefined) gen.seed = vars.seed;
    return [{ op: 'generate', args: gen }, { op: 'patch', args: { name: vars.name, theme: vars.theme ?? 'garden' } }, { op: 'check', args: {} }, { op: 'snapshot', args: { what: 'board' } }];
  },
  solution: ({ report }) => (report?.ok && report.moves?.length ? [{ op: 'play', args: {} }, { op: 'moves', args: { moves: report.moves } }] : [{ op: 'check', args: {} }, { op: 'play', args: {} }, { op: 'moves', args: { moves: ['<the moves Check returned>'] } }]),
  words: ({ vars }) => [{ op: 'patch', args: { blurb: vars.blurb } }],
  keep: ({ page }) => [{ op: 'share', args: { where: 'play', ...(page ? { at: 'site', site: page } : {}) } }],
  publish: ({ vars }) => [{ op: 'pr', args: { author: vars.author ?? '' } }],
  // the one-bite starter
  starter: ({ vars }) => [{ op: 'load', args: { id: vars.starter ?? 'corridor' } }, { op: 'patch', args: { name: vars.name } }, { op: 'check', args: {} }, { op: 'snapshot', args: { what: 'board' } }],
  dressing: ({ vars }) => [{ op: 'patch', args: { theme: vars.theme ?? 'garden' } }],
};
/** Every op a plan may name: what verify-maker.mjs checks against the page's table. */
export const GUIDE_OPS = ['load', 'patch', 'paint', 'check', 'play', 'moves', 'share', 'generate', 'snapshot', 'pr'];

// ------------------------------------------------------------------- the asks ----

const NAMES = ['The Rose Walk', 'A Very Small Garden', 'The Teapot Corridor', 'Six Impossible Rocks', 'The Queen\'s Shortcut', 'Through the Looking Door'];
const askName = (then) => ({
  key: 'name', q: 'What shall we call your room?',
  options: NAMES.slice(0, 3).map(n => ({ label: n, hint: 'a name to borrow', value: n, then })),
  other: { hint: 'or type any name you like (3 letters or more; it becomes the file\'s name too)', then },
});
const askBlurb = (then) => ({
  key: 'blurb', q: 'One line for the room\'s card - what is it about?',
  options: [
    { label: 'A first room: one rock, one button, one way out.', hint: 'honest and short', then },
    { label: 'Push, think, push again. Mind the corners.', hint: 'a wink', then },
  ],
  other: { hint: 'or your own line, up to 160 characters - what the idea is, not how to solve it', then },
});
/** The standing question on a Rabbit step: did they do it, shall I, or why. */
const askRabbit = (did = 'I did it ✓') => ({
  key: null, q: 'How is it going?',
  options: [
    { label: did, hint: 'the board should show it', then: 'check' },
    { label: 'Do it for me', hint: 'the assistant does this step on the board', then: 'help' },
    { label: 'Why does this matter?', hint: 'one paragraph on the idea behind the step', then: 'why' },
  ],
  other: { hint: 'or ask anything - answer it, then ask this again', then: 'stay' },
});

// --------------------------------------------------------- the three guides ----
// A step: { id, title, say, why?, ask?, plan?, help?, done, next }.
//   say    the line to the person (placeholders from vars; the assistant may warm it up)
//   ask    one question: { key, q, options: [{ label, hint, value?, then, vars?, say? }], other: { hint, then } }
//          then: 'next' (on to the next step) | 'again' (this step's plan again, knobs turned) |
//                'help' (run the help plan) | 'why' (say the why) | 'check' (the page should have moved on) | 'stay'
//   plan   the ops the assistant runs on this step (PLANS[name]); `before: true` runs them before the ask
//   help   what to do when they ask for a shortcut: { say, plan }
//   done   one sentence: how the assistant knows the step is over
//   next   what moves on: 'answer' (the answer decides) | 'auto' (the plan ran) | 'page' (the page's tutorial advanced)

const FAST = [
  {
    id: 'name', title: 'A name', next: 'answer',
    say: 'Hello! I\'m {assistant}, and we are going to build a room together - four quick questions, then I paint while you watch the board. First things first: what shall we call it?',
    why: 'The name is the room\'s title on the stages page and, lower-case with hyphens, the id of its file and of its index line - so two rooms cannot share one. You can change it any time before the room is sent in.',
    ask: askName('next'), done: 'A name is given (vars.name).',
  },
  {
    id: 'shape', title: 'A size', next: 'answer',
    say: '"{name}" - lovely. Now, how big a room?',
    why: 'The size sets how much puzzle fits: a small room is one idea and a short par, a big one has space for detours and more rocks, and takes the solver longer to prove. Five to twenty-four a side; the shipped stages are 13x9 and 9x8.',
    ask: {
      key: 'size', q: 'How big should "{name}" be?',
      options: [
        { label: 'Cosy', hint: '9 by 7 - one idea, no fuss', vars: { width: 9, height: 7 }, then: 'next' },
        { label: 'Roomy', hint: '13 by 9 - space for two rocks and a detour', vars: { width: 13, height: 9 }, then: 'next' },
        { label: 'Grand', hint: '17 by 11 - a real walk', vars: { width: 17, height: 11 }, then: 'next' },
      ],
      other: { hint: 'or a size like 11x8 (5 to 24 a side)', parse: 'size', then: 'next' },
    },
    done: 'A width and a height are set (vars.width, vars.height).',
  },
  {
    id: 'flavour', title: 'A flavour', next: 'answer',
    say: 'Good. What kind of puzzle is it?',
    why: 'The flavour is the recipe the dice roll with: how many rocks, whether a wall with a gate and a lever cuts the room in two, and whether a clock runs with the Red Queen walking a loop. Where the walls fall is the dice\'s own business.',
    ask: {
      key: 'flavour', q: 'Which flavour?',
      options: [
        { label: 'A quiet garden', hint: 'rocks and buttons, no clock - think as long as you like', value: 'garden', then: 'next' },
        { label: 'A locked gate', hint: 'a wall across the room, a gate in it, a lever to find', value: 'gate', then: 'next' },
        { label: 'A chase', hint: 'a clock, and the Red Queen walking a loop - stand still at the wrong moment and she sees you', value: 'chase', then: 'next' },
        { label: 'Surprise me', hint: 'the dice decide', value: 'surprise', then: 'next' },
      ],
      other: { hint: 'or describe it in words; pick the closest of the three for them', then: 'next' },
    },
    done: 'A flavour is set (vars.flavour: garden, gate or chase).',
  },
  {
    id: 'dressing', title: 'A dressing', next: 'answer',
    say: 'Last question before I paint: how should it look?',
    why: 'The dressing is paint, not rules: the same room plays the same in the garden, the hall or the court. It is the first thing a player sees on the card, so pick the one that fits the name.',
    ask: {
      key: 'theme', q: 'Which dressing?',
      options: [
        { label: 'The garden', hint: 'hedges, roses, grass', value: 'garden', then: 'next' },
        { label: 'The hall', hint: 'checkered floor, tall doors', value: 'hall', then: 'next' },
        { label: 'The court', hint: 'red and gold, the Queen\'s own', value: 'court', then: 'next' },
      ],
      other: { hint: 'the closest of the three', then: 'next' },
    },
    done: 'A dressing is set (vars.theme).',
  },
  {
    id: 'paint', title: 'Paint it', next: 'answer', plan: 'paint', before: true,
    say: 'Watch the board - drawing "{name}" now. The dice roll rooms until the solver clears one, so this may take a moment.',
    why: 'Rooms are drawn at random from your four answers and thrown away until the real solver clears one, so what you see is proven solvable. Check then says the par - the fewest moves - and a difficulty word; Harder and Easier turn the knobs and roll again.',
    after: 'Say what came out, from Check\'s answer: the par ("{par} {unit}") and the difficulty word; one sentence.',
    ask: {
      key: 'verdict', q: 'Keep this one?',
      options: [
        { label: 'Keep it ✓', hint: 'it is yours', then: 'next', say: 'Kept! Now let me show you how Alice gets out.' },
        { label: 'Roll again', hint: 'another room from the same recipe', then: 'again', vars: (v) => ({ roll: (v.roll ?? 0) + 1, seed: undefined }) },
        { label: 'Harder', hint: 'more to push, a longer way', then: 'again', vars: (v) => ({ minPar: (v.minPar ?? recipe(v).minPar) + 8, rocks: Math.min(5, (v.rocks ?? recipe(v).rocks) + 1), seed: undefined }) },
        { label: 'Easier', hint: 'fewer rocks, a shorter way', then: 'again', vars: (v) => ({ minPar: Math.max(6, (v.minPar ?? recipe(v).minPar) - 6), rocks: Math.max(1, (v.rocks ?? recipe(v).rocks) - 1), seed: undefined }) },
      ],
      other: { hint: 'a wish in words ("more walls", "no gate"): turn the nearest knob and roll again', then: 'again' },
    },
    help: { say: 'Rolling the dice again.', plan: 'paint' },
    done: 'They chose Keep it. (A refused roll comes straight back to this step with the knobs turned.)',
  },
  {
    id: 'play', title: 'Watch Alice', next: 'answer', plan: 'solution', before: true,
    say: 'Here is how the solver gets Alice out - watch the run.',
    why: 'The run plays the solver\'s own moves with the rules the site uses, so you see the intended way out before anyone else does. Trying it yourself tells you whether the room is fun, which no solver can.',
    after: 'When the run is over, invite them to try it themselves: WASD or the arrows move, B takes a move back, START starts over (Y waits a tick in a chase).',
    ask: {
      key: 'tried', q: 'Want a go yourself?',
      options: [
        { label: 'Let me try', hint: 'the keyboard plays; tell the assistant when you are through or stuck', then: 'stay', say: 'Go on - I\'ll watch. Shout if a rock gets stuck; B takes a move back.' },
        { label: 'Next', hint: 'on to the words', then: 'next' },
      ],
      other: { hint: 'if they say they are through or want to move on, go to the next step; if stuck, offer to play the solution again (HELP)', then: 'next' },
    },
    help: { say: 'Once more, slowly.', plan: 'solution' },
    done: 'They have seen the solution and said Next (or that they are through).',
  },
  {
    id: 'words', title: 'A line about it', next: 'answer', plan: 'words',
    say: 'Every room gets a card on the stages page. One line for it?',
    why: 'The card on the stages page shows the room\'s name, who made it, the par - and this line. Say what the room is about or how it feels, never how to solve it.',
    ask: askBlurb('next'),
    done: 'A blurb is set on the room (the plan ran after the answer).',
  },
  {
    id: 'keep', title: 'A link', next: 'answer', plan: 'keep', before: true,
    say: 'Making your room into a link - the whole room travels in the address, nothing is uploaded.',
    why: 'The whole room travels in the link, so nothing has to be merged first: at your published page\'s address anyone opens it and the badge plays it there; a link at this checkout\'s address opens only for whoever runs it. Your GitHub page is your fork\'s own site; the official site is the game\'s, where a maintainer plays a room before merging it.',
    after: 'Paste the link anywhere: it opens the room as a card on the stages page, where the badge plays it. At your published page\'s address anyone opens it; a link at this checkout\'s address opens only for you.',
    ask: {
      key: 'where', q: 'Where should "{name}" live?',
      options: [
        { label: 'On my GitHub page', hint: 'a pull request on your fork; merged, it is live on your own site in a couple of minutes', value: 'fork', then: 'next' },
        { label: 'Offer it to the official site', hint: 'a pull request to the game\'s repository; a maintainer plays it and merges', value: 'upstream', then: 'next' },
        { label: 'Just the link for now', hint: 'keep the link, decide later', value: 'link', then: 'finish' },
      ],
      other: { hint: 'both is fine too: fork first, then upstream', then: 'next' },
    },
    done: 'They chose where the room goes.',
  },
  {
    id: 'publish', title: 'On your page', next: 'auto', plan: 'publish',
    say: 'Putting "{name}" into the repository now - I\'ll say when it is live.',
    why: 'A room reaches a site through a pull request: its file and one index line, checked by the same solver, deployed by the Pages workflow in about two minutes. On your own fork you merge it yourself; the official site asks a maintainer.',
    work: [
      'Take the brief: op pr / maker_pr_brief (the plan below). It carries the module, the file name, the index line, the branch and the commit; follow its steps 1 to 5 in the clone, exactly (write the file, add the index line, `npm run stage`, `npm run verify`, one commit on the branch).',
      'You are in the person\'s fork ({fork}). Push the branch there: `git push -u origin {branch}`.',
      'Their page: open the pull request on THEIR fork - `gh pr create --repo {fork} --base main --head {branch} --title "Community room: {name}" --body-file <the body>` - and show them the link. When they say merge: `gh pr merge --squash --delete-branch`. (If they would rather skip the pull request, committing on main and pushing does the same.)',
      'Make sure their site is on: `gh api repos/{fork}/pages` (404 -> `gh api -X POST repos/{fork}/pages -f build_type=workflow`) and `gh workflow enable pages.yml --repo {fork}` (refused -> the Actions tab of the fork has a button to enable workflows; ask them to press it).',
      'The Pages workflow redeploys on the merge: `gh run watch --repo {fork}` (about two minutes; say so). Then the room is live at {page}index.html?room={id} - send them that address, and the maker\'s address {page}maker.html so the next person can start from their page.',
      'The official site, if they asked: `gh pr create --repo {upstream} --base main --head {login}:{branch} --title "Community room: {name}" --body-file <the body>`; one room per pull request, nothing under src/ touched.',
    ],
    done: 'The room is in a pull request (or merged) and they have the address of their page.',
  },
  {
    id: 'finish', title: 'Done', next: 'answer',
    say: '🎉 "{name}" is a real room - built, proved, played and yours. Thank you for making it with me!',
    why: 'Whatever you choose next, the room stays on the board and on this browser\'s shelf; the link and the pull request are the two ways it leaves this machine.',
    ask: {
      key: 'again', q: 'What next?',
      options: [
        { label: 'Another room', hint: 'the fast lane again, from the top', then: 'restart' },
        { label: 'The full tour', hint: 'Follow the White Rabbit: build one by hand, step by step', then: 'mode:tutorial' },
        { label: 'That\'s all for now', hint: 'the room stays on the board and on your shelf', then: 'end' },
      ],
      other: { hint: 'a glitch level for the range page is also a thing the studio makes (the second category) - offer it', then: 'end' },
    },
    done: 'They said what comes next.',
  },
];

const BASIC = [
  {
    id: 'name', title: 'A name', next: 'answer',
    say: 'Hello! I\'m {assistant}. Three small questions and you will have a room with your name on it. What shall we call it?',
    why: 'The name is the room\'s title on the stages page and, lower-case with hyphens, the id of its file; two rooms cannot share one.',
    ask: askName('next'), done: 'A name is given.',
  },
  {
    id: 'starter', title: 'A starter', next: 'answer', plan: 'starter',
    say: 'Which room shall "{name}" begin as?',
    why: 'A starter is a small room that is already proven - every one has been solved by the checker - so your first room works before you have touched it. Any of it can be repainted later.',
    ask: {
      key: 'starter', q: 'Pick a starter',
      options: STARTERS.filter(s => ['corridor', 'gate', 'two-rooms'].includes(s.id)).map(s => ({ label: s.name, hint: s.blurb, value: s.id, then: 'next' })),
      other: { hint: 'the closest of the three', then: 'next' },
    },
    after: 'The plan loads the starter, names it, Checks it and takes a picture: say the par in one sentence ("{par} {unit}, the solver says").',
    done: 'The starter is on the board with their name on it, and Checked.',
  },
  {
    id: 'dressing', title: 'A dressing', next: 'answer', plan: 'dressing',
    say: 'And how should it look?',
    why: 'The dressing is paint, not rules: the room plays the same in the garden, the hall or the court. It is what a player sees first on the card.',
    ask: {
      key: 'theme', q: 'Which dressing?',
      options: [
        { label: 'The garden', hint: 'hedges, roses, grass', value: 'garden', then: 'next' },
        { label: 'The hall', hint: 'checkered floor, tall doors', value: 'hall', then: 'next' },
        { label: 'The court', hint: 'red and gold, the Queen\'s own', value: 'court', then: 'next' },
      ],
      other: { hint: 'the closest of the three', then: 'next' },
    },
    done: 'The dressing is set.',
  },
  {
    id: 'play', title: 'Watch Alice', next: 'answer', plan: 'solution', before: true,
    say: 'Watch - this is how Alice gets out.',
    why: 'The run plays the solver\'s moves with the rules the site uses: the intended way out, seen before anyone else. Trying it yourself tells you whether it is fun.',
    after: 'Then invite them to try: WASD or the arrows, B takes a move back, START starts over.',
    ask: {
      key: 'tried', q: 'Want a go yourself?',
      options: [
        { label: 'Let me try', hint: 'the keyboard plays', then: 'stay', say: 'Go on - I\'ll watch.' },
        { label: 'Next', hint: 'on to the link', then: 'next' },
      ],
      other: { hint: 'through or moving on: next; stuck: play the solution again (HELP)', then: 'next' },
    },
    help: { say: 'Once more.', plan: 'solution' },
    done: 'They have seen the solution.',
  },
  {
    id: 'keep', title: 'A link', next: 'answer', plan: 'keep', before: true,
    say: 'Here is your room as a link - paste it anywhere, it carries the whole room.',
    why: 'Nothing is uploaded: the whole room is in the address. Your GitHub page is your fork\'s site, where a merged room is live in about two minutes.',
    ask: {
      key: 'where', q: 'Put "{name}" on your GitHub page too?',
      options: [
        { label: 'Yes, on my page', hint: 'a pull request on your fork; merged, it is live in a couple of minutes', value: 'fork', then: 'next' },
        { label: 'Just the link', hint: 'decide later', value: 'link', then: 'finish' },
      ],
      other: { hint: 'the official site is a pull request too - the next step says how', then: 'next' },
    },
    done: 'They chose.',
  },
  { ...FAST.find(s => s.id === 'publish') },
  {
    id: 'finish', title: 'Done', next: 'answer',
    say: '🎉 "{name}" is yours. That was the one-bite version - the Rabbit has a longer walk whenever you want it.',
    why: 'The room stays on the board and on this browser\'s shelf whatever comes next; the Rabbit builds the next one by hand, step by step, Drink Me shapes a bigger one fast.',
    ask: {
      key: 'again', q: 'What next?',
      options: [
        { label: 'Follow the White Rabbit', hint: 'build the next one by hand, step by step', then: 'mode:tutorial' },
        { label: 'Drink Me', hint: 'the fast lane: four questions and a room of your own shape', then: 'mode:fast' },
        { label: 'That\'s all for now', hint: 'the room stays on the board', then: 'end' },
      ],
      other: { hint: 'anything else: answer, then offer the three again', then: 'end' },
    },
    done: 'They said what comes next.',
  },
];

/** What the assistant says and does on each step of the page's "rabbit" build: the warm line, the help. */
const RABBIT_COACH = {
  blank: { say: 'Let\'s start from nothing: open Start from… under the map and pick A blank room. Walls all round, Alice in a corner, the door in the other - the smallest thing that is already a room.', help: { say: 'Here is a blank room to start from.', plan: 'blank' },
           ask: askRabbit('Got a blank room ✓') },
  name:  { say: 'First, a name. Type one in the Name box - anything three letters or longer. It becomes the file\'s name too, so make it yours.', help: { say: 'I\'ll type it for you.', plan: 'name' },
           ask: { key: 'name', q: 'What shall we call it?', options: [{ label: 'I typed one ✓', hint: 'the Name box has it', then: 'check' }, { label: 'You pick one for me', hint: 'the assistant names it', value: NAMES[1], then: 'help' }, { label: 'Why does the name matter?', then: 'why' }], other: { hint: 'or tell me the name here and I will type it', then: 'help' } } },
  wall:  { say: 'Now some walls: the wall brush is 1, then click or drag on the board - two or three cells, anywhere inside. Right-click paints floor if you change your mind.', help: { say: 'A short wall, right down the middle.', plan: 'wall' }, ask: askRabbit('Wall painted ✓') },
  rock:  { say: 'A rock! Brush 4, then a floor cell Alice can get behind - rocks only move away from her, one push at a time. The hatched cells are corners where a rock is lost; keep off them.', help: { say: 'A rock, somewhere pushable.', plan: 'rock' }, ask: askRabbit('Rock placed ✓') },
  button:{ say: 'Every rock wants a button. Brush 5, somewhere the rock can be pushed to - the rock\'s own row with clear floor between is the easiest.', help: { say: 'A button at the end of the rock\'s row.', plan: 'button' }, ask: askRabbit('Button placed ✓') },
  formed:{ say: 'Look under the map: the lint tells you what is still missing. Green means the room has the right shape - one Alice, one door, as many rocks as buttons, walls all round.', help: { say: 'Let me fix what the lint is grumbling about.', plan: 'formed' }, ask: askRabbit('Lint is green ✓') },
  check: { say: 'Moment of truth: press Check. The real solver looks for a way out and says how many moves. "Unsolvable" is not a failure, it is a clue - the rock is stuck or the button out of reach.', help: { say: 'Checking it now.', plan: 'check' }, ask: askRabbit('Checked ✓') },
  play:  { say: 'Now play it: press Run & debug. The room is played with the rules the site uses.', help: { say: 'Starting the run.', plan: 'play' }, ask: askRabbit('Running ✓') },
  move:  { say: 'Move Alice - WASD, the arrows, or click the little badge\'s d-pad.', help: { say: 'One step, the solver\'s first.', plan: 'move' }, ask: askRabbit('She moved ✓') },
  win:   { say: 'Push the rock onto its button and walk to the door. B takes a move back, START starts over. Take your time - this is your puzzle.', help: { say: 'Watch Alice do it.', plan: 'win' }, ask: askRabbit('Out the door ✓') },
  blurb: { say: 'Give the room a line for its card - the box under the map. What it is about, not how to solve it.', help: { say: 'I\'ll write one in.', plan: 'blurb' },
           ask: { key: 'blurb', q: 'One line for the card?', options: [{ label: 'I wrote one ✓', hint: 'the blurb box has it', then: 'check' }, { label: 'You write one', hint: 'the assistant writes a line', value: 'A first room: one rock, one button, one way out.', then: 'help' }], other: { hint: 'or tell me the line here and I will type it', then: 'help' } } },
  export:{ say: 'Last step: send it in. Share a link (it carries the whole room; "play it" at the published site is the one for a friend), copy or download the module, or press "Open a pull request with your AI" and I will do the rest.', help: { say: 'Here is your room as a link.', plan: 'export' }, ask: askRabbit('Sent ✓') },
};

/** The Rabbit's steps for the assistant: the page's build, step for step, plus the two closing steps of the fast lane. */
function rabbitSteps() {
  const build = MAKER_TUTORIALS.find(t => t.id === (modeById('tutorial').tutorial));
  const steps = (build?.steps ?? []).map((s, i) => {
    const c = RABBIT_COACH[s.id] ?? {};
    return { id: s.id, title: s.title, next: 'page', page: i, say: c.say ?? s.say, why: s.why, ask: c.ask ?? askRabbit(), help: c.help ?? null,
             done: `The page's tutorial has moved past this step (maker_get -> tutorial.at > ${i}; the inbox gets "✓ ${s.title}").` };
  });
  const publish = { ...FAST.find(s => s.id === 'publish'), say: 'Shall I put "{name}" on your GitHub page? Say yes and I will do the repository work.',
                    ask: { key: 'where', q: 'Put "{name}" on your page?', options: [{ label: 'Yes, on my page', hint: 'a pull request on your fork; merged, it is live in a couple of minutes', value: 'fork', then: 'next' }, { label: 'And the official site', hint: 'both: your fork, then a pull request upstream', value: 'both', then: 'next' }, { label: 'Not now', hint: 'the room stays on the board and in the link', value: 'link', then: 'finish' }], other: { hint: 'their call', then: 'next' } }, next: 'answer' };
  const finish = { id: 'finish', title: 'Done', next: 'answer',
    say: '🎉 You followed the Rabbit all the way: a room from nothing, proved and played. That is the whole craft; everything else is taste.',
    why: 'The twelve steps you just did are the whole of it: a shape, a rock and its button, the proof and the play. The next builds - a gate, a clock, a lesson - are taste; the room stays on the board and on the shelf.',
    ask: { key: 'again', q: 'What next?', options: [{ label: 'A Room with a Gate', hint: 'the next guided build on the page: a wall, a gate, a lever that earns its keep', then: 'tutorial:gate' }, { label: 'Drink Me', hint: 'a bigger room, fast', then: 'mode:fast' }, { label: 'That\'s all for now', hint: 'the room stays on the board', then: 'end' }], other: { hint: 'anything else: answer, then offer these again', then: 'end' } },
    done: 'They said what comes next.' };
  return [...steps, publish, finish];
}

export function guideSteps(mode) {
  if (mode === 'tutorial') return rabbitSteps();
  if (mode === 'fast') return FAST;
  if (mode === 'basic') return BASIC;
  return [];
}
export const guidePlan = (mode) => guideSteps(mode).map(s => s.title);

// -------------------------------------------------------------------- a step ----

/** The variables every step may name, from the context: the room, the verdict, the repository, the assistant. */
export function guideVars(ctx = {}) {
  const { vars = {}, level, report, assistant, repo, fork, login, page } = ctx;
  const name = vars.name ?? level?.name ?? 'your room';
  const up = repo ?? 'https://github.com/bsidestlv/bsidestlv-2026-badge';
  const upstream = up.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
  const f = fork ?? (login ? `${login}/${upstream.split('/')[1]}` : null);
  const id = slug(name);
  return {
    ...vars, name, id, branch: `community/${id}`,
    assistant: assistant ?? vars.assistant ?? 'your assistant',
    par: report?.ok ? report.par : '?', unit: unit(report), difficulty: vars.difficulty ?? '',
    upstream, fork: f ?? '<your-login>/<repo>', login: login ?? f?.split('/')[0] ?? '<your-login>',
    page: page ?? (f ? `https://${f.split('/')[0]}.github.io/${f.split('/')[1]}/` : 'https://<your-login>.github.io/<repo>/'),
  };
}

/**
 * Step `at` of `mode`, concrete: placeholders filled, the plan and the help
 * worked out against the room in `ctx`. Past the end: { over: true }.
 */
export function guideStep(mode, at, ctx = {}) {
  const steps = guideSteps(mode);
  const raw = steps[at];
  const m = modeById(mode);
  if (!m) return null;
  if (!raw) return { over: true, mode, at: steps.length, of: steps.length, title: 'Done', say: fill(`That was ${m.title}. The room stays on the board and on the person's shelf; the stages page plays it from the link.`, {}) };
  const v = guideVars(ctx);
  const planCtx = { ...ctx, vars: v, level: ctx.level, report: ctx.report };
  const ops = raw.plan ? (PLANS[raw.plan]?.(planCtx) ?? []) : [];
  const help = raw.help ? { say: fill(raw.help.say, v), do: PLANS[raw.help.plan]?.(planCtx) ?? [] } : null;
  const ask = raw.ask ? {
    key: raw.ask.key, q: fill(raw.ask.q, v),
    options: raw.ask.options.map(o => ({ label: fill(o.label, v), hint: o.hint ? fill(o.hint, v) : '', value: o.value ?? o.label, then: o.then })),
    other: raw.ask.other ? { hint: fill(raw.ask.other.hint, v), then: raw.ask.other.then } : null,
  } : null;
  return {
    mode, at, of: steps.length, id: raw.id, title: raw.title, next: raw.next, page: raw.page ?? null,
    say: fill(raw.say, v), why: raw.why ? fill(raw.why, v) : null, after: raw.after ? fill(raw.after, v) : null,
    ask, do: ops, before: !!raw.before, help, work: raw.work ? raw.work.map(w => fill(w, v)) : null, done: fill(raw.done, v), vars: v,
  };
}

/**
 * What the person's answer to the step's question does: which option it was
 * (by number, label, value or a word of the label), or their own words put
 * under the question's key. Returns { then, vars, say, option }.
 */
export function applyAnswer(step, answer, vars = {}) {
  const ask = step?.ask;
  const text = String(answer ?? '').trim();
  if (!ask) return { then: 'next', vars, say: null, option: null };
  const n = /^(\d+)[.)]?\s*$/.exec(text)?.[1];
  const low = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  let o = n ? ask.options[+n - 1] : null;
  if (!o) o = ask.options.find(x => x.label.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim() === low || String(x.value).toLowerCase() === low);
  if (!o) o = ask.options.find(x => { const l = x.label.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim(); return low.length >= 3 && (l.includes(low) || low.includes(l)); });
  const raw = o ? guideSteps(step.mode)[step.at]?.ask?.options?.find(x => fill(x.label, step.vars) === o.label) : null;
  let next = { ...vars };
  // what they meant, whatever the step's own options: a why, a hand up, a skip, a "done"
  if (!o) {
    if (/^(why|explain|tell me more|what does|what is|how come)\b/i.test(text)) return { then: 'why', vars, say: null, option: null };
    if (step.help && /(do it for me|do this for me|you do it|help|shortcut|can you do|please do)/i.test(text)) return { then: 'help', vars, say: null, option: null };
    if (/^(skip|next|move on|go on)\b/i.test(text)) return { then: step.next === 'page' ? 'skip' : 'next', vars, say: null, option: null };
    if (/(did it|i did|done|got it|finished|ready|✓|^ok\b|^yes\b|^yep)/i.test(text) && step.next === 'page') return { then: 'check', vars, say: null, option: null };
  }
  if (o) {
    if (raw?.vars) Object.assign(next, typeof raw.vars === 'function' ? raw.vars(vars) : raw.vars);
    if (ask.key && o.value !== undefined && !raw?.vars) next[ask.key] = o.value;
    if (next.flavour === 'surprise') next.flavour = Object.keys(FLAVOURS)[Math.floor(Math.random() * 3)];
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    return { then: o.then, vars: next, say: raw?.say ? fill(raw.say, { ...step.vars, ...next }) : null, option: o.label };
  }
  // their own words
  const other = ask.other ?? { then: 'next' };
  if (other.parse === 'size' || (ask.key === 'size')) { const s = parseSize(text); if (s) Object.assign(next, s); else return { then: 'stay', vars, say: 'That is not a size I can read - try "11x8".', option: null }; }
  else if (ask.key === 'flavour') next.flavour = /gate|lever|lock/i.test(text) ? 'gate' : /chase|queen|clock|time|run/i.test(text) ? 'chase' : /surprise|dice|random/i.test(text) ? 'surprise' : 'garden';
  else if (ask.key === 'theme') next.theme = /hall|check|door/i.test(text) ? 'hall' : /court|queen|red|gold/i.test(text) ? 'court' : 'garden';
  else if (ask.key === 'starter') next.starter = /gate|lever/i.test(text) ? 'gate' : /two|three|rooms/i.test(text) ? 'two-rooms' : 'corridor';
  else if (ask.key === 'where') next.where = /fork|my page|mine|github page|yes/i.test(text) ? 'fork' : /upstream|official|site/i.test(text) ? 'upstream' : /both/i.test(text) ? 'both' : 'link';
  else if (ask.key === 'name' || ask.key === 'blurb') { if (text.length < 3) return { then: 'stay', vars, say: `A little longer than that - three letters or more.`, option: null }; next[ask.key] = text; }
  else if (ask.key) next[ask.key] = text;
  if (next.flavour === 'surprise') next.flavour = Object.keys(FLAVOURS)[Math.floor(Math.random() * 3)];
  return { then: other.then ?? 'next', vars: next, say: null, option: null };
}

// --------------------------------------------------------------------- as text ----

const json = (o) => JSON.stringify(o);
const opLine = (d) => `  - ${d.op} ${json(d.args ?? {})}`;

/** One step as a block of plain instructions a small model follows line by line. `platform` picks the ask's wording. */
export function guideText(mode, at, ctx = {}) {
  const m = modeById(mode);
  if (!m) return `No such way: ${mode}. The ways are ${GUIDE_IDS.join(', ')}.`;
  const s = guideStep(mode, at, ctx);
  const p = platformById(ctx.platform);
  const head = `🐇 THE WHITE RABBIT'S GUIDE · ${m.title} (${m.kicker})`;
  if (s.over) return `${head} · done\n${boardLine(ctx)}\n\nSAY: ${s.say}\nThere is nothing more to follow. Offer the other ways (${GUIDE_MODES.filter(x => x.id !== mode).map(x => x.title).join(', ')}): maker_guide {"mode": "<id>"} starts one.`;
  const lines = [`${head} · step ${at + 1} of ${s.of}: ${s.title}`, boardLine(ctx), ''];
  if (at === 0) { lines.push('HOW TO BEHAVE (every step):'); for (const r of GUIDE_RULES) lines.push(`  · ${r}`); lines.push(''); }
  const tool = (mcp, http) => `${mcp} (HTTP: ${http})`;
  let n = 1;
  lines.push(`${n++}. SAY to the person, in your own warm words, in your chat AND on the page (maker_say / op say) - one line: the page shows this step too, as a card with the line, the why and the buttons, so they are not made to read it twice:`, `   "${s.say}"`);
  if (s.why) lines.push(`   WHY, if they ask: ${s.why}`);
  if (s.do.length && s.before) {
    lines.push(`${n++}. DO, in order - or let the bridge do it: ${tool('maker_guide {"run": true}', 'POST /__maker/guide {"run": true}')}:`, ...s.do.map(opLine));
    if (s.after) lines.push(`   THEN ${s.after}`);
  }
  const work = () => { if (s.work) { lines.push(`${n++}. DO the repository work${s.do.length ? ` (take the brief first: ${s.do.map(opLine).join('').trim()})` : ''}:`); for (const w of s.work) lines.push(`   - ${w}`); } };
  if (!s.ask) work();
  if (s.ask) {
    const how = p.buttons ? `use your option buttons (${p.ask.split(':')[0]})` : 'list the options numbered and wait for a reply';
    lines.push(`${n++}. ASK one question - ${how}; the person may answer in their own words:`, `   Q: ${s.ask.q}`);
    s.ask.options.forEach((o, i) => lines.push(`     ${i + 1}. ${o.label}${o.hint ? ` - ${o.hint}` : ''}`));
    if (s.ask.other) lines.push(`     (anything else: ${s.ask.other.hint})`);
    lines.push(`${n++}. THEN pass the answer back: ${tool(`maker_guide {"answer": "<what they said>", "at": ${at}}`, `POST /__maker/guide {"answer": "...", "at": ${at}}`)} - it tells you what happens (the next step, this step again with the knobs turned, HELP, or the WHY) and gives you the next instructions. Follow them. If they pressed a button on the page instead, the guide has already applied it and answers "moved" with their choice: go on from there, do not ask again.`);
  }
  if (s.ask && s.work) work();
  else if (s.do.length && !s.before) { lines.push(`${n++}. AFTER the answer, DO (the guide fills the arguments from it; ${tool('maker_guide {"answer": "...", "run": true}', 'POST /__maker/guide {"answer": "...", "run": true}')} does both):`, ...s.do.map(opLine)); if (s.after) lines.push(`   THEN ${s.after}`); }
  if (s.next === 'auto') lines.push(`${n++}. THEN move on: ${tool('maker_guide {"next": true}', 'POST /__maker/guide {"next": true}')}.`);
  if (s.next === 'page') lines.push(`${n++}. WAIT for either: the page moving on (${tool('maker_guide', 'GET /__maker/guide')} shows step ${at + 2}; maker_read_chat gets "✓ ${s.title}") or their answer. If they say they did it and the page has not moved, say kindly what the board has not seen yet and what to click.`);
  if (s.help) lines.push(`${n++}. HELP - when they ask for help, a shortcut, or "do it for me" (${tool('maker_guide {"help": true, "run": true}', 'POST /__maker/guide {"help": true, "run": true}')} does it): say "${s.help.say}", then`, ...(s.help.do.length ? s.help.do.map(opLine) : ['  - (nothing to do yet: the board has no room to work on - load one first)']), '   and say what you did.');
  lines.push(`DONE WHEN: ${s.done}`);
  if (at > 0) lines.push(`RULES: one step at a time · say, then ask · short and warm · the page carries the step, you add a line · their hands on the Rabbit · read the page's chat too · pass every answer to the guide.`);
  return lines.join('\n');
}

/** The welcome in one paragraph, for an assistant that has just said hello and is waiting for the pick. */
export function guideWelcome(ctx = {}) {
  const v = guideVars(ctx);
  return [
    `🐇 THE WHITE RABBIT'S GUIDE · waiting for the person's pick`,
    boardLine(ctx),
    '',
    `Your hello put a welcome banner on their screen with three ways to build a first room: ${GUIDE_MODES.map(m => `${m.title} (${m.kicker}, ${m.time})`).join('; ')}.`,
    `SAY, in your chat and on the page (maker_say): "Hi, I'm ${v.assistant}! Pick a way on the banner - or tell me here: Rabbit, Drink Me or Eat Me - and we'll build your first room together."`,
    `WAIT for the pick: maker_guide {"waitMs": 120000} (GET /__maker/guide?wait=120000) returns the first step the moment they choose. If they answer in words instead, pick for them: maker_guide {"mode": "tutorial" | "fast" | "basic"} - the guide refuses that when they have just picked on the banner, and tells you what they picked. If they close the banner and say nothing, ask once more, then suggest Eat Me.`,
    '',
    'HOW TO BEHAVE (every step):', ...GUIDE_RULES.map(r => `  · ${r}`),
  ].join('\n');
}
