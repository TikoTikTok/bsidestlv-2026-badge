// Alice in AI Land - what the level maker hands an assistant.
//
// Two prompts, kept out of src/maker.js (which touches the DOM as it loads)
// so Node can read and check them (software/tools/verify-maker.mjs):
//
//   aiPrompt(repoUrl)   the invitation under the hero: come and build a room
//                       with me, in the studio, over the bridge.
//   prPrompt(repoUrl, level, { author, report, difficulty })
//                       the brief for one finished room: everything an
//                       assistant needs to put THIS room into the repository
//                       as a pull request - the module, the index line, the
//                       branch, the commands, the body, the rules.
//   prParts(level, { author })
//                       the pieces the brief is made of, as data (the bridge's
//                       op `pr` returns them beside the brief).
//   prShort(repoUrl)    a note that fits in a link when the brief does not:
//                       the brief is on the clipboard, it will be pasted.
//
// Module-scope names and imports survive the deploy's obfuscation; the
// strings are packed with every other string in the file.

import { toModule, idOf, kindOf } from './level.js';

/** { owner, repo } from a repository URL (https://github.com/<owner>/<repo>), or null when it is not shaped like one. */
export function repoParts(repoUrl) {
  const m = /^https?:\/\/[^/]+\/([^/]+)\/([^/#?]+)/i.exec(repoUrl ?? '');
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}
/** Where a fork's site is published: https://<login>.github.io/<repo>/ (the same name as the repository forked). */
export const pagesUrl = (login, repoUrl) => `https://${login}.github.io/${repoParts(repoUrl)?.repo ?? 'bsidestlv-2026-badge'}/`;
/** Where a merged room plays on that site: the stages page's Rooms panel opened on it (a glitch level: the range page's tab). */
export const roomUrl = (login, repoUrl, level) => `${pagesUrl(login, repoUrl)}${kindOf(level) === 'tea' || kindOf(level) === 'chase' ? `index.html?room=${idOf(level)}` : 'glitch.html'}`;

/**
 * The prompt a visitor hands to an assistant: fork first, so the room lands
 * on their own page; the studio; the bridge; the welcome banner and the
 * White Rabbit's guide (src/guide.js), which does the step-by-step for any
 * assistant, however small. It goes to the repository, which is readable;
 * this site is not meant to be.
 */
export const aiPrompt = (repoUrl) => {
  const p = repoParts(repoUrl);
  const slug = p ? `${p.owner}/${p.repo}` : repoUrl;
  const repo = p?.repo ?? 'bsidestlv-2026-badge';
  return `Help me build my first level for "Alice in AI Land", the BSidesTLV 2026 badge puzzle game - with me, step by step, in its level studio. You run the tools; I make the choices. Keep it fun and short.

1. Fork first, so the room lands on MY page: \`gh repo fork ${slug} --clone\` then \`cd ${repo}\` (no gh: fork ${repoUrl} on GitHub and clone the fork). Switch my site on: \`gh workflow enable pages.yml\` (refused? tell me to press "enable workflows" in the fork's Actions tab) and \`gh api -X POST repos/<my-login>/${repo}/pages -f build_type=workflow\` (my login: \`gh api user --jq .login\`; 409 means it is on). My site will be https://<my-login>.github.io/${repo}/.
2. Read AGENTS.md in the clone: the short map. Then start the studio: \`npm run maker\` (Node 20+, no dependencies) serves the checkout on http://localhost:8080, opens maker.html in my browser and mounts your bridge at http://localhost:8080/__maker/ (loopback only). Open the page yourself if it is not open.
3. Connect and say hello, so the page shows you. With MCP, the clone registers the server \`alice-maker\` (node software/tools/maker-mcp.mjs) for Claude Code (.mcp.json), Cursor (.cursor/mcp.json), Codex (.codex/config.toml), Gemini CLI (.gemini/settings.json) and VS Code Copilot (.vscode/mcp.json): maker_status, maker_guide, maker_say, maker_read_chat, maker_get, maker_patch, maker_paint, maker_generate, maker_check, maker_play, maker_moves, maker_snapshot, maker_share, maker_pr_brief and more. Without MCP, curl: POST /__maker/hello {"name": "<you>"}, GET /__maker/guide, POST /__maker/guide {...}, POST /__maker/rpc {"op": "get" | "patch" | "paint" | "check" | "play" | "moves" | "say" | "generate" | "share" | "pr" | ..., "args": {...}}, GET /__maker/inbox?since=0&wait=20000 (what I type on the page).
4. Your hello pops a welcome banner on my screen with three ways: Follow the White Rabbit (step by step: I hold the brush, you coach), Drink Me (you ask me four questions and paint the room with me), Eat Me (the one-bite starter). Wait for my pick: maker_guide {"waitMs": 120000} (GET /__maker/guide?wait=120000). If I answer here in words instead, pick for me: maker_guide {"mode": "tutorial" | "fast" | "basic"}.
5. Then follow the guide one step at a time. Each step tells you exactly what to SAY, what to ASK (one question, a few options: use your option buttons if you have them - Claude Code's AskUserQuestion with Other for my own words - else a numbered list), what to DO on the board, and when it is DONE. Pass my answers back (maker_guide {"answer": "..."}); {"run": true} lets the bridge do the step's work for you; {"help": true, "run": true} is what to do when I ask for help or a shortcut. Celebrate every step, talk to me here and in the page's chat (maker_say), and never leave me waiting without a word.
6. At the end the guide shows how to put the room on my page (a pull request on my fork, merged when I say so; the Pages workflow deploys it in about two minutes, at https://<my-login>.github.io/${repo}/index.html?room=<id>) and, if I want, offers it to ${slug} with a second pull request.`;
};

/** The pieces a room's pull request is made of: its id, file, module source, index line and branch. */
export function prParts(level, { author } = {}) {
  const id = idOf(level);
  const name = String(level.name ?? '');
  const a = (author ?? '').trim();
  return {
    id,
    file: `stages/community/${id}.js`,
    source: toModule(level, { author: a || undefined }),
    indexLine: { id, name, author: a, kind: kindOf(level) },
    branch: `community/${id}`,
  };
}

/** The index line as stages/community/index.json writes one. */
export const indexLineText = ({ id, name, author, kind }) =>
  `{ "id": ${JSON.stringify(id)}, "name": ${JSON.stringify(name)}, "author": ${JSON.stringify(author ?? '')}, "kind": ${JSON.stringify(kind)} }`;

const FENCE = '```';

/**
 * The brief that ships one room: hand it to an assistant with a checkout and
 * it has everything a room pull request needs. `report` is the studio's last
 * Check when there was one ({ ok, kind, par, notes }), `difficulty` its word
 * ({ label }); without them the brief leaves the par to the checks.
 */
export function prPrompt(repoUrl, level, { author, report, difficulty } = {}) {
  const parts = prParts(level, { author });
  const { id, file, source, indexLine, branch } = parts;
  const owner = repoParts(repoUrl);
  const slug = owner ? `${owner.owner}/${owner.repo}` : repoUrl;
  const w = level.rows?.[0]?.length ?? 0, h = level.rows?.length ?? 0;
  const timed = indexLine.kind === 'chase';
  const unit = timed ? 'ticks' : 'moves';
  const checked = report?.ok ? `par ${report.par} ${unit}` + (difficulty?.label ? `, ${difficulty.label}` : '') : null;
  const lesson = level.lesson?.length ? `${level.lesson.length} step${level.lesson.length === 1 ? '' : 's'}` : null;
  const who = indexLine.author || null;

  // the room in a sentence, which is also the pull request's first line
  const sentence = `"${indexLine.name}" is ${timed ? `a timed room (${level.tickMs ?? 320} ms a tick)` : 'an untimed room'}, ${w}x${h}` +
    (level.theme ? ` in the ${level.theme} dressing` : '') + (who ? `, by ${who}` : '') +
    (level.blurb ? `: ${level.blurb}` : '') + '.';
  const body = [
    sentence,
    checked ? `The level maker's Check says ${checked}.` : null,
    report?.ok && report.notes?.length ? `Its notes: ${report.notes.join('; ')}.` : null,
    lesson ? `It carries a lesson of ${lesson} for the stages page.` : null,
    'Made with the level maker (maker.html); the checks prove it solves.',
  ].filter(Boolean).join(' ');

  return `Open a pull request that adds a room of mine to "Alice in AI Land", the BSidesTLV 2026 badge puzzle game. The room is finished and checked in its level studio; your part is the repository work below, exactly as written, and nothing else. Do not change the room, and change nothing under src/ or stages/ outside the two files named here.

The room: ${sentence}${checked ? ` The last Check in the studio: ${checked}.` : ''}${lesson ? ` Its lesson has ${lesson}.` : ''}${who ? '' : ' No author is set: ask me for a name or handle and put it in the index line\'s "author" field before you commit.'}

1. Work in a checkout of ${repoUrl} (clone it if you have none: \`git clone ${repoUrl}\`; Node 20 or newer, no dependencies). Start a branch from main: \`git fetch origin\` then \`git checkout -b ${branch} origin/main\`.
2. Write the module at the end of this brief, verbatim, to ${file}. The comment header is the file's documentation: keep it.
3. Add this line to the "stages" list in stages/community/index.json, keeping the list sorted by id (a comma after the entry before it, none after the last):
   ${indexLineText(indexLine)}
4. Run \`npm run stage -- ${file}\` (the verdict CI reaches on the room) and then \`npm run verify\` (everything the deploy runs: every listed room, and that nothing in the folder is unlisted). Both must end green. If either does not, stop and tell me what it said; do not change the room to make it pass.
5. One commit with the two files and nothing else: \`git add ${file} stages/community/index.json\` then \`git commit -m "Community room: ${indexLine.name}"\`.
6. Push the branch: \`git push -u origin ${branch}\`. If you cannot push to ${slug}, push to a fork of it instead (\`gh repo fork ${slug} --remote=true\` adds the fork as the remote \`fork\`; then \`git push -u fork ${branch}\`).
7. Open the pull request against ${slug}, base main, title "Community room: ${indexLine.name}", with the body below. With gh installed: \`gh pr create --repo ${slug} --base main --head ${branch} --title "Community room: ${indexLine.name}" --body-file <the body saved to a file>\` (from a fork, \`--head <your GitHub login>:${branch}\`). Without gh, open https://github.com/${slug}/compare/main...<your GitHub login>:${branch}?expand=1 and paste the body there. On my own fork, the same pull request against the fork's main, merged, puts the room on my page at the next Pages deploy (https://<your GitHub login>.github.io/${owner?.repo ?? '<repo>'}/index.html?room=${id}); do that first when I ask for my page.
8. Tell me the pull request's address.

The body of the pull request:

${body}

The rules of a room pull request, which a maintainer checks: one room per pull request; one commit, the module and the index line; nothing under src/ or the shipped stages touched (that is not a room pull request and is asked to be split); the index kept sorted by id so two pull requests seldom conflict. The CI run is the review of the mechanics; a maintainer plays the room once before merging.

The module, ${file}:

${FENCE}js
${source}${FENCE}
`;
}

/** What the links carry when the brief itself is too long for one: the person copies the brief first and pastes it. */
export const prShort = (repoUrl) => `Help me open a pull request for a room I made in the level studio of "Alice in AI Land", the BSidesTLV 2026 badge puzzle game (${repoUrl}). The whole brief - the room's module, the index line, the branch, the commands to run and the pull request's body - is on my clipboard; I will paste it as my next message. Read it, then do exactly what it says, and nothing else.`;
