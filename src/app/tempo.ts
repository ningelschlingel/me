/**
 * The app's tempo (--tempo in styles.css): CSS transitions last their base duration times this,
 * and every timer in JS that waits for one of them goes through `ms()`, so both stay in step.
 * Read once, the first time a timer needs it. Without the stylesheet (tests), the original
 * timing: 1.
 */
let tempo: number | undefined;

export function ms(base: number): number {
  if (tempo === undefined) {
    const css =
      typeof document === 'undefined'
        ? ''
        : getComputedStyle(document.documentElement).getPropertyValue('--tempo');
    tempo = parseFloat(css) > 0 ? parseFloat(css) : 1;
  }
  return Math.round(base * tempo);
}
