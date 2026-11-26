import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ActionSheet } from '@/components/feed/ActionSheet';
import { MinTapTarget } from '@/constants/theme';
import { sheetLayout } from '@/lib/sheet-fit';

// The collapsed actions control opens the same seven actions as the rail, each
// with a visible label (at the accessibility sizes a glyph alone is hostile).

const LABELS = ['Star', 'Save', 'Write a note', 'Repost', 'Send to a friend', 'Other versions', 'Context'];

async function renderSheet(overrides: Partial<React.ComponentProps<typeof ActionSheet>> = {}) {
  const props = {
    reference: 'Matthew 6:25–27',
    starred: false,
    saved: false,
    hasNote: false,
    layout: sheetLayout({ windowWidth: 390, fontScale: 3.571 }),
    onAction: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  await render(<ActionSheet {...props} />);
  return props;
}

it('offers the seven rail actions, in rail order, each with visible text', async () => {
  await renderSheet();
  const buttons = screen.getAllByRole('button').filter((b) => LABELS.includes(b.props.accessibilityLabel));
  expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(LABELS);
  for (const label of LABELS) expect(screen.getByText(label)).toBeTruthy();
  for (const b of buttons) expect(StyleSheet.flatten(b.props.style).minHeight).toBeGreaterThanOrEqual(MinTapTarget);
});

it('names the passage it acts on, under a short title held at its 60pt cap', async () => {
  await renderSheet();
  expect(screen.getByText('Matthew 6:25–27')).toBeTruthy();
  // At AX5 the title is held at iOS's largest title (2x of 30pt); every sheet's
  // fit at every size is checked in sheets.test.
  const title = screen.getByText('Actions');
  expect(title.props.maxFontSizeMultiplier).toBe(2);
});

it('closes, then runs the chosen action', async () => {
  const props = await renderSheet();
  fireEvent.press(screen.getByLabelText('Other versions'));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onAction).toHaveBeenCalledWith('versions');
});

it('shows which toggles are on', async () => {
  await renderSheet({ starred: true, hasNote: true });
  expect(screen.getByLabelText('Star').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByLabelText('Save').props.accessibilityState).toEqual({ selected: false });
  expect(screen.getByLabelText('Write a note').props.accessibilityState).toEqual({ selected: true });
});
