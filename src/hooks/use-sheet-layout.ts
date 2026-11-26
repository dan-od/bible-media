import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { sheetLayout, type SheetLayout } from '@/lib/sheet-fit';

/** The sheets' measured layout at the current window width and system text size. */
export function useSheetLayout(): SheetLayout {
  const { width, fontScale } = useWindowDimensions();
  return useMemo(() => sheetLayout({ windowWidth: width, fontScale }), [width, fontScale]);
}
