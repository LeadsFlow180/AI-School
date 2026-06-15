import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

type PreferredTutorPayload = {
  id?: string;
  name?: string;
  title?: string | null;
  description?: string | null;
  avatar?: string | null;
  providerId?: string;
  providerVoiceId?: string;
};

async function requireUser(request: NextRequest) {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return {
      adminClient: null,
      user: null,
      error: apiError(
        API_ERROR_CODES.MISSING_API_KEY,
        500,
        'Server missing Supabase admin configuration.',
      ),
    };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!token) {
    return {
      adminClient: null,
      user: null,
      error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Missing bearer token.'),
    };
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return {
      adminClient: null,
      user: null,
      error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.'),
    };
  }

  return { adminClient, user: userData.user, error: null };
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireUser(request);
  if (error || !user) return error!;
  const metadata = (user.user_metadata || {}) as Record<string, unknown>;
  const preferredTutor =
    metadata.preferredTutor && typeof metadata.preferredTutor === 'object'
      ? (metadata.preferredTutor as Record<string, unknown>)
      : null;
  return apiSuccess({ preferredTutor });
}

export async function PUT(request: NextRequest) {
  const { adminClient, user, error } = await requireUser(request);
  if (error || !adminClient || !user) return error!;

  const body = (await request.json().catch(() => ({}))) as { preferredTutor?: PreferredTutorPayload | null };
  const preferredTutor = body.preferredTutor;

  const currentMetadata = (user.user_metadata || {}) as Record<string, unknown>;
  const nextMetadata = { ...currentMetadata };
  if (preferredTutor) {
    nextMetadata.preferredTutor = preferredTutor;
  } else {
    delete nextMetadata.preferredTutor;
  }

  const { error: updateErr } = await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });
  if (updateErr) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save preferred tutor.',
      updateErr.message,
    );
  }

  return apiSuccess({ preferredTutor: preferredTutor || null });
}

