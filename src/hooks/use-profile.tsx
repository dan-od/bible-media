/**
 * The reader's profile, as screens use it. Backed by the shared local store
 * (data/local-store): loaded once at startup, every change persisted. `ready` is
 * false until the first load resolves, so routing can wait before deciding
 * onboarding vs. feed. What's shown is what the signed-in account (or no one) may see.
 */
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { changeContext, loadLocal, updateLocal, useLocal } from '@/data/local-store';
import { applyProfilePatch, profileView, type Profile } from '@/data/profile';

interface ProfileContextValue {
  profile: Profile;
  ready: boolean;
  update: (patch: Partial<Profile>) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const local = useLocal();

  useEffect(() => {
    void loadLocal();
  }, []);

  const viewer = local.account?.userId ?? null;
  const profile = useMemo(() => profileView(local.profile, viewer), [local.profile, viewer]);

  const update = useCallback((patch: Partial<Profile>) => {
    void updateLocal((s) => ({ ...s, profile: applyProfilePatch(s.profile, patch, changeContext()) }));
  }, []);

  const value = useMemo(() => ({ profile, ready: local.ready, update }), [profile, local.ready, update]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
