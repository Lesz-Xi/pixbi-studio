# Cozy Cabin — landing redesign study

Open `pixbistudio-standalone.html` (double-click; works offline over `file://`).
Source: `index.html` · `styles.css` · `app.js` · `assets/`. After any source change:

```
python3 build-standalone.py     # rebuilds the standalone
npm install && npm run verify   # headless Chrome: desktop · phone · reduced motion · no-JS; screenshots in verify/shots/
```

`verify` drives Chrome for Testing from puppeteer's cache (`npx @puppeteer/browsers install chrome@stable`), or any Chrome at `$CHROME_PATH`.

## Brief

- **Direction (delegated, kept from the source):** the Pixbistudio pixel language (Pixeloid, paper / peach / ink / orange / night, pressed-pixel buttons), made minimal and spacious.
- **Thesis:** one evening in the cabin. Scroll is the in-game clock, and the page answers to the game's own keys.
- **Signature / scroll instrument:** the header clock. It reads 09:27 AM in the morning, then each room's own time as its still comes into view: Work 06:57 PM, Kitchen 07:11 PM, Living room 07:18 PM. Those times are printed in the stills' own game bars. The night time (11:30 PM) is made up: the bedroom still's bar is cropped out. The header colours follow the time of day: paper, peach, dusk, night.
- **Entry:** the title rises in two lines and the capsule screen switches on in seven pixel steps; the note lands last. About 1.4 s, once.
- **Section handoffs:** colour bands only, plus one pinned horizontal walk through the rooms (desktop).
- **Feedback:** the source's pressed-pixel buttons (2px on hover, 4px on press, 0.12 s), kept as they were. A hard offset shadow means you can press it; static frames have a border only.
- **Keys** (can be switched off in the hero controls card; the choice is remembered): W/S move between the page's sections; A/D (or ←/→ in the walk) step between rooms; E uses what is in front of you. Pressed keys light up in the controls card.
- **Real interactions:** E (or the button) in the work room starts a real 25-minute sprint. The header clock and the tab title count it down; clicking the clock stops it. At night, E turns on a rain sound, synthesized with Web Audio and off by default. It fades out as you leave the bedroom.
- **Sprint ending:**
  - A soft two-note bell (G5 → C6, under a second) plays at 0:00. It's scheduled on the audio clock when the sprint starts, so it rings on time even in a hidden tab whose timers are throttled, and the bell's end also closes the sprint.
  - The tab icon turns into a green pixel tick.
  - A receipt ("25 minutes, done. That was the cabin in a browser tab.") holds the Wishlist button until it is closed.
  - The sprint survives a reload, and a finished receipt is kept for 30 minutes. A sprint resumed after a reload rings only after the visitor next touches the page, because browsers block sound until then.
  - No system notifications, no length picker.
  - `?sprint=<seconds>` shortens the sprint for testing.
- **Wireframe card:** the source card shows four overlapping app windows on a desk; it means "clutter".
  - Option A, chosen: *Close the clutter.* Scroll-scrubbed; the windows close top-down, their taskbar chips go, the counter drops 4 → 0, and the card ends on "Nothing left to juggle." Scroll back and they reopen. At rest the figure is complete.
  - Option B, rejected: interruptions popping in on a 7 s loop. It's an idle loop, and it argues the wrong side.
  - Option C, rejected: dragging windows onto the cabin. It competes with the sprint for the one interactive moment, and there's no equivalent on touch.
  - The windows now show real wireframe contents (timer, task rows, transport, URL bar) on the 4.5px grid, square and unrotated.
- **Rest state / reduced motion / no JS:** everything visible and complete. Under reduced motion there's no smoothing, no pin, and the rooms stack. The rain draws one still frame.
- **Scroll weight:** Lenis 1.1 (delegated: weighted but quick to answer). Off under reduced motion. **Trail line:** off; the clock is the progress instrument.
- **Type:** Pixeloid draws on a 9-unit em, so every size sits on a 4.5px grid (13.5 / 18 / 27 / 36 / 54 / 144).

## Provenance and rights

- The original site was read as evidence only: no captured HTML or origin CSS is shipped.
- Images were fetched from pixbistudio.com on 2026-10-18 for this redesign ("same asset"). The `.webp` files are lossless re-encodes of the original PNGs, and `lantern.png` is a raster of the logo SVG. **These belong to Pixbistudio** and are used here only for this redesign; all rights stay with them.
- Font: Pixeloid Sans by GGBotNet, SIL Open Font License 1.1 (WOFF2 converted from the TTFs).
- Vendor: GSAP 3.13.0 + ScrollTrigger, Lenis 1.3.4 (pinned, from npm via jsDelivr).
- Kept verbatim from the source: copy, the Steam / mail / channel links (including `info@pixibistudio.com`, whose domain differs from pixbistudio.com; it's flagged, not changed), and the Steam / OS / channel marks.
- House-brand note: this keeps the Pixbistudio lantern rather than the XI monogram, because the brief asked for the same assets.
