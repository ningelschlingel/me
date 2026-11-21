/**
 * How far up a model may reach in its card: it may overlap the title, but by no more than
 * a third of a letter's height, so the title always stays readable.
 * Returns a y position in the card's own coordinates (or null if the card has no title).
 */
export function titleCeiling(card: HTMLElement): number | null {
  const title = card.querySelector<HTMLElement>(':scope > .page-title');
  if (!title) return null;
  const letter = parseFloat(getComputedStyle(title).fontSize) * 0.72; // cap height of the type
  return title.offsetTop + title.offsetHeight - letter / 3;
}

/** First non-transparent background up the tree: the card's colour, for depth fading. */
export function background(el: HTMLElement | null): string {
  for (; el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
  }
  return 'rgb(0,0,0)';
}

/** Any CSS colour → [r, g, b], via the canvas parser. */
export function parse(color: string): number[] {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return [255, 255, 255];
  c.fillStyle = color;
  const v = c.fillStyle as string;
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  return (v.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number);
}
