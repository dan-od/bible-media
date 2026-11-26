import { DEVICES, endRowHeight, feedViewport, passageContentHeight } from '../../../jest/feed-layout-model';
import { getPassages } from '@/data/verseStore';
import { pageSnapOffsets } from '@/lib/snap';
import { SYSTEM_TEXT_SIZES, verseLayout } from '@/lib/verse-fit';

// Above the breakpoint the actions live on the passage's end row, beside
// "Read …". That only works if the row can be brought fully into view: the
// feed snaps (lib/snap), so there must be a rest offset that shows the whole
// row inside the feed area — below the header and clear of the tab bar — for
// the tallest passage in the library, at every size up to AX5.
//
// Heights come from jest/feed-layout-model (real font metrics, FeedCard's
// boxes), since the test renderer does no layout.

const BOTTOM_PADDING = 24; // FeedCard's section padding below the end row

describe.each([390, 375] as const)('on a %spt phone', (width) => {
  const device = DEVICES[width];
  const collapsedSizes = SYSTEM_TEXT_SIZES.filter((s) => verseLayout({ windowWidth: width, fontScale: s.scale }).collapsed);

  it('has sizes above the breakpoint to check', () => {
    expect(collapsedSizes.map((s) => s.name)).toContain('iOS AX5');
  });

  it.each(collapsedSizes.map((s) => [s.name, s.scale] as const))(
    'can rest with the end row fully in view for the tallest passage at %s',
    (_name, fontScale) => {
      const layout = verseLayout({ windowWidth: width, fontScale });
      const viewport = feedViewport(device, fontScale);
      const passages = getPassages();

      // Each passage at its tallest translation; pages are at least one feed area.
      const content = passages.map((p) =>
        Math.max(...Object.values(p.text).map((t) => (t ? passageContentHeight(layout, p, t, fontScale) : 0))),
      );
      const heights = content.map((h) => Math.max(h, viewport));
      const tallest = content.indexOf(Math.max(...content));
      const passage = passages[tallest];

      const pageTop = heights.slice(0, tallest).reduce((a, b) => a + b, 0);
      // A page shorter than the feed area centres its content.
      const contentBottom = pageTop + heights[tallest] - (heights[tallest] - content[tallest]) / 2;
      const rowBottom = contentBottom - BOTTOM_PADDING;
      const rowTop = rowBottom - endRowHeight(layout, passage, fontScale);

      const offsets = pageSnapOffsets(heights, viewport);
      const rest = offsets.find((o) => o <= rowTop && rowBottom <= o + viewport);
      expect({
        passage: passage.reference,
        viewport: Math.round(viewport),
        row: [Math.round(rowTop - pageTop), Math.round(rowBottom - pageTop)],
        restsWithRowInView: rest !== undefined,
      }).toEqual(expect.objectContaining({ restsWithRowInView: true }));
    },
  );
});
