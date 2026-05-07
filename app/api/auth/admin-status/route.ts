import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

let adminStatusSupabaseUnavailableUntil = 0;
const ADMIN_STATUS_OUTAGE_COOLDOWN_MS = 30_000;

function extractBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function extractTokenFromRequest(request: NextRequest) {
  const bearer = extractBearerToken(request);
  if (bearer) return bearer;
  if (request.method !== 'POST') return '';
  try {
    const body = (await request.json()) as { token?: unknown };
    return typeof body?.token === 'string' ? body.token.trim() : '';
  } catch {
    return '';
  }
}

async function handleAdminStatus(request: NextRequest) {
  try {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return apiError(
        API_ERROR_CODES.MISSING_API_KEY,
        500,
        'Server missing Supabase admin configuration.',
      );
    }

    const token = await extractTokenFromRequest(request);
    if (!token) {
      return apiSuccess({ isAdmin: false });
    }

    if (Date.now() < adminStatusSupabaseUnavailableUntil) {
      return apiSuccess({ isAdmin: false, temporarilyUnavailable: true });
    }

    const userResult = await withTimeout(adminClient.auth.getUser(token), 2500, 'admin auth user lookup').catch(
      () => {
        adminStatusSupabaseUnavailableUntil = Date.now() + ADMIN_STATUS_OUTAGE_COOLDOWN_MS;
        return null;
      },
    );
    if (!userResult || userResult.error || !userResult.data.user) {
      return apiSuccess({ isAdmin: false });
    }
    const user = userResult.data.user;

    const adminResult = await withTimeout(
      adminClient.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
      2500,
      'admin row lookup',
    ).catch(() => {
      adminStatusSupabaseUnavailableUntil = Date.now() + ADMIN_STATUS_OUTAGE_COOLDOWN_MS;
      return null;
    });

    if (!adminResult || adminResult.error) {
      return apiSuccess({ isAdmin: false, userId: user.id, email: user.email });
    }

    return apiSuccess({
      isAdmin: !!adminResult.data,
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    return apiSuccess({
      isAdmin: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function GET(request: NextRequest) {
  return handleAdminStatus(request);
}

export async function POST(request: NextRequest) {
  return handleAdminStatus(request);
}
