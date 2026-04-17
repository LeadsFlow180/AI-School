import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import type { Scene, Stage } from '@/lib/types/stage';
import type { ChatSession } from '@/lib/types/chat';

type SyncPayload = {
  stage?: Stage;
  scenes?: Scene[];
  chats?: ChatSession[];
};

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

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.');
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
    if (!adminRow) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Admin access required.');
    }

    const body = (await request.json()) as SyncPayload;
    const stage = body.stage;
    const scenes = body.scenes;
    const chats = Array.isArray(body.chats) ? body.chats : [];
    if (!stage?.id || !Array.isArray(scenes)) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage.id, scenes',
      );
    }

    // Keep existing owner when classroom already exists; otherwise assign updater.
    const { data: existingRow } = await adminClient
      .from('classrooms')
      .select('user_id')
      .eq('id', stage.id)
      .maybeSingle();
    const ownerId = existingRow?.user_id || userData.user.id;

    const payload = {
      id: stage.id,
      user_id: ownerId,
      name: stage.name || 'Untitled Stage',
      description: stage.description ?? '',
      stage_data: stage,
      scenes_data: scenes,
      chats_data: chats,
    };

    const { error: upsertErr } = await adminClient.from('classrooms').upsert(payload, { onConflict: 'id' });
    if (upsertErr) {
      return apiError(
        API_ERROR_CODES.INTERNAL_ERROR,
        500,
        'Failed to sync classroom to database.',
        upsertErr.message,
      );
    }

    return apiSuccess({ id: stage.id, synced: true });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to sync classroom to database.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

