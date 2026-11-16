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
