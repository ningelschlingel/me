/** Is there anything between `from` and `until` that can still scroll vertically in `dir` (+1 down, -1 up)? */
export function canScroll(from: Element | null, until: Element, dir: number): boolean {
  for (let el = from; el && el !== until; el = el.parentElement) {
    if (el.scrollHeight - el.clientHeight < 2) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}
