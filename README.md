# Ningelschlingel

My personal site: https://ningelschlingel.github.io/me/

## Approach

- **A short overview, not a CV.** Four tiles (ME, YOU, INDEX, OURS) and a few pages each, with as little text as needed. All copy lives in [src/app/content.ts](src/app/content.ts).
- **Navigation is the fun part.** The page never scrolls: tiles open and close, and you swipe through each tile's pages. Most pages have a small sketch or animation that is already in place when you get there and plays once you arrive.
- **Robust on laptops and phones.** Tiles are columns on wide screens and rows on phones. Visuals that are off screen do no work, and images come in the size each screen needs.

Built with Angular 21 (signals, standalone components), Tailwind 4 and plain Canvas 2D and WebGL.

## Development

```bash
npm install
ng serve   # http://localhost:4200/
ng test
```

### Animation speed

`--tempo` in [src/styles.css](src/styles.css) sets the speed of every UI transition (tiles, menu, pager, hovers). 1 is the original timing; smaller is faster.

### Project images

Title images go in `public/projects/`. After adding or replacing one, run:

```bash
scripts/optimize-images.sh
```

This exports JPEGs at 800, 1200 and 1600 px wide to `public/projects/sized/` and regenerates `src/app/shots.ts`. Commit both. The script needs macOS, because it uses `sips`.

## Deploy (GitHub Pages)

```bash
npm run deploy
```

This builds and publishes in one go. The two steps it runs:

```bash
ng build --configuration production --base-href=/me/
npx angular-cli-ghpages --dir=dist/ningelschlingel/browser
```

The second step pushes the build output to the `gh-pages` branch over SSH. If the push fails with an access error, run `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` and try again.

## Roadmap

See [ROADMAP.md](ROADMAP.md).
