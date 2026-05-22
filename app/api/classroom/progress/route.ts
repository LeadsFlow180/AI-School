import { type NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { createLogger } from '@/lib/logger';
import type { ClassroomProgressPayload } from '@/lib/types/classroom-progress';

const log = createLogger('ClassroomProgress');

type ProgressBody = {
  classroomId?: string;
  currentSceneId?: string | null;
  sceneIndex?: number;
  actionIndex?: number;
  consumedDiscussions?: string[];
  playbackCompleted?: boolean;
};

function normalizeRow(
  userId: string,
  body: ProgressBody,
): Omit<ClassroomProgressPayload, 'lastPlayedAt' | 'updatedAt'> | null {
  if (!body.classroomId?.trim()) return null;

  return {
    classroomId: body.classroomId.trim(),
    currentSceneId: body.currentSceneId ?? null,
    sceneIndex: Math.max(0, Number(body.sceneIndex) || 0),
    actionIndex: Math.max(0, Number(body.actionIndex) || 0),
    consumedDiscussions: Array.isArray(body.consumedDiscussions)
      ? body.consumedDiscussions.filter((id): id is string => typeof id === 'string')
      : [],
    playbackCompleted: !!body.playbackCompleted,
  };
}

function mapDbRow(row: Record<string, unknown>): ClassroomProgressPayload {
  return {
    classroomId: String(row.classroom_id),
    currentSceneId: (row.current_scene_id as string | null) ?? null,
    sceneIndex: Number(row.scene_index) || 0,
    actionIndex: Number(row.action_index) || 0,
    consumedDiscussions: Array.isArray(row.consumed_discussions)
      ? (row.consumed_discussions as string[])
      : [],
    playbackCompleted: !!row.playback_completed,
    lastPlayedAt: String(row.last_played_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function resolveUser(request: NextRequest) {
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) {
    return { error: apiError(API_ERROR_CODES.MISSING_API_KEY, 500, 'Server missing Supabase admin configuration.') };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!token) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Missing bearer token.') };
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.') };
  }

  return { adminClient, userId: userData.user.id };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveUser(request);
    if ('error' in resolved) return resolved.error;

    const classroomId = request.nextUrl.searchParams.get('classroomId')?.trim();
    if (!classroomId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing classroomId query parameter.');
    }

    const { data, error } = await resolved.adminClient
      .from('classroom_progress')
      .select('*')
      .eq('user_id', resolved.userId)
      .eq('classroom_id', classroomId)
      .maybeSingle();

    if (error) {
      log.warn('classroom_progress select failed', { message: error.message });
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load progress.', error.message);
    }

    if (!data) {
      return apiSuccess({ progress: null });
    }

    return apiSuccess({ progress: mapDbRow(data as Record<string, unknown>) });
  } catch (error) {
    log.error('classroom progress GET exception', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to load progress.',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveUser(request);
    if ('error' in resolved) return resolved.error;

    const body = (await request.json()) as ProgressBody;
    const normalized = normalizeRow(resolved.userId, body);
    if (!normalized) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing classroomId.');
    }

    const { data: classroomRow, error: classroomErr } = await resolved.adminClient
      .from('classrooms')
      .select('id')
      .eq('id', normalized.classroomId)
      .maybeSingle();

    if (classroomErr || !classroomRow) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found.');
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: resolved.userId,
      classroom_id: normalized.classroomId,
      current_scene_id: normalized.currentSceneId,
      scene_index: normalized.sceneIndex,
      action_index: normalized.actionIndex,
      consumed_discussions: normalized.consumedDiscussions,
      playback_completed: normalized.playbackCompleted,
      last_played_at: now,
      updated_at: now,
    };

    const { error: upsertErr } = await resolved.adminClient
      .from('classroom_progress')
      .upsert(payload, { onConflict: 'user_id,classroom_id' });

    if (upsertErr) {
      log.warn('classroom_progress upsert failed', { message: upsertErr.message });
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to save progress.', upsertErr.message);
    }

    return apiSuccess({
      progress: {
        ...normalized,
        lastPlayedAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    log.error('classroom progress POST exception', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save progress.',
      error instanceof Error ? error.message : String(error),
    );
  }
}
