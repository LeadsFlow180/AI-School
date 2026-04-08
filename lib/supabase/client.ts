'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

function isSupabaseAuthKey(key: string) {
  return (
    /^sb-.*-auth-token$/i.test(key) ||
    /^sb-.*-code-verifier$/i.test(key) ||
    key.toLowerCase().includes('supabase')
  );
}

export function clearSupabaseAuthStorage() {
  try {
    const localKeys = Object.keys(localStorage);
    for (const key of localKeys) {
      if (isSupabaseAuthKey(key)) {
        localStorage.removeItem(key);
      }
    }
    const sessionKeys = Object.keys(sessionStorage);
    for (const key of sessionKeys) {
      if (isSupabaseAuthKey(key)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore storage unavailability */
  }
}

export async function getSessionSafe(supabase: SupabaseClient) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('refresh token') || msg.includes('invalid refresh token')) {
        clearSupabaseAuthStorage();
      }
      return null;
    }
    return data.session ?? null;
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('refresh token')) {
      clearSupabaseAuthStorage();
    }
    return null;
  }
}

export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  supabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}
