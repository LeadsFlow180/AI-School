import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const adminClient = getSupabaseAdminClient();
    if (!adminClient) {
      return apiError(
        API_ERROR_CODES.MISSING_API_KEY,
        500,
        'Server missing Supabase admin configuration.',
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Missing bearer token.');
    }

    const { data: requesterData, error: requesterErr } = await adminClient.auth.getUser(token);
    if (requesterErr || !requesterData.user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.');
    }

    const requesterId = requesterData.user.id;
    const { data: requesterAdmin, error: requesterAdminErr } = await adminClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', requesterId)
      .maybeSingle();

    if (requesterAdminErr) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to verify admin privileges.',
        requesterAdminErr.message,
      );
    }

    if (!requesterAdmin) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Only admins can create admin users.');
    }

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: email, password',
      );
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created.user) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        400,
        'Failed to create admin auth user.',
        createErr?.message,
      );
    }

    const { error: adminInsertErr } = await adminClient.from('admin_users').insert({
      user_id: created.user.id,
    });

    if (adminInsertErr) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to grant admin role.',
        adminInsertErr.message,
      );
    }

    return apiSuccess({
      userId: created.user.id,
      email: created.user.email,
      message: 'Admin user created successfully.',
    });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create admin user.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
