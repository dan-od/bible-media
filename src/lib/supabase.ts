/**
 * The Supabase client, created the way Expo's guide does it (session in
 * localStorage, refreshed while the app is in the foreground). Only the publishable
 * key ships in the app; RLS and the SECURITY DEFINER functions are the boundary.
 *
 * Without EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY (see .env.example) there is no
 * client and the app stays fully usable signed out.
 */
import './session-storage';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
