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

/** The prompt a visitor hands to an assistant. It goes to the repository, which is readable; this site is not meant to be. */
export const aiPrompt = (repoUrl) => `Help me build a level for "Alice in AI Land", the BSidesTLV 2026 badge puzzle game - with me, in its level studio, not on your own.

1. Clone ${repoUrl} and read software/docs/LEVEL_MAKER.md: the stage format, the rules the checker applies, how a room gets onto the site, and the bridge you drive the studio through.
2. Run \`npm run maker\` in the clone (Node 20+, no dependencies). It serves the checkout on http://localhost:8080, opens maker.html - the studio - in my browser, and mounts the bridge at http://localhost:8080/__maker/ (loopback only). Open the page yourself if it is not open.
3. Connect to the studio. If you have MCP, the clone's .mcp.json registers the server \`alice-maker\` (node software/tools/maker-mcp.mjs): maker_status, maker_get, maker_set_level, maker_paint, maker_check, maker_play, maker_moves, maker_snapshot, maker_say, maker_read_chat, maker_generate, maker_module, maker_pr_brief and more. Without MCP, the same over HTTP: POST http://localhost:8080/__maker/rpc with {"op": "get" | "set" | "paint" | "check" | "play" | "moves" | "say" | "snapshot" | "generate" | "module" | "pr" | "load" | "tool", "args": {...}}; GET /__maker/inbox?since=0&wait=20000 is what I type in the page's chat. Say hello first (POST /__maker/hello {"name": "..."}) so the page shows you are here.
4. Design the room with me. Ask in the page's chat what I want: how big, how many rocks, a gate and lever or not, timed with a cast walking loops or not, which dressing (garden, hall, court). Then work on the board where I can watch: set or paint the room, Check it (the real solver: par, whether the gate is load-bearing, how hard), play the solution so I see it, take a snapshot to see what I see, and iterate on what I say. Tell me what you are doing in the chat as you go.
5. When we are happy, export the module (maker_module, or op "module"), save it as stages/community/<id>.js, add one line to stages/community/index.json, and run \`npm run stage -- stages/community/<id>.js\` to see what CI will say.
6. Commit on a branch and open a pull request against ${repoUrl} with the stage and the index line. Describe the room in a sentence; the checks prove it solves. The page can hand you the whole brief for that - the module, the index line, the branch and the steps: op "pr", or maker_pr_brief.`;

/** { owner, repo } from a repository URL (https://github.com/<owner>/<repo>), or null when it is not shaped like one. */
export function repoParts(repoUrl) {
  const m = /^https?:\/\/[^/]+\/([^/]+)\/([^/#?]+)/i.exec(repoUrl ?? '');
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

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
7. Open the pull request against ${slug}, base main, title "Community room: ${indexLine.name}", with the body below. With gh installed: \`gh pr create --repo ${slug} --base main --head ${branch} --title "Community room: ${indexLine.name}" --body-file <the body saved to a file>\` (from a fork, \`--head <your GitHub login>:${branch}\`). Without gh, open https://github.com/${slug}/compare/main...<your GitHub login>:${branch}?expand=1 (your login is ${owner ? owner.owner : 'the repository\'s owner'} when the branch is on the repository itself) and paste the body there.
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
