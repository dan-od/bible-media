/**
 * Where a vertical, one-passage-per-screen feed should come to rest.
 *
 * `pagingEnabled` on native snaps in whole multiples of the screen height, which
 * only works if every page is exactly one screen tall. Passages aren't: at large
 * text sizes (and for longer passages even at the default size on a phone) one
 * runs past the screen — text sizing is sacred, so pages use minHeight, never a
 * fixed height. One tall page would then push every later page off its snap
 * point. Snapping to measured offsets keeps each page's start a hard stop.
 *
 * Inside a tall page the reader needs to stop anywhere, including flush with its
 * bottom where the rail's last actions sit. iOS rests on the next snap point
 * past where the finger lets go, so a lone "bottom" stop a few points down would
 * be skipped by any normal swipe. So the overflowing stretch gets a fine grid of
 * rest points (free scrolling, in effect), and the page's last screen gets none:
 * swiping past its bottom carries on to the next page's start.
 *
 * @param heights measured page heights, in feed order
 * @param viewport the scroll area's height
 * @param step spacing of the rest points inside a tall page
 * @returns rest offsets in ascending order (empty until `viewport` is known)
 */
export function pageSnapOffsets(heights: readonly number[], viewport: number, step = 8): number[] {
  if (viewport <= 0) return [];
  const out: number[] = [];
  let y = 0;
  for (const h of heights) {
    out.push(y);
    // Allow a pixel of slack: layout rounding shouldn't make a page "tall".
    if (h > viewport + 1) {
      const bottom = y + h - viewport;
      for (let s = y + step; s < bottom; s += step) out.push(s);
      out.push(bottom);
    }
    y += h;
  }
  return [...new Set(out.map(Math.round))];
}
