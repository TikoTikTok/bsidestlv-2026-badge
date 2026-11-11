// The repository behind the site, worked out from the address. The pages are
// served from <owner>.github.io/<repo>/, so the live site names
// bsidestlv/bsidestlv-2026-badge and a fork's site names the fork; a checkout
// (localhost), or any other host, points at the project's own. Pure, so Node
// can check it (verify-looks.mjs). src/maker.js (the invitation, the PR brief)
// and src/welcome.js (the header's GitHub link, the welcome's doors) read it;
// the one written default everywhere else is UPSTREAM.

export const UPSTREAM = 'https://github.com/bsidestlv/bsidestlv-2026-badge';

/** The repository URL for the page at `loc`: window.location, or anything with a hostname and a pathname. */
export function repoUrlFor(loc = globalThis.location) {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(loc?.hostname ?? '');
  const seg = (loc?.pathname ?? '').split('/').filter(Boolean)[0];
  if (m && seg && !/\.html$/.test(seg)) return `https://github.com/${m[1]}/${seg}`;
  return UPSTREAM;
}
