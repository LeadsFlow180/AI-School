import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

function extractBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
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

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return apiSuccess({ isAdmin: false });
    }

    const { data: adminRow, error: adminErr } = await adminClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (adminErr) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to verify admin status.',
        adminErr.message,
      );
    }

    return apiSuccess({
      isAdmin: !!adminRow,
      userId: userData.user.id,
      email: userData.user.email,
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to verify admin status.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  return handleAdminStatus(request);
}

export async function POST(request: NextRequest) {
  return handleAdminStatus(request);
}
