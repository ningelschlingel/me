# Roadmap

## 1. Performance

The November 2026 pass covered the safe changes:

- Canvases only resize when they need to, and off-screen visuals catch up after a tile has finished moving.
- CSS variables are scoped to the elements that use them.
- Touch listeners are passive.
- The hero animation is paused while it is off screen.
- One tempo (`--tempo` in [styles.css](src/styles.css)) now sets the speed of every UI transition, and of the JS timers that wait for them ([tempo.ts](src/app/tempo.ts)).
- Project images come in sizes for each screen.

The items below are what is left. They come roughly in order of expected gain. Each one can change how the site looks or feels, so it needs a visual check on a real iPhone, with Safari Web Inspector, before and after.

### Layout and compositing

- **Animate tiles without `flex-grow`.** Opening or closing a tile animates `flex-grow` for 0.7 s, so every tile is laid out again on every frame. Instead, animate `transform` / `clip-path` (FLIP), or set the final sizes once and animate only a transform. This is the biggest remaining cost, and the riskiest change for the look.
- **Containment for off-screen pages.** Use `contain: layout paint` or `content-visibility: auto` on pages that are not in view. Visuals must still be drawn in their first state when the user swipes to them, so check that nothing pops in.
- **Cheaper scroll fade.** Pages that scroll use a gradient `mask-image` ([pager.css](src/app/components/pager/pager.css)), which costs extra compositing on iOS. A gradient overlay in the page colour would look the same and cost less.

### Canvas and WebGL

- **Lower resolution on phones for the flat visuals.** The bike, pico, modules, charts and inks visuals render at the full device pixel ratio (3 on an iPhone 15). Capping it at 2 cuts their pixels by more than half; check how sharp the thin lines still look.
- **The `?!` marks ([marks.ts](src/app/components/marks/marks.ts)).** Their canvas covers the whole tile and is ray-marched at full resolution, and their position is measured from the layout on every frame. Options:
  - render at a lower resolution;
  - draw only the area around the marks once they have landed;
  - cache the measured position and only measure again on resize or while swiping.
- **Less garbage in the 3D sketches.** The line sketches create new vectors and arrays every frame. Reusing scratch objects would avoid garbage-collection pauses, which show up as occasional stutter on phones.

### Startup and assets

- **No portraits rendered on the device.** [portrait.ts](src/app/components/morph/portrait.ts) builds the persona portraits on the visitor's device at startup. The planned face morph (section 2) uses real photos and replaces this. Until then, rendering the portraits once at build time would take that work off the phone.
- **AVIF or WebP images.** These would make the project images another 3–4× smaller. The macOS `sips` encoder makes AVIF files that some browsers show as blank, so use a reliable encoder instead (for example `avifenc` or `sharp`), serve the files through `<picture>` with JPEG as the fallback, and check them in Chrome and Safari.
- **Stop deploying the originals.** The full-size images in `public/projects/` are copied into every build, even though nobody downloads them any more. Move them out of `public/`, for example to `assets-src/`, and point the image script there.
- **Measure regularly.** Add a small script that emulates an iPhone with a throttled CPU and reports dropped frames for opening a tile and swiping, so regressions show up before deploying.

## 2. ME: a real face morph on the first screen

Right now the hero shows one photo, which [portrait.ts](src/app/components/morph/portrait.ts) turns into three filtered versions (blueprint, LED matrix, halftone). [morph.ts](src/app/components/morph/morph.ts) switches between them with a slice twist and a burst. The goal is to replace both with **four real photos of me**, and a face morph in the style of the *Black or White* video: one face turning smoothly into the next.

- **The four photos:**
  - a casual look;
  - a serious business outfit;
  - a very creative, arty style;
  - cycling wear.
- **The shoot decides the effect.** Same framing, head size and eye line, a similar pose, neutral light, and a plain background. A face morph only looks smooth when the faces line up.
- **How the morph works:**
  - Mark matching points on each photo (eyes, brows, nose, mouth, jaw, hairline, shoulders). This can be done by hand, or with a face-landmark model at build time.
  - Split each face into triangles between those points (a Delaunay mesh).
  - For each step, move every triangle from its place in photo A to its place in photo B, and cross-fade the two images while it moves.
- **In the browser:** a small WebGL shader draws the mesh, driven by one progress value from 0 to 1. The landmarks and triangles are prepared at build time and saved as a small JSON file, so the phone only blends.
- **Keep what works now.**
  - The first frame is the casual photo, in place right away.
  - The morph only runs while the hero is on screen.
  - The photos come in the sizes each screen needs.
  - Without WebGL, or with reduced motion, it falls back to a plain cross-fade.
- **This replaces the on-device portrait rendering**, which removes the startup work listed under Performance.

## 3. OURS: a rework

OURS is the oldest part of the site and doesn't match the visual language of the reworked ME and YOU pages. Its two pages (the *Work* train and the *Ride* invitation) predate those changes. Directions to explore:

- **Bring it up to date visually:** layout, type scale and a visual on the level of the ME and YOU pages.
- **Show "Divide & conquer"** (the tile's subtitle) instead of only stating it. For example: a problem is split into architecture, embedded and design parts, which ties back to the three roles in YOU.
- **Clear calls to action.** The contacts already live in the menu, so the pages should invite, not list. Keep the two invitations (work together, go for a ride), but make each one feel like a closing scene.
- **End the tour.** As the last tile, it could lead back to ME or INDEX.
