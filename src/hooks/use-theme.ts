/**
 * Resolves the active palette (light/dark) plus semantic colours for the
 * current system colour scheme. See theme.ts for the token definitions.
 */
import { Colors, Semantic } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, colors: Colors[scheme], semantic: Semantic[scheme] } as const;
}
