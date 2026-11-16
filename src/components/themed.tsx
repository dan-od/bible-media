/**
 * Minimal themed primitives for building screens against the design tokens.
 *
 * Text deliberately does NOT disable font scaling: verses and all copy must
 * honour the system text size (see the spec's text-sizing rules). No fixed
 * heights here — callers use padding / minHeight / flex so containers grow
 * with their text.
 */
import { Text as RNText, type TextProps, View as RNView, type ViewProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant =
  | 'display' // Libre Caslon Display — verses, screen titles, wordmark
  | 'serif' // Libre Caslon Text — context, quoted text
  | 'serifItalic' // Libre Caslon Text italic — friend notes
  | 'body' // Hanken Grotesk regular — default UI copy
  | 'medium' // Hanken Grotesk medium
  | 'semibold'; // Hanken Grotesk semibold

const FAMILY: Record<Variant, string> = {
  display: Fonts.serifDisplay,
  serif: Fonts.serifText,
  serifItalic: Fonts.serifTextItalic,
  body: Fonts.sans,
  medium: Fonts.sansMedium,
  semibold: Fonts.sansSemiBold,
};

export function ThemedText({
  variant = 'body',
  muted = false,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        { fontFamily: FAMILY[variant], color: muted ? colors.textSecondary : colors.text },
        variant === 'serifItalic' ? { fontStyle: 'italic' } : null,
        style,
      ]}
      {...rest}
    />
  );
}

export function Screen({ style, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return <RNView style={[{ flex: 1, backgroundColor: colors.background }, style]} {...rest} />;
}
