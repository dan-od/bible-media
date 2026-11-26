import type { ExpoConfig } from 'expo/config';

import meta from './src/constants/appMeta.json';

const { appName: APP_NAME, bundleId: BUNDLE_ID, scheme: APP_SCHEME } = meta;

const gf = (pkg: string, file: string) => `./node_modules/@expo-google-fonts/${pkg}/${file}`;

// Six faces. On iOS the config plugin registers each by its PostScript name.
// On Android we declare a single-face family named with that same PostScript
// name, so one `fontFamily` string works on both platforms (see theme.ts).
const CASLON_DISPLAY = gf('libre-caslon-display', '400Regular/LibreCaslonDisplay_400Regular.ttf');
const CASLON_TEXT = gf('libre-caslon-text', '400Regular/LibreCaslonText_400Regular.ttf');
const CASLON_TEXT_ITALIC = gf('libre-caslon-text', '400Regular_Italic/LibreCaslonText_400Regular_Italic.ttf');
const HANKEN_REGULAR = gf('hanken-grotesk', '400Regular/HankenGrotesk_400Regular.ttf');
const HANKEN_MEDIUM = gf('hanken-grotesk', '500Medium/HankenGrotesk_500Medium.ttf');
const HANKEN_SEMIBOLD = gf('hanken-grotesk', '600SemiBold/HankenGrotesk_600SemiBold.ttf');

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'bible-media',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: APP_SCHEME,
  // Respect the OS light/dark setting; verses must honour system text size too.
  userInterfaceStyle: 'automatic',
  ios: {
    // Explicit, not defaulted: iPhone-only, so iPad runs the app in compatibility
    // mode at phone width. The responsive reading column (see the feed) is for the
    // web target, Android tablets and unfolded foldables, where there is no opt-out.
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: '#FAF8F3',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FAF8F3',
        dark: { backgroundColor: '#15130F' },
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      'expo-font',
      {
        ios: {
          fonts: [
            CASLON_DISPLAY,
            CASLON_TEXT,
            CASLON_TEXT_ITALIC,
            HANKEN_REGULAR,
            HANKEN_MEDIUM,
            HANKEN_SEMIBOLD,
          ],
        },
        android: {
          fonts: [
            { fontFamily: 'LibreCaslonDisplay-Regular', fontDefinitions: [{ path: CASLON_DISPLAY, weight: 400 }] },
            { fontFamily: 'LibreCaslonText-Regular', fontDefinitions: [{ path: CASLON_TEXT, weight: 400 }] },
            { fontFamily: 'LibreCaslonText-Italic', fontDefinitions: [{ path: CASLON_TEXT_ITALIC, weight: 400, style: 'italic' }] },
            { fontFamily: 'HankenGrotesk-Regular', fontDefinitions: [{ path: HANKEN_REGULAR, weight: 400 }] },
            { fontFamily: 'HankenGrotesk-Medium', fontDefinitions: [{ path: HANKEN_MEDIUM, weight: 500 }] },
            { fontFamily: 'HankenGrotesk-SemiBold', fontDefinitions: [{ path: HANKEN_SEMIBOLD, weight: 600 }] },
          ],
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
