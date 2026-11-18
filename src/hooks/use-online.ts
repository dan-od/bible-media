/**
 * Tracks connectivity, so Search can tell the reader when only the downloaded
 * (public-domain) text is available and licensed translations aren't.
 *
 * On web this reads navigator.onLine and the online/offline events. On native
 * there's no network dependency wired yet (per these steps — no backend, no
 * network), so it reports online; real native connectivity via expo-network is
 * a later wiring. Search works fully offline regardless — this only drives the
 * informational banner.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
