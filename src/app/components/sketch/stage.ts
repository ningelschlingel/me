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

/** Any CSS colour → [r, g, b], via the canvas parser (one shared context, each colour parsed once). */
export function parse(color: string): number[] {
  let rgb = parsed.get(color);
  if (rgb) return [...rgb];
  parser ??= document.createElement('canvas').getContext('2d');
  if (!parser) return [255, 255, 255];
  parser.fillStyle = '#000';
  parser.fillStyle = color;
  const v = parser.fillStyle as string;
  rgb = v.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16))
    : (v.match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number);
  parsed.set(color, rgb);
  return [...rgb];
}
let parser: CanvasRenderingContext2D | null = null;
const parsed = new Map<string, number[]>();

/**
 * Gives a canvas a backing store for `width` × `height` CSS px at `dpr`, and the matching CSS
 * size (its card clips it). While a tile opens or closes its cards change size every frame;
 * a new backing store each time is costly (and clears the drawing), so within one window size
 * it only ever grows. `tall`: the canvas covers its card, so it starts as tall as the window
 * (no card is taller) and never has to grow while a tile opens. A new window size or density
 * sizes it exactly again. Returns true if the backing store changed (and was cleared).
 */
export function fit(canvas: HTMLCanvasElement, width: number, height: number, dpr: number, tall = true): boolean {
  const key = `${window.innerWidth}x${window.innerHeight}@${dpr}`;
  const exact = sizedFor.get(canvas) !== key;
  sizedFor.set(canvas, key);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round((tall ? Math.max(height, window.innerHeight) : height) * dpr));
  const nextW = exact ? w : Math.max(w, canvas.width);
  const nextH = exact ? h : Math.max(h, canvas.height);
  if (nextW === canvas.width && nextH === canvas.height) return false;
  canvas.width = nextW;
  canvas.height = nextH;
  canvas.style.width = `${nextW / dpr}px`;
  canvas.style.height = `${nextH / dpr}px`;
  return true;
}
const sizedFor = new WeakMap<HTMLCanvasElement, string>();
