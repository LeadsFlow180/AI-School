import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
const DEFAULT_ADMIN_FETCH_TIMEOUT_MS = 3500;

function getAdminFetchTimeoutMs() {
  const configured = Number(process.env.SUPABASE_ADMIN_FETCH_TIMEOUT_MS || '');
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ADMIN_FETCH_TIMEOUT_MS;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getAdminFetchTimeoutMs());
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;

  // Prefer server-only SUPABASE_URL when available; fallback to NEXT_PUBLIC_ for compatibility.
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });

  return adminClient;
}
