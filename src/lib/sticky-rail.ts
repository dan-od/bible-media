/**
 * Where a passage's action rail sits as the feed scrolls — sticky within its own
 * passage. React Native has no `position: sticky`, so the feed drives the rail's
 * offset from the measured scroll position with this formula, the single source
 * of truth on native and web alike.
 *
 *   restTop = (feedAreaHeight - railHeight) / 2
 *   railTop = min( max(restTop, s + stickInset), passageHeight - railHeight - bottomInset )
 *
 * `s` is how far the passage's top has scrolled above the top of the feed area
 * (0 when flush, negative while it is still arriving from below). The result is
 * the rail's offset from the top of the passage:
 *
 *  - Rest: centred in the feed area while the passage is flush at the top (and
 *    as it arrives), so the actions are there the moment the passage is.
 *  - Sticky: as the reader scrolls down through a long passage, the rail rises
 *    with the text until its top is `stickInset` below the feed area's top, then
 *    holds there.
 *  - Release: its bottom is clamped to the passage's bottom (less
 *    `bottomInset`), so it never leaves its own passage and rides out with it.
 *    When the passage is too short to hold the rail below restTop, the clamp
 *    wins.
 */
export interface StickyRailLayout {
  feedAreaHeight: number;
  railHeight: number;
  passageHeight: number;
  stickInset: number;
  bottomInset: number;
}

export function stickyRailTop({ s, ...layout }: StickyRailLayout & { s: number }): number {
  const { restTop, releaseTop } = bounds(layout);
  return Math.min(Math.max(restTop, s + layout.stickInset), releaseTop);
}

/**
 * The same formula as interpolation ranges over `s`, for an Animated
 * interpolation (clamped at both ends) that runs on the native thread. Between
 * its two breakpoints the rail moves one-for-one with the scroll; outside them
 * it rests or is released. Tested to reproduce stickyRailTop exactly.
 */
export function stickyRailRanges(layout: StickyRailLayout): { inputRange: number[]; outputRange: number[] } {
  const { restTop, releaseTop } = bounds(layout);
  if (releaseTop <= restTop) {
    // The clamp wins everywhere: a constant (Animated needs two points).
    return { inputRange: [0, 1], outputRange: [releaseTop, releaseTop] };
  }
  return {
    inputRange: [restTop - layout.stickInset, releaseTop - layout.stickInset],
    outputRange: [restTop, releaseTop],
  };
}

function bounds({ feedAreaHeight, railHeight, passageHeight, bottomInset }: StickyRailLayout) {
  return {
    restTop: (feedAreaHeight - railHeight) / 2,
    releaseTop: passageHeight - railHeight - bottomInset,
  };
}
