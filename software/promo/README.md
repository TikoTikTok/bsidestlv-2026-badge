# The promo

The README's video and GIFs are cut from footage of the real pages, recorded
from a local checkout and assembled with [HyperFrames](https://github.com/heygen-com/hyperframes)
(video from HTML: `index.html` here is the whole edit).
Nothing in the video is drawn by hand as if it were the site: every screen is
a capture of the page, driven through the pages' own test hooks.

```
record.mjs        records footage/*.mp4 (+ a .json of the clicks and presses per clip), the
                  stills and assets/badge.svg - Playwright over a CDP screencast at 30 fps
page-driver.js    what record.mjs evaluates in every page: the cursor the screencast can see,
                  the smooth scroll, the room and range players over window.__pad.inject
index.html        the edit: the scenes in order, the captions, the camera - one timeline, no sub-compositions
assets/           the badge art off the PCB (generated), the fonts, the photos the edit borrows
BRIEF.md          what the video is for; STORYBOARD.md the scenes as planned
```

## Remake it

```
python -m http.server 8873 --bind 127.0.0.1        # in the checkout's root (ES modules need http://)
node software/promo/record.mjs                      # ONLY=stages,phone for a subset; BASE= for another port
cd software/promo && npx hyperframes check          # lint + runtime + layout + contrast
npx hyperframes render                              # -> out/promo.mp4
node software/promo/gifs.mjs                        # -> ../../images/*.gif, images/badge-keys.svg
```

`record.mjs` borrows Playwright from a sibling checkout (`PLAYWRIGHT_FROM=` a
`package.json` next to a `node_modules/playwright`); this repository takes no
npm dependency. Chromium runs with `--no-proxy-server` because a proxy may own
port 8080 on the development machine. A backdrop blur is switched off in the
recording's CSS: the software rasterizer paints it at 5 fps at 2x, and the
tint under it looks the same.

The fonts under `assets/fonts/` are Space Grotesk and JetBrains Mono from
Google Fonts, SIL Open Font License, embedded so the render is the same on
every machine.
