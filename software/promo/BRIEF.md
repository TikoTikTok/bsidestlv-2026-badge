---
workflow: general-video
flow: automation
storyboard: no
message: "One badge is the controller, the key and the glitch tool - and anyone can build the next room"
destination: readme
aspect: 1920x1080
language: en
audience: BSidesTLV 2026 attendees and the repository's visitors - hackers, makers, people who will hold the badge
length: 70s
angle: showcase - the site's own captured screens are the assets
---

## Intent

A promo for the BSidesTLV 2026 badge and the challenge it plays, *Alice in AI
Land*, for the repository's README. Fast, bright and a little playful: screen
captures of the real pages with the camera pushing in on what the cursor does
(the "screen-recording auto-zoom" feel), one accent (the conference's lime on
black), a designed open and close. One scene is a "real situation": the phone
on top with the page, the badge below with the buttons lighting as the player
presses them, so the viewer sees what a press does on the screen.

## Assets

- `../../images/Controller-Front.jpeg` - the badge's art face (the Caterpillar on the mushroom), 477x512.
- `../../images/Controller-Back.jpeg` - the badge's component side (RP2040, flash, the button pads), 477x528.
- `footage/*.mp4` - captured on 2026-11-09 from the checkout on localhost by `record.mjs` (Playwright, CDP screencast at a steady 30 fps). Each clip has a `*.json` sidecar with the clicks and presses (time, x, y, button) the overlays follow.
- `assets/badge.svg` - the badge drawn from the PCB (`src/badge-shape.js` through `src/prompt.js`), serialized by the recorder.

## Customizations

- A camera that pushes toward what the cursor does on the screen captures (the clicks from the sidecars), the cursor itself drawn by the page while it was recorded.
- A phone frame for the stages footage in the split scene, the badge art under it with the keys lit per press.
- An RGB-split flicker on the title - the glitch range is a feature.
- No voice-over and no music: the README's GIFs are silent, and the MP4 stays honest with them. A bed can be added later.

## Notes

- Everything shown is a real capture of the pages; nothing is drawn by hand as if it were the site.
- The published site is gated behind the badge, so the captures come from a local checkout (the dev host), where the keyboard and `window.__pad.inject` play.
- Deliverables: `out/promo.mp4` (the full cut), `images/promo.gif` (a short highlight for the README), and one GIF per feature cut from the same render for the README's sections.
