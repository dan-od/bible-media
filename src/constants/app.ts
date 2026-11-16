/**
 * App-wide identity constants.
 *
 * The product name is still undecided. It lives in ONE place —
 * `appMeta.json` — which both this module (for screens) and app.config.ts (for
 * the native app name) read. Never hardcode a display name in a screen; import
 * APP_NAME from here. JSON is the shared source because Expo loads app.config
 * with plain Node `require`, which cannot resolve a TypeScript import.
 */
import meta from './appMeta.json';

/** Working display name. Change it in appMeta.json when the name is chosen. */
export const APP_NAME = meta.appName;

/** Reverse-DNS id used for the iOS bundle identifier and Android package. */
export const BUNDLE_ID = meta.bundleId;

/** URL scheme for deep links / expo-router. */
export const APP_SCHEME = meta.scheme;
