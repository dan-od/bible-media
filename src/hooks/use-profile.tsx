/**
 * Loads the reader's profile from on-device storage once at startup and makes it
 * available app-wide, persisting every change. `ready` is false until the first
 * load resolves, so routing can wait before deciding onboarding vs. feed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_PROFILE, type Profile } from '@/data/profile';
import { loadProfile, saveProfile } from '@/data/storage';

interface ProfileContextValue {
  profile: Profile;
  ready: boolean;
  update: (patch: Partial<Profile>) => void;
  reset: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadProfile().then((p) => {
      if (!mounted) return;
      setProfile(p);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist whenever the profile changes (after the initial load).
  useEffect(() => {
    if (ready) void saveProfile(profile);
  }, [profile, ready]);

  const update = useCallback((patch: Partial<Profile>) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setProfile(DEFAULT_PROFILE), []);

  const value = useMemo(() => ({ profile, ready, update, reset }), [profile, ready, update, reset]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
