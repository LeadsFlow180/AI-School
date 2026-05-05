import { type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import type { Scene, Stage } from '@/lib/types/stage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stage, scenes } = body;

    if (!stage || !scenes) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    const id = stage.id || randomUUID();
    const baseUrl = buildRequestOrigin(request);

    const persisted = await persistClassroom({ id, stage: { ...stage, id }, scenes }, baseUrl);

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const localClassroom = await readClassroom(id);
    if (localClassroom) {
      return apiSuccess({ classroom: localClassroom });
    }

    // Reason: Classroom links should be shareable publicly; use server-side
    // service-role access to read by id even when client-side RLS blocks.
    const supabaseAdmin = getSupabaseAdminClient();
    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('classrooms')
        .select('id, stage_data, scenes_data, created_at')
        .eq('id', id)
        .maybeSingle();

      if (!error && data?.id && data.stage_data && Array.isArray(data.scenes_data)) {
        const classroom = {
          id: data.id,
          stage: data.stage_data as Stage,
          scenes: data.scenes_data as Scene[],
          createdAt: data.created_at || new Date().toISOString(),
        };
        return apiSuccess({ classroom });
      }
    }

    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }
    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Supabase admin is not configured.');
    }

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!token) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Missing bearer token.');
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 401, 'Invalid auth token.');
    }
    const userId = userData.user.id;

    const { data: classroomRow, error: classroomErr } = await supabaseAdmin
      .from('classrooms')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (classroomErr) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to read classroom before delete.');
    }
    if (!classroomRow?.id) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found.');
    }

    if (classroomRow.user_id && classroomRow.user_id !== userId) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 403, 'Not allowed to delete this classroom.');
    }

    const mediaBucket = process.env.SUPABASE_CLASSROOM_MEDIA_BUCKET || 'classroom-media';
    const safeUser = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeClassroom = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const audioPrefix = `${safeUser}/${safeClassroom}/audio`;
    const imagePrefix = `${safeUser}/${safeClassroom}/image`;

    const removePrefixFiles = async (prefix: string) => {
      const { data: objects, error: listErr } = await supabaseAdmin.storage
        .from(mediaBucket)
        .list(prefix, { limit: 1000 });
      if (listErr || !objects || objects.length === 0) return;
      const filePaths = objects
        .filter((obj) => !!obj.name && !obj.name.endsWith('/'))
        .map((obj) => `${prefix}/${obj.name}`);
      if (filePaths.length > 0) {
        await supabaseAdmin.storage.from(mediaBucket).remove(filePaths);
      }
    };

    await Promise.all([removePrefixFiles(audioPrefix), removePrefixFiles(imagePrefix)]);

    const { error: deleteErr } = await supabaseAdmin.from('classrooms').delete().eq('id', id);
    if (deleteErr) {
      return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete classroom row.');
    }

    return apiSuccess({ deleted: true, id });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
